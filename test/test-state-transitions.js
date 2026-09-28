const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = process.cwd();
const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");

function resetState() {
  const initialState = {
    features: [
      {
        name: "test-feature",
        currentVersion: "v1",
        versions: [
          {
            id: "v1",
            phase: "backlog",
            currentStep: "specification",
            gates: {
              specification: "pending",
              planning: "pending",
              implementation: "pending",
              review: "pending"
            },
            history: [
              {
                event: "feature_created",
                timestamp: new Date().toISOString()
              }
            ]
          }
        ]
      }
    ]
  };

  fs.writeFileSync(workflowStatePath, JSON.stringify(initialState, null, 2));
}

function readState() {
  return JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));
}

function approveGate(gate) {
  try {
    execSync(`node ${path.join(projectRoot, ".sdrive", "src", "index.js")} approve ${gate}`, {
      stdio: "pipe"
    });
    return true;
  } catch (error) {
    return false;
  }
}

function testInitialState() {
  console.log("\n🧪 Test 1: Initial state should be pending");
  resetState();
  const state = readState();
  const feature = state.features[0];
  const version = feature.versions[0];

  if (
    version.gates.specification === "pending" &&
    version.gates.planning === "pending" &&
    version.gates.implementation === "pending" &&
    version.gates.review === "pending"
  ) {
    console.log("✅ PASS: All gates are pending initially.");
    return true;
  }

  console.log("❌ FAIL: Initial gates are not pending.");
  return false;
}

function testGateApproval() {
  console.log("\n🧪 Test 2: Gate approval should update state");
  resetState();

  const passed = approveGate("specification");

  if (!passed) {
    console.log("❌ FAIL: Could not approve gate.");
    return false;
  }

  const state = readState();
  const version = state.features[0].versions[0];

  if (version.gates.specification === "approved") {
    console.log("✅ PASS: specification gate approved.");
    return true;
  }

  console.log("❌ FAIL: specification gate not approved.");
  return false;
}

function testInvalidGate() {
  console.log("\n🧪 Test 3: Invalid gate should be rejected");
  resetState();

  try {
    execSync(`node ${path.join(projectRoot, ".sdrive", "src", "index.js")} approve invalid-gate`, {
      stdio: "pipe"
    });
    console.log("❌ FAIL: Invalid gate was accepted.");
    return false;
  } catch (error) {
    console.log("✅ PASS: Invalid gate was rejected.");
    return true;
  }
}

function testHistory() {
  console.log("\n🧪 Test 4: History should record approvals");
  resetState();

  approveGate("specification");

  const state = readState();
  const version = state.features[0].versions[0];

  if (version.history.some((event) => event.event === "specification_approved")) {
    console.log("✅ PASS: History recorded approval.");
    return true;
  }

  console.log("❌ FAIL: History did not record approval.");
  return false;
}

function main() {
  console.log("=== SpecDrive State Transition Tests ===\n");

  let allPassed = true;

  allPassed &= testInitialState();
  allPassed &= testGateApproval();
  allPassed &= testInvalidGate();
  allPassed &= testHistory();

  resetState();

  if (allPassed) {
    console.log("\n✅ All state transition tests passed.");
    process.exit(0);
  } else {
    console.log("\n❌ Some state transition tests failed.");
    process.exit(1);
  }
}

main();