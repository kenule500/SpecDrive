const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const evidence = require("../../src/lib/evidence");

test("parses Jest/Vitest counts", () => {
  const counts = evidence.parseCounts("Tests: 1 failed, 12 passed, 1 skipped, 14 total");
  assert.deepStrictEqual(counts, { passed: 12, failed: 1, skipped: 1, total: 14 });
});

test("parses pytest counts", () => {
  const counts = evidence.parseCounts("3 failed, 10 passed, 2 skipped in 0.42s");
  assert.strictEqual(counts.failed, 3);
  assert.strictEqual(counts.passed, 10);
  assert.strictEqual(counts.skipped, 2);
  assert.strictEqual(counts.total, 15);
});

test("parses node:test counts", () => {
  const counts = evidence.parseCounts("# pass 5\n# fail 1\n# skip 2");
  assert.strictEqual(counts.passed, 5);
  assert.strictEqual(counts.failed, 1);
  assert.strictEqual(counts.skipped, 2);
  assert.strictEqual(counts.total, 8);
});

test("parses go test output", () => {
  const counts = evidence.parseCounts("--- PASS: TestA\n--- PASS: TestB\n--- FAIL: TestC");
  assert.strictEqual(counts.passed, 2);
  assert.strictEqual(counts.failed, 1);
  assert.strictEqual(counts.total, 3);
});

test("detects a package.json test script", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-evidence-test-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "node --test" } })
  );

  const resolved = evidence.resolveTestCommand(root);
  assert.strictEqual(resolved.command, "npm test");
  assert.match(resolved.source, /package\.json/);
});

test("writes and reads evidence, and rejects a failing run", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-evidence-write-"));
  const dir = path.join(root, ".sdrive", "governance", "demo", "v1");
  fs.mkdirSync(dir, { recursive: true });

  const run = {
    command: "npm test",
    source: "package.json scripts.test",
    exitCode: 0,
    timedOut: false,
    signal: null,
    output: "AC-001 passed",
    outputHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    durationMs: 12,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    summary: { passed: 1, failed: 0, skipped: 0, total: 1 },
    testIds: ["TEST-001"],
    acIds: ["AC-001"]
  };

  const written = evidence.writeEvidence(root, "demo", "v1", run);
  assert.ok(fs.existsSync(written.file));

  const read = evidence.readEvidence(root, "demo", "v1");
  assert.strictEqual(read.exitCode, 0);
  assert.deepStrictEqual(read.acIds, ["AC-001"]);

  assert.strictEqual(evidence.evaluateEvidence(root, "demo", "v1").ok, true);

  evidence.writeEvidence(root, "demo", "v1", { ...run, exitCode: 1 });
  const failing = evidence.evaluateEvidence(root, "demo", "v1");
  assert.strictEqual(failing.ok, false);
  assert.match(failing.reason, /exited 1/);
});

test("missing evidence is a failure, not a pass", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-evidence-missing-"));
  const verdict = evidence.evaluateEvidence(root, "demo", "v1");
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.reason, /No test evidence/);
});

test("a zero-exit run with no recognisable results is refused", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-evidence-empty-"));
  const dir = path.join(root, ".sdrive", "governance", "demo", "v1");
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, "test-evidence.json"),
    JSON.stringify({
      feature: "demo",
      version: "v1",
      command: "true",
      exitCode: 0,
      timedOut: false,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 1,
      outputHash: `sha256:${"0".repeat(64)}`,
      summary: { passed: 0, failed: 0, skipped: 0, total: 0 },
      testIds: [],
      acIds: []
    })
  );

  const verdict = evidence.evaluateEvidence(root, "demo", "v1");
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.reason, /no recognisable test results/);
});
