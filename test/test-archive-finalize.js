// Tests for `sdrive archive:check` and `sdrive archive:finalize`.
//
//   Run from the repository root:  node test/test-archive-finalize.js
//
// The invariant under test: a feature that was never tested or reviewed can NEVER be
// recorded as archived. Closing a lifecycle must fail rather than promote a gate, and
// it must not write the record before the spec folder has actually moved.
//
// Everything runs in a throwaway temp dir, so no real .sdrive/ state is touched.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const CLI = path.join(__dirname, "..", "src", "index.js");
const FEATURE = "demo-feature";
const VERSION = "v1";

const results = [];

function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition) });
  const suffix = condition || !detail ? "" : `\n          ${String(detail).trim().split("\n").join("\n          ")}`;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${suffix}`);
}

function run(repo, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout || ""}${result.stderr || ""}` };
}

function sdrive(root, ...parts) {
  return path.join(root, ".sdrive", ...parts);
}

function statePath(root) {
  return sdrive(root, "workflow-state.json");
}

function readState(root) {
  return JSON.parse(fs.readFileSync(statePath(root), "utf8"));
}

function version(root) {
  return readState(root).features[0].versions[0];
}

function specFolderExists(root, stage) {
  return fs.existsSync(sdrive(root, "specs", stage, FEATURE, VERSION));
}

const ALL_APPROVED = {
  specification: "approved",
  planning: "approved",
  implementation: "approved",
  review: "approved"
};

// A feature whose evidence is complete: ACs in spec.json, a passing test per AC in
// traceability.json, a PASS verdict in review.md, and the test report that only
// /sdrive:test writes.
function seedFeature(root, { gates = ALL_APPROVED, traceability = true, reviewMd = true, testReport = true } = {}) {
  const specDir = sdrive(root, "specs", "ongoing", FEATURE, VERSION);
  const govDir = sdrive(root, "governance", FEATURE, VERSION);
  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(govDir, { recursive: true });

  fs.writeFileSync(path.join(specDir, "spec.md"), "# Spec\n");
  fs.writeFileSync(path.join(specDir, "plan.md"), "# Plan\n");
  fs.writeFileSync(path.join(specDir, "tasks.md"), "# Tasks\n");

  if (reviewMd) {
    fs.writeFileSync(path.join(specDir, "review.md"), "Status: PASS\n");
  }

  if (testReport) {
    const reportsDir = sdrive(root, "reports", "tests");
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportsDir, `test-report-${FEATURE}-${VERSION}-2026-01-01.md`),
      "# Test report\n"
    );
  }

  fs.writeFileSync(
    path.join(govDir, "spec.json"),
    JSON.stringify({
      feature: FEATURE,
      version: 1,
      userStories: [
        {
          id: "US-001",
          title: "A story",
          role: "user",
          want: "a thing",
          benefit: "value",
          acceptanceCriteria: [{ id: "AC-001", text: "The criterion must hold." }]
        }
      ]
    })
  );

  if (traceability) {
    fs.writeFileSync(
      path.join(govDir, "traceability.json"),
      JSON.stringify({
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
      })
    );
  }

  fs.writeFileSync(
    statePath(root),
    JSON.stringify(
      {
        features: [
          {
            name: FEATURE,
            currentVersion: VERSION,
            versions: [
              {
                id: VERSION,
                phase: "ongoing",
                currentStep: "review",
                gates: { ...gates },
                history: [{ event: "feature_created", timestamp: new Date().toISOString() }]
              }
            ]
          }
        ]
      },
      null,
      2
    )
  );

  return root;
}

function newRepo(options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-archive-"));
  return seedFeature(root, options);
}

// Sets `base` on the seeded feature and, optionally, adds a peer feature whose branch
// is that base.
function withBase(root, base, peer) {
  const state = readState(root);
  const primary = state.features[0];
  primary.base = base;
  primary.branch = `feature/${FEATURE}`;

  if (peer) {
    state.features.push({
      name: peer.name,
      currentVersion: "v1",
      branch: peer.branch,
      versions: [
        {
          id: "v1",
          phase: peer.phase || "ongoing",
          currentStep: "review",
          gates: { ...ALL_APPROVED },
          history: []
        }
      ]
    });
  }

  fs.writeFileSync(statePath(root), JSON.stringify(state, null, 2));
}

