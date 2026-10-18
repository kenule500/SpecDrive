#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

function getCurrentUser() {
  try {
    return execSync("git config user.name", { encoding: "utf8" }).trim();
  } catch (error) {
    return null;
  }
}

function loadTeam() {
  const teamPath = path.join(projectRoot, ".sdrive", "team.json");

  if (!fs.existsSync(teamPath)) {
    console.error("❌ team.json not found.");
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(teamPath, "utf8"));
}

function loadPermissions() {
  const permPath = path.join(projectRoot, ".sdrive", "commands", "permissions.json");

  if (!fs.existsSync(permPath)) {
    console.error("❌ permissions.json not found.");
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(permPath, "utf8"));
}

function getUserRole(username) {
  const team = loadTeam();
  const member = team.members?.find((m) => m.username === username);
  return member ? member.role : null;
}

// Bootstrap escape hatch: a freshly initialized project has an empty roster, so
// nobody can hold the `admin` role required by `team:add`. Without this, the
// first member could never be added. `adapters:add` is exempted for the same
// reason - registering your tool is setup, not governed work, and an empty
// roster means there is no governance to protect yet. Both are only exempt
// while the roster is empty.
function isBootstrapAllowed(commandType, commandName) {
  if (commandType !== "cli") return false;
  if (commandName !== "team:add" && commandName !== "adapters:add") return false;

  const team = loadTeam();
  return !team.members || team.members.length === 0;
}

function checkPermission(commandType, commandName) {
  const username = getCurrentUser();

  if (!username) {
    console.error("❌ Could not detect Git user. Set git config user.name.");
    process.exit(1);
  }

  if (isBootstrapAllowed(commandType, commandName)) {
    console.log(`✅ Bootstrap: team.json has no members. Allowing '${commandName}' to add the first member.`);
    process.exit(0);
  }

  const role = getUserRole(username);

  if (!role) {
    console.error(`❌ User "${username}" is not in team.json.`);
    console.error(`   Fix: run \`sdrive team:add "${username}" admin\` from the project root.`);
    console.error(`   Note: the username must match \`git config user.name\` exactly.`);
    process.exit(1);
  }

  const permissions = loadPermissions();
  const rules = commandType === "cli" ? permissions.cli : permissions.rules;
  const allowedRoles = rules[commandName];

  if (!allowedRoles) {
    console.log(`⚠️  No permission rule for ${commandType}:${commandName}. Allowing by default.`);
    process.exit(0);
  }

  if (!allowedRoles.includes(role)) {
    console.error(`❌ User "${username}" (${role}) is not allowed to run ${commandType}:${commandName}.`);
    console.error(`   Allowed roles: ${allowedRoles.join(", ")}`);
    process.exit(1);
  }

  console.log(`✅ User "${username}" (${role}) is allowed.`);
  process.exit(0);
}

const commandType = process.argv[2];
const commandName = process.argv[3];

if (!commandType || !commandName) {
  console.error("❌ Usage: node check-permission.js <cli|slash> <command>");
  process.exit(1);
}

checkPermission(commandType, commandName);