// Tests for `sdrive amend` - the CORRECTIVE ACTION for a wrongly-closed record.
//
//   Run from the repository root:  node test/test-amend-branches.js
//
// Amend is not "get back to work": it is for a lifecycle that was closed WRONGLY (a
// feature shipped before its tests were written, or archived by mistake). It therefore
// requires a reason, refuses anything that was not closed, and moves only the version
// being corrected - a released sibling version stays exactly where it is.
//
// Branch handling must obey the same standard as /sdrive:apply: CON-607 (a merged branch
// is never reused, it gets a -v2 name), CON-608 (never work on the integration branch)
// and CON-612 (a branch must not carry commits its base does not have).
//
// Runs against throwaway git repos in the OS temp dir.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const CLI = path.join(__dirname, "..", "src", "index.js");
const FEATURE = "demo-feature";

const results = [];

function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition) });
  const suffix = condition || !detail ? "" : `\n          ${String(detail).trim().split("\n").join("\n          ")}`;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${suffix}`);
}

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitQuiet(repo, args) {
  try {
    git(repo, args);
    return true;
  } catch (error) {
    return false;
  }
}

function sdrive(root, ...parts) {
  return path.join(root, ".sdrive", ...parts);
}

function feature(root) {
  return JSON.parse(fs.readFileSync(sdrive(root, "workflow-state.json"), "utf8")).features[0];
}

function version(root, id = "v1") {
  return feature(root).versions.find((v) => v.id === id);
}

function currentBranch(repo) {
  return git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

const ALL_APPROVED = {
  specification: "approved",
  planning: "approved",
  implementation: "approved",
  review: "approved"
};

// A repo on `main` with a feature whose spec sits under the given lifecycle stage.
function newRepo({ phase = "completed", specStage = "completed", sibling = false, git: wantsGit = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-amend-"));

  if (wantsGit) {
    git(root, ["init"]);
    git(root, ["config", "user.email", "verify@example.com"]);
    git(root, ["config", "user.name", "Verify"]);
    gitQuiet(root, ["checkout", "-b", "main"]);
    fs.writeFileSync(path.join(root, "README.md"), "# demo\n");
  }

  const specDir = sdrive(root, "specs", specStage, FEATURE, "v1");
  const govDir = sdrive(root, "governance", FEATURE, "v1");
  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(govDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, "spec.md"), "# Spec v1\n");
  fs.writeFileSync(path.join(govDir, "spec.json"), "{}\n");

  if (sibling) {
    const sib = sdrive(root, "specs", "completed", FEATURE, "v0");
    fs.mkdirSync(sib, { recursive: true });
    fs.writeFileSync(path.join(sib, "spec.md"), "# released v0\n");
  }

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
                phase,
                currentStep: "review",
                gates: { ...ALL_APPROVED },
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

  if (wantsGit) {
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "chore: seed closed feature"]);
  }

  return root;
}

function amend(root, args) {
  const result = spawnSync(process.execPath, [CLI, "amend", FEATURE, ...args], {
    cwd: root,
    encoding: "utf8"
  });
  return { status: result.status, output: `${result.stdout || ""}${result.stderr || ""}` };
}

const REASON = ["--reason", "archived before tests were written"];

console.log("=== sdrive amend ===\n");

// ---------------------------------------------------------------------------
// 1 - a corrective action needs a reason
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  const before = fs.readFileSync(sdrive(root, "workflow-state.json"), "utf8");

  const r = amend(root, ["--stay"]);

  check("REFUSES without --reason", r.status !== 0, r.output);
  check("  ...pointing at version:new for new scope", /version:new/.test(r.output), r.output);
  check("  ...and changing nothing", fs.readFileSync(sdrive(root, "workflow-state.json"), "utf8") === before);
  check(
    "  ...leaving the spec in completed/",
    fs.existsSync(sdrive(root, "specs", "completed", FEATURE, "v1")) &&
      !fs.existsSync(sdrive(root, "specs", "ongoing", FEATURE))
  );
}

// ---------------------------------------------------------------------------
// 2 - amend is not a way to get back to work
// ---------------------------------------------------------------------------
{
  // A genuinely in-flight feature: ongoing phase AND spec under ongoing/.
  const root = newRepo({ phase: "ongoing", specStage: "ongoing" });
  const r = amend(root, ["--stay", ...REASON]);

  check("REFUSES a feature that was never closed", r.status !== 0, r.output);
  check("  ...explaining what amend is for", /corrective action on a closed lifecycle/i.test(r.output), r.output);
}

// ---------------------------------------------------------------------------
// 3 - only the corrected version moves, and the reason is recorded
// ---------------------------------------------------------------------------
{
  const root = newRepo({ sibling: true });
  const r = amend(root, ["--stay", ...REASON]);

  check("amends a closed feature", r.status === 0, r.output);
  check(
    "  ...moving only this version to ongoing/",
    fs.existsSync(sdrive(root, "specs", "ongoing", FEATURE, "v1")) &&
      !fs.existsSync(sdrive(root, "specs", "completed", FEATURE, "v1"))
  );
  check(
    "  ...leaving a released sibling version alone",
    fs.existsSync(sdrive(root, "specs", "completed", FEATURE, "v0", "spec.md"))
  );
  check("  ...making the version ongoing", version(root).phase === "ongoing", version(root).phase);
  check("  ...resetting only the review gate", version(root).gates.review === "pending", JSON.stringify(version(root).gates));
  check(
    "  ...keeping the other three approvals",
    ["specification", "planning", "implementation"].every((g) => version(root).gates[g] === "approved")
  );
  check("  ...and pointing the step at review", version(root).currentStep === "review", version(root).currentStep);
  check(
    "  ...recording the reason",
    version(root).history.some((e) => e.event === "feature_amended" && /archived before tests/.test(e.reason || "")),
    JSON.stringify(version(root).history)
  );
}

// ---------------------------------------------------------------------------
// 4 - CON-608: the integration branch is never a work branch
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  const r = amend(root, ["--branch", "main", ...REASON]);

  check("REFUSES amending work on the integration branch (CON-608)", /CON-608/.test(r.output), r.output);
  check("  ...leaving HEAD on main", currentBranch(root) === "main", currentBranch(root));
  check("  ...recording no branch", !feature(root).branch, String(feature(root).branch));
  check("  ...but still amending the lifecycle", version(root).phase === "ongoing", version(root).phase);
}

// ---------------------------------------------------------------------------
// 5 - a merged branch is never reused (CON-607)
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  git(root, ["checkout", "-b", "feature/" + FEATURE]);
  fs.writeFileSync(path.join(root, "shipped.js"), "// shipped\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "feat: shipped work"]);
  git(root, ["checkout", "main"]);
  git(root, ["merge", "--no-ff", "-m", "Merge feature", "feature/" + FEATURE]);

  const r = amend(root, ["--branch", "feature/" + FEATURE, ...REASON]);

  check("detects the branch was already merged", /already merged into "main"/.test(r.output), r.output);
  check("  ...taking a -v2 name instead", /feature\/demo-feature-v2/.test(r.output), r.output);
  check("  ...and switching to it", currentBranch(root) === "feature/demo-feature-v2", currentBranch(root));
  check("  ...with the base invariant holding", /Base invariant \(CON-612\) holds/.test(r.output), r.output);
  check(
    "  ...recording it on the feature",
    feature(root).branch === "feature/demo-feature-v2",
    String(feature(root).branch)
  );
  check(
    "  ...with the base archive will recommend",
    feature(root).base === "main",
    String(feature(root).base)
  );
}

// ---------------------------------------------------------------------------
// 6 - an existing unmerged branch is resumable, but drift is reported (CON-612)
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  git(root, ["checkout", "-b", "feature/" + FEATURE]);
  fs.writeFileSync(path.join(root, "wip.js"), "// wip\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "feat: unmerged wip"]);
  git(root, ["checkout", "main"]);

  const r = amend(root, ["--branch", "feature/" + FEATURE, ...REASON]);

  check("reuses a branch that is NOT merged", /Switched to existing branch/.test(r.output), r.output);
  check("  ...while reporting the CON-612 violation", /Base invariant \(CON-612\) is violated/.test(r.output), r.output);
  check("  ...and naming the offending commit", /unmerged wip/.test(r.output), r.output);
}

// ---------------------------------------------------------------------------
// 7 - a fresh branch is created off the integration branch
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  const r = amend(root, ["--branch", "feature/" + FEATURE, ...REASON]);

  check("creates the branch when it does not exist", /Created branch/.test(r.output), r.output);
  check("  ...from the integration branch", /from "main"/.test(r.output), r.output);
  check("  ...and switches to it", currentBranch(root) === "feature/" + FEATURE, currentBranch(root));
  check(
    "  ...recording the base for archive to recommend",
    feature(root).base === "main",
    String(feature(root).base)
  );
}

// ---------------------------------------------------------------------------
// 8 - the old name is gone, and says so
// ---------------------------------------------------------------------------
{
  const root = newRepo();
  const result = spawnSync(process.execPath, [CLI, "reopen", FEATURE], { cwd: root, encoding: "utf8" });
  const output = `${result.stdout || ""}${result.stderr || ""}`;

  check("`sdrive reopen` is refused, not silently aliased", result.status !== 0, output);
  check("  ...naming the replacement", /renamed to `sdrive amend`/.test(output), output);
  check("  ...and distinguishing amend from version:new", /version:new/.test(output), output);
  check("  ...without touching the lifecycle", version(root).phase === "completed", version(root).phase);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

if (failed.length > 0) {
  console.log("FAILED:");
  failed.forEach((f) => console.log(`  - ${f.name}`));
  process.exit(1);
}

console.log("Amend corrects a wrong closure; it never rewrites a released version's record.");