console.log("=== archive finalization tests ===\n");

// ---------------------------------------------------------------------------
// 1 - the core invariant: no approval, no archive
// ---------------------------------------------------------------------------
{
  const root = newRepo({ gates: { ...ALL_APPROVED, review: "pending" } });
  const before = fs.readFileSync(statePath(root), "utf8");

  const r = run(root, ["archive:finalize", FEATURE]);

  check("REFUSES to finalize when a gate is not approved", r.status !== 0, r.output);
  check("  ...naming the outstanding gate", /Gate "review" is "pending"/.test(r.output), r.output);
  check("  ...and telling the user how to fix it", /sdrive approve demo-feature review/.test(r.output), r.output);
  check("  ...without promoting the gate", version(root).gates.review === "pending");
  check("  ...and writing nothing at all", fs.readFileSync(statePath(root), "utf8") === before);
  check("  ...leaving the spec where it was", specFolderExists(root, "ongoing") && !specFolderExists(root, "completed"));
}

// ---------------------------------------------------------------------------
// 2 - untested work cannot be archived: coverage is re-checked at archive time
// ---------------------------------------------------------------------------
{
  const root = newRepo({ traceability: false });
  const r = run(root, ["archive:finalize", FEATURE]);

  check("REFUSES to finalize when traceability.json is missing", r.status !== 0, r.output);
  check(
    "  ...flagging that the evidence changed since approval",
    /Evidence changed since approval/.test(r.output),
    r.output
  );
  check("  ...and leaving the version ongoing", version(root).phase === "ongoing");
}

// ---------------------------------------------------------------------------
// 3 - evidence deleted AFTER the approval is still caught
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  check("precondition: the feature is archivable to begin with", run(root, ["archive:check", FEATURE]).status === 0);

  fs.rmSync(sdrive(root, "governance", FEATURE, VERSION, "traceability.json"));

  const r = run(root, ["archive:finalize", FEATURE]);
  check("REFUSES after the evidence is deleted post-approval", r.status !== 0, r.output);
  check("  ...reporting unverifiable coverage", /coverage cannot be verified/.test(r.output), r.output);
}

// ---------------------------------------------------------------------------
// 4 - a missing verdict cannot be archived
// ---------------------------------------------------------------------------
{
  const root = newRepo({ reviewMd: false });
  const r = run(root, ["archive:finalize", FEATURE]);

  check("REFUSES to finalize when review.md is missing", r.status !== 0, r.output);
  check("  ...reporting the missing verdict", /review\.md/.test(r.output), r.output);
}

// ---------------------------------------------------------------------------
// 4b - tests that were never run cannot reach completed/
// ---------------------------------------------------------------------------
{
  const root = newRepo({ testReport: false });
  const r = run(root, ["archive:finalize", FEATURE]);

  check("REFUSES to finalize when no test report exists", r.status !== 0, r.output);
  check("  ...telling the user to run /sdrive:test", /sdrive:test/.test(r.output), r.output);
}

// ---------------------------------------------------------------------------
// 5 - archive:check is read-only
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  const before = fs.readFileSync(statePath(root), "utf8");

  const r = run(root, ["archive:check", FEATURE]);

  check("archive:check succeeds on a complete feature", r.status === 0, r.output);
  check("  ...without touching workflow-state.json", fs.readFileSync(statePath(root), "utf8") === before);
  check("  ...and without moving any folder", specFolderExists(root, "ongoing") && !specFolderExists(root, "completed"));
}

// ---------------------------------------------------------------------------
// 6 - the happy path actually closes the lifecycle
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  const r = run(root, ["archive:finalize", FEATURE, "--merge-commit", "abc1234"]);

  check("finalizes a fully approved, fully evidenced feature", r.status === 0, r.output);
  check("  ...moving the spec to completed/", specFolderExists(root, "completed"), r.output);
  check("  ...removing it from ongoing/", !specFolderExists(root, "ongoing"), r.output);
  check("  ...marking the version completed", version(root).phase === "completed", version(root).phase);
  check(
    "  ...and recording where it came from",
    version(root).history.some((e) => e.event === "feature_archived" && e.from === "ongoing"),
    JSON.stringify(version(root).history)
  );
  check(
    "  ...with the merge commit in the audit trail",
    version(root).history.some((e) => e.mergeCommit === "abc1234"),
    JSON.stringify(version(root).history)
  );
  check(
    "  ...leaving governance exactly where it was",
    fs.existsSync(sdrive(root, "governance", FEATURE, VERSION, "traceability.json")) &&
      !fs.existsSync(sdrive(root, "governance", "completed"))
  );
}

