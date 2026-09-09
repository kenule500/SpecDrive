#!/usr/bin/env node

const { Command } = require("commander");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const program = new Command();

program
  .name("sdrive")
  .description("SpecDrive Enterprise Spec-Driven Development CLI")
  .version("0.1.0");

function adapterContent(toolName) {
  return `# SpecDrive Commands

This project uses SpecDrive for spec-driven development.

## How to use

When the user types a /sdrive:* command, follow these steps:

1. Read .sdrive/commands/manifest.json
2. Find the matching command
3. Read the agent file listed in agentFile
4. Follow that agent's instructions exactly
5. Run validators after writing files
6. Stop at human approval gates

Always read the manifest first. Never hardcode the command list.
`;
}

// ---------- INIT COMMAND ----------
program
  .command("init")
  .description("Initialize SpecDrive structure and tool adapters")
  .action(() => {
    const projectRoot = process.cwd();
    const sdriveRoot = path.join(projectRoot, ".sdrive");

    const dirs = [
      path.join(sdriveRoot, "agents"),
      path.join(sdriveRoot, "commands"),
      path.join(sdriveRoot, "schemas"),
      path.join(sdriveRoot, "specs", "backlog"),
      path.join(sdriveRoot, "specs", "ongoing"),
      path.join(sdriveRoot, "specs", "completed"),
      path.join(sdriveRoot, "governance"),
      path.join(sdriveRoot, "prototype", "css"),
      path.join(sdriveRoot, "prototype", "js"),
      path.join(sdriveRoot, "prototype", "screens"),
      path.join(sdriveRoot, "reports", "security"),
      path.join(sdriveRoot, "reports", "performance"),
      path.join(sdriveRoot, "reports", "docs"),
      path.join(sdriveRoot, "context"),
      path.join(sdriveRoot, "skills")
    ];

    dirs.forEach((dir) => {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`  Created: ${path.relative(projectRoot, dir)}`);
    });

    const workflowStatePath = path.join(sdriveRoot, "workflow-state.json");
    if (!fs.existsSync(workflowStatePath)) {
      fs.writeFileSync(workflowStatePath, JSON.stringify({ features: [] }, null, 2));
      console.log("  Created: .sdrive/workflow-state.json");
    }

    const constitutionPath = path.join(sdriveRoot, "constitution.md");
    if (!fs.existsSync(constitutionPath)) {
      fs.writeFileSync(constitutionPath, "# SpecDrive Constitution\n\nInitialized by `sdrive init`.\n");
      console.log("  Created: .sdrive/constitution.md");
    }

    const toolsPath = path.join(sdriveRoot, "commands", "tools.json");

    if (!fs.existsSync(toolsPath)) {
      console.log("\n⚠️  tools.json not found. Skipping tool selection.");
      console.log("\n✅ SpecDrive initialized successfully.");
      return;
    }

    const tools = JSON.parse(fs.readFileSync(toolsPath, "utf8")).tools;

    console.log("\n🔧 Select tools to set up (comma-separated numbers):\n");
    tools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name}`);
    });
    console.log("  Or press Enter to generate all.\n");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question("Selection: ", (answer) => {
      rl.close();

      let selectedTools = tools;

      if (answer.trim() !== "") {
        const selectedIndexes = answer.split(",").map((n) => parseInt(n.trim()) - 1);
        selectedTools = selectedIndexes
          .filter((i) => i >= 0 && i < tools.length)
          .map((i) => tools[i]);
      }

      selectedTools.forEach((tool) => {
        const adapterFullPath = path.join(projectRoot, tool.adapterPath);
        const adapterDir = path.dirname(adapterFullPath);

        if (!fs.existsSync(adapterDir)) {
          fs.mkdirSync(adapterDir, { recursive: true });
        }

        if (fs.existsSync(adapterFullPath)) {
          console.log(`⚠️  Skipped existing: ${tool.adapterPath}`);
          return;
        }

        fs.writeFileSync(adapterFullPath, adapterContent(tool.name));
        console.log(`✅ Generated: ${tool.adapterPath}`);
      });

      console.log("\n✅ SpecDrive initialized successfully.");
    });
  });

// ---------- VALIDATE COMMAND ----------
program
  .command("validate")
  .description("Validate SpecDrive governance files")
  .action(() => {
    const projectRoot = process.cwd();
    const validatorPath = path.join(projectRoot, ".sdrive", "scripts", "validate-governance.js");

    if (!fs.existsSync(validatorPath)) {
      console.error("❌ Validator not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${validatorPath}"`, { stdio: "inherit" });
    } catch (error) {
      console.error("\n❌ Validation failed.");
      process.exit(1);
    }
  });

