// MCP client wiring.
//
// SpecDrive ships one local MCP server (the project governance server) and three
// hosted knowledge servers. Every AI client uses a different config schema, so
// the server entries are generated per client instead of copied from one JSON
// blob. A missing entry is added; an entry the user already has is never
// overwritten, which is what lets a project add its own MCP servers without
// SpecDrive clobbering them on the next `init` or `mcp:sync`.
const fs = require("fs");
const os = require("os");
const path = require("path");

const SPECDRIVE_SERVER_NAME = "specdrive";

const DEFAULT_KNOWLEDGE_SERVERS = Object.freeze([
  {
    name: "ux-ui-library",
    label: "UX/UI Library",
    url: "https://ux-ui-library.vercel.app/api/mcp",
    purpose: "UX/UI patterns, accessibility, design systems, and review checklists."
  },
  {
    name: "stackwise",
    label: "Stackwise",
    url: "https://stackwisehq.vercel.app/api/mcp",
    purpose: "Backend, data, security, distributed systems, and AI engineering guidance."
  },
  {
    name: "context7",
    label: "Context7",
    url: "https://mcp.context7.com/mcp",
    purpose: "Current library and framework documentation."
  }
]);

// Each client is identified by both a display name (used by the installer) and
// a stable id (used by commands and the tool registry). The `entry` functions
// are deliberately small: a client's schema is the only thing that should vary.
const MCP_CLIENTS = {
  "Claude Desktop": {
    id: "claude-desktop",
    key: "mcpServers",
    specdriveEntry: (serverPath) => ({ command: "node", args: [serverPath] }),
    remoteEntry: (url) => ({
      command: "npx",
      args: ["-y", "mcp-remote", url, "--transport", "http-only"]
    })
  },
  Cursor: {
    id: "cursor",
    key: "mcpServers",
    specdriveEntry: (serverPath) => ({ command: "node", args: [serverPath] }),
    remoteEntry: (url) => ({ url })
  },
  Cline: {
    id: "cline",
    key: "mcpServers",
    specdriveEntry: (serverPath) => ({ command: "node", args: [serverPath] }),
    remoteEntry: (url) => ({ type: "streamableHttp", url })
  },
  "Roo Code": {
    id: "roo",
    key: "mcpServers",
    specdriveEntry: (serverPath) => ({ command: "node", args: [serverPath] }),
    remoteEntry: (url) => ({ type: "streamable-http", url })
  },
  "Gemini CLI": {
    id: "gemini-cli",
    key: "mcpServers",
    specdriveEntry: (serverPath) => ({ command: "node", args: [serverPath] }),
    remoteEntry: (url) => ({ httpUrl: url })
  },
  "GitHub Copilot (VS Code)": {
    id: "vscode",
    key: "servers",
    specdriveEntry: (serverPath) => ({ type: "stdio", command: "node", args: [serverPath] }),
    remoteEntry: (url) => ({ type: "http", url })
  }
};

function clientConfig(clientName) {
  return MCP_CLIENTS[clientName] || null;
}

function clientNameForId(id) {
  if (!id) return null;
  return Object.keys(MCP_CLIENTS).find((name) => MCP_CLIENTS[name].id === id) || null;
}

function resolveClientName(value) {
  if (!value) return null;

  const wanted = String(value).trim().toLowerCase();
  const byId = clientNameForId(wanted);
  if (byId) return byId;

  return (
    Object.keys(MCP_CLIENTS).find((name) => name.toLowerCase() === wanted) || null
  );
}

function defaultEntries(clientName, serverPath, options = {}) {
  const client = clientConfig(clientName);
  if (!client) throw new Error(`Unknown MCP client: ${clientName}`);

  const includeKnowledge = options.includeKnowledge !== false;
  const entries = {
    [SPECDRIVE_SERVER_NAME]: client.specdriveEntry(serverPath)
  };

  if (includeKnowledge) {
    DEFAULT_KNOWLEDGE_SERVERS.forEach((server) => {
      entries[server.name] = client.remoteEntry(server.url);
    });
  }

  return entries;
}

function mcpConfigContent(clientName, serverPath, options = {}) {
  const client = clientConfig(clientName);
  if (!client) throw new Error(`Unknown MCP client: ${clientName}`);

  return `${JSON.stringify(
    { [client.key]: defaultEntries(clientName, serverPath, options) },
    null,
    2
  )}\n`;
}

