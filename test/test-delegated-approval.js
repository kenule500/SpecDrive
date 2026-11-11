const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { initProject, runCli, writeJson, readJson, cleanup } = require("./helpers/sandbox");

function seedFeature(root) {
  writeJson(path.join(root, ".sdrive", "workflow-state.json"), {
    features: [
      {
        name: "demo",
        currentVersion: "v1",
        versions: [
          {
            id: "v1",
            phase: "ongoing",
            currentStep: "specification",
            gates: {
              specification: "pending",
              planning: "pending",
              implementation: "pending",
              review: "pending"
            },
            history: []
          }
        ]
      }
    ]
  });

  const specDir = path.join(root, ".sdrive", "specs", "ongoing", "demo", "v1");
  const govDir = path.join(root, ".sdrive", "governance", "demo", "v1");
  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(govDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, "spec.md"), "# Demo\n");
  writeJson(path.join(govDir, "spec.json"), {
    feature: "demo",
    title: "Demo",
    version: 1,
    overview: {
      problemStatement: "A long enough problem statement.",
      proposedSolution: "A long enough proposed solution.",
      targetAudience: "users"
    },
    userStories: [
      {
        id: "US-001",
        title: "Demo story",
        role: "user",
        want: "x",
        benefit: "y",
        acceptanceCriteria: [{ id: "AC-001", text: "Given a thing, it works as described." }]
      }
    ],
    functionalRequirements: [{ id: "FR-001", text: "The system MUST work." }]
  });
}

function state(root) {
  return readJson(path.join(root, ".sdrive", "workflow-state.json"));
}

test("delegated approval is refused unless explicitly enabled", () => {
  const root = initProject({ prefix: "sdrive-delegated-manual-" });

  try {
    seedFeature(root);

    const result = runCli(
      ["approve", "demo", "specification", "--delegated", "--reason", "Checks passed automatically."],
      { cwd: root }
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /not enabled/i);
    assert.strictEqual(state(root).features[0].versions[0].gates.specification, "pending");
  } finally {
    cleanup(root);
  }
});

test("delegated approval records the agent actor, reason, and gate", () => {
  const root = initProject({ prefix: "sdrive-delegated-ok-" });

  try {
    seedFeature(root);
    const config = runCli(["config:set", "governance.approvalMode", "delegated"], { cwd: root });
    assert.strictEqual(config.status, 0, config.stderr);

    const result = runCli(
      [
        "approve",
        "demo",
        "specification",
        "--delegated",
        "--reason",
        "Specification artifacts verified by sdrive check.",
        "--json"
      ],
      { cwd: root }
    );

    assert.strictEqual(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.strictEqual(payload.data.delegated, true);
    assert.match(payload.data.by, /^agent:/);

    const version = state(root).features[0].versions[0];
    assert.strictEqual(version.gates.specification, "approved");
    assert.strictEqual(version.history[0].delegated, true);
    assert.match(version.history[0].by, /^agent:/);
    assert.match(version.history[0].delegationReason, /verified/i);
  } finally {
    cleanup(root);
  }
});

test("review can never be delegated", () => {
  const root = initProject({ prefix: "sdrive-delegated-review-" });

  try {
    seedFeature(root);
    runCli(["config:set", "governance.approvalMode", "delegated"], { cwd: root });

    const result = runCli(
      ["approve", "demo", "review", "--delegated", "--reason", "Automated review passed."],
      { cwd: root }
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /not delegatable/i);
    assert.strictEqual(state(root).features[0].versions[0].gates.review, "pending");
  } finally {
    cleanup(root);
  }
});

test("delegatedGates limits which gates may be delegated", () => {
  const root = initProject({ prefix: "sdrive-delegated-list-" });

  try {
    seedFeature(root);
    runCli(["config:set", "governance.approvalMode", "delegated"], { cwd: root });
    runCli(
      ["config:set", "governance.delegatedGates", '["planning"]'],
      { cwd: root }
    );

    const result = runCli(
      ["approve", "demo", "specification", "--delegated", "--reason", "Automated check passed."],
      { cwd: root }
    );

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /not delegatable/i);
    assert.strictEqual(state(root).features[0].versions[0].gates.specification, "pending");
  } finally {
    cleanup(root);
  }
});
