// Gate-criteria tests: prerequisite ordering and withdrawn acceptance criteria.
//
//   node --test test/unit/gate-criteria.test.js
//
// Two reports from the field are pinned here:
//
//   1. `sdrive approve <feature> implementation` refused, naming `implementation` - the
//      gate being approved - as the prerequisite that had to be approved first. That
//      refusal is unfixable from the user's side, so no ordering of GATE_ORDER may ever
//      produce it.
//
//   2. A specification can contain an acceptance criterion that cannot be implemented
//      (a provider endpoint that does not exist). Coverage counted it as untested, so
//      the feature could never be archived. Withdrawal is now a first-class, cited
//      decision that leaves coverage - and one that cannot be used to skip a test.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  GATE_ORDER,
  checkGateRequirements,
  collectAcceptanceCriteria,
  collectWithdrawnAcceptanceCriteria,
  collectSubstantiatedWithdrawals,
  collectEffectiveAcceptanceCriteria
} = require("../../commands/gates");

const FEATURE_NAME = "criteria-demo";
const VERSION_ID = "v1";

function criterion(id, extra = {}) {
  return { id, text: `Criterion ${id} must hold.`, ...extra };
}

function withdrawn(id) {
  return criterion(id, {
    withdrawn: true,
    withdrawnReason: "The provider publishes no endpoint for this behaviour.",
    withdrawnEvidence: "https://example.test/discovery/localservices:v1"
  });
}

