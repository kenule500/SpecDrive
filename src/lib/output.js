// Output policy for the CLI.
//
// Every command builds one structured result and then decides how to render it.
// JSON mode is not a second implementation: it is the same result object printed
// differently. That is what keeps `--json` honest as commands change.
const { EXIT } = require("./exit");

let jsonOverride = null;
let quiet = false;

function colorEnabled() {
  if (process.env.NO_COLOR || process.env.TERM === "dumb") return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

function setJson(value) {
  jsonOverride = value === undefined ? null : Boolean(value);
}

function setQuiet(value) {
  quiet = Boolean(value);
}

function isJson() {
  if (jsonOverride !== null) return jsonOverride;
  return process.env.SDRIVE_JSON === "1" || process.env.SDRIVE_JSON === "true";
}

function isQuiet() {
  return quiet;
}

function paint(code, text) {
  if (!colorEnabled()) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

function info(message) {
  if (!quiet) console.log(message);
}

function warn(message) {
  if (!quiet) console.error(message);
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

// Renders a command result and returns the exit code. Callers own process.exit().
function finish({
  command,
  ok,
  code = EXIT.OK,
  data = {},
  blockers = [],
  warnings = [],
  human = null,
  suppressAuto = false
}) {
  if (isJson()) {
    printJson({ ok, command, code, data, blockers, warnings });
    return code;
  }

  if (typeof human === "function") human({ ok, data, blockers, warnings });
  else if (human) info(String(human));

  // A human renderer that already prints blockers (the gate commands do) would
  // otherwise show every blocker twice.
  if (!suppressAuto) {
    warnings.forEach((warning) => warn(`⚠️  ${warning}`));
    if (!ok) blockers.forEach((blocker) => warn(`   • ${blocker}`));
  }

  return code;
}

// Failure helper for commands that have no richer result to render.
function fail(command, code, message, extra = {}) {
  if (isJson()) {
    printJson({ ok: false, command, code, error: message, ...extra });
  } else {
    console.error(message);
    (extra.blockers || []).forEach((blocker) => console.error(`   • ${blocker}`));
  }

  return code;
}

module.exports = {
  EXIT,
  setJson,
  setQuiet,
  isJson,
  isQuiet,
  info,
  warn,
  printJson,
  finish,
  fail,
  paint
};
