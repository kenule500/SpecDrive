// Permission policy, shared by the CLI and the installed slash-command checker.
//
// The old behaviour failed open twice: a missing check-permission.js meant "no
// check", and a command with no rule meant "allowed". Both are now explicit
// decisions. Read-only commands may proceed without a rule; mutating commands
// may not.
const path = require("path");
const { readJson } = require("./state");
const { gitOrEmpty } = require("./execute");
const { EXIT } = require("./exit");

// Commands that can change state, run project code, or write files. Everything
// not listed here is treated as read-only for rule-coverage purposes.
const MUTATING = new Set([
  "init",
  "update",
  "template:set",
  "create",
  "update-propose",
  "assign",
  "approve",
  "archive:finalize",
  "team:add",
  "team:remove",
  "team:update",
  "team:sync",
  "hooks:install",
  "amend",
  "version:new",
  "adapters:add",
  "test",
  "check",
  "config:set",
  "migrate:apply",
  "migrate:rollback"
]);

// The only commands allowed while the roster is empty. Without this bootstrap a
// fresh project could never add its first admin.
const BOOTSTRAP = new Set(["team:add", "adapters:add"]);

function isMutating(command) {
  return MUTATING.has(command);
}

function actor(root = process.cwd()) {
  if (process.env.SDRIVE_ACTOR) return process.env.SDRIVE_ACTOR.trim();

  const fromGit = gitOrEmpty(["config", "user.name"], root);
  if (fromGit) return fromGit;

  return process.env.USERNAME || process.env.USER || "unknown";
}

function loadTeam(root) {
  return readJson(path.join(root, ".sdrive", "team.json"), null);
}

function loadRules(root) {
  return readJson(path.join(root, ".sdrive", "commands", "permissions.json"), null);
}

function roleOf(team, username) {
  if (!team || !Array.isArray(team.members)) return null;
  const member = team.members.find((entry) => entry.username === username);
  return member ? member.role : null;
}

function skipRequested() {
  return process.env.SDRIVE_SKIP_PERMISSIONS === "1" || process.env.SDRIVE_SKIP_PERMISSIONS === "true";
}

// Returns { ok, code, reason, actor, role, skipped }.
// `command` is the CLI command name (e.g. "approve") or the slash command
// (e.g. "/sdrive:review") when type is "slash".
function check(root, command, options = {}) {
  const { type = "cli" } = options;
  const who = actor(root);

  if (skipRequested()) {
    return {
      ok: true,
      code: EXIT.OK,
      actor: who,
      role: null,
      skipped: true,
      reason: "permissions skipped by SDRIVE_SKIP_PERMISSIONS=1"
    };
  }

  const team = loadTeam(root);

  if (!team) {
    return {
      ok: false,
      code: EXIT.NOT_INITIALIZED,
      actor: who,
      role: null,
      reason:
        "team.json not found. Run `sdrive init` first, then `sdrive team:add <your-git-username> admin`."
    };
  }

  const members = Array.isArray(team.members) ? team.members : [];

  if (members.length === 0) {
    if (type === "cli" && BOOTSTRAP.has(command)) {
      return {
        ok: true,
        code: EXIT.OK,
        actor: who,
        role: null,
        reason: `bootstrap: team.json has no members; allowing '${command}'`
      };
    }

    return {
      ok: false,
      code: EXIT.PERMISSION,
      actor: who,
      role: null,
      reason:
        "team.json has no members. Add the first admin with `sdrive team:add <your-git-username> admin`."
    };
  }

  const role = roleOf(team, who);

  if (!role) {
    return {
      ok: false,
      code: EXIT.PERMISSION,
      actor: who,
      role: null,
      reason: `"${who}" is not in team.json. Fix: sdrive team:add "${who}" admin (the username must match \`git config user.name\`).`
    };
  }

  const permissions = loadRules(root);
  const rules = permissions && (type === "cli" ? permissions.cli : permissions.rules);
  const allowedRoles = rules ? rules[command] : undefined;
  const mutating = type === "cli" ? isMutating(command) : true;

  if (!allowedRoles || !Array.isArray(allowedRoles)) {
    if (!mutating) {
      return {
        ok: true,
        code: EXIT.OK,
        actor: who,
        role,
        reason: `no permission rule for ${type}:${command}; read-only command allowed`
      };
    }

    return {
      ok: false,
      code: EXIT.PERMISSION,
      actor: who,
      role,
      reason: `No permission rule for ${type}:${command}. Add one to .sdrive/commands/permissions.json (mutating commands are deny-by-default).`
    };
  }

  if (!allowedRoles.includes(role)) {
    return {
      ok: false,
      code: EXIT.PERMISSION,
      actor: who,
      role,
      reason: `"${who}" (${role}) is not allowed to run ${type}:${command}. Allowed roles: ${allowedRoles.join(", ")}.`
    };
  }

  return {
    ok: true,
    code: EXIT.OK,
    actor: who,
    role,
    reason: `"${who}" (${role}) is allowed`
  };
}

module.exports = {
  MUTATING,
  BOOTSTRAP,
  isMutating,
  actor,
  roleOf,
  check,
  skipRequested
};
