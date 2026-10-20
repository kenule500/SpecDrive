#!/usr/bin/env node

const { Command } = require("commander");
const { execSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");
const readline = require("readline");

const output = require("./lib/output");
const { EXIT } = require("./lib/exit");
const stateStore = require("./lib/state");
const permissions = require("./lib/permissions");
const manifest = require("./lib/manifest");
const evidence = require("./lib/evidence");
const doctor = require("./lib/doctor");
const auditLog = require("./lib/audit");
const execute = require("./lib/execute");
const migrations = require("../migrations");
const migrationApply = require("../migrations/lib/apply");
const migrationLifecycle = require("../migrations/lib/lifecycle");

// Shared with `scripts/generate-adapters.js` and the tests so `init`,
// `update`, and `adapters:*` can never disagree about what a tool needs.
const {
  addTool: addRegistryTool,
  loadCommands,
  loadRegistry,
  toPosix,
  validateRegistry,
  writeAdapters
} = require("../scripts/lib/tool-registry");

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

// Refresh the rules layer (`commands/*.js`) without touching the three registry
// files that `update` merges instead of replacing (manifest.json,
// permissions.json, tools.json). Before this existed, a fix to gates.js or
// archive.js never reached an existing project.
function refreshCommandModules(packageRoot, sdriveRoot) {
  const srcDir = path.join(packageRoot, "commands");
  const destDir = path.join(sdriveRoot, "commands");

  if (!fs.existsSync(srcDir)) return { written: 0, backedUp: [] };

  fs.mkdirSync(destDir, { recursive: true });

  const backupDir = path.join(sdriveRoot, ".backups", "commands");
  const backedUp = [];
  let written = 0;

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name) !== ".js") continue;

    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    const incoming = fs.readFileSync(src);

    if (fs.existsSync(dest)) {
      const current = fs.readFileSync(dest);

      if (current.equals(incoming)) continue;

      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.copyFileSync(dest, path.join(backupDir, `${entry.name}.${stamp}`));
      backedUp.push(entry.name);
    }

    fs.copyFileSync(src, dest);
    written += 1;
  }

  return { written, backedUp };
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
    let addedCliRules = 0;

    if (fs.existsSync(packagedPermissionsPath) && fs.existsSync(installedPermissionsPath)) {
      const packagedPermissions = JSON.parse(fs.readFileSync(packagedPermissionsPath, "utf8"));
      installedPermissions = JSON.parse(fs.readFileSync(installedPermissionsPath, "utf8"));
      installedPermissions.rules = installedPermissions.rules || {};
      installedPermissions.cli = installedPermissions.cli || {};

      for (const command of addedCommands) {
        const roles = packagedPermissions.rules?.[command.command];
        if (roles && !installedPermissions.rules[command.command]) {
          installedPermissions.rules[command.command] = roles;
        }
      }

      // New CLI commands need rules too, or `sdrive update` would install a
      // command that is deny-by-default and therefore unusable. Existing rules
      // are preserved: they may carry a team's own role choices.
      for (const [command, roles] of Object.entries(packagedPermissions.cli || {})) {
        if (!installedPermissions.cli[command]) {
          installedPermissions.cli[command] = roles;
          addedCliRules += 1;
        }
      }
    }

    if (installedPermissions) {
      fs.writeFileSync(installedPermissionsPath, JSON.stringify(installedPermissions, null, 2));
      if (addedCliRules > 0) {
        console.log(`  Updated: .sdrive/commands/permissions.json (${addedCliRules} new CLI rule(s))`);
      }
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

  mergeBundledToolRegistry(packageRoot, sdriveRoot);
}

// Adds tools that shipped after the project was initialized without touching the
// entries it already has - a user may have corrected a path or added their own
// tool, and `sdrive update` must not undo that.
//
// The one exception is a v1 entry: registry 1.0.0 described a tool as a single
// `adapterPath` string, which is exactly how Cursor, Gemini, Qwen and VS Code
// ended up pointing at files their tool never reads. No v1 entry can be a user
// correction of the v2 shape (the field did not exist), so upgrading it in place
// is safe - and it is the only way those fixes reach a project that already ran
// `sdrive init`.
function mergeBundledToolRegistry(packageRoot, sdriveRoot) {
  const packagedPath = path.join(packageRoot, "commands", "tools.json");
  const installedPath = path.join(sdriveRoot, "commands", "tools.json");

  if (!fs.existsSync(packagedPath) || !fs.existsSync(installedPath)) return;

  try {
    const packaged = JSON.parse(fs.readFileSync(packagedPath, "utf8"));
    const installed = JSON.parse(fs.readFileSync(installedPath, "utf8"));
    installed.tools = Array.isArray(installed.tools) ? installed.tools : [];

    const installedMajor = Number(String(installed.version || "1.0.0").split(".")[0]);
    const packagedMajor = Number(String(packaged.version || "2.0.0").split(".")[0]);
    let upgraded = 0;

    if (installedMajor < packagedMajor) {
      (packaged.tools || []).forEach((tool) => {
        const index = installed.tools.findIndex((candidate) => candidate.name === tool.name);
        if (index === -1) return;
        if (!installed.tools[index].adapterPath) return;
        installed.tools[index] = tool;
        upgraded += 1;
      });
    }

    const known = new Set(installed.tools.map((tool) => tool.name));
    const added = (packaged.tools || []).filter((tool) => {
      if (known.has(tool.name)) return false;
      known.add(tool.name);
      installed.tools.push(tool);
      return true;
    });

    if (added.length === 0 && upgraded === 0) return;

    installed.version = packaged.version || installed.version;
    fs.writeFileSync(installedPath, `${JSON.stringify(installed, null, 2)}\n`);

    const parts = [];
    if (upgraded > 0) parts.push(`${upgraded} adapter definition(s) repaired`);
    if (added.length > 0) parts.push(`${added.length} new tool(s): ${added.map((tool) => tool.name).join(", ")}`);

    console.log(`  Updated: .sdrive/commands/tools.json (${parts.join("; ")})`);
  } catch (error) {
    console.warn("  ⚠️  Could not merge bundled tool registry. Check .sdrive/commands/tools.json.");
  }
}

function requirePermission(cliCommand) {
  const verdict = permissions.check(process.cwd(), cliCommand);

  if (verdict.ok) {
    if (verdict.skipped) {
      console.error(`⚠️  Permissions skipped for '${cliCommand}' (SDRIVE_SKIP_PERMISSIONS=1).`);
    }
    return;
  }

  console.error(`❌ Permission denied for 'sdrive ${cliCommand}'.`);
  console.error(`   ${verdict.reason}`);
  process.exit(verdict.code || EXIT.PERMISSION);
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

// Adapter bodies are generated by scripts/lib/tool-registry.js, which also owns
// the per-format wrappers (.mdc frontmatter, Gemini's TOML). Keeping one copy
// there is what stops `init`, `update`, and `adapters:*` from drifting apart.

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
    id: "claude-desktop",
    key: "mcpServers",
    entry: () => ({ command: "node", args: [mcpServerPath()] })
  },
  Cursor: {
    id: "cursor",
    key: "mcpServers",
    entry: () => ({ command: "node", args: [mcpServerPath()] })
  },
  Cline: {
    id: "cline",
    key: "mcpServers",
    entry: () => ({ command: "node", args: [mcpServerPath()] })
  },
  "Roo Code": {
    id: "roo",
    key: "mcpServers",
    entry: () => ({ command: "node", args: [mcpServerPath()] })
  },
  "Gemini CLI": {
    id: "gemini-cli",
    key: "mcpServers",
    entry: () => ({ command: "node", args: [mcpServerPath()] })
  },
  "GitHub Copilot (VS Code)": {
    id: "vscode",
    key: "servers",
    entry: () => ({ type: "stdio", command: "node", args: [mcpServerPath()] })
  }
};

// Which client to wire is a property of the tool, so it lives in
// commands/tools.json as `mcpClient` rather than in a second hand-kept map. A
// tool with no `mcpClient` is file-adapter only, which is the honest default:
// wiring a config file a tool never reads is worse than wiring nothing.
function mcpClientNameFor(id) {
  if (!id) return null;
  return Object.keys(MCP_CLIENTS).find((name) => MCP_CLIENTS[name].id === id) || null;
}

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

  paths.push({
    name: "Roo Code",
    path: path.join(process.cwd(), ".roo", "mcp.json")
  });

  paths.push({
    name: "Gemini CLI",
    path: path.join(process.cwd(), ".gemini", "settings.json")
  });

  return paths;
}

