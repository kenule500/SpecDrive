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

// Gates live on the feature's CURRENT VERSION (`versions[].gates`), never on the
// feature itself. Older builds read `feature.gates`, which does not exist, so
// every gate looked unapproved and `sdrive approve` silently did nothing.
function resolveVersion(feature) {
  if (!feature || !Array.isArray(feature.versions) || feature.versions.length === 0) {
    return null;
  }

  return (
    feature.versions.find((v) => v.id === feature.currentVersion) || feature.versions[0]
  );
}

function findFeature(state, featureName) {
  return (state.features || []).find((f) => f.name === featureName) || null;
}

function getFeature(featureName) {
  return findFeature(getWorkflowState(), featureName);
}

function gateStatus(featureName, gate) {
  const feature = getFeature(featureName);

  if (!feature) {
    return "unknown";
  }

  const version = resolveVersion(feature);

  if (!version) {
    return "unknown";
  }

  return (version.gates && version.gates[gate]) || "pending";
}

function approveGate(featureName, gate) {
  // Read ONCE and mutate that same object. The old implementation called
  // getFeature() — which re-reads the file — so the mutation was applied to a
  // throwaway object and discarded when `state` was saved.
  const state = getWorkflowState();
  const feature = findFeature(state, featureName);

  if (!feature) {
    console.error(`❌ Feature "${featureName}" not found.`);
    return false;
  }

  const version = resolveVersion(feature);

  if (!version) {
    console.error(`❌ Feature "${featureName}" has no versions.`);
    return false;
  }

  version.gates = version.gates || {};
  version.gates[gate] = "approved";

  version.history = version.history || [];
  version.history.push({
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
  resolveVersion,
  getFeature,
  gateStatus,
  approveGate,
  isGateApproved
};