// Builds a complete, archivable feature so each test can vary one thing. Every artifact
// a gate reads is present, which is what makes a refusal meaningful.
function project({ criteria = [criterion("AC-001")], tested = ["AC-001"], gates = {}, phases = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-criteria-"));
  const specDir = path.join(root, ".sdrive", "specs", "ongoing", FEATURE_NAME, VERSION_ID);
  const govDir = path.join(root, ".sdrive", "governance", FEATURE_NAME, VERSION_ID);

  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(govDir, { recursive: true });

  // Existing projects opt in per key; keeping evidence and structured review off here
  // isolates the coverage rule these tests are about.
  fs.writeFileSync(
    path.join(root, ".sdrive", "config.json"),
    `${JSON.stringify(
      {
        defaultTemplate: "generic",
        governance: { requireTestEvidence: false, requireStructuredReview: false }
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
        acceptanceCriteria: criteria
      }
    ],
    functionalRequirements: [{ id: "FR-001", text: "The system must do the thing." }]
  });

  write("plan.json", { feature: FEATURE_NAME, version: 1 });
  write("tasks.json", {
    feature: FEATURE_NAME,
    version: 1,
    phases: phases || [
      { phaseId: "P1", name: "Phase one", tasks: [{ id: "T1.1", completed: true }] }
    ]
  });
  write("verification.json", { status: "pass" });

  write("traceability.json", {
    feature: FEATURE_NAME,
    version: 1,
    rows: criteria.map((ac, index) => {
      const isTested = tested.includes(ac.id);

      return {
        requirementId: `FR-${String(index + 1).padStart(3, "0")}`,
        acceptanceCriteriaIds: [ac.id],
        taskIds: ["T1.1"],
        testIds: isTested ? [`TEST-${String(index + 1).padStart(3, "0")}`] : [],
        status: isTested ? "complete" : "in_progress"
      };
    })
  });

  const version = {
    id: VERSION_ID,
    phase: "ongoing",
    currentStep: "review",
    gates: {
      specification: "approved",
      planning: "approved",
      implementation: "approved",
      review: "pending",
      ...gates
    }
  };

  return { root, feature: { name: FEATURE_NAME, currentVersion: VERSION_ID }, version };
}

// ---------------------------------------------------------------- prerequisites ---

test("issue 1: approving a gate never names that gate as its own prerequisite", () => {
  for (const gate of GATE_ORDER) {
    const { root, feature, version } = project({
      gates: {
        specification: "approved",
        planning: "approved",
        implementation: "approved",
        review: "approved",
        [gate]: "pending"
      }
    });

    const verdict = checkGateRequirements(root, feature, version, gate);
    const selfReference = new RegExp(`Prerequisite gate "${gate}"`);

    assert.ok(
      !verdict.blockers.some((blocker) => selfReference.test(blocker)),
      `approving "${gate}" produced a self-referential prerequisite: ${verdict.blockers.join(" | ")}`
    );
  }
});

test("issue 1: implementation is approvable with only specification and planning cleared", () => {
  const { root, feature, version } = project({
    gates: { implementation: "pending", review: "pending" }
  });

  const verdict = checkGateRequirements(root, feature, version, "implementation");

  assert.strictEqual(verdict.ok, true, verdict.blockers.join("\n"));
});

test("prerequisites are still enforced for the gates that come after", () => {
  const { root, feature, version } = project({
    gates: { implementation: "pending", review: "pending" }
  });

  const verdict = checkGateRequirements(root, feature, version, "review");
  const text = verdict.blockers.join("\n");

  assert.strictEqual(verdict.ok, false);
  assert.match(text, /Prerequisite gate "implementation" is "pending"/);
  assert.match(text, /required before "review"/);
});

// ------------------------------------------------------------------- withdrawn ACs ---

test("collectors: a withdrawn criterion leaves coverage, the declared list keeps it", () => {
  const specJson = {
    userStories: [{ acceptanceCriteria: [criterion("AC-001"), withdrawn("AC-002")] }]
  };

  assert.deepStrictEqual(collectAcceptanceCriteria(specJson), ["AC-001", "AC-002"]);
  assert.deepStrictEqual(
    collectWithdrawnAcceptanceCriteria(specJson).map((entry) => entry.id),
    ["AC-002"]
  );
  assert.deepStrictEqual(
    collectSubstantiatedWithdrawals(specJson).map((entry) => entry.id),
    ["AC-002"]
  );
  assert.deepStrictEqual(collectEffectiveAcceptanceCriteria(specJson), ["AC-001"]);
});

test("issue 2: a withdrawn criterion does not block the review gate", () => {
  const { root, feature, version } = project({
    criteria: [criterion("AC-001"), withdrawn("AC-002")],
    tested: ["AC-001"]
  });

  const verdict = checkGateRequirements(root, feature, version, "review");

  assert.strictEqual(verdict.ok, true, verdict.blockers.join("\n"));
  assert.match(verdict.warnings.join("\n"), /1 acceptance criteria are withdrawn/);
  assert.match(verdict.warnings.join("\n"), /AC-002/);
});

test("issue 2: coverage counts only the criteria still in scope", () => {
  const { root, feature, version } = project({
    criteria: [criterion("AC-001"), criterion("AC-002"), withdrawn("AC-003")],
    tested: ["AC-001"]
  });

  const verdict = checkGateRequirements(root, feature, version, "review");
  const text = verdict.blockers.join("\n");

  assert.strictEqual(verdict.ok, false);
  assert.match(text, /1 of 2 acceptance criteria have no passing test/);
  assert.doesNotMatch(text, /of 3 acceptance criteria/);
});

test("an unexplained withdrawal is refused, not honoured", () => {
  const { root, feature, version } = project({
    criteria: [criterion("AC-001"), criterion("AC-002", { withdrawn: true })],
    tested: ["AC-001"]
  });

  const verdict = checkGateRequirements(root, feature, version, "review");
  const text = verdict.blockers.join("\n");

  assert.strictEqual(verdict.ok, false);
  assert.match(text, /marked withdrawn without a reason and evidence/);
  // AC-002 is still counted, so the untested set includes it.
  assert.match(text, /1 of 2 acceptance criteria have no passing test/);
});

test("withdrawing every criterion cannot clear the review gate", () => {
  const { root, feature, version } = project({
    criteria: [withdrawn("AC-001"), withdrawn("AC-002")],
    tested: []
  });

  const verdict = checkGateRequirements(root, feature, version, "review");

  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.blockers.join("\n"), /nothing is left in scope to verify/);
});

// -------------------------------------------------------------------------- schema ---

test("spec.schema.json: withdrawal requires a reason and a citation", () => {
  const Ajv = require("ajv");
  const addFormats = require("ajv-formats");
  const schemaPath = path.join(__dirname, "..", "..", "schemas", "spec.schema.json");

  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, "utf8")));

  const story = {
    id: "US-001",
    title: "A story",
    role: "user",
    want: "a thing",
    benefit: "value"
  };

  const spec = (criteria) => ({
    feature: FEATURE_NAME,
    title: "A feature with criteria",
    version: 1,
    overview: {
      problemStatement: "The problem this feature solves.",
      proposedSolution: "The solution this feature provides.",
      targetAudience: "Operators"
    },
    userStories: [{ ...story, acceptanceCriteria: criteria }],
    functionalRequirements: [{ id: "FR-001", text: "The system must do the thing." }]
  });

  assert.strictEqual(validate(spec([criterion("AC-001")])), true, JSON.stringify(validate.errors));
  assert.strictEqual(validate(spec([withdrawn("AC-001")])), true, JSON.stringify(validate.errors));

  assert.strictEqual(
    validate(spec([criterion("AC-001", { withdrawn: true })])),
    false,
    "a withdrawal with no reason must be schema-invalid"
  );

  assert.strictEqual(
    validate(
      spec([
        criterion("AC-001", {
          withdrawn: true,
          withdrawnReason: "Too short.",
          withdrawnEvidence: "https://example.test/discovery"
        })
      ])
    ),
    false,
    "a reason shorter than the schema minimum must be rejected"
  );
});

// -------------------------------------------------------------------- descoped work ---

function task(id, extra = {}) {
  return {
    id,
    title: `Task ${id} does the work.`,
    linkedRequirements: ["FR-001"],
    completed: false,
    ...extra
  };
}

function descopedTask(id) {
  return task(id, {
    resolution: {
      kind: "deferred",
      reason: "The vendor publishes no API for this behaviour, so the task cannot be performed.",
      at: "2026-10-29"
    }
  });
}

function phase(...tasks) {
  return [{ phaseId: "P1", name: "Phase one", tasks }];
}

test("a descoped task is excluded from completion but still reported", () => {
  const { root, feature, version } = project({
    gates: { implementation: "pending", review: "pending" },
    phases: phase(task("T1.1", { completed: true }), descopedTask("T1.2"))
  });

  const verdict = checkGateRequirements(root, feature, version, "implementation");

  assert.strictEqual(verdict.ok, true, verdict.blockers.join("\n"));
  assert.strictEqual(verdict.tasks.resolved, 1);
  assert.strictEqual(verdict.tasks.outstanding, 0);
  assert.match(verdict.warnings.join("\n"), /descoped and excluded from completion/);
  assert.match(verdict.warnings.join("\n"), /T1\.2/);
});

test("descoping one task does not excuse another left undone", () => {
  const { root, feature, version } = project({
    gates: { implementation: "pending" },
    phases: phase(task("T1.1", { completed: true }), descopedTask("T1.2"), task("T1.3"))
  });

  const verdict = checkGateRequirements(root, feature, version, "implementation");

  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.blockers.join("\n"), /1 of 3 tasks are still incomplete/);
});

test("a resolution with no reason is not a descope", () => {
  const { root, feature, version } = project({
    gates: { implementation: "pending" },
    phases: phase(
      task("T1.1", { completed: true }),
      task("T1.2", { resolution: { kind: "deferred" } })
    )
  });

  const verdict = checkGateRequirements(root, feature, version, "implementation");

  assert.strictEqual(verdict.ok, false);
  assert.strictEqual(verdict.tasks.resolved, 0);
  assert.match(verdict.blockers.join("\n"), /1 of 2 tasks are still incomplete/);
  assert.doesNotMatch(verdict.warnings.join("\n"), /descoped/);
});

test("resolution: a stated reason decides, not the presence of the key", () => {
  const { isResolved } = require("../../scripts/lib/resolution");

  assert.strictEqual(
    isResolved({ resolution: { kind: "deferred", reason: "No API exists for this." } }),
    true
  );
  assert.strictEqual(isResolved({ resolution: { kind: "deferred" } }), false);
  assert.strictEqual(isResolved({ resolution: { reason: "   " } }), false);
  assert.strictEqual(isResolved({ resolution: null }), false);
  assert.strictEqual(isResolved({}), false);
  assert.strictEqual(isResolved(null), false);
});


