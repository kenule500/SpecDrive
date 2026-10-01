#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SERVER_NAME = "specdrive";
const PROTOCOL_VERSION = "2024-11-05";

function getServerVersion() {
  try {
    return require("../package.json").version;
  } catch (error) {
    const metadataPath = path.join(__dirname, "mcp.json");
    if (fs.existsSync(metadataPath)) {
      return JSON.parse(fs.readFileSync(metadataPath, "utf8")).version || "0.1.10";
    }
    return "0.1.10";
  }
}

const SERVER_VERSION = getServerVersion();

function logDebug(message) {
  if (process.env.SPECDRIVE_DEBUG === "1") {
    fs.appendFileSync(path.join(process.cwd(), ".sdrive", "mcp-debug.log"), `${new Date().toISOString()} ${message}\n`);
  }
}

function loadWorkflowState() {
  const statePath = path.join(process.cwd(), ".sdrive", "workflow-state.json");
  if (!fs.existsSync(statePath)) return { features: [] };

  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (error) {
    logDebug(`loadWorkflowState parse error: ${error.message}`);
    return { features: [] };
  }
}

function listFeatures() {
  const state = loadWorkflowState();
  return state.features || [];
}

function getFeature(name) {
  return listFeatures().find((feature) => feature.name === name) || null;
}

function resolveVersion(featureName, requestedVersion) {
  const feature = getFeature(featureName);
  if (!feature || !Array.isArray(feature.versions)) return null;

  if (!requestedVersion) return feature.currentVersion || feature.versions[feature.versions.length - 1]?.id || null;

  const match = feature.versions.find((version) => version.id === requestedVersion || version.name === requestedVersion);
  return match ? match.id : null;
}

function governancePath(featureName, versionId, fileName) {
  const base = path.join(process.cwd(), ".sdrive", "governance", featureName);
  const versioned = path.join(base, versionId, fileName);
  if (fs.existsSync(versioned)) return versioned;

  const legacy = path.join(base, fileName);
  if (fs.existsSync(legacy)) return legacy;

  return null;
}

function readGovernanceJson(featureName, versionId, fileName) {
  const targetPath = governancePath(featureName, versionId, fileName);
  if (!targetPath || !fs.existsSync(targetPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (error) {
    logDebug(`readGovernanceJson parse error for ${featureName}/${fileName}: ${error.message}`);
    return null;
  }
}

function getSpec(featureName, versionId) {
  const resolvedVersion = resolveVersion(featureName, versionId) || versionId;
  return readGovernanceJson(featureName, resolvedVersion, "spec.json") || readGovernanceJson(featureName, versionId, "spec.json");
}

function getTraceability(featureName, versionId) {
  const resolvedVersion = resolveVersion(featureName, versionId) || versionId;
  return readGovernanceJson(featureName, resolvedVersion, "traceability.json") || readGovernanceJson(featureName, versionId, "traceability.json");
}

function runValidator() {
  const validatorPath = path.join(process.cwd(), ".sdrive", "scripts", "validate-governance.js");
  if (!fs.existsSync(validatorPath)) {
    return { success: false, message: "Validator not found" };
  }

  try {
    execSync(`node "${validatorPath}"`, { stdio: "pipe" });
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

const TOOLS = [
  {
    name: "specdrive.list_features",
    description: "List all SpecDrive features",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "specdrive.get_feature",
    description: "Get a feature by name",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" }
      },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "specdrive.get_spec",
    description: "Get a feature spec by name and optional version",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        version: { type: "string" }
      },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "specdrive.get_traceability",
    description: "Get traceability for a feature and optional version",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        version: { type: "string" }
      },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "specdrive.validate",
    description: "Run the governance validator",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "specdrive.status",
    description: "Get the feature status summary",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

function sendResult(id, result) {
  const payload = {
    jsonrpc: "2.0",
    id,
    result
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendError(id, code, message, data) {
  const payload = {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {})
    }
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function handleRequest(message) {
  const { id, method, params = {} } = message;

  if (method === "initialize") {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION
      }
    };
  }

  if (method === "notifications/initialized") {
    return null;
  }

  if (method === "ping") {
    return { ok: true };
  }

  if (method === "tools/list") {
    return { tools: TOOLS };
  }

  if (method === "tools/call") {
    const { name, arguments: args = {} } = params;
    const toolMap = {
      "specdrive.list_features": () => ({ features: listFeatures() }),
      "specdrive.get_feature": () => ({ feature: getFeature(args.name) }),
      "specdrive.get_spec": () => ({ spec: getSpec(args.name, args.version) }),
      "specdrive.get_traceability": () => ({ traceability: getTraceability(args.name, args.version) }),
      "specdrive.validate": () => runValidator(),
      "specdrive.status": () => ({
        count: listFeatures().length,
        features: listFeatures().map((feature) => ({
          name: feature.name,
          phase: feature.phase,
          currentVersion: feature.currentVersion || null
        }))
      })
    };

    const handler = toolMap[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(handler(), null, 2)
        }
      ]
    };
  }

  throw new Error(`Unknown method: ${method}`);
}

let buffer = "";

process.stdin.on("data", (chunk) => {
  buffer += chunk.toString();

  let newlineIndex;
  while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);

    if (!line) continue;

    try {
      const message = JSON.parse(line);
      if (message.method === "notifications/initialized") {
        continue;
      }

      const result = handleRequest(message);
      if (result !== null) {
        sendResult(message.id, result);
      }
    } catch (error) {
      const id = JSON.parse(line).id ?? null;
      sendError(id, -32603, error.message || "Internal error", {
        stack: error.stack
      });
    }
  }
});

process.stdin.on("end", () => {
  if (buffer.trim()) {
    try {
      const message = JSON.parse(buffer.trim());
      const result = handleRequest(message);
      if (result !== null) {
        sendResult(message.id, result);
      }
    } catch (error) {
      sendError(null, -32603, error.message || "Internal error");
    }
  }
});