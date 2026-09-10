#!/usr/bin/env node

const { Command } = require("commander");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
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

function mcpServerContent() {
  return `#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

function loadWorkflowState() {
  const statePath = path.join(projectRoot, ".sdrive", "workflow-state.json");
  if (!fs.existsSync(statePath)) return { features: [] };
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function listFeatures() {
  return loadWorkflowState().features || [];
}

function getFeature(name) {
  return listFeatures().find((f) => f.name === name);
}

function getSpec(name) {
  const specPath = path.join(projectRoot, ".sdrive", "governance", name, "spec.json");
  if (!fs.existsSync(specPath)) return null;
  return JSON.parse(fs.readFileSync(specPath, "utf8"));
}

function getTraceability(name) {
  const tracePath = path.join(projectRoot, ".sdrive", "governance", name, "traceability.json");
  if (!fs.existsSync(tracePath)) return null;
  return JSON.parse(fs.readFileSync(tracePath, "utf8"));
}

function runValidator() {
  const { execSync } = require("child_process");
  const validatorPath = path.join(projectRoot, ".sdrive", "scripts", "validate-governance.js");
  try {
    execSync(\`node "\${validatorPath}"\`, { stdio: "pipe" });
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

const handlers = {
  "specdrive.list_features": () => ({ features: listFeatures() }),
  "specdrive.get_feature": ({ name }) => ({ feature: getFeature(name) }),
  "specdrive.get_spec": ({ name }) => ({ spec: getSpec(name) }),
  "specdrive.get_traceability": ({ name }) => ({ traceability: getTraceability(name) }),
  "specdrive.validate": () => runValidator(),
  "specdrive.status": () => {
    const features = listFeatures();
    return {
      count: features.length,
      features: features.map((f) => ({
        name: f.name,
        phase: f.phase,
        currentStep: f.currentStep
      }))
    };
  }
};

const input = process.argv[2] ? JSON.parse(process.argv[2]) : null;

if (!input) {
  console.error("❌ Usage: node server.js '{\\"method\\": \\"specdrive.list_features\\"}'");
  process.exit(1);
}

const handler = handlers[input.method];

if (!handler) {
  console.error(\`❌ Unknown MCP method: \${input.method}\`);
  process.exit(1);
}

const result = handler(input.params || {});
console.log(JSON.stringify(result, null, 2));
`;
}

function mcpConfigContent() {
  return JSON.stringify(
    {
      mcpServers: {
        specdrive: {
          command: "node",
          args: [".sdrive/mcp/server.js"]
        }
      }
    },
    null,
    2
  );
}

function safeMergeMcpConfig(configPath, mcpContent) {
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, mcpContent);
    console.log(`✅ Created: ${configPath}`);
    return;
  }

  try {
    const existing = JSON.parse(fs.readFileSync(configPath, "utf8"));
    existing.mcpServers = existing.mcpServers || {};

    if (existing.mcpServers.specdrive) {
      console.log(`⚠️  SpecDrive already configured in ${configPath}`);
      return;
    }

    existing.mcpServers.specdrive = {
      command: "node",
      args: [".sdrive/mcp/server.js"]
    };

    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));
    console.log(`✅ Merged SpecDrive into: ${configPath}`);
  } catch (error) {
    console.error(`⚠️  Could not merge into ${configPath}`);
  }
}

function getMcpConfigPaths() {
  const paths = [];

  const platform = os.platform();
  const home = os.homedir();

  if (platform === "darwin") {
    paths.push({
      name: "Claude Desktop",
      path: path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    });
  }

  if (platform === "win32") {
    paths.push({
      name: "Claude Desktop",
      path: path.join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json")
    });
  }

  paths.push({
    name: "Cursor",
    path: path.join(process.cwd(), ".cursor", "mcp.json")
  });

  paths.push({
    name: "Cline",
    path: path.join(process.cwd(), ".cline", "mcp.json")
  });

  paths.push({
    name: "VS Code",
    path: path.join(process.cwd(), ".vscode", "mcp.json")
  });

  return paths;
}

