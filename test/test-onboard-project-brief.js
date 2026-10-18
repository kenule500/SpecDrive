#!/usr/bin/env node
/*
 * Guards the project-brief extraction in scripts/onboard.js.
 *
 * Why this exists: the brief is written to product/overview.md, which the
 * dashboard parses to fill the Overview page. Two things must stay true:
 *
 *   1. It is DERIVED, and the file says so. The page must never be able to report
 *      a README-derived draft as an approved product plan.
 *   2. It NEVER overwrites an existing product/overview.md, because that file is
 *      the user's own work and /sdrive:product-plan merges into it.
 *
 * The parser is text-matching over whatever a README happens to contain, which is
 * exactly the kind of code that rots quietly, so each case below is a real shape.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ONBOARD = path.join(__dirname, "..", "scripts", "onboard.js");

let failures = 0;
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name.padEnd(46)} ${pass ? "" : `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`
  );
}

let counter = 0;
function makeProject(files) {
  const dir = path.join(os.tmpdir(), `sdrive-brief-${process.pid}-${counter++}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

function scan(dir) {
  // This test never reads the child's output, and piped stdio is refused outright
  // by some sandboxes (EPERM on the pipe) - which looked like "onboarding wrote
  // nothing" rather than "the child never started". Silence it and say so if the
  // spawn itself failed.
  const result = spawnSync(process.execPath, [ONBOARD], { cwd: dir, encoding: "utf8", stdio: "ignore" });

  if (result.error) {
    console.error(`onboard.js could not start: ${result.error.code} ${result.error.message}`);
    process.exit(2);
  }

  const inventoryPath = path.join(dir, ".sdrive", "onboarding", "inventory.json");
  const inventory = fs.existsSync(inventoryPath)
    ? JSON.parse(fs.readFileSync(inventoryPath, "utf8"))
    : null;
  const overviewPath = path.join(dir, ".sdrive", "product", "overview.md");
  const overview = fs.existsSync(overviewPath) ? fs.readFileSync(overviewPath, "utf8") : null;
  return { inventory, overview };
}

const PACKAGE_JSON = JSON.stringify({
  name: "taskflow",
  packageManager: "pnpm@9.1.0",
  dependencies: { next: "14.0.0", mongoose: "8.0.0" },
  devDependencies: { vitest: "2.0.0" }
});

// ---------- 1. A README that explains the product ----------
{
  const dir = makeProject({
    "package.json": PACKAGE_JSON,
    "README.md": [
      "# TaskFlow",
      "",
      "TaskFlow is a team task tracker that turns standup notes into a shared board, so",
      "a distributed team can see what moved without anybody writing a status update.",
      "",
      "[![build](https://img.shields.io/badge/build-passing-green)](https://example.com)",
      "",
      "## Features",
      "",
      "- Boards that update from commit messages",
      "- Daily digest email",
      "",
      "## Target Users",
      "",
      "- Engineering managers",
      ""
    ].join("\n")
  });

  const { inventory, overview } = scan(dir);
  const brief = inventory.projectBrief;

  check("readme: derivedFrom", brief.derivedFrom, "readme");
  check("readme: readmePath recorded", brief.readmePath, "README.md");
  check("readme: title", brief.title, "TaskFlow");
  // The paragraph wraps in the source, so a naive first-line pick would truncate it.
  check(
    "readme: wrapped paragraph rejoined",
    brief.description,
    "TaskFlow is a team task tracker that turns standup notes into a shared board, so a distributed team can see what moved without anybody writing a status update."
  );
  check("readme: goals", brief.goals.length, 2);
  check("readme: target users", brief.targetUsers, ["Engineering managers"]);
  check("readme: tech stack from manifests", brief.architecture.includes("Next.js"), true);

  // The dashboard cannot report this as approved: it keys off the word "draft".
  check("readme: status is marked draft", /^Status: Draft /m.test(overview), true);
  check("readme: says it is not a product plan", overview.includes("not a product plan"), true);
  check("readme: names its source", overview.includes("README.md"), true);
  // findSection() takes the FIRST heading containing a needle, so "goals" must not
  // resolve to "non-goals" - that only holds if Goals comes first.
  check(
    "readme: Goals heading precedes any non-goals heading",
    overview.indexOf("## Goals") < (overview.indexOf("Non-Goals") === -1 ? Infinity : overview.indexOf("Non-Goals")),
    true
  );
  // The page must never claim a draft was confirmed.
  check("readme: does not claim confirmation", /product plan approved/i.test(overview), false);
}

// ---------- 2. A README carrying only badges says nothing ----------
{
  const dir = makeProject({
    "package.json": PACKAGE_JSON,
    "README.md": "# MyApp\n\n[![build](https://img.shields.io/badge/x-y-z)](https://e.com)\n"
  });

  const { inventory } = scan(dir);
  check("badges-only readme: falls back to code scan", inventory.projectBrief.derivedFrom, "code-scan");
  check("badges-only readme: keeps the readme name", inventory.projectBrief.readmePath, "README.md");
}

// ---------- 3. No README at all ----------
{
  const dir = makeProject({ "package.json": PACKAGE_JSON });

  const { inventory, overview } = scan(dir);
  check("no readme: falls back to code scan", inventory.projectBrief.derivedFrom, "code-scan");
  check("no readme: title from manifest", inventory.projectBrief.title, "taskflow");
  check("no readme: tech stack found", inventory.projectBrief.architecture.includes("Mongoose"), true);
  check("no readme: status names the code scan", /^Status: Draft \(derived from the code scan\)$/m.test(overview), true);
}

// ---------- 4. Nothing to say ----------
{
  const dir = makeProject({ "notes.txt": "not a project\n" });

  const { inventory, overview } = scan(dir);
  check("empty project: derivedFrom none", inventory.projectBrief.derivedFrom, "none");
  // An empty brief must not be written, or the page would show a heading and nothing else.
  check("empty project: no overview.md written", overview, null);
}

// ---------- 5. An existing product plan is never touched ----------
{
  const dir = makeProject({
    "package.json": PACKAGE_JSON,
    "README.md": "# TaskFlow\n\nTaskFlow is a team task tracker that turns standup notes into a shared board.\n",
    ".sdrive/product/overview.md": "# Real Plan\n\nStatus: Approved\n\n## Goals\n\n- The goal the team actually agreed.\n"
  });

  const { overview } = scan(dir);
  check("existing plan: not overwritten", overview.includes("Real Plan"), true);
  check("existing plan: content preserved", overview.includes("The goal the team actually agreed."), true);
  check("existing plan: draft not injected", overview.includes("This is a draft"), false);
}

// ---------- 6. A README with a users section and no features section ----------
{
  const dir = makeProject({
    "package.json": PACKAGE_JSON,
    "README.md": [
      "# Solo",
      "",
      "Solo is a time tracker for freelancers who bill by the hour.",
      "",
      "## Audience",
      "",
      "- Freelance designers",
      ""
    ].join("\n")
  });

  const { inventory, overview } = scan(dir);
  check("users-only readme: goals empty", inventory.projectBrief.goals.length, 0);
  check("users-only readme: users found", inventory.projectBrief.targetUsers, ["Freelance designers"]);
  // Open questions must not ask for what the brief already contains.
  check("users-only readme: does not ask who the users are", overview.includes("Who are the target users?"), false);
  check("users-only readme: asks what the product is for", overview.includes("What is this product for"), true);
}

// ---------- 7. A scaffolded README must not become the product vision ----------
// The exact file create-next-app writes. It has prose, so the old first-paragraph
// rule happily turned "This is a Next.js project bootstrapped with create-next-app"
// into the project's vision - true of thousands of unrelated repositories.
{
  const dir = makeProject({
    "package.json": JSON.stringify({ name: "spott", dependencies: { next: "14.0.0" } }),
    "README.md": [
      "This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).",
      "",
      "## Getting Started",
      "",
      "First, run the development server:",
      "",
      "```bash",
      "npm run dev",
      "```",
      "",
      "Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.",
      "",
      "You can start editing the page by modifying `app/page.tsx`.",
      "",
      "## Learn More",
      "",
      "- [Next.js Documentation](https://nextjs.org/docs)",
      "",
      "## Deploy on Vercel",
      "",
      "The easiest way to deploy your Next.js app is to use the Vercel Platform.",
      ""
    ].join("\n")
  });

  const { inventory, overview } = scan(dir);
  const brief = inventory.projectBrief;

  check("template readme: detected", brief.readmeQuality, "template");
  check("template readme: flags the signal", brief.templateSignals.includes("create-next-app"), true);
  check("template readme: does not use the boilerplate as description", brief.description, "");
  check("template readme: falls back to the code scan", brief.derivedFrom, "code-scan");
  check("template readme: asks the agent for product input", brief.needsProductInput, true);
  check("template readme: records the quality in workflow state", inventory.projectBrief.needsProductInput, true);

  // The overview must say why it is empty, not silently claim a vision.
  check("template readme: status names the boilerplate", /Status: Draft .*template boilerplate/.test(overview), true);
  check("template readme: no Vision section", overview.includes("## Vision"), false);
  check("template readme: does not claim the boilerplate as the vision", /^This is a \[?Next\.js/m.test(overview), false);
  check("template readme: asks for the real product", overview.includes("What is this product, in one sentence?"), true);
}

// ---------- 8. A real README that happens to use Next.js is not boilerplate ----------
// Guards the detector against firing on the framework's name alone.
{
  const dir = makeProject({
    "package.json": JSON.stringify({ name: "spott", dependencies: { next: "14.0.0" } }),
    "README.md": [
      "# Spott",
      "",
      "Spott is an event booking platform where organizers publish events and guests",
      "reserve seats without creating an account.",
      "",
      "## Features",
      "",
      "- Event pages with seat maps",
      "- Invite-only events",
      "",
      "## Target Users",
      "",
      "- Independent event organizers",
      ""
    ].join("\n")
  });

  const { inventory, overview } = scan(dir);
  const brief = inventory.projectBrief;

  check("real next.js readme: stays usable", brief.readmeQuality, "usable");
  check("real next.js readme: keeps the vision", brief.description, "Spott is an event booking platform where organizers publish events and guests reserve seats without creating an account.");
  check("real next.js readme: no template signals", brief.templateSignals, []);
  check("real next.js readme: does not ask for product input", brief.needsProductInput, false);
  check("real next.js readme: writes a Vision section", overview.includes("## Vision"), true);
}

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all project-brief cases passed");