// ---------- CREATE COMMAND ----------
program
  .command("create <feature>")
  .description("Create a new feature scaffold (internal)")
  .action((feature) => {
    if (!/^[a-z0-9-]+$/.test(feature)) {
      console.error("❌ Feature name must be lowercase letters, numbers, and hyphens only.");
      process.exit(1);
    }

    const projectRoot = process.cwd();
    const featureSpecDir = path.join(projectRoot, ".sdrive", "specs", "backlog", feature);
    const featureGovDir = path.join(projectRoot, ".sdrive", "governance", feature);

    if (fs.existsSync(featureSpecDir) || fs.existsSync(featureGovDir)) {
      console.error(`❌ Feature "${feature}" already exists.`);
      process.exit(1);
    }

    fs.mkdirSync(featureSpecDir, { recursive: true });
    fs.mkdirSync(featureGovDir, { recursive: true });

    fs.writeFileSync(
      path.join(featureSpecDir, "spec.md"),
      `---\ntitle: ${feature}\nstatus: backlog\ncreated: ${new Date().toISOString()}\nupdated: ${new Date().toISOString()}\n---\n\n# ${feature}\n`
    );

    fs.writeFileSync(
      path.join(featureSpecDir, "plan.md"),
      `# Technical Plan: ${feature}\n`
    );

    fs.writeFileSync(
      path.join(featureSpecDir, "tasks.md"),
      `# Execution Tasks: ${feature}\n`
    );

    fs.writeFileSync(
      path.join(featureGovDir, "spec.json"),
      JSON.stringify({ feature, version: 1, overview: {}, userStories: [], functionalRequirements: [] }, null, 2)
    );

    fs.writeFileSync(
      path.join(featureGovDir, "plan.json"),
      JSON.stringify({ feature, version: 1, architecture: {}, dataModel: {} }, null, 2)
    );

    fs.writeFileSync(
      path.join(featureGovDir, "tasks.json"),
      JSON.stringify({ feature, version: 1, phases: [] }, null, 2)
    );

    fs.writeFileSync(
      path.join(featureGovDir, "traceability.json"),
      JSON.stringify({ feature, version: 1, rows: [] }, null, 2)
    );

    console.log(`✅ Feature "${feature}" created in backlog.`);
  });