// Wires every MCP client implied by the selected tools, without prompting.
function autoWireMcp(selectedTools) {
  const clientNames = new Set();

  selectedTools.forEach((tool) => {
    const clientName = mcpClientNameFor(tool.mcpClient);
    if (clientName) clientNames.add(clientName);
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
      // Record what was installed so `update --check` and `doctor` can detect
      // drift instead of guessing which files are framework-owned.
      try {
        manifest.writeManifest(projectRoot, { cliVersion: getCliVersion() });
      } catch (error) {
        console.warn(`⚠️  Could not write framework-manifest.json: ${error.message}`);
      }

      console.log("\n✅ SpecDrive initialized successfully.");

      if (options.dashboard === false) {
        console.log("💡 Dashboard skipped (--no-dashboard).");
        printDashboardHint("   Start it any time with:");
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
      "templates",
      "migrations"
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

    // Must exist before any shipped .js under .sdrive/ is ever run - see the note
    // on ensureCommonJsScope(). Without it an ESM project cannot start the
    // dashboard at all.
    if (ensureCommonJsScope(sdriveRoot)) {
      console.log("  Created: .sdrive/package.json (keeps .sdrive/ CommonJS)");
    }

    const workflowStatePath = path.join(sdriveRoot, "workflow-state.json");
    if (!fs.existsSync(workflowStatePath)) {
      stateStore.writeState(projectRoot, { features: [] });
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
      fs.writeFileSync(
        configPath,
        JSON.stringify(
          {
            defaultTemplate: "generic",
            governance: {
              // New projects start with evidence-backed review gates. Existing
              // projects keep the old behaviour until they opt in with
              // `sdrive config:set governance.requireTestEvidence true`.
              requireTestEvidence: true,
              allowStaleEvidence: false,
              requireStructuredReview: true
            },
            test: {}
          },
          null,
          2
        )
      );
      console.log("  Created: .sdrive/config.json");
    }

    const teamPath = path.join(sdriveRoot, "team.json");
    if (!fs.existsSync(teamPath)) {
      const actor = currentActor();
      const hasActor = actor && actor !== "unknown";

      fs.writeFileSync(
        teamPath,
        JSON.stringify(
          {
            members: hasActor ? [{ username: actor, role: "admin" }] : [],
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

      if (hasActor) {
        console.log(`  Added:   "${actor}" as admin (from git config user.name)`);
      } else {
        console.log("  ⚠️  team.json has no members. Gated commands (/sdrive:review, /sdrive:apply, etc.) will be denied.");
        console.log("      Run: sdrive team:add <your-git-username> admin");
      }
    }

    const mcpConfigPath = path.join(sdriveRoot, "mcp", "mcp.json");
    if (!fs.existsSync(mcpConfigPath)) {
      fs.writeFileSync(mcpConfigPath, mcpConfigContent("Claude Desktop"));
      console.log("  Created: .sdrive/mcp/mcp.json");
    }

    let registry;

    try {
      registry = loadRegistry(sdriveRoot);
    } catch (error) {
      console.log("\n⚠️  tools.json not found. Skipping tool selection.");
      finishInit();
      return;
    }

    const tools = registry.tools;

    // Writes every file the selected tools actually read. Shared with
    // `scripts/generate-adapters.js` and the `adapters:*` commands so a tool's
    // format (md / mdc / toml) can only be defined once.
    const applySelection = (selectedTools) => {
      if (selectedTools.length === 0) {
        console.log("\n⚠️  No tools selected. Skipping adapter generation.");
        finishInit();
        return;
      }

      writeAdapters(selectedTools, projectRoot, {
        log: (message) => console.log(message),
        commands: loadCommands(sdriveRoot)
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
      const suffix = tool.label && tool.label !== tool.name ? ` — ${tool.label}` : "";
      console.log(`  ${index + 1}. ${tool.name}${suffix}`);
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
  .description("Refresh SpecDrive framework files (dashboard, mcp, scripts, schemas, commands) without touching your specs or governance")
  .option("--dry-run", "Show what would be updated without writing any files")
  .option("--check", "Report drift between .sdrive/ and the installed framework manifest")
  .option("--json", "Print the result as JSON")
  .action((options) => {
    output.setJson(options.json);

    const projectRoot = process.cwd();
    const sdriveRoot = path.join(projectRoot, ".sdrive");

    if (!fs.existsSync(sdriveRoot)) {
      process.exit(
        output.fail("update", EXIT.NOT_INITIALIZED, "❌ No .sdrive folder found. Run `sdrive init` first.")
      );
    }

    if (options.check) {
      const verdict = manifest.checkManifest(projectRoot, { expectedVersion: getCliVersion() });
      const drift =
        verdict.modified.length + verdict.missing.length + verdict.extra.length;
      const needsUpdate = !verdict.present || drift > 0;

      if (output.isJson()) {
        output.printJson({
          ok: !needsUpdate,
          command: "update",
          code: needsUpdate ? EXIT.DRIFT : EXIT.OK,
          data: verdict
        });
      } else {
        console.log("\n🔎 SpecDrive framework check\n");

        if (!verdict.present) {
          console.log("⚠️  No framework-manifest.json. Run `sdrive update` to create one.\n");
        } else {
          console.log(`   Installed: ${verdict.cliVersion}   CLI: ${verdict.expectedVersion}`);
          console.log(`   Files:     ${verdict.files}\n`);

          if (drift === 0) {
            console.log("✅ No drift. .sdrive/ matches the installed framework.\n");
          } else {
            verdict.modified.forEach((file) => console.log(`   modified: ${file}`));
            verdict.missing.forEach((file) => console.log(`   missing:  ${file}`));
            verdict.extra.forEach((file) => console.log(`   extra:    ${file}`));
            console.log("");
          }
        }
      }

      process.exit(needsUpdate ? EXIT.DRIFT : EXIT.OK);
    }

    const packageRoot = path.join(__dirname, "..");

    // Framework-owned directories: safe to overwrite because they contain code,
    // not user content. User data (specs, governance, constitution, config,
    // team, workflow-state) is deliberately excluded.
    const frameworkDirs = ["dashboard", "mcp", "scripts", "schemas", "agents", "templates", "migrations"];

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

    // The rules layer is code, not user configuration: gates.js, archive.js and
    // router.js must match the CLI that is running. Registry files are merged
    // below, never blindly replaced.
    if (options.dryRun) {
      console.log("  Would refresh: .sdrive/commands/*.js (gate/archive/router rules)");
    } else {
      const commandRefresh = refreshCommandModules(packageRoot, sdriveRoot);

      if (commandRefresh.written > 0) {
        console.log(
          `  ✅ Refreshed: .sdrive/commands/ (${commandRefresh.written} rule file${
            commandRefresh.written === 1 ? "" : "s"
          })`
        );
        commandRefresh.backedUp.forEach((file) =>
          console.log(`      - backed up previous ${file}`)
        );
        totalWritten += commandRefresh.written;
      }
    }

    // Repairs projects initialised before this marker existed. Existing ESM projects
    // are exactly the ones broken by its absence, so update has to add it.
    if (!options.dryRun && ensureCommonJsScope(sdriveRoot)) {
      console.log("  ✅ Created: .sdrive/package.json (keeps .sdrive/ CommonJS)");
    } else if (options.dryRun && !fs.existsSync(path.join(sdriveRoot, "package.json"))) {
      console.log("  Would create: .sdrive/package.json (keeps .sdrive/ CommonJS)");
    }

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

      try {
        manifest.writeManifest(projectRoot, { cliVersion: getCliVersion() });
        console.log("  ✅ Refreshed: .sdrive/framework-manifest.json");
      } catch (error) {
        console.warn(`  ⚠️  Could not write framework-manifest.json: ${error.message}`);
      }
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
    stateStore.writeJsonAtomic(configPath, config);

    console.log(`✅ Default template set to: ${name}`);
  });

// ---------- CONFIG VALIDATE ----------
program
  .command("config:validate")
  .description("Validate .sdrive/config.json")
  .option("--json", "Print the validation result as JSON")
  .action((options) => {
    output.setJson(options.json);

    const projectRoot = process.cwd();
    const config = stateStore.readJson(stateStore.configPath(projectRoot), null);

    if (!config) {
      process.exit(
        output.fail("config:validate", EXIT.NOT_INITIALIZED, "❌ config.json not found. Run `sdrive init` first.")
      );
    }

    const verdict = stateStore.validateData(projectRoot, "config.schema.json", config);
    const ok = verdict.ok;

    output.finish({
      command: "config:validate",
      ok,
      code: ok ? EXIT.OK : EXIT.VALIDATION,
      data: { errors: verdict.errors },
      blockers: ok ? [] : verdict.errors,
      suppressAuto: true,
      human: () => {
        if (ok) console.log("✅ config.json is valid.");
        else {
          console.error("❌ config.json is invalid:");
          verdict.errors.forEach((error) => console.error(`   • ${error}`));
        }
      }
    });

    process.exit(ok ? EXIT.OK : EXIT.VALIDATION);
  });

// ---------- VALIDATE COMMAND ----------
program
  .command("validate")
  .description("Validate SpecDrive governance files")
  .option("--json", "Print the validation result as JSON")
  .action((options) => {
    output.setJson(options.json);

    const projectRoot = process.cwd();

    if (!fs.existsSync(path.join(projectRoot, ".sdrive"))) {
      process.exit(
        output.fail("validate", EXIT.NOT_INITIALIZED, "❌ No .sdrive folder found. Run `sdrive init` first.")
      );
    }

    // Validate in-process: the CLI already depends on ajv, so this works in a
    // project that has no node_modules of its own.
    const { validateArtifacts } = require("../scripts/validate-governance");
    const verdict = validateArtifacts(projectRoot, {
      log: output.isJson() ? undefined : (line) => console.log(line)
    });

    if (output.isJson()) {
      output.printJson({
        ok: verdict.ok,
        command: "validate",
        code: verdict.ok ? EXIT.OK : EXIT.VALIDATION,
        data: { results: verdict.results, skipped: verdict.skipped },
        blockers: verdict.ok
          ? []
          : verdict.results
              .filter((entry) => entry.status === "invalid")
              .map((entry) => `${entry.file}: ${entry.errors.length} schema error(s)`)
      });
    } else if (!verdict.ok) {
      console.error("\n❌ Validation failed. Fix the errors above.");
    } else {
      console.log("\n✅ Governance validation complete. All files are valid.");
    }

    process.exit(verdict.ok ? EXIT.OK : EXIT.VALIDATION);
  });

// ---------- VERIFY COMMAND ----------
program
  .command("verify <feature>")
  .description("Verify code matches the plan (spec-to-code diff)")
  .option("--version <version>", "Feature version to verify (defaults to the latest)")
  .option("--json", "Print the verification result as JSON")
  .action((feature, options) => {
    output.setJson(options.json);

    if (!/^[a-z0-9-]+$/.test(feature)) {
      process.exit(
        output.fail("verify", EXIT.USAGE, "❌ Feature name must be lowercase letters, numbers, and hyphens only.")
      );
    }

    const scriptPath = path.join(process.cwd(), ".sdrive", "scripts", "verify.js");

    if (!fs.existsSync(scriptPath)) {
      process.exit(
        output.fail("verify", EXIT.NOT_INITIALIZED, "❌ verify.js not found. Run `sdrive init` first.")
      );
    }

    const args = [feature];
    if (options.version) args.push(options.version);

    if (!output.isJson()) {
      const result = execute.nodeScript(scriptPath, args, { capture: false });
      process.exit(result.status === 0 ? EXIT.OK : EXIT.DRIFT);
    }

    const result = execute.nodeScript(scriptPath, args, { capture: true });
    const resolved = evidence.resolveFeaturedVersion(process.cwd(), feature);
    const version = options.version || (resolved && resolved.version ? resolved.version.id : "v1");
    const reportFile = path.join(
      evidence.governanceDir(process.cwd(), feature, version),
      "verification.json"
    );
    const report = stateStore.readJson(reportFile, null);
    const ok = result.status === 0;

    output.printJson({
      ok,
      command: "verify",
      code: ok ? EXIT.OK : EXIT.DRIFT,
      data: { report },
      blockers: ok
        ? []
        : (report && report.items && report.items.missing
            ? report.items.missing.map((item) => `missing ${item.type}: ${item.name || item.path}`)
            : [(result.stderr || result.stdout || "verification failed").trim().split("\n").slice(-3).join(" ")]),
      warnings: report && report.items && report.items.extra
        ? report.items.extra.map((item) => `extra ${item.type}: ${item.name || item.path}`)
        : []
    });

    process.exit(ok ? EXIT.OK : EXIT.DRIFT);
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
  .option("--json", "Print the result as JSON")
  .action((feature, username, options) => {
    output.setJson(options.json);
    requirePermission("assign");

    const projectRoot = process.cwd();

    if (!fs.existsSync(stateStore.statePath(projectRoot))) {
      process.exit(
        output.fail("assign", EXIT.NOT_INITIALIZED, "❌ workflow-state.json not found. Run `sdrive init` first.")
      );
    }

    // Warn (but don't block) if the username isn't on the team roster.
    const team = stateStore.readJson(stateStore.teamPath(projectRoot), null);
    const warnings = [];

    if (team && !(team.members || []).some((member) => member.username === username)) {
      warnings.push(`"${username}" is not in team.json. Assigned anyway.`);
    }

    let outcome;

    try {
      outcome = stateStore.mutateState(projectRoot, (state) => {
        const target = (state.features || []).find((entry) => entry.name === feature);

        if (!target) {
          const error = new Error(`Feature "${feature}" not found in workflow-state.json.`);
          error.code = "ENOFEATURE";
          throw error;
        }

        target.assignee = username;
        return state;
      });
    } catch (error) {
      process.exit(
        output.fail(
          "assign",
          error.code === "ENOFEATURE" ? EXIT.USAGE : EXIT.ERROR,
          `❌ ${error.message}`
        )
      );
    }

    audit("feature_assigned", { feature, assignee: username });

    output.finish({
      command: "assign",
      ok: true,
      code: EXIT.OK,
      data: { feature, assignee: username, features: outcome.features.length },
      warnings,
      human: () => console.log(`✅ Feature "${feature}" assigned to "${username}".`)
    });

    process.exit(EXIT.OK);
  });

// ---------- STATUS COMMAND ----------
// The next action is derived from the current version's gates, in order. It is
// the same information the dashboard's health panel shows, exposed where CI and
// agents can read it.
function nextActionFor(feature, version) {
  // Gate state is read through the shared accessors, never by comparing the
  // stored string here. A second copy of "what approved means" is exactly the
  // drift commands/gates.js exists to prevent.
  const { GATE_ORDER, isGateApprovedFor } = require("../commands/gates");
  const gates = (version && version.gates) || {};
  const pending = GATE_ORDER.find((gate) => !isGateApprovedFor(version, gate));

  if (!pending) {
    return {
      command: `sdrive archive:check ${feature.name}`,
      reason: "Every gate is approved; check whether the feature can be archived."
    };
  }

  if (pending === "review") {
    return {
      command: `sdrive test ${feature.name}`,
      reason: "Review needs passing test evidence; run the tests, then approve review."
    };
  }

  return {
    command: `sdrive approve ${feature.name} ${pending}`,
    reason: `The "${pending}" gate is ${gates[pending] || "pending"}.`
  };
}

program
  .command("status")
  .description("Show feature lifecycle state")
  .option("--json", "Print the status as JSON")
  .action((options) => {
    output.setJson(options.json);

    const projectRoot = process.cwd();
    const workflowStatePath = path.join(projectRoot, ".sdrive", "workflow-state.json");

    if (!fs.existsSync(workflowStatePath)) {
      process.exit(
        output.fail("status", EXIT.NOT_INITIALIZED, "❌ workflow-state.json not found. Run `sdrive init` first.")
      );
    }

    const state = stateStore.readJson(workflowStatePath, null);

    if (!state) {
      process.exit(
        output.fail("status", EXIT.VALIDATION, "❌ workflow-state.json is not valid JSON.")
      );
    }

    const features = (state.features || []).map((feature) => {
      const versions = (feature.versions || []).map((version) => {
        const action = nextActionFor(feature, version);
        return {
          id: version.id,
          phase: version.phase,
          currentStep: version.currentStep,
          gates: version.gates || {},
          nextAction: action,
          history: version.history || []
        };
      });

      const current = versions.find((version) => version.id === feature.currentVersion) || versions[0] || null;

      return {
        name: feature.name,
        currentVersion: feature.currentVersion || null,
        assignee: feature.assignee || null,
        branch: feature.branch || null,
        base: feature.base || null,
        versions,
        nextAction: current ? current.nextAction : null
      };
    });

    if (output.isJson()) {
      output.printJson({
        ok: true,
        command: "status",
        code: EXIT.OK,
        data: { features }
      });
      process.exit(EXIT.OK);
    }

    if (features.length === 0) {
      console.log("No features found.");
      return;
    }

    console.log("\nSpecDrive Feature Status\n");

    features.forEach((feature) => {
      console.log(`📁 ${feature.name}`);
      console.log(`   Current Version: ${feature.currentVersion}`);
      if (feature.assignee) console.log(`   Assignee:        ${feature.assignee}`);
      if (feature.branch) console.log(`   Branch:          ${feature.branch}${feature.base ? ` (base ${feature.base})` : ""}`);

      feature.versions.forEach((version) => {
        console.log(`   Version ${version.id}:`);
        console.log(`     Phase:        ${version.phase}`);
        console.log(`     Current Step: ${version.currentStep}`);
        console.log(`     Gates:`);
        console.log(`       specification: ${version.gates.specification ?? "pending"}`);
        console.log(`       planning:      ${version.gates.planning ?? "pending"}`);
        console.log(`       implementation: ${version.gates.implementation ?? "pending"}`);
        console.log(`       review:        ${version.gates.review ?? "pending"}`);
      });

      if (feature.nextAction) {
        console.log(`   Next: ${feature.nextAction.command}`);
        console.log(`         ${feature.nextAction.reason}`);
      }
      console.log("");
    });
  });

// ---------- APPROVE COMMAND ----------
program
  .command("approve <feature> <gate>")
  .description("Approve a workflow gate (specification, planning, implementation, review)")
  .option("--json", "Print the result as JSON")
  .action((featureName, gate, options) => {
    output.setJson(options.json);
    requirePermission("approve");

    const {
      GATE_ORDER,
      GATE_APPROVED,
      checkGateRequirements,
      findFeature,
      resolveVersion
    } = require("../commands/gates");

    if (!GATE_ORDER.includes(gate)) {
      process.exit(
        output.fail(
        "approve",
        EXIT.USAGE,
        `❌ Invalid gate "${gate}". Allowed: ${GATE_ORDER.join(", ")}`
        )
      );
    }

    const projectRoot = process.cwd();

    if (!fs.existsSync(stateStore.statePath(projectRoot))) {
      process.exit(
        output.fail("approve", EXIT.NOT_INITIALIZED, "❌ workflow-state.json not found. Run `sdrive init` first.")
      );
    }

    let outcome;

    try {
      outcome = stateStore.withLock(projectRoot, () => {
        const state = stateStore.readState(projectRoot);

        if (!state) {
          return { ok: false, code: EXIT.VALIDATION, blockers: ["workflow-state.json is not valid JSON."] };
        }

        // The feature is explicit. NEVER fall back to state.features[0] - approving
        // the wrong feature writes a false record while reporting success.
        const feature = findFeature(state, featureName);

        if (!feature) {
          const known = (state.features || []).map((entry) => entry.name);
          return {
            ok: false,
            code: EXIT.USAGE,
            blockers: [
              `Feature "${featureName}" not found.${known.length ? ` Known features: ${known.join(", ")}.` : ""}`
            ]
          };
        }

        const version = resolveVersion(feature);

        if (!version) {
          return { ok: false, code: EXIT.USAGE, blockers: [`Feature "${featureName}" has no versions.`] };
        }

        version.gates = version.gates || {};

        // Verify BEFORE writing anything. A gate may only be approved when the work
        // it certifies actually exists.
        const verdict = checkGateRequirements(projectRoot, feature, version, gate);

        if (!verdict.ok) {
          return {
            ok: false,
            code: EXIT.GATE_BLOCKED,
            blockers: verdict.blockers,
            warnings: verdict.warnings,
            data: { feature: featureName, version: version.id, gate }
          };
        }

        if (verdict.approved) {
          return {
            ok: true,
            already: true,
            warnings: verdict.warnings,
            data: { feature: featureName, version: version.id, gate }
          };
        }

        const actor = currentActor();

        // The stored value is the schema's business. Naming it here would recreate the
        // duplication this command was just moved off of, one line lower down.
        version.gates[gate] = GATE_APPROVED;
        version.history = version.history || [];
        version.history.push({
          event: `${gate}_approved`,
          // `by` is the schema's field; `actor` is retained for existing readers.
          by: actor,
          actor,
          previousValue: verdict.current || "pending",
          timestamp: new Date().toISOString()
        });

        // Atomic replace + schema validation + a backup of the previous state.
        stateStore.writeState(projectRoot, state);

        return {
          ok: true,
          already: false,
          warnings: verdict.warnings,
          previous: verdict.current || "pending",
          data: { feature: featureName, version: version.id, gate, actor }
        };
      });
    } catch (error) {
      const code = error.code === "ELOCKED" ? EXIT.GATE_BLOCKED : EXIT.ERROR;
      process.exit(output.fail("approve", code, `❌ ${error.message}`));
    }

    if (!outcome.ok) {
      output.finish({
        command: "approve",
        ok: false,
        code: outcome.code,
        data: outcome.data || {},
        blockers: outcome.blockers || [],
        warnings: outcome.warnings || [],
        suppressAuto: true,
        human: () => {
          console.error(`\n❌ Refusing to approve "${gate}" for "${featureName}".`);
          outcome.blockers.forEach((blocker) => console.error(`   • ${blocker}`));
          console.error("\nNothing was written. Approving an unmet gate would falsify the governance record.\n");
        }
      });
      process.exit(outcome.code);
    }

    if (!outcome.already) {
      audit("gate_approved", {
        feature: featureName,
        version: outcome.data.version,
        gate,
        previousValue: outcome.previous
      });
    }

    output.finish({
      command: "approve",
      ok: true,
      code: EXIT.OK,
      data: outcome.data,
      warnings: outcome.warnings || [],
      suppressAuto: true,
      human: () => {
        (outcome.warnings || []).forEach((warning) => console.warn(`⚠️  ${warning}`));

        if (outcome.already) {
          console.log(`\n✅ Gate "${gate}" is already approved for "${featureName}" version "${outcome.data.version}". Nothing changed.\n`);
          return;
        }

        console.log(`\n✅ Gate "${gate}" approved for feature "${featureName}" version "${outcome.data.version}".`);
        console.log(`   "${outcome.previous}" → "${GATE_APPROVED}"`);
        console.log("");
      }
    });

    process.exit(EXIT.OK);
  });

// ---------- ARCHIVE COMMANDS ----------
// Approving a gate and closing a lifecycle are separate acts. `sdrive approve` checks
// the evidence and writes the approval; these close the record. Neither will grant an
// approval that does not already exist, so a feature that was never tested or reviewed
// cannot be recorded as archived. See commands/archive.js for the reasoning.
program
  .command("archive:check <feature>")
  .description("Report whether a feature may be archived. Changes nothing")
  .option("--json", "Print the result as JSON")
  .action((featureName, options) => {
    output.setJson(options.json);
    requirePermission("archive:check");

    const { checkArchivable } = require("../commands/archive");
    const verdict = checkArchivable(process.cwd(), featureName);
    const ok = Boolean(verdict.alreadyFinalized || verdict.ok);

    output.finish({
      command: "archive:check",
      ok,
      code: ok ? EXIT.OK : EXIT.GATE_BLOCKED,
      data: {
        feature: featureName,
        alreadyFinalized: Boolean(verdict.alreadyFinalized),
        version: verdict.version ? verdict.version.id : null
      },
      blockers: verdict.blockers || [],
      warnings: verdict.warnings || [],
      suppressAuto: true,
      human: () => {
        (verdict.warnings || []).forEach((warning) => console.warn(`⚠️  ${warning}`));

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
          return;
        }

        console.log(`\n✅ "${featureName}" ${verdict.version.id} is archivable.`);
        console.log("   All four gates are approved and the evidence behind them is still present.");
        console.log("");
      }
    });

    process.exit(ok ? EXIT.OK : EXIT.GATE_BLOCKED);
  });

program
  .command("archive:finalize <feature>")
  .description(
    "Close a feature's lifecycle: move its spec to completed/ and mark the version completed. Refuses unless every gate is already approved"
  )
  .option("--merge-commit <sha>", "Record the merge commit in the feature history")
  .option("--json", "Print the result as JSON")
  .action((featureName, options) => {
    output.setJson(options.json);
    requirePermission("archive:finalize");

    const { finalizeArchive } = require("../commands/archive");
    const result = finalizeArchive(process.cwd(), featureName, {
      actor: currentActor(),
      mergeCommit: options.mergeCommit
    });

    if (result.alreadyFinalized) {
      output.finish({
        command: "archive:finalize",
        ok: true,
        code: EXIT.OK,
        data: { feature: featureName, alreadyFinalized: true, version: result.version },
        warnings: result.warnings || [],
        human: () => console.log(`\n✅ "${featureName}" is already finalized. Nothing changed.\n`)
      });
      process.exit(EXIT.OK);
    }

    if (!result.ok) {
      output.finish({
        command: "archive:finalize",
        ok: false,
        code: EXIT.GATE_BLOCKED,
        data: { feature: featureName, version: result.version || null },
        blockers: result.blockers || [],
        warnings: result.warnings || [],
        suppressAuto: true,
        human: () => {
          (result.warnings || []).forEach((warning) => console.warn(`⚠️  ${warning}`));
          console.error(`\n❌ Refusing to finalize "${featureName}".`);
          result.blockers.forEach((blocker) => console.error(`   • ${blocker}`));
          console.error(
            "\nNothing was written. A lifecycle may only be closed on approvals that already exist.\n"
          );
        }
      });
      process.exit(EXIT.GATE_BLOCKED);
    }

    audit("feature_archived", { feature: featureName, version: result.version });

    output.finish({
      command: "archive:finalize",
      ok: true,
      code: EXIT.OK,
      data: { feature: featureName, version: result.version, from: result.from },
      warnings: result.warnings || [],
      human: () => {
        console.log(`\n✅ Feature "${featureName}" finalized (${result.version}).`);
        console.log(
          `   Spec moved: specs/${result.from}/${featureName} → specs/completed/${featureName}`
        );
        console.log("   Governance left in place at .sdrive/governance/<feature>/<version>/.");
        console.log("   Commit the move, then let /sdrive:archive delete the branch.\n");
      }
    });

    process.exit(EXIT.OK);
  });

// ---------- TEAM COMMANDS ----------
const TEAM_ROLES = ["admin", "reviewer", "developer"];

function updateTeam(projectRoot, mutator) {
  return stateStore.withLock(projectRoot, () => {
    const file = stateStore.teamPath(projectRoot);
    const team = stateStore.readJson(file, null);

    if (!team) {
      const error = new Error("team.json not found. Run `sdrive init` first.");
      error.code = "ENOENT";
      throw error;
    }

    const next = mutator(team) || team;
    stateStore.writeJsonAtomic(file, next);
    return next;
  });
}

program
  .command("team:add <username> <role>")
  .description("Add a new team member")
  .option("--json", "Print the result as JSON")
  .action((username, role, options) => {
    output.setJson(options.json);
    requirePermission("team:add");

    if (!TEAM_ROLES.includes(role)) {
      process.exit(
        output.fail("team:add", EXIT.USAGE, `❌ Invalid role "${role}". Allowed: ${TEAM_ROLES.join(", ")}`)
      );
    }

    // The first member must be the acting Git user. Otherwise a typo in the
    // username creates a roster that does not include the person adding it,
    // locking every mutating command (including team:add) out of the project.
    const existingTeam = stateStore.readJson(stateStore.teamPath(process.cwd()), null);

    if (existingTeam && (existingTeam.members || []).length === 0) {
      const who = permissions.actor(process.cwd());

      if (who !== username) {
        process.exit(
          output.fail(
            "team:add",
            EXIT.USAGE,
            `❌ The first team member must be the acting Git user ("${who}"), not "${username}".`,
            { blockers: [`Run: sdrive team:add "${who}" admin`] }
          )
        );
      }
    }

    let team;

    try {
      team = updateTeam(process.cwd(), (current) => {
        current.members = current.members || [];

        if (current.members.some((member) => member.username === username)) {
          const error = new Error(`User "${username}" already exists. Use team:update to change role.`);
          error.code = "EEXISTS";
          throw error;
        }

        current.members.push({ username, role });
        return current;
      });
    } catch (error) {
      process.exit(
        output.fail(
          "team:add",
          error.code === "ENOENT" ? EXIT.NOT_INITIALIZED : EXIT.USAGE,
          `❌ ${error.message}`
        )
      );
    }

    output.finish({
      command: "team:add",
      ok: true,
      code: EXIT.OK,
      data: { username, role, members: team.members.length },
      human: () => console.log(`✅ Added ${username} as ${role}.`)
    });

    process.exit(EXIT.OK);
  });

program
  .command("team:remove <username>")
  .description("Remove a team member")
  .option("--json", "Print the result as JSON")
  .action((username, options) => {
    output.setJson(options.json);
    requirePermission("team:remove");

    let team;

    try {
      team = updateTeam(process.cwd(), (current) => {
        const before = current.members ? current.members.length : 0;
        current.members = (current.members || []).filter((member) => member.username !== username);

        if (current.members.length === before) {
          const error = new Error(`User "${username}" not found.`);
          error.code = "ENOUSER";
          throw error;
        }

        return current;
      });
    } catch (error) {
      process.exit(
        output.fail(
          "team:remove",
          error.code === "ENOENT" ? EXIT.NOT_INITIALIZED : EXIT.USAGE,
          `❌ ${error.message}`
        )
      );
    }

    output.finish({
      command: "team:remove",
      ok: true,
      code: EXIT.OK,
      data: { username, members: team.members.length },
      human: () => console.log(`✅ Removed ${username}.`)
    });

    process.exit(EXIT.OK);
  });

program
  .command("team:list")
  .description("List all team members")
  .option("--json", "Print the team as JSON")
  .action((options) => {
    output.setJson(options.json);

    const team = stateStore.readJson(stateStore.teamPath(process.cwd()), null);

    if (!team) {
      process.exit(
        output.fail("team:list", EXIT.NOT_INITIALIZED, "❌ team.json not found. Run `sdrive init` first.")
      );
    }

    const members = team.members || [];

    if (output.isJson()) {
      output.printJson({ ok: true, command: "team:list", code: EXIT.OK, data: { members } });
      process.exit(EXIT.OK);
    }

    if (members.length === 0) {
      console.log("No team members found.");
      return;
    }

    console.log("\nSpecDrive Team Members\n");
    members.forEach((member) => {
      console.log(`👤 ${member.username} — ${member.role}`);
    });
  });

program
  .command("team:update <username> <role>")
  .description("Update a team member's role")
  .option("--json", "Print the result as JSON")
  .action((username, role, options) => {
    output.setJson(options.json);
    requirePermission("team:update");

    if (!TEAM_ROLES.includes(role)) {
      process.exit(
        output.fail("team:update", EXIT.USAGE, `❌ Invalid role "${role}". Allowed: ${TEAM_ROLES.join(", ")}`)
      );
    }

    let team;

    try {
      team = updateTeam(process.cwd(), (current) => {
        const member = (current.members || []).find((entry) => entry.username === username);

        if (!member) {
          const error = new Error(`User "${username}" not found.`);
          error.code = "ENOUSER";
          throw error;
        }

        member.role = role;
        return current;
      });
    } catch (error) {
      process.exit(
        output.fail(
          "team:update",
          error.code === "ENOENT" ? EXIT.NOT_INITIALIZED : EXIT.USAGE,
          `❌ ${error.message}`
        )
      );
    }

    output.finish({
      command: "team:update",
      ok: true,
      code: EXIT.OK,
      data: { username, role, members: team.members.length },
      human: () => console.log(`✅ Updated ${username} to ${role}.`)
    });

    process.exit(EXIT.OK);
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

    const result = execute.nodeScript(scriptPath, [], { capture: false });

    if (result.status !== 0) {
      console.error("❌ Team sync failed.");
      process.exit(result.status || EXIT.ERROR);
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

    const result = execute.nodeScript(scriptPath, [], { capture: false });

    if (result.status !== 0) {
      console.error("❌ Hook installation failed.");
      process.exit(result.status || EXIT.ERROR);
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

    const result = execute.nodeScript(scriptPath, [oldFile, newFile], { capture: false });

    if (result.status !== 0) {
      console.error("❌ Diff failed.");
      process.exit(result.status || EXIT.ERROR);
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

    const args = [feature];
    if (options.version) args.push(options.version);

    const result = execute.nodeScript(scriptPath, args, { capture: false });

    if (result.status !== 0) {
      console.error("❌ OpenAPI generation failed.");
      process.exit(result.status || EXIT.ERROR);
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

// Every path out of `init` and `onboard` closes by pointing at the dashboard. It is
// the fastest way to see what SpecDrive just did, and it is easy to miss otherwise.
const DASHBOARD_PITCH = [
  "   A visual view of your specs, features, approval gates, team, and activity -",
  "   the quickest way to see where the project actually stands."
];

function printDashboardHint(prefix) {
  console.log(`${prefix} sdrive dashboard`);
  DASHBOARD_PITCH.forEach((line) => console.log(line));
}

function dashboardScriptPath() {
  const sdriveRoot = path.join(process.cwd(), ".sdrive");
  const scriptPath = path.join(sdriveRoot, "dashboard", "server.js");
  if (!fs.existsSync(scriptPath)) return null;

  // Projects initialised before this marker existed still lack it, so repair it
  // here: this is the exact point where its absence breaks the dashboard.
  if (ensureCommonJsScope(sdriveRoot)) {
    console.log("  Repaired: .sdrive/package.json (keeps .sdrive/ CommonJS)");
  }

  return scriptPath;
}

// Node decides CommonJS vs ESM per FILE, by walking up from that file to the
// nearest package.json. Every file SpecDrive ships under .sdrive/ is CommonJS,
// so in a project whose package.json declares "type": "module" - normal for Vite,
// Next.js with ESM, and Bun - Node treats them as ESM and the dashboard dies with:
//
//   ReferenceError: require is not defined in ES module scope
//
// A package.json at the root of .sdrive/ makes that directory its own CommonJS
// scope, which fixes every shipped file at once without renaming any of them.
// It is a marker, not a package: no name, no version, nothing installable.
function ensureCommonJsScope(sdriveRoot) {
  const scopePath = path.join(sdriveRoot, "package.json");
  if (fs.existsSync(scopePath)) return false;

  fs.writeFileSync(scopePath, JSON.stringify({ type: "commonjs" }, null, 2));
  return true;
}

// ---------- DASHBOARD REUSE ----------
// `sdrive dashboard` used to start its own server on the next free port, so
// opening a second project produced a second port and a second tab. One server
// can already serve every registered project, so look for a running dashboard
// first and hand it the current project instead.
const DASHBOARD_PORT_ATTEMPTS = 20;
const DASHBOARD_PROBE_TIMEOUT_MS = 600;

function dashboardHost() {
  return process.env.SDRIVE_HOST || "127.0.0.1";
}

function probeDashboard(port, host) {
  return new Promise((resolve) => {
    const request = http.get(
      { hostname: host, port, path: "/api/project-info", timeout: DASHBOARD_PROBE_TIMEOUT_MS },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const info = JSON.parse(body);
            // A port can be held by anything. Demand a dashboard shape, and for
            // older servers (no `service` field) demand the root really is a
            // SpecDrive project.
            const identified =
              info &&
              typeof info.name === "string" &&
              typeof info.root === "string" &&
              path.isAbsolute(info.root) &&
              (info.service === "specdrive-dashboard" ||
                fs.existsSync(path.join(info.root, ".sdrive", "config.json")));

            resolve(identified ? { port, info } : null);
          } catch (error) {
            resolve(null);
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
  });
}

async function findRunningDashboard() {
  const host = dashboardHost();
  const start = Number(process.env.SDRIVE_PORT) || 4747;

  for (let offset = 0; offset < DASHBOARD_PORT_ATTEMPTS; offset += 1) {
    const found = await probeDashboard(start + offset, host);
    if (found) return { ...found, host };
  }

  return null;
}

function postJson(host, port, route, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const request = http.request(
      {
        hostname: host,
        port,
        path: route,
        method: "POST",
        timeout: 5000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(responseBody));
          } catch (error) {
            resolve(null);
          }
        });
      }
    );

    request.on("timeout", () => request.destroy(new Error("request timed out")));
    request.on("error", () => resolve(null));
    request.end(body);
  });
}

// Returns true when an existing dashboard now shows this project. Returns false
// when there is nothing to reuse, so the caller starts one as before.
async function reuseRunningDashboard() {
  if (process.env.SDRIVE_NO_REUSE === "1") return false;

  const running = await findRunningDashboard();
  if (!running) return false;

  const projectRoot = process.cwd();
  const result = await postJson(running.host, running.port, "/api/switch-project", {
    path: projectRoot
  });
  const url = `http://${running.host === "127.0.0.1" ? "localhost" : running.host}:${running.port}/`;

  if (result && result.ok) {
    console.log(`\n♻️  SpecDrive Dashboard is already running at ${url}`);
    console.log(`   Switched it to ${path.basename(projectRoot)} instead of starting a second server.`);
    console.log("   Stop it from the terminal that started it.\n");
    return true;
  }

  console.log(`\n⚠️  A dashboard is running at ${url} but does not list this project yet.`);
  console.log("   Starting a separate dashboard so this project is still visible.\n");
  return false;
}

// Auto-launch after `init` / `onboard` so a new project has something to look at
// immediately. A server that never exits is the wrong default in the wrong
// context, so this refuses to start without an interactive terminal (a script or
// CI run would hang forever) and honours SDRIVE_NO_DASHBOARD.
async function launchDashboard() {
  const disabled =
    process.env.SDRIVE_NO_DASHBOARD === "1" || process.env.SDRIVE_NO_DASHBOARD === "true";

  if (disabled) {
    console.log("💡 Dashboard skipped (SDRIVE_NO_DASHBOARD is set).");
    printDashboardHint("   Start it any time with:");
    return;
  }

  if (!process.stdout.isTTY) {
    console.log("💡 Dashboard not started (no interactive terminal).");
    printDashboardHint("   Start it any time with:");
    return;
  }

  const scriptPath = dashboardScriptPath();
  if (!scriptPath) {
    console.log("💡 Dashboard not found in .sdrive/dashboard/.");
    printDashboardHint("   Start it any time with:");
    return;
  }

  if (await reuseRunningDashboard()) return;

  console.log("\n📊 Starting the SpecDrive dashboard in this terminal.");
  DASHBOARD_PITCH.forEach((line) => console.log(line));
  console.log("   Press Ctrl+C when you are done to get your prompt back.\n");

  const result = runDashboardForeground(scriptPath);

  if (result.stoppedByUser) {
    console.log("\n📊 Dashboard stopped.");
    printDashboardHint("   Bring it back any time with:");
  } else if (!result.ok) {
    console.error("⚠️  Dashboard exited unexpectedly. Run `sdrive dashboard` to retry.");
  }
}

program
  .command("dashboard")
  .description("Start SpecDrive web dashboard")
  .action(async () => {
    const scriptPath = dashboardScriptPath();

    if (!scriptPath) {
      console.error("❌ Dashboard not found. Run `sdrive init` first.");
      process.exit(1);
    }

    if (await reuseRunningDashboard()) return;

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

    stateStore.writeState(projectRoot, state);

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

        stateStore.writeState(projectRoot, freshState);
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

    const scan = execute.nodeScript(scriptPath, [], { capture: false });

    if (scan.status !== 0) {
      console.error("❌ Onboarding scan failed.");
      process.exit(scan.status || EXIT.ERROR);
    }

    console.log("");
    console.log("📋 The scan is complete.");
    console.log("   You can now run `/sdrive:onboard` in your AI tool,");
    console.log("   or the agent will run this scan for you if needed.");

    if (options.dashboard === false) {
      console.log("💡 Dashboard skipped (--no-dashboard).");
      printDashboardHint("   Start it any time with:");
      return;
    }

    launchDashboard();
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

    const result = execute.nodeScript(scriptPath, [feature], { capture: false });

    if (result.status !== 0) {
      process.exit(result.status || EXIT.ERROR);
    }

    audit("version_created", { feature });
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

    const result = execute.nodeScript(scriptPath, [feature, versionA, versionB], {
      capture: false
    });

    if (result.status !== 0) {
      process.exit(result.status || EXIT.ERROR);
    }
  });

// ---------- ADAPTER REGISTRY ----------
function loadProjectRegistry() {
  const projectRoot = process.cwd();
  const sdriveRoot = path.join(projectRoot, ".sdrive");

  try {
    return { projectRoot, sdriveRoot, registry: loadRegistry(sdriveRoot) };
  } catch (error) {
    console.error(`❌ ${error.message}`);
    console.error("   Run `sdrive init` first.");
    process.exit(1);
  }
}

function printTable(headers, rows) {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => String(row[column] || "").length))
  );

  const line = (cells) =>
    cells
      .map((cell, column) => String(cell || "").padEnd(widths[column]))
      .join("  ")
      .trimEnd();

  console.log(line(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  rows.forEach((row) => console.log(line(row)));
}

program
  .command("adapters:list")
  .description("List every AI tool SpecDrive can configure, and the exact files each one reads")
  .option("--json", "Print the registry as JSON")
  .action((options) => {
    const { sdriveRoot, registry } = loadProjectRegistry();

    if (options.json) {
      console.log(JSON.stringify(registry.tools, null, 2));
      return;
    }

    const commands = loadCommands(sdriveRoot);

    const rows = registry.tools.flatMap((tool) =>
      tool.paths.map((entry) => {
        const where =
          entry.kind === "command-set"
            ? `${toPosix(entry.path)}/ (${commands.length} commands)`
            : toPosix(entry.path);

        return [
          tool.name,
          where,
          entry.format,
          entry.kind,
          tool.mcpClient || "-",
          tool.verified ? "yes" : "unverified"
        ];
      })
    );

    console.log("");
    printTable(["TOOL", "FILE", "FORMAT", "KIND", "MCP", "VERIFIED"], rows);
    console.log(`\n${registry.tools.length} tool(s), ${rows.length} file(s).`);
    console.log("Add your own: sdrive adapters:add <name> --path <file> --format md\n");
  });

program
  .command("adapters:verify")
  .description("Check the tool registry for paths a tool would never read (format, extension, frontmatter, duplicates)")
  .option("--strict", "Treat unverified tool paths as errors")
  .action((options) => {
    const { registry } = loadProjectRegistry();
    const { errors, warnings } = validateRegistry(registry.tools);

    console.log("\n🔎 Adapter registry check\n");

    warnings.forEach((warning) => console.log(`  ⚠️  ${warning}`));

    if (errors.length === 0 && (!options.strict || warnings.length === 0)) {
      console.log(`  ✅ ${registry.tools.length} tool(s) look valid.`);
      process.exit(0);
    }

    errors.forEach((error) => console.error(`  ❌ ${error}`));

    if (options.strict && warnings.length > 0) {
      console.error("  ❌ --strict: unverified tool paths are not allowed to pass.");
    }

    process.exit(1);
  });

program
  .command("adapters:add <name>")
  .description("Register an AI tool SpecDrive does not ship a definition for, and generate its adapter")
  .requiredOption("--path <path>", "File the tool reads, relative to the project root")
  .option("--format <format>", "md, mdc, or toml (default: md)")
  .option("--extension <ext>", "File extension when it differs from the format, e.g. .rules")
  .option("--kind <kind>", "rules, command, or command-set (default: rules; toml implies command)")
  .option("--naming <naming>", "command-set naming: nested (.claude/commands/sdrive/propose.md) or prefixed (sdrive-propose.md)")
  .option("--label <label>", "Human-readable tool name")
  .option("--docs <url>", "Link to the vendor documentation for this path")
  .option("--mcp-client <id>", "MCP client to wire: claude-desktop, cursor, cline, roo, gemini-cli, vscode")
  .option("--frontmatter <json>", "Frontmatter object as JSON, e.g. '{\"alwaysApply\":true}'")
  .option("--unverified", "Record that the path is a best guess, not checked against vendor docs")
  .option("--no-generate", "Only update the registry; do not write the adapter file")
  .action((name, options) => {
    const { projectRoot, sdriveRoot } = loadProjectRegistry();
    if (options.mcpClient && !mcpClientNameFor(options.mcpClient)) {
      console.error(`❌ Unknown MCP client "${options.mcpClient}".`);
      console.error("   Use one of: claude-desktop, cursor, cline, roo, gemini-cli, vscode");
      process.exit(1);
    }

    let frontmatter = null;

    if (options.frontmatter) {
      try {
        frontmatter = JSON.parse(options.frontmatter);
      } catch (error) {
        console.error("❌ --frontmatter must be valid JSON.");
        process.exit(1);
      }
    }

    requirePermission("adapters:add");

    let tool;

    try {
      tool = addRegistryTool(sdriveRoot, {
        name,
        label: options.label,
        path: options.path,
        format: options.format,
        kind: options.kind,
        naming: options.naming,
        extension: options.extension,
        docs: options.docs,
        mcpClient: options.mcpClient,
        frontmatter,
        verified: options.unverified !== true
      });
    } catch (error) {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    }

    console.log(`\n✅ Registered tool "${tool.name}".`);

    if (options.generate !== false) {
      writeAdapters([tool], projectRoot, {
        log: (message) => console.log(message),
        commands: loadCommands(sdriveRoot)
      });
    }

    console.log("\nNext: run /sdrive:* from your AI tool, or `sdrive adapters:list` to confirm.\n");
  });

// ---------- DOCTOR ----------
program
  .command("doctor")
  .description("Diagnose a SpecDrive installation (layout, schemas, team, permissions, adapters, evidence)")
  .option("--json", "Print the checks as JSON")
  .option("--fix", "Apply safe fixes (CommonJS scope marker, framework manifest)")
  .action((options) => {
    output.setJson(options.json);

    const projectRoot = process.cwd();
    const fixes = options.fix ? doctor.applyFixes(projectRoot) : [];
    const verdict = doctor.runChecks(projectRoot);

    const failures = verdict.checks.filter((check) => check.status === "fail");
    const warnings = verdict.checks.filter((check) => check.status === "warn");

    output.finish({
      command: "doctor",
      ok: verdict.ok,
      code: verdict.ok ? EXIT.OK : EXIT.DOCTOR,
      data: { checks: verdict.checks, fixes },
      blockers: failures.map((check) => `${check.id}: ${check.message}`),
      warnings: warnings.map((check) => `${check.id}: ${check.message}`),
      suppressAuto: true,
      human: () => {
        console.log("\n🩺 SpecDrive doctor\n");

        verdict.checks.forEach((check) => {
          const icon = check.status === "ok" ? "✅" : check.status === "warn" ? "⚠️ " : "❌";
          console.log(`${icon} ${check.id.padEnd(18)} ${check.message}`);
          if (check.fix && check.status !== "ok") console.log(`   fix: ${check.fix}`);
        });

        fixes.forEach((fix) => console.log(`🔧 ${fix}`));

        console.log("");
        if (verdict.ok) {
          console.log(
            `✅ No blocking problems${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : ""}.\n`
          );
        } else {
          console.log(`❌ ${failures.length} blocking problem(s). Fix them and re-run \`sdrive doctor\`.\n`);
        }
      }
    });

    process.exit(verdict.ok ? EXIT.OK : EXIT.DOCTOR);
  });

// ---------- TEST EVIDENCE ----------
program
  .command("test <feature>")
  .description("Run the project's tests and record test-evidence.json for a feature")
  .option("--cmd <command>", "Test command to run (overrides config/package.json detection)")
  .option("--version <version>", "Feature version (defaults to the current version)")
  .option("--timeout <ms>", "Test timeout in milliseconds (default: 600000)")
  .option("--json", "Print the result as JSON")
  .action((feature, options) => {
    output.setJson(options.json);
    requirePermission("test");

    const projectRoot = process.cwd();
    const resolved = evidence.resolveFeaturedVersion(projectRoot, feature);

    if (!resolved) {
      process.exit(
        output.fail("test", EXIT.USAGE, `❌ Feature "${feature}" not found in workflow-state.json.`)
      );
    }

    const versionId = options.version || (resolved.version ? resolved.version.id : "v1");

    let run;

    try {
      run = evidence.runTests(projectRoot, {
        command: options.cmd,
        timeoutMs: options.timeout ? Number(options.timeout) : undefined
      });
    } catch (error) {
      process.exit(
        output.fail("test", EXIT.USAGE, `❌ ${error.message}`, {
          blockers: ["Set test.command in .sdrive/config.json or pass --cmd."]
        })
      );
    }

    const written = evidence.writeEvidence(projectRoot, feature, versionId, run);
    const passed =
      run.exitCode === 0 &&
      Number(run.summary.failed) === 0 &&
      evidence.hasRecognisableResults(run);

    if (!passed) {
      // The evidence is still written: a failing run is a fact worth recording,
      // and the gate will read it and refuse on its own.
      audit("test_failed", {
        feature,
        version: versionId,
        exitCode: run.exitCode,
        failed: run.summary.failed
      });
    } else {
      audit("test_passed", {
        feature,
        version: versionId,
        total: run.summary.total,
        durationMs: run.durationMs
      });
    }

    output.finish({
      command: "test",
      ok: passed,
      code: passed ? EXIT.OK : EXIT.TEST_FAILED,
      data: {
        feature,
        version: versionId,
        command: run.command,
        source: run.source,
        exitCode: run.exitCode,
        summary: run.summary,
        durationMs: run.durationMs,
        evidence: path.relative(projectRoot, written.file),
        testIds: run.testIds,
        acIds: run.acIds
      },
      blockers: passed
        ? []
        : [
            run.exitCode !== 0
              ? `The test command exited ${run.exitCode}${run.timedOut ? " (timed out)" : ""}.`
              : null,
            run.summary.failed > 0 ? `${run.summary.failed} test(s) failed.` : null,
            !evidence.hasRecognisableResults(run)
              ? "The test command produced no recognisable results. Configure a reporter (JUnit/Jest/pytest/node:test) or print TEST-### IDs."
              : null
          ].filter(Boolean),
      human: () => {
        console.log(`\n🧪 ${run.command}`);
        console.log(`   ${run.summary.passed} passed, ${run.summary.failed} failed, ${run.summary.skipped} skipped (${run.durationMs} ms)`);
        console.log(`   Evidence: ${path.relative(projectRoot, written.file)}`);

        if (!passed) {
          const tail = String(run.output || "").trim().split("\n").slice(-12).join("\n");
          if (tail) console.error(`\n${tail}\n`);
          console.error(
            "❌ Tests did not produce passing evidence. The run was recorded so the gate will refuse review.\n"
          );
        } else {
          console.log("✅ Tests passed. Review can now be approved.\n");
        }
      }
    });

    process.exit(passed ? EXIT.OK : EXIT.TEST_FAILED);
  });

// ---------- CHECK ----------
program
  .command("check")
  .description("Run the project's governance checks in one pass (doctor, validate, optionally tests)")
  .option("--json", "Print the result as JSON")
  .option("--tests", "Also run tests for every ongoing feature and record evidence")
  .option("--skip-doctor", "Skip the environment checks")
  .action((options) => {
    output.setJson(options.json);

    // `check` is a CI/pre-push command, not an approval. It may record test
    // evidence, but it never changes a gate, so it must work on a runner whose
    // git identity is not on the team roster.
    const projectRoot = process.cwd();
    const data = { doctor: null, validation: null, tests: [] };
    const blockers = [];
    const blockingChecks = new Set([
      "layout",
      "config",
      "state",
      "permissions",
      "adapters",
      "commonjs"
    ]);

    if (!options.skipDoctor) {
      const verdict = doctor.runChecks(projectRoot);
      data.doctor = verdict.checks;

      if (!verdict.ok) {
        blockers.push(
          ...verdict.checks
            .filter((check) => check.status === "fail" && blockingChecks.has(check.id))
            .map((check) => `doctor/${check.id}: ${check.message}`)
        );
      }
    }

    if (fs.existsSync(path.join(projectRoot, ".sdrive"))) {
      const { validateArtifacts } = require("../scripts/validate-governance");
      const validation = validateArtifacts(projectRoot, {});
      data.validation = { ok: validation.ok, results: validation.results, skipped: validation.skipped };

      if (!validation.ok) {
        blockers.push(
          ...validation.results
            .filter((entry) => entry.status === "invalid")
            .map((entry) => `validate/${entry.file}: ${entry.errors.length} schema error(s)`)
        );
      }
    }

    if (options.tests && blockers.length === 0) {
      const state = stateStore.readState(projectRoot) || { features: [] };

      for (const feature of state.features || []) {
        const version =
          (feature.versions || []).find((entry) => entry.id === feature.currentVersion) ||
          (feature.versions || [])[0];

        if (!version || version.phase === "completed") continue;

        try {
          const run = evidence.runTests(projectRoot, {});
          const written = evidence.writeEvidence(projectRoot, feature.name, version.id, run);
          const passed =
            run.exitCode === 0 &&
            Number(run.summary.failed) === 0 &&
            evidence.hasRecognisableResults(run);

          data.tests.push({
            feature: feature.name,
            version: version.id,
            ok: passed,
            summary: run.summary,
            evidence: path.relative(projectRoot, written.file)
          });

          if (!passed) blockers.push(`test/${feature.name}: exited ${run.exitCode}`);
        } catch (error) {
          data.tests.push({ feature: feature.name, version: version.id, ok: false, error: error.message });
          blockers.push(`test/${feature.name}: ${error.message}`);
        }
      }
    }

    const ok = blockers.length === 0;

    output.finish({
      command: "check",
      ok,
      code: ok ? EXIT.OK : EXIT.VALIDATION,
      data,
      blockers,
      human: () => {
        console.log("\n🔎 SpecDrive check\n");
        if (data.doctor) {
          const failed = data.doctor.filter((check) => check.status === "fail").length;
          const warned = data.doctor.filter((check) => check.status === "warn").length;
          console.log(
            `${failed === 0 ? "✅" : "❌"} doctor: ${data.doctor.length - failed - warned}/${data.doctor.length} ok${
              warned ? `, ${warned} warning(s)` : ""
            }`
          );
        }
        if (data.validation) {
          console.log(`${data.validation.ok ? "✅" : "❌"} validate: ${data.validation.results.length} artifact(s) checked`);
        }
        data.tests.forEach((entry) => {
          console.log(`${entry.ok ? "✅" : "❌"} test ${entry.feature}/${entry.version}: ${entry.error || `${entry.summary.passed} passed, ${entry.summary.failed} failed`}`);
        });
        console.log(ok ? "\n✅ All checks passed.\n" : "\n❌ Some checks failed.\n");
      }
    });

    process.exit(ok ? EXIT.OK : EXIT.VALIDATION);
  });

// ---------- PERMISSIONS ----------
program
  .command("permissions:check")
  .description("Verify every CLI and slash command has a permission rule")
  .option("--json", "Print the result as JSON")
  .action((options) => {
    output.setJson(options.json);

    const projectRoot = process.cwd();
    const permissionsFile = path.join(projectRoot, ".sdrive", "commands", "permissions.json");
    const rules = stateStore.readJson(permissionsFile, null);

    if (!rules) {
      process.exit(
        output.fail("permissions:check", EXIT.NOT_INITIALIZED, "❌ commands/permissions.json not found. Run `sdrive init` first.")
      );
    }

    const cliCommands = program.commands.map((command) => command.name());
    const cliRules = rules.cli || {};
    const slashRules = rules.rules || {};

    const missing = [...permissions.MUTATING].filter(
      (command) => cliCommands.includes(command) && !Array.isArray(cliRules[command])
    );
    const unknownCli = Object.keys(cliRules).filter((command) => !cliCommands.includes(command));
    const manifest = stateStore.readJson(
      path.join(projectRoot, ".sdrive", "commands", "manifest.json"),
      null
    );
    const slashCommands = manifest ? (manifest.commands || []).map((command) => command.command) : [];
    const missingSlash = slashCommands.filter((command) => !Array.isArray(slashRules[command]));

    const ok = missing.length === 0 && missingSlash.length === 0;

    output.finish({
      command: "permissions:check",
      ok,
      code: ok ? EXIT.OK : EXIT.VALIDATION,
      data: { missing, unknownCli, missingSlash },
      blockers: [
        ...missing.map((command) => `No CLI rule for mutating command: ${command}`),
        ...missingSlash.map((command) => `No slash rule for: ${command}`)
      ],
      warnings: unknownCli.map((command) => `Rule names an unknown CLI command: ${command}`),
      suppressAuto: true,
      human: () => {
        console.log("\n🔐 Permission coverage\n");
        if (missing.length) missing.forEach((command) => console.log(`   ❌ no CLI rule: ${command}`));
        if (missingSlash.length) missingSlash.forEach((command) => console.log(`   ❌ no slash rule: ${command}`));
        if (unknownCli.length) unknownCli.forEach((command) => console.log(`   ⚠️  unknown CLI command in rules: ${command}`));
        console.log(ok ? "\n✅ Every command has a rule.\n" : "\n❌ Permission coverage is incomplete.\n");
      }
    });

    process.exit(ok ? EXIT.OK : EXIT.VALIDATION);
  });

// ---------- AUDIT ----------
program
  .command("audit:verify")
  .description("Verify the hash chain of .sdrive/audit-log.json")
  .option("--json", "Print the result as JSON")
  .action((options) => {
    output.setJson(options.json);
    const verdict = auditLog.verifyAuditLog(process.cwd());

    output.finish({
      command: "audit:verify",
      ok: verdict.ok,
      code: verdict.ok ? EXIT.OK : EXIT.GATE_BLOCKED,
      data: verdict,
      blockers: verdict.ok ? [] : [verdict.reason],
      suppressAuto: true,
      human: () => {
        if (verdict.ok) console.log(`\n✅ Audit log verified: ${verdict.reason}.\n`);
        else console.error(`\n❌ Audit log verification failed: ${verdict.reason}.\n`);
      }
    });

    process.exit(verdict.ok ? EXIT.OK : EXIT.GATE_BLOCKED);
  });

// ---------- CONFIG GET / SET ----------
function parseConfigValue(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;

  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);

  if (/^[[{]/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return raw;
    }
  }

  return raw;
}

function readConfigOrExit(command) {
  const config = stateStore.readJson(stateStore.configPath(process.cwd()), null);

  if (!config) {
    process.exit(
      output.fail(command, EXIT.NOT_INITIALIZED, "❌ config.json not found. Run `sdrive init` first.")
    );
  }

  return config;
}

program
  .command("config:get <key>")
  .description("Read a value from .sdrive/config.json (dot path, e.g. governance.requireTestEvidence)")
  .option("--json", "Print the result as JSON")
  .action((key, options) => {
    output.setJson(options.json);
    const config = readConfigOrExit("config:get");
    const value = key.split(".").reduce((current, part) => (current == null ? undefined : current[part]), config);

    if (output.isJson()) {
      output.printJson({ ok: true, command: "config:get", code: EXIT.OK, data: { key, value } });
      return;
    }

    console.log(value === undefined ? `(not set)` : JSON.stringify(value));
  });

program
  .command("config:set <key> <value>")
  .description("Write a value to .sdrive/config.json (dot path; true/false/numbers/JSON are parsed)")
  .option("--json", "Print the result as JSON")
  .action((key, rawValue, options) => {
    output.setJson(options.json);
    requirePermission("config:set");

    const projectRoot = process.cwd();
    const config = readConfigOrExit("config:set");
    const parts = key.split(".").filter(Boolean);

    if (parts.length === 0) {
      process.exit(output.fail("config:set", EXIT.USAGE, "❌ config:set needs a key."));
    }

    if (parts.some((part) => ["__proto__", "constructor", "prototype"].includes(part))) {
      process.exit(output.fail("config:set", EXIT.USAGE, "❌ That config key is not allowed."));
    }

    let cursor = config;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      if (typeof cursor[part] !== "object" || cursor[part] === null) cursor[part] = {};
      cursor = cursor[part];
    }

    cursor[parts[parts.length - 1]] = parseConfigValue(rawValue);

    const verdict = stateStore.validateData(projectRoot, "config.schema.json", config);

    if (!verdict.ok) {
      process.exit(
        output.fail("config:set", EXIT.VALIDATION, `❌ Refusing to write an invalid config: ${verdict.errors.join("; ")}`)
      );
    }

    stateStore.writeJsonAtomic(stateStore.configPath(projectRoot), config);

    output.finish({
      command: "config:set",
      ok: true,
      code: EXIT.OK,
      data: { key, value: parseConfigValue(rawValue) },
      human: () => console.log(`✅ ${key} = ${JSON.stringify(parseConfigValue(rawValue))}`)
    });

    process.exit(EXIT.OK);
  });

// ---------- MIGRATION ADAPTERS ----------
program
  .command("migrate:detect")
  .description("Detect known spec-driven frameworks in this project")
  .option("--json", "Print the detections as JSON")
  .action((options) => {
    output.setJson(options.json);

    const detections = migrations.detectAll(process.cwd());
    const found = detections.filter((entry) => entry.detected);

    output.finish({
      command: "migrate:detect",
      ok: true,
      code: EXIT.OK,
      data: { detections, found: found.map((entry) => entry.id) },
      human: () => {
        console.log("\n🔎 Spec-driven frameworks\n");

        for (const entry of detections) {
          const icon = entry.detected ? "✅" : "—";
          const counts = Object.entries(entry.counts || {})
            .map(([key, value]) => `${key}=${value}`)
            .join(", ");
          console.log(`${icon} ${entry.id.padEnd(10)} ${entry.name}${counts ? ` (${counts})` : ""}`);
        }

        console.log(
          found.length
            ? `\nDetected: ${found.map((entry) => entry.id).join(", ")}\n`
            : "\nNo known spec-driven framework detected.\n"
        );
      }
    });

    process.exit(EXIT.OK);
  });

program
  .command("migrate:plan <framework>")
  .description("Show the source→target mapping for a framework without writing anything")
  .option("--json", "Print the plan as JSON")
  .option("--out <file>", "Write the plan JSON to a file")
  .action((framework, options) => {
    output.setJson(options.json);

    let plan;

    try {
      plan = migrations.buildPlan(process.cwd(), framework);
    } catch (error) {
      process.exit(output.fail("migrate:plan", EXIT.USAGE, `❌ ${error.message}`));
    }

    if (options.out) {
      stateStore.writeJsonAtomic(path.resolve(process.cwd(), options.out), plan);
    }

    output.finish({
      command: "migrate:plan",
      ok: plan.summary.conflicts === 0,
      code: plan.summary.conflicts === 0 ? EXIT.OK : EXIT.GATE_BLOCKED,
      data: plan,
      warnings: plan.features
        .filter((feature) => feature.notes && feature.notes.length)
        .flatMap((feature) => feature.notes.map((note) => `${feature.feature}: ${note}`)),
      human: () => {
        console.log(`\n🗺️  ${plan.name} → SpecDrive\n`);

        if (plan.features.length === 0) {
          console.log("No features found to migrate.\n");
          return;
        }

        for (const feature of plan.features) {
          console.log(`📁 ${feature.feature}  [${feature.status}]`);
          console.log(`   source: ${feature.source}`);
          console.log(`   target: ${feature.targetDir}`);
          feature.files.forEach((file) => {
            console.log(`   ${file.status.padEnd(11)} ${file.kind}: ${file.source || "(placeholder)"}`);
          });
          (feature.notes || []).forEach((note) => console.log(`   note: ${note}`));
          console.log("");
        }

        console.log(
          `Summary: ${plan.summary.ready} ready, ${plan.summary.partial} partial, ${plan.summary.conflicts} conflict(s).\n`
        );
      }
    });

    process.exit(plan.summary.conflicts === 0 ? EXIT.OK : EXIT.GATE_BLOCKED);
  });

program
  .command("migrate:apply <framework>")
  .description("Import a framework's specs as SpecDrive backlog/ongoing drafts (requires --yes)")
  .option("--yes", "Apply the migration")
  .option("--dry-run", "Show the plan without writing")
  .option("--json", "Print the result as JSON")
  .action((framework, options) => {
    output.setJson(options.json);
    requirePermission("migrate:apply");

    let plan;

    try {
      plan = migrations.buildPlan(process.cwd(), framework);
    } catch (error) {
      process.exit(output.fail("migrate:apply", EXIT.USAGE, `❌ ${error.message}`));
    }

    if (plan.features.length === 0) {
      process.exit(output.fail("migrate:apply", EXIT.GATE_BLOCKED, "❌ No features found to migrate."));
    }

    if (options.dryRun || !options.yes) {
      output.finish({
        command: "migrate:apply",
        ok: true,
        code: EXIT.OK,
        data: { plan },
        human: () => {
          console.log(`\nPlanned migration: ${plan.summary.features} feature(s), ${plan.summary.conflicts} conflict(s).`);
          console.log("Nothing was written. Re-run with --yes to apply.\n");
        }
      });
      process.exit(EXIT.OK);
    }

    let applied;

    try {
      applied = migrationApply.applyPlan(process.cwd(), plan);
    } catch (error) {
      process.exit(output.fail("migrate:apply", EXIT.ERROR, `❌ Migration failed: ${error.message}`));
    }

    const verification = migrationLifecycle.verifyMigration(process.cwd(), applied.report.migrationId);
    const failed = applied.report.counts.failed > 0 || !verification.ok;

    output.finish({
      command: "migrate:apply",
      ok: !failed,
      code: failed ? EXIT.VALIDATION : EXIT.OK,
      data: { report: applied.report, verification },
      blockers: verification.blockers,
      warnings: verification.warnings,
      human: () => {
        console.log(`\n✅ Migration ${applied.report.migrationId}`);
        console.log(`   Imported: ${applied.report.counts.imported}`);
        console.log(`   Skipped:  ${applied.report.counts.skipped}`);
        console.log(`   Failed:   ${applied.report.counts.failed}`);
        console.log(`   Report:   ${path.relative(process.cwd(), applied.reportFile)}`);
        console.log(`\nVerify:  sdrive migrate:verify ${applied.report.migrationId}`);
        console.log(`Rollback: sdrive migrate:rollback ${applied.report.migrationId}\n`);
      }
    });

    process.exit(failed ? EXIT.VALIDATION : EXIT.OK);
  });

program
  .command("migrate:verify <migrationId>")
  .description("Verify that a migration imported every expected file (and optionally validate schemas)")
  .option("--strict", "Also validate the migrated governance JSON against the schemas")
  .option("--json", "Print the result as JSON")
  .action((migrationId, options) => {
    output.setJson(options.json);

    let verification;

    try {
      verification = migrationLifecycle.verifyMigration(process.cwd(), migrationId, {
        strict: Boolean(options.strict)
      });
    } catch (error) {
      process.exit(output.fail("migrate:verify", EXIT.USAGE, `❌ ${error.message}`));
    }

    output.finish({
      command: "migrate:verify",
      ok: verification.ok,
      code: verification.ok ? EXIT.OK : EXIT.VALIDATION,
      data: verification,
      blockers: verification.blockers,
      warnings: verification.warnings,
      suppressAuto: true,
      human: () => {
        console.log(`\nMigration ${migrationId}: ${verification.ok ? "✅ verified" : "❌ failed"}\n`);
        verification.features.forEach((feature) => {
          console.log(`${feature.status === "present" ? "✅" : "❌"} ${feature.feature}${feature.missing.length ? ` - missing ${feature.missing.join(", ")}` : ""}`);
        });
        verification.blockers.forEach((blocker) => console.error(`❌ ${blocker}`));
        verification.warnings.forEach((warning) => console.warn(`⚠️  ${warning}`));
        console.log("");
      }
    });

    process.exit(verification.ok ? EXIT.OK : EXIT.VALIDATION);
  });

program
  .command("migrate:rollback <migrationId>")
  .description("Restore workflow state and remove files created by a migration")
  .option("--json", "Print the result as JSON")
  .action((migrationId, options) => {
    output.setJson(options.json);
    requirePermission("migrate:rollback");

    let result;

    try {
      result = migrationLifecycle.rollbackMigration(process.cwd(), migrationId);
    } catch (error) {
      process.exit(output.fail("migrate:rollback", EXIT.USAGE, `❌ ${error.message}`));
    }

    output.finish({
      command: "migrate:rollback",
      ok: result.ok,
      code: result.ok ? EXIT.OK : EXIT.ERROR,
      data: result,
      blockers: result.blockers || [],
      human: () => {
        if (result.alreadyRolledBack) {
          console.log(`\n✅ Migration ${migrationId} was already rolled back.\n`);
          return;
        }

        console.log(`\n${result.ok ? "✅" : "❌"} Migration ${migrationId} rolled back.`);
        console.log("   Workflow state restored; migration-created files removed.\n");
      }
    });

    process.exit(result.ok ? EXIT.OK : EXIT.ERROR);
  });

program.parse(process.argv);