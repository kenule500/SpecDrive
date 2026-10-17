#!/usr/bin/env node
/*
 * Guards the single source of truth for gate state.
 *
 * Why this exists: "is this gate approved?" was open-coded in ten places across six
 * files - the archive checker, the router, the git hook, the approve command, and two
 * dashboard endpoints. All ten agreed only because the gate value happens to be the
 * string "approved" today. Nothing enforced that. The change that would break it is the
 * ordinary, reasonable one: storing `{ status, by, at }` so the record carries who
 * approved what and when. At that moment every undated copy stops recognising approvals
 * - silently, without throwing, refusing valid merges and reporting a health score that
 * is wrong rather than broken.
 *
 * So the rule is: only commands/gates.js may name "approved". Everyone else asks
 * gateStatusFor() / isGateApprovedFor() / allGatesApproved() to read, and GATE_APPROVED to
 * write. This test is what makes that rule real; a convention without a check is a
 * suggestion. It fails on the quoted literal anywhere in Node-side code - not just on
 * comparisons - because a writer that spells the value out is the same bug one line later.
 *
 * dashboard/app.js is exempt from the comparison scan because it is presentation: it
 * turns a status the API already decided into a colour and a label, and it has no access
 * to the Node modules. It still may not read gate state itself, which is asserted below.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Files allowed to contain the literal comparison, with the reason.
const COMPARISON_ALLOWED = {
  "commands/gates.js": "owns the rule - this is the one implementation"
};

// Node-side code that must route through the accessors.
const SCAN_FILES = [
  "commands/archive.js",
  "commands/gates.js",
  "commands/router.js",
  "scripts/pre-commit.js",
  "scripts/validate-config.js",
  "scripts/validate-governance.js",
  "scripts/migrate-openspec.js",
  "src/index.js",
  "dashboard/server.js",
  "mcp/server.js"
];

let failures = 0;

function check(name, actual, expected) {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name.padEnd(46)} actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`
  );
}

function checkTrue(name, condition, detail) {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` -> ${detail}` : ""}`);
}

// Comments are prose, and prose is allowed to quote the anti-pattern it warns about.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Keep "//" inside strings such as "https://" by requiring the previous char to be
    // anything but a colon.
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ---------- 1. No raw gate value outside the owner ----------
//
// Quoted, standalone a-r-p-r-o-v-e-d. Longer strings that happen to contain the word
// ("all gates already approved", "Gates approved") are prose and are not matched.
const APPROVED_LITERAL = /["']approved["']/;

for (const relative of SCAN_FILES) {
  const full = path.join(ROOT, relative);
  const name = `no raw "approved" literal: ${relative}`;

  if (!fs.existsSync(full)) {
    checkTrue(name, false, "file not found");
    continue;
  }

  const code = stripComments(fs.readFileSync(full, "utf8"));
  const lines = code.split(/\r?\n/);
  const offenders = [];

  lines.forEach((line, index) => {
    if (APPROVED_LITERAL.test(line)) {
      offenders.push(`${index + 1}: ${line.trim()}`);
    }
  });

  if (COMPARISON_ALLOWED[relative]) {
    checkTrue(
      `${name} (allowed: ${COMPARISON_ALLOWED[relative]})`,
      true,
      `${offenders.length} occurrence(s)`
    );
  } else {
    checkTrue(name, offenders.length === 0, offenders.join(" | ") || "none");
  }
}

// The UI renders status; it must never derive gate state from the state file.
const appJs = fs.readFileSync(path.join(ROOT, "dashboard", "app.js"), "utf8");
checkTrue(
  'dashboard/app.js does not read gate state itself',
  !/\.gates\s*\[/.test(stripComments(appJs)),
  /\.gates\s*\[/.test(stripComments(appJs)) ? "found .gates[ indexing" : "none"
);

// ---------- 2. The accessors behave as documented ----------

const gates = require(path.join(ROOT, "commands", "gates.js"));

const approvedVersion = { id: "v1", gates: { specification: "approved" } };
const pendingVersion = { id: "v1", gates: { specification: "pending" } };

check("gateStatusFor(null) defaults to pending", gates.gateStatusFor(null, "specification"), "pending");
check("gateStatusFor({}) defaults to pending", gates.gateStatusFor({}, "specification"), "pending");
check(
  "gateStatusFor reads a stored value",
  gates.gateStatusFor(approvedVersion, "specification"),
  "approved"
);
check(
  "gateStatusFor passes non-approved values through",
  gates.gateStatusFor({ gates: { specification: "rejected" } }, "specification"),
  "rejected"
);
check(
  "isGateApprovedFor true for approved",
  gates.isGateApprovedFor(approvedVersion, "specification"),
  true
);
check(
  "isGateApprovedFor false for pending",
  gates.isGateApprovedFor(pendingVersion, "specification"),
  false
);
check(
  "isGateApprovedFor false for an unrecorded gate",
  gates.isGateApprovedFor(approvedVersion, "planning"),
  false
);

check("allGatesApproved false when no gates recorded", gates.allGatesApproved({}), false);
check("allGatesApproved false for empty gates", gates.allGatesApproved({ gates: {} }), false);
check(
  "allGatesApproved false when one gate is outstanding",
  gates.allGatesApproved({
    gates: {
      specification: "approved",
      planning: "approved",
      implementation: "approved",
      review: "pending"
    }
  }),
  false
);
check(
  "allGatesApproved true when every recorded gate is approved",
  gates.allGatesApproved({
    gates: {
      specification: "approved",
      planning: "approved",
      implementation: "approved",
      review: "approved"
    }
  }),
  true
);

// The exact condition the CLI, the hook and the dashboard all delegate to. If this ever
// disagrees with itself, one of them is deciding something different.
for (const value of ["approved", "pending", "rejected", "in_progress"]) {
  const version = { gates: { review: value } };
  check(
    `isGateApprovedFor agrees with gateStatusFor ("${value}")`,
    gates.isGateApprovedFor(version, "review"),
    gates.gateStatusFor(version, "review") === "approved"
  );
}

// ---------- 3. The validator is importable and side-effect free ----------

let printed = "";
const originalLog = console.log;

console.log = (line) => {
  printed += `${String(line)}\n`;
};

let validator;

try {
  validator = require(path.join(ROOT, "scripts", "validate-governance.js"));
} finally {
  console.log = originalLog;
}

check("validator is silent when required", printed, "");
check("validator exports validateArtifacts", typeof validator.validateArtifacts, "function");
check("validator exports discoverFeatures", typeof validator.discoverFeatures, "function");

// ---------- 4. validateArtifacts returns verdicts, not console output ----------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-validate-"));
const schemaDir = path.join(tmp, ".sdrive", "schemas");
fs.mkdirSync(schemaDir, { recursive: true });

fs.writeFileSync(
  path.join(schemaDir, "config.schema.json"),
  JSON.stringify({
    type: "object",
    required: ["projectName"],
    properties: { projectName: { type: "string" } },
    additionalProperties: true
  })
);

let emitted = "";
const log = (line) => {
  emitted += `${String(line)}\n`;
};

// Missing document: skipped, not failed.
const empty = validator.validateArtifacts(tmp, { only: ["config"], log });
check("missing config is not a failure", empty.ok, true);
check("missing config is reported as skipped", empty.results[0].status, "skipped");
check("missing config names the file", empty.results[0].file, "config.json");

// Invalid document: failed, with a machine-readable entry.
fs.writeFileSync(path.join(tmp, ".sdrive", "config.json"), JSON.stringify({}));
const invalid = validator.validateArtifacts(tmp, { only: ["config"], log });
check("invalid config fails", invalid.ok, false);
check("invalid config status", invalid.results[0].status, "invalid");
checkTrue("invalid config carries Ajv errors", invalid.results[0].errors.length > 0);
checkTrue(
  "invalid config is described in the log",
  emitted.includes("config.json is INVALID"),
  emitted.trim().split(/\r?\n/).pop()
);

// Valid document: passes.
fs.writeFileSync(path.join(tmp, ".sdrive", "config.json"), JSON.stringify({ projectName: "demo" }));
const valid = validator.validateArtifacts(tmp, { only: ["config"], log });
check("valid config passes", valid.ok, true);
check("valid config status", valid.results[0].status, "valid");

fs.rmSync(tmp, { recursive: true, force: true });

// ---------- Summary ----------

console.log("");
if (failures > 0) {
  console.log(`❌ ${failures} check(s) failed.`);
  process.exit(1);
}

console.log("✅ All gate invariant checks passed.");