// ---------- STATUS COMMAND ----------
program
  .command("status")
  .description("Show feature lifecycle state")
  .action(() => {
    const projectRoot = process.cwd();
    const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");

    if (!fs.existsSync(workflowStatePath)) {
      console.error("❌ workflow-state.json not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const state = JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));

    if (!state.features || state.features.length === 0) {
      console.log("No features found.");
      return;
    }

    console.log("\nSpecDrive Feature Status\n");

    state.features.forEach((f) => {
      console.log(`📁 ${f.name}`);
      console.log(`   Phase:        ${f.phase}`);
      console.log(`   Current Step: ${f.currentStep}`);
      console.log(`   Gates:`);
      console.log(`     specification: ${f.gates?.specification ?? "pending"}`);
      console.log(`     planning:      ${f.gates?.planning ?? "pending"}`);
      console.log(`     implementation: ${f.gates?.implementation ?? "pending"}`);
      console.log(`     review:        ${f.gates?.review ?? "pending"}`);
      console.log("");
    });
  });

// ---------- APPROVE COMMAND ----------
program
  .command("approve <gate>")
  .description("Approve a workflow gate (specification, planning, implementation, review)")
  .action((gate) => {
    const allowedGates = ["specification", "planning", "implementation", "review"];

    if (!allowedGates.includes(gate)) {
      console.error(`❌ Invalid gate. Allowed: ${allowedGates.join(", ")}`);
      process.exit(1);
    }

    const projectRoot = process.cwd();
    const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");

    if (!fs.existsSync(workflowStatePath)) {
      console.error("❌ workflow-state.json not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const state = JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));

    if (!state.features || state.features.length === 0) {
      console.error("❌ No features found.");
      process.exit(1);
    }

    const feature = state.features[0];

    if (!feature.gates) {
      feature.gates = {};
    }

    feature.gates[gate] = "approved";
    feature.history = feature.history || [];
    feature.history.push({
      event: `${gate}_approved`,
      timestamp: new Date().toISOString()
    });

    fs.writeFileSync(workflowStatePath, JSON.stringify(state, null, 2));

    console.log(`✅ Gate "${gate}" approved for feature "${feature.name}".`);
  });

// ---------- TEAM COMMANDS ----------

program
  .command("team:add <username> <role>")
  .description("Add a new team member")
  .action((username, role) => {
    const teamPath = path.join(process.cwd(), ".sdrive", "team.json");

    if (!fs.existsSync(teamPath)) {
      console.error("❌ team.json not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const team = JSON.parse(fs.readFileSync(teamPath, "utf8"));

    if (!team.members) {
      team.members = [];
    }

    const existing = team.members.find((m) => m.username === username);
    if (existing) {
      console.error(`❌ User "${username}" already exists. Use team:update to change role.`);
      process.exit(1);
    }

    team.members.push({ username, role });
    fs.writeFileSync(teamPath, JSON.stringify(team, null, 2));

    console.log(`✅ Added ${username} as ${role}.`);
  });

program
  .command("team:remove <username>")
  .description("Remove a team member")
  .action((username) => {
    const teamPath = path.join(process.cwd(), ".sdrive", "team.json");

    if (!fs.existsSync(teamPath)) {
      console.error("❌ team.json not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const team = JSON.parse(fs.readFileSync(teamPath, "utf8"));

    const before = team.members?.length || 0;
    team.members = (team.members || []).filter((m) => m.username !== username);
    const after = team.members.length;

    if (before === after) {
      console.error(`❌ User "${username}" not found.`);
      process.exit(1);
    }

    fs.writeFileSync(teamPath, JSON.stringify(team, null, 2));
    console.log(`✅ Removed ${username}.`);
  });

program
  .command("team:list")
  .description("List all team members")
  .action(() => {
    const teamPath = path.join(process.cwd(), ".sdrive", "team.json");

    if (!fs.existsSync(teamPath)) {
      console.error("❌ team.json not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const team = JSON.parse(fs.readFileSync(teamPath, "utf8"));

    if (!team.members || team.members.length === 0) {
      console.log("No team members found.");
      return;
    }

    console.log("\nSpecDrive Team Members\n");
    team.members.forEach((m) => {
      console.log(`👤 ${m.username} — ${m.role}`);
    });
  });

program
  .command("team:update <username> <role>")
  .description("Update a team member's role")
  .action((username, role) => {
    const teamPath = path.join(process.cwd(), ".sdrive", "team.json");

    if (!fs.existsSync(teamPath)) {
      console.error("❌ team.json not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const team = JSON.parse(fs.readFileSync(teamPath, "utf8"));

    const member = team.members?.find((m) => m.username === username);

    if (!member) {
      console.error(`❌ User "${username}" not found.`);
      process.exit(1);
    }

    member.role = role;
    fs.writeFileSync(teamPath, JSON.stringify(team, null, 2));

    console.log(`✅ Updated ${username} to ${role}.`);
  });

program.parse(process.argv);