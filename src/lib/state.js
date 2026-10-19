// Durable state I/O.
//
// Every file under .sdrive/ that the tool mutates goes through here: atomic
// replace, a lock around read-modify-write, schema validation before the write,
// and a bounded backup of the previous version. Direct fs.writeFileSync on
// workflow-state.json is how half-written JSON and lost approvals happen.
const fs = require("fs");
const path = require("path");

const LOCK_NAME = ".state.lock";
const DEFAULT_LOCK_TIMEOUT_MS = 5000;
const DEFAULT_STALE_LOCK_MS = 30000;
const BACKUP_KEEP = 10;

function sdriveDir(root) {
  return path.join(root, ".sdrive");
}

function statePath(root) {
  return path.join(sdriveDir(root), "workflow-state.json");
}

function configPath(root) {
  return path.join(sdriveDir(root), "config.json");
}

function teamPath(root) {
  return path.join(sdriveDir(root), "team.json");
}

function auditPath(root) {
  return path.join(sdriveDir(root), "audit-log.json");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function readJsonStrict(file, label = file) {
  let raw;

  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    const wrapped = new Error(`${label} not found`);
    wrapped.code = "ENOENT";
    throw wrapped;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const wrapped = new Error(`${label} is not valid JSON: ${error.message}`);
    wrapped.code = "EJSONPARSE";
    throw wrapped;
  }
}

function writeJsonAtomic(file, data) {
  ensureDir(path.dirname(file));

  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const body = `${JSON.stringify(data, null, 2)}\n`;
  let fd;

  try {
    fd = fs.openSync(temp, "w");
    fs.writeFileSync(fd, body, "utf8");
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }

  try {
    fs.renameSync(temp, file);
  } catch (error) {
    // Windows can refuse to replace a file another process has open; retry once
    // after removing it. This is the only non-atomic path, and it is last resort.
    try {
      fs.rmSync(file, { force: true });
      fs.renameSync(temp, file);
    } catch (inner) {
      fs.rmSync(temp, { force: true });
      throw error;
    }
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Runs fn while holding .sdrive/.state.lock. The lock is advisory: it protects
// SpecDrive processes from each other, not the filesystem from other tools.
function withLock(root, fn, options = {}) {
  const { timeoutMs = DEFAULT_LOCK_TIMEOUT_MS, staleMs = DEFAULT_STALE_LOCK_MS } = options;
  const dir = sdriveDir(root);
  ensureDir(dir);

  const lockPath = path.join(dir, LOCK_NAME);
  const deadline = Date.now() + timeoutMs;
  let handle = null;

  while (handle === null) {
    try {
      handle = fs.openSync(lockPath, "wx");
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    } catch (error) {
      if (error.code !== "EEXIST") throw error;

      let stale = false;

      try {
        const stat = fs.statSync(lockPath);
        stale = Date.now() - stat.mtimeMs > staleMs;
      } catch (statError) {
        stale = false;
      }

      if (stale) {
        try {
          fs.rmSync(lockPath, { force: true });
        } catch (removeError) {
          // Another process won the race; fall through to the next attempt.
        }
        continue;
      }

      if (Date.now() >= deadline) {
        const locked = new Error(
          `.sdrive/${LOCK_NAME} is held by another process. Wait for it to finish, or remove the lock if it is stale.`
        );
        locked.code = "ELOCKED";
        throw locked;
      }

      sleepSync(50);
    }
  }

  try {
    fs.closeSync(handle);
    return fn();
  } finally {
    try {
      fs.rmSync(lockPath, { force: true });
    } catch (error) {
      // A lock that cannot be removed will be reclaimed by the stale timeout.
    }
  }
}

function backupState(root) {
  const file = statePath(root);
  if (!fs.existsSync(file)) return null;

  const dir = path.join(sdriveDir(root), ".backups");
  ensureDir(dir);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(dir, `workflow-state.${stamp}.json`);

  fs.copyFileSync(file, destination);

  const backups = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("workflow-state.") && name.endsWith(".json"))
    .sort();

  while (backups.length > BACKUP_KEEP) {
    fs.rmSync(path.join(dir, backups.shift()), { force: true });
  }

  return destination;
}

function formatAjvErrors(errors) {
  return (errors || []).map((error) => {
    const where = error.instancePath || "(root)";
    return `${where} ${error.message}`;
  });
}

function validateData(root, schemaName, data) {
  const schemaFile = path.join(sdriveDir(root), "schemas", schemaName);

  if (!fs.existsSync(schemaFile)) {
    return { ok: true, errors: [], missingSchema: true };
  }

  let Ajv;
  let addFormats;

  try {
    Ajv = require("ajv");
    addFormats = require("ajv-formats");
  } catch (error) {
    // Validation is best-effort when the CLI's own dependencies are unavailable.
    return { ok: true, errors: [], missingValidator: true };
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaFile, "utf8")));
  const ok = validate(data);

  return { ok, errors: ok ? [] : formatAjvErrors(validate.errors) };
}

function readState(root) {
  return readJson(statePath(root), null);
}

function writeState(root, state, options = {}) {
  const { validate = true } = options;

  if (validate) {
    const verdict = validateData(root, "workflow-state.schema.json", state);
    if (!verdict.ok) {
      const error = new Error(
        `Refusing to write an invalid workflow-state.json:\n${verdict.errors
          .map((line) => `   • ${line}`)
          .join("\n")}`
      );
      error.code = "EVALIDATION";
      error.errors = verdict.errors;
      throw error;
    }
  }

  backupState(root);
  writeJsonAtomic(statePath(root), state);
  return state;
}

function mutateState(root, mutator, options = {}) {
  return withLock(root, () => {
    const state = readState(root) || { features: [] };
    const next = mutator(state) || state;
    writeState(root, next, options);
    return next;
  });
}

module.exports = {
  sdriveDir,
  statePath,
  configPath,
  teamPath,
  auditPath,
  ensureDir,
  readJson,
  readJsonStrict,
  writeJsonAtomic,
  withLock,
  backupState,
  validateData,
  readState,
  writeState,
  mutateState
};
