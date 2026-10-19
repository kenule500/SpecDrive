// End-to-end: initialise a project, create a feature, confirm the scaffold, and
// confirm the governance validator rejects an incomplete spec.
//
// Everything happens in a temp directory. The old version reset the repository's
// own workflow-state.json and invoked a CLI path that does not exist.
const fs = require("fs");
const path = require("path");
const { initProject, runCli, cleanup } = require("./helpers/sandbox");

const root = initProject({ prefix: "sdrive-e2e-" });
let failures = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`✅ PASS: ${label}`);
    return;
  }

  console.log(`❌ FAIL: ${label}${detail ? `\n   ${detail}` : ""}`);
  failures += 1;
}

try {
  const created = runCli(["create", "test-feature"], { cwd: root });
  check("Feature creation exits 0", created.status === 0, created.stderr);

  const specPath = path.join(root, ".sdrive", "specs", "backlog", "test-feature", "spec.md");
  const govPath = path.join(root, ".sdrive", "governance", "test-feature", "spec.json");
  const tracePath = path.join(root, ".sdrive", "governance", "test-feature", "traceability.json");

  check("Spec and governance files exist", fs.existsSync(specPath) && fs.existsSync(govPath));
  check("Traceability matrix exists", fs.existsSync(tracePath));

  const validation = runCli(["validate", "--json"], { cwd: root });
  check(
    "Incomplete scaffold is rejected by governance validation",
    validation.status === 4,
    `exit ${validation.status}`
  );

  const state = JSON.parse(
    fs.readFileSync(path.join(root, ".sdrive", "workflow-state.json"), "utf8")
  );
  check("Workflow state has a features array", Array.isArray(state.features));
} finally {
  cleanup(root);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} end-to-end check(s) failed.`);
  process.exit(1);
}

console.log("\n✅ All end-to-end checks passed.");
