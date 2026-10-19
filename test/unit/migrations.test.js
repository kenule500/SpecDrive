const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { detectAll, buildPlan } = require("../../migrations");
const { applyPlan } = require("../../migrations/lib/apply");
const { verifyMigration, rollbackMigration } = require("../../migrations/lib/lifecycle");

function project(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-migration-test-"));

  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  return root;
}

function detection(root, id) {
  return detectAll(root).find((entry) => entry.id === id);
}

test("detects OpenSpec and maps specs, changes, and archive", () => {
  const root = project({
    "openspec/specs/login/spec.md": "# Login\n",
    "openspec/changes/login-change/proposal.md": "# Change\n",
    "openspec/archive/old/spec.md": "# Old\n"
  });

  assert.strictEqual(detection(root, "openspec").detected, true);

  const plan = buildPlan(root, "openspec");
  assert.strictEqual(plan.features.length, 3);
  assert.ok(plan.features.every((feature) => feature.status !== "conflict"));
  assert.ok(plan.features.some((feature) => feature.targetLifecycle === "completed"));
});

test("detects Spec Kit and strips the numeric prefix", () => {
  const root = project({
    ".specify/specs/001-user-login/spec.md": "# Login\n",
    ".specify/specs/001-user-login/plan.md": "# Plan\n",
    ".specify/specs/001-user-login/tasks.md": "# Tasks\n"
  });

  const plan = buildPlan(root, "speckit");
  assert.strictEqual(plan.features.length, 1);
  assert.strictEqual(plan.features[0].feature, "user-login");
});

test("detects Kiro and maps requirements/design/tasks", () => {
  const root = project({
    ".kiro/specs/login/requirements.md": "# Requirements\n",
    ".kiro/specs/login/design.md": "# Design\n",
    ".kiro/specs/login/tasks.md": "# Tasks\n"
  });

  const plan = buildPlan(root, "kiro");
  assert.strictEqual(plan.features.length, 1);
  const mapping = Object.fromEntries(plan.features[0].files.map((file) => [file.kind, file.source]));
  assert.strictEqual(mapping.spec, ".kiro/specs/login/requirements.md");
  assert.strictEqual(mapping.plan, ".kiro/specs/login/design.md");
  assert.strictEqual(mapping.tasks, ".kiro/specs/login/tasks.md");
});

test("detects Agent OS and maps the dated spec folder", () => {
  const root = project({
    ".agent-os/specs/2026-10-19-login/spec.md": "# Login\n",
    ".agent-os/specs/2026-10-19-login/plan.md": "# Plan\n",
    ".agent-os/specs/2026-10-19-login/tasks.md": "# Tasks\n"
  });

  const plan = buildPlan(root, "agent-os");
  assert.strictEqual(plan.features.length, 1);
  assert.strictEqual(plan.features[0].feature, "login");
});

test("detects BMAD stories as backlog drafts", () => {
  const root = project({
    ".bmad-core/config.yaml": "name: bmad\n",
    "docs/stories/login.md": "# Login story\n",
    "docs/architecture.md": "# Architecture\n"
  });

  const plan = buildPlan(root, "bmad");
  assert.strictEqual(plan.features.length, 1);
  assert.strictEqual(plan.features[0].targetLifecycle, "backlog");
  assert.strictEqual(plan.features[0].feature, "login");
});

test("detects a generic spec folder as a backlog draft", () => {
  const root = project({
    "specs/login/spec.md": "# Login\n",
    "specs/login/plan.md": "# Plan\n"
  });

  const plan = buildPlan(root, "generic");
  assert.strictEqual(plan.features.length, 1);
  assert.strictEqual(plan.features[0].targetLifecycle, "backlog");
});

test("applies, verifies, and rolls back a migration", () => {
  const root = project({
    ".kiro/specs/login/requirements.md": "# Login requirements\n",
    ".kiro/specs/login/design.md": "# Login design\n",
    ".kiro/specs/login/tasks.md": "# Login tasks\n"
  });

  fs.mkdirSync(path.join(root, ".sdrive"), { recursive: true });
  fs.writeFileSync(path.join(root, ".sdrive", "workflow-state.json"), JSON.stringify({ features: [] }));

  const plan = buildPlan(root, "kiro");
  const applied = applyPlan(root, plan);

  assert.strictEqual(applied.report.counts.imported, 1);
  assert.ok(fs.existsSync(path.join(root, ".sdrive", "specs", "ongoing", "login", "v1", "spec.md")));
  assert.ok(
    fs.existsSync(path.join(root, ".sdrive", "governance", "login", "v1", "migration.json"))
  );

  const state = JSON.parse(fs.readFileSync(path.join(root, ".sdrive", "workflow-state.json"), "utf8"));
  assert.strictEqual(state.features.length, 1);
  assert.strictEqual(state.features[0].versions[0].phase, "ongoing");

  const verification = verifyMigration(root, applied.report.migrationId);
  assert.strictEqual(verification.ok, true, verification.blockers.join("; "));

  const rollback = rollbackMigration(root, applied.report.migrationId);
  assert.strictEqual(rollback.ok, true, (rollback.blockers || []).join("; "));
  assert.strictEqual(fs.existsSync(path.join(root, ".sdrive", "specs", "ongoing", "login")), false);

  const restored = JSON.parse(fs.readFileSync(path.join(root, ".sdrive", "workflow-state.json"), "utf8"));
  assert.strictEqual(restored.features.length, 0);
});