// ---------------------------------------------------------------------------
// 7 - idempotency: a re-run must not duplicate history
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  run(root, ["archive:finalize", FEATURE]);

  const historyLength = version(root).history.length;
  const again = run(root, ["archive:finalize", FEATURE]);

  check("a second finalize reports already finalized", again.status === 0 && /already finalized/.test(again.output), again.output);
  check("  ...and appends no duplicate history", version(root).history.length === historyLength, String(version(root).history.length));

  const checkAgain = run(root, ["archive:check", FEATURE]);
  check("archive:check also reports it as already finalized", /already finalized/.test(checkAgain.output), checkAgain.output);
}

// ---------------------------------------------------------------------------
// 8 - a released sibling version coexists: only THIS version moves
// ---------------------------------------------------------------------------
{
  const root = newRepo();

  // An earlier release of the same feature is already sitting in completed/.
  const sibling = sdrive(root, "specs", "completed", FEATURE, "v0");
  fs.mkdirSync(sibling, { recursive: true });
  fs.writeFileSync(path.join(sibling, "spec.md"), "# released v0\n");

  const r = run(root, ["archive:finalize", FEATURE]);

  check("finalizes even when the feature already has a released version", r.status === 0, r.output);
  check(
    "  ...moving only this version",
    specFolderExists(root, "completed") && !specFolderExists(root, "ongoing"),
    r.output
  );
  check(
    "  ...and leaving the released sibling untouched",
    fs.existsSync(path.join(sibling, "spec.md")),
    "the sibling version folder was disturbed"
  );
  check(
    "  ...marking only this version completed",
    version(root).phase === "completed",
    version(root).phase
  );
}

// ---------------------------------------------------------------------------
// 9 - unknown features
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  const r = run(root, ["archive:finalize", "does-not-exist"]);

  check("REFUSES an unknown feature", r.status !== 0, r.output);
  check("  ...rather than doing nothing quietly", /not in workflow-state\.json/.test(r.output), r.output);
}

// ---------------------------------------------------------------------------
// 10 - ordering: a STACKED feature cannot be archived, even with perfect evidence
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  withBase(root, "feature/parent-feature", {
    name: "parent-feature",
    branch: "feature/parent-feature",
    phase: "ongoing"
  });

  const r = run(root, ["archive:finalize", FEATURE]);

  check("REFUSES a feature stacked on an unlanded peer", r.status !== 0, r.output);
  check("  ...naming the parent", /STACKED on "parent-feature"/.test(r.output), r.output);
  check("  ...citing CON-611", /CON-611/.test(r.output), r.output);
  check("  ...saying it is ORDER, not missing evidence", /has not landed/.test(r.output), r.output);
  check("  ...and writing nothing", version(root).phase === "ongoing", version(root).phase);

  const checkOnly = run(root, ["archive:check", FEATURE]);
  check("archive:check reports the same blocker", /STACKED/.test(checkOnly.output), checkOnly.output);
}

// ---------------------------------------------------------------------------
// 11 - once the parent lands, the link is history and archiving proceeds
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  withBase(root, "feature/parent-feature", {
    name: "parent-feature",
    branch: "feature/parent-feature",
    phase: "completed"
  });

  const r = run(root, ["archive:finalize", FEATURE]);
  check("allows archiving once the parent has landed", r.status === 0, r.output);
  check("  ...without mentioning stacking", !/STACKED/.test(r.output), r.output);
}

// ---------------------------------------------------------------------------
// 12 - an integration base is NOT stacking (Git Flow's develop must not trip this)
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  withBase(root, "develop", null);

  const r = run(root, ["archive:finalize", FEATURE]);
  check("allows archiving when base is an integration branch", r.status === 0, r.output);
  check("  ...and does not call it stacked", !/STACKED/.test(r.output), r.output);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

if (failed.length > 0) {
  console.log("FAILED:");
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(1);
}

console.log("A lifecycle can only be closed on approvals that already exist.");
