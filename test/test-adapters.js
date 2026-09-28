const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = process.cwd();
const generatorPath = path.join(projectRoot, ".sdrive", "scripts", "generate-adapters.js");

function testGeneratorCreatesAdapters() {
  console.log("\n🧪 Test 1: Generator creates adapters");

  try {
    execSync(`node "${generatorPath}"`, { stdio: "pipe" });
  } catch (error) {
    console.log("❌ FAIL: Generator failed.");
    return false;
  }

  const toolsPath = path.join(projectRoot, ".sdrive", "commands", "tools.json");
  const tools = JSON.parse(fs.readFileSync(toolsPath, "utf8")).tools;

  for (const tool of tools) {
    const fullPath = path.join(projectRoot, tool.adapterPath);

    if (fs.existsSync(fullPath)) {
      console.log(`  ✅ Found: ${tool.adapterPath}`);
    } else {
      console.log(`  ❌ Missing: ${tool.adapterPath}`);
      return false;
    }
  }

  console.log("✅ PASS: All adapters created.");
  return true;
}

function testAdapterContent() {
  console.log("\n🧪 Test 2: Adapter content includes SpecDrive instructions");

  const adapterPath = path.join(projectRoot, ".github", "copilot-instructions.md");

  if (!fs.existsSync(adapterPath)) {
    console.log("❌ FAIL: Copilot adapter missing.");
    return false;
  }

  const content = fs.readFileSync(adapterPath, "utf8");

  if (content.includes(".sdrive/commands/manifest.json")) {
    console.log("✅ PASS: Adapter contains manifest reference.");
    return true;
  }

  console.log("❌ FAIL: Adapter missing manifest reference.");
  return false;
}

function testSafetyRule() {
  console.log("\n🧪 Test 3: Generator does not overwrite existing files");

  const adapterPath = path.join(projectRoot, ".github", "copilot-instructions.md");

  fs.writeFileSync(adapterPath, "# Custom existing file\n", "utf8");

  try {
    execSync(`node "${generatorPath}"`, { stdio: "pipe" });
  } catch (error) {
    console.log("❌ FAIL: Generator failed.");
    return false;
  }

  const content = fs.readFileSync(adapterPath, "utf8");

  if (content === "# Custom existing file\n") {
    console.log("✅ PASS: Existing file was not overwritten.");
    return true;
  }

  console.log("❌ FAIL: Existing file was overwritten.");
  return false;
}

function cleanup() {
  const toolsPath = path.join(projectRoot, ".sdrive", "commands", "tools.json");

  if (fs.existsSync(toolsPath)) {
    const tools = JSON.parse(fs.readFileSync(toolsPath, "utf8")).tools;

    tools.forEach((tool) => {
      const fullPath = path.join(projectRoot, tool.adapterPath);
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { force: true });
      }
    });
  }

  console.log("\n🧹 Cleaned up adapters.");
}

function main() {
  console.log("=== SpecDrive Adapter Tests ===\n");

  let allPassed = true;

  allPassed &= testGeneratorCreatesAdapters();
  allPassed &= testAdapterContent();
  allPassed &= testSafetyRule();

  cleanup();

  if (allPassed) {
    console.log("\n✅ All adapter tests passed.");
    process.exit(0);
  } else {
    console.log("\n❌ Some adapter tests failed.");
    process.exit(1);
  }
}

main();