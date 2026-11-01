const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { checkGateRequirements } = require("../../commands/gates");

const FEATURE = {
  name: "demo",
  currentVersion: "v1"
};

const VERSION = {
  id: "v1",
  phase: "ongoing",
  currentStep: "review",
  gates: {
    specification: "approved",
    planning: "approved",
    implementation: "approved",
    review: "pending"
  }
};

function setup(
  {
    structured = true,
    status = "PASS",
    reviewedBy = "reviewer",
    governance = {},
    audit = null,
    findings = []
  } = {}
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-review-gate-"));

  const specDir = path.join(root, ".sdrive", "specs", "ongoing", FEATURE.name, VERSION.id);
  const govDir = path.join(root, ".sdrive", "governance", FEATURE.name, VERSION.id);

  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(govDir, { recursive: true });

  fs.writeFileSync(path.join(root, ".sdrive", "config.json"), JSON.stringify({
    defaultTemplate: "generic",
    governance: { requireStructuredReview: true, requireTestEvidence: false, ...governance }
  }));

  fs.writeFileSync(path.join(specDir, "spec.md"), "# Spec\n");
  fs.writeFileSync(path.join(specDir, "plan.md"), "# Plan\n");
  fs.writeFileSync(path.join(specDir, "tasks.md"), "# Tasks\n");
  fs.writeFileSync(path.join(specDir, "review.md"), "Status: PASS\n");

  fs.writeFileSync(path.join(govDir, "spec.json"), JSON.stringify({
    feature: FEATURE.name,
    title: "Demo",
    version: 1,
    overview: {
      problemStatement: "A long enough problem statement.",
      proposedSolution: "A long enough proposed solution.",
      targetAudience: "users"
    },
    userStories: [
      {
        id: "US-001",
        title: "Demo story",
        role: "user",
        want: "x",
        benefit: "y",
        acceptanceCriteria: [{ id: "AC-001", text: "Given a thing, it works as described." }]
      }
    ],
    functionalRequirements: [{ id: "FR-001", text: "The system MUST work." }]
  }));

  fs.writeFileSync(path.join(govDir, "traceability.json"), JSON.stringify({
    feature: FEATURE.name,
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
  }));

  fs.writeFileSync(path.join(govDir, "tasks.json"), JSON.stringify({
    feature: FEATURE.name,
    version: 1,
    phases: [{ phaseId: "P1", name: "P", tasks: [{ id: "T1.1", title: "Do", completed: true }] }]
  }));

  if (structured) {
    fs.writeFileSync(path.join(govDir, "review.json"), JSON.stringify({
      feature: FEATURE.name,
      version: VERSION.id,
      status,
      commit: null,
      base: "main",
      branch: `feature/${FEATURE.name}`,
      reviewedBy,
      reviewedAt: new Date().toISOString(),
      coverage: 100,
      criteria: [{ id: "coverage", status: status === "PASS" ? "pass" : "fail", detail: "demo" }],
      findings,
      ...(audit || {}),
      evidence: {}
    }));
  }

  return root;
}

test("structured review passes when review.json matches and coverage is complete", () => {
  const root = setup();
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");
  assert.strictEqual(verdict.ok, true, verdict.blockers.join("; "));
});

test("structured review is required when governance.requireStructuredReview is true", () => {
  const root = setup({ structured: false });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.blockers.join(" "), /Missing review\.json/);
});

test("a failing structured status blocks approval", () => {
  const root = setup({ status: "FAIL" });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.blockers.join(" "), /status "FAIL"/);
});

test("self-review produces a warning but not a false blocker", () => {
  const root = setup({ reviewedBy: "alice" });
  const feature = { ...FEATURE, assignee: "alice" };
  const verdict = checkGateRequirements(root, feature, VERSION, "review");
  assert.strictEqual(verdict.ok, true, verdict.blockers.join("; "));
  assert.match(verdict.warnings.join(" "), /both the assignee and the reviewer/);
});

