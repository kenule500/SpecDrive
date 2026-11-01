// Red-before-green tests.
//
//   node --test test/unit/red-green.test.js
//
// The rule these pin: coverage asks "is this criterion tested?", and every other gate
// accepts the answer. A test that passes both before and after the change satisfies
// all of them while proving nothing, so the only trustworthy question is whether the
// suite FAILED without the work.
//
// The second rule is the promise made to running projects: switching the check on must
// never refuse work that was already in flight. That is grandfathering, and it is
// tested here as a mechanism rather than trusted as an intention.
const test = require("node:test");
const assert = require("node:assert");

const {
  redGreenBlockers,
  isGrandfatheredVersion,
  earliestActivityAt
} = require("../../commands/gates");

function spec(ids) {
  // Acceptance criteria live on user stories - the same place the review gate reads
  // them from - so the fixture must match the real spec.json shape or every assertion
  // here would pass vacuously against an empty criterion list.
  return {
    userStories: [
      {
        id: "US-001",
        title: "A story",
        role: "user",
        want: "a thing",
        benefit: "value",
        acceptanceCriteria: ids.map((id) => ({ id, text: `Criterion ${id} must hold.` }))
      }
    ]
  };
}

function trace(ids) {
  return {
    rows: [{ acceptanceCriteriaIds: ids, testIds: ["TEST-001"], status: "complete" }]
  };
}

function evidence(entries) {
  return {
    feature: "red-green-demo",
    version: "v1",
    command: "npm test",
    exitCode: 0,
    timedOut: false,
    startedAt: "2026-10-30T00:00:00.000Z",
    finishedAt: "2026-10-30T00:00:05.000Z",
    durationMs: 5000,
    outputHash: `sha256:${"a".repeat(64)}`,
    summary: { passed: 3, failed: 0, skipped: 0, total: 3 },
    testIds: ["TEST-001"],
    acIds: ["AC-001"],
    ...(entries ? { redGreen: entries } : {})
  };
}

test("no test-evidence.json is refused, because proof cannot come from nothing", () => {
  const blockers = redGreenBlockers({
    evidence: null,
    specJson: spec(["AC-001"]),
    traceJson: trace(["AC-001"]),
    featureName: "red-green-demo"
  });

  assert.strictEqual(blockers.length, 1);
  assert.match(blockers[0], /no test-evidence\.json/);
  assert.match(blockers[0], /--prove/);
});

test("evidence with no red-before-green record is refused for every covered criterion", () => {
  const blockers = redGreenBlockers({
    evidence: evidence(undefined),
    specJson: spec(["AC-001", "AC-002"]),
    traceJson: trace(["AC-001", "AC-002"]),
    featureName: "red-green-demo"
  });

  assert.strictEqual(blockers.length, 1);
  assert.match(blockers[0], /2 of 2 covered acceptance criteria have no red-before-green evidence/);
});

test("a test that also passes without the change is refused, and says which criterion", () => {
  const blockers = redGreenBlockers({
    evidence: evidence([
      { ac: "AC-001", test: "npm test", proven: true, method: "base-run", baseExitCode: 1 },
      { ac: "AC-002", test: "npm test", proven: false, method: "base-run", baseExitCode: 0 }
    ]),
    specJson: spec(["AC-001", "AC-002"]),
    traceJson: trace(["AC-001", "AC-002"]),
    featureName: "red-green-demo"
  });

  assert.strictEqual(blockers.length, 1);
  assert.match(blockers[0], /AC-002/);
  assert.match(blockers[0], /pass without the work/);
  // The published exit code is what makes the refusal checkable by hand.
  assert.match(blockers[0], /exit 0 at base/);
  // A proven criterion must not be named as a problem.
  assert.ok(!/AC-001/.test(blockers[0]));
});

test("every covered criterion proven red-before-green passes", () => {
  const blockers = redGreenBlockers({
    evidence: evidence([
      { ac: "AC-001", test: "npm test", proven: true, method: "base-run", baseExitCode: 1 },
      { ac: "AC-002", test: "npm test", proven: true, method: "base-run", baseExitCode: 1 }
    ]),
    specJson: spec(["AC-001", "AC-002"]),
    traceJson: trace(["AC-001", "AC-002"]),
    featureName: "red-green-demo"
  });

  assert.deepStrictEqual(blockers, []);
});

test("a criterion with no covering test is left to the coverage gate, not double-reported", () => {
  // AC-001 is declared but nothing covers it. Coverage owns that refusal; red-green
  // must stay silent about it or the actionable message gets buried.
  const blockers = redGreenBlockers({
    evidence: evidence([
      { ac: "AC-002", test: "npm test", proven: true, method: "base-run", baseExitCode: 1 }
    ]),
    specJson: spec(["AC-001", "AC-002"]),
    traceJson: trace(["AC-002"]),
    featureName: "red-green-demo"
  });

  assert.deepStrictEqual(blockers, []);
});

test("nothing covered produces no red-green complaint", () => {
  const blockers = redGreenBlockers({
    evidence: evidence([]),
    specJson: spec(["AC-001"]),
    traceJson: { rows: [] },
    featureName: "red-green-demo"
  });

  assert.deepStrictEqual(blockers, []);
});

test("a version's earliest activity is the oldest of its history and gate timestamps", () => {
  const version = {
    history: [
      { event: "specification_approved", timestamp: "2026-10-02T10:00:00.000Z" },
      { event: "planning_approved", timestamp: "2026-10-03T10:00:00.000Z" }
    ],
    gates: {
      specification: { status: "approved", by: "sam", at: "2026-10-01T09:00:00.000Z" },
      planning: "approved"
    }
  };

  assert.strictEqual(earliestActivityAt(version), "2026-10-01T09:00:00.000Z");
});

test("a version with no timestamps at all has unknown age", () => {
  assert.strictEqual(earliestActivityAt({ gates: { specification: "approved" } }), null);
  assert.strictEqual(earliestActivityAt(undefined), null);
});

test("grandfathering is by the cutoff, and unknown age is grandfathered", () => {
  const cutoff = "2026-10-15T00:00:00.000Z";
  const inFlight = {
    history: [{ event: "specification_approved", timestamp: "2026-10-01T00:00:00.000Z" }]
  };
  const fresh = {
    history: [{ event: "specification_approved", timestamp: "2026-10-20T00:00:00.000Z" }]
  };
  const unknown = { gates: { specification: "approved" } };

  assert.strictEqual(isGrandfatheredVersion(inFlight, cutoff), true, "in-flight work is grandfathered");
  assert.strictEqual(isGrandfatheredVersion(fresh, cutoff), false, "work proposed after the cutoff is governed");
  assert.strictEqual(isGrandfatheredVersion(unknown, cutoff), true, "unknown age must not be refused");
  assert.strictEqual(isGrandfatheredVersion(fresh, null), true, "with no cutoff nothing is enforced");
});
