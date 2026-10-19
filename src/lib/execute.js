// Process execution helpers.
//
// The CLI used to build shell strings (`execSync(\`node "${script}" "${feature}"\`)`).
// That breaks on paths containing quotes and turns any unvalidated argument into a
// shell-injection surface. Argument arrays have neither problem.
const { spawnSync, execFileSync } = require("child_process");

const MAX_BUFFER = 32 * 1024 * 1024;

function nodeScript(scriptPath, args = [], options = {}) {
  const { cwd = process.cwd(), capture = false, env = process.env, timeout } = options;

  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: MAX_BUFFER,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
}

function commandLine(command, options = {}) {
  const { cwd = process.cwd(), capture = true, env = process.env, timeout } = options;

  return spawnSync(command, {
    cwd,
    env,
    shell: true,
    encoding: "utf8",
    timeout,
    maxBuffer: MAX_BUFFER,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
}

function git(args, options = {}) {
  const { cwd = process.cwd(), allowFailure = false } = options;

  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

function gitOrEmpty(args, cwd) {
  try {
    return git(args, { cwd }) || "";
  } catch (error) {
    return "";
  }
}

module.exports = {
  MAX_BUFFER,
  nodeScript,
  commandLine,
  git,
  gitOrEmpty
};
