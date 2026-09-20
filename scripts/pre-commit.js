const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const projectRoot = process.cwd();

const validatorPath = path.join(projectRoot, ".sdrive", "scripts", "validate-governance.js");
const verifyPath = path.join(projectRoot, ".sdrive", "scripts", "verify.js");

function getFeatureNames() {
  const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");

  if (!fs.existsSync(workflowStatePath)) return [];

  try {
    const state = JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));
    return (state.features || []).map((f) => f.name);
  } catch (error) {
    return [];
  }
}

// 1. Run governance validator
if (fs.existsSync(validatorPath)) {
  try {
    execSync(`node "${validatorPath}"`, { stdio: "inherit" });
    console.log("✅ Governance validation passed.");
  } catch (error) {
    console.error("❌ Governance validation failed. Fix errors before committing.");
    process.exit(1);
  }
} else {
  console.log("⚠️  Validator not found. Skipping governance validation.");
}

// 2. Run spec-to-code verification for every active feature
const features = getFeatureNames();

if (features.length === 0) {
  console.log("⚠️  No features found. Skipping spec-to-code verification.");
  process.exit(0);
}

for (const feature of features) {
  try {
    execSync(`node "${verifyPath}" "${feature}"`, { stdio: "pipe" });
    console.log(`✅ Spec-to-code verification passed for ${feature}.`);
  } catch (error) {
    console.error(`❌ Verification failed for ${feature}.`);
    console.error(error.stdout ? error.stdout.toString() : "");
    process.exit(1);
  }
}

console.log("✅ Pre-commit checks passed.");
process.exit(0);