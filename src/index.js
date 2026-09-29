#!/usr/bin/env node

const { Command } = require("commander");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const program = new Command();

function getCliVersion() {
  try {
    return require("../package.json").version;
  } catch (error) {
    const mcpConfigPath = path.join(process.cwd(), ".sdrive", "mcp", "mcp.json");
    if (fs.existsSync(mcpConfigPath)) {
      return JSON.parse(fs.readFileSync(mcpConfigPath, "utf8")).version || "0.1.10";
    }
    return "0.1.10";
  }
}

program
  .name("sdrive")
  .description("SpecDrive Enterprise Spec-Driven Development CLI")
  .version(getCliVersion());

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;

  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

function mergeBundledSlashCommands(packageRoot, sdriveRoot) {
  const packagedManifestPath = path.join(packageRoot, "commands", "manifest.json");
  const installedManifestPath = path.join(sdriveRoot, "commands", "manifest.json");
  const packagedPermissionsPath = path.join(packageRoot, "commands", "permissions.json");
  const installedPermissionsPath = path.join(sdriveRoot, "commands", "permissions.json");

  if (!fs.existsSync(packagedManifestPath) || !fs.existsSync(installedManifestPath)) return;

  try {
    const packagedManifest = JSON.parse(fs.readFileSync(packagedManifestPath, "utf8"));
    const installedManifest = JSON.parse(fs.readFileSync(installedManifestPath, "utf8"));
    if (!Array.isArray(installedManifest.commands)) {
      throw new Error("Installed command manifest must contain a commands array.");
    }

    const knownCommands = new Set(installedManifest.commands.map((command) => command.command));
    const addedCommands = (packagedManifest.commands || []).filter((command) => {
      if (knownCommands.has(command.command)) return false;
      knownCommands.add(command.command);
      installedManifest.commands.push(command);
      return true;
    });

    let installedPermissions;
    if (addedCommands.length > 0 && fs.existsSync(packagedPermissionsPath) && fs.existsSync(installedPermissionsPath)) {
      const packagedPermissions = JSON.parse(fs.readFileSync(packagedPermissionsPath, "utf8"));
      installedPermissions = JSON.parse(fs.readFileSync(installedPermissionsPath, "utf8"));
      installedPermissions.rules = installedPermissions.rules || {};

      for (const command of addedCommands) {
        const roles = packagedPermissions.rules?.[command.command];
        if (roles && !installedPermissions.rules[command.command]) {
          installedPermissions.rules[command.command] = roles;
        }
      }
    }

    if (installedPermissions) {
      fs.writeFileSync(installedPermissionsPath, JSON.stringify(installedPermissions, null, 2));
    }

    if (addedCommands.length > 0) {
      fs.writeFileSync(installedManifestPath, JSON.stringify(installedManifest, null, 2));
      console.log(`  Updated: .sdrive/commands/manifest.json (${addedCommands.length} new command(s))`);
    }
  } catch (error) {
    console.warn("  ⚠️  Could not merge bundled slash commands. Check .sdrive/commands/manifest.json and permissions.json.");
  }
}

function requirePermission(cliCommand) {
  const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "check-permission.js");

  if (!fs.existsSync(scriptPath)) return;

  try {
    execSync(`node "${scriptPath}" cli "${cliCommand}"`, { stdio: "pipe" });
  } catch (error) {
    console.error(`❌ Permission denied for 'sdrive ${cliCommand}'.`);
    if (error.stdout) console.error(error.stdout.toString());
    if (error.stderr) console.error(error.stderr.toString());
    process.exit(1);
  }
}

function audit(event, details = {}) {
  try {
    const { logEvent } = require(path.join(process.cwd(), ".sdrive", "scripts", "audit-log.js"));
    logEvent(event, details);
  } catch (error) {
    // Ignore audit failures so the CLI still works when logging is unavailable.
  }
}

function loadConfig() {
  const configPath = path.join(process.cwd(), ".sdrive", "config.json");
  const schemaPath = path.join(process.cwd(), ".sdrive", "schemas", "config.schema.json");

  if (!fs.existsSync(configPath)) {
    console.error("❌ config.json not found. Run `sdrive init` first.");
    process.exit(1);
  }

  if (!fs.existsSync(schemaPath)) {
    console.error("❌ config.schema.json not found. Run `sdrive init` first.");
    process.exit(1);
  }

  const Ajv = require("ajv");
  const ajv = new Ajv({ allErrors: true });

  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  const valid = ajv.validate(schema, config);

  if (!valid) {
    console.error("❌ config.json is invalid:");
    console.error(ajv.errors);
    process.exit(1);
  }

  return config;
}

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

