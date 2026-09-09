const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const projectRoot = process.cwd();
const validatorPath = path.join(projectRoot, ".sdrive", "scripts", "validate-governance.js");

if (!fs.existsSync(validatorPath)) {
  console.log("⚠️  Validator not found. Skipping pre-commit validation.");
  process.exit(0);
}

try {
  execSync(`node "${validatorPath}"`, { stdio: "inherit" });
  console.log("✅ Pre-commit validation passed.");
  process.exit(0);
} catch (error) {
  console.error("❌ Pre-commit validation failed. Fix errors before committing.");
  process.exit(1);
}