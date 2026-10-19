// Installed-framework manifest.
//
// `sdrive update` overwrites framework files. Without a record of what was
// installed, it cannot tell a stale file from a user-customised one, and it
// cannot prove that `.sdrive/commands/` matches the CLI that is running.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic, readJson, sdriveDir } = require("./state");

const FRAMEWORK_DIRS = [
  "agents",
  "commands",
  "dashboard",
  "mcp",
  "schemas",
  "scripts",
  "templates",
  "migrations"
];

const EXTRA_FILES = ["logo.png"];
const MANIFEST_NAME = "framework-manifest.json";

function packageVersion() {
  try {
    return require("../../package.json").version;
  } catch (error) {
    return "unknown";
  }
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function hashFile(file) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile()) files.push(full);
  }

  return files;
}

function frameworkFiles(projectRoot) {
  const root = sdriveDir(projectRoot);
  const files = [];

  for (const dir of FRAMEWORK_DIRS) {
    for (const file of walk(path.join(root, dir))) {
      if (path.basename(file) === MANIFEST_NAME) continue;
      files.push(file);
    }
  }

  for (const name of EXTRA_FILES) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) files.push(file);
  }

  return files;
}

function computeHashes(projectRoot) {
  const root = sdriveDir(projectRoot);
  const hashes = {};

  for (const file of frameworkFiles(projectRoot)) {
    hashes[toPosix(path.relative(root, file))] = hashFile(file);
  }

  return hashes;
}

function manifestPath(projectRoot) {
  return path.join(sdriveDir(projectRoot), MANIFEST_NAME);
}

function writeManifest(projectRoot, options = {}) {
  const manifest = {
    cliVersion: options.cliVersion || packageVersion(),
    installedAt: new Date().toISOString(),
    files: computeHashes(projectRoot)
  };

  writeJsonAtomic(manifestPath(projectRoot), manifest);
  return manifest;
}

function readManifest(projectRoot) {
  return readJson(manifestPath(projectRoot), null);
}

// Compares what is on disk with what was installed.
// - modified: hash differs (a local edit, or an older copy)
// - missing: recorded but gone
// - extra: present but never recorded
function checkManifest(projectRoot, options = {}) {
  const manifest = readManifest(projectRoot);

  if (!manifest) {
    return {
      present: false,
      cliVersion: null,
      expectedVersion: options.expectedVersion || packageVersion(),
      modified: [],
      missing: [],
      extra: [],
      files: 0
    };
  }

  const current = computeHashes(projectRoot);
  const recorded = manifest.files || {};

  const modified = Object.keys(recorded).filter(
    (file) => current[file] && current[file] !== recorded[file]
  );
  const missing = Object.keys(recorded).filter((file) => !current[file]);
  const extra = Object.keys(current).filter((file) => !recorded[file]);

  return {
    present: true,
    cliVersion: manifest.cliVersion || null,
    expectedVersion: options.expectedVersion || packageVersion(),
    modified,
    missing,
    extra,
    files: Object.keys(recorded).length
  };
}

module.exports = {
  FRAMEWORK_DIRS,
  MANIFEST_NAME,
  packageVersion,
  computeHashes,
  writeManifest,
  readManifest,
  checkManifest,
  manifestPath
};
