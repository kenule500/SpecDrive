// Product-plan parsing, dependency waves, and lifecycle mapping.
//
// The dashboard and /sdrive:worktree share scripts/lib/product-plan.js, so these
// tests exercise the module directly. If this drifts, both surfaces drift with it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const productPlan = require("../scripts/lib/product-plan");

const BACKLOG = [
  "# Product Backlog",
  "",
  "## Summary",
  "",
  "| Milestone | Items | Count |",
  "|---|---|---|",
  "| Start | BP-001 to BP-005 | 5 |",
  "",
  "## Status legend",
  "",
  "| Status | Meaning |",
  "|---|---|",
  "| `backlog` | Approved candidate |",
  "",
  "## Start",
  "",
  "| ID | Feature | User value | Priority | Depends on | Status | Confidence / source |",
  "|---|---|---|---|---|---|---|",
  "| BP-001 | Parser core | Parse files | P0 | - | backlog | High |",
  "| BP-003 | Summary docs | Explain the plan | P1 | - | backlog | High |",
  "| BP-005 | Deferred polish | Later | P2 | - | deferred | Low |",
  "",
  "## M1 - Publish",
  "",
  "| ID | Feature | User value | Priority | Depends on | Status | Confidence / source |",
  "|---|---|---|---|---|---|---|",
  "| BP-002 | Retry layer | Retry calls | P1 | BP-001 | backlog | High |",
  "| BP-004 | Partner adapter | Call partner | P1 | BP-001; partner access | backlog | Low |",
  ""
].join("\n");

function tempDir(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeSpec(root, stage, feature, version, markdown = "# Spec\n") {
  const dir = path.join(root, "specs", stage, feature, version);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "spec.md"), markdown);
}

test("parses only real backlog tables and normalizes identifiers", () => {
  const items = productPlan.parseBacklog(BACKLOG);

  assert.strictEqual(items.length, 5);
  assert.deepStrictEqual(
    items.map((item) => item.id),
    ["BP-001", "BP-003", "BP-005", "BP-002", "BP-004"]
  );
  assert.ok(items.every((item) => item.feature));
  assert.strictEqual(items[0].milestone, "Start");
  assert.strictEqual(items[3].milestone, "M1 - Publish");

  // Summary and legend tables are documentation, not candidates.
  assert.deepStrictEqual(
    items.map((item) => item.id),
    productPlan.parseBacklog(BACKLOG).map((item) => item.id)
  );
  assert.strictEqual(productPlan.normalizeId("bp-007"), "BP-007");
  assert.strictEqual(productPlan.normalizeId("no id here"), null);
  assert.deepStrictEqual(productPlan.expandIds("BP-001 to BP-003"), [
    "BP-001",
    "BP-002",
    "BP-003"
  ]);
});

test("parses a details column for the feature drawer", () => {
  const markdown = [
    "# Product Backlog",
    "",
    "## Start",
    "",
    "| ID | Feature | Details | User value | Priority | Depends on | Status |",
    "|---|---|---|---|---|---|---|",
    "| BP-001 | Chat | Direct messages with mentions and read receipts. | Talk without leaving the app. | P0 | - | backlog |",
    ""
  ].join("\n");

  const [item] = productPlan.parseBacklog(markdown);
  assert.strictEqual(item.id, "BP-001");
  assert.strictEqual(item.details, "Direct messages with mentions and read receipts.");
  assert.strictEqual(item.userValue, "Talk without leaving the app.");
});

test("separates feature dependencies from external blockers", () => {
  assert.deepStrictEqual(productPlan.parseDependencyCell("BP-001; partner access"), {
    ids: ["BP-001"],
    external: ["partner access"]
  });
  assert.deepStrictEqual(productPlan.parseDependencyCell("BP-002 to BP-003"), {
    ids: ["BP-002", "BP-003"],
    external: []
  });
  assert.deepStrictEqual(productPlan.parseDependencyCell("-"), { ids: [], external: [] });
});