function printInitWelcome() {
  const useColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb");
  const reset = useColor ? "\u001b[0m" : "";
  const specColor = useColor ? "\u001b[1;96m" : "";
  const driveColor = useColor ? "\u001b[1;94m" : "";
  const headingColor = useColor ? "\u001b[1m" : "";
  const taglineColor = useColor ? "\u001b[2m" : "";

  console.log("");
  console.log(`  ${specColor}Spec${reset}${driveColor}Drive${reset}`);
  console.log(`  ${taglineColor}Spec-driven development with built-in governance${reset}`);
  console.log("");
  console.log(`  ${headingColor}This setup will configure:${reset}`);
  console.log("  - SpecDrive project structure and governance");
  console.log("  - AI tool adapters and workflow commands");
  console.log("  - Optional MCP client connections");
  console.log("");
}

// ---------- INIT COMMAND ----------
program
  .command("init")
  .description("Initialize SpecDrive structure, tool adapters, and default template")
  .action(() => {
    printInitWelcome();

    const projectRoot = process.cwd();
    const sdriveRoot = path.join(projectRoot, ".sdrive");

    const dirs = [
      path.join(sdriveRoot, "agents"),
      path.join(sdriveRoot, "commands"),
      path.join(sdriveRoot, "schemas"),
      path.join(sdriveRoot, "scripts"),
      path.join(sdriveRoot, "dashboard"),
      path.join(sdriveRoot, "mcp"),
      path.join(sdriveRoot, "templates"),
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
      path.join(sdriveRoot, "reports", "tests"),
      path.join(sdriveRoot, "context"),
      path.join(sdriveRoot, "skills")
    ];

    dirs.forEach((dir) => {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`  Created: ${path.relative(projectRoot, dir)}`);
    });

    const packageRoot = path.join(__dirname, "..");

    const dirsToCopy = [
      "agents",
      "schemas",
      "scripts",
      "commands",
      "dashboard",
      "mcp",
      "templates"
    ];

    dirsToCopy.forEach((dir) => {
      const srcDir = path.join(packageRoot, dir);
      const destDir = path.join(sdriveRoot, dir);

      if (fs.existsSync(srcDir)) {
        copyRecursive(srcDir, destDir);
        console.log(`  Copied: .sdrive/${dir}/`);
      } else {
        console.log(`  ⚠️  Missing in package: ${dir}/`);
      }
    });

    mergeBundledSlashCommands(packageRoot, sdriveRoot);

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

    const mcpConfigPath = path.join(sdriveRoot, "mcp", "mcp.json");
    if (!fs.existsSync(mcpConfigPath)) {
      fs.writeFileSync(mcpConfigPath, mcpConfigContent());
      console.log("  Created: .sdrive/mcp/mcp.json");
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
    requirePermission("template:set");

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

    const config = loadConfig();
    config.defaultTemplate = name;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(`✅ Default template set to: ${name}`);
  });

// ---------- CONFIG VALIDATE ----------
program
  .command("config:validate")
  .description("Validate .sdrive/config.json")
  .action(() => {
    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "validate-config.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ validate-config.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${scriptPath}"`, { stdio: "inherit" });
    } catch (error) {
      process.exit(1);
    }
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

// ---------- VERIFY COMMAND ----------
program
  .command("verify <feature>")
  .description("Verify code matches the plan (spec-to-code diff)")
  .action((feature) => {
    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "verify.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ verify.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${scriptPath}" "${feature}"`, { stdio: "inherit" });
    } catch (error) {
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

    audit("feature_created", { feature });
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
      console.log(`   Current Version: ${f.currentVersion}`);

      (f.versions || []).forEach((v) => {
        console.log(`   Version ${v.id}:`);
        console.log(`     Phase:        ${v.phase}`);
        console.log(`     Current Step: ${v.currentStep}`);
        console.log(`     Gates:`);
        console.log(`       specification: ${v.gates?.specification ?? "pending"}`);
        console.log(`       planning:      ${v.gates?.planning ?? "pending"}`);
        console.log(`       implementation: ${v.gates?.implementation ?? "pending"}`);
        console.log(`       review:        ${v.gates?.review ?? "pending"}`);
      });
      console.log("");
    });
  });

// ---------- APPROVE COMMAND ----------
program
  .command("approve <gate>")
  .description("Approve a workflow gate (specification, planning, implementation, review)")
  .action((gate) => {
    requirePermission("approve");

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
    const versionId = feature.currentVersion;

    if (!feature.versions || feature.versions.length === 0) {
      console.error("❌ No versions found.");
      process.exit(1);
    }

    const version = feature.versions.find((v) => v.id === versionId) || feature.versions[0];

    if (!version.gates) {
      version.gates = {};
    }

    version.gates[gate] = "approved";
    version.history = version.history || [];
    version.history.push({
      event: `${gate}_approved`,
      timestamp: new Date().toISOString()
    });

    fs.writeFileSync(workflowStatePath, JSON.stringify(state, null, 2));
    audit("gate_approved", { feature: feature.name, version: version.id, gate });

    console.log(`✅ Gate "${gate}" approved for feature "${feature.name}" version "${version.id}".`);
  });

