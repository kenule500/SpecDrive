const test = require("node:test");
const assert = require("node:assert");

const { appendEvent, verifyChain } = require("../../scripts/lib/audit-chain");

test("appends a verifiable hash chain", () => {
  const log = { events: [] };

  appendEvent(log, { event: "feature_created", actor: "alice", timestamp: "2026-01-01T00:00:00Z" });
  appendEvent(log, { event: "gate_approved", actor: "bob", timestamp: "2026-01-01T00:01:00Z" });

  const verdict = verifyChain(log);
  assert.strictEqual(verdict.ok, true);
  assert.strictEqual(verdict.checked, 2);
  assert.strictEqual(log.events[0].prevHash, "GENESIS");
  assert.strictEqual(log.events[1].prevHash, log.events[0].hash);
});

test("detects a modified entry", () => {
  const log = { events: [] };
  appendEvent(log, { event: "feature_created", actor: "alice", timestamp: "2026-01-01T00:00:00Z" });
  appendEvent(log, { event: "gate_approved", actor: "bob", timestamp: "2026-01-01T00:01:00Z" });

  log.events[0].actor = "mallory";

  const verdict = verifyChain(log);
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.reason, /modified|link/);
});

test("legacy unhashed entries are reported but do not break the chain", () => {
  const log = { events: [{ event: "old", actor: "alice", timestamp: "2025-01-01T00:00:00Z" }] };
  appendEvent(log, { event: "new", actor: "bob", timestamp: "2026-01-01T00:00:00Z" });

  const verdict = verifyChain(log);
  assert.strictEqual(verdict.ok, true);
  assert.strictEqual(verdict.legacy, 1);
  assert.strictEqual(verdict.checked, 1);
});
