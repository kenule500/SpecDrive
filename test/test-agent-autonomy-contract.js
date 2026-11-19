// Agent autonomy contract.
//
//   node --test test/test-agent-autonomy-contract.js
//
// The complaint this pins: an agent finished its work and then handed the user a list of
// commands to type. Most of those are shell commands the agent already had a terminal
// for, so the handoff transferred work for no reason.
//
// The split is not a preference, it is what is possible:
//   cli    - a script; any agent can run it
//   slash  - a prompt the host loads; no agent can start another (every agent declares
//            `agents: []`), so it must come from the user
//   human  - a sign-off; `sdrive approve` is the governance act itself
//
// These assertions exist so the rule cannot silently erode back into a to-do list.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { initProject, runCli } = require("./helpers/sandbox");

const AGENTS = path.resolve(__dirname, "..", "agents");
const read = (name) => fs.readFileSync(path.join(AGENTS, name), "utf8");

test("apply runs verify and test itself instead of handing them back", () => {
  const apply = read("07-implementation.md");

  assert.match(apply, /Run the mechanical close-out yourself/);
  assert.match(apply, /sdrive verify <feature>/);
  assert.match(apply, /sdrive test <feature>/);
  assert.ok(
    !/Next: run `\/sdrive:test/.test(apply),
    "apply still hands the user a /sdrive:test command instead of running the cli steps"
  );
});

test("apply keeps the branch rules the branch-prompt contract already asserts", () => {
  // The autonomy rewrite must not quietly remove the guards pinned in
  // test-branch-prompt-contract.js.
  const apply = read("07-implementation.md");

  assert.match(apply, /feature\.base/);
  assert.match(apply, /Do not ask which branch to merge into/i);
  assert.ok(!/Another existing branch|Do not merge yet/i.test(apply));
});

test("apply must finish every in-scope task in one run, audited against tasks.json", () => {
  // The complaint this pins: apply implemented some tasks, ended the session, and
  // left the user to re-run it and point out the leftovers. "Continue until all
  // tasks complete" alone was ignorable prose; the exit must be a fresh recount
  // from disk, not the agent's impression of its own progress.
  const apply = read("07-implementation.md");

  assert.match(apply, /Single-Run Completion Rule/);
  assert.match(apply, /COMPLETION AUDIT \(MANDATORY/);
  assert.match(apply, /Re-read `tasks\.json` FRESH from disk/);
  assert.match(
    apply,
    /NEVER proceed to the security gate, verification, or FINALIZE with an in-scope task still open/
  );
  // An early exit is only legitimate with a blocker, and must name what is left.
  assert.match(apply, /name every remaining task by ID and count/);
});

test("every work-producing command finishes its whole work list in one run", () => {
  // The apply defect was not unique to apply: any command that owns a list of items
  // can declare "done" from its impression of progress instead of a fresh recount.
  // Each spec below pins one command to a Single-Run rule AND a compilable audit
  // that re-reads its source of truth from disk, so a partial run cannot pass as
  // complete prose.
  const specs = [
    {
      agent: "02-specification.md",
      audit: /PROPOSAL COVERAGE AUDIT \(MANDATORY/,
      source: /Re-read `spec\.json`, `tasks\.json`, and `traceability\.json` FRESH from disk/,
      loop: /go back and fill it \(add the missing ACs, tasks, links, or artifacts\)/,
      exit: /NEVER present GATE 2 or proceed to FINALIZE with a known gap/
    },
    {
      agent: "11-test.md",
      audit: /AC COVERAGE AUDIT \(MANDATORY/,
      source: /Re-read `spec\.json` and `traceability\.json` FRESH from disk/,
      loop: /go back to WRITE TESTS, add the missing test/,
      exit: /NEVER generate the coverage report claiming completion with a non-withdrawn AC uncovered/
    },
    {
      agent: "04-cascade.md",
      audit: /POST-SYNC CONSISTENCY AUDIT \(MANDATORY/,
      source: /FRESH from disk/,
      loop: /go back to EXECUTE CASCADING UPDATES and finish it/,
      exit: /NEVER report the sync complete with a known unpropagated item/
    },
    {
      agent: "13-update-propose.md",
      audit: /EXTENSION COVERAGE AUDIT \(MANDATORY/,
      source: /Re-read `spec\.json`, `tasks\.json`, and `traceability\.json` FRESH from disk/,
      loop: /append the missing ACs, tasks, or links/,
      exit: /existing IDs and rows are preserved exactly/i
    },
    {
      agent: "06-documentation.md",
      audit: /COVERAGE COMPLETION AUDIT \(MANDATORY/,
      source: /Re-scan the requested scope FRESH from disk/,
      loop: /go back to INLINE DOCUMENTATION, document the next one/,
      exit: /NEVER report the scope fully documented with an in-scope item still missing a docblock/
    },
    {
      agent: "08-performance.md",
      audit: /FINDINGS LEDGER AUDIT \(MANDATORY/,
      source: /FRESH from disk/,
      loop: /go back to OPTIMIZATION EXECUTION \/ VERIFICATION and finish it/,
      exit: /NEVER report completion with an approved fix unapplied or a finding silently dropped/
    },
    {
      agent: "10-security.md",
      audit: /FINDINGS LEDGER AUDIT \(MANDATORY/,
      source: /FRESH from disk/,
      loop: /go back to REMEDIATION & FIXING and finish it/,
      exit: /NEVER generate the report claiming completion with an approved fix unapplied, a finding unstatused, or a REQUIRED control unrowed/
    },
    {
      agent: "15-debug.md",
      audit: /DEFECT INVENTORY AUDIT \(MANDATORY/,
      source: /List every symptom the user reported/,
      loop: /go back to REPRODUCE for the next one and run the full workflow/,
      exit: /NEVER report completion with a reported symptom unaddressed/
    },
    {
      agent: "00-onboarding.md",
      audit: /DISPOSITION AUDIT \(MANDATORY/,
      source: /Every missing piece, every framework in `inventory\.detectedSystems\.frameworks`/,
      loop: /go back and ask the user \(fill \/ defer \/ migrate \/ skip\)/,
      exit: /NEVER mark onboarding complete with an inventory item silently unaddressed/
    },
    {
      agent: "05-discover-skills.md",
      audit: /EXECUTION AUDIT \(MANDATORY/,
      source: /Every approved action MUST end in a terminal state/,
      loop: /go back and finish it, then re-audit/,
      exit: /NEVER report the audit complete with an approved action silently dropped/
    },
    {
      agent: "16-worktree.md",
      audit: /PREPARATION AUDIT \(MANDATORY/,
      source: /re-run `node \.sdrive\/scripts\/worktree\.js list --json` FRESH/,
      loop: /go back to step 8 and create it, then re-audit/,
      exit: /Never report the run complete with a selected item silently unprepared/
    },
    {
      agent: "03-uiux.md",
      audit: /SCREEN COVERAGE AUDIT \(MANDATORY/,
      source: /Re-read the spec's user stories and `\.sdrive\/prototype\/screens\/` FRESH from disk/,
      loop: /go back to SCREEN DESIGN for the next one, then re-audit/,
      exit: /NEVER report the prototype complete with an in-scope screen unbuilt/
    },
    {
      agent: "12-product-plan.md",
      audit: /Persistence Audit \(MANDATORY\)/,
      source: /re-read `\.sdrive\/product\/` FRESH from disk/,
      loop: /If an approved file or item is missing, write it and re-audit/,
      exit: /every approved backlog item appears in `backlog\.md`/
    }
  ];

  for (const spec of specs) {
    const text = read(spec.agent);
    assert.match(text, /Single-Run Completion Rule/, `${spec.agent} has no Single-Run Completion Rule`);
    assert.match(text, spec.audit, `${spec.agent} has no mandatory audit heading`);
    assert.match(text, spec.source, `${spec.agent} audit does not re-read its source of truth from disk`);
    assert.match(text, spec.loop, `${spec.agent} audit has no loop-back path`);
    assert.match(text, spec.exit, `${spec.agent} audit does not block an incomplete wrap-up`);
  }
});

test("the phases that end a run record the handoff on disk", () => {
  for (const agent of ["07-implementation.md", "09-review-complete.md", "11-test.md"]) {
    assert.match(
      read(agent),
      /sdrive next <feature> --write/,
      `${agent} does not record .sdrive/handoff.json, so the next step dies with the session`
    );
  }
});

test("the constitution states the rule as a governance control", () => {
  const constitution = read("01-constitution.md");

  assert.match(constitution, /CON-715/);
  assert.match(constitution, /run every deterministic step itself/i);
  // The exceptions must be named, or the rule reads as "automate everything".
  assert.match(constitution, /sdrive approve/);
  assert.match(constitution, /\/sdrive:\*/);
});

test("sdrive next separates what an agent runs from what needs a person", () => {
  const root = initProject({ prefix: "sdrive-next-" });

  // A feature sitting at the implementation gate: verify and test are scripts, the
  // approval is not.
  fs.writeFileSync(
    path.join(root, ".sdrive", "workflow-state.json"),
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        features: [
          {
            name: "checkout",
            currentVersion: "v1",
            branch: "feature/checkout",
            base: "main",
            versions: [
              {
                id: "v1",
                phase: "ongoing",
                currentStep: "implementation",
                gates: {
                  specification: "approved",
                  planning: "approved",
                  implementation: "pending",
                  review: "pending"
                },
                history: []
              }
            ]
          }
        ]
      },
      null,
      2
    )}\n`
  );

  const result = runCli(["next", "checkout", "--json"], { cwd: root });
  const payload = JSON.parse(result.stdout);

  assert.strictEqual(result.status, 0, result.stderr);
  const steps = payload.data.plan[0].steps;

  assert.deepStrictEqual(
    steps.map((step) => step.kind),
    ["cli", "cli", "human"],
    `unexpected step kinds: ${JSON.stringify(steps)}`
  );

  assert.match(steps[0].command, /^sdrive verify checkout$/);
  assert.match(steps[1].command, /^sdrive test checkout$/);
  assert.match(steps[2].command, /^sdrive approve checkout implementation$/);
  assert.ok(
    steps.every((step) => typeof step.why === "string" && step.why.length > 10),
    "every step must say why it is next"
  );
});

test("sdrive next marks a slash command as something only the user can start", () => {
  const root = initProject({ prefix: "sdrive-next-slash-" });

  fs.writeFileSync(
    path.join(root, ".sdrive", "workflow-state.json"),
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        features: [
          {
            name: "fresh",
            currentVersion: "v1",
            versions: [
              {
                id: "v1",
                phase: "backlog",
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
      },
      null,
      2
    )}\n`
  );

  const result = runCli(["next", "fresh", "--json"], { cwd: root });
  const steps = JSON.parse(result.stdout).data.plan[0].steps;

  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(steps[0].kind, "slash");
  assert.match(steps[0].command, /^\/sdrive:propose fresh$/);
  assert.strictEqual(steps[1].kind, "human");
});
