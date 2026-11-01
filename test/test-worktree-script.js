// /sdrive:worktree's deterministic helper.
//
// Runs against a throwaway git repo. The helper is the only thing allowed to
// decide what is ready, open a branch, and record the preparation, so these
// checks cover wave order, dependency completion, and the state record.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const WORKTREE_HELPER = path.join(PACKAGE_ROOT, "scripts", "worktree.js");
const BACKLOG = [
  "# Product Backlog",
  "",
  "## Start",
  "",
  "| ID | Feature | Priority | Depends on | Status |",
  "|---|---|---|---|---|",
  "| BP-001 | Parser core | P0 | - | backlog |",
  "| BP-003 | Summary docs | P1 | - | backlog |",
  "| BP-005 | Deferred polish | P2 | - | deferred |",
  "",
  "## M1 - Publish",
  "",
  "| ID | Feature | Priority | Depends on | Status |",
  "|---|---|---|---|---|",
  "| BP-002 | Retry layer | P1 | BP-001 | backlog |",
  "| BP-004 | Partner adapter | P1 | BP-001; partner access | backlog |",
  ""
].join("\n");

function git(repo, args) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function runHelper(repo, args) {
  const result = spawnSync(process.execPath, [WORKTREE_HELPER, ...args], {
    cwd: repo,
    encoding: "utf8",
    timeout: 30000
  });
  return { status: result.status, output: `${result.stdout || ""}${result.stderr || ""}` };
}

function listPlan(repo) {
  const result = runHelper(repo, ["list", "--json"]);
  assert.strictEqual(result.status, 0, result.output);
  return JSON.parse(result.output);
}

function readState(root) {
  return JSON.parse(fs.readFileSync(path.join(root, ".sdrive", "workflow-state.json"), "utf8"));
}

