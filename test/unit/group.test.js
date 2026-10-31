// Group-expression resolver tests: `/sdrive:propose [wave1 p2]`, `[signup, video call]`.
//
// The grammar is small but easy to get wrong, and it decides how many features a single
// command creates - so every ambiguity is pinned here.
const test = require("node:test");
const assert = require("node:assert");

const {
  parseExpression,
  resolveGroup,
  checkGroupShareable,
  checkBatch,
  singleBatch,
  topologies,
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

test("kind selects work a gate can actually cover", () => {
  const backlog = [
    { id: "BP-001", feature: "Build a module", status: "backlog", kind: "build", wave: 2, priority: "P1" },
    { id: "BP-002", feature: "Decide build vs crate", status: "backlog", kind: "decision", wave: 2, priority: "P1" },
    { id: "BP-003", feature: "Publish 0.2", status: "backlog", kind: "release", wave: 2, priority: "P1" }
  ];

  assert.deepStrictEqual(ids(resolveGroup({ expression: "w2 p1 build", backlog })), ["BP-001"]);
  assert.deepStrictEqual(ids(resolveGroup({ expression: "w2 decision", backlog })), ["BP-002"]);
  assert.deepStrictEqual(ids(resolveGroup({ expression: "w2 release", backlog })), ["BP-003"]);
});

test("gated items are reported, and block a shared branch only", () => {
  const backlog = [
    {
      id: "BP-001",
      feature: "OAuth helper",
      status: "backlog",
      kind: "build",
      wave: 2,
      priority: "P1",
      dependsOn: [],
      externalDependencies: []
    },
    { id: "BP-002", feature: "Meta leads", status: "needs discovery", kind: "build", wave: 2, priority: "P1" },
    {
      id: "BP-003",
      feature: "Stripe sync",
      status: "backlog",
      kind: "build",
      wave: 2,
      priority: "P1",
      externalDependencies: ["partner access"]
    }
  ];

  const resolved = resolveGroup({ expression: "w2 p1 build", backlog });

  assert.deepStrictEqual(
    resolved.gated.map((item) => item.id),
    ["BP-002", "BP-003"]
  );

  assert.strictEqual(checkGroupShareable(resolved).ok, false);
  assert.match(checkGroupShareable(resolved).blockers[0], /BP-002, BP-003/);
  assert.strictEqual(checkGroupShareable(resolved, { allowGated: true }).ok, true);

  const clean = resolveGroup({ expression: "BP-001", backlog });
  assert.deepStrictEqual(checkGroupShareable(clean).blockers, []);
});

test("a large group warns but is not blocked", () => {
  const backlog = Array.from({ length: 6 }, (_unused, index) => ({
    id: `BP-00${index + 1}`,
    feature: `Module ${index + 1}`,
    status: "backlog",
    kind: "build",
    wave: 2,
    priority: "P1"
  }));

  const verdict = checkGroupShareable(resolveGroup({ expression: "w2 p1 build", backlog }));

  assert.strictEqual(verdict.ok, true);
  assert.strictEqual(verdict.warnings.length, 1);
  assert.match(verdict.warnings[0], /12 approval stops/);
});

// ------------------------------------------------------------------ declared batches ---

const BATCH_BACKLOG = [
  { id: "BP-011", feature: "Meta leads", status: "backlog", kind: "build", batch: "b1", wave: 2, priority: "P1" },
  { id: "BP-012", feature: "EagleView", status: "backlog", kind: "build", batch: "b1", wave: 2, priority: "P1" },
  { id: "BP-013", feature: "QuickBooks", status: "backlog", kind: "build", batch: "b1", wave: 2, priority: "P1" },
  { id: "BP-014", feature: "build vs crate", status: "backlog", kind: "decision", batch: "b2", wave: 2, priority: "P1" },
  { id: "BP-020", feature: "Blocked one", status: "needs discovery", kind: "build", batch: "b3", wave: 2, priority: "P1" },
  { id: "BP-030", feature: "Next wave thing", status: "backlog", kind: "build", batch: "b4", wave: 3, priority: "P1" }
];

test("[b1] selects exactly the declared batch, and implies one branch", () => {
  const resolved = resolveGroup({ expression: "b1", backlog: BATCH_BACKLOG });

  assert.deepStrictEqual(ids(resolved), ["BP-011", "BP-012", "BP-013"]);
  assert.strictEqual(resolved.batch, "b1");
  assert.strictEqual(singleBatch("b1"), "b1");

  // Anything else in the brackets makes it a plain selection again.
  assert.strictEqual(singleBatch("b1, signup"), null);
  assert.strictEqual(singleBatch("w2 p1"), null);
  assert.strictEqual(singleBatch("b1 p1"), null);
});

test("a healthy batch is shareable, and its members pass checkBatch", () => {
  const resolved = resolveGroup({ expression: "b1", backlog: BATCH_BACKLOG });

  assert.strictEqual(checkBatch(resolved).ok, true);
  assert.strictEqual(checkGroupShareable(resolved).ok, true);
});

test("only topologies that can finish are offered", () => {
  const backlog = [
    { id: "BP-011", feature: "Meta", status: "backlog", kind: "build", wave: 2, priority: "P1" },
    { id: "BP-013", feature: "QuickBooks", status: "needs discovery", kind: "build", wave: 2, priority: "P1" },
    { id: "BP-014", feature: "decide crate", status: "backlog", kind: "decision", wave: 2, priority: "P1" },
    { id: "BP-015", feature: "OAuth", status: "backlog", kind: "build", wave: 2, priority: "P1" }
  ];

  const resolved = resolveGroup({ expression: "w2 p1", backlog });
  const { options, excluded } = topologies(resolved);
  const byId = (id) => options.find((option) => option.id === id);

  // The only shared branch on offer is the ungated one, with the gated item split out.
  assert.deepStrictEqual(
    options.filter((option) => option.ok).map((option) => option.id),
    ["shared-clean", "per-feature"]
  );

  assert.deepStrictEqual(byId("shared-clean").shared, ["BP-011", "BP-015"]);
  assert.deepStrictEqual(byId("shared-clean").separate, ["BP-013"]);

  // "One shared branch for everything" is never offered while a member is gated.
  assert.strictEqual(byId("shared-all-builds").ok, false);
  assert.match(byId("shared-all-builds").reasons.join(" "), /hold the merge/);

  // A decision is not a feature in any topology; it is excluded with a reason.
  assert.deepStrictEqual(excluded.map((entry) => entry.item), ["BP-014"]);
  assert.match(excluded[0].reason, /no test to pass/);
});

test("a batch containing a decision, a gated item, or two waves is refused", () => {
  const decision = resolveGroup({ expression: "b2", backlog: BATCH_BACKLOG });
  assert.strictEqual(checkBatch(decision).ok, false);
  assert.match(checkBatch(decision).blockers.join(" "), /not builds/);

  const gated = resolveGroup({ expression: "b3", backlog: BATCH_BACKLOG });
  assert.strictEqual(checkBatch(gated).ok, false);
  assert.match(checkBatch(gated).blockers.join(" "), /need access/);

  const crossWave = [
    { id: "BP-001", feature: "A", status: "backlog", kind: "build", batch: "b9", wave: 2, priority: "P1" },
    { id: "BP-002", feature: "B", status: "backlog", kind: "build", batch: "b9", wave: 3, priority: "P1" }
  ];
  const verdict = checkBatch(resolveGroup({ expression: "b9", backlog: crossWave }));

  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.blockers.join(" "), /span 2 waves/);
});
