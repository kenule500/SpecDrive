const { execSync } = require("child_process");
const path = require("path");

const projectRoot = process.cwd();

try {
  execSync(`node ${path.join(projectRoot, ".sdrive", "src", "index.js")} create test-feature`, {
    stdio: "inherit"
  });
  process.exit(0);
} catch (error) {
  console.error("Feature creation failed.");
  process.exit(1);
}