test("derives dependency waves, parallelism, and reverse edges", () => {
  const items = productPlan.annotateBacklog(productPlan.parseBacklog(BACKLOG));
  const byId = new Map(items.map((item) => [item.id, item]));

  assert.strictEqual(byId.get("BP-001").wave, 0);
  assert.strictEqual(byId.get("BP-003").wave, 0);
  assert.strictEqual(byId.get("BP-005").wave, 0);
  assert.strictEqual(byId.get("BP-002").wave, 1);
  assert.strictEqual(byId.get("BP-004").wave, 1);

  // Same-wave items are parallel-safe only when neither depends on the other.
  assert.deepStrictEqual(byId.get("BP-001").parallelWith, ["BP-003", "BP-005"]);
  assert.deepStrictEqual(byId.get("BP-002").parallelWith, ["BP-004"]);
  assert.deepStrictEqual(byId.get("BP-001").baseFor, ["BP-002", "BP-004"]);

  assert.strictEqual(productPlan.waveLabel(0), "start");
  assert.strictEqual(productPlan.waveLabel(1), "W1");
  assert.strictEqual(productPlan.waveLabel(4), "W4");
});

test("maps a backlog item to an ongoing, completed, or backlog feature", (t) => {
  const root = tempDir(t, "sdrive-lifecycle-status-");
  writeSpec(root, "ongoing", "active", "v1");
  writeSpec(root, "completed", "shipped", "v1");

  const state = {
    features: [
      {
        name: "active",
        versions: [{ id: "v1", phase: "specification" }]
      },
      {
        name: "shipped",
        versions: [{ id: "v1", phase: "completed" }]
      },
      {
        name: "queued",
        versions: [{ id: "v1", phase: "backlog" }]
      }
    ]
  };

  assert.strictEqual(
    productPlan.featureLifecycle(state.features[0], root),
    "ongoing"
  );
  assert.strictEqual(
    productPlan.featureLifecycle(state.features[1], root),
    "completed"
  );
  assert.strictEqual(
    productPlan.featureLifecycle(state.features[2], root),
    "backlog"
  );
});

test("finds feature scope from explicit fields, history, and spec text", (t) => {
  const root = tempDir(t, "sdrive-lifecycle-scope-");
  writeSpec(
    root,
    "ongoing",
    "explicit",
    "v1",
    [
      "# Explicit",
      "",
      "| Field | Value |",
      "|---|---|",
      "| Feature scope | BP-012 to BP-013 |",
      ""
    ].join("\n")
  );
  writeSpec(
    root,
    "ongoing",
    "legacy",
    "v1",
    [
      "# BP-020 Legacy scope",
      "",
      "The plan records this backlog item.",
      ""
    ].join("\n")
  );

  const explicit = {
    name: "explicit",
    productItems: ["BP-010", "BP-011"],
    versions: [{ id: "v1", phase: "ongoing" }]
  };
  const legacy = {
    name: "legacy",
    versions: [
      {
        id: "v1",
        phase: "ongoing",
        history: [{ event: "Scope expanded to include BP-021 and BP-022" }]
      }
    ]
  };

  assert.deepStrictEqual(productPlan.featureProductIds(explicit, root), [
    "BP-010",
    "BP-011",
    "BP-012",
    "BP-013"
  ]);
  assert.deepStrictEqual(productPlan.featureProductIds(legacy, root), [
    "BP-021",
    "BP-022",
    "BP-020"
  ]);
});

