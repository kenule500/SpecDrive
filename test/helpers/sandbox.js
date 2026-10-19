// Shared test harness.
//
// Every test builds a throwaway project in the OS temp directory. Tests must
// never read or write the repository's own `.sdrive/`: that is what made the
// old suite delete tracked fixtures and depend on a populated team roster.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
const CLI = path.join(PACKAGE_ROOT, "src", "index.js");

const TEST_ENV = {
  ...process.env,
  SDRIVE_SKIP_PERMISSIONS: "1",
  SDRIVE_NO_DASHBOARD: "1",
  NO_COLOR: "1",
  SDRIVE_ACTOR: process.env.SDRIVE_ACTOR || "test-admin"
};

function createProject(prefix = "sdrive-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runCli(args, options = {}) {
  const { cwd, env, timeout = 120000 } = options;

  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...TEST_ENV, ...(env || {}) },
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024
  });
}

// Creates a project with schemas, scripts, commands, adapters, and an empty
// governance state. This is the same layout `sdrive init --tools none` makes.
function initProject(options = {}) {
  const root = createProject(options.prefix);

  const result = runCli(["init", "--tools", "none", "--no-dashboard"], { cwd: root });

  if (result.status !== 0) {
    throw new Error(
      `sdrive init failed (${result.status}):\n${result.stdout || ""}\n${result.stderr || ""}`
    );
  }

  return root;
}

function seedTeam(root, username = "test-admin", role = "admin") {
  const teamPath = path.join(root, ".sdrive", "team.json");
  fs.mkdirSync(path.dirname(teamPath), { recursive: true });
  fs.writeFileSync(
    teamPath,
    `${JSON.stringify({ members: [{ username, role }] }, null, 2)}\n`
  );
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function cleanup(root) {
  if (!root) return;
  fs.rmSync(root, { recursive: true, force: true });
}

module.exports = {
  PACKAGE_ROOT,
  CLI,
  TEST_ENV,
  createProject,
  initProject,
  runCli,
  seedTeam,
  writeJson,
  readJson,
  cleanup
};
