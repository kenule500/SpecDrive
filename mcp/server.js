#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

function loadWorkflowState() {
  const statePath = path.join(projectRoot, ".sdrive", "workflow-state.json");

  if (!fs.existsSync(statePath)) {
    return { features: [] };
  }

  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function listFeatures() {
  const state = loadWorkflowState();
  return state.features || [];
}

function getFeature(name) {
  const features = listFeatures();
  return features.find((f) => f.name === name);
}

function getSpec(name) {
  const specPath = path.join(projectRoot, ".sdrive", "governance", name, "spec.json");

  if (!fs.existsSync(specPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(specPath, "utf8"));
}

function getTraceability(name) {
  const tracePath = path.join(projectRoot, ".sdrive", "governance", name, "traceability.json");

  if (!fs.existsSync(tracePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(tracePath, "utf8"));
}

function runValidator() {
  const { execSync } = require("child_process");
  const validatorPath = path.join(projectRoot, ".sdrive", "scripts", "validate-governance.js");

  try {
    execSync(`node "${validatorPath}"`, { stdio: "pipe" });
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// ---------- MCP handlers ----------

const handlers = {
  "specdrive.list_features": () => {
    return { features: listFeatures() };
  },
  "specdrive.get_feature": ({ name }) => {
    return { feature: getFeature(name) };
  },
  "specdrive.get_spec": ({ name }) => {
    return { spec: getSpec(name) };
  },
  "specdrive.get_traceability": ({ name }) => {
    return { traceability: getTraceability(name) };
  },
  "specdrive.validate": () => {
    return runValidator();
  },
  "specdrive.status": () => {
    const features = listFeatures();
    return {
      count: features.length,
      features: features.map((f) => ({
        name: f.name,
        phase: f.phase,
        currentStep: f.currentStep
      }))
    };
  }
};

// ---------- CLI entry point ----------

const input = process.argv[2] ? JSON.parse(process.argv[2]) : null;

if (!input) {
  console.error("❌ Usage: node server.js '{\"method\": \"specdrive.list_features\"}'");
  process.exit(1);
}

const handler = handlers[input.method];

if (!handler) {
  console.error(`❌ Unknown MCP method: ${input.method}`);
  process.exit(1);
}

const result = handler(input.params || {});
console.log(JSON.stringify(result, null, 2));