// Group-expression resolver tests: `/sdrive:propose [wave1 p2]`, `[signup, video call]`.
//
// The grammar is small but easy to get wrong, and it decides how many features a single
// command creates - so every ambiguity is pinned here.
const test = require("node:test");
const assert = require("node:assert");

const {
  parseExpression,
  resolveGroup,
  suggestBranchName,
  selectorFor,
  waveValue
} = require("../../scripts/lib/group");

const BACKLOG = [
  { id: "BP-001", feature: "Signup with email", milestone: "W1", priority: "P0", status: "backlog", wave: 1 },
  { id: "BP-002", feature: "Multi-language UI", milestone: "W1", priority: "P2", status: "backlog", wave: 1 },
  { id: "BP-003", feature: "Video call scheduling", milestone: "W1", priority: "P2", status: "backlog", wave: 1 },
  { id: "BP-004", feature: "Billing export", milestone: "W2", priority: "P0", status: "deferred", wave: 2 }
];

const ids = (resolved) => resolved.matched.map((item) => item.id);

test("only a fully bracketed argument is a group", () => {
  assert.strictEqual(parseExpression("[wave1 p2]").isGroup, true);
  assert.strictEqual(parseExpression("[wave1 p2]").expression, "wave1 p2");
  assert.strictEqual(parseExpression("  [wave1]  ").expression, "wave1");
  assert.strictEqual(parseExpression("wave1 p2").isGroup, false);
  assert.strictEqual(parseExpression("[wave1").isGroup, false);
  assert.strictEqual(parseExpression(null).isGroup, false);
});

test("space filters, comma separates", () => {
  assert.deepStrictEqual(ids(resolveGroup({ expression: "wave1 p2", backlog: BACKLOG })), [
    "BP-002",
    "BP-003"
  ]);

  assert.deepStrictEqual(ids(resolveGroup({ expression: "wave1", backlog: BACKLOG })), [
    "BP-001",
    "BP-002",
    "BP-003"
  ]);

  assert.deepStrictEqual(ids(resolveGroup({ expression: "p0", backlog: BACKLOG })), [
    "BP-001",
    "BP-004"
  ]);
});

test("a segment whose words are not all selectors is a feature name", () => {
  const resolved = resolveGroup({
    expression: "signup with email, video call scheduling",
    backlog: BACKLOG
  });

  assert.deepStrictEqual(ids(resolved), ["BP-001", "BP-003"]);
});

test("a multi-word name stays one name, not a filter", () => {
  const resolved = resolveGroup({ expression: "video call", backlog: BACKLOG });

  assert.strictEqual(resolved.matched.length, 1);
  assert.strictEqual(resolved.matched[0].id, null);
  assert.strictEqual(resolved.matched[0].name, "video-call");
});

test("mixed query and name in one expression", () => {
  assert.deepStrictEqual(
    ids(resolveGroup({ expression: "billing export, wave1 p2", backlog: BACKLOG })),
    ["BP-004", "BP-002", "BP-003"]
  );
});

test("a query that matches nothing is reported, not silently dropped", () => {
  const resolved = resolveGroup({ expression: "wave9", backlog: BACKLOG });

  assert.strictEqual(resolved.matched.length, 0);
  assert.deepStrictEqual(resolved.emptyQueries, ["wave9"]);
  assert.deepStrictEqual(resolved.available.waves, [1, 2]);
  assert.deepStrictEqual(resolved.available.priorities, [0, 2]);
});

test("selectors are recognised only in their own shapes", () => {
  assert.deepStrictEqual(selectorFor("wave1"), { kind: "wave", value: 1 });
  assert.deepStrictEqual(selectorFor("W3"), { kind: "wave", value: 3 });
  assert.deepStrictEqual(selectorFor("m2"), { kind: "milestone", value: 2 });
  assert.deepStrictEqual(selectorFor("milestone5"), { kind: "milestone", value: 5 });
  assert.deepStrictEqual(selectorFor("p2"), { kind: "priority", value: 2 });
  assert.deepStrictEqual(selectorFor("BP-012"), { kind: "id", value: "BP-012" });
  assert.deepStrictEqual(selectorFor("deferred"), { kind: "status", value: "deferred" });
  assert.deepStrictEqual(selectorFor("@billing"), { kind: "tag", value: "billing" });
  assert.strictEqual(selectorFor("signup"), null);
  assert.strictEqual(selectorFor("call"), null);
});

test("wave and milestone are different columns", () => {
  // A row whose milestone is M5 but whose dependency wave is 1 must answer `w1`, not `m5`.
  const backlog = [
    { id: "BP-001", feature: "Angi", milestone: "M5", priority: "P2", status: "backlog", wave: 1 },
    { id: "BP-002", feature: "Billing", milestone: "M1", priority: "P2", status: "backlog", wave: 3 }
  ];

  assert.deepStrictEqual(ids(resolveGroup({ expression: "w1", backlog })), ["BP-001"]);
  assert.deepStrictEqual(ids(resolveGroup({ expression: "m5", backlog })), ["BP-001"]);
  assert.deepStrictEqual(ids(resolveGroup({ expression: "m1", backlog })), ["BP-002"]);
  assert.deepStrictEqual(ids(resolveGroup({ expression: "w3", backlog })), ["BP-002"]);
});

test("duplicate items collapse across segments", () => {
  const resolved = resolveGroup({ expression: "wave1, BP-002", backlog: BACKLOG });

  assert.deepStrictEqual(ids(resolved), ["BP-001", "BP-002", "BP-003"]);
});

test("wave comes from the annotated backlog, falling back to milestone digits", () => {
  assert.strictEqual(waveValue({ wave: 3, milestone: "M1" }), 3);
  assert.strictEqual(waveValue({ milestone: "W7" }), 7);
  assert.strictEqual(waveValue({}), null);
  assert.strictEqual(waveValue(null), null);
});

test("the suggested branch is derived from the expression", () => {
  assert.strictEqual(suggestBranchName("wave1 p2"), "wave1-p2");
  assert.strictEqual(suggestBranchName("signup, video call"), "signup-video-call");
  assert.strictEqual(suggestBranchName(""), "wave");
});
