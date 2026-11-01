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
const mcp = require("./lib/mcp");
const knowledge = require("./lib/knowledge");
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

// Which CLI wrote `.sdrive/` is not the same question as which CLI is running now.
//
// A refusal that reads as impossible - "approve implementation, but implementation must
// be approved first" - is almost always version skew: the rule being enforced belongs to
// the installed copy, not to the binary in front of the user. `sdrive doctor` already
// reports this as manifest drift, but nobody runs doctor while staring at a refusal, so
// the gate commands say it at the point where it costs something.
function frameworkVersionNotice(projectRoot) {
  try {
    const installed = manifest.readManifest(projectRoot);
    const running = manifest.packageVersion();

    if (!installed || !installed.cliVersion || installed.cliVersion === running) {
      return null;
    }

    return `.sdrive/ was installed by specdrive-cli ${installed.cliVersion}, but this CLI is ${running}. Run \`sdrive update\` so the project and the CLI enforce the same rules.`;
  } catch (error) {
    return null;
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

// The hosted knowledge servers are on by default. Projects can opt out without
// losing the SpecDrive governance server by setting mcp.defaultServers to false
// in .sdrive/config.json, or by running `sdrive mcp:sync --no-knowledge`.
function defaultMcpServersEnabled(projectRoot = process.cwd()) {
  if (process.env.SDRIVE_NO_DEFAULT_MCP === "1" || process.env.SDRIVE_NO_DEFAULT_MCP === "true") {
    return false;
  }

  const config = stateStore.readJson(path.join(projectRoot, ".sdrive", "config.json"), null);
  return !(config && config.mcp && config.mcp.defaultServers === false);
}

function printMcpResult(result) {
  const relative = path.relative(process.cwd(), result.path) || result.path;
  const added = result.added.length > 0 ? ` (${result.added.join(", ")})` : "";

  if (result.status === "created") {
    console.log(`  + Created: ${relative}${added}`);
  } else if (result.status === "merged") {
    console.log(`  + Updated: ${relative}${added}`);
  } else if (result.status === "would-create") {
    console.log(`  + Would create: ${relative}${added}`);
  } else if (result.status === "would-merge") {
    console.log(`  + Would update: ${relative}${added}`);
  } else if (result.status === "unchanged") {
    console.log(`  = Already configured: ${relative}`);
  } else {
    console.error(`  x ${relative}: ${result.error}`);
  }
}

// Wires every MCP client implied by the selected tools, without prompting.
function autoWireMcp(selectedTools, options = {}) {
  const clientNames = new Set();

  selectedTools.forEach((tool) => {
    const clientName = mcp.clientNameForId(tool.mcpClient);
    if (clientName) clientNames.add(clientName);
  });

  if (clientNames.size === 0) return;

  const available = mcp.getMcpConfigPaths({ projectRoot: process.cwd() });
  const targets = available.filter((p) => clientNames.has(p.name));

  if (targets.length === 0) return;

  const includeKnowledge =
    options.includeKnowledge === undefined
      ? defaultMcpServersEnabled()
      : options.includeKnowledge;

  console.log("\n🔌 MCP Wiring\n");

  targets.forEach((target) => {
    const result = mcp.safeMergeMcpConfig(target.path, target.name, mcpServerPath(), {
      includeKnowledge
    });
    printMcpResult(result);
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
              requireStructuredReview: true,
              // The security and performance audits inside review are off by default so
              // an upgrade never refuses a feature that was already in flight. Turn them
              // on per project: `sdrive config:set governance.requireReviewSecurity true`.
              // `allowUnverified*` is the documented escape hatch for environments that
              // cannot run a scanner or start the app - without it, review would deadlock
              // in CI.
              requireReviewSecurity: false,
              requireReviewPerformance: false,
              allowUnverifiedSecurity: false,
              allowUnverifiedPerformance: false,
              // Red-before-green: a test that also passes without the change proves
              // nothing. Off for new projects too, because it costs a second suite run;
              // switching it on stamps the cutoff, so only work proposed afterwards is
              // governed and anything already in flight stays grandfathered.
              requireRedGreen: false
            },
            mcp: {
              // Hosted knowledge servers are wired by default. Set this to
              // false to keep only the SpecDrive governance server.
              defaultServers: true
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
      fs.writeFileSync(
        mcpConfigPath,
        `${JSON.stringify(
          {
            name: "specdrive",
            version: getCliVersion(),
            description: "SpecDrive MCP server"
          },
          null,
          2
        )}\n`
      );
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
      console.log("   Your specs, governance, and constitution were left untouched.");
      if (defaultMcpServersEnabled(projectRoot)) {
        console.log("   Run `sdrive mcp:sync` to add the built-in knowledge servers to existing MCP configs.\n");
      } else {
        console.log("");
      }
    }
  });

// ---------- MCP COMMANDS ----------
program
  .command("mcp:list")
  .description("List the built-in MCP servers and the client configs SpecDrive can wire")
  .option("--json", "Print the result as JSON")
  .action((options) => {
    output.setJson(options.json);

    const projectRoot = process.cwd();
    const serverPath = mcpServerPath();
    const defaults = mcp.DEFAULT_KNOWLEDGE_SERVERS.map((server) => ({
      name: server.name,
      label: server.label,
      url: server.url,
      purpose: server.purpose
    }));

    const clients = mcp.getMcpConfigPaths({ projectRoot }).map((target) => {
      const client = mcp.clientConfig(target.name);
      const expected = Object.keys(mcp.defaultEntries(target.name, serverPath));
      const read = mcp.readMcpConfig(target.path);
      const configuredEntries =
        read.exists && read.config && read.config[client.key] && typeof read.config[client.key] === "object"
          ? Object.keys(read.config[client.key])
          : [];

      return {
        id: target.id,
        name: target.name,
        path: target.path,
        exists: read.exists,
        error: read.error,
        servers: configuredEntries,
        missing: read.exists && !read.error
          ? expected.filter((name) => !configuredEntries.includes(name))
          : expected
      };
    });

    output.finish({
      command: "mcp:list",
      ok: true,
      data: { defaults, clients },
      human: () => {
        console.log("\nBuilt-in MCP servers\n");
        printTable(
          ["SERVER", "TYPE", "ENDPOINT"],
          [
            ["specdrive", "stdio", ".sdrive/mcp/server.js"],
            ...defaults.map((server) => [server.name, "http", server.url])
          ]
        );
        console.log("\nClient configs\n");
        printTable(
          ["CLIENT", "FILE", "STATUS"],
          clients.map((client) => [
            client.name,
            path.relative(projectRoot, client.path) || client.path,
            client.error
              ? "invalid JSON"
              : !client.exists
                ? "not configured"
                : client.missing.length === 0
                  ? "wired"
                  : `missing: ${client.missing.join(", ")}`
          ])
        );
        console.log("\nRun `sdrive mcp:sync` to add defaults to existing configs.");
        console.log("Run `sdrive mcp:sync --all` to create configs for every supported client.\n");
      }
    });

    process.exit(EXIT.OK);
  });

program
  .command("mcp:sync")
  .description("Add SpecDrive and the default knowledge MCP servers to AI client configs")
  .option("--client <id>", "One client: claude-desktop, cursor, cline, roo, gemini-cli, vscode")
  .option("--all", "Create or update every supported client config")
  .option("--no-knowledge", "Only wire the SpecDrive governance server")
  .option("--dry-run", "Show what would change without writing files")
  .option("--json", "Print the result as JSON")
  .action((options) => {
    output.setJson(options.json);

    if (!options.dryRun) {
      requirePermission("mcp:sync");
    }

    const projectRoot = process.cwd();
    const clientName = options.client ? mcp.resolveClientName(options.client) : null;

    if (options.client && !clientName) {
      process.exit(
        output.fail(
          "mcp:sync",
          EXIT.USAGE,
          `Unknown MCP client "${options.client}". Use one of: claude-desktop, cursor, cline, roo, gemini-cli, vscode.`
        )
      );
    }

    const available = mcp.getMcpConfigPaths({ projectRoot });
    let targets;

    if (clientName) {
      targets = available.filter((target) => target.name === clientName);
    } else if (options.all) {
      targets = available;
    } else {
      targets = available.filter((target) => fs.existsSync(target.path));
    }

    if (targets.length === 0) {
      if (clientName) {
        process.exit(
          output.fail(
            "mcp:sync",
            EXIT.USAGE,
            `MCP client "${clientName}" is not available on this platform. On Windows, Claude Desktop needs APPDATA to be set.`
          )
        );
      }

      output.finish({
        command: "mcp:sync",
        ok: true,
        data: { results: [] },
        human: () => {
          console.log("\nNo MCP config files found.");
          console.log("Use --client <id> to create one, or --all for every supported client.\n");
        }
      });
      process.exit(EXIT.OK);
    }

    const includeKnowledge =
      options.knowledge !== false && defaultMcpServersEnabled(projectRoot);
    const serverPath = mcpServerPath();
    const results = targets.map((target) =>
      mcp.safeMergeMcpConfig(target.path, target.name, serverPath, {
        includeKnowledge,
        dryRun: options.dryRun === true
      })
    );
    const errors = results.filter((result) => result.status === "error");

    output.finish({
      command: "mcp:sync",
      ok: errors.length === 0,
      code: errors.length === 0 ? EXIT.OK : EXIT.ERROR,
      data: { results, includeKnowledge },
      blockers: errors.map((result) => result.error),
      suppressAuto: true,
      human: () => {
        console.log(`\nMCP sync${options.dryRun ? " (dry run)" : ""}\n`);
        results.forEach(printMcpResult);
        console.log("");
      }
    });

    process.exit(errors.length === 0 ? EXIT.OK : EXIT.ERROR);
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
// The review record survives the session, and so does the handoff. A FAIL verdict
// carries a `remediation` block naming the command that clears each finding, so a
// developer who reopens the project in another editor - or on another machine - learns
// what to do from `sdrive status` instead of from a chat log that no longer exists.
// Without it the answer is "run the tests", which is true and useless when the finding
// is a leaked key.
function remediationFor(feature, version, root) {
  if (!feature || !version || !version.id) {
    return null;
  }

  const record = stateStore.readJson(
    path.join(root, ".sdrive", "governance", feature.name, version.id, "review.json"),
    null
  );

  if (!record || record.status === "PASS") {
    return null;
  }

  const remediation = record.remediation || {};
  const items = Array.isArray(remediation.items)
    ? remediation.items.filter((item) => item && item.fixWith)
    : [];

  if (items.length === 0) {
    return null;
  }

  const round = Number(remediation.round) || 1;
  const first = items[0];
  const others = items.length > 1 ? ` (and ${items.length - 1} more on the list)` : "";
  const tail =
    round >= 3
      ? " Round 3 of 3 - if this finding is no smaller than the last round, stop and hand it to a human."
      : " After the fix: `sdrive test`, then `/sdrive:review`.";

  return {
    command: first.fixWith,
    reason: `Review FAILED, round ${round} of 3: ${first.finding}${others}.${tail}`
  };
}

function nextActionFor(feature, version, root) {
  // Gate state is read through the shared accessors, never by comparing the
  // stored string here. A second copy of "what approved means" is exactly the
  // drift commands/gates.js exists to prevent.
  const { GATE_ORDER, isGateApprovedFor } = require("../commands/gates");
  const gates = (version && version.gates) || {};
  const pending = GATE_ORDER.find((gate) => !isGateApprovedFor(version, gate));

  // A failed review is not an unrun one. Consult the recorded handoff first, so the
  // next command names the audit that must clear the finding rather than the tests
  // that already pass.
  if (pending === "review") {
    const remediation = remediationFor(feature, version, root || process.cwd());

    if (remediation) {
      return remediation;
    }
  }

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
        const action = nextActionFor(feature, version, projectRoot);
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

    // Shared branches: features recording the same branch are ONE review unit, so the number
    // worth knowing first is how many of them are review-ready. Derived from `branch`
    // equality - the same rule archive:check enforces - with nothing stored.
    const branchGroups = new Map();

    features.forEach((feature) => {
      if (!feature.branch) return;
      if (!branchGroups.has(feature.branch)) branchGroups.set(feature.branch, []);
      branchGroups.get(feature.branch).push(feature);
    });

    const sharedBranches = [...branchGroups.entries()].filter(([, list]) => list.length > 1);

    if (sharedBranches.length > 0) {
      console.log("\nShared branches\n");

      // Only commands/gates.js may name a gate value. `allGatesApproved` is the accessor
      // that knows what "every gate cleared" means, and it is deliberately false when no
      // gates are recorded - "nothing recorded" is not "everything approved".
      const { allGatesApproved } = require("../commands/gates");

      sharedBranches.forEach(([branch, list]) => {
        const ready = list.filter((feature) => {
          const version =
            feature.versions.find((entry) => entry.id === feature.currentVersion) ||
            feature.versions[0];

          return version ? allGatesApproved(version) : false;
        }).length;

        console.log(
          `   ${branch} — ${ready}/${list.length} review-ready (${list
            .map((feature) => feature.name)
            .join(", ")})`
        );
      });

      console.log("");
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

        // Reported whether the verdict passes or not: a refusal produced by a different
        // CLI version than the one installed is unreproducible from the user's side.
        const versionNotice = frameworkVersionNotice(projectRoot);
        const warnings = [...(verdict.warnings || [])];

        if (versionNotice) warnings.push(versionNotice);

        if (!verdict.ok) {
          return {
            ok: false,
            code: EXIT.GATE_BLOCKED,
            blockers: verdict.blockers,
            warnings,
            data: { feature: featureName, version: version.id, gate }
          };
        }

        if (verdict.approved) {
          return {
            ok: true,
            already: true,
            warnings,
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
          warnings,
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
          (outcome.warnings || []).forEach((warning) => console.error(`⚠️  ${warning}`));
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
  // The dashboard is copied into the project, but its validator requires ajv.
  // A freshly initialized project has no node_modules, so point the child at the
  // dependencies that shipped with this CLI. Without this the dashboard starts
  // but /api/validate reports that it cannot find ajv.
  const packageNodeModules = path.join(__dirname, "..", "node_modules");
  const nodePath = [packageNodeModules, process.env.NODE_PATH]
    .filter(Boolean)
    .join(path.delimiter);

  try {
    execSync(`node "${scriptPath}"`, {
      stdio: "inherit",
      env: { ...process.env, NODE_PATH: nodePath }
    });
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
    console.log(`   It now shows ${path.basename(projectRoot)} — no second server was started.`);
    console.log(`\n   To switch projects, open ${url} and either:`);
    console.log('     • click the project name in the top bar, or');
    console.log('     • choose "Projects" in the sidebar to see every project.\n');
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
    if (options.mcpClient && !mcp.clientNameForId(options.mcpClient)) {
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
  .option("--prove", "Also run the suite at the base commit to record red-before-green evidence")
  .option("--base <ref>", "Base ref to prove against (defaults to the feature's base branch)")
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

    // Red-before-green is opt-in per invocation, not per project: running the suite
    // twice is expensive and only worth it when the evidence is about to be used to
    // approve review. The acceptance criteria come from traceability - the same list
    // the review gate measures coverage against - so "proven" and "covered" describe
    // the same set and cannot drift.
    let proof = null;

    if (options.prove && passed) {
      const traceJson = stateStore.readJson(
        path.join(
          evidence.governanceDir(projectRoot, feature, versionId),
          "traceability.json"
        ),
        null
      );
      const { collectTestedAcceptanceCriteria } = require("../commands/gates");

      proof = require("./lib/redgreen").prove(projectRoot, {
        feature,
        versionId,
        base: options.base,
        command: run.command,
        timeoutMs: options.timeout ? Number(options.timeout) : undefined,
        acs: collectTestedAcceptanceCriteria(traceJson)
      });
    }

    const written = evidence.writeEvidence(projectRoot, feature, versionId, run, {
      ...(proof && proof.ok && proof.entries.length
        ? { redGreen: proof.entries, redGreenBase: proof.base }
        : {})
    });
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
        acIds: run.acIds,
        redGreen:
          proof && proof.ok
            ? {
                base: proof.base,
                proven: proof.entries.filter((entry) => entry.proven).map((entry) => entry.ac),
                unproven: proof.entries.filter((entry) => !entry.proven).map((entry) => entry.ac)
              }
            : null
      },
      warnings: [
        ...(options.prove && proof && !proof.ok ? [`Red-before-green not recorded: ${proof.reason}`] : []),
        ...(options.prove && proof && proof.ok
          ? proof.entries
              .filter((entry) => !entry.proven)
              .slice(0, 5)
              .map(
                (entry) =>
                  `${entry.ac} is covered by tests that also pass at ${proof.base}, so they do not depend on this change.`
              )
          : [])
      ],
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

        if (proof && proof.ok) {
          const unproven = proof.entries.filter((entry) => !entry.proven).length;

          console.log(
            `   Red-before-green: ${proof.entries.length - unproven} of ${proof.entries.length} criteria fail at ${proof.base}` +
              (unproven > 0 ? ` — ${unproven} pass without the change` : "")
          );
        }

        if (options.prove && proof && !proof.ok) {
          console.log(`   ⚠️  Red-before-green not recorded: ${proof.reason}`);
        }

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

    // Switching red-before-green on is what defines the cutoff, because that is the
    // moment the rule starts applying. Stamping it here - not in `sdrive update` - keeps
    // the promise that only work proposed afterwards is governed: everything already in
    // the project carries an earlier timestamp and is grandfathered.
    if (
      key === "governance.requireRedGreen" &&
      parseConfigValue(rawValue) === true &&
      typeof (config.governance || {}).redGreenEnforceFrom !== "string"
    ) {
      config.governance = config.governance || {};
      config.governance.redGreenEnforceFrom = new Date().toISOString();
    }

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

// ---------- CONTEXT7 KNOWLEDGE FALLBACK ----------
program
  .command("knowledge:fetch [library]")
  .description("Download current library docs from Context7 into .sdrive/context/external/")
  .option("--query <query>", "Topic to focus the download on", knowledge.DEFAULT_QUERY)
  .option("--library-id <id>", "Use a Context7 library id directly, e.g. /vercel/next.js")
  .option("--tokens <n>", "Approximate token budget", String(knowledge.DEFAULT_TOKENS))
  .option("--out <path>", "Write to a custom file (relative to the project root)")
  .option("--force", "Replace a file SpecDrive did not generate")
  .option("--json", "Print the result as JSON")
  .action((library, options) => {
    output.setJson(options.json);
    requirePermission("knowledge:fetch");

    const projectRoot = process.cwd();

    if (!fs.existsSync(path.join(projectRoot, ".sdrive"))) {
      process.exit(
        output.fail(
          "knowledge:fetch",
          EXIT.NOT_INITIALIZED,
          "❌ No .sdrive folder found. Run `sdrive init` first."
        )
      );
    }

    const tokens = Number(options.tokens);

    if (!Number.isInteger(tokens) || tokens <= 0) {
      process.exit(
        output.fail("knowledge:fetch", EXIT.USAGE, "❌ --tokens must be a positive integer.")
      );
    }

    knowledge
      .fetchAndWriteContext({
        projectRoot,
        library,
        libraryId: options.libraryId,
        query: options.query,
        tokens,
        out: options.out,
        force: options.force
      })
      .then((result) => {
        output.finish({
          command: "knowledge:fetch",
          ok: true,
          code: EXIT.OK,
          data: {
            library: result.library.id,
            title: result.library.title,
            query: result.query,
            tokens: result.tokens,
            path: result.path,
            bytes: result.bytes,
            overwritten: result.overwritten,
            fetchedAt: result.fetchedAt
          },
          human: () => {
            console.log(`\n${result.overwritten ? "Updated" : "Downloaded"} Context7 knowledge\n`);
            console.log(`  Library: ${result.library.title || result.library.id}`);
            console.log(`  ID:      ${result.library.id}`);
            console.log(`  Query:   ${result.query}`);
            console.log(`  Tokens:  ${result.tokens}`);
            console.log(`  File:    ${path.relative(projectRoot, result.path) || result.path}\n`);
          }
        });

        process.exit(EXIT.OK);
      })
      .catch((error) => {
        process.exit(
          output.fail("knowledge:fetch", EXIT.ERROR, `❌ Context7 fetch failed: ${error.message}`)
        );
      });
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

// ---------- GROUP RESOLVE ----------
// `/sdrive:propose [wave1 p2]` is a selection, not a feature name: inside the brackets a
// comma separates items and a space filters them. The agent must not guess what that means,
// so the resolver lives in scripts/lib/group.js and this command exposes it as JSON - one
// implementation, one contract, and a result the agent shows the user before creating
// anything.
program
  .command("group:resolve <expression>")
  .description("Resolve a group expression such as [wave1 p2] against .sdrive/product/backlog.md")
  .option("--json", "Print the resolved group as JSON")
  .option("--exclude-gated", "Drop items that need access from outside the repository")
  .option("--allow-gated", "Treat gated items as shareable (they will hold the whole branch)")
  .action((expression, options) => {
    output.setJson(options.json);
    requirePermission("group:resolve");

    const projectRoot = process.cwd();
    const sdriveRoot = path.join(projectRoot, ".sdrive");

    if (!fs.existsSync(sdriveRoot)) {
      process.exit(
        output.fail(
          "group:resolve",
          EXIT.NOT_INITIALIZED,
          "❌ No .sdrive/ directory. Run `sdrive init` first."
        )
      );
    }

    const groupLib = require("../scripts/lib/group");
    const { parseBacklog, annotateBacklog } = require("../scripts/lib/product-plan");

    const backlogPath = path.join(sdriveRoot, "product", "backlog.md");
    const markdown = fs.existsSync(backlogPath) ? fs.readFileSync(backlogPath, "utf8") : "";
    const parsed = groupLib.parseExpression(expression);
    const body = parsed.isGroup ? parsed.expression : expression;
    const resolved = groupLib.resolveGroup({
      expression: body,
      // Annotated, because `waveN` selects the dependency-derived wave: the raw rows only have
      // a milestone number, and silently matching that instead would select the wrong items on
      // any plan where a milestone holds more than one wave.
      backlog: annotateBacklog(parseBacklog(markdown))
    });

    // `--exclude-gated` is the mechanical form of "drop anything whose access is not
    // confirmed": the item stays in the backlog, it just does not join this wave.
    if (options.excludeGated) {
      resolved.matched = resolved.matched.filter((item) => !item.gated);
    }

    const branchSuggestion = `feature/${groupLib.suggestBranchName(body)}`;

    // Whether these features can share ONE branch. This is not a failure - the user still
    // decides - but they decide knowing which members would hold the whole group.
    const sharedBranch = groupLib.checkGroupShareable(resolved, {
      allowGated: options.allowGated === true
    });

    // Only topologies that can reach archive. A decision cannot pass a gate in any
    // topology, and a gated member would hold a shared branch, so neither is offered as a
    // choice the user can pick and regret.
    const topology = groupLib.topologies(resolved);

    // `[b1]` is a declaration, not a preference: the batch was written by hand in the
    // backlog, so a batch that cannot finish is an error to fix there.
    const batchVerdict = resolved.batch ? groupLib.checkBatch(resolved) : null;
    const impliesSharedBranch = Boolean(resolved.batch);
    const blockers = [];

    if (batchVerdict && !batchVerdict.ok) blockers.push(...batchVerdict.blockers);

    if (resolved.matched.length === 0) {
      blockers.push(
        markdown
          ? `Nothing in .sdrive/product/backlog.md matches "${body}".`
          : "No .sdrive/product/backlog.md, so a group can only name features directly."
      );
    }

    resolved.emptyQueries.forEach((query) => {
      blockers.push(`"${query}" matched no backlog item.`);
    });

    const ok = blockers.length === 0;

    output.finish({
      command: "group:resolve",
      ok,
      code: ok ? EXIT.OK : EXIT.VALIDATION,
      data: {
        ...resolved,
        branchSuggestion,
        sharedBranch,
        batchVerdict,
        impliesSharedBranch,
        topology,
        backlog: path.relative(projectRoot, backlogPath),
        available: resolved.available
      },
      blockers,
      suppressAuto: true,
      human: () => {
        console.log(`\n📦 Group: [${body}]\n`);

        resolved.matched.forEach((item) => {
          // `status` and `kind` are shown because a wave query also returns rows that are
          // already `completed`, are decisions, or are release steps - the confirm step is
          // where they get dropped, so the list has to say which ones they are.
          const meta = [item.milestone, item.priority, item.kind, item.status]
            .filter(Boolean)
            .join(" ");
          const gate = item.gated ? "  ⛔ needs access" : "";

          console.log(
            `   ${String(item.id || "-").padEnd(7)} ${item.name}${meta ? `  (${meta})` : ""}${gate}`
          );
        });

        console.log(
          `\n   ${resolved.matched.length} feature(s) · suggested branch: ${branchSuggestion}`
        );

        if (sharedBranch.blockers.length > 0 || sharedBranch.warnings.length > 0) {
          console.log("\n   Shared branch:");

          sharedBranch.blockers.forEach((blocker) => console.log(`   ⛔ ${blocker}`));
          sharedBranch.warnings.forEach((warning) => console.log(`   ⚠️  ${warning}`));
        }

        if (topology.options.length > 0) {
          console.log("\n   Branch options that can finish:");

          topology.options
            .filter((option) => option.ok)
            .forEach((option, index) => {
              console.log(`     ${index + 1}. ${option.label}`);
              console.log(`        ${option.note}`);
            });

          topology.options
            .filter((option) => !option.ok)
            .forEach((option) => {
              console.log(`     not offered - ${option.label}`);
              option.reasons.forEach((reason) => console.log(`        ${reason}`));
            });
        }

        topology.excluded.forEach((entry) => {
          console.log(
            `\n   Not proposed as a feature: ${entry.item} (${entry.kind}) - ${entry.reason}`
          );
        });

        if (impliesSharedBranch) {
          console.log(
            `\n   Batch ${resolved.batch}: ONE branch (declared in the backlog), merged once when every member passes review.`
          );
        }

        if (ok) {
          console.log("   Nothing has been created yet - /sdrive:propose creates each feature.\n");
          return;
        }

        blockers.forEach((blocker) => console.error(`   • ${blocker}`));

        const { waves, milestones, priorities } = resolved.available;

        if (waves.length || milestones.length || priorities.length) {
          console.error(
            `\n   Selectable: ${waves.map((wave) => `w${wave}`).join(", ") || "no waves"}` +
              ` | ${milestones.map((m) => `m${m}`).join(", ") || "no milestones"}` +
              ` | ${priorities.map((p) => `p${p}`).join(", ") || "no priorities"}\n`
          );
        }
      }
    });

    process.exit(ok ? EXIT.OK : EXIT.VALIDATION);
  });

program.parse(process.argv);