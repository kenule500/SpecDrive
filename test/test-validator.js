// Governance validation accepts a complete feature and rejects an incomplete
// one. Runs in a temp project; no repository files are touched or deleted.
const fs = require("fs");
const path = require("path");
const { initProject, runCli, writeJson, cleanup } = require("./helpers/sandbox");

const root = initProject({ prefix: "sdrive-validator-" });
const govDir = path.join(root, ".sdrive", "governance", "test-feature");
let failures = 0;

function check(label, condition, detail = "") {
  console.log(`${condition ? "✅ PASS" : "❌ FAIL"}: ${label}${condition || !detail ? "" : `\n   ${detail}`}`);
  if (!condition) failures += 1;
}

try {
  writeJson(path.join(govDir, "spec.json"), {
    feature: "test-feature",
    title: "Test Feature",
    version: 1,
    overview: {
      problemStatement: "A sufficiently long problem statement.",
      proposedSolution: "A sufficiently long proposed solution.",
      targetAudience: "Test users"
    },
    userStories: [
      {
        id: "US-001",
        title: "Test story",
        role: "user",
        want: "test",
        benefit: "test",
        acceptanceCriteria: [
          { id: "AC-001", text: "Given a test, when it runs, then it passes." }
        ]
      }
    ],
    functionalRequirements: [{ id: "FR-001", text: "The system MUST test." }]
  });

  writeJson(path.join(govDir, "traceability.json"), {
    feature: "test-feature",
    version: 1,
    rows: [
      {
        requirementId: "FR-001",
        acceptanceCriteriaIds: ["AC-001"],
        taskIds: ["T1.1"],
        status: "not_started"
      }
    ]
  });

  const valid = runCli(["validate", "--json"], { cwd: root });
  check("Valid governance files pass", valid.status === 0, valid.stdout || valid.stderr);

  writeJson(path.join(govDir, "spec.json"), {
    feature: "test-feature",
    version: 1,
    overview: {},
    userStories: []
  });

  const invalid = runCli(["validate", "--json"], { cwd: root });
  check("Invalid governance files fail with exit 4", invalid.status === 4, invalid.stdout || invalid.stderr);
} finally {
  cleanup(root);
}

if (failures > 0) {
  process.exit(1);
}

console.log("\n✅ All validator checks passed.");
