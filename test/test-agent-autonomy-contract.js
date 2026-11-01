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