test("a review recorded for an older commit is refused", () => {
  const root = setup();
  const git = (args) =>
    execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

  git(["init"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["add", "-A"]);
  git(["commit", "-m", "initial"]);

  const reviewFile = path.join(root, ".sdrive", "governance", FEATURE.name, VERSION.id, "review.json");
  const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
  review.commit = git(["rev-parse", "HEAD"]);
  fs.writeFileSync(reviewFile, JSON.stringify(review, null, 2));

  assert.strictEqual(checkGateRequirements(root, FEATURE, VERSION, "review").ok, true);

  fs.writeFileSync(path.join(root, ".sdrive", "specs", "ongoing", FEATURE.name, VERSION.id, "spec.md"), "# Spec changed\n");
  git(["add", "-A"]);
  git(["commit", "-m", "move head"]);

  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.blockers.join(" "), /review\.json is for commit/);
});

// ---------- SECURITY AND PERFORMANCE AUDITS ----------
//
// The audits are opt-in so an upgrade never refuses a feature that was already in
// flight. These tests pin both halves of that: nothing changes when the policy is off,
// and each refusal fires when it is on.

const SECURITY_ON = { requireReviewSecurity: true };

test("the audits stay optional when the project has not opted in", () => {
  const root = setup();
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");

  assert.strictEqual(verdict.ok, true, verdict.blockers.join("; "));
});

test("an opted-in project must record the security audit", () => {
  const root = setup({ governance: SECURITY_ON });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");

  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.blockers.join(" "), /no `security` audit/);
});

test("a recorded pass satisfies the audit requirement", () => {
  const root = setup({
    governance: SECURITY_ON,
    audit: { security: { status: "pass", secrets: "clean", dependencies: "clean" } }
  });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");

  assert.strictEqual(verdict.ok, true, verdict.blockers.join("; "));
});

test("a failing security audit blocks and names the fixing command", () => {
  const root = setup({ governance: SECURITY_ON, audit: { security: { status: "fail" } } });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");
  const blockers = verdict.blockers.join(" ");

  assert.strictEqual(verdict.ok, false);
  assert.match(blockers, /failing the security audit/);
  assert.match(blockers, /\/sdrive:secure demo/);
});

test("not_verified without a reason is refused even when the project allows it", () => {
  const root = setup({
    governance: { requireReviewSecurity: true, allowUnverifiedSecurity: true },
    audit: { security: { status: "not_verified" } }
  });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");

  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.blockers.join(" "), /not_verified" with no reason/);
});

test("not_verified with a reason still blocks unless the project accepts it", () => {
  const root = setup({
    governance: SECURITY_ON,
    audit: { security: { status: "not_verified", reason: "gitleaks is not installed" } }
  });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");

  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.blockers.join(" "), /does not accept unverified audits/);
});

test("not_verified with a reason passes once the project accepts it", () => {
  const root = setup({
    governance: { requireReviewSecurity: true, allowUnverifiedSecurity: true },
    audit: { security: { status: "not_verified", reason: "gitleaks is not installed" } }
  });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");

  assert.strictEqual(verdict.ok, true, verdict.blockers.join("; "));
});

test("not_applicable needs a reason, because it is a claim someone made", () => {
  const root = setup({ governance: SECURITY_ON, audit: { security: { status: "not_applicable" } } });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");

  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.blockers.join(" "), /not_applicable" with no reason/);
});

test("not_applicable with a reason passes", () => {
  const root = setup({
    governance: SECURITY_ON,
    audit: { security: { status: "not_applicable", reason: "library crate: no network surface" } }
  });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");

  assert.strictEqual(verdict.ok, true, verdict.blockers.join("; "));
});

test("a PASS verdict beside a fix-required high finding is a contradiction", () => {
  const root = setup({
    governance: SECURITY_ON,
    audit: { security: { status: "pass" } },
    findings: [
      { severity: "high", issue: "Hardcoded API key in config/dev.env", location: "config/dev.env", fixRequired: true }
    ]
  });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");

  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.blockers.join(" "), /high-severity finding/);
});

test("performance is gated independently of security", () => {
  const root = setup({
    governance: { requireReviewPerformance: true },
    audit: { performance: { status: "fail" } }
  });
  const verdict = checkGateRequirements(root, FEATURE, VERSION, "review");
  const blockers = verdict.blockers.join(" ");

  assert.strictEqual(verdict.ok, false);
  assert.match(blockers, /failing the performance audit/);
  assert.match(blockers, /\/sdrive:performance demo/);
  assert.doesNotMatch(blockers, /security audit/);
});
