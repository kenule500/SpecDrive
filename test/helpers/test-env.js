// Test-process setup. Child processes inherit this environment.
//
// Tests build throwaway projects that have no governed team roster. The CLI's
// permission layer is deliberately fail-closed for real projects, so the test
// harness opts out explicitly. Production code must never set this flag.
process.env.SDRIVE_SKIP_PERMISSIONS = "1";
process.env.SDRIVE_NO_DASHBOARD = "1";
process.env.NO_COLOR = "1";
process.env.SDRIVE_ACTOR = process.env.SDRIVE_ACTOR || "test-admin";