test("/sdrive:worktree respects waves, dependencies, and records preparation", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-worktree-"));
  const repo = path.join(base, "demo");
  const firstWorktree = path.join(base, "wt-start");
  const secondWorktree = path.join(base, "wt-w1");
  fs.mkdirSync(repo);

  t.after(() => {
    for (const worktree of [firstWorktree, secondWorktree]) {
      if (fs.existsSync(worktree)) {
        try {
          git(repo, ["worktree", "remove", "--force", worktree]);
        } catch (error) {
          // The directory is inside the temp base and is removed below anyway.
        }
      }
    }
    fs.rmSync(base, { recursive: true, force: true });
  });

  git(repo, ["init"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  git(repo, ["checkout", "-b", "main"]);
  fs.writeFileSync(path.join(repo, "README.md"), "# demo\n");

  const sdrive = path.join(repo, ".sdrive");
  fs.mkdirSync(path.join(sdrive, "product"), { recursive: true });
  fs.mkdirSync(path.join(sdrive, "specs", "completed", "parser", "v1"), { recursive: true });
  fs.writeFileSync(path.join(sdrive, "product", "backlog.md"), BACKLOG);
  fs.writeFileSync(path.join(sdrive, "specs", "completed", "parser", "v1", "spec.md"), "# Parser\n");

  // BP-001 has shipped, so BP-002 loses its blocker but is still W1. BP-003 is
  // the untouched start-wave item, which makes "start" the current wave.
  fs.writeFileSync(
    path.join(sdrive, "workflow-state.json"),
    JSON.stringify(
      {
        features: [
          {
            name: "parser",
            productItems: ["BP-001"],
            branch: "feature/BP-001",
            base: "main",
            versions: [{ id: "v1", phase: "completed" }]
          }
        ],
        worktrees: []
      },
      null,
      2
    )
  );

  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-m", "chore: seed backlog and shipped parser"]);

  // --- 1. The plan separates ready-now from later-wave work ---
  const plan = listPlan(repo);
  assert.strictEqual(plan.integrationBranch, "main");
  assert.strictEqual(plan.currentWave, 0);
  assert.strictEqual(plan.currentWaveLabel, "start");
  assert.deepStrictEqual(plan.counts, { backlog: 4, ongoing: 0, completed: 1 });
  assert.deepStrictEqual(plan.eligible.map((item) => item.id), ["BP-003", "BP-002"]);
  assert.deepStrictEqual(
    plan.eligible.map((item) => item.wave),
    [0, 1]
  );
  assert.strictEqual(plan.eligible[1].reason, "");
  assert.deepStrictEqual(
    plan.waiting.map((item) => item.id).sort(),
    ["BP-004", "BP-005"]
  );
  assert.ok(plan.eligible[0].suggestions.some((name) => name.startsWith("feature/")));

  // --- 2. A later wave cannot be cut while the current wave is untouched ---
  const early = runHelper(repo, [
    "create",
    "--item",
    "BP-002",
    "--branch",
    "feature/BP-002",
    "--path",
    secondWorktree
  ]);
  assert.notStrictEqual(early.status, 0, early.output);
  assert.match(early.output, /BP-002 is in W1 but the current wave is start/);
  assert.strictEqual(fs.existsSync(secondWorktree), false);

  // --- 3. Creating the start-wave branch records the worktree and its base ---
  const created = runHelper(repo, [
    "create",
    "--item",
    "BP-003",
    "--branch",
    "feature/BP-003",
    "--path",
    firstWorktree,
    "--json"
  ]);
  assert.strictEqual(created.status, 0, created.output);

  const result = JSON.parse(created.output);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.item, "BP-003");
  assert.strictEqual(result.branch, "feature/BP-003");
  assert.strictEqual(result.base, "main");
  assert.strictEqual(result.path, firstWorktree);
  assert.strictEqual(result.status, "prepared");
  assert.match(result.next, /\/sdrive:propose/);

  assert.strictEqual(
    git(repo, ["rev-parse", "--verify", "refs/heads/feature/BP-003"]).length > 0,
    true
  );
  assert.ok(fs.existsSync(path.join(firstWorktree, "README.md")));

  const state = readState(repo);
  assert.strictEqual(state.worktrees.length, 1);
  assert.deepStrictEqual(
    {
      item: state.worktrees[0].item,
      branch: state.worktrees[0].branch,
      base: state.worktrees[0].base,
      path: state.worktrees[0].path,
      title: state.worktrees[0].title,
      status: state.worktrees[0].status
    },
    {
      item: "BP-003",
      branch: "feature/BP-003",
      base: "main",
      path: firstWorktree,
      title: "Summary docs",
      status: "prepared"
    }
  );

  // The new worktree's checkout does not include uncommitted state, so the
  // helper copies the updated record into it before handing over.
  const copied = JSON.parse(
    fs.readFileSync(path.join(firstWorktree, ".sdrive", "workflow-state.json"), "utf8")
  );
  assert.deepStrictEqual(copied.worktrees, state.worktrees);

  // --- 4. Starting the current wave advances the plan to W1 ---
  const afterStart = listPlan(repo);
  assert.strictEqual(afterStart.currentWave, 1);
  assert.strictEqual(afterStart.currentWaveLabel, "W1");
  assert.deepStrictEqual(afterStart.eligible.map((item) => item.id), ["BP-002"]);
  assert.strictEqual(afterStart.worktrees.length, 1);
  assert.strictEqual(
    afterStart.eligible[0].suggestions.some((name) => name === "feature/retry-layer"),
    true
  );

  // --- 5. W1 can be cut once it is the current wave ---
  const second = runHelper(repo, [
    "create",
    "--item",
    "BP-002",
    "--branch",
    "feature/retry-layer",
    "--path",
    secondWorktree,
    "--json"
  ]);
  assert.strictEqual(second.status, 0, second.output);
  assert.strictEqual(readState(repo).worktrees.length, 2);

  // --- 6. An item with a prepared worktree is no longer eligible ---
  const duplicate = runHelper(repo, [
    "create",
    "--item",
    "BP-003",
    "--branch",
    "feature/BP-003-v2",
    "--path",
    path.join(base, "wt-duplicate")
  ]);
  assert.notStrictEqual(duplicate.status, 0, duplicate.output);
  assert.match(duplicate.output, /worktree already prepared|already has a prepared worktree/);

  // --- 7. A completed feature is never re-opened by the helper ---
  const completed = runHelper(repo, [
    "create",
    "--item",
    "BP-001",
    "--branch",
    "feature/BP-001-v2",
    "--path",
    path.join(base, "wt-completed")
  ]);
  assert.notStrictEqual(completed.status, 0, completed.output);
  assert.match(completed.output, /feature already exists \(parser\)/);
});

// A second repo, because this covers the questions the first test does not ask: one branch for
// several items, a preview that writes nothing, a record whose directory was deleted by hand,
// and undoing a preparation.
const SHARED_BACKLOG = [
  "# Product Backlog",
  "",
  "## Start",
  "",
  "| ID | Feature | Kind | Batch | Priority | Depends on | Status |",
  "|---|---|---|---|---|---|---|",
  "| BP-001 | Signup | build | b1 | P0 | - | backlog |",
  "| BP-002 | Language | build | b1 | P0 | - | backlog |",
  "| BP-003 | Video | build | - | P1 | - | backlog |",
  "| BP-004 | Partner adapter | build | - | P1 | partner access | backlog |",
  "| BP-005 | Decide crate | decision | - | P1 | - | backlog |",
  ""
].join("\n");

