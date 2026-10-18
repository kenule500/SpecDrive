// Tests for change control on a RELEASED feature: `sdrive version:new`.
//
//   Run from the repository root:  node test/test-version-new-released.js
//
// The invariant under test: adding a version to a feature that already shipped must NOT
// require un-archiving it, and must leave the released version's record completely
// untouched. Before this change, version:new only looked in specs/ongoing, so extending
// a released feature forced a `reopen` first - which mutated the shipped version's
// record into `phase: ongoing` with `review: pending`. A released version recorded as
// unfinished is a false record.
//
// Runs against a throwaway temp dir.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const CLI = path.join(__dirname, "..", "src", "index.js");
const VERSION_NEW_SRC = path.join(__dirname, "..", "scripts", "version-new.js");
const FEATURE = "demo-feature";

const results = [];

function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition) });
  const suffix = condition || !detail ? "" : `\n          ${String(detail).trim().split("\n").join("\n          ")}`;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${suffix}`);
}

function run(root, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout || ""}${result.stderr || ""}` };
}

function sdrive(root, ...parts) {
  return path.join(root, ".sdrive", ...parts);
}

function feature(root) {
  return JSON.parse(fs.readFileSync(sdrive(root, "workflow-state.json"), "utf8")).features[0];
}

function versionOf(root, id) {
  return feature(root).versions.find((v) => v.id === id);
}

// A feature that has already shipped: spec in completed/, version record completed,
// all four gates approved.
function newRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-vnew-"));

  const specDir = sdrive(root, "specs", "completed", FEATURE, "v1");
  const govDir = sdrive(root, "governance", FEATURE, "v1");
  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(govDir, { recursive: true });

  fs.writeFileSync(path.join(specDir, "spec.md"), "# Spec v1\n");
  fs.writeFileSync(path.join(specDir, "plan.md"), "# Plan v1\n");
  fs.writeFileSync(path.join(specDir, "tasks.md"), "# Tasks v1\n");
  fs.writeFileSync(path.join(specDir, "review.md"), "Status: PASS\n");
  ["spec", "plan", "tasks", "traceability"].forEach((n) =>
    fs.writeFileSync(path.join(govDir, `${n}.json`), "{}\n")
  );

  // version:new shells out to this project-local script.
  fs.mkdirSync(sdrive(root, "scripts"), { recursive: true });
  fs.copyFileSync(VERSION_NEW_SRC, sdrive(root, "scripts", "version-new.js"));

  fs.writeFileSync(
    sdrive(root, "workflow-state.json"),
    JSON.stringify(
      {
        features: [
          {
            name: FEATURE,
            currentVersion: "v1",
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

console.log("=== version:new on a released feature ===\n");

const root = newRepo();

// ---------------------------------------------------------------------------
// 1 - it works without un-archiving anything
// ---------------------------------------------------------------------------
const create = run(root, ["version:new", FEATURE]);
check("version:new succeeds on a released feature (no amend needed)", create.status === 0, create.output);
check("  ...reporting v2", /Version v2 created/.test(create.output), create.output);
check("  ...and saying the released version is untouched", /stays released/.test(create.output), create.output);

check("v2 is now current", feature(root).currentVersion === "v2", feature(root).currentVersion);
check(
  "  ...and both versions are recorded",
  feature(root).versions.length === 2,
  JSON.stringify(feature(root).versions.map((v) => v.id))
);

// ---------------------------------------------------------------------------
// 2 - v2 is a clean slate
// ---------------------------------------------------------------------------
{
  const v2 = versionOf(root, "v2");
  check("v2 starts ongoing", v2.phase === "ongoing", v2.phase);
  check("v2 starts at specification", v2.currentStep === "specification", v2.currentStep);
  check(
    "v2 has all four gates pending",
    Object.values(v2.gates).every((g) => g === "pending"),
    JSON.stringify(v2.gates)
  );
  check(
    "v2's spec folder is under ongoing/",
    fs.existsSync(sdrive(root, "specs", "ongoing", FEATURE, "v2", "spec.md"))
  );
}

// ---------------------------------------------------------------------------
// 3 - THE REGRESSION GUARD: v1's record is not touched
// ---------------------------------------------------------------------------
{
  const v1 = versionOf(root, "v1");

  check("v1 is still marked completed", v1.phase === "completed", v1.phase);
  check(
    "v1 keeps all four approvals",
    Object.values(v1.gates).every((g) => g === "approved"),
    JSON.stringify(v1.gates)
  );
  check("v1 is still recorded as the released one", v1.currentStep === "review", v1.currentStep);
  check(
    "v1's spec folder has not moved",
    fs.existsSync(sdrive(root, "specs", "completed", FEATURE, "v1", "spec.md"))
  );
  check(
    "  ...and no copy was left behind under ongoing/",
    !fs.existsSync(sdrive(root, "specs", "ongoing", FEATURE, "v1"))
  );
}

// ---------------------------------------------------------------------------
// 4 - archiving v2 moves ONLY v2, and v1 stays released
// ---------------------------------------------------------------------------
{
  // v2 is brand new, so it needs its OWN evidence and approvals before it can be
  // archived. A fresh version does not inherit the released version's review - that is
  // the entire point of starting a new version.
  const v2SpecDir = sdrive(root, "specs", "ongoing", FEATURE, "v2");
  const v2GovDir = sdrive(root, "governance", FEATURE, "v2");

  fs.writeFileSync(path.join(v2SpecDir, "review.md"), "Status: PASS\n");

  // Only /sdrive:test writes this report, and archive now refuses without it.
  const v2Reports = sdrive(root, "reports", "tests");
  fs.mkdirSync(v2Reports, { recursive: true });
  fs.writeFileSync(path.join(v2Reports, `test-report-${FEATURE}-v2-2026-01-01.md`), "# Tests v2\n");

  fs.writeFileSync(
    path.join(v2GovDir, "spec.json"),
    JSON.stringify({
      feature: FEATURE,
      version: 2,
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
  fs.writeFileSync(
    path.join(v2GovDir, "traceability.json"),
    JSON.stringify({
      feature: FEATURE,
      version: 2,
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

  const state = JSON.parse(fs.readFileSync(sdrive(root, "workflow-state.json"), "utf8"));
  const v2 = state.features[0].versions.find((v) => v.id === "v2");
  v2.gates = {
    specification: "approved",
    planning: "approved",
    implementation: "approved",
    review: "approved"
  };
  fs.writeFileSync(sdrive(root, "workflow-state.json"), JSON.stringify(state, null, 2));

  const archived = run(root, ["archive:finalize", FEATURE]);
  check("v2 can be finalized while v1 is still released", archived.status === 0, archived.output);

  check(
    "v2's spec moved to completed/",
    fs.existsSync(sdrive(root, "specs", "completed", FEATURE, "v2", "spec.md")),
    archived.output
  );
  check(
    "v1's spec is still in place",
    fs.existsSync(sdrive(root, "specs", "completed", FEATURE, "v1", "spec.md"))
  );
  check("v2 is completed", versionOf(root, "v2").phase === "completed", versionOf(root, "v2").phase);
  check("v1 is still completed", versionOf(root, "v1").phase === "completed", versionOf(root, "v1").phase);
  check(
    "the ongoing/ folder is gone, not half-moved",
    !fs.existsSync(sdrive(root, "specs", "ongoing", FEATURE))
  );
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

if (failed.length > 0) {
  console.log("FAILED:");
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(1);
}

console.log("Change control never touches a released version's record.");
