// Stable process exit codes.
//
// Scripts and CI depend on these; do not renumber them. A command that cannot
// distinguish "not set up" from "gate blocked" forces callers to parse prose.
const EXIT = Object.freeze({
  OK: 0,
  ERROR: 1,
  NOT_INITIALIZED: 2,
  GATE_BLOCKED: 3,
  VALIDATION: 4,
  PERMISSION: 5,
  USAGE: 6,
  DRIFT: 7,
  TEST_FAILED: 8,
  DOCTOR: 9
});

module.exports = { EXIT };
