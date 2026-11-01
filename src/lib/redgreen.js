"use strict";

// ---------- RED-BEFORE-GREEN ----------
//
// A test that passes both before and after a change proves nothing. Every gate in
// SpecDrive rests on "the test passes", and a vacuous test satisfies all of them:
// it passes, it is bound to HEAD, it appears in traceability, it has no `.only` and
// no empty assertion. The only way to tell a real test from a decorative one is to
// ask whether it FAILED before the work was done.
//
// Grade 1, which is what this module does: run the same test command against the
// feature's base commit in a throwaway worktree. If it fails there and passes here,
// the change is what makes it pass. If it passes in both places, the test is not
// testing the change.
//
// The honesty rule that matters most: a suite that CRASHES at base (missing module,
// unresolved dependency, wrong runtime) also exits non-zero. Counting that as proof
// would make every test look honest, so a run with no recognisable results is
// reported as unproven-with-a-reason instead of being used as evidence.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const evidence = require("./evidence");
const { gitOrEmpty } = require("./execute");

function git(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// Where the comparison should be made. A feature cut from a shared branch must be
// proved against the point it diverged, or the sibling's work would be counted as
// part of this feature's change.
function resolveBaseRef(projectRoot, options = {}) {
  if (options.base) return options.base;

  try {
    const state = JSON.parse(
      fs.readFileSync(path.join(projectRoot, ".sdrive", "workflow-state.json"), "utf8")
    );
    const feature = (state.features || []).find((entry) => entry.name === options.feature);

    if (feature) {
      if (feature.baseBranch) return feature.baseBranch;
      const version = (feature.versions || []).find((entry) => entry.id === options.versionId);

      if (version && version.baseBranch) return version.baseBranch;
    }
  } catch {
    // No state, no declared base: fall through to the repository default.
  }

  const originHead = gitOrEmpty(["symbolic-ref", "refs/remotes/origin/HEAD"], projectRoot);

  if (originHead) {
    const name = originHead.replace(/^refs\/remotes\/origin\//, "").trim();

    if (name) return name;
  }

  const branch = gitOrEmpty(["rev-parse", "--abbrev-ref", "HEAD"], projectRoot).trim();

  // Detached HEAD (CI, or a tag build) has no `main` to fall back to by name, so use
  // the first parent of the current commit instead of inventing a branch.
  if (!branch || branch === "HEAD") return "HEAD~1";

  return gitOrEmpty(["rev-parse", "--verify", "main"], projectRoot) ? "main" : "HEAD~1";
}

function cleanup(projectRoot, dir) {
  git(["worktree", "remove", "--force", dir], projectRoot);
  // A worktree that the tests wrote into may refuse removal, and a stale record in
  // `.git/worktrees` would confuse `git worktree list` later, so prune unconditionally.
  git(["worktree", "prune"], projectRoot);

  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Leaving a temp directory behind is not worth failing a proof run over.
  }
}

function prove(projectRoot, options = {}) {
  const acs = Array.isArray(options.acs) ? [...new Set(options.acs)] : [];

  if (acs.length === 0) {
    return {
      ok: false,
      base: null,
      entries: [],
      reason:
        "traceability.json links no acceptance criteria to tests, so there is nothing to prove."
    };
  }

  const baseRef = resolveBaseRef(projectRoot, options);
  const baseCommit = gitOrEmpty(["rev-parse", "--verify", `${baseRef}^{commit}`], projectRoot).trim();

  if (!baseCommit) {
    return {
      ok: false,
      base: baseRef,
      entries: [],
      reason: `Could not resolve the base commit "${baseRef}".`
    };
  }

  const head = gitOrEmpty(["rev-parse", "HEAD"], projectRoot).trim();

  if (head && baseCommit === head) {
    return {
      ok: false,
      base: baseRef,
      entries: [],
      reason:
        "The base commit is HEAD, so there is no diff to prove against. " +
        "Commit the change first, then re-run with --prove."
    };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-redgreen-"));
  const added = git(["worktree", "add", "--detach", dir, baseCommit], projectRoot);

  if (added.status !== 0) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }

    return {
      ok: false,
      base: baseRef,
      entries: [],
      reason: `Could not create a worktree at ${baseRef}: ${(added.stderr || "").trim().split("\n")[0] || "git failed"}.`
    };
  }

  let baseRun;

  try {
    const runner = options.runner || evidence.runTests;

    baseRun = runner(dir, {
      command: options.command,
      timeoutMs: options.timeoutMs
    });
  } catch (error) {
    cleanup(projectRoot, dir);

    return {
      ok: false,
      base: baseRef,
      entries: [],
      reason: `The test command could not run at ${baseRef}: ${error.message}`
    };
  }

  cleanup(projectRoot, dir);

  // A crash is not a failing test. Without counts there is no way to tell "the
  // feature's tests fail here" from "nothing could start", and only the first is
  // evidence that the change is what makes them pass.
  if (!evidence.hasRecognisableResults(baseRun)) {
    return {
      ok: false,
      base: baseRef,
      entries: [],
      reason:
        `The test command produced no recognisable results at ${baseRef} (exit ${baseRun.exitCode}), ` +
        "so its failure cannot be read as evidence. Check that the suite can start without the change."
    };
  }

  const proven = baseRun.exitCode !== 0;
  const entries = acs.map((ac) => {
    const entry = {
      ac,
      test: baseRun.command,
      proven,
      method: "base-run",
      baseExitCode: baseRun.exitCode
    };

    if (!proven) {
      entry.reason = `The suite passes at ${baseRef} without the change, so these tests do not depend on it.`;
    }

    return entry;
  });

  return { ok: true, base: baseRef, baseCommit, entries, baseRun };
}

module.exports = { prove, resolveBaseRef };