test("/sdrive:worktree shares one branch, previews, and can undo a preparation", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-shared-"));
  const repo = path.join(base, "demo");
  const sharedWorktree = path.join(base, "wt-onboarding");
  fs.mkdirSync(repo);

  t.after(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  git(repo, ["init"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  git(repo, ["checkout", "-b", "main"]);
  fs.writeFileSync(path.join(repo, "README.md"), "# demo\n");

  const sdrive = path.join(repo, ".sdrive");
  fs.mkdirSync(path.join(sdrive, "product"), { recursive: true });
  fs.writeFileSync(path.join(sdrive, "product", "backlog.md"), SHARED_BACKLOG);
  // `create` reads this file before it writes it, and `git worktree add` needs a commit to cut
  // from, so both exist before the first assertion runs.
  fs.writeFileSync(
    path.join(sdrive, "workflow-state.json"),
    JSON.stringify({ features: [], worktrees: [] }, null, 2)
  );

  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-m", "chore: seed shared backlog"]);

  // --- 1. The branch question is answered before anything is created ---
  const plan = listPlan(repo);
  const options = plan.topologies.options;

  // The declared batch comes first: the backlog already says these two land together.
  assert.strictEqual(options[0].id, "batch:b1");
  assert.deepStrictEqual(options[0].shared, ["BP-001", "BP-002"]);

  // A later grouping is offered only if it can finish. BP-004 needs partner access, so it is
  // never in the ready set to begin with and the reason it is waiting is reported instead.
  assert.deepStrictEqual(
    options.map((option) => option.id),
    ["batch:b1", "shared-all", "per-feature"]
  );
  assert.strictEqual(
    plan.eligible.some((item) => item.id === "BP-004"),
    false
  );
  assert.match(plan.waiting.find((item) => item.id === "BP-004").reason, /outside blocker/);
  assert.deepStrictEqual(plan.topologies.rejected, []);

  // A decision is not a feature in any topology, and it is stated rather than dropped.
  assert.deepStrictEqual(
    plan.topologies.excluded.map((entry) => entry.item),
    ["BP-005"]
  );

  // --- 2. A preview creates nothing and records nothing ---
  const preview = runHelper(repo, [
    "create",
    "--items",
    "BP-001,BP-002",
    "--branch",
    "feature/onboarding",
    "--path",
    sharedWorktree,
    "--dry-run",
    "--json"
  ]);
  assert.strictEqual(preview.status, 0, preview.output);
  assert.strictEqual(JSON.parse(preview.output).dryRun, true);
  assert.strictEqual(fs.existsSync(sharedWorktree), false);
  assert.strictEqual(readState(repo).worktrees.length, 0);

  // --- 3. One record carries the whole branch, and one spec covers it ---
  const created = runHelper(repo, [
    "create",
    "--items",
    "BP-001,BP-002",
    "--branch",
    "feature/onboarding",
    "--path",
    sharedWorktree,
    "--json"
  ]);
  assert.strictEqual(created.status, 0, created.output);

  const result = JSON.parse(created.output);
  assert.deepStrictEqual(result.items, ["BP-001", "BP-002"]);
  assert.strictEqual(result.item, "BP-001");
  assert.strictEqual(result.title, "Signup + Language");
  assert.match(result.next, /\/sdrive:propose "\[BP-001, BP-002\]"/);

  const state = readState(repo);
  assert.strictEqual(state.worktrees.length, 1);
  assert.deepStrictEqual(state.worktrees[0].items, ["BP-001", "BP-002"]);
  assert.strictEqual(typeof state.worktrees[0].updatedAt, "string");

  // Both members are now busy, so neither is eligible any more.
  const afterCreate = listPlan(repo);
  assert.strictEqual(
    afterCreate.eligible.some((item) => item.id === "BP-002"),
    false
  );
  assert.strictEqual(afterCreate.worktrees[0].present, true);

  // --- 4. A member of the branch cannot be prepared a second time ---
  const duplicate = runHelper(repo, [
    "create",
    "--item",
    "BP-002",
    "--branch",
    "feature/BP-002-v2",
    "--path",
    path.join(base, "wt-duplicate")
  ]);
  assert.notStrictEqual(duplicate.status, 0, duplicate.output);
  assert.match(duplicate.output, /worktree already prepared|already has a prepared worktree/);

  // --- 5. A record whose directory is gone is reported, not pretended ---
  fs.rmSync(sharedWorktree, { recursive: true, force: true });
  assert.strictEqual(listPlan(repo).worktrees[0].present, false);

  // --- 6. Removing the preparation frees every member again ---
  const removed = runHelper(repo, ["remove", "--item", "BP-002", "--json"]);
  assert.strictEqual(removed.status, 0, removed.output);

  const removal = JSON.parse(removed.output);
  assert.deepStrictEqual(removal.removed.items, ["BP-001", "BP-002"]);
  assert.strictEqual(removed.output.includes("feature/onboarding"), true);
  assert.strictEqual(readState(repo).worktrees.length, 0);

  const afterRemove = listPlan(repo);
  assert.strictEqual(
    afterRemove.eligible.some((item) => item.id === "BP-002"),
    true
  );
  assert.strictEqual(
    afterRemove.eligible.some((item) => item.id === "BP-001"),
    true
  );
});

