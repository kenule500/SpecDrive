// The last line of every command.
//
// A result answers "what happened". It does not answer "what now", which is the
// question the reader actually has. The command already knows the answer, so it
// prints it here instead of leaving the reader to reconstruct it from the gates.
//
//   chat     - a /sdrive:* prompt. Only the host can load one; no agent may start
//              another, so the user sends it from the chat.
//   terminal - a `sdrive ...` command. An agent with a shell runs it itself; the
//              user only sees it when no agent is in the loop (CON-715).
const { EXIT } = require("./exit");

const CHAT = "chat";
const TERMINAL = "terminal";

function whereFor(command) {
  return /^\/sdrive:/.test(String(command || "")) ? CHAT : TERMINAL;
}

function normalize(next) {
  if (!next) {
    return null;
  }

  if (typeof next === "string") {
    return { command: next, where: whereFor(next), reason: null };
  }

  if (!next.command) {
    return null;
  }

  return {
    command: String(next.command),
    where: next.where || whereFor(next.command),
    reason: next.reason || null
  };
}

function featureOf(data) {
  return data && data.feature ? String(data.feature) : null;
}

// The command that follows from this outcome when the command itself did not
// name one. A missing feature falls back to `sdrive next`, which can find it.
function followOn(prefix, data, suffix) {
  const feature = featureOf(data);
  if (!feature) {
    return "sdrive next";
  }

  return `${prefix} ${feature}${suffix ? ` ${suffix}` : ""}`;
}

const DEFAULT_NEXT = {
  update: "sdrive status",
  "mcp:list": "sdrive mcp:sync",
  "mcp:sync": "sdrive check",
  "config:validate": "sdrive check",
  validate: "sdrive next",
  verify: ({ ok, data }) =>
    ok ? followOn("sdrive test", data) : followOn("sdrive next", data),
  assign: ({ data }) => followOn("sdrive next", data),
  approve: ({ data }) => followOn("sdrive next", data),
  "archive:check": ({ ok, data }) =>
    ok ? followOn("/sdrive:archive", data) : followOn("sdrive next", data),
  "archive:finalize": "sdrive status",
  "team:add": "sdrive team:list",
  "team:remove": "sdrive team:list",
  "team:update": "sdrive team:list",
  doctor: ({ ok }) => (ok ? "sdrive check" : "sdrive doctor"),
  test: ({ ok, data }) =>
    ok ? followOn("sdrive approve", data, "review") : followOn("sdrive next", data),
  check: ({ ok }) => (ok ? "sdrive next" : "sdrive check"),
  "permissions:check": "sdrive check",
  "audit:verify": "sdrive check",
  "config:set": "sdrive config:validate",
  "knowledge:fetch": "sdrive next",
  "migrate:detect": "sdrive migrate:plan",
  "migrate:plan": "sdrive migrate:apply",
  "migrate:verify": ({ ok }) => (ok ? "sdrive status" : "sdrive migrate:rollback"),
  "migrate:rollback": "sdrive status",
  "group:resolve": ({ data }) => followOn("sdrive next", data),
  // These already end with the step; a second notice would only repeat it.
  next: null,
  status: null
};

function resolveNext({ command, next, ok = true, code = EXIT.OK, data = {}, blockers = [] }) {
  if (next !== undefined && next !== null) {
    return normalize(next);
  }

  if (Object.prototype.hasOwnProperty.call(DEFAULT_NEXT, command)) {
    const entry = DEFAULT_NEXT[command];

    if (entry === null) {
      return null;
    }

    const value =
      typeof entry === "function"
        ? entry({ command, ok, code, data: data || {}, blockers: blockers || [] })
        : entry;

    return normalize(value);
  }

  return normalize("sdrive next");
}

// A failure that means "nothing is installed yet" has one honest next step.
function resolveFailure({ command, code, next }) {
  if (next !== undefined && next !== null) {
    return normalize(next);
  }

  if (code === EXIT.NOT_INITIALIZED) {
    return normalize("sdrive init");
  }

  if (command === "next" || command === "status") {
    return normalize("sdrive status");
  }

  return resolveNext({ command, ok: false, code });
}

function notice(next) {
  const action = normalize(next);

  if (!action) {
    return null;
  }

  const lines = [`Next Action: ${action.command}`];
  lines.push(`   where: on the ${action.where === CHAT ? "chat" : "terminal"}`);

  if (action.reason) {
    lines.push(`   why: ${action.reason}`);
  }

  return lines.join("\n");
}

function print(next, { stream = "stdout" } = {}) {
  const rendered = notice(next);

  if (rendered) {
    const write = stream === "stderr" ? console.error : console.log;
    write(`\n${rendered}\n`);
  }

  return rendered;
}

module.exports = {
  CHAT,
  TERMINAL,
  whereFor,
  normalize,
  resolveNext,
  resolveFailure,
  notice,
  print
};