// Pure merge so tests can exercise the preservation rule without touching a
// user's real config. Existing entries are kept even when they differ from the
// generated default, including entries that are disabled or point elsewhere.
function mergeMcpConfig(existing, clientName, serverPath, options = {}) {
  const client = clientConfig(clientName);
  if (!client) throw new Error(`Unknown MCP client: ${clientName}`);

  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    throw new Error("MCP config must be a JSON object");
  }

  const rawCurrent = existing[client.key];

  if (
    rawCurrent !== undefined &&
    (rawCurrent === null || typeof rawCurrent !== "object" || Array.isArray(rawCurrent))
  ) {
    throw new Error(`MCP config key "${client.key}" must be a JSON object`);
  }

  const current = rawCurrent || {};

  const entries = defaultEntries(clientName, serverPath, options);
  const nextEntries = { ...current };
  const added = [];
  const kept = [];

  Object.keys(entries).forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(current, name)) {
      kept.push(name);
    } else {
      nextEntries[name] = entries[name];
      added.push(name);
    }
  });

  return {
    config: { ...existing, [client.key]: nextEntries },
    added,
    kept,
    changed: added.length > 0
  };
}

function readMcpConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return { exists: false, config: null, error: null };
  }

  try {
    return {
      exists: true,
      config: JSON.parse(fs.readFileSync(configPath, "utf8")),
      error: null
    };
  } catch (error) {
    return { exists: true, config: null, error: error.message };
  }
}

function safeMergeMcpConfig(configPath, clientName, serverPath, options = {}) {
  const client = clientConfig(clientName);
  if (!client) {
    return {
      status: "error",
      client: clientName,
      path: configPath,
      added: [],
      kept: [],
      error: `Unknown MCP client: ${clientName}`
    };
  }

  const dryRun = options.dryRun === true;
  const existing = readMcpConfig(configPath);

  if (existing.error) {
    return {
      status: "error",
      client: clientName,
      path: configPath,
      added: [],
      kept: [],
      error: `Could not parse ${configPath}: ${existing.error}`
    };
  }

  if (!existing.exists) {
    const entries = defaultEntries(clientName, serverPath, options);

    if (!dryRun) {
      try {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, mcpConfigContent(clientName, serverPath, options));
      } catch (error) {
        return {
          status: "error",
          client: clientName,
          path: configPath,
          added: Object.keys(entries),
          kept: [],
          error: `Could not create ${configPath}: ${error.message}`
        };
      }
    }

    return {
      status: dryRun ? "would-create" : "created",
      client: clientName,
      path: configPath,
      added: Object.keys(entries),
      kept: []
    };
  }

  let merged;

  try {
    merged = mergeMcpConfig(existing.config, clientName, serverPath, options);
  } catch (error) {
    return {
      status: "error",
      client: clientName,
      path: configPath,
      added: [],
      kept: [],
      error: `Could not merge ${configPath}: ${error.message}`
    };
  }

  if (!merged.changed) {
    return {
      status: "unchanged",
      client: clientName,
      path: configPath,
      added: [],
      kept: merged.kept
    };
  }

  if (!dryRun) {
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, `${JSON.stringify(merged.config, null, 2)}\n`);
    } catch (error) {
      return {
        status: "error",
        client: clientName,
        path: configPath,
        added: merged.added,
        kept: merged.kept,
        error: `Could not write ${configPath}: ${error.message}`
      };
    }
  }

  return {
    status: dryRun ? "would-merge" : "merged",
    client: clientName,
    path: configPath,
    added: merged.added,
    kept: merged.kept
  };
}

function getMcpConfigPaths(options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const platform = options.platform || os.platform();
  const home = options.home || os.homedir();
  const appData = options.appData !== undefined ? options.appData : process.env.APPDATA;
  const paths = [];

  if (platform === "darwin") {
    paths.push({
      id: "claude-desktop",
      name: "Claude Desktop",
      path: path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    });
  }

  if (platform === "win32" && appData) {
    paths.push({
      id: "claude-desktop",
      name: "Claude Desktop",
      path: path.join(appData, "Claude", "claude_desktop_config.json")
    });
  }

  paths.push(
    { id: "cursor", name: "Cursor", path: path.join(projectRoot, ".cursor", "mcp.json") },
    { id: "cline", name: "Cline", path: path.join(projectRoot, ".cline", "mcp.json") },
    { id: "vscode", name: "GitHub Copilot (VS Code)", path: path.join(projectRoot, ".vscode", "mcp.json") },
    { id: "roo", name: "Roo Code", path: path.join(projectRoot, ".roo", "mcp.json") },
    { id: "gemini-cli", name: "Gemini CLI", path: path.join(projectRoot, ".gemini", "settings.json") }
  );

  return paths;
}

module.exports = {
  SPECDRIVE_SERVER_NAME,
  DEFAULT_KNOWLEDGE_SERVERS,
  MCP_CLIENTS,
  clientConfig,
  clientNameForId,
  resolveClientName,
  defaultEntries,
  mcpConfigContent,
  mergeMcpConfig,
  readMcpConfig,
  safeMergeMcpConfig,
  getMcpConfigPaths
};
