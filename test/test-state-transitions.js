// State-transition tests for the SpecDrive gate system.
//
//   Run from the repository root:  node test/test-state-transitions.js
//
// Everything runs inside a throwaway temp directory, so your own .sdrive/
// governance state is never touched. The previous version of this file wrote to
// the caller's .sdrive/ and invoked <root>/.sdrive/src/index.js, a path that does
// not exist, so it could never have run at all.
//
// The point of these tests is the invariant behind `sdrive approve`: it may only
// assert a gate whose work actually exists, and it must never write a record that
// disagrees with the repository.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const CLI = path.join(__dirname, "..", "src", "index.js");
const FEATURE = "test-feature";
const VERSION = "v1";

function createSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-gate-test-"));
}

function sdrivePath(root, ...parts) {
  return path.join(root, ".sdrive", ...parts);
}

function seedState(root, { phase = "backlog", gates = {} } = {}) {
  const state = {
    features: [
      {
        name: FEATURE,
        currentVersion: VERSION,
        versions: [
          {
            id: VERSION,
            phase,
            currentStep: "specification",
            gates: {
              specification: "pending",
              planning: "pending",
              implementation: "pending",
              review: "pending",
              ...gates
            },
            history: [{ event: "feature_created", timestamp: new Date().toISOString() }]
          }
        ]
      }
    ]
  };

  fs.mkdirSync(sdrivePath(root), { recursive: true });
  fs.writeFileSync(sdrivePath(root, "workflow-state.json"), JSON.stringify(state, null, 2));

  return state;
}

function seedSpecFiles(root, { stage = "ongoing", versionFolder = VERSION, files = {} } = {}) {
  const dir = sdrivePath(root, "specs", stage, FEATURE, versionFolder);
  fs.mkdirSync(dir, { recursive: true });

  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body);
  }
}

function seedGovFiles(root, { files = {} } = {}) {
  const dir = sdrivePath(root, "governance", FEATURE, VERSION);
  fs.mkdirSync(dir, { recursive: true });

  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), typeof body === "string" ? body : JSON.stringify(body, null, 2));
  }
}

function approve(root, feature, gate) {
  try {
    const stdout = execSync(`node "${CLI}" approve ${feature} ${gate}`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });

    return { ok: true, output: stdout };
  } catch (error) {
    return { ok: false, output: `${error.stdout || ""}${error.stderr || ""}` };
  }
}

function readState(root) {
  return JSON.parse(fs.readFileSync(sdrivePath(root, "workflow-state.json"), "utf8"));
}

function gateValue(root, gate) {
  return readState(root).features[0].versions[0].gates[gate];
}

function history(root) {
  return readState(root).features[0].versions[0].history;
}

const results = [];

function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition) });
  console.log(`${condition ? "✅ PASS" : "❌ FAIL"}  ${name}${condition || !detail ? "" : `\n          ${detail.trim().split("\n").join("\n          ")}`}`);
}