// ---------- INIT COMMAND ----------
program
  .command("init")
  .description("Initialize SpecDrive structure, tool adapters, and default template")
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
      path.join(sdriveRoot, "skills"),
      path.join(sdriveRoot, "templates"),
      path.join(sdriveRoot, "mcp")
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

    const configPath = path.join(sdriveRoot, "config.json");
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify({ defaultTemplate: "generic" }, null, 2));
      console.log("  Created: .sdrive/config.json");
    }

    const teamPath = path.join(sdriveRoot, "team.json");
    if (!fs.existsSync(teamPath)) {
      fs.writeFileSync(
        teamPath,
        JSON.stringify(
          {
            members: [],
            rules: {
              approval_required: ["admin", "reviewer"],
              implementation_allowed: ["developer", "admin"]
            }
          },
          null,
          2
        )
      );
      console.log("  Created: .sdrive/team.json");
    }

    // MCP server file
    const mcpServerPath = path.join(sdriveRoot, "mcp", "server.js");
    if (!fs.existsSync(mcpServerPath)) {
      fs.writeFileSync(mcpServerPath, mcpServerContent());
      fs.chmodSync(mcpServerPath, 0o755);
      console.log("  Created: .sdrive/mcp/server.js");
    }

    // MCP config template
    const mcpConfigPath = path.join(sdriveRoot, "mcp", "mcp.json");
    if (!fs.existsSync(mcpConfigPath)) {
      fs.writeFileSync(mcpConfigPath, mcpConfigContent());
      console.log("  Created: .sdrive/mcp/mcp.json");
    }

    // Tool selection
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

      const templates = ["generic", "react-node", "nextjs", "expo", "fastapi", "turborepo"];

      console.log("\n📦 Select default template:\n");
      templates.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));

      const rl2 = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl2.question("Template (default: 1): ", (templateAnswer) => {
        rl2.close();

        const idx = templateAnswer.trim() === "" ? 0 : parseInt(templateAnswer.trim()) - 1;
        const selectedTemplate = templates[idx] || "generic";

        const cfgPath = path.join(sdriveRoot, "config.json");
        fs.writeFileSync(cfgPath, JSON.stringify({ defaultTemplate: selectedTemplate }, null, 2));

        console.log(`\n✅ Default template set to: ${selectedTemplate}`);

        // MCP wiring
        const mcpPaths = getMcpConfigPaths();

        console.log("\n🔌 MCP Client Wiring\n");
        mcpPaths.forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.name} (${p.path})`);
        });
        console.log("  Or press Enter to skip MCP wiring.\n");

        const rl3 = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        rl3.question("Wire MCP clients: ", (mcpAnswer) => {
          rl3.close();

          if (mcpAnswer.trim() === "") {
            console.log("\n⚠️  MCP wiring skipped.");
            console.log("\n✅ SpecDrive initialized successfully.");
            return;
          }

          const selectedIndexes = mcpAnswer.split(",").map((n) => parseInt(n.trim()) - 1);
          const selectedPaths = selectedIndexes
            .filter((i) => i >= 0 && i < mcpPaths.length)
            .map((i) => mcpPaths[i]);

          selectedPaths.forEach((p) => {
            safeMergeMcpConfig(p.path, mcpConfigContent());
          });

          console.log("\n✅ SpecDrive initialized successfully.");
        });
      });
    });
  });

// ---------- TEMPLATE COMMANDS ----------
program
  .command("template:list")
  .description("List available templates")
  .action(() => {
    const templates = ["generic", "react-node", "nextjs", "expo", "fastapi", "turborepo"];
    console.log("\nAvailable Templates\n");
    templates.forEach((t) => console.log(`  ${t}`));
  });

program
  .command("template:set <name>")
  .description("Set default template")
  .action((name) => {
    const templates = ["generic", "react-node", "nextjs", "expo", "fastapi", "turborepo"];

    if (!templates.includes(name)) {
      console.error(`❌ Invalid template. Run \`sdrive template:list\` to see available templates.`);
      process.exit(1);
    }

    const configPath = path.join(process.cwd(), ".sdrive", "config.json");

    if (!fs.existsSync(configPath)) {
      console.error("❌ config.json not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.defaultTemplate = name;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(`✅ Default template set to: ${name}`);
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

    fs.writeFileSync(path.join(featureSpecDir, "plan.md"), `# Technical Plan: ${feature}\n`);
    fs.writeFileSync(path.join(featureSpecDir, "tasks.md"), `# Execution Tasks: ${feature}\n`);

    fs.writeFileSync(
      path.join(featureGovDir, "spec.json"),
      JSON.stringify({ feature, title: feature, version: 1, overview: {}, userStories: [], functionalRequirements: [] }, null, 2)
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

    if (!team.members) team.members = [];

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

program
  .command("team:sync")
  .description("Sync team members from GitHub collaborators")
  .action(() => {
    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "github-team-sync.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ github-team-sync.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${scriptPath}"`, { stdio: "inherit" });
    } catch (error) {
      console.error("❌ Team sync failed.");
      process.exit(1);
    }
  });

// ---------- HOOKS ----------
program
  .command("hooks:install")
  .description("Install SpecDrive pre-commit hook")
  .action(() => {
    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "install-hooks.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ install-hooks.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${scriptPath}"`, { stdio: "inherit" });
    } catch (error) {
      console.error("❌ Hook installation failed.");
      process.exit(1);
    }
  });

// ---------- MIGRATE ----------
program
  .command("migrate")
  .description("Migrate specs from OpenSpec or Spec-Kit")
  .action(() => {
    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "migrate.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ migrate.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${scriptPath}"`, { stdio: "inherit" });
    } catch (error) {
      console.error("❌ Migration failed.");
      process.exit(1);
    }
  });

// ---------- DIFF ----------
program
  .command("diff <oldFile> <newFile>")
  .description("Show differences between two spec files")
  .action((oldFile, newFile) => {
    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "diff-spec.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ diff-spec.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${scriptPath}" "${oldFile}" "${newFile}"`, { stdio: "inherit" });
    } catch (error) {
      console.error("❌ Diff failed.");
      process.exit(1);
    }
  });

// ---------- OPENAPI ----------
program
  .command("openapi:generate <feature>")
  .description("Generate OpenAPI spec from plan.json API contracts")
  .action((feature) => {
    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "generate-openapi.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ generate-openapi.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${scriptPath}" "${feature}"`, { stdio: "inherit" });
    } catch (error) {
      console.error("❌ OpenAPI generation failed.");
      process.exit(1);
    }
  });

  program
  .command("dashboard")
  .description("Start SpecDrive web dashboard")
  .action(() => {
    const scriptPath = path.join(process.cwd(), ".sdrive", "dashboard", "server.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ Dashboard not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${scriptPath}"`, { stdio: "inherit" });
    } catch (error) {
      console.error("❌ Dashboard failed to start.");
      process.exit(1);
    }
  });

program.parse(process.argv);