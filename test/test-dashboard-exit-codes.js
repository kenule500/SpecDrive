#!/usr/bin/env node
/*
 * Guards the Ctrl+C detection used by runDashboardForeground() in src/index.js.
 *
 * Why this exists: the dashboard is a server, so it runs until stopped. Ctrl+C is
 * the normal way to stop it and must not be reported as "failed to start". Each
 * platform reports it differently, and the Windows form is easy to get wrong:
 * shells hand back the code SIGNED (-1073741510) while Node's execSync hands it
 * back UNSIGNED (3221225786). Checking only one spelling produces a false error
 * message on Windows - which is exactly the bug this test was written after.
 *
 * The `detectedAsStop` helper below mirrors the condition in
 * runDashboardForeground. It is duplicated because the function is not exported
 * from the CLI, so keep the two in step if either changes.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CTRL_C_STATUS = 0xc000013a;
function detectedAsStop(error) {
  return Boolean(
    error.signal ||
      error.status === 130 ||
      (error.status >>> 0) === CTRL_C_STATUS ||
      error.status === null
  );
}

let failures = 0;
function check(name, actual, expected) {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name.padEnd(34)} actual=${String(actual).padEnd(6)} expected=${expected}`
  );
}

// The predicate must accept BOTH spellings of the Windows Ctrl+C code, the POSIX
// forms, and must reject genuine crashes.
for (const [name, error, expected] of [
  ["predicate: windows unsigned", { status: 3221225786 }, true],
  ["predicate: windows signed", { status: -1073741510 }, true],
  ["predicate: posix 130", { status: 130 }, true],
  ["predicate: posix signal", { status: null, signal: "SIGINT" }, true],
  ["predicate: crash 1", { status: 1 }, false],
  ["predicate: crash 2", { status: 2 }, false],
  ["predicate: crash 64", { status: 64 }, false]
]) {
  check(name, detectedAsStop(error), expected);
}

// Real subprocess runs, so the test also observes what execSync actually reports
// on this platform rather than assuming it.
function run(name, source, expected) {
  const script = path.join(os.tmpdir(), `sdrive-exitcode-${process.pid}-${name}.js`);
  fs.writeFileSync(script, source);
  let thrown = null;
  try {
    execSync(`node "${script}"`, { stdio: "ignore" });
  } catch (error) {
    thrown = error;
  } finally {
    fs.unlinkSync(script);
  }
  check(`subprocess: ${name}`, thrown ? detectedAsStop(thrown) : false, expected);
}

// The Windows Ctrl+C code only survives as a distinct value on Windows. On POSIX,
// process.exit(-1073741510) is truncated to an 8-bit status (0), so the shell cannot
// report the Windows signal. The predicate is still checked against both spellings
// above; this subprocess assertion is platform-specific.
run(
  "ctrl-c-windows",
  "process.exit(-1073741510);\n",
  process.platform === "win32"
);
run("ctrl-c-posix-130", "process.exit(130);\n", true);
run("crash-exit-1", "process.exit(1);\n", false);
run("crash-uncaught", "throw new Error('boom');\n", false);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall exit-code cases correct");
