// `sdrive test --prove` regression.
//
//   node --test test/test-test-prove.js
//
// The proof run used to be guarded by `passed` before the pass/fail verdict was
// computed, so `--prove` threw a ReferenceError before recording anything. This
// pins the whole path: the test fails at base, passes at HEAD, and the evidence
// carries red-before-green for the linked acceptance criterion.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { initProject, runCli, writeJson, cleanup } = require("./helpers/sandbox");

const FEATURE = "prove-me";

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

test("--prove records red-before-green instead of crashing", () => {
  const root = initProject({ prefix: "sdrive-prove-" });

  try {
    writeJson(path.join(root, ".sdrive", "workflow-state.json"), {
      version: 1,
      updatedAt: new Date().toISOString(),
      features: [
        {
          name: FEATURE,
          currentVersion: "v1",
          versions: [
            { id: "v1", phase: "ongoing", currentStep: "implementation", gates: {}, history: [] }
          ]
        }
      ]
    });

    writeJson(path.join(root, ".sdrive", "governance", FEATURE, "v1", "traceability.json"), {
      feature: FEATURE,
      version: 1,
      rows: [
        {
          requirementId: "FR-001",
          acceptanceCriteriaIds: ["AC-001"],
          taskIds: ["T1.1"],
          testIds: ["TEST-001"],
          status: "complete"
        }
      ]
    });

    const testFile = path.join(root, "test.js");

    fs.writeFileSync(
      testFile,
      'console.log("TEST-001 fails before the change");\nprocess.exit(1);\n'
    );

    git(root, ["init"]);
    git(root, ["config", "user.email", "prove@example.com"]);
    git(root, ["config", "user.name", "Prove Test"]);
    git(root, ["add", "test.js"]);
    git(root, ["commit", "-m", "base: the test fails"]);

    const base = git(root, ["rev-parse", "HEAD"]);

    fs.writeFileSync(
      testFile,
      'console.log("TEST-001 passes after the change");\nprocess.exit(0);\n'
    );
    git(root, ["add", "test.js"]);
    git(root, ["commit", "-m", "head: the change makes it pass"]);

    const result = runCli(
      ["test", FEATURE, "--prove", "--base", base, "--cmd", "node test.js", "--json"],
      { cwd: root }
    );
    const payload = JSON.parse(result.stdout);

    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(payload.data.redGreen, "the evidence must carry a red-before-green record");
    assert.deepStrictEqual(payload.data.redGreen.proven, ["AC-001"]);
    assert.strictEqual(payload.data.redGreen.base, base);
  } finally {
    cleanup(root);
  }
});
