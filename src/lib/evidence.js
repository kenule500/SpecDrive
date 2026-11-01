// Test evidence.
//
// A gate that reads `Status: PASS` from prose is checking a claim. This module
// runs the project's test command and records what actually happened: exit code,
// counts, commit, duration, and a hash of the captured output. `approve review`
// can then require a fact instead of a sentence.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { gitOrEmpty } = require("./execute");
const { writeJsonAtomic, readJson, sdriveDir } = require("./state");

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER = 16 * 1024 * 1024;

function resolveFeaturedVersion(projectRoot, featureName) {
  const state = readJson(path.join(sdriveDir(projectRoot), "workflow-state.json"), null);
  const feature = state && (state.features || []).find((entry) => entry.name === featureName);

  if (!feature) return null;

  const versions = feature.versions || [];
  const version =
    versions.find((entry) => entry.id === feature.currentVersion) || versions[0] || null;

  return { feature, version };
}

function governanceDir(projectRoot, featureName, versionId) {
  const root = path.join(sdriveDir(projectRoot), "governance", featureName);
  const versioned = path.join(root, versionId || "v1");

  if (fs.existsSync(versioned)) return versioned;
  if (fs.existsSync(root)) return root;

  return versioned;
}

function evidencePath(projectRoot, featureName, versionId) {
  return path.join(governanceDir(projectRoot, featureName, versionId), "test-evidence.json");
}

function resolveTestCommand(projectRoot, options = {}) {
  if (options.command) return { command: options.command, source: "--cmd" };

  const config = readJson(path.join(sdriveDir(projectRoot), "config.json"), {}) || {};
  const configured =
    (config.test && config.test.command) ||
    (config.governance && config.governance.testCommand);

  if (configured) return { command: configured, source: "config.json" };

  const pkgPath = path.join(projectRoot, "package.json");
  const pkg = readJson(pkgPath, null);

  if (pkg && pkg.scripts && pkg.scripts.test) {
    return { command: "npm test", source: "package.json scripts.test" };
  }

  if (fs.existsSync(path.join(projectRoot, "go.mod"))) {
    return { command: "go test ./...", source: "go.mod" };
  }

  if (
    fs.existsSync(path.join(projectRoot, "pyproject.toml")) ||
    fs.existsSync(path.join(projectRoot, "pytest.ini")) ||
    fs.existsSync(path.join(projectRoot, "setup.cfg"))
  ) {
    return { command: "pytest", source: "python test config" };
  }

  return { command: null, source: null };
}