function run() {
  console.log("=== SpecDrive gate-approval tests ===\n");

  // 1 - a fresh feature starts fully pending
  {
    const root = createSandbox();
    seedState(root);
    check(
      "fresh feature: all four gates start pending",
      gateValue(root, "specification") === "pending" && gateValue(root, "review") === "pending"
    );
  }

  // 2 - approval succeeds once the artifacts exist
  {
    const root = createSandbox();
    seedState(root);
    seedSpecFiles(root, { files: { "spec.md": "# Spec\n" } });
    seedGovFiles(root, { files: { "spec.json": { feature: FEATURE, version: 1 } } });

    const r = approve(root, FEATURE, "specification");
    check(
      "approves specification when spec.md and spec.json exist",
      r.ok && gateValue(root, "specification") === "approved",
      r.output
    );
  }

  // 3 - the core invariant
  {
    const root = createSandbox();
    seedState(root);

    const r = approve(root, FEATURE, "specification");
    check("REFUSES specification when the spec artifacts are missing", !r.ok, r.output);
    check("  ...and writes nothing (gate stays pending)", gateValue(root, "specification") === "pending");
  }

  // 4 - unknown gate name
  {
    const root = createSandbox();
    seedState(root);
    const r = approve(root, FEATURE, "invalid-gate");
    check("REFUSES an unknown gate name", !r.ok, r.output);
  }

  // 5 - the features[0] bug: an unknown feature must never be silently substituted
  {
    const root = createSandbox();
    seedState(root);
    seedSpecFiles(root, { files: { "spec.md": "# Spec\n" } });
    seedGovFiles(root, { files: { "spec.json": {} } });

    const r = approve(root, "does-not-exist", "specification");
    check("REFUSES an unknown feature rather than falling back to features[0]", !r.ok, r.output);
    check("  ...and does not touch the real feature's gates", gateValue(root, "specification") === "pending");
  }

  // 6 - the record is accurate
  {
    const root = createSandbox();
    seedState(root);
    seedSpecFiles(root, { files: { "spec.md": "# Spec\n" } });
    seedGovFiles(root, { files: { "spec.json": {} } });

    approve(root, FEATURE, "specification");
    const entry = history(root).find((e) => e.event === "specification_approved");

    check("history records the approval", Boolean(entry));
    check("  ...with the previous value", entry && entry.previousValue === "pending", entry && String(entry.previousValue));
    check("  ...attributed to an actor", Boolean(entry && (entry.by || entry.actor)));
    check("  ...with a valid ISO timestamp", Boolean(entry && !Number.isNaN(Date.parse(entry.timestamp))));
  }

  // 7 - approving twice must not duplicate the record
  {
    const root = createSandbox();
    seedState(root);
    seedSpecFiles(root, { files: { "spec.md": "# Spec\n" } });
    seedGovFiles(root, { files: { "spec.json": {} } });

    approve(root, FEATURE, "specification");
    const before = history(root).length;
    const r = approve(root, FEATURE, "specification");

    check("re-approving an approved gate is a no-op", r.ok && history(root).length === before, r.output);
  }

  // 8 - prerequisites
  {
    const root = createSandbox();
    seedState(root, { phase: "ongoing" });
    seedGovFiles(root, { files: { "plan.json": {}, "tasks.json": { phases: [] }, "traceability.json": {} } });

    const r = approve(root, FEATURE, "implementation");
    check("REFUSES implementation while earlier gates are unapproved", !r.ok, r.output);
    check("  ...and names the missing prerequisite", /Prerequisite gate/.test(r.output), r.output);
  }

  // 9 - incomplete tasks
  {
    const root = createSandbox();
    seedState(root, { phase: "ongoing", gates: { specification: "approved", planning: "approved" } });
    seedSpecFiles(root, { files: { "spec.md": "# Spec\n", "plan.md": "# Plan\n", "tasks.md": "# Tasks\n" } });
    seedGovFiles(root, {
      files: {
        "verification.json": { status: "pass" },
        "tasks.json": {
          phases: [
            {
              phaseId: "P1",
              name: "Phase one",
              tasks: [
                { id: "T1.1", completed: true },
                { id: "T1.2", completed: false }
              ]
            }
          ]
        }
      }
    });

    const r = approve(root, FEATURE, "implementation");
    check("REFUSES implementation while a task is incomplete", !r.ok, r.output);
    check("  ...and reports how many are left", /1 of 2 tasks are still incomplete/.test(r.output), r.output);
  }

  // 10 - everything done
  {
    const root = createSandbox();
    seedState(root, { phase: "ongoing", gates: { specification: "approved", planning: "approved" } });
    seedSpecFiles(root, { files: { "spec.md": "# Spec\n", "plan.md": "# Plan\n", "tasks.md": "# Tasks\n" } });
    seedGovFiles(root, {
      files: {
        "verification.json": { status: "pass" },
        "tasks.json": {
          phases: [
            {
              phaseId: "P1",
              name: "Phase one",
              tasks: [
                { id: "T1.1", completed: true },
                { id: "T1.2", completed: true }
              ]
            }
          ]
        }
      }
    });

    const r = approve(root, FEATURE, "implementation");
    check(
      "approves implementation when every task is complete",
      r.ok && gateValue(root, "implementation") === "approved",
      r.output
    );
  }

  // 11 - failing spec-to-code verification
  {
    const root = createSandbox();
    seedState(root, { phase: "ongoing", gates: { specification: "approved", planning: "approved" } });
    seedSpecFiles(root, { files: { "spec.md": "# Spec\n", "plan.md": "# Plan\n", "tasks.md": "# Tasks\n" } });
    seedGovFiles(root, {
      files: {
        "verification.json": { status: "fail" },
        "tasks.json": { phases: [{ phaseId: "P1", name: "Phase one", tasks: [{ id: "T1.1", completed: true }] }] }
      }
    });

    const r = approve(root, FEATURE, "implementation");
    check("REFUSES implementation when verification.json reports fail", !r.ok, r.output);
  }

  // 12 - review needs a passing verdict
  {
    const root = createSandbox();
    seedState(root, {
      phase: "ongoing",
      gates: { specification: "approved", planning: "approved", implementation: "approved" }
    });
    seedSpecFiles(root, { files: {} });

    const missing = approve(root, FEATURE, "review");
    check("REFUSES review when review.md is missing", !missing.ok, missing.output);

    seedSpecFiles(root, { files: { "review.md": "Status: FAIL\n" } });
    const failing = approve(root, FEATURE, "review");
    check("REFUSES review when the verdict is not PASS", !failing.ok, failing.output);

    seedSpecFiles(root, { files: { "review.md": "Status: PASS\n" } });
    const passing = approve(root, FEATURE, "review");
    check(
      "approves review when review.md records Status: PASS",
      passing.ok && gateValue(root, "review") === "approved",
      passing.output
    );
  }

  // 13 - archived features are history, not editable state
  {
    const root = createSandbox();
    seedState(root, { phase: "completed" });
    seedSpecFiles(root, { stage: "completed", files: { "spec.md": "# Spec\n" } });
    seedGovFiles(root, { files: { "spec.json": {} } });

    const r = approve(root, FEATURE, "specification");
    check("REFUSES approving gates on an archived feature", !r.ok, r.output);
  }

  const failed = results.filter((r) => !r.pass);

  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length === 0) {
    console.log("✅ All gate-approval tests passed.\n");
    process.exit(0);
  }

  console.log("❌ Some gate-approval tests failed.\n");
  process.exit(1);
}

run();
