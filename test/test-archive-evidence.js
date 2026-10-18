#!/usr/bin/env node
/*
 * Guards the archive-time evidence requirements, in-process.
 *
 * Two rules matter here:
 *
 *   1. /sdrive:archive must not run until /sdrive:test and /sdrive:review have
 *      actually run. Coverage in traceability.json can be hand-edited to look
 *      complete, so the test REPORT (written only by /sdrive:test) is the evidence
 *      that the run happened — and its absence is a blocker, not a warning.
 *   2. A legacy feature with no recorded `base` still archives, but warns: the
 *      branch it came from is unknown, so the merge target is a fallback.
 *
 * No child processes, so this runs even where piped stdio is unavailable.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const { checkArchivable } = require(path.join(__dirname, "..", ".sdrive", "commands", "archive.js"));

const FEATURE = "demo";
const VERSION = "v1";
const ALL_APPROVED = {
  specification: "approved",
  planning: "approved",
  implementation: "approved",
  review: "approved"
};

let failures = 0;
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name.padEnd(58)} ${pass ? "" : `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

function build({ report = false, review = true, base = "develop" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-archev-"));
  const spec = path.join(root, ".sdrive", "specs", "ongoing", FEATURE, VERSION);
  const gov = path.join(root, ".sdrive", "governance", FEATURE, VERSION);
  fs.mkdirSync(spec, { recursive: true });
  fs.mkdirSync(gov, { recursive: true });

  fs.writeFileSync(path.join(spec, "spec.md"), "# Spec\n");
  fs.writeFileSync(path.join(spec, "plan.md"), "# Plan\n");
  fs.writeFileSync(path.join(spec, "tasks.md"), "# Tasks\n");
  if (review) fs.writeFileSync(path.join(spec, "review.md"), "Status: PASS\n");

  fs.writeFileSync(
    path.join(gov, "spec.json"),
    JSON.stringify({
      feature: FEATURE,
      version: 1,
      userStories: [
        {
          id: "US-001",
          title: "t",
          role: "r",
          want: "w",
          benefit: "b",
          acceptanceCriteria: [{ id: "AC-001", text: "x" }]
        }
      ]
    })
  );

  fs.writeFileSync(
    path.join(gov, "traceability.json"),
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

  if (report) {
    const dir = path.join(root, ".sdrive", "reports", "tests");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `test-report-${FEATURE}-${VERSION}-2026-01-01.md`), "# Tests\n");
  }

  fs.writeFileSync(
    path.join(root, ".sdrive", "workflow-state.json"),
    JSON.stringify({
      features: [
        {
          name: FEATURE,
          branch: `feature/${FEATURE}`,
          ...(base ? { base } : {}),
          currentVersion: VERSION,
          versions: [{ id: VERSION, phase: "ongoing", gates: ALL_APPROVED }]
        }
      ]
    })
  );

  return root;
}

const roots = [];

// ---------- 1. tests never ran ----------
{
  const root = build({ report: false });
  roots.push(root);
  const verdict = checkArchivable(root, FEATURE);

  check("tests never ran: archive is refused", verdict.ok, false);
  check("  ...the blocker names the missing report", /No test report/.test(verdict.blockers.join("\n")), true);
  check("  ...and tells the user to run /sdrive:test", /sdrive:test/.test(verdict.blockers.join("\n")), true);
}

// ---------- 2. tests ran and review passed ----------
{
  const root = build({ report: true });
  roots.push(root);
  const verdict = checkArchivable(root, FEATURE);

  check("report + PASS review: archivable", verdict.ok, true);
  check("  ...with a recorded base, no fallback warning", verdict.warnings.some((w) => /No recorded "base"/.test(w)), false);
}

// ---------- 3. tests ran but there is no verdict ----------
{
  const root = build({ report: true, review: false });
  roots.push(root);
  const verdict = checkArchivable(root, FEATURE);

  check("no review.md: archive is refused", verdict.ok, false);
  check("  ...the blocker names review.md", /review\.md/.test(verdict.blockers.join("\n")), true);
}

// ---------- 4. legacy feature with no base ----------
{
  const root = build({ report: true, base: null });
  roots.push(root);
  const verdict = checkArchivable(root, FEATURE);

  check("no base recorded: still archivable", verdict.ok, true);
  check("  ...but the unknown origin is a warning", verdict.warnings.some((w) => /No recorded "base"/.test(w)), true);
}

roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true }));

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all archive-evidence cases passed");