function parseCounts(output) {
  const text = String(output || "");
  const counts = { passed: 0, failed: 0, skipped: 0, total: 0 };

  // Jest / Vitest: "Tests: 1 failed, 12 passed, 13 total"
  const jest = text.match(/Tests:\s*([^\n]+)/);
  if (jest) {
    const line = jest[1];
    const read = (word) => {
      const match = line.match(new RegExp(`(\\d+)\\s+${word}`));
      return match ? Number(match[1]) : 0;
    };
    counts.failed = read("failed");
    counts.passed = read("passed");
    counts.skipped = read("skipped") + read("pending") + read("todo");
    counts.total = read("total") || counts.passed + counts.failed + counts.skipped;
    return counts;
  }

  // pytest / unittest summary lines: "3 failed, 10 passed in 0.42s"
  const summary =
    text.match(/(\d+)\s+failed[^\n]*?(\d+)\s+passed/i) ||
    text.match(/(\d+)\s+passed[^\n]*?(\d+)\s+failed/i);

  if (summary) {
    const firstIsFailed = /failed/i.test(summary[0].slice(0, summary[0].indexOf("passed") + 6));
    counts.failed = Number(firstIsFailed ? summary[1] : summary[2]) || 0;
    counts.passed = Number(firstIsFailed ? summary[2] : summary[1]) || 0;
    const skipped = text.match(/(\d+)\s+(?:skipped|xfailed)/i);
    counts.skipped = skipped ? Number(skipped[1]) : 0;
    counts.total = counts.passed + counts.failed + counts.skipped;
    return counts;
  }

  // node:test: "# pass 12" / "# fail 1"
  for (const match of text.matchAll(/^#\s+(pass|fail|skip)\s+(\d+)/gim)) {
    const key = match[1].toLowerCase();
    const value = Number(match[2]);
    if (key === "pass") counts.passed += value;
    if (key === "fail") counts.failed += value;
    if (key === "skip") counts.skipped += value;
  }

  // go test: "--- PASS:" / "--- FAIL:"
  for (const match of text.matchAll(/^\s*--- (PASS|FAIL|SKIP):/gm)) {
    const key = match[1];
    if (key === "PASS") counts.passed += 1;
    if (key === "FAIL") counts.failed += 1;
    if (key === "SKIP") counts.skipped += 1;
  }

  counts.total = counts.passed + counts.failed + counts.skipped;
  return counts;
}

function idsFrom(output, prefix) {
  const pattern = new RegExp(`\\b${prefix}-\\d{3}\\b`, "g");
  return [...new Set(String(output || "").match(pattern) || [])].sort();
}

function runTests(projectRoot, options = {}) {
  const resolved = resolveTestCommand(projectRoot, options);

  if (!resolved.command) {
    const error = new Error(
      "No test command found. Add `test.command` to .sdrive/config.json, add a `test` script to package.json, or pass --cmd."
    );
    error.code = "ENOTESTCOMMAND";
    throw error;
  }

  const timeout = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const startedAt = new Date().toISOString();
  const start = Date.now();

  const result = spawnSync(resolved.command, {
    cwd: projectRoot,
    shell: true,
    encoding: "utf8",
    timeout,
    maxBuffer: MAX_BUFFER,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const combined = `${stdout}\n${stderr}`;
  const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");

  const exitCode = timedOut ? 124 : typeof result.status === "number" ? result.status : 1;
  const durationMs = Date.now() - start;
  const counts = parseCounts(combined);

  if (counts.total === 0 && !timedOut) {
    // A command that reports nothing is still evidence of the exit code; the
    // counts stay zero rather than being invented.
    counts.total = 0;
  }

  return {
    command: resolved.command,
    source: resolved.source,
    exitCode,
    timedOut,
    signal: result.signal || null,
    stdout,
    stderr,
    output: combined,
    outputHash: `sha256:${crypto.createHash("sha256").update(combined).digest("hex")}`,
    durationMs,
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: counts,
    testIds: idsFrom(combined, "TEST"),
    acIds: idsFrom(combined, "AC")
  };
}

function writeEvidence(projectRoot, featureName, versionId, run, extra = {}) {
  const dir = governanceDir(projectRoot, featureName, versionId);
  fs.mkdirSync(dir, { recursive: true });

  const evidence = {
    feature: featureName,
    version: versionId || "v1",
    command: run.command,
    source: run.source || null,
    exitCode: run.exitCode,
    timedOut: Boolean(run.timedOut),
    signal: run.signal || null,
    commit: extra.commit !== undefined ? extra.commit : gitOrEmpty(["rev-parse", "HEAD"], projectRoot) || null,
    branch: extra.branch !== undefined ? extra.branch : gitOrEmpty(["rev-parse", "--abbrev-ref", "HEAD"], projectRoot) || null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    outputHash: run.outputHash,
    summary: run.summary,
    testIds: run.testIds,
    acIds: run.acIds,
    // Red-before-green: per acceptance criterion, did the suite fail at the base
    // commit? Absent on projects that have not opted in, and absent on evidence
    // recorded before this check existed - which is what lets old projects keep
    // archiving unchanged.
    ...(Array.isArray(extra.redGreen) ? { redGreen: extra.redGreen } : {}),
    ...(extra.redGreenBase !== undefined ? { redGreenBase: extra.redGreenBase } : {}),
    // Keep the tail only. Full logs belong in CI artifacts, not in a governance
    // record that is committed and reviewed.
    outputTail: String(run.output || "").slice(-4000),
    recordedAt: new Date().toISOString()
  };

  writeJsonAtomic(path.join(dir, "test-evidence.json"), evidence);
  return { evidence, file: path.join(dir, "test-evidence.json") };
}

function readEvidence(projectRoot, featureName, versionId) {
  return readJson(evidencePath(projectRoot, featureName, versionId), null);
}

function freshness(evidence, projectRoot) {
  if (!evidence) return { fresh: false, reason: "no test evidence recorded" };

  const head = gitOrEmpty(["rev-parse", "HEAD"], projectRoot);

  if (!head) {
    return { fresh: true, reason: "not a git repository; commit freshness cannot be checked" };
  }

  if (!evidence.commit) {
    return { fresh: false, reason: "test evidence does not record a commit" };
  }

  if (evidence.commit !== head) {
    return {
      fresh: false,
      reason: `test evidence is from ${String(evidence.commit).slice(0, 8)}, HEAD is ${head.slice(0, 8)}`
    };
  }

  return { fresh: true, reason: "test evidence matches HEAD" };
}

function hasRecognisableResults(value) {
  const summary = value && value.summary;
  const testIds = value && value.testIds;

  return Boolean(
    (summary && Number(summary.total) > 0) ||
      (Array.isArray(testIds) && testIds.length > 0)
  );
}

function evaluateEvidence(projectRoot, featureName, versionId, options = {}) {
  const evidence = readEvidence(projectRoot, featureName, versionId);

  if (!evidence) {
    return {
      ok: false,
      reason:
        "No test evidence. Run `sdrive test <feature>` (or set governance.requireTestEvidence to false to opt out)."
    };
  }

  if (evidence.exitCode !== 0) {
    return {
      ok: false,
      reason: `The recorded test run exited ${evidence.exitCode}${evidence.timedOut ? " (timed out)" : ""}.`
    };
  }

  if (evidence.summary && Number(evidence.summary.failed) > 0) {
    return { ok: false, reason: `${evidence.summary.failed} test(s) failed in the recorded run.` };
  }

  // Exit 0 with no recognisable results is not evidence that anything ran. A
  // project with a custom runner can satisfy this by printing TEST-### IDs or a
  // summary line; otherwise it receives an honest refusal, not a free pass.
  if (!hasRecognisableResults(evidence)) {
    return {
      ok: false,
      reason:
        "The recorded run produced no recognisable test results. Configure a reporter (JUnit/Jest/pytest/node:test output) or print TEST-### IDs."
    };
  }

  if (!options.allowStale) {
    const verdict = freshness(evidence, projectRoot);
    if (!verdict.fresh) {
      return {
        ok: false,
        reason: `Test evidence is stale: ${verdict.reason}. Re-run \`sdrive test <feature>\`.`
      };
    }
  }

  return { ok: true, evidence, reason: "test evidence is current and passing" };
}

module.exports = {
  resolveTestCommand,
  parseCounts,
  runTests,
  writeEvidence,
  readEvidence,
  evidencePath,
  governanceDir,
  resolveFeaturedVersion,
  freshness,
  hasRecognisableResults,
  evaluateEvidence
};