// ---------- TEAM COMMANDS ----------
program
  .command("team:add <username> <role>")
  .description("Add a new team member")
  .action((username, role) => {
    requirePermission("team:add");

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
    requirePermission("team:remove");

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
    requirePermission("team:update");

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
    requirePermission("team:sync");

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
    requirePermission("hooks:install");

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

// ---------- DASHBOARD ----------
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

// ---------- REOPEN ----------
program
  .command("reopen <feature>")
  .description("Reopen a completed feature")
  .action((feature) => {
    requirePermission("reopen");

    const projectRoot = process.cwd();
    const sdriveRoot = path.join(projectRoot, ".sdrive");

    const completedSpecDir = path.join(sdriveRoot, "specs", "completed", feature);
    const ongoingSpecDir = path.join(sdriveRoot, "specs", "ongoing", feature);

    const completedGovDir = path.join(sdriveRoot, "governance", "completed", feature);
    const ongoingGovDir = path.join(sdriveRoot, "governance", feature);

    if (fs.existsSync(completedSpecDir)) {
      fs.mkdirSync(path.dirname(ongoingSpecDir), { recursive: true });
      fs.renameSync(completedSpecDir, ongoingSpecDir);
      console.log(`✅ Moved spec: completed/${feature} → ongoing/${feature}`);
    } else if (!fs.existsSync(ongoingSpecDir)) {
      console.error(`❌ Feature "${feature}" not found in completed/ or ongoing/.`);
      process.exit(1);
    }

    if (fs.existsSync(completedGovDir)) {
      fs.mkdirSync(path.dirname(ongoingGovDir), { recursive: true });
      fs.renameSync(completedGovDir, ongoingGovDir);
      console.log(`✅ Moved governance: completed/${feature} → ${feature}`);
    }

    const workflowStatePath = path.join(sdriveRoot, "workflow-state.json");

    if (!fs.existsSync(workflowStatePath)) {
      console.error("❌ workflow-state.json not found.");
      process.exit(1);
    }

    const state = JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));
    const target = state.features?.find((f) => f.name === feature);

    if (!target) {
      console.error(`❌ Feature "${feature}" not found in workflow-state.json.`);
      process.exit(1);
    }

    if (!target.versions || target.versions.length === 0) {
      console.error(`❌ Feature "${feature}" has no versions.`);
      process.exit(1);
    }

    const currentVersion = target.versions.find((v) => v.id === target.currentVersion);

    if (currentVersion) {
      currentVersion.phase = "ongoing";
      currentVersion.currentStep = "specification";
      currentVersion.gates.review = "pending";
      currentVersion.history = currentVersion.history || [];
      currentVersion.history.push({
        event: "feature_reopened",
        timestamp: new Date().toISOString()
      });
    }

    fs.writeFileSync(workflowStatePath, JSON.stringify(state, null, 2));

    console.log(`✅ Feature "${feature}" reopened.`);
    console.log("   Review gate reset to pending.");
  });

// ---------- ONBOARD COMMAND ----------
// Internal helper. Usually run automatically by the Onboarding Agent.
program
  .command("onboard")
  .description("Scan an existing project for onboarding (usually run automatically by /sdrive:onboard)")
  .action(() => {
    requirePermission("onboard");

    const projectRoot = process.cwd();
    const sdriveRoot = path.join(projectRoot, ".sdrive");
    const workflowStatePath = path.join(sdriveRoot, "workflow-state.json");

    // Guard: refuse to run twice
    if (fs.existsSync(workflowStatePath)) {
      try {
        const state = JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));

        if (state.onboarding && state.onboarding.date) {
          console.error(
            `❌ Onboarding already ran on ${state.onboarding.date}. Refusing to re-run.`
          );
          console.error("   If you want to re-run, remove the 'onboarding' block from workflow-state.json.");
          process.exit(1);
        }
      } catch (error) {
        // ignore parse errors and continue
      }
    }

    const scriptPath = path.join(sdriveRoot, "scripts", "onboard.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ onboard.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${scriptPath}"`, { stdio: "inherit" });

      console.log("");
      console.log("📋 The scan is complete.");
      console.log("   You can now run `/sdrive:onboard` in your AI tool,");
      console.log("   or the agent will run this scan for you if needed.");
    } catch (error) {
      console.error("❌ Onboarding scan failed.");
      process.exit(1);
    }
  });

// ---------- VERSION NEW ----------
program
  .command("version:new <feature>")
  .description("Create a new version of a feature")
  .action((feature) => {
    requirePermission("version:new");

    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "version-new.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ version-new.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${scriptPath}" "${feature}"`, { stdio: "inherit" });
      audit("version_created", { feature });
    } catch (error) {
      process.exit(1);
    }
  });

// ---------- DIFF VERSION ----------
program
  .command("diff:version <feature> <versionA> <versionB>")
  .description("Compare two versions of a feature")
  .action((feature, versionA, versionB) => {
    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "diff-version.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ diff-version.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    try {
      execSync(`node "${scriptPath}" "${feature}" "${versionA}" "${versionB}"`, { stdio: "inherit" });
    } catch (error) {
      process.exit(1);
    }
  });

program.parse(process.argv);