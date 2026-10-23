// Archived versions are immutable.
//
// The old `amend` and `reopen` commands mutated a completed version's record so it
// could be worked on again. That made a shipped version's history a lie. The only
// way to add scope is `version:new`, which leaves the completed version alone.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { initProject, cleanup, runCli, writeJson, readJson } = require("./helpers/sandbox");

const FEATURE = "shipped-feature";

function seedCompletedFeature(root) {
  const sdriveRoot = path.join(root, ".sdrive");
  const specDir = path.join(sdriveRoot, "specs", "completed", FEATURE, "v1");
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, "spec.md"), "# Released v1\n");

  writeJson(path.join(sdriveRoot, "workflow-state.json"), {
    features: [
      {
        name: FEATURE,
        currentVersion: "v1",
        productItems: ["BP-001"],
        versions: [
          {
            id: "v1",
            phase: "completed",
            currentStep: "review",
            gates: {
              specification: "approved",
              planning: "approved",
              implementation: "approved",
              review: "approved"
            },
            history: [{ event: "feature_archived", timestamp: "2026-01-01T00:00:00.000Z" }]
          }
        ]
      }
    ]
  });
}

test("amend and reopen no longer exist and cannot touch a released version", () => {
  const root = initProject({ prefix: "sdrive-immutable-" });

  try {
    seedCompletedFeature(root);

    const statePath = path.join(root, ".sdrive", "workflow-state.json");
    const specPath = path.join(root, ".sdrive", "specs", "completed", FEATURE, "v1", "spec.md");
    const beforeState = fs.readFileSync(statePath, "utf8");
    const beforeSpec = fs.readFileSync(specPath, "utf8");

    for (const command of ["amend", "reopen"]) {
      const result = runCli([command, FEATURE, "--reason", "shipped too early"], { cwd: root });
      assert.notStrictEqual(result.status, 0, `${command} should not be a command`);
      assert.match(
        `${result.stdout}${result.stderr}`,
        new RegExp(`unknown command '${command}'`),
        `${command} should be rejected by the CLI parser`
      );

      assert.strictEqual(fs.readFileSync(statePath, "utf8"), beforeState);
      assert.strictEqual(fs.readFileSync(specPath, "utf8"), beforeSpec);
      assert.ok(fs.existsSync(specPath), "the completed spec must stay in completed/");
      assert.ok(
        !fs.existsSync(path.join(root, ".sdrive", "specs", "ongoing", FEATURE)),
        "no ongoing copy may be created"
      );
    }

    const version = readJson(statePath).features[0].versions[0];
    assert.strictEqual(version.phase, "completed");
    assert.deepStrictEqual(version.gates, {
      specification: "approved",
      planning: "approved",
      implementation: "approved",
      review: "approved"
    });
  } finally {
    cleanup(root);
  }
});
