const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const permissions = require("../../src/lib/permissions");

function project({ members = [{ username: "alice", role: "admin" }], cli = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-perm-test-"));
  fs.mkdirSync(path.join(root, ".sdrive", "commands"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".sdrive", "team.json"),
    JSON.stringify({ members })
  );
  fs.writeFileSync(
    path.join(root, ".sdrive", "commands", "permissions.json"),
    JSON.stringify({
      version: "1.1.0",
      rules: {},
      cli: {
        approve: ["admin", "reviewer"],
        update: ["admin"],
        ...cli
      }
    })
  );
  return root;
}

function withoutSkip(fn) {
  const previousSkip = process.env.SDRIVE_SKIP_PERMISSIONS;
  const previousActor = process.env.SDRIVE_ACTOR;
  delete process.env.SDRIVE_SKIP_PERMISSIONS;
  process.env.SDRIVE_ACTOR = "alice";

  try {
    return fn();
  } finally {
    if (previousSkip === undefined) delete process.env.SDRIVE_SKIP_PERMISSIONS;
    else process.env.SDRIVE_SKIP_PERMISSIONS = previousSkip;

    if (previousActor === undefined) delete process.env.SDRIVE_ACTOR;
    else process.env.SDRIVE_ACTOR = previousActor;
  }
}

test("allows a role listed on the rule", () => {
  withoutSkip(() => {
    const verdict = permissions.check(project(), "approve");
    assert.strictEqual(verdict.ok, true);
    assert.strictEqual(verdict.role, "admin");
  });
});

test("denies a role not listed on the rule", () => {
  withoutSkip(() => {
    const root = project({ members: [{ username: "alice", role: "developer" }] });
    const verdict = permissions.check(root, "approve");
    assert.strictEqual(verdict.ok, false);
    assert.strictEqual(verdict.code, 5);
  });
});

test("denies a mutating command with no rule", () => {
  withoutSkip(() => {
    const verdict = permissions.check(project(), "assign");
    assert.strictEqual(verdict.ok, false);
    assert.match(verdict.reason, /No permission rule/);
  });
});

test("allows a read-only command with no rule", () => {
  withoutSkip(() => {
    const verdict = permissions.check(project(), "status");
    assert.strictEqual(verdict.ok, true);
  });
});

test("bootstrap allows team:add only while the roster is empty", () => {
  withoutSkip(() => {
    const empty = project({ members: [] });
    assert.strictEqual(permissions.check(empty, "team:add").ok, true);
    assert.strictEqual(permissions.check(empty, "approve").ok, false);

    const populated = project();
    assert.strictEqual(permissions.check(populated, "team:add").ok, false);
  });
});

test("SDRIVE_SKIP_PERMISSIONS is reported, not silent", () => {
  const previous = process.env.SDRIVE_SKIP_PERMISSIONS;
  process.env.SDRIVE_SKIP_PERMISSIONS = "1";

  try {
    const verdict = permissions.check(project(), "approve");
    assert.strictEqual(verdict.ok, true);
    assert.strictEqual(verdict.skipped, true);
  } finally {
    if (previous === undefined) delete process.env.SDRIVE_SKIP_PERMISSIONS;
    else process.env.SDRIVE_SKIP_PERMISSIONS = previous;
  }
});
