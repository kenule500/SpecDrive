const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { initProject, runCli, writeJson, readJson, cleanup } = require("./helpers/sandbox");

function seed(root, { withPlan = true } = {}) {
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
  fs.writeFileSync(path.join(specDir, "spec.md"), "# Demo specification\n\nThe user can log in.\n");
  if (withPlan) {
    fs.writeFileSync(path.join(specDir, "plan.md"), "# Demo plan\n\nUse the existing auth service.\n");
    fs.writeFileSync(path.join(specDir, "tasks.md"), "# Demo tasks\n\n- Build the login form.\n");
  }

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
        acceptanceCriteria: [{ id: "AC-001", text: "Given a valid login, the user reaches the dashboard." }]
      }
    ],
    functionalRequirements: [{ id: "FR-001", text: "The system MUST allow login." }]
  });
}

test("review:cold writes a context-blind packet and no gate changes", () => {
  const root = initProject({ prefix: "sdrive-cold-review-" });

  try {
    seed(root);
    const before = readJson(path.join(root, ".sdrive", "workflow-state.json"));

    const result = runCli(["review:cold", "demo", "--json"], { cwd: root });
    assert.strictEqual(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.strictEqual(payload.data.feature, "demo");
    assert.strictEqual(payload.data.version, "v1");
    assert.strictEqual(payload.data.acceptanceCriteria, 1);

    const packetPath = path.join(root, payload.data.packet);
    assert.ok(fs.existsSync(packetPath), "packet exists");
    const packet = fs.readFileSync(packetPath, "utf8");

    assert.match(packet, /# Cold review packet: demo v1/);
    assert.match(packet, /The user can log in/);
    assert.match(packet, /Use the existing auth service/);
    assert.match(packet, /Build the login form/);
    assert.match(packet, /AC-001/);
    assert.match(packet, /no conversation\s+history/i);
    assert.doesNotMatch(packet, /test-evidence|review\.json|review\.md/);

    const after = readJson(path.join(root, ".sdrive", "workflow-state.json"));
    assert.deepStrictEqual(after, before);
  } finally {
    cleanup(root);
  }
});

test("review:cold refuses without a plan", () => {
  const root = initProject({ prefix: "sdrive-cold-noplan-" });

  try {
    seed(root, { withPlan: false });
    const result = runCli(["review:cold", "demo"], { cwd: root });
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /needs the written specification, plan, and tasks/i);
  } finally {
    cleanup(root);
  }
});
