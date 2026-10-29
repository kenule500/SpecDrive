// `sdrive doctor` checks.
//
// Every check answers one question a user would otherwise have to answer by
// reading five files. Results are structured so `--json`, the dashboard, and CI
// can consume the same verdict as the terminal.
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const { readJson, validateData, sdriveDir } = require("./state");
const { checkManifest: checkManifestVerdict, writeManifest, packageVersion } = require("./manifest");
const { verifyAuditLog } = require("./audit");
const { actor, roleOf } = require("./permissions");
const { resolveTestCommand } = require("./evidence");

const REQUIRED_FILES = ["config.json", "team.json", "workflow-state.json"];
const REQUIRED_DIRS = [
  "commands",
  "schemas",
  "scripts",
  "agents",
  "templates",
  "dashboard",
  "mcp",
  "migrations"
];

function result(id, status, message, fix) {
  return { id, status, message, ...(fix ? { fix } : {}) };
}

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  return major >= 18
    ? result("node", "ok", `Node ${process.versions.node} satisfies >=18`)
    : result("node", "fail", `Node ${process.versions.node} is older than the supported >=18`);
}

function checkGit(projectRoot) {
  const { gitOrEmpty } = require("./execute");
  const name = gitOrEmpty(["config", "user.name"], projectRoot);

  if (!name) {
    return result(
      "git-identity",
      "warn",
      "git config user.name is not set; audit entries fall back to the OS username"
    );
  }

  return result("git-identity", "ok", `git identity: ${name}`);
}

function checkLayout(projectRoot) {
  const root = sdriveDir(projectRoot);
  const missing = [];

  if (!fs.existsSync(root)) {
    return result("layout", "fail", "No .sdrive/ directory. Run `sdrive init` first.");
  }

  REQUIRED_FILES.forEach((file) => {
    if (!fs.existsSync(path.join(root, file))) missing.push(file);
  });
  REQUIRED_DIRS.forEach((dir) => {
    if (!fs.existsSync(path.join(root, dir))) missing.push(`${dir}/`);
  });

  if (missing.length > 0) {
    return result("layout", "fail", `.sdrive/ is missing: ${missing.join(", ")}`);
  }

  return result("layout", "ok", ".sdrive/ has the expected files and directories");
}

function checkConfig(projectRoot) {
  const file = path.join(sdriveDir(projectRoot), "config.json");
  const config = readJson(file, null);

  if (!config) {
    return result("config", "fail", "config.json is missing or unreadable");
  }

  const verdict = validateData(projectRoot, "config.schema.json", config);

  if (!verdict.ok) {
    return result("config", "fail", `config.json is invalid: ${verdict.errors.join("; ")}`);
  }

  return result("config", "ok", "config.json is valid");
}

function checkState(projectRoot) {
  const file = path.join(sdriveDir(projectRoot), "workflow-state.json");
  const state = readJson(file, null);

  if (!state) {
    return result("state", "fail", "workflow-state.json is missing or unreadable");
  }

  const verdict = validateData(projectRoot, "workflow-state.schema.json", state);

  if (!verdict.ok) {
    return result("state", "fail", `workflow-state.json is invalid: ${verdict.errors.join("; ")}`);
  }

  return result("state", "ok", "workflow-state.json is valid");
}

function checkTeam(projectRoot) {
  const team = readJson(path.join(sdriveDir(projectRoot), "team.json"), null);

  if (!team) {
    return result("team", "fail", "team.json is missing");
  }

  const members = Array.isArray(team.members) ? team.members : [];

  if (members.length === 0) {
    return result(
      "team",
      "fail",
      "team.json has no members; gated commands will be denied",
      "sdrive team:add <your-git-username> admin"
    );
  }

  const who = actor(projectRoot);
  const role = roleOf(team, who);

  if (!role) {
    return result(
      "team",
      "warn",
      `"${who}" is not on the roster; commands will be denied for this user`,
      `sdrive team:add "${who}" admin`
    );
  }

  return result("team", "ok", `${members.length} member(s); "${who}" is ${role}`);
}

function checkPermissions(projectRoot) {
  const permissions = readJson(
    path.join(sdriveDir(projectRoot), "commands", "permissions.json"),
    null
  );

  if (!permissions) {
    return result("permissions", "fail", "commands/permissions.json is missing");
  }

  const { MUTATING } = require("./permissions");
  const rules = permissions.cli || {};
  const missing = [...MUTATING].filter((command) => !Array.isArray(rules[command]));

  if (missing.length > 0) {
    return result(
      "permissions",
      "fail",
      `No rule for mutating command(s): ${missing.join(", ")}`
    );
  }

  return result("permissions", "ok", "every mutating CLI command has a permission rule");
}

function checkAdapters(projectRoot) {
  try {
    const { loadRegistry, validateRegistry } = require("../../scripts/lib/tool-registry");
    const registry = loadRegistry(sdriveDir(projectRoot));
    const verdict = validateRegistry(registry.tools);

    if (verdict.errors.length > 0) {
      return result("adapters", "fail", verdict.errors.join("; "));
    }

    if (verdict.warnings.length > 0) {
      return result("adapters", "warn", `${verdict.warnings.length} unverified adapter path(s)`);
    }

    return result("adapters", "ok", `${registry.tools.length} tool definition(s) look valid`);
  } catch (error) {
    return result("adapters", "fail", `Could not read the tool registry: ${error.message}`);
  }
}

