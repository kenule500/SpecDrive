#!/usr/bin/env node
/*
 * Guards the branch-ownership contract in the agent prompts.
 *
 * `/sdrive:propose` is the only command allowed to ask which branch a feature
 * should merge into, because it must record that answer as `feature.base`
 * before the spec exists (CON-612). `/sdrive:apply` and `/sdrive:review` read
 * the recorded base; `/sdrive:archive` merges into it without offering a menu.
 *
 * This is a prose contract, so the regression test reads the prompt files.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const AGENTS = path.join(ROOT, "agents");
let failures = 0;

function read(name) {
  return fs.readFileSync(path.join(AGENTS, name), "utf8");
}

function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(58)} ${ok ? "" : detail}`);
}

const files = fs.readdirSync(AGENTS).filter((file) => file.endsWith(".md"));
const branchAskers = files.filter((file) =>
  /Which branch should[\s\S]{0,80}merge/i.test(read(file))
);

check(
  "only /sdrive:propose asks which branch to merge into",
  JSON.stringify(branchAskers) === JSON.stringify(["02-specification.md"]),
  `asked by ${JSON.stringify(branchAskers)}`
);

const apply = read("07-implementation.md");
check("apply reads feature.base", /feature\.base/.test(apply));
check(
  "apply has no merge-target menu",
  !/Another existing branch|Do not merge yet/i.test(apply)
);
check(
  "apply explicitly forbids re-asking",
  /Do not ask which branch to merge into/i.test(apply)
);

const review = read("09-review-complete.md");
check(
  "review does not assign branch creation to apply",
  !/Branch creation belongs to `\/sdrive:apply`/.test(review)
);
check(
  "review routes a missing base back to propose",
  /If it is missing, STOP and tell the user to run `\/sdrive:propose/.test(review)
);

const archive = read("14-archive.md");
check(
  "archive merges the recorded feature.base",
  /destination is `feature\.base`/.test(archive)
);
check(
  "archive never offers a branch menu",
  /NEVER offer a menu of branches/i.test(archive)
);

const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
check(
  "README says archive merges into feature.base",
  /archive.*merges into `feature\.base`/i.test(readme)
);

if (failures > 0) {
  console.error(`\n${failures} branch-prompt contract check(s) failed.`);
  process.exitCode = 1;
}
