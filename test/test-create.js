// `sdrive create` writes the backlog + governance scaffold.
// Runs in a throwaway project; the repository's own .sdrive/ is never touched.
const fs = require("fs");
const path = require("path");
const { initProject, runCli, cleanup } = require("./helpers/sandbox");

const root = initProject({ prefix: "sdrive-create-" });

try {
  const result = runCli(["create", "test-feature"], { cwd: root });

  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    process.exit(1);
  }

  const specDir = path.join(root, ".sdrive", "specs", "backlog", "test-feature");
  const govDir = path.join(root, ".sdrive", "governance", "test-feature");
  const expected = [
    path.join(specDir, "spec.md"),
    path.join(specDir, "plan.md"),
    path.join(specDir, "tasks.md"),
    path.join(govDir, "spec.json"),
    path.join(govDir, "plan.json"),
    path.join(govDir, "tasks.json"),
    path.join(govDir, "traceability.json")
  ];

  const missing = expected.filter((file) => !fs.existsSync(file));

  if (missing.length > 0) {
    console.error(`Missing scaffold file(s):\n${missing.join("\n")}`);
    process.exit(1);
  }

  console.log("✅ Feature creation test passed.");
} finally {
  cleanup(root);
}
