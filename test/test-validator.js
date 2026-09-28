const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = process.cwd();
const govDir = path.join(projectRoot, ".sdrive", "governance", "test-feature");
const validatorPath = path.join(projectRoot, ".sdrive", "scripts", "validate-governance.js");

function createValidFiles() {
  fs.mkdirSync(govDir, { recursive: true });

  fs.writeFileSync(
    path.join(govDir, "spec.json"),
    JSON.stringify(
      {
        feature: "test-feature",
        title: "Test Feature",
        version: 1,
        overview: {
          problemStatement: "Test problem statement",
          proposedSolution: "Test proposed solution",
          targetAudience: "Test users"
        },
        userStories: [
          {
            id: "US-001",
            title: "Test story",
            role: "user",
            want: "test",
            benefit: "test",
            acceptanceCriteria: [
              {
                id: "AC-001",
                text: "Given test, when test, then test"
              }
            ]
          }
        ],
        functionalRequirements: [
          {
            id: "FR-001",
            text: "The system MUST test"
          }
        ]
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(govDir, "traceability.json"),
    JSON.stringify(
      {
        feature: "test-feature",
        version: 1,
        rows: [
          {
            requirementId: "FR-001",
            acceptanceCriteriaIds: ["AC-001"],
            taskIds: ["T1.1"],
            status: "not_started"
          }
        ]
      },
      null,
      2
    )
  );
}

function createInvalidFiles() {
  fs.writeFileSync(
    path.join(govDir, "spec.json"),
    JSON.stringify(
      {
        feature: "test-feature",
        version: 1,
        overview: {},
        userStories: []
      },
      null,
      2
    )
  );
}

function runValidator() {
  try {
    execSync(`node "${validatorPath}"`, { stdio: "pipe" });
    return true;
  } catch (error) {
    return false;
  }
}

function testValidFiles() {
  console.log("\n🧪 Test 1: Valid governance files should pass");
  createValidFiles();

  const passed = runValidator();

  if (passed) {
    console.log("✅ PASS: Validator accepted valid files.");
  } else {
    console.log("❌ FAIL: Validator rejected valid files.");
  }

  return passed;
}

function testInvalidFiles() {
  console.log("\n🧪 Test 2: Invalid governance files should fail");
  createInvalidFiles();

  const passed = runValidator();

  if (!passed) {
    console.log("✅ PASS: Validator rejected invalid files.");
  } else {
    console.log("❌ FAIL: Validator accepted invalid files.");
  }

  return !passed;
}

function cleanup() {
  if (fs.existsSync(govDir)) {
    fs.rmSync(govDir, { recursive: true, force: true });
  }
  console.log("\n🧹 Cleaned up test files.");
}

function main() {
  console.log("=== SpecDrive Validator Tests ===\n");

  let allPassed = true;

  allPassed &= testValidFiles();
  allPassed &= testInvalidFiles();

  cleanup();

  if (allPassed) {
    console.log("\n✅ All validator tests passed.");
    process.exit(0);
  } else {
    console.log("\n❌ Some validator tests failed.");
    process.exit(1);
  }
}

main();