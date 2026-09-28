const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = process.cwd();
const routerPath = path.join(projectRoot, ".sdrive", "commands", "router.js");

function runRouter(command, feature) {
  try {
    const args = feature ? ` ${feature}` : "";
    execSync(`node "${routerPath}" ${command}${args}`, { stdio: "pipe" });
    return true;
  } catch (error) {
    return false;
  }
}

function testKnownCommand() {
  console.log("\n🧪 Test 1: Known command should pass");

  const passed = runRouter("/sdrive:skills");

  if (passed) {
    console.log("✅ PASS: Router accepted the ungated /sdrive:skills command.");
    return true;
  }

  console.log("❌ FAIL: Router rejected /sdrive:skills.");
  return false;
}

function testUnknownCommand() {
  console.log("\n🧪 Test 2: Unknown command should fail");

  const passed = runRouter("/sdrive:unknown");

  if (!passed) {
    console.log("✅ PASS: Router rejected unknown command.");
    return true;
  }

  console.log("❌ FAIL: Router accepted unknown command.");
  return false;
}

function testMissingFeatureForGatedCommand() {
  console.log("\n🧪 Test 3: Gated command without feature should fail");

  const passed = runRouter("/sdrive:propose");

  if (!passed) {
    console.log("✅ PASS: Router blocked gated command without feature.");
    return true;
  }

  console.log("❌ FAIL: Router allowed gated command without feature.");
  return false;
}

function testFeatureConversion() {
  console.log("\n🧪 Test 4: Natural feature description should convert to kebab-case");

  try {
    const output = execSync(
      `node "${routerPath}" /sdrive:propose "User login with email"`,
      { stdio: "pipe", encoding: "utf8" }
    );

    if (output.includes("user-login-with-email")) {
      console.log("✅ PASS: Feature converted to kebab-case.");
      return true;
    }

    console.log("❌ FAIL: Feature not converted correctly.");
    return false;
  } catch (error) {
    if (error.stdout && error.stdout.includes("user-login-with-email")) {
      console.log("✅ PASS: Feature converted to kebab-case.");
      return true;
    }

    if (error.stdout && error.stdout.includes("user-login-with-email")) {
      console.log("✅ PASS: Feature converted to kebab-case.");
      return true;
    }

    console.log("❌ FAIL: Feature not converted correctly.");
    return false;
  }
}

function main() {
  console.log("=== SpecDrive Router Tests ===\n");

  let allPassed = true;

  allPassed &= testKnownCommand();
  allPassed &= testUnknownCommand();
  allPassed &= testMissingFeatureForGatedCommand();
  allPassed &= testFeatureConversion();

  if (allPassed) {
    console.log("\n✅ All router tests passed.");
    process.exit(0);
  } else {
    console.log("\n❌ Some router tests failed.");
    process.exit(1);
  }
}

main();