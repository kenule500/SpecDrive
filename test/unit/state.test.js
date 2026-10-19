const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const state = require("../../src/lib/state");

function tempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-state-test-"));
  fs.mkdirSync(path.join(root, ".sdrive", "schemas"), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, "..", "..", "schemas", "workflow-state.schema.json"),
    path.join(root, ".sdrive", "schemas", "workflow-state.schema.json")
  );
  return root;
}

test("writeJsonAtomic writes complete JSON", () => {
  const root = tempProject();
  const file = path.join(root, ".sdrive", "sample.json");

  state.writeJsonAtomic(file, { hello: "world" });

  assert.deepStrictEqual(state.readJson(file), { hello: "world" });
});

test("mutateState persists and keeps a backup of the previous state", () => {
  const root = tempProject();
  const initial = {
    features: [
      {
        name: "demo",
        currentVersion: "v1",
        versions: [
          {
            id: "v1",
            phase: "ongoing",
            currentStep: "specification",
            gates: {
              specification: "pending",
              planning: "pending",
              implementation: "pending",
              review: "pending"
            }
          }
        ]
      }
    ]
  };

  state.writeState(root, initial);
  state.mutateState(root, (current) => {
    current.features[0].versions[0].gates.specification = "approved";
    return current;
  });

  assert.strictEqual(
    state.readState(root).features[0].versions[0].gates.specification,
    "approved"
  );

  const backups = fs
    .readdirSync(path.join(root, ".sdrive", ".backups"))
    .filter((name) => name.startsWith("workflow-state."));
  assert.ok(backups.length >= 1, "a backup should exist");
});

test("mutateState refuses to write an invalid state", () => {
  const root = tempProject();
  state.writeState(root, { features: [] });

  assert.throws(
    () => state.mutateState(root, (current) => ({ ...current, features: "not-an-array" })),
    /Refusing to write an invalid workflow-state/
  );

  assert.deepStrictEqual(state.readState(root), { features: [] });
});

test("withLock is exclusive", () => {
  const root = tempProject();

  state.withLock(root, () => {
    assert.throws(
      () => state.withLock(root, () => {}, { timeoutMs: 60, staleMs: 10000 }),
      /held by another process/
    );
  });
});
