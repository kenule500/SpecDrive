// Router checks: known/unknown commands, required feature, and kebab-case
// conversion. Runs against a temp project with its own installed commands.
const path = require("path");
const { spawnSync } = require("child_process");
const { initProject, seedTeam, cleanup, TEST_ENV } = require("./helpers/sandbox");

const root = initProject({ prefix: "sdrive-router-" });
const router = path.join(root, ".sdrive", "commands", "router.js");
let failures = 0;

function runRouter(args) {
  return spawnSync(process.execPath, [router, ...args], {
    cwd: root,
    env: TEST_ENV,
    encoding: "utf8",
    timeout: 60000
  });
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "✅ PASS" : "❌ FAIL"}: ${label}${condition || !detail ? "" : `\n   ${detail}`}`);
  if (!condition) failures += 1;
}

try {
  seedTeam(root);

  const known = runRouter(["/sdrive:skills"]);
  check("Known, ungated command is accepted", known.status === 0, known.stdout + known.stderr);

  const unknown = runRouter(["/sdrive:unknown"]);
  check("Unknown command is rejected", unknown.status !== 0);

  const missingFeature = runRouter(["/sdrive:propose"]);
  check("Feature command without a feature is rejected", missingFeature.status !== 0);

  const conversion = runRouter(["/sdrive:propose", "User login with email"]);
  check(
    "Natural description becomes a kebab-case feature",
    (conversion.stdout || "").includes("user-login-with-email"),
    conversion.stdout + conversion.stderr
  );
} finally {
  cleanup(root);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} router check(s) failed.`);
  process.exit(1);
}

console.log("\n✅ All router checks passed.");