test("enriches items with lifecycle status, blockers, waves, and counts", (t) => {
  const root = tempDir(t, "sdrive-lifecycle-enrich-");
  writeSpec(root, "completed", "parser", "v1");

  const state = {
    features: [
      {
        name: "parser",
        productItems: ["BP-001"],
        branch: "feature/BP-001",
        base: "main",
        versions: [{ id: "v1", phase: "completed" }]
      }
    ],
    worktrees: [
      {
        item: "BP-003",
        branch: "feature/BP-003",
        base: "main",
        path: path.join(root, "worktrees", "BP-003"),
        status: "prepared"
      }
    ]
  };

  const annotated = productPlan.annotateBacklog(productPlan.parseBacklog(BACKLOG));
  const enriched = productPlan.enrichBacklog(annotated, { sdriveRoot: root, state });
  const byId = new Map(enriched.items.map((item) => [item.id, item]));

  assert.strictEqual(byId.get("BP-001").lifecycleStatus, "completed");
  assert.strictEqual(byId.get("BP-001").featureName, "parser");
  assert.strictEqual(byId.get("BP-001").eligible, false);

  // A prepared worktree means work has started, but it does not create a feature.
  assert.strictEqual(byId.get("BP-003").lifecycleStatus, "ongoing");
  assert.strictEqual(byId.get("BP-003").featureName, null);
  assert.strictEqual(byId.get("BP-003").worktreePath, state.worktrees[0].path);
  assert.strictEqual(byId.get("BP-003").eligible, false);

  // BP-002's only dependency is completed, so it is ready. BP-004 has the same
  // dependency but an outside blocker, and BP-005 was deliberately parked.
  assert.strictEqual(byId.get("BP-002").eligible, true);
  assert.deepStrictEqual(byId.get("BP-002").blockedBy, []);
  assert.strictEqual(byId.get("BP-004").eligible, false);
  assert.deepStrictEqual(byId.get("BP-004").blockedBy, []);
  assert.deepStrictEqual(byId.get("BP-004").externalDependencies, ["partner access"]);
  assert.strictEqual(byId.get("BP-005").eligible, false);

  assert.deepStrictEqual(enriched.counts, { backlog: 3, ongoing: 1, completed: 1 });
  assert.deepStrictEqual(
    enriched.waves.map((wave) => [wave.label, wave.total, wave.backlog, wave.ongoing, wave.completed]),
    [
      ["start", 3, 1, 1, 1],
      ["W1", 2, 2, 0, 0]
    ]
  );
});

test("never downgrades a completed feature because a worktree was prepared", (t) => {
  const root = tempDir(t, "sdrive-lifecycle-completed-");
  writeSpec(root, "completed", "shipped", "v1");

  const state = {
    features: [
      {
        name: "shipped",
        productItems: ["BP-001"],
        versions: [{ id: "v1", phase: "completed" }]
      }
    ],
    worktrees: [
      { item: "BP-001", branch: "feature/BP-001", path: "/tmp/shipped", status: "prepared" }
    ]
  };

  const links = productPlan.collectFeatureLinks(state, root);
  assert.strictEqual(links.get("BP-001").status, "completed");
  assert.strictEqual(links.get("BP-001").worktreePath, null);

  const annotated = productPlan.annotateBacklog(productPlan.parseBacklog(BACKLOG));
  const item = productPlan
    .enrichBacklog(annotated, { sdriveRoot: root, state })
    .items.find((entry) => entry.id === "BP-001");
  assert.strictEqual(item.lifecycleStatus, "completed");
});

test("sorts by wave before milestone, priority, and id", () => {
  const items = [
    { id: "BP-005", wave: 1, milestone: "M1", priority: "P1" },
    { id: "BP-003", wave: 0, milestone: "M2", priority: "P0" },
    { id: "BP-002", wave: 0, milestone: "M1", priority: "P2" },
    { id: "BP-001", wave: 0, milestone: "M1", priority: "P2" },
    { id: "BP-004", wave: 0, milestone: "M1", priority: "P1" }
  ];

  assert.deepStrictEqual(
    productPlan.sortBacklog(items).map((item) => item.id),
    ["BP-004", "BP-001", "BP-002", "BP-003", "BP-005"]
  );
  assert.strictEqual(productPlan.milestoneRank("M2 - Publish"), 2);
  assert.strictEqual(productPlan.priorityRank("P1"), 1);
});

test("suggests safe branch names from a feature title", () => {
  const suggestions = productPlan.suggestBranchNames({
    feature: "Chat: direct messages & mentions"
  });

  assert.ok(suggestions.length > 0 && suggestions.length <= 3);
  assert.ok(suggestions.every((name) => /^feature\/[a-z0-9][a-z0-9._-]*$/.test(name)));
  assert.strictEqual(suggestions[0], "feature/chat-direct-messages-mentions");
  assert.ok(suggestions.includes("feature/chat"));
  assert.deepStrictEqual(productPlan.suggestBranchNames({ feature: "" }), []);
  assert.strictEqual(productPlan.branchSlug("feature/Chat UI"), "chat-ui");
});
