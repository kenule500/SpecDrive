// Backwards-compatibility test: upgrading must not refuse work that was already in
// flight.
//
//   node --test test/test-backcompat.js
//
// This is the mechanism behind the promise "it only affects features about to be
// proposed". project 0.1.56 adds a review check that demands red-before-green evidence.
// If that check applied to features that were proposed under the old rules, every
// in-flight feature would be refused the moment the CLI upgraded - the same deadlock
// that `withdrawn` and `resolution` were added to escape.
//
// So: the check is opt-in, and it is grandfathered per feature by the cutoff stamped
// when the project switches it on. A feature whose earliest recorded activity predates
// the cutoff keeps the rules it was proposed under.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { checkGateRequirements } = require("../commands/gates");
const { initProject, runCli } = require("./helpers/sandbox");

const FEATURE_NAME = "in-flight-feature";
const VERSION_ID = "v1";
const CUTOFF = "2026-10-15T00:00:00.000Z";

// A project shaped exactly like one initialised before this check existed: evidence and
// review records in their old form, no `redGreen`, no `security`, no `performance`.
function legacyProject({ history, config }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-backcompat-"));
  const specDir = path.join(root, ".sdrive", "specs", "ongoing", FEATURE_NAME, VERSION_ID);
  const govDir = path.join(root, ".sdrive", "governance", FEATURE_NAME, VERSION_ID);

  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(govDir, { recursive: true });

  fs.writeFileSync(
    path.join(root, ".sdrive", "config.json"),
    `${JSON.stringify(
      {
        defaultTemplate: "generic",
        governance: {
          requireTestEvidence: true,
          requireStructuredReview: true,
          ...config
        }
      },
      null,
      2
    )}\n`
  );

  for (const [name, body] of Object.entries({
    "spec.md": "# Spec\n",
    "plan.md": "# Plan\n",
    "tasks.md": "# Tasks\n",
    "review.md": "Status: PASS\n"
  })) {
    fs.writeFileSync(path.join(specDir, name), body);
  }

  const write = (name, data) =>
    fs.writeFileSync(path.join(govDir, name), `${JSON.stringify(data, null, 2)}\n`);

  write("spec.json", {
    feature: FEATURE_NAME,
    version: 1,
    overview: {
      problemStatement: "The problem this feature solves.",
      proposedSolution: "The solution this feature provides.",
      targetAudience: "Operators"
    },
    userStories: [
      {
        id: "US-001",
        title: "A story",
        role: "user",
        want: "a thing",
        benefit: "value",
        acceptanceCriteria: [{ id: "AC-001", text: "Criterion AC-001 must hold." }]
      }
    ],
    functionalRequirements: [{ id: "FR-001", text: "The system must do the thing." }]
  });

  write("plan.json", { feature: FEATURE_NAME, version: 1 });
  write("tasks.json", {
    feature: FEATURE_NAME,
    version: 1,
    phases: [{ phaseId: "P1", name: "Phase one", tasks: [{ id: "T1.1", completed: true }] }]
  });
  write("verification.json", { status: "pass" });
  write("traceability.json", {
    feature: FEATURE_NAME,
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

  // The old shape: no redGreen array.
  write("test-evidence.json", {
    feature: FEATURE_NAME,
    version: VERSION_ID,
    command: "npm test",
    source: "package.json",
    exitCode: 0,
    timedOut: false,
    signal: null,
    commit: null,
    branch: null,
    startedAt: "2026-10-01T10:00:00.000Z",
    finishedAt: "2026-10-01T10:00:04.000Z",
    durationMs: 4000,
    outputHash: `sha256:${"b".repeat(64)}`,
    summary: { passed: 1, failed: 0, skipped: 0, total: 1 },
    testIds: ["TEST-001"],
    acIds: ["AC-001"]
  });

  // The old review shape: no security, no performance, no remediation.
  write("review.json", {
    feature: FEATURE_NAME,
    version: VERSION_ID,
    status: "PASS",
    reviewedBy: "sam",
    commit: null,
    findings: []
  });

  const version = {
    id: VERSION_ID,
    phase: "ongoing",
    currentStep: "review",
    gates: {
      specification: "approved",
      planning: "approved",
      implementation: "approved",
      review: "pending"
    },
    history: history.map((entry) => ({ ...entry }))
  };

  return { root, feature: { name: FEATURE_NAME, currentVersion: VERSION_ID }, version };
}

function redGreenComplaints(verdict) {
  return verdict.blockers.filter((blocker) => /red-before-green/i.test(blocker));
}

test("a feature that predates the cutoff is grandfathered, not refused", () => {
  const { root, feature, version } = legacyProject({
    history: [{ event: "specification_approved", timestamp: "2026-10-01T09:00:00.000Z" }],
    config: { requireRedGreen: true, redGreenEnforceFrom: CUTOFF }
  });

  const verdict = checkGateRequirements(root, feature, version, "review");

  assert.deepStrictEqual(
    redGreenComplaints(verdict),
    [],
    `in-flight work was refused: ${verdict.blockers.join(" | ")}`
  );
  assert.ok(
    verdict.warnings.some((warning) => /grandfathered/i.test(warning)),
    "the grandfather decision must be visible, not silent"
  );
});

test("a feature proposed after the cutoff must prove its tests fail without the work", () => {
  const { root, feature, version } = legacyProject({
    history: [{ event: "specification_approved", timestamp: "2026-10-20T09:00:00.000Z" }],
    config: { requireRedGreen: true, redGreenEnforceFrom: CUTOFF }
  });

  const verdict = checkGateRequirements(root, feature, version, "review");
  const complaints = redGreenComplaints(verdict);

  assert.strictEqual(complaints.length, 1, verdict.blockers.join(" | "));
  assert.match(complaints[0], /no red-before-green evidence/);
  assert.match(complaints[0], /--prove/);
});

test("with the check switched off, an old project behaves exactly as before", () => {
  const { root, feature, version } = legacyProject({
    history: [{ event: "specification_approved", timestamp: "2026-10-20T09:00:00.000Z" }],
    config: { requireRedGreen: false }
  });

  const verdict = checkGateRequirements(root, feature, version, "review");

  assert.deepStrictEqual(redGreenComplaints(verdict), []);
});

test("switched on with no cutoff recorded enforces nothing", () => {
  // A project can end up in this state by hand-editing config, or by a config.json
  // copied from elsewhere. Enforcing without a cutoff would refuse every feature at
  // once, so the safe reading is "nothing was dated, nothing is governed".
  const { root, feature, version } = legacyProject({
    history: [{ event: "specification_approved", timestamp: "2026-10-20T09:00:00.000Z" }],
    config: { requireRedGreen: true }
  });

  const verdict = checkGateRequirements(root, feature, version, "review");

  assert.deepStrictEqual(redGreenComplaints(verdict), []);
});

test("a review.json written before this release still validates against the new schema", () => {
  const root = initProject({ prefix: "sdrive-backcompat-schema-" });
  const govDir = path.join(root, ".sdrive", "governance", "legacy-review", "v1");

  fs.mkdirSync(govDir, { recursive: true });
  fs.writeFileSync(
    path.join(govDir, "review.json"),
    `${JSON.stringify(
      {
        // The exact shape 0.1.53 wrote: no security, no performance, no remediation.
        // If the new schema required any of them, every project's existing review
        // records would become invalid the moment they upgraded the CLI - and
        // `sdrive validate` is what `sdrive check` and CI run first.
        feature: "legacy-review",
        version: "v1",
        status: "PASS",
        commit: null,
        reviewedBy: "sam",
        reviewedAt: "2026-10-01T12:00:00.000Z",
        coverage: 100,
        criteria: [{ id: "C1", status: "pass", detail: "Covered by TEST-001." }],
        findings: []
      },
      null,
      2
    )}\n`
  );

  const result = runCli(["validate"], { cwd: root });

  assert.strictEqual(
    result.status,
    0,
    `an old review.json was rejected by the new schema:\n${result.stdout}\n${result.stderr}`
  );
});

