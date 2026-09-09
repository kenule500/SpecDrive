const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

function getWorkflowState() {
  const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");

  if (!fs.existsSync(workflowStatePath)) {
    console.error("❌ workflow-state.json not found. Run `sdrive init` first.");
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));
}

function saveWorkflowState(state) {
  const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");
  fs.writeFileSync(workflowStatePath, JSON.stringify(state, null, 2));
}

function getFeature(featureName) {
  const state = getWorkflowState();
  return state.features?.find((f) => f.name === featureName);
}

function gateStatus(featureName, gate) {
  const feature = getFeature(featureName);

  if (!feature) {
    return "unknown";
  }

  return feature.gates?.[gate] || "pending";
}

function approveGate(featureName, gate) {
  const state = getWorkflowState();
  const feature = getFeature(featureName);

  if (!feature) {
    console.error(`❌ Feature "${featureName}" not found.`);
    return false;
  }

  if (!feature.gates) {
    feature.gates = {};
  }

  feature.gates[gate] = "approved";

  feature.history = feature.history || [];
  feature.history.push({
    event: `${gate}_approved`,
    timestamp: new Date().toISOString()
  });

  saveWorkflowState(state);
  console.log(`✅ Gate "${gate}" approved for feature "${featureName}".`);
  return true;
}

function isGateApproved(featureName, gate) {
  return gateStatus(featureName, gate) === "approved";
}

module.exports = {
  getWorkflowState,
  saveWorkflowState,
  getFeature,
  gateStatus,
  approveGate,
  isGateApproved
};