function checkCommonJs(projectRoot) {
  const file = path.join(sdriveDir(projectRoot), "package.json");
  const pkg = readJson(file, null);

  if (pkg && pkg.type === "commonjs") {
    return result("commonjs", "ok", ".sdrive/package.json keeps shipped files CommonJS");
  }

  return result(
    "commonjs",
    "fail",
    "sdrive/package.json with {\"type\":\"commonjs\"} is missing; an ESM project will break the dashboard",
    "sdrive doctor --fix"
  );
}

function checkManifest(projectRoot) {
  const verdict = checkManifestVerdict(projectRoot, { expectedVersion: packageVersion() });

  if (!verdict.present) {
    return result(
      "manifest",
      "warn",
      "No framework-manifest.json; run `sdrive update --check` after the next update",
      "sdrive update --check"
    );
  }

  const drift = verdict.modified.length + verdict.missing.length + verdict.extra.length;

  if (verdict.cliVersion !== verdict.expectedVersion) {
    return result(
      "manifest",
      "warn",
      `Installed files are from ${verdict.cliVersion}, CLI is ${verdict.expectedVersion}`
    );
  }

  if (drift > 0) {
    return result(
      "manifest",
      "warn",
      `${drift} framework file(s) differ from the installed manifest (${verdict.modified.length} modified, ${verdict.missing.length} missing, ${verdict.extra.length} extra)`
    );
  }

  return result("manifest", "ok", `${verdict.files} framework file(s) match the manifest`);
}

function checkValidatorDependencies(projectRoot) {
  const script = path.join(sdriveDir(projectRoot), "scripts", "validate-governance.js");

  if (!fs.existsSync(script)) {
    return result("validator-deps", "warn", "validate-governance.js is missing");
  }

  try {
    const requireFromProject = createRequire(script);
    requireFromProject.resolve("ajv");
    return result("validator-deps", "ok", "the installed validator can resolve ajv");
  } catch (error) {
    return result(
      "validator-deps",
      "warn",
      "The installed validator cannot resolve ajv. Use `sdrive validate` (validates in-process) or install ajv in the project.",
      "sdrive validate"
    );
  }
}

function checkTestCommand(projectRoot) {
  const resolved = resolveTestCommand(projectRoot);

  if (!resolved.command) {
    return result(
      "test-command",
      "warn",
      "No test command detected. Add test.command to .sdrive/config.json or a package.json test script."
    );
  }

  return result("test-command", "ok", `test command: ${resolved.command} (${resolved.source})`);
}

function checkAudit(projectRoot) {
  const verdict = verifyAuditLog(projectRoot);

  if (!verdict.ok) {
    return result("audit", "fail", `Audit chain broken: ${verdict.reason}`);
  }

  return result("audit", "ok", verdict.reason);
}

function runChecks(projectRoot, options = {}) {
  const checks = [
    checkNode(),
    checkGit(projectRoot),
    checkLayout(projectRoot)
  ];

  if (checks[2].status === "fail") {
    return { ok: false, checks };
  }

  checks.push(
    checkConfig(projectRoot),
    checkState(projectRoot),
    checkTeam(projectRoot),
    checkPermissions(projectRoot),
    checkAdapters(projectRoot),
    checkCommonJs(projectRoot),
    checkManifest(projectRoot),
    checkValidatorDependencies(projectRoot),
    checkTestCommand(projectRoot),
    checkAudit(projectRoot)
  );

  const ok = checks.every((check) => check.status !== "fail");

  return { ok, checks };
}

function applyFixes(projectRoot) {
  const fixes = [];
  const root = sdriveDir(projectRoot);
  const scopePath = path.join(root, "package.json");
  const configFile = path.join(root, "config.json");
  const teamFile = path.join(root, "team.json");

  if (!fs.existsSync(scopePath)) {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(scopePath, `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);
    fixes.push("created .sdrive/package.json");
  }

  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(
      configFile,
      `${JSON.stringify(
        {
          defaultTemplate: "generic",
          // Existing projects opt in explicitly; `doctor --fix` must not change
          // gate behaviour by surprise.
          governance: {
            requireTestEvidence: false,
            allowStaleEvidence: false,
            requireStructuredReview: false
          },
          test: {}
        },
        null,
        2
      )}\n`
    );
    fixes.push("created .sdrive/config.json");
  }

  if (!fs.existsSync(teamFile)) {
    fs.writeFileSync(teamFile, `${JSON.stringify({ members: [] }, null, 2)}\n`);
    fixes.push("created .sdrive/team.json (add the first admin with sdrive team:add)");
  }

  writeManifest(projectRoot);
  fixes.push("refreshed framework-manifest.json");

  return fixes;
}

module.exports = {
  runChecks,
  applyFixes,
  checkNode,
  checkLayout,
  checkConfig,
  checkState,
  checkTeam,
  checkPermissions,
  checkAdapters,
  checkCommonJs,
  checkManifest,
  checkValidatorDependencies,
  checkTestCommand,
  checkAudit
};
