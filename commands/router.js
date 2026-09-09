#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { getWorkflowState, saveWorkflowState, isGateApproved } = require("./gates");

const projectRoot = process.cwd();

function loadManifest() {
  const manifestPath = path.join(projectRoot, ".sdrive", "commands", "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    console.error("❌ manifest.json not found. Run `sdrive init` first.");
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function findCommand(commandName) {
  const manifest = loadManifest();
  return manifest.commands.find((cmd) => cmd.command === commandName);
}

function loadAgent(agentFile) {
  const agentPath = path.join(projectRoot, agentFile);

  if (!fs.existsSync(agentPath)) {
    console.error(`❌ Agent file not found: ${agentFile}`);
    process.exit(1);
  }

  return fs.readFileSync(agentPath, "utf8");
}

function runValidators(validators) {
  const validatorPath = path.join(projectRoot, ".sdrive", "scripts", "validate-governance.js");

  if (!validators || validators.length === 0) {
    return true;
  }

  if (!fs.existsSync(validatorPath)) {
    console.warn("⚠️  Validator script not found. Skipping validation.");
    return true;
  }

  try {
    execSync(`node "${validatorPath}"`, { stdio: "inherit" });
    return true;
  } catch (error) {
    console.error("❌ Validation failed.");
    return false;
  }
}

function toKebabCase(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function main() {
  const commandName = process.argv[2];
  const rawFeature = process.argv[3];

  if (!commandName) {
    console.error("❌ Usage: node router.js /sdrive:<command> [feature-description]");
    process.exit(1);
  }

  const command = findCommand(commandName);

  if (!command) {
    console.error(`❌ Unknown command: ${commandName}`);
    process.exit(1);
  }

  let featureName = null;

  if (rawFeature) {
    featureName = toKebabCase(rawFeature);
    console.log(`\n📦 Feature: ${featureName}`);
  }

  console.log(`\n🚀 SpecDrive Command: ${command.command}`);
  console.log(`📄 Agent: ${command.agent}`);
  console.log(`📁 Agent File: ${command.agentFile}`);
  console.log(`📝 Description: ${command.description}`);

  if (command.gates && command.gates.length > 0) {
    if (!featureName) {
      console.error(`❌ This command requires a feature name or description.`);
      console.error(`   Usage: node router.js ${commandName} "<feature-description>"`);
      process.exit(1);
    }

    console.log(`\n🚧 Required Gates: ${command.gates.join(", ")}`);

    for (const gate of command.gates) {
      if (!isGateApproved(featureName, gate)) {
        console.log(`\n⏸️  Gate "${gate}" is NOT approved for "${featureName}".`);
        console.log(`   Please approve this gate before running this command.`);
        console.log(`   Use: sdrive approve ${gate}\n`);
        process.exit(1);
      }
      console.log(`✅ Gate "${gate}" is approved.`);
    }
  }

  const agentContent = loadAgent(command.agentFile);
  console.log(`\n✅ Loaded agent instructions (${agentContent.length} characters).`);

  const valid = runValidators(command.validators);

  if (!valid) {
    console.error("\n❌ Command execution blocked due to validation failure.");
    process.exit(1);
  }

  console.log("\n🤖 The AI tool should now read the agent instructions and execute the command.");
  console.log("⏸️  Remember to stop for human approval after the command completes.\n");
}

main();