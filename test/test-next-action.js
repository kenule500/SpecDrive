// Next-action notice.
//
//   node --test test/test-next-action.js
//
// A result answers "what happened". The reader still needs "what now, and where".
// Every command already knows the answer, so it prints it as the last thing the
// command says instead of leaving the reader to reconstruct it from the gates.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const nextAction = require("../src/lib/next-action");
const { initProject, runCli, cleanup } = require("./helpers/sandbox");

test("whereFor sends slash commands to the chat and sdrive commands to the terminal", () => {
  assert.strictEqual(nextAction.whereFor("/sdrive:apply checkout"), "chat");
  assert.strictEqual(nextAction.whereFor("sdrive validate"), "terminal");
  assert.strictEqual(nextAction.whereFor("sdrive approve checkout review"), "terminal");
});

test("whoFor names the hand: sign-offs and chat prompts are the human's, the rest the agent's", () => {
  assert.strictEqual(nextAction.whoFor("sdrive approve checkout review"), "human");
  assert.strictEqual(nextAction.whoFor("sdrive approve checkout"), "human");
  assert.strictEqual(nextAction.whoFor("/sdrive:apply checkout"), "human");
  assert.strictEqual(nextAction.whoFor("/sdrive:archive checkout"), "human");

  assert.strictEqual(nextAction.whoFor("sdrive test checkout"), "agent");
  assert.strictEqual(nextAction.whoFor("sdrive next checkout --write"), "agent");
  assert.strictEqual(nextAction.whoFor("sdrive check"), "agent");
});

test("whoFor does not mistake a longer command for approve", () => {
  assert.strictEqual(nextAction.whoFor("sdrive approve-docs checkout"), "agent");
  assert.strictEqual(nextAction.whoFor("sdrive approvals"), "agent");
});

test("notice states the command, where it runs, and who runs it", () => {
  assert.strictEqual(
    nextAction.notice("/sdrive:apply checkout"),
    "Next Action: /sdrive:apply checkout\n   where: on the chat (who: human - a sign-off)"
  );
  assert.strictEqual(
    nextAction.notice({ command: "sdrive validate", reason: "Fix the errors first." }),
    "Next Action: sdrive validate\n   where: on the terminal (who: agent - no sign-off)\n   why: Fix the errors first."
  );
});

test("a command with no explicit next falls back to sdrive next", () => {
  const resolved = nextAction.resolveNext({ command: "unknown-command" });

  assert.deepStrictEqual(resolved, {
    command: "sdrive next",
    where: "terminal",
    who: "agent",
    reason: null
  });
});

test("a passing test run names the approval that follows it", () => {
  const resolved = nextAction.resolveNext({
    command: "test",
    ok: true,
    data: { feature: "checkout" }
  });

  assert.strictEqual(resolved.command, "sdrive approve checkout review");
  assert.strictEqual(resolved.where, "terminal");
  assert.strictEqual(resolved.who, "human", "an approval is a sign-off, not agent work");
});

test("a result without a feature still yields a runnable command", () => {
  const resolved = nextAction.resolveNext({ command: "approve", ok: false, data: {} });

  assert.strictEqual(resolved.command, "sdrive next");
});

test("not-initialized failures tell the user to init, not to run next", () => {
  const resolved = nextAction.resolveFailure({ command: "validate", code: 2 });

  assert.strictEqual(resolved.command, "sdrive init");
});

test("sdrive next and sdrive status do not repeat the step they already printed", () => {
  assert.strictEqual(nextAction.resolveNext({ command: "next" }), null);
  assert.strictEqual(nextAction.resolveNext({ command: "status" }), null);
});

test("create ends with the slash command that writes the specification", () => {
  const root = initProject({ prefix: "sdrive-next-action-create-" });

  try {
    const result = runCli(["create", "checkout"], { cwd: root });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /Next Action: \/sdrive:propose checkout/);
    assert.match(result.stdout, /where: on the chat/);
  } finally {
    cleanup(root);
  }
});

test("validate ends with a terminal command", () => {
  const root = initProject({ prefix: "sdrive-next-action-validate-" });

  try {
    const result = runCli(["validate"], { cwd: root });

    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Next Action: sdrive next/);
    assert.match(result.stdout, /where: on the terminal/);
  } finally {
    cleanup(root);
  }
});

test("a failure still ends with a next action", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdrive-next-action-empty-"));

  try {
    const result = runCli(["validate"], { cwd: root });

    assert.strictEqual(result.status, 2, result.stderr);
    assert.match(result.stderr, /Next Action: sdrive init/);
    assert.match(result.stderr, /where: on the terminal/);
  } finally {
    cleanup(root);
  }
});

test("--json carries the same next action", () => {
  const root = initProject({ prefix: "sdrive-next-action-json-" });

  try {
    const result = runCli(["doctor", "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout);

    assert.ok(payload.next, "the JSON result must answer what comes next");
    assert.strictEqual(
      payload.next.command,
      payload.ok ? "sdrive check" : "sdrive doctor"
    );
    assert.strictEqual(payload.next.where, "terminal");
  } finally {
    cleanup(root);
  }
});

test("every agent prompt ends with the next-action contract", () => {
  const dir = path.resolve(__dirname, "..", "agents");
  const agents = fs.readdirSync(dir).filter((file) => file.endsWith(".md"));

  assert.ok(agents.length > 0);

  for (const file of agents) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");

    assert.match(text, /<!-- specdrive-next-action -->/, `${file} has no next-action contract`);
    assert.match(text, /Next Action: <command>/, `${file} does not show the notice shape`);
    assert.match(text, /where: on the <chat\|terminal>/, `${file} does not name the location`);
  }
});
