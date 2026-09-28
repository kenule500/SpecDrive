const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = process.cwd();

function runCommand(command) {
  try {
    execSync(command, { stdio: "pipe" });
    return true;
  } catch (error) {
    return false;
  }
}

function resetEnvironment() {
  console.log("🧹 Resetting test environment...");

  const specDir = path.join(projectRoot, ".sdrive", "specs", "backlog", "test-feature");
  const govDir = path.join(projectRoot, ".sdrive", "governance", "test-feature");

  if (fs.existsSync(specDir)) {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
  if (fs.existsSync(govDir)) {
    fs.rmSync(govDir, { recursive: true, force: true });
  }

  const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");
  fs.writeFileSync(workflowStatePath, JSON.stringify({ features: [] }, null, 2));
}

function testFeatureCreation() {
  console.log("\n🧪 Test 1: Feature creation");

  const createTestPath = path.join(__dirname, "test-create.js");
  const passed = runCommand(`node "${createTestPath}"`);

  if (passed) {
    console.log("✅ PASS: Feature created.");
    return true;
  }

  console.log("❌ FAIL: Feature creation failed.");
  return false;
}

function testSpecGeneration() {
  console.log("\n🧪 Test 2: Spec generation");

  const specPath = path.join(projectRoot, ".sdrive", "specs", "backlog", "test-feature", "spec.md");
  const govPath = path.join(projectRoot, ".sdrive", "governance", "test-feature", "spec.json");

  const specExists = fs.existsSync(specPath);
  const govExists = fs.existsSync(govPath);

  if (specExists && govExists) {
    console.log("✅ PASS: Spec and governance files exist.");
    return true;
  }

  console.log("❌ FAIL: Spec or governance files missing.");
  return false;
}

function testTraceabilityGenerated() {
  console.log("\n🧪 Test 3: Traceability matrix generated");

  const tracePath = path.join(projectRoot, ".sdrive", "governance", "test-feature", "traceability.json");

  if (fs.existsSync(tracePath)) {
    console.log("✅ PASS: Traceability matrix exists.");
    return true;
  }

  console.log("❌ FAIL: Traceability matrix missing.");
  return false;
}

function testIncompleteScaffoldFailsValidation() {
  console.log("\n🧪 Test 4: Incomplete scaffold is rejected by governance validation");

  const passed = runCommand("node .sdrive/scripts/validate-governance.js");

  if (!passed) {
    console.log("✅ PASS: Validator rejected the incomplete scaffold as expected.");
    return true;
  }

  console.log("❌ FAIL: Validator accepted an incomplete scaffold.");
  return false;
}

function testWorkflowState() {
  console.log("\n🧪 Test 5: Workflow state updated");

  const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");

  if (!fs.existsSync(workflowStatePath)) {
    console.log("❌ FAIL: workflow-state.json missing.");
    return false;
  }

  const state = JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));

  if (state.features && Array.isArray(state.features)) {
    console.log("✅ PASS: Workflow state has features array.");
    return true;
  }

  console.log("❌ FAIL: Workflow state invalid.");
  return false;
}

function main() {
  console.log("=== SpecDrive End-to-End Tests ===\n");

  resetEnvironment();

  let allPassed = true;

  allPassed &= testFeatureCreation();
  allPassed &= testSpecGeneration();
  allPassed &= testTraceabilityGenerated();
  allPassed &= testIncompleteScaffoldFailsValidation();
  allPassed &= testWorkflowState();

  resetEnvironment();

  if (allPassed) {
    console.log("\n✅ All end-to-end tests passed.");
    process.exit(0);
  } else {
    console.log("\n❌ Some end-to-end tests failed.");
    process.exit(1);
  }
}

main();