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

// Like copyRecursive, but overwrites existing files. Used by `sdrive update` to
// refresh framework-owned code (dashboard, mcp, scripts, schemas) so bug fixes
// reach existing projects. Returns the number of files written.
function copyRecursiveForce(src, dest) {
  if (!fs.existsSync(src)) return 0;

  fs.mkdirSync(dest, { recursive: true });

  let written = 0;

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      written += copyRecursiveForce(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      written += 1;
    }
  }

  return written;
}

// Remove files/directories in `dest` that no longer exist in `src`. This keeps
// framework-owned directories a true mirror of the package, so renames and
// deletions (e.g. blueprint -> product-plan) don't leave stale artifacts behind.
// Returns the list of removed paths (relative to `dest`). When `dryRun` is true
// nothing is deleted — the stale paths are only collected and returned.
function pruneRecursive(src, dest, removed = [], relBase = "", dryRun = false) {
  if (!fs.existsSync(dest)) return removed;

  for (const entry of fs.readdirSync(dest, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    const relPath = relBase ? path.join(relBase, entry.name) : entry.name;

    if (!fs.existsSync(srcPath)) {
      // Gone from the package entirely — remove it from the project.
      if (!dryRun) {
        fs.rmSync(destPath, { recursive: true, force: true });
      }
      removed.push(relPath);
    } else if (entry.isDirectory()) {
      pruneRecursive(srcPath, destPath, removed, relPath, dryRun);
    }
  }

  return removed;
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

    // Refresh metadata (description, agent, gates, validators, flags) on commands
    // that already exist so wording changes ship with `sdrive update`. User-owned
    // fields are preserved; only the framework-owned metadata is overwritten.
    let updatedCommands = 0;
    for (const packaged of packagedManifest.commands || []) {
      const installed = installedManifest.commands.find((c) => c.command === packaged.command);
      if (!installed) continue;
      for (const key of ["agent", "agentFile", "description", "acceptsFeature", "acceptsAll", "gates", "validators"]) {
        if (packaged[key] === undefined) continue;
        if (JSON.stringify(installed[key]) !== JSON.stringify(packaged[key])) {
          installed[key] = packaged[key];
          updatedCommands += 1;
        }
      }
    }

    let installedPermissions;
    if ((addedCommands.length > 0 || updatedCommands > 0) && fs.existsSync(packagedPermissionsPath) && fs.existsSync(installedPermissionsPath)) {
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

    if (addedCommands.length > 0 || updatedCommands > 0) {
      fs.writeFileSync(installedManifestPath, JSON.stringify(installedManifest, null, 2));
      const parts = [];
      if (addedCommands.length > 0) parts.push(`${addedCommands.length} new command(s)`);
      if (updatedCommands > 0) parts.push(`${updatedCommands} metadata update(s)`);
      console.log(`  Updated: .sdrive/commands/manifest.json (${parts.join(", ")})`);
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

// Resolves the acting user for workflow-state history entries so the dashboard
// can attribute each action. Mirrors the Git-identity lookup used by
// check-permission.js, with an OS-username fallback.
function currentActor() {
  try {
    const name = execSync("git config user.name", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (name) return name;
  } catch (error) {
    // Not a git repo, or git is unavailable — fall through to the OS user.
  }

  return process.env.USERNAME || process.env.USER || "unknown";
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

// Absolute path to the SpecDrive MCP server entry point. Absolute paths keep the
// server resolvable regardless of the client's working directory.
function mcpServerPath() {
  return path.join(process.cwd(), ".sdrive", "mcp", "server.js");
}

// Each MCP client uses a different config schema. VS Code (GitHub Copilot) uses
// `servers` + an explicit `type`, while Claude Desktop / Cursor / Cline use
// `mcpServers`. Writing the wrong shape fails silently, so the shape is per-client.
const MCP_CLIENTS = {
  "Claude Desktop": {
    key: "mcpServers",
    entry: () => ({ command: "node", args: [mcpServerPath()] })
  },
  Cursor: {
    key: "mcpServers",
    entry: () => ({ command: "node", args: [mcpServerPath()] })
  },
  Cline: {
    key: "mcpServers",
    entry: () => ({ command: "node", args: [mcpServerPath()] })
  },
  "GitHub Copilot (VS Code)": {
    key: "servers",
    entry: () => ({ type: "stdio", command: "node", args: [mcpServerPath()] })
  }
};

// Maps a selected AI tool (from commands/tools.json) to the MCP clients that
// should be wired automatically. Tools without an MCP client are file-adapter only.
const TOOL_TO_MCP_CLIENTS = {
  "github-copilot": ["GitHub Copilot (VS Code)"],
  "vscode-native": ["GitHub Copilot (VS Code)"],
  "kilo-code": ["GitHub Copilot (VS Code)"],
  cursor: ["Cursor"],
  cline: ["Cline"],
  "claude-code": ["Claude Desktop"]
};

function mcpConfigContent(clientName) {
  const client = MCP_CLIENTS[clientName] || MCP_CLIENTS["Claude Desktop"];
  return JSON.stringify({ [client.key]: { specdrive: client.entry() } }, null, 2);
}

function safeMergeMcpConfig(configPath, clientName) {
  const client = MCP_CLIENTS[clientName] || MCP_CLIENTS["Claude Desktop"];

  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, mcpConfigContent(clientName));
    console.log(`✅ Created: ${configPath}`);
    return;
  }

  try {
    const existing = JSON.parse(fs.readFileSync(configPath, "utf8"));
    existing[client.key] = existing[client.key] || {};

    if (existing[client.key].specdrive) {
      console.log(`⚠️  SpecDrive already configured in ${configPath}`);
      return;
    }

    existing[client.key].specdrive = client.entry();

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
    name: "GitHub Copilot (VS Code)",
    path: path.join(process.cwd(), ".vscode", "mcp.json")
  });

  return paths;
}

// Wires every MCP client implied by the selected tools, without prompting.
function autoWireMcp(selectedTools) {
  const clientNames = new Set();

  selectedTools.forEach((tool) => {
    (TOOL_TO_MCP_CLIENTS[tool.name] || []).forEach((client) => clientNames.add(client));
  });

  if (clientNames.size === 0) return;

  const available = getMcpConfigPaths();
  const targets = available.filter((p) => clientNames.has(p.name));

  if (targets.length === 0) return;

  console.log("\n🔌 MCP Wiring\n");

  targets.forEach((p) => {
    safeMergeMcpConfig(p.path, p.name);
  });
}

// Detects whether the console can render Unicode block characters. Windows
// consoles default to legacy code pages (CP437/Windows-1252) that mangle them,
// so we fall back to an ASCII banner instead of printing garbage.
function supportsUnicodeBanner() {
  if (process.env.SDRIVE_ASCII === "1") return false;
  if (process.env.SDRIVE_UNICODE === "1") return true;

  if (process.platform !== "win32") return true;

  // Windows Terminal, VS Code, and ConEmu set WT_SESSION / TERM_PROGRAM.
  if (process.env.WT_SESSION || process.env.TERM_PROGRAM) return true;

  // Modern Windows consoles report a UTF-8 code page (65001).
  try {
    const { execSync } = require("child_process");
    const output = execSync("chcp", { stdio: ["ignore", "pipe", "ignore"] }).toString();
    return output.includes("65001");
  } catch (error) {
    return false;
  }
}

function printInitWelcome() {
  const useColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb");
  const reset = useColor ? "\u001b[0m" : "";
  const specColor = useColor ? "\u001b[1;96m" : "";
  const headingColor = useColor ? "\u001b[1m" : "";
  const taglineColor = useColor ? "\u001b[2m" : "";

  const unicodeLogo = [
    "  ███████╗██████╗ ███████╗ ██████╗██████╗ ██████╗ ██╗██╗   ██╗███████╗",
    "  ██╔════╝██╔══██╗██╔════╝██╔════╝██╔══██╗██╔══██╗██║██║   ██║██╔════╝",
    "  ███████╗██████╔╝█████╗  ██║     ██║  ██║██████╔╝██║██║   ██║█████╗  ",
    "  ╚════██║██╔═══╝ ██╔══╝  ██║     ██║  ██║██╔══██╗██║╚██╗ ██╔╝██╔══╝  ",
    "  ███████║██║     ███████╗╚██████╗██████╔╝██║  ██║██║ ╚████╔╝ ███████╗",
    "  ╚══════╝╚═╝     ╚══════╝ ╚═════╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝  ╚══════╝"
  ];

  const asciiLogo = [
    "   _____                 ____       _          ",
    "  / ____|               |  _ \\     (_)         ",
    " | (___  _ __   ___  ___| | | |_ __ _ ___  ___ ",
    "  \\___ \\| '_ \\ / _ \\/ __| | | | '__| / __|/ _ \\",
    "  ____) | |_) |  __/ (__| |_| | |  | \\__ \\  __/",
    " |_____/| .__/ \\___|\\___|____/|_|  |_|___/\\___|",
    "        | |                                    ",
    "        |_|                                    "
  ];

  const logo = supportsUnicodeBanner() ? unicodeLogo : asciiLogo;

  console.log("");
  logo.forEach((line) => console.log(`${specColor}${line}${reset}`));
  console.log("");
  console.log(`  ${taglineColor}Spec-driven development with built-in governance${reset}`);
  console.log(`  ${taglineColor}v${getCliVersion()}${reset}`);
  console.log("");
  console.log(`  ${headingColor}This setup will configure:${reset}`);
  console.log("  - SpecDrive project structure and governance");
  console.log("  - AI tool adapters and workflow commands");
  console.log("  - MCP connections for your selected AI tools (automatic)");
  console.log("");
}

// ---------- INIT COMMAND ----------
program
  .command("init")
  .description("Initialize SpecDrive structure and tool adapters")
  .option("--tools <list>", "Configure AI tools non-interactively. Use all, none, or a comma-separated list")
  .option("--no-dashboard", "Skip starting the web dashboard after init")
  .action((options) => {
    printInitWelcome();

    const projectRoot = process.cwd();
    const sdriveRoot = path.join(projectRoot, ".sdrive");

    // Every successful exit from `init` funnels through here, so the dashboard
    // auto-launch cannot be forgotten on one of the four completion paths.
    const finishInit = () => {
      console.log("\n✅ SpecDrive initialized successfully.");

      if (options.dashboard === false) {
        console.log("💡 Dashboard skipped (--no-dashboard). Start it with: sdrive dashboard");
        return;
      }

      launchDashboard();
    };

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

    // The dashboard serves the brand logo from .sdrive/logo.png, so it must be
    // copied alongside the dashboard files. Without this the logo 404s.
    const logoSource = path.join(packageRoot, "logo.png");
    const logoDest = path.join(sdriveRoot, "logo.png");
    if (fs.existsSync(logoSource) && !fs.existsSync(logoDest)) {
      fs.copyFileSync(logoSource, logoDest);
      console.log("  Copied: .sdrive/logo.png");
    }

    mergeBundledSlashCommands(packageRoot, sdriveRoot);

    const workflowStatePath = path.join(sdriveRoot, "workflow-state.json");
    if (!fs.existsSync(workflowStatePath)) {
      fs.writeFileSync(workflowStatePath, JSON.stringify({ features: [] }, null, 2));
      console.log("  Created: .sdrive/workflow-state.json");
    }

    // NOTE: `sdrive init` deliberately does NOT write a constitution. A stub
    // file would make the project look governed while saying nothing, and it
    // would silently satisfy the "constitution exists" checks. The real
    // constitution is authored by `/sdrive:constitution`, which interviews the
    // user and writes a meaningful document.
    const constitutionPath = path.join(sdriveRoot, "constitution.md");
    if (!fs.existsSync(constitutionPath)) {
      console.log("  Next: run /sdrive:constitution to author .sdrive/constitution.md");
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
      console.log("  ⚠️  team.json has no members. Gated commands (/sdrive:review, /sdrive:apply, etc.) will be denied.");
      console.log("      Run: sdrive team:add <your-git-username> admin");
    }

    const mcpConfigPath = path.join(sdriveRoot, "mcp", "mcp.json");
    if (!fs.existsSync(mcpConfigPath)) {
      fs.writeFileSync(mcpConfigPath, mcpConfigContent("Claude Desktop"));
      console.log("  Created: .sdrive/mcp/mcp.json");
    }

    const toolsPath = path.join(sdriveRoot, "commands", "tools.json");

    if (!fs.existsSync(toolsPath)) {
      console.log("\n⚠️  tools.json not found. Skipping tool selection.");
      finishInit();
      return;
    }

    const tools = JSON.parse(fs.readFileSync(toolsPath, "utf8")).tools;

    // Generates adapters for the selected tools and wires MCP automatically.
    const applySelection = (selectedTools) => {
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

      autoWireMcp(selectedTools);

      finishInit();
    };

    // Resolves a --tools value (all, none, or comma-separated names) to tool objects.
    const resolveToolsFlag = (value) => {
      const normalized = value.trim().toLowerCase();

      if (normalized === "all") return tools;
      if (normalized === "none" || normalized === "") return [];

      const requested = normalized.split(",").map((name) => name.trim()).filter(Boolean);
      const matched = [];
      const unknown = [];

      requested.forEach((name) => {
        const tool = tools.find((t) => t.name.toLowerCase() === name);
        if (tool) {
          matched.push(tool);
        } else {
          unknown.push(name);
        }
      });

      if (unknown.length > 0) {
        console.log(`\n⚠️  Unknown tool(s): ${unknown.join(", ")}`);
        console.log(`   Available: ${tools.map((t) => t.name).join(", ")}\n`);
      }

      return matched;
    };

    if (options.tools !== undefined) {
      const selectedTools = resolveToolsFlag(options.tools);

      if (selectedTools.length === 0) {
        console.log("\n⚠️  No tools selected. Skipping adapter generation.");
        finishInit();
        return;
      }

      applySelection(selectedTools);
      return;
    }

    console.log("\n🔧 Select your AI tool(s) (comma-separated numbers):\n");
    tools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name}`);
    });
    console.log("  Or press Enter to generate all.\n");
    console.log("  MCP wiring is applied automatically for the tools you pick.\n");

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

      applySelection(selectedTools);
    });
  });

// ---------- UPDATE COMMAND ----------
program
  .command("update")
  .description("Refresh SpecDrive framework files (dashboard, mcp, scripts, schemas) without touching your specs or governance")
  .option("--dry-run", "Show what would be updated without writing any files")
  .action((options) => {
    const projectRoot = process.cwd();
    const sdriveRoot = path.join(projectRoot, ".sdrive");

    if (!fs.existsSync(sdriveRoot)) {
      console.error("❌ No .sdrive folder found. Run `sdrive init` first.");
      process.exit(1);
    }

    const packageRoot = path.join(__dirname, "..");

    // Framework-owned directories: safe to overwrite because they contain code,
    // not user content. User data (specs, governance, constitution, config,
    // team, workflow-state) is deliberately excluded.
    const frameworkDirs = ["dashboard", "mcp", "scripts", "schemas", "agents", "templates"];

    console.log("\n🔄 SpecDrive Update\n");
    console.log(`   From: ${packageRoot}`);
    console.log(`   To:   ${sdriveRoot}\n`);

    if (options.dryRun) {
      console.log("   (dry run — no files will be written)\n");
    }

    let totalWritten = 0;
    let totalPruned = 0;

    frameworkDirs.forEach((dir) => {
      const srcDir = path.join(packageRoot, dir);
      const destDir = path.join(sdriveRoot, dir);

      if (!fs.existsSync(srcDir)) {
        console.log(`  ⚠️  Missing in package: ${dir}/`);
        return;
      }

      if (options.dryRun) {
        console.log(`  Would refresh: .sdrive/${dir}/`);
        const wouldPrune = pruneRecursive(srcDir, destDir, [], "", true);
        if (wouldPrune.length > 0) {
          console.log(`  Would remove ${wouldPrune.length} stale file${wouldPrune.length === 1 ? "" : "s"} from .sdrive/${dir}/:`);
          wouldPrune.forEach((rel) => console.log(`      - ${rel}`));
        }
        return;
      }

      const written = copyRecursiveForce(srcDir, destDir);
      totalWritten += written;

      // Prune files that no longer exist in the package so renames/deletions
      // don't leave stale artifacts (e.g. the old blueprint command).
      const pruned = pruneRecursive(srcDir, destDir, [], "", false);
      totalPruned += pruned.length;

      let line = `  ✅ Refreshed: .sdrive/${dir}/ (${written} file${written === 1 ? "" : "s"})`;
      if (pruned.length > 0) {
        line += `, removed ${pruned.length} stale`;
      }
      console.log(line);
      pruned.forEach((rel) => console.log(`      - removed ${rel}`));
    });

    // The logo is served by the dashboard, so keep it in sync too.
    const logoSource = path.join(packageRoot, "logo.png");
    const logoDest = path.join(sdriveRoot, "logo.png");
    if (fs.existsSync(logoSource)) {
      if (options.dryRun) {
        console.log("  Would refresh: .sdrive/logo.png");
      } else {
        fs.copyFileSync(logoSource, logoDest);
        totalWritten += 1;
        console.log("  ✅ Refreshed: .sdrive/logo.png");
      }
    }

    // Merge any new slash commands added since the project was initialized.
    if (!options.dryRun) {
      mergeBundledSlashCommands(packageRoot, sdriveRoot);
    }

    console.log("");
    if (options.dryRun) {
      console.log("✅ Dry run complete. Re-run without --dry-run to apply.\n");
    } else {
      let summary = `✅ SpecDrive updated (${totalWritten} file${totalWritten === 1 ? "" : "s"} refreshed`;
      if (totalPruned > 0) {
        summary += `, ${totalPruned} stale file${totalPruned === 1 ? "" : "s"} removed`;
      }
      summary += ").";
      console.log(summary);
      console.log("   Your specs, governance, and constitution were left untouched.\n");
    }
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
  .option("--version <version>", "Feature version to verify (defaults to the latest)")
  .action((feature, options) => {
    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "verify.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ verify.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const versionArg = options.version ? ` "${options.version}"` : "";

    try {
      execSync(`node "${scriptPath}" "${feature}"${versionArg}`, { stdio: "inherit" });
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

// ---------- UPDATE-PROPOSE COMMAND ----------
// Internal helper. Validates that a feature exists and is editable, then hands
// off to the Update Proposal agent (/sdrive:update-propose) to extend the spec.
program
  .command("update-propose <feature>")
  .description("Validate an existing feature for extension (usually run automatically by /sdrive:update-propose)")
  .action((feature) => {
    if (!/^[a-z0-9-]+$/.test(feature)) {
      console.error("❌ Feature name must be lowercase letters, numbers, and hyphens only.");
      process.exit(1);
    }

    const projectRoot = process.cwd();
    const sdriveRoot = path.join(projectRoot, ".sdrive");
    const workflowStatePath = path.join(sdriveRoot, "workflow-state.json");

    if (!fs.existsSync(workflowStatePath)) {
      console.error("❌ workflow-state.json not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const state = JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));
    const target = state.features?.find((f) => f.name === feature);

    if (!target) {
      console.error(`❌ Feature "${feature}" does not exist.`);
      console.error(`   Use /sdrive:propose "${feature}" to create it first.`);
      process.exit(1);
    }

    const version = target.currentVersion || "v1";
    const versionEntry = (target.versions || []).find((v) => v.id === version);

    if (versionEntry && versionEntry.phase === "completed") {
      console.error(`❌ Version "${version}" of "${feature}" is released and cannot be extended in place.`);
      console.error(`   Run \`sdrive version:new ${feature}\` to start a new version. It leaves the`);
      console.error("   released version and its record untouched.");
      process.exit(1);
    }

    const specDir = path.join(sdriveRoot, "specs", "backlog", feature, version);
    const ongoingSpecDir = path.join(sdriveRoot, "specs", "ongoing", feature, version);
    const resolvedSpecDir = fs.existsSync(specDir) ? specDir : ongoingSpecDir;

    if (!fs.existsSync(resolvedSpecDir)) {
      console.error(`❌ Spec folder not found for "${feature}" (${version}).`);
      console.error(`   Expected: .sdrive/specs/{backlog|ongoing}/${feature}/${version}/`);
      process.exit(1);
    }

    console.log(`\n📦 Feature: ${feature}`);
    console.log(`📄 Version: ${version}`);
    console.log(`📁 Spec: ${path.relative(projectRoot, resolvedSpecDir)}`);
    console.log("\n✅ Feature is valid for extension.");
    console.log("🤖 The AI tool should now read the Update Proposal agent instructions");
    console.log("   and extend the specification with the requested change.");
    console.log("⏸️  Remember to stop for human approval after the command completes.\n");
  });

// ---------- ASSIGN COMMAND ----------
program
  .command("assign <feature> <username>")
  .description("Assign a team member as the owner of a feature")
  .action((feature, username) => {
    const projectRoot = process.cwd();
    const sdriveRoot = path.join(projectRoot, ".sdrive");
    const workflowStatePath = path.join(sdriveRoot, "workflow-state.json");

    if (!fs.existsSync(workflowStatePath)) {
      console.error("❌ workflow-state.json not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const state = JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));
    const target = (state.features || []).find((f) => f.name === feature);

    if (!target) {
      console.error(`❌ Feature "${feature}" not found in workflow-state.json.`);
      process.exit(1);
    }

    // Warn (but don't block) if the username isn't on the team roster.
    const teamPath = path.join(sdriveRoot, "team.json");
    if (fs.existsSync(teamPath)) {
      const team = JSON.parse(fs.readFileSync(teamPath, "utf8"));
      const known = (team.members || []).some((m) => m.username === username);
      if (!known) {
        console.warn(`⚠️  "${username}" is not in team.json. Assigning anyway.`);
      }
    }

    target.assignee = username;
    fs.writeFileSync(workflowStatePath, JSON.stringify(state, null, 2));

    audit("feature_assigned", { feature, assignee: username });
    console.log(`✅ Feature "${feature}" assigned to "${username}".`);
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
  .command("approve <feature> <gate>")
  .description("Approve a workflow gate (specification, planning, implementation, review)")
  .action((featureName, gate) => {
    requirePermission("approve");

    const {
      GATE_ORDER,
      checkGateRequirements,
      findFeature,
      resolveVersion
    } = require("../commands/gates");

    if (!GATE_ORDER.includes(gate)) {
      console.error(`❌ Invalid gate "${gate}". Allowed: ${GATE_ORDER.join(", ")}`);
      process.exit(1);
    }

    const projectRoot = process.cwd();
    const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");

    if (!fs.existsSync(workflowStatePath)) {
      console.error("❌ workflow-state.json not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const state = JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));

    // The feature is explicit. NEVER fall back to state.features[0] - approving
    // the wrong feature writes a false record while reporting success.
    const feature = findFeature(state, featureName);

    if (!feature) {
      console.error(`❌ Feature "${featureName}" not found.`);

      const known = (state.features || []).map((f) => f.name);

      if (known.length > 0) {
        console.error(`   Known features: ${known.join(", ")}`);
      }

      process.exit(1);
    }

    const version = resolveVersion(feature);

    if (!version) {
      console.error(`❌ Feature "${featureName}" has no versions.`);
      process.exit(1);
    }

    version.gates = version.gates || {};

    // Verify BEFORE writing anything. A gate may only be approved when the work
    // it certifies actually exists.
    const { ok, blockers, warnings, current } = checkGateRequirements(
      projectRoot,
      feature,
      version,
      gate
    );

    warnings.forEach((warning) => console.warn(`⚠️  ${warning}`));

    if (!ok) {
      console.error(`\n❌ Refusing to approve "${gate}" for "${featureName}" version "${version.id}".`);

      blockers.forEach((blocker) => console.error(`   • ${blocker}`));

      console.error("\nNothing was written. Approving an unmet gate would falsify the governance record.\n");
      process.exit(1);
    }

    if (current === "approved") {
      console.log(`\n✅ Gate "${gate}" is already approved for "${featureName}" version "${version.id}". Nothing changed.\n`);
      return;
    }

    const actor = currentActor();

    version.gates[gate] = "approved";
    version.history = version.history || [];
    version.history.push({
      event: `${gate}_approved`,
      // `by` is the schema's field; `actor` is retained for existing readers.
      by: actor,
      actor,
      previousValue: current || "pending",
      timestamp: new Date().toISOString()
    });

    fs.writeFileSync(workflowStatePath, JSON.stringify(state, null, 2));
    audit("gate_approved", {
      feature: feature.name,
      version: version.id,
      gate,
      previousValue: current || "pending"
    });

    console.log(`\n✅ Gate "${gate}" approved for feature "${feature.name}" version "${version.id}".`);
    console.log(`   "${current || "pending"}" → "approved"`);
    console.log("");
  });

// ---------- ARCHIVE COMMANDS ----------
// Approving a gate and closing a lifecycle are separate acts. `sdrive approve` checks
// the evidence and writes the approval; these close the record. Neither will grant an
// approval that does not already exist, so a feature that was never tested or reviewed
// cannot be recorded as archived. See commands/archive.js for the reasoning.
program
  .command("archive:check <feature>")
  .description("Report whether a feature may be archived. Changes nothing")
  .action((featureName) => {
    requirePermission("archive:check");

    const { checkArchivable } = require("../commands/archive");
    const verdict = checkArchivable(process.cwd(), featureName);

    verdict.warnings.forEach((warning) => console.warn(`⚠️  ${warning}`));

    if (verdict.alreadyFinalized) {
      console.log(
        `\n✅ "${featureName}" is already finalized - ${verdict.version.id} is in specs/completed/.\n`
      );
      return;
    }

    if (!verdict.ok) {
      console.error(`\n❌ "${featureName}" cannot be archived yet.`);
      verdict.blockers.forEach((blocker) => console.error(`   • ${blocker}`));
      console.error("");
      process.exit(1);
    }

    console.log(`\n✅ "${featureName}" ${verdict.version.id} is archivable.`);
    console.log("   All four gates are approved and the evidence behind them is still present.");
    console.log("");
  });

program
  .command("archive:finalize <feature>")
  .description(
    "Close a feature's lifecycle: move its spec to completed/ and mark the version completed. Refuses unless every gate is already approved"
  )
  .option("--merge-commit <sha>", "Record the merge commit in the feature history")
  .action((featureName, options) => {
    requirePermission("archive:finalize");

    const { finalizeArchive } = require("../commands/archive");
    const result = finalizeArchive(process.cwd(), featureName, {
      actor: currentActor(),
      mergeCommit: options.mergeCommit
    });

    result.warnings.forEach((warning) => console.warn(`⚠️  ${warning}`));

    if (result.alreadyFinalized) {
      console.log(`\n✅ "${featureName}" is already finalized. Nothing changed.\n`);
      return;
    }

    if (!result.ok) {
      console.error(`\n❌ Refusing to finalize "${featureName}".`);
      result.blockers.forEach((blocker) => console.error(`   • ${blocker}`));
      console.error(
        "\nNothing was written. A lifecycle may only be closed on approvals that already exist.\n"
      );
      process.exit(1);
    }

    audit("feature_archived", { feature: featureName, version: result.version });

    console.log(`\n✅ Feature "${featureName}" finalized (${result.version}).`);
    console.log(
      `   Spec moved: specs/${result.from}/${featureName} → specs/completed/${featureName}`
    );
    console.log("   Governance left in place at .sdrive/governance/<feature>/<version>/.");
    console.log("   Commit the move, then let /sdrive:archive delete the branch.\n");
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
  .option("--version <version>", "Feature version to read (defaults to the latest)")
  .action((feature, options) => {
    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "generate-openapi.js");

    if (!fs.existsSync(scriptPath)) {
      console.error("❌ generate-openapi.js not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const versionArg = options.version ? ` "${options.version}"` : "";

    try {
      execSync(`node "${scriptPath}" "${feature}"${versionArg}`, { stdio: "inherit" });
    } catch (error) {
      console.error("❌ OpenAPI generation failed.");
      process.exit(1);
    }
  });

// ---------- DASHBOARD ----------
// The dashboard is a server, so it runs until the user stops it. Ctrl+C is a
// normal way to stop it, not a failure: execSync reports it as a throw carrying
// signal SIGINT, and printing "failed to start" there would simply be untrue.
function runDashboardForeground(scriptPath) {
  try {
    execSync(`node "${scriptPath}"`, { stdio: "inherit" });
    return { ok: true, stoppedByUser: false };
  } catch (error) {
    // Ctrl+C is a normal way to stop a server, not a crash, and each platform
    // reports it differently:
    //   - POSIX surfaces a signal (SIGINT/SIGTERM) with a null status.
    //   - Windows has no signals; the process dies with 130, or with
    //     0xC000013A (STATUS_CONTROL_C_EXIT) under PowerShell/cmd. That code is
    //     handed back SIGNED by shells (-1073741510) but UNSIGNED by Node's
    //     execSync (3221225786), so the comparison is made on the unsigned
    //     32-bit value and cares about neither form.
    // A genuine crash exits with some other numeric status, so it still reaches
    // the caller as a failure.
    const CTRL_C_STATUS = 0xc000013a;
    const stopped =
      error.signal ||
      error.status === 130 ||
      (error.status >>> 0) === CTRL_C_STATUS ||
      error.status === null;

    return stopped ? { ok: true, stoppedByUser: true } : { ok: false, error };
  }
}

function dashboardScriptPath() {
  const scriptPath = path.join(process.cwd(), ".sdrive", "dashboard", "server.js");
  return fs.existsSync(scriptPath) ? scriptPath : null;
}

// Auto-launch after `init` / `onboard` so a new project has something to look at
// immediately. A server that never exits is the wrong default in the wrong
// context, so this refuses to start without an interactive terminal (a script or
// CI run would hang forever) and honours SDRIVE_NO_DASHBOARD.
function launchDashboard() {
  const disabled =
    process.env.SDRIVE_NO_DASHBOARD === "1" || process.env.SDRIVE_NO_DASHBOARD === "true";

  if (disabled) {
    console.log("💡 Dashboard skipped (SDRIVE_NO_DASHBOARD is set). Start it with: sdrive dashboard");
    return;
  }

  if (!process.stdout.isTTY) {
    console.log("💡 Dashboard not started (no interactive terminal). Start it with: sdrive dashboard");
    return;
  }

  const scriptPath = dashboardScriptPath();
  if (!scriptPath) {
    console.log("💡 Dashboard not found in .sdrive/dashboard/. Start it with: sdrive dashboard");
    return;
  }

  console.log("\n📊 Starting the SpecDrive dashboard in this terminal.");
  console.log("   Press Ctrl+C when you are done to get your prompt back.\n");

  const result = runDashboardForeground(scriptPath);

  if (result.stoppedByUser) {
    console.log("\n📊 Dashboard stopped.");
  } else if (!result.ok) {
    console.error("⚠️  Dashboard exited unexpectedly. Run `sdrive dashboard` to retry.");
  }
}

program
  .command("dashboard")
  .description("Start SpecDrive web dashboard")
  .action(() => {
    const scriptPath = dashboardScriptPath();

    if (!scriptPath) {
      console.error("❌ Dashboard not found. Run `sdrive init` first.");
      process.exit(1);
    }

    const result = runDashboardForeground(scriptPath);

    if (result.stoppedByUser) {
      console.log("\n📊 Dashboard stopped.");
      return;
    }

    if (!result.ok) {
      console.error("❌ Dashboard failed to start.");
      process.exit(1);
    }
  });

// ---------- AMEND BRANCH HANDLING ----------
// Amending is a LIFECYCLE operation (completed/ -> ongoing/), never a branching
// one: this helper never creates a branch on its own. But `archive` deletes the
// feature branch, so an amended feature usually has nowhere to live. So we ask
// where the amended work should happen AND which branch to base it on.
function makeGitRunner() {
  return (cmd) =>
    execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

// Resolve the repository's default branch. Never assume `main`.
function resolveDefaultBranch(run) {
  try {
    const ref = run("git symbolic-ref refs/remotes/origin/HEAD --short");
    if (ref) return ref.replace(/^origin\//, "");
  } catch (error) {
    // no remote HEAD symref — fall through
  }

  try {
    const name = run("gh repo view --json defaultBranchRef --jq .defaultBranchRef.name");
    if (name) return name;
  } catch (error) {
    // gh unavailable or not authenticated — fall through
  }

  try {
    return run("git rev-parse --abbrev-ref HEAD");
  } catch (error) {
    return "";
  }
}

function isValidBranchName(name) {
  return typeof name === "string" && /^[A-Za-z0-9._/-]+$/.test(name);
}

function branchExists(run, name) {
  try {
    run(`git rev-parse --verify --quiet "${name}"`);
    return true;
  } catch (error) {
    try {
      run(`git rev-parse --verify --quiet "origin/${name}"`);
      return true;
    } catch (innerError) {
      return false;
    }
  }
}

function resolveAmendBranch(feature, options) {
  const run = makeGitRunner();

  try {
    run("git rev-parse --is-inside-work-tree");
  } catch (error) {
    console.log("⚠️  Not a Git repository. Skipping branch handling.");
    return null;
  }

  // Refresh the remote-tracking refs before probing anything. Both the "does this
  // branch still exist" check and the base invariant below are only trustworthy if
  // they describe the remote as it is NOW, not as it was the last time someone
  // happened to fetch.
  let remotes = [];

  try {
    remotes = run("git remote").split(/\s+/).filter(Boolean);
  } catch (error) {
    remotes = [];
  }

  if (remotes.includes("origin")) {
    try {
      run("git fetch origin --prune");
    } catch (error) {
      console.log("⚠️  Could not fetch from origin (offline?). Using local refs.");
    }
  }

  let currentBranch = "";
  try {
    currentBranch = run("git rev-parse --abbrev-ref HEAD");
  } catch (error) {
    currentBranch = "";
  }

  const defaultBranch = resolveDefaultBranch(run);
  const defaultName = `feature/${feature}`;
  const stay = () => {
    console.log(
      `ℹ️  Staying on the current branch${currentBranch ? ` (${currentBranch})` : ""}.`
    );
    return null;
  };

  if (options.stay) return stay();

  // Explicit --branch: no prompt. Base on --base when given, otherwise the
  // detected default branch (the merged feature's code lives there).
  if (typeof options.branch === "string" && options.branch.length > 0) {
    const base =
      (typeof options.base === "string" && options.base.length > 0 && options.base) ||
      defaultBranch ||
      currentBranch;

    if (base && currentBranch && base !== currentBranch) {
      console.log(
        `ℹ️  Note: basing "${options.branch}" on "${base}" (current branch is "${currentBranch}").`
      );
    }

    return { explicit: options.branch, base, defaultBranch, currentBranch };
  }

  if (options.branch === true) {
    return {
      explicit: defaultName,
      base: defaultBranch || currentBranch,
      defaultBranch,
      currentBranch
    };
  }

  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (!interactive) {
    console.log("ℹ️  Non-interactive session: staying on the current branch.");
    console.log(`   Re-run with \`--branch ${defaultName}\` to create one.`);
    return null;
  }

  return { defaultName, currentBranch, defaultBranch };
}

async function promptAmendBranch(feature, defaultName, currentBranch) {
  const rl = require("readline/promises").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await rl.question(
      `\nWhich branch should the amended work happen on?\n` +
        `  1) Create or switch to "${defaultName}" (recommended)\n` +
        `  2) Stay on the current branch${currentBranch ? ` (${currentBranch})` : ""}\n` +
        `Choose [1/2]: `
    );
    return (answer || "").trim().toLowerCase();
  } finally {
    rl.close();
  }
}

// Ask which branch the NEW feature branch should be based on. The merged feature's
// code now lives on the target/default branch, so that is the recommended base.
async function promptAmendBase(defaultBranch, currentBranch) {
  const choices = [];
  if (defaultBranch) choices.push(defaultBranch);
  if (currentBranch && currentBranch !== defaultBranch) choices.push(currentBranch);

  if (choices.length === 0) return "";

  const lines = ["\nBase the new branch on which branch?"];
  choices.forEach((name, index) => {
    lines.push(`  ${index + 1}) "${name}"${index === 0 ? " (recommended)" : ""}`);
  });
  lines.push(`  ${choices.length + 1}) Another branch — type its name`);

  const rl = require("readline/promises").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = (
      await rl.question(lines.join("\n") + `\nChoose [1-${choices.length + 1}]: `)
    ).trim();

    const index = Number.parseInt(answer, 10);

    if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
      return choices[index - 1];
    }

    if (index === choices.length + 1) {
      return (await rl.question("Branch name: ")).trim();
    }

    return choices[0];
  } finally {
    rl.close();
  }
}

// Is `branch` already an ancestor of `into`? If so it is a SPENT branch: its commits
// are already in the integration branch, so putting new work on it re-opens a finished
// review and can re-merge content that has already landed.
function isMergedInto(run, branch, into) {
  if (!branch || !into) return false;

  for (const anchor of [into, `origin/${into}`]) {
    try {
      run(`git merge-base --is-ancestor "${branch}" "${anchor}"`);
      return true;
    } catch (error) {
      // not an ancestor of this ref - try the next one
    }
  }

  return false;
}

// CON-607: a feature branch is `feature/<name>`, and on collision it takes the next
// free `-v2`, `-v3`, ... suffix. Amend needs this because the branch that was just
// archived may still exist, and a merged branch must never be reused.
function nextAvailableBranchName(run, preferred) {
  if (!branchExists(run, preferred)) return preferred;

  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${preferred}-v${index}`;

    if (!branchExists(run, candidate)) return candidate;
  }

  return "";
}

// CON-612: the branch must not carry commits the base does not have. Verifying it is
// the whole point - asking for a base is not evidence that the base was used.
function verifyBaseInvariant(run, base, branch) {
  if (!base) return true;

  try {
    const ahead = run(`git log "${base}..${branch}" --oneline`);
    const lines = ahead ? ahead.split("\n").filter(Boolean) : [];

    if (lines.length === 0) {
      console.log(
        `✅ Base invariant (CON-612) holds: "${branch}" has no commits outside "${base}".`
      );
      return true;
    }

    console.log(
      `⚠️  Base invariant (CON-612) is violated: "${branch}" carries commits not on "${base}":`
    );
    lines.slice(0, 10).forEach((line) => console.log(`     ${line}`));

    if (lines.length > 10) {
      console.log(`     ...and ${lines.length - 10} more.`);
    }

    console.log(
      `   Merge "${base}" into "${branch}" before continuing, or recreate the branch from it.`
    );
    return false;
  } catch (error) {
    return true;
  }
}

function applyAmendBranch(feature, target, base, defaultBranch) {
  // Guard against shell injection through a user-supplied branch name.
  if (!isValidBranchName(target)) {
    console.error(`❌ Invalid branch name "${target}". Amended without branch changes.`);
    return null;
  }

  const integration = defaultBranch || "";
  let workBranch = target;

  // CON-608: never implement on the default or a protected branch. Amended work on
  // the integration branch itself steps around every review boundary the framework
  // has, so it is refused rather than warned about.
  if (integration && workBranch === integration) {
    console.error(`❌ Refusing to amend work on "${workBranch}" (CON-608).`);
    console.error("   That is the integration branch - amended work needs its own branch.");
    console.error(`   Re-run with \`--branch feature/${feature}\`.`);
    console.error("   The feature was still amended; you remain on the previous branch.");
    return null;
  }

  if (base && workBranch === base) {
    console.error(
      `❌ A branch cannot be based on itself ("${workBranch}"). Amended without branch changes.`
    );
    return null;
  }

  if (base && !isValidBranchName(base)) {
    console.error(`❌ Invalid base branch "${base}". Amended without branch changes.`);
    return null;
  }

  const run = makeGitRunner();

  if (branchExists(run, workBranch)) {
    if (integration && isMergedInto(run, workBranch, integration)) {
      // CON-607 + CON-610: merged branches are disposable. Reusing one is how
      // already-landed work gets merged a second time, so take a fresh name.
      const replacement = nextAvailableBranchName(run, workBranch);

      if (!replacement) {
        console.error(
          `❌ "${workBranch}" is already merged and no free "-vN" name was found.`
        );
        console.error("   The feature was still amended; you remain on the previous branch.");
        return null;
      }

      console.log(
        `ℹ️  "${workBranch}" is already merged into "${integration}" - not reusing it.`
      );
      console.log(`   Using "${replacement}" instead (CON-607).`);
      workBranch = replacement;
    } else {
      try {
        execSync(`git checkout "${workBranch}"`, { stdio: "inherit" });
        console.log(`✅ Switched to existing branch "${workBranch}".`);
        verifyBaseInvariant(run, base || integration, workBranch);
        // Record the base alongside the branch. Archive recommends the branch this one
        // was cut from, because CON-612 requires base == merge target - so the base is
        // the exact answer, not a proxy for it.
        return { branch: workBranch, base: base || integration || "" };
      } catch (error) {
        console.error(`❌ Could not switch to "${workBranch}".`);
        console.error("   The feature was still amended; you remain on the previous branch.");
        return null;
      }
    }
  }

  // Switching to an existing branch needs no base; creating one does.
  try {
    if (base) {
      let onBase = false;
      try {
        onBase = run("git rev-parse --abbrev-ref HEAD") === base;
      } catch (error) {
        onBase = false;
      }

      if (!onBase) {
        execSync(`git checkout "${base}"`, { stdio: "inherit" });
      }

      // Bring the base up to date even when we were ALREADY on it. Cutting the new
      // branch from a stale base makes the invariant below a half-truth the moment
      // the remote has moved on.
      try {
        execSync(`git pull origin "${base}"`, { stdio: "inherit" });
      } catch (error) {
        console.log(`⚠️  Could not pull "${base}" (offline or no upstream). Continuing.`);
      }

      execSync(`git checkout -b "${workBranch}"`, { stdio: "inherit" });
      console.log(`✅ Created branch "${workBranch}" from "${base}".`);
    } else {
      execSync(`git checkout -b "${workBranch}"`, { stdio: "inherit" });
      console.log(`✅ Created branch "${workBranch}" from the current branch.`);
    }

    verifyBaseInvariant(run, base, workBranch);
    return { branch: workBranch, base: base || "" };
  } catch (error) {
    console.error(`❌ Could not create branch "${workBranch}".`);
    console.error("   The feature was still amended; you remain on the previous branch.");
    return null;
  }
}

async function handleAmendBranch(feature, options) {
  const resolved = resolveAmendBranch(feature, options);

  if (resolved === null) return null;

  if (resolved.explicit) {
    return applyAmendBranch(
      feature,
      resolved.explicit,
      resolved.base,
      resolved.defaultBranch
    );
  }

  const choice = await promptAmendBranch(
    feature,
    resolved.defaultName,
    resolved.currentBranch
  );

  if (choice !== "1" && choice !== "y" && choice !== "yes" && choice !== "") {
    console.log(
      `ℹ️  Staying on the current branch${resolved.currentBranch ? ` (${resolved.currentBranch})` : ""}.`
    );
    return null;
  }

  if (!resolved.defaultBranch) {
    console.log("⚠️  Could not resolve the repository's default branch.");
  } else if (resolved.currentBranch && resolved.currentBranch !== resolved.defaultBranch) {
    console.log(
      `⚠️  You are on "${resolved.currentBranch}", not the default branch ` +
        `("${resolved.defaultBranch}"). Amended work should start from the branch ` +
        `that already contains the merged feature.`
    );
  }

  const base = await promptAmendBase(resolved.defaultBranch, resolved.currentBranch);

  return applyAmendBranch(feature, resolved.defaultName, base, resolved.defaultBranch);
}

// ---------- AMEND ----------
// An amendment is a CORRECTIVE ACTION, not a way to get back to work. It exists for
// exactly one case: a feature whose lifecycle was closed WRONGLY - shipped without the
// tests or review its acceptance criteria required, or archived by mistake.
//
// The version is the same piece of work, so issuing a new version for that would be a
// false record: it would attach v1's proofs to a version nobody ever shipped. Amending
// the record is what makes v1's history true.
//
// Changing or extending a RELEASED feature is CHANGE CONTROL, and that is
// `sdrive version:new`, which never touches the released version or its record.
program
  .command("amend <feature>")
  .description("Reopen a wrongly-closed feature to correct its record (corrective action, not new scope)")
  .option(
    "-b, --branch [name]",
    "Create the amended work on this branch (default: feature/<feature>). A merged branch is never reused - CON-607 adds a -v2 suffix instead"
  )
  .option("--base [name]", "Base the new branch on this branch (skips the base prompt)")
  .option("--stay", "Stay on the current branch (do not create or switch)")
  .option("--reason <text>", "Required. Why the original closure was wrong - recorded in the feature history")
  .action(async (feature, options) => {
    requirePermission("amend");

    const reason = String(options.reason || "").trim();

    if (!reason) {
      console.error("❌ An amendment needs a reason.");
      console.error(`   Usage: sdrive amend ${feature} --reason "why the closure was wrong"`);
      console.error("   The reason IS the record: without it, re-opening a closed lifecycle");
      console.error("   is indistinguishable from editing history.");
      console.error("");
      console.error(`   To CHANGE a released feature instead, run \`sdrive version:new ${feature}\`.`);
      process.exit(1);
    }

    const projectRoot = process.cwd();
    const sdriveRoot = path.join(projectRoot, ".sdrive");
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
    const versionId = currentVersion ? currentVersion.id : "v1";

    const completedFeatureDir = path.join(sdriveRoot, "specs", "completed", feature);
    const completedVersionDir = path.join(completedFeatureDir, versionId);
    const ongoingFeatureDir = path.join(sdriveRoot, "specs", "ongoing", feature);
    const ongoingVersionDir = path.join(ongoingFeatureDir, versionId);

    // An amendment corrects a CLOSED record. If nothing was closed, this is the wrong
    // command - more work on an in-flight feature is just more work.
    const looksClosed =
      (currentVersion && currentVersion.phase === "completed") ||
      fs.existsSync(completedVersionDir);

    if (!looksClosed) {
      console.error(
        `❌ "${feature}" ${versionId} does not look closed: phase is "${currentVersion ? currentVersion.phase : "unknown"}" and its spec is not in specs/completed/.`
      );
      console.error("   Amend is a corrective action on a closed lifecycle.");
      console.error("   For more work on a released feature, run `sdrive version:new " + feature + "`.");
      process.exit(1);
    }

    // Only THIS version's folder moves. Other versions stay in specs/completed/, so
    // amending v2 never reads or rewrites a released v1.
    if (fs.existsSync(completedVersionDir)) {
      fs.mkdirSync(ongoingFeatureDir, { recursive: true });
      fs.renameSync(completedVersionDir, ongoingVersionDir);
      console.log(`✅ Moved spec: completed/${feature}/${versionId} → ongoing/${feature}/${versionId}`);

      if (!fs.existsSync(ongoingVersionDir)) {
        console.error("❌ The spec folder did not move as expected. The lifecycle was left unchanged.");
        process.exit(1);
      }

      // Drop the released feature folder only when this was its last version.
      try {
        if (fs.readdirSync(completedFeatureDir).length === 0) {
          fs.rmdirSync(completedFeatureDir);
        }
      } catch (error) {
        // An empty folder left behind is not a false record.
      }
    } else if (!fs.existsSync(ongoingVersionDir)) {
      console.error(
        `❌ Version "${versionId}" of "${feature}" is in neither specs/completed/ nor specs/ongoing/.`
      );
      process.exit(1);
    }

    // Only the VERDICT is stale. The spec, plan and implementation were true when they
    // were approved and the code has not changed, so review is what has to be re-earned.
    // The reason is recorded because that is the entire point of a corrective action.
    if (currentVersion) {
      currentVersion.phase = "ongoing";
      currentVersion.gates = currentVersion.gates || {};
      currentVersion.gates.review = "pending";
      currentVersion.currentStep = "review";

      currentVersion.history = currentVersion.history || [];
      currentVersion.history.push({
        event: "feature_amended",
        reason,
        actor: currentActor(),
        timestamp: new Date().toISOString()
      });
    }

    fs.writeFileSync(workflowStatePath, JSON.stringify(state, null, 2));

    console.log(`✅ Feature "${feature}" amended (${versionId}).`);
    console.log(`   Reason: ${reason}`);
    console.log("   Review gate reset to pending. Specification, planning and implementation remain approved.");
    console.log("   Next: /sdrive:test, then /sdrive:review, then /sdrive:archive.");

    const applied = await handleAmendBranch(feature, options);

    // Record the branch AND the base on the feature. Archive recommends the recorded
    // base first: CON-612 requires a feature branch to be based on the branch it will
    // merge into, so the base is the target, not an assumption about it.
    if (applied && applied.branch) {
      const freshState = JSON.parse(fs.readFileSync(workflowStatePath, "utf8"));
      const freshTarget = freshState.features?.find((f) => f.name === feature);

      if (freshTarget) {
        freshTarget.branch = applied.branch;

        if (applied.base) {
          freshTarget.base = applied.base;
        }

        fs.writeFileSync(workflowStatePath, JSON.stringify(freshState, null, 2));
        console.log(
          `✅ Recorded branch "${applied.branch}"${applied.base ? ` (base "${applied.base}")` : ""} on feature "${feature}".`
        );
      }
    }
  });

// Deprecated alias. `reopen` was renamed to `amend` because the old name invited
// "reopen a shipped feature" as a way to do MORE WORK, which is what `version:new` is
// for. It deliberately does not run the old behaviour, and `{ hidden: true }` keeps it
// out of --help. (Do NOT use the 3-arg `command(name, description, opts)` form here -
// a string description makes commander treat it as an executable subcommand.)
program
  .command("reopen <feature>", { hidden: true })
  .description("Deprecated - renamed to `amend`")
  .allowUnknownOption()
  .action(() => {
    console.error("❌ `sdrive reopen` was renamed to `sdrive amend`.");
    console.error("");
    console.error("   `amend`  = corrective action on a wrongly-closed record (same version).");
    console.error("   `version:new` = new work on a released feature (new version).");
    process.exit(1);
  });

// ---------- ONBOARD COMMAND ----------
// Internal helper. Usually run automatically by the Onboarding Agent.
program
  .command("onboard")
  .description("Scan an existing project for onboarding (usually run automatically by /sdrive:onboard)")
  .option("--no-dashboard", "Skip starting the web dashboard after the scan")
  .action((options) => {
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

      if (options.dashboard === false) {
        console.log("💡 Dashboard skipped (--no-dashboard). Start it with: sdrive dashboard");
        return;
      }

      launchDashboard();
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