<p align="center">
  <img src="logo.png" alt="SpecDrive" width="120" />
</p>

# SpecDrive

**Enterprise Spec-Driven Development for AI Coding Tools**

SpecDrive gives AI coding tools like GitHub Copilot, Cline, Claude Code, and Cursor a deterministic governance layer for spec-driven development.

It adds:

- 17 specialized governance agents
- **30 AI tool adapters** — Claude Code, Cursor, Copilot, Gemini CLI, Roo Code, Qwen Code, Warp, Zed, Aider, Kiro, Junie and more, each written in the format that tool actually reads
- **Native slash commands** — 16 real `/sdrive:*` commands in Claude Code, Gemini CLI, Roo Code and OpenCode, instead of one prompt that has to route itself
- **Any tool, without a release** — `sdrive adapters:add` registers a tool SpecDrive does not ship; `AGENTS.md` covers the tools that follow the cross-tool standard
- Machine-readable JSON schemas
- Requirement → AC → task → test traceability
- Per-version lifecycle tracking
- Human approval gates
- **Evidence-backed review gates** — `sdrive test` records the command, exit code, counts, commit, and output hash, and review refuses without a passing run
- Anti-redundancy checks
- Spec-to-code verification
- **A machine-readable CLI** — `--json`, stable exit codes `0`–`9`, and `sdrive doctor` for diagnosing a broken install
- Atomic, locked state writes and a hash-chained audit log
- Brownfield onboarding for existing projects, including detecting a scaffolded README that describes the framework instead of the product
- OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, and generic spec-folder migration
- Anti-hallucination controls
- CI/CD integration, including `sdrive check`

See [CHANGELOG.md](CHANGELOG.md) for what changed in the current release.

---

## Table of Contents

- [Why SpecDrive](#why-specdrive)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Where to Run Commands](#where-to-run-commands)
- [Lifecycle](#lifecycle)
- [Web Dashboard](#web-dashboard)
- [Onboarding an Existing Project](#onboarding-an-existing-project)
- [Migrating from another spec-driven framework](#migrating-from-another-spec-driven-framework)
- [Core Workflow](#core-workflow)
- [Batch Mode: the `--all` Flag](#batch-mode-the---all-flag)
- [Optional Commands](#optional-commands)
- [Terminal Commands](#terminal-commands)
- [Agents](#agents)
- [Templates](#templates)
- [Versions](#versions)
- [Feature Lifecycle](#feature-lifecycle)
- [Directory Structure](#directory-structure)
- [Validation](#validation)
  - [Doctor](#doctor)
  - [Test evidence](#test-evidence)
  - [Exit codes](#exit-codes)
- [Spec-to-Code Verification](#spec-to-code-verification)
- [CI/CD Integration](#cicd-integration)
- [MCP Server](#mcp-server)
- [Tool Support](#tool-support)
- [Team Collaboration](#team-collaboration)
- [Permissions](#permissions)
- [Contributing](#contributing)
- [License](#license)

---

## Why SpecDrive

OpenSpec and Spec-Kit are great, but they lack strict governance controls.

SpecDrive adds:

- Strict JSON Schema validation
- Complete requirement-to-test traceability
- **Evidence-backed review gates** — `sdrive test` records the command, exit code, counts, commit, and output hash; a hand-written `Status: PASS` is not enough
- Human approval at every critical phase
- Anti-redundancy engine
- Deterministic governance validator
- Spec-to-code verification
- Per-version lifecycle tracking
- Brownfield onboarding without breaking existing code
- OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, and generic spec-folder migration
- A machine-readable CLI (`--json`, stable exit codes) and `sdrive doctor`

This makes AI-generated specs and code safe for enterprise use.

---

## Prerequisites

- Node.js 18 or later
- npm 9 or later
- Git
- An AI coding tool that supports custom commands or instructions

---

## Installation

Install the CLI **globally** so the `sdrive` command is available everywhere.

### npm

```bash
npm install -g specdrive-cli@latest
```

### pnpm

```bash
pnpm add -g specdrive-cli@latest
```

### Yarn

```bash
yarn global add specdrive-cli@latest
```

### Bun

Bun installs the CLI but still needs Node.js on your machine to run it:

```bash
bun add -g specdrive-cli@latest
```

### Deno

Deno can run the CLI directly from npm without a global install:

```bash
deno run -A npm:specdrive-cli@latest --version
```

### Verify Install

```bash
sdrive --version
```

If that prints a version number, you're set.

### Initialize a Project

Inside your project root, run:

```bash
sdrive init
```

SpecDrive will ask you to:

1. Select which AI tools you use

MCP wiring is applied automatically for the tools you pick — no second prompt.

It then creates the `.sdrive/` folder, tool adapters, and MCP server.

It also adds the current Git user (`git config user.name`) to `.sdrive/team.json`
as `admin`, so the first governed command works without a separate bootstrap
step. If Git is not configured, run:

```bash
sdrive team:add <your-git-username> admin
```

The first member must be the acting Git user; this prevents a typo from creating
a roster that locks the person who added it out of every mutating command.

### Non-Interactive Setup

For CI, scripts, or agent-driven setup, pass `--tools` to skip the prompt:

```bash
sdrive init --tools github-copilot
sdrive init --tools github-copilot,cursor,cline
sdrive init --tools all
sdrive init --tools none
```

### Local Install (Not Recommended)

A local install puts the binary in `node_modules/.bin`, which is **not on your PATH**,
so bare `sdrive` will not work. If you must install locally, invoke it through your
package manager:

| Install method | How to invoke |
|----------------|---------------|
| `npm install specdrive-cli` | `npx sdrive init` |
| `pnpm add specdrive-cli` | `pnpm exec sdrive init` |
| `yarn add specdrive-cli` | `yarn sdrive init` |
| `bun add specdrive-cli` | `bunx sdrive init` |

For the simplest experience, use a global install.

---

## Updating SpecDrive

When you upgrade the CLI, your existing project keeps the framework files it was
initialized with. To pull in the latest dashboard, MCP server, scripts, schemas,
and gate rules, run:

```bash
sdrive update
```

This refreshes **framework-owned** files only:

| Refreshed | Left untouched |
|-----------|----------------|
| `.sdrive/dashboard/` | `.sdrive/specs/` |
| `.sdrive/mcp/` | `.sdrive/governance/` |
| `.sdrive/scripts/` | `.sdrive/constitution.md` |
| `.sdrive/migrations/` | `.sdrive/config.json` |
| `.sdrive/schemas/` | `.sdrive/config.json` |
| `.sdrive/agents/` | `.sdrive/team.json` |
| `.sdrive/templates/` | `.sdrive/workflow-state.json` |
| `.sdrive/commands/*.js` | |
| `.sdrive/framework-manifest.json` | |
| `.sdrive/logo.png` | |

Preview changes first with a dry run:

```bash
sdrive update --dry-run
```

Check for drift without writing anything:

```bash
sdrive update --check
```

`update` also merges **new tool definitions** into `.sdrive/commands/tools.json`:
tools that shipped after your `init` are appended, entries you added or edited are
preserved, and a registry still in the old single-`adapterPath` shape is repaired
in place. After upgrading, check the result:

```bash
sdrive adapters:verify     # paths, formats, frontmatter, duplicates
sdrive adapters:list       # every tool, in one table
sdrive doctor              # layout, schemas, team, permissions, evidence
```

### Upgrading an existing project

Two hard gates were added. Both **refuse rather than warn**, so a project that already exists can hit them unexpectedly after an upgrade:

**1. `sdrive approve <feature> review` now requires real coverage.** It used to accept a `review.md` containing `Status: PASS`. It now reads `traceability.json` and refuses if any acceptance criterion has no passing test:

```text
Cannot approve review:
  - 19 of 20 acceptance criteria have no passing test (AC-002, AC-003, ...) - run `/sdrive:test <feature>` first
```

*Fix:* run `/sdrive:test <feature>` so every AC in `spec.json` has a linked test with `status: complete`, then approve again.

**2. `sdrive archive:finalize` no longer promotes gates.** Archiving used to write all four gates to `approved` itself, which manufactured approvals nobody gave. It now refuses unless all four gates are **already** approved, and it re-checks that the evidence behind each approval is unchanged:

```text
Cannot archive:
  - Gate not approved: implementation
  - Evidence changed since approval: traceability
```

*Fix:* approve the gates that are genuinely outstanding, or investigate the evidence change. There is no bypass — this is the guarantee that a lifecycle can only ever close on approvals that already exist.

**3. New projects require test evidence by default.** `sdrive init` writes
`governance.requireTestEvidence: true`, so `sdrive approve <feature> review`
refuses unless `sdrive test <feature>` recorded a zero-exit run with no failures
at `HEAD`. Existing projects keep the old behaviour until they opt in:

```bash
sdrive config:set governance.requireTestEvidence true
```

**4. New projects require a structured review by default.** `sdrive init` writes
`governance.requireStructuredReview: true`, so `sdrive approve <feature> review`
requires `review.json` with `status: PASS`, a commit matching `HEAD`, and a
reviewer record. Existing projects keep the prose-only behaviour until they opt
in:

```bash
sdrive config:set governance.requireStructuredReview true
```

Run `sdrive doctor` after upgrading. It reports anything the upgrade could not
repair on its own.

`sdrive update` refreshes `.sdrive/agents/`, `.sdrive/dashboard/`, and the
`.sdrive/commands/*.js` rules, so both the agent-side instructions and the
code-level refusals that back them arrive together.

#### Projects that declare `"type": "module"`

If your `package.json` declares `"type": "module"` — common with Vite, Bun, and ESM Next.js setups — versions before 0.1.35 could not start the dashboard:

```text
ReferenceError: require is not defined in ES module scope, you can use import instead
```

Node decides CommonJS vs ESM **per file**, by walking up from that file to the nearest `package.json`. Every file SpecDrive ships under `.sdrive/` is CommonJS, so your project's `"type": "module"` was applied to them as well. The dashboard failed first only because it is usually the first one you run: `.sdrive/mcp/server.js` and every script in `.sdrive/scripts/` were affected too.

**Fix:** run `sdrive update`. It writes `.sdrive/package.json` containing `{ "type": "commonjs" }`, which makes `.sdrive/` its own CommonJS scope and repairs every shipped file at once. Nothing is renamed and nothing else changes. `sdrive init` writes the same marker, so new projects are unaffected.

`npm pack` note for anyone auditing a release: a local tarball checksum can differ from CI's even when the contents are identical, because a Windows working tree may hold CRLF while the committed blobs are LF. Compare file contents after normalizing line endings rather than comparing tarball hashes.

---

## Where to Run Commands

| Command Type | Where to Run | Example |
|--------------|--------------|---------|
| Terminal command | In your terminal / shell | `sdrive init` |
| Slash command | In your AI tool's chat | `/sdrive:propose "User login"` |

**Rule:** If it starts with `sdrive`, run it in the terminal. If it starts with `/sdrive:`, run it in your AI chat.

---

## Lifecycle

SpecDrive has **two entry points** and **one iteration lifecycle** after them. Everything else is optional.

### Step 0 — Install and initialise (both paths)

```bash
npm install -g specdrive-cli@latest
sdrive init
```

`sdrive init` creates `.sdrive/`, wires your AI tools, adds your Git user as the
first admin, and starts the dashboard in the same terminal — press `Ctrl+C` when
you are done to get your prompt back.

Then confirm the setup:

```bash
sdrive doctor
```

### Greenfield — a brand-new project

Use this when you are starting from an empty folder, or a fresh scaffold with no plan in place yet.

```text
/sdrive:constitution
/sdrive:product-plan
/sdrive:worktree        # optional: prepare ready backlog items in parallel worktrees
```

`/sdrive:product-plan` is **optional**. Run it when you have an idea but no written plan, or an empty repo. If you already know what you are building, go straight from the constitution to `/sdrive:propose`.

Product Plan asks whether you already have a prototype or visual references — Figma, Framer, Penpot, Sketch, Adobe XD, Dribbble, Behance, Mobbin, screenshots, or a similar product — and records them as high-level guidance. It does not copy protected layouts or turn a reference into a working prototype.

### Brownfield — an existing codebase

Use this when the code already exists and development is well past the early stages.

```text
/sdrive:onboard
/sdrive:constitution
```

`/sdrive:onboard` inventories what is there and never overwrites or deletes anything. If it detects OpenSpec or Spec Kit in the repo, it can bring those specs across and leaves the originals in place.

### The iteration lifecycle (both paths)

Once setup is done, every feature follows the same five steps. The name in quotes is the feature; run any of them without a name and SpecDrive asks whether you mean **all ongoing features** or one from a detected list.

```text
/sdrive:propose "<feature>"    # spec, plan, tasks, traceability
/sdrive:apply "<feature>"      # implementation
/sdrive:test "<feature>"       # write and run the tests
/sdrive:review "<feature>"     # audit, then sign the review gate
/sdrive:archive "<feature>"    # merge to the integration branch, close the version
```

### Optional commands

These are not part of the core workflow. Run them when the need arises.

| Command | When to use it |
|---------|----------------|
| `/sdrive:update-propose "<feature>" <change>` | When a feature proposal needs changes before the feature is archived |
| `/sdrive:sync "<feature>"` | After a migration, or whenever the spec and the code drift apart |
| `/sdrive:debug "<feature>"` | When something is visibly wrong — a broken layout, a failing endpoint, a console error |
| `/sdrive:docs "<feature>"` | When you want documentation that matches the code |
| `/sdrive:performance "<feature>"` | When performance or SEO matters — before a release or after a slowdown |
| `/sdrive:secure "<feature>"` | Before shipping anything that touches auth, data, or payments |
| `/sdrive:worktree` | After `/sdrive:product-plan`, when you want to start several ready backlog items in parallel |

### After a feature is archived

Archiving closes the version and deletes the feature branch. Archived versions are immutable — there is no reopen or amend path. To go further:

| Situation | Command |
|-----------|---------|
| The scope genuinely changed | `sdrive version:new "<feature>"` |
| A defect in already-shipped code | A `fix/<ticket>` or `hotfix/<ticket>` branch — it is a separate work unit, not a new version |

---

## Web Dashboard

SpecDrive includes a local web dashboard for visual inspection of your specs, features, and team.

### Start the Dashboard

```bash
sdrive dashboard
```

Then open:

```text
http://localhost:4747
```

`sdrive init` and `sdrive onboard` **start it for you** when they finish, so a new project has something to look at immediately. Press `Ctrl+C` to stop it and get your prompt back — that is the normal way to stop a server, and it is reported as "Dashboard stopped", never as an error.

If a dashboard is already running, `sdrive dashboard` (and the auto-start) hands
the current project to it instead of opening another port. One dashboard can show
every project you have opened, so the second project does not need a second tab.
Switch projects inside the dashboard: click the project name in the top bar, or
open **Projects** in the sidebar and pick a card.

| Flag / variable | Effect |
|-----------------|--------|
| `--no-dashboard` | Skip the auto-start on `sdrive init` and `sdrive onboard` |
| `SDRIVE_NO_DASHBOARD=1` | Skip the auto-start everywhere, including inside scripts |
| `SDRIVE_PORT` | Change the starting port (default `4747`) |
| `SDRIVE_HOST` | Bind a different interface. Default is `127.0.0.1`; the server has no authentication, so a non-loopback value prints a warning |
| `SDRIVE_PROJECTS` | Path-delimited list of additional projects shown in the project switcher |
| `SDRIVE_NO_REGISTRY` | Keep this dashboard from recording its project in `~/.sdrive/projects.json` |
| `SDRIVE_NO_REUSE` | Always start a new dashboard instead of switching a running one |

The dashboard binds to loopback by default. It is a read-only view: it cannot
approve gates or change state. Its API is `no-store`, and responses carry a
Content-Security-Policy that forbids inline script and framing.

The dashboard defaults to **dark** and remembers an explicit Light choice. The
dark theme uses a near-black base with stepped surfaces, so cards, tables, and
drawers stay distinguishable without flattening every panel into the same black.

### Projects page

The dashboard opens on **Projects**: one card per project it can see, with its
status, feature and live counts, the feature currently being worked on, gate
progress, rejected or next gates, and the last recorded activity. Open a card to
work in that project. The topbar switcher remains for jumping directly.

The page reads each project's `workflow-state.json` and `audit-log.json` only —
it never runs git per project — so a portfolio of several projects loads like a
single page.

### Switching projects

The project name in the topbar is a switcher. It discovers:

- the project the dashboard was started in,
- projects listed in `SDRIVE_PROJECTS`,
- projects listed in `~/.sdrive/projects.json` (an array of paths or `{ "projects": [...] }`),
- sibling directories that contain a `.sdrive/config.json`.

Every dashboard records the project it serves in `~/.sdrive/projects.json` when
it starts, so a project you have opened once stays switchable from every other
project's dashboard. That file is the shared list: projects in different source
trees (one repo per client) meet there, which is what removes the need for one
tab per project. Delete an entry to drop a project, or set
`SDRIVE_NO_REGISTRY=1` to keep a dashboard out of the file.

Selecting a project reuses the same dashboard URL and port, clears the cached
git/health/stamp data, and reloads the page. Switching lands on the project's
Overview (a feature detail page from the previous project does not exist in the
new one). The server has one active project at a time, so every open tab follows
the switch; close the per-project tabs you no longer need.

To start one dashboard for several projects:

```bash
# Windows
set SDRIVE_PROJECTS=C:\work\api;C:\work\web
sdrive dashboard

# macOS/Linux
SDRIVE_PROJECTS=/work/api:/work/web sdrive dashboard
```

The auto-start is deliberately **skipped when there is no interactive terminal**. A script or CI run would otherwise block forever on a server that never exits, so in that case the command prints how to start it manually instead.

### What It Shows

- Onboarding status (greenfield, brownfield partial, brownfield complete)
- Detected external spec systems (OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, generic)
- Migrated features and their source
- Skipped migrations and reasons
- Missing and deferred items
- All features and their current version
- All versions per feature, with their own phase and gates
- Branch name for each feature
- Gate status per version
- Who approved each gate
- Traceability coverage per version
- Spec-to-code verification status per version
- Test coverage per version
- **Test evidence, structured reviews, and archive readiness** on the feature's Evidence tab
- **Schema validation, detected migration frameworks, and recent migration runs** on the Quality page
- Team members and roles
- Recent audit activity
- **The branching model in use**, at the bottom of the sidebar — derived from the repository and each feature's recorded `base`, never stored (see [Branching models](#branching-models))
- **Project health** — a scored, auditable read-out of where the project actually stands (see [Project Health](#project-health))

The sidebar footer also shows the current branch, its latest commit, and the branch it was most recently merged from, and clicking the topbar chip shows the full commit subject.

### Product Plan Page

The **Product Plan** page shows backlog, ongoing, and completed counts, sorts
items by dependency wave, and searches by ID or feature name. Status, wave,
milestone, and priority filters narrow the table, which shows 20 items per page.

Each row has a **View more** button that opens an animated right-side drawer with
the feature description, user value, confidence/source, dependencies, lifecycle,
branch or prepared worktree, and the recommended next step. New backlogs can add
a `Details` column for the description; older backlogs fall back to `User value`.

### Feature Detail Page

Click any feature to open its detail page, which has four tabs:

- **Tasks** — the task list for the current version, with status
- **Evidence** — `test-evidence.json`, `review.json`, and archive readiness, including stale-commit warnings, findings, and blockers
- **Reports** — every report written for the feature (docs, performance, reviews, security, tests, debug), read straight from `.sdrive/reports/`
- **Spec Files** — the raw spec, plan, tasks, traceability, and review documents for the current version, rendered in the dashboard so you never have to open your repo to read them

### Quality Page

The **Quality** page shows:

- Schema validation results per governance file, with the exact errors
- Detected migration frameworks and their roots
- Recent migration runs, with imported/skipped/failed counts
- The current validation state, so a broken config or workflow-state is visible before it reaches CI

### Command Reference

The dashboard also includes a **Commands** page listing every slash command, its owning agent, and its description. Clicking a command opens a detail drawer with its purpose, gates, and validators.

### Filters

The dashboard includes a filter bar:

- Search by feature name
- Filter by phase
- Filter by verification status
- Filter by test coverage
- Show current version only

### Project Health

The overview page carries a health score. It is not a vanity number: every
point is traceable to something the CLI could also tell you, and the panel shows
the evidence for each component.

| Component | Weight | What it reads |
| --- | --- | --- |
| Gate progress | 30 | How many of the four gates are approved across live features |
| Traceability coverage | 25 | Requirement → code links that resolve to real files |
| Verification | 15 | Features whose latest verification report has no drift |
| Archivable | 15 | Features that would pass `sdrive archive:check` right now |
| Freshness | 15 | Days since the last recorded audit event (decays over 14 days) |

Two rules keep the score honest:

- **It rescales over the components it could actually score.** If a project has
  nothing to verify, verification is left out of the denominator instead of
  silently costing you 15 points. A component that cannot be scored reports
  `not scored`, never `0`.
- **The suggested next action is checked before it is shown.** The panel only
  recommends an approval when `checkGateRequirements` would accept it, so it
  never tells you to run a command that will refuse.

### Reading spec files in place

Paths that appear in spec documents — in the Spec Files tab and in the rendered
Markdown — are clickable when they point at a file that actually exists in your
project. Clicking opens the file in a modal sized to 85% of the window width and
90% of its height, with a find bar that highlights every match and steps through
them (`Enter` / `Shift+Enter`).

Existence is checked before a path is made clickable, so prose, CSS class names,
and package specifiers like `next/image` stay as plain text. Nine of the 158
path-shaped strings in a typical large spec are real files; the other 149 are not,
and the dashboard does not pretend otherwise.

The file endpoint behind this refuses anything outside the project root, refuses
secret-shaped names (`.env*`, `*.pem`, `*.key`, `secrets.json`, `.npmrc`, `.git/`,
and any path matching `secret`, `credential`, or `private-key`), refuses files over
512 KB, and refuses binary files. It only ever reads — it cannot write.

### Live refresh

The dashboard polls a cheap `/api/stamp` fingerprint (state files plus the trees
under `.sdrive/`) every five seconds and reloads the affected panel only when the
fingerprint changed. Polling pauses while the tab is hidden and catches up on
`visibilitychange`, so a dashboard left open in a background tab costs nothing.

### Notes

- The dashboard runs locally, starting on port `4747`
- If `4747` is already in use (for example another project's dashboard is running),
  it automatically falls back to the next free port (`4748`, `4749`, …) and prints
  the URL it chose
- Override the starting port with the `SDRIVE_PORT` environment variable
- It reads directly from `.sdrive/`
- No data leaves your machine
- The panel you land on paints as soon as its data arrives; slow panels (git
  history, verification reports) do not hold up the rest of the page
- Git is asked with a short timeout and never blocks the server. When a probe
  cannot be answered, the dashboard says **"Not checked"** rather than guessing —
  a failed `git status` is not the same fact as a clean tree, and it is never
  presented as one

---

## Onboarding an Existing Project

If your project already has code but no SpecDrive governance, run:

```text
/sdrive:onboard
```

That is the only command you need.

The Onboarding Agent will:

1. Scan your project automatically
2. Detect any `openspec/` or `.specify/` folders
3. Write `.sdrive/onboarding/inventory.json` and `report.md`
4. Show the inventory for your approval
5. **Ask about the product overview** — if the README is scaffold boilerplate (create-next-app, create-vite, …) or missing, it offers to interview you and write a real overview instead of quoting the framework
6. Ask which missing pieces to fill vs. defer
7. Optionally generate a baseline constitution
8. Optionally generate retroactive specs for existing features
9. Optionally plan and migrate OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, or generic spec folders
10. Record onboarding state in `workflow-state.json`

### Monorepos

The scan reads the workspace manifest, so a monorepo's packages are treated as first-class code roots instead of being missed by a fixed directory list. Detected packages are merged into the scan's code roots and listed in `report.md` under **Monorepo Workspaces**.

| Manifest | Read from |
|----------|-----------|
| `pnpm-workspace.yaml` | `packages:` |
| `package.json` | `workspaces` — either an array or `{ "packages": [...] }` |
| `lerna.json` | `packages` |

Only the `packages:` list is parsed from `pnpm-workspace.yaml`. Other keys that also contain lists — `publicHoistPattern:`, `overrides:`, `allowBuilds:` — are ignored, so their entries never leak in as packages.

`turbo.json`, `nx.json`, and `rush.json` are treated as **signals only**. Turborepo and Nx delegate package discovery to the package manager, so they confirm a repository is a monorepo but do not name its packages. When a signal is present and no package list is found, the agent asks which directories are the packages rather than guessing.

### The project brief

A freshly onboarded project used to show an empty dashboard, which read as though SpecDrive knew nothing about it. The scan now derives a **project brief** so the Overview has something true to show:

1. It reads `README.md` — the only file written to explain the product — taking the title, the opening paragraph (rejoined across its wrapped lines), bullets under a features/goals heading, and bullets under a users/audience heading.
2. It first checks whether the README is **generator boilerplate**. A scaffolded repo ships the framework's own README, so its opening paragraph reads "This is a Next.js project bootstrapped with create-next-app" — true of thousands of unrelated repositories, and useless as a product overview. When that signature is detected the README is treated as absent rather than quoted, `projectBrief.readmeQuality` is `template`, and the Onboarding Agent asks whether to interview you and write a real overview.
3. If the README is missing, is boilerplate, or says nothing useful (a title and badges only), it falls back to a **code scan**: language markers such as `tsconfig.json` or `go.mod`, the dependencies in `package.json`, and the detected workspace packages.
4. It writes the result to `.sdrive/product/overview.md`, **only when that file does not already exist**.

When the brief comes from a boilerplate README, the file says so and deliberately has **no Vision section** — an honest gap with the open questions listed, rather than a confident sentence about the framework.

The brief is derived, and the file says so on its first line:

```text
Status: Draft (derived from README.md)
```

The dashboard reads that word and labels the page to match — **Product Brief (draft)**, goals marked *from README, unconfirmed*, tech stack *from manifests, unconfirmed*. It never reports a derived brief as an approved product plan, and it never says "approved" until someone approves one.

Running `/sdrive:product-plan` reads the draft, preserves it, and proposes a merge rather than discarding it. If your project already has a `product/overview.md`, the scan leaves it completely untouched.

### What onboarding does NOT do

- Does not overwrite existing files
- Does not delete anything
- Does not modify code
- Does not fabricate spec IDs or history

### Optional: manual scan

If you prefer to scan from the terminal before opening your AI tool:

```bash
sdrive onboard
```

This only writes the inventory. Adoption still happens via `/sdrive:onboard`.

---

## Migrating from another spec-driven framework

Migration is explicit and adapter-based. Onboarding detects the frameworks
below, then you plan, apply, verify, and (if needed) roll back.

| Framework | Detected from | Imported as |
|---|---|---|
| OpenSpec | `openspec/` | specs/changes → `ongoing/`, archive → `completed/` |
| GitHub Spec Kit | `.specify/` | `specs/###-feature/` → `ongoing/` |
| AWS Kiro | `.kiro/specs/` | requirements → spec, design → plan, tasks → tasks |
| Agent OS | `.agent-os/specs/` | spec/plan/tasks → `ongoing/` |
| BMAD Method | `.bmad-core/`, `docs/stories/`, `docs/prd.md` | stories/PRD → `backlog/` drafts |
| Generic spec folders | `specs/`, `docs/specs/` | spec/plan/tasks → `backlog/` drafts |

### Step 1: Detect

```bash
sdrive migrate:detect
sdrive migrate:detect --json
```

This also records detected frameworks in
`.sdrive/onboarding/inventory.json` under `detectedSystems.frameworks`.

### Step 2: Plan

```bash
sdrive migrate:plan kiro
sdrive migrate:plan kiro --json --out migration-plan.json
```

The plan is read-only. It shows every source→target file mapping, conflicts,
partial mappings, placeholders, and warnings. Nothing is written.

### Step 3: Apply

```bash
sdrive migrate:apply kiro --yes
```

`--yes` is required; without it the command only prints the plan. The migration
writes only new files, never deletes a source, marks every feature
`retroactive: true`, and records a report under:

```text
.sdrive/migration-runs/<migration-id>/report.json
```

### Step 4: Verify

```bash
sdrive migrate:verify <migration-id>
sdrive migrate:verify <migration-id> --strict
```

Default verification checks that every mapped file exists and the report is
consistent. `--strict` also validates the migrated governance JSON against the
schemas.

**Migrated governance is a schema-valid placeholder, not a completed
specification.** It contains `US-001`, `AC-001`, `FR-001`, and `T1.1` with text
that says to replace them. Replace those with the source requirements and tasks
using `/sdrive:propose` (backlog imports) or `/sdrive:sync` (ongoing imports)
before running `/sdrive:review`.

### Step 5: Roll back

```bash
sdrive migrate:rollback <migration-id>
```

Rollback restores the pre-migration `workflow-state.json` from the snapshot and
removes the files the migration created. A rollback record is written to
`.sdrive/migration-runs/<migration-id>/rollback.json`.

### What migration preserves

- Original `openspec/`, `.specify/`, `.kiro/`, `.agent-os/`, `docs/stories/`, and
  `specs/` folders are never deleted
- All migrated features are marked `retroactive: true`
- Every feature records `migratedFrom: <framework-id>` and its source path
- Every migration is logged in `workflow-state.json` under `onboarding.migrated`
- Skipped migrations are logged under `onboarding.skipped`

### What migration does NOT do

- Overwrite existing SpecDrive files
- Invent requirements or acceptance criteria
- Link tests or claim verification passed
- Modify source code
- Delete the source framework

---

## Core Workflow

Every chat command commits and pushes the changes it made once its work is
complete and any required human approval has been granted. Commits use the
`specdrive(<command>):` prefix, stage only that command's files, and never
force-push. If there is nothing to commit, the command says so and skips the
push.

`/sdrive:archive` is the exception: it merges the feature into its confirmed
target branch and pushes that branch instead of creating a separate
commit-and-push step.

### 1. `/sdrive:constitution`

Creates or updates the project constitution.

**What it does:**

- Discovers project stack, standards, and architecture
- Detects test framework, command, and folder
- Creates context files under `.sdrive/context/`
- Merges rules into `.sdrive/constitution.md`
- Includes versioning rules (`CON-603` to `CON-605`)
- Requires human approval before writing

**When to use:**

- First time setting up a project
- When project standards change

---

### 2. `/sdrive:propose`

Chooses the base branch, creates the feature branch, then writes the specification, traceability matrix, technical plan, and execution tasks.

**What it does:**

- **Asks for the branch first — before writing anything.** Lists every local and remote branch (the integration branch is recommended, the current one is marked, and any branch already in use by another feature is flagged), then switches to the one you pick
- Creates `feature/<feature>` from that base and leaves you on it
- Records `branch` and `base` in `workflow-state.json`, so `/sdrive:apply` has nothing to guess and `/sdrive:archive` knows the merge target
- Refuses to create a branch over a dirty working tree, and refuses a base that already carries another feature's commits without an explicit confirmation
- Accepts a natural feature description
- Generates a kebab-case feature name
- Uses default template from `.sdrive/config.json`
- Creates spec, plan, tasks, and traceability files
- Assigns the feature to `v1` automatically if new
- Runs anti-redundancy check
- Requires two human approval gates

**Why the branch comes first:** a base chosen after the spec exists is a base chosen blind. If it already carries another in-flight feature's commits, the two are stacked, and that is only discovered when `/sdrive:archive` refuses the merge. Deciding it at proposal time removes that failure mode entirely.

**When to use:**

- Whenever a new feature is needed
- Before any code is written

---

### 2b. `/sdrive:update-propose`

Extends an **existing** feature specification with new requirements, user stories, and acceptance criteria.

**When to use:** when a feature proposal needs changes before the feature is archived. After a feature is archived, use `sdrive version:new` for a genuine change of scope; the completed version stays archived and immutable.

**What it does:**

- Accepts a feature name and the change to add (e.g. `/sdrive:update-propose "signup-page" add google auth`)
- Verifies the feature already exists and is not completed
- Preserves all existing IDs and content — only appends new ones
- Continues ID numbering from the highest existing `FR-###`, `NFR-###`, `US-###`, `AC-###`
- Updates `spec.md`, `plan.md`, `tasks.md`, and the governance JSON files
- Resets the `specification` gate to `pending` (new requirements invalidate prior approval)
- Records a `spec_updated` event in the version history
- Requires two human approval gates

**When to use:**

- When an existing feature needs a new capability (e.g. adding Google Auth to a signup page)
- When requirements change after the spec was first written
- **Not** for brand-new features — use `/sdrive:propose` for those

---

### 3. `/sdrive:apply`

Writes production code from the approved tasks.

**What it does:**

- **Resumes the branch `/sdrive:propose` created** — it reads `feature.branch` from `workflow-state.json` and checks out that branch. It does **not** ask for a base, and it does not create a branch. Without a recorded branch it stops and tells you to run `/sdrive:propose` first
- **Moves the feature from `specs/backlog/` to `specs/ongoing/`** and sets the version's `phase` to `ongoing`
- Reads approved tasks and plan from the current version
- Refuses to run on the default branch, on another feature's branch, or with a dirty working tree
- Implements production code only (no tests)
- Runs `sdrive verify <feature>`
- Commits and pushes

**When to use:**

- After spec and plan are approved
- When implementation is ready

**Batch mode:**

- `/sdrive:apply --all` — implement every ongoing feature, one branch each (never merges)

---

### 4. `/sdrive:test`

Writes tests for every acceptance criterion, runs them, and reports coverage.

**What it does:**

- Reads spec, plan, tasks, and traceability from the current version
- Detects the project's test framework and its test file naming convention
- Writes one test per AC, organized by feature under the project's test folder using the framework's own convention (`<test-folder>/<feature>/<subfeature>.<test-suffix>.<ext>`)
- Requires approval before writing
- Runs tests and updates `traceability.json`
- Generates a coverage report
- Writes all artifacts (reports, logs, captured output) under `.sdrive/` — never to the project root
- Runs `sdrive test <feature>` so the run is recorded as `test-evidence.json`
- Runs `sdrive verify <feature>` and the governance validator

**When to use:**

- After `/sdrive:apply`
- Before `/sdrive:review`

**Evidence:**

`/sdrive:test` writes the tests. The CLI records what actually ran:

```bash
sdrive test user-login
```

This writes `.sdrive/governance/<feature>/<version>/test-evidence.json` with the
command, exit code, pass/fail/skip counts, commit, branch, duration, output hash,
and any `TEST-###`/`AC-###` IDs. New projects require this evidence before the
review gate can be approved.

**Batch mode:**

- `/sdrive:test --all` — test every ongoing feature, one after the other

---

### 5. `/sdrive:review`

Final audit and pass/fail verdict. Does **not** merge or archive.

**What it does:**

- Verifies coverage: every AC in `spec.json` has a linked test in `traceability.json` with `status: complete`
- **The same check is enforced in code.** `sdrive approve <feature> review` reads `traceability.json` and exits non-zero if any AC has no passing test. A rule written in an agent prompt cannot refuse anything; only the CLI can, which is why this one lives in the CLI
- **Requires passing test evidence** when `governance.requireTestEvidence` is enabled: `test-evidence.json` must show a zero-exit run with no failures at `HEAD`. A hand-written `Status: PASS` is not verification by itself
- **Binds the verdict to a commit.** It records `HEAD`, the feature branch/base, and refuses a dirty tree, a branch mismatch, or a review that moved past its commit
- **Audits the diff against `base`**, flagging unplanned files, untracked files, missing planned files, and commits from another feature
- Checks test quality (`.only`, `xit`, unjustified skips, empty assertions, AC IDs), security, NFR evidence, docs, and CI
- Runs `sdrive check`, `sdrive validate`, `sdrive verify`, and `sdrive audit:verify` and reads their structured results
- Writes `review.md` (human report) and `review.json` (machine-readable verdict) with `Status: PASS` or `Status: FAIL`
- On failure: records the findings in `review.md`, adds fix tasks, and stops (no PR, no branch, no merge)
- On pass: notifies you to run `/sdrive:archive <feature>`
- Requires human approval before the verdict is recorded, and warns when the reviewer is the feature's assignee

**When to use:**

- After `/sdrive:test`
- Before shipping to production

**Review artifacts:**

```text
.sdrive/specs/<lifecycle>/<feature>/<version>/review.md      # human report
.sdrive/governance/<feature>/<version>/review.json           # machine-readable verdict
```

`review.json` is validated by `sdrive validate` and read by
`sdrive approve <feature> review` when `governance.requireStructuredReview` is
enabled.

**Batch mode:**

- `/sdrive:review --all` — review every ongoing feature one after the other (a failed feature is never cleared for archive)

---

### 6. `/sdrive:archive`

Merges an approved feature back into the branch it came from, and completes its lifecycle.

**What it does:**

- Runs `sdrive archive:check <feature>` first — a read-only pre-flight that re-verifies every approval and the evidence behind it, and reports blockers without writing anything
- **Refuses until the tests have actually run.** A `test-report-<feature>-<version>-<date>.md` must exist in `.sdrive/reports/tests/`, because only `/sdrive:test` writes one. Coverage in `traceability.json` can be hand-edited to look complete; the report is the evidence that a run happened. When `requireTestEvidence` is enabled, `test-evidence.json` is re-checked too
- **Refuses until the review has actually run** — `review.md` for the current version must record `Status: PASS`
- **Merges into `feature.base`** — the branch `/sdrive:propose` cut this feature from. It is not a menu and not a guess: the destination was recorded at proposal time. The only fallbacks are a stacked parent (lands first) or a base that has since been deleted, and both are stated before merging
- **Handles merge conflicts before merging.** It checks the PR's `mergeable` state, merges the target branch into the feature branch, and resolves only mechanical conflicts (unrelated target changes, the feature's own spec/governance files, regenerated lockfiles, formatting). Semantic, migration, security, or secret conflicts stop the archive with `git merge --abort`. After a resolution it re-runs `sdrive validate`, `sdrive verify`, and the test suite, then records the conflicted files and resolution commit
- Refuses to merge a branch that carries another in-flight feature's commits (CON-611)
- Requires human merge approval
- **Writes no record itself.** `sdrive archive:finalize` does, and it moves only the *current version's* folder to `completed/`, sets `phase: completed`, and never promotes a gate — an outstanding gate is a refusal, not a shortcut
- Preserves older versions and sibling releases
- Verifies the move succeeded before writing
- **Asks whether to delete or keep** the branch `/sdrive:propose` created — never silently. Delete is recommended (CON-610), keep leaves both the local and remote branch untouched, and the answer is reported either way

**When to use:**

- Only after `/sdrive:test` has run **and** `/sdrive:review` has returned `Status: PASS`. `sdrive archive:check` names whichever is missing

**Batch mode:**

- `/sdrive:archive --all` — archive every ongoing feature that has passed review, one after the other. Each feature still lands on its own recorded `base`

---

## Batch Mode: the `--all` Flag

When you have several features in flight, you can run a command against **every ongoing feature** in one go by appending `--all`:

```text
/sdrive:test --all
/sdrive:review --all
```

The command enumerates every feature in `specs/ongoing/`, processes them **sequentially** (one after the other), and writes a single aggregate report to `.sdrive/reports/<type>/<type>-report-all-<date>.md`.

**Commands that support `--all`:**

| Command | What `--all` does |
|---------|-------------------|
| `/sdrive:apply --all` | Implements every ongoing feature, one branch each. Does **not** merge. |
| `/sdrive:test --all` | Writes and runs tests for every ongoing feature. |
| `/sdrive:review --all` | Reviews every ongoing feature one after the other. Never clears a feature that fails review for archive. |
| `/sdrive:archive --all` | Archives every ongoing feature that has passed review. Runs a read-only pre-flight over every candidate before merging anything, then still asks the three decisions (target branch, merge yes/no, delete branch) separately for each feature. |
| `/sdrive:secure --all` | Runs the security audit against every ongoing feature. |
| `/sdrive:performance --all` | Optimises every ongoing feature. |
| `/sdrive:debug --all` | Sweeps every ongoing feature for defects. |
| `/sdrive:docs --all` | Generates documentation for every ongoing feature. |

**Behaviour notes:**

- **Gates are evaluated per feature.** In `--all` mode the router does not gate-check a single feature; each feature's gates are checked individually by the agent as it is processed.
- **Failures do not stop the batch.** If one feature fails, the agent records the failure and continues with the next, then summarises everything in the aggregate report.
- **`/sdrive:apply --all` never merges.** Each feature gets its own branch and its own approval gate; merging stays a deliberate, per-feature action.
- **Commands that do not support `--all`** (e.g. `/sdrive:propose`, `/sdrive:constitution`, `/sdrive:design`) reject the flag with a clear error.

---

## Optional Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/sdrive:update-propose` | Extend an existing feature spec | When a feature proposal needs changes before the feature is archived |
| `/sdrive:design` | Build UI/UX prototype | When there is no existing prototype |
| `/sdrive:secure` | Security audit and fixes | When security is a concern |
| `/sdrive:performance` | Benchmark and optimize for speed and SEO | When performance NFRs are not met, or search visibility needs work |
| `/sdrive:debug` | Reproduce, isolate, and fix defects | When something is visibly wrong — broken layout, failing API, console error, glitch |
| `/sdrive:docs` | Generate documentation | When docs are outdated or missing |
| `/sdrive:sync` | Sync spec → plan → tasks | After manually hand-editing a single file |
| `/sdrive:skills` | Manage AI skills | When auditing or discovering skills |

---

### `/sdrive:design`

Builds interactive prototype using vanilla HTML, CSS, and JavaScript.

**What it does:**

- Creates design system under `.sdrive/prototype/`
- Builds screens and user flows
- Supports light/dark mode
- Maps screens to user stories

**When to use:**

- When there is no existing UI/UX prototype
- When visual validation is needed before coding

---

### `/sdrive:secure`

Supports `--all` to audit every ongoing feature.

Performs deep security audit.

**What it does:**

- Threat modeling
- OWASP Top 10 checks
- Dependency scanning
- Secret detection
- CVSS scoring
- Applies fixes after approval

**When to use:**

- Before release
- After adding new dependencies

---

### `/sdrive:performance`

Supports `--all` to optimise every ongoing feature.

Benchmarks and optimizes performance and search visibility.

**What it does:**

- Measures baseline metrics
- Identifies bottlenecks
- Runs an SEO audit for crawlability and discoverability issues (metadata, semantic structure, structured data, `robots.txt`/`sitemap.xml`, Core Web Vitals, `hreflang`)
- Applies optimizations with approval
- Verifies improvements

**Two measured concerns:** speed (slower than the NFRs allow) and SEO (not discoverable or not readable by crawlers). Both are measured against a number, which is why both belong here. An SEO finding is reported even when every speed NFR passes — the NFR gate never suppresses it. The two lists are reported and approved separately.

**Scope boundary:** A design judgement with no metric — "should this be a reusable component?", duplicated code, dead code — is **not** in scope. Those are noted under "Out of Scope Observations" and handed to `/sdrive:review`. Correctness defects (layout, API, runtime, glitches) are handed to `/sdrive:debug`.

**When to use:**

- When performance NFRs are not met
- When search visibility needs work (missing metadata, poor crawlability, weak Core Web Vitals)
- After major feature implementations

---

### `/sdrive:debug`

Supports `--all` to sweep every ongoing feature for defects.

Reproduces, isolates, and fixes defects — layout breakage, API failures, runtime errors, and visual glitches. This is the chief debugger.

**What it does:**

- Reproduces the defect and captures before evidence
- Isolates it to the smallest unit that still exhibits it
- States the root cause in one sentence, distinguished from the symptom
- Applies the smallest correct fix after approval
- Re-runs the reproduction and captures after evidence with the same method
- Adds a regression test that would have caught the defect
- Writes a versioned report to `.sdrive/reports/debug/`

**Defect classes:**

| Class | Examples | Detection |
|-------|----------|-----------|
| **LAYOUT** | Overlap, overflow, clipping, z-index collision, container escape, breakpoint breakage | Headless-browser bounding-box comparison |
| **API** | Failing endpoint, wrong status code, malformed payload, schema mismatch, auth failure, timeout | Issue the request, capture status/headers/body, compare to contract |
| **RUNTIME** | Uncaught exception, console error, hydration mismatch, unhandled rejection, state bug | Capture console output and stack trace |
| **GLITCH** | Flicker, shift on interaction, broken transition, misaligned icon, inconsistent spacing | Interaction trace plus before/after screenshots |

**When to use:**

- When something is visibly wrong — a broken layout, a failing endpoint, a console error, a visual glitch
- After `/sdrive:performance` hands off a correctness defect

**What it does NOT do:**

- Optimize for speed (use `/sdrive:performance`)
- Audit against acceptance criteria (use `/sdrive:review`)

---

### `/sdrive:docs`

Supports `--all` to document every ongoing feature.

Generates documentation.

**What it does:**

- Adds inline comments with traceability IDs
- Updates README
- Detects code/spec drift
- Generates coverage report

**When to use:**

- After implementation
- When docs are stale

---

### `/sdrive:sync`

Cascades changes across spec, plan, tasks, and traceability.

**What it does:**

- Detects changes in higher-level files
- Updates downstream files
- Preserves task status and IDs
- Runs `sdrive verify <feature>` after sync

**When to use:**

- When spec or plan changes after implementation has started
- When you have **manually hand-edited** a single file (e.g. `spec.md`) and need the downstream files re-synced

> **Note:** You do **not** need to run `/sdrive:sync` after `/sdrive:update-propose` — that command already cascades spec, plan, tasks, and traceability in one run.

---

### `/sdrive:skills`

Audits and manages AI skills.

**What it does:**

- Scans existing skills
- Discovers new skills from GitHub
- Verifies security of community skills
- Installs approved skills

**When to use:**

- When setting up a new workspace
- When auditing existing AI skills

---

## Terminal Commands

| Command | Purpose |
|---------|---------|
| `sdrive init` | Initialize SpecDrive structure |
| `sdrive update` | Refresh framework files (including `commands/*.js` rules) without touching specs or governance |
| `sdrive update --check` | Report drift between `.sdrive/` and the installed framework manifest |
| `sdrive onboard` | Scan an existing project (usually run automatically by `/sdrive:onboard`) |
| `sdrive doctor` | Diagnose the installation: layout, schemas, team, permissions, adapters, evidence |
| `sdrive migrate:detect` | Detect OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, and generic spec folders |
| `sdrive migrate:plan <framework>` | Show the source→target migration mapping without writing |
| `sdrive migrate:apply <framework> --yes` | Import a framework's specs as SpecDrive drafts |
| `sdrive migrate:verify <id>` | Verify the imported files (`--strict` validates governance schemas) |
| `sdrive migrate:rollback <id>` | Restore workflow state and remove migration-created files |
| `sdrive validate` | Validate governance files (`--json` for CI) |
| `sdrive config:validate` | Validate `.sdrive/config.json` |
| `sdrive config:get <key>` | Read a config value by dot path |
| `sdrive config:set <key> <value>` | Write a config value (e.g. opt into test evidence) |
| `sdrive status` | Show feature lifecycle state, blockers, and the next action |
| `sdrive test <feature>` | Run the project's tests and record `test-evidence.json` |
| `sdrive check` | Run doctor + validation (+ tests with `--tests`) in one pass |
| `sdrive approve <feature> <gate>` | Approve a workflow gate (verifies the stage is genuinely complete) |
| `sdrive archive:check <feature>` | Report whether a feature may be archived, and why not. Reads only — changes nothing |
| `sdrive archive:finalize <feature> [--merge-commit <sha>]` | Record a completed archive. Refuses unless all four gates are already approved |
| `sdrive create <feature>` | Create feature scaffold (internal) |
| `sdrive update-propose <feature>` | Validate an existing feature for extension (internal) |
| `sdrive assign <feature> <username>` | Assign an owner to a feature |
| `sdrive team:add <username> <role>` | Add a new team member |
| `sdrive team:remove <username>` | Remove a team member |
| `sdrive team:list` | List all team members |
| `sdrive team:update <username> <role>` | Update a member's role |
| `sdrive team:sync` | Sync team members from GitHub collaborators |
| `sdrive template:list` | List available templates |
| `sdrive template:set <name>` | Set default template |
| `sdrive adapters:list` | List every AI tool and the exact files each one reads |
| `sdrive adapters:verify` | Check the tool registry for paths a tool would never read |
| `sdrive adapters:add <name> --path <file>` | Support a tool SpecDrive does not ship (any tool, no release needed) |
| `sdrive permissions:check` | Verify every CLI and slash command has a permission rule |
| `sdrive audit:verify` | Verify the hash chain of the audit log |
| `sdrive hooks:install` | Install pre-commit validation hook (preserves an existing hook) |
| `sdrive diff <old> <new>` | Show differences between two spec files |
| `sdrive openapi:generate <feature>` | Generate OpenAPI spec from plan.json |
| `sdrive dashboard` | Start local web dashboard (binds `127.0.0.1` by default) |
| `sdrive verify <feature>` | Verify code matches plan.json |
| `sdrive version:new <feature>` | Create a new version of a feature |
| `sdrive diff:version <feature> <vA> <vB>` | Compare two versions of a feature |

---

## Agents

| Agent | File | Role |
|-------|------|------|
| Onboarding | `00-onboarding.md` | Adopt SpecDrive into an existing project, migrate OpenSpec and Spec-Kit |
| Constitution | `01-constitution.md` | Discover project rules, merge into constitution |
| Product Plan | `12-product-plan.md` | Optionally create a product overview, conceptual mockup, design-system plan, roadmap, and backlog |
| Worktree | `16-worktree.md` | Prepare branches and isolated worktrees for the next ready Product Plan wave |
| Specification | `02-specification.md` | Generate spec, plan, tasks, traceability |
| Update Proposal | `13-update-propose.md` | Extend an existing feature spec with new requirements, stories, and acceptance criteria |
| UI/UX | `03-uiux.md` | Build interactive prototype |
| Cascade | `04-cascade.md` | Sync spec → plan → tasks |
| Discover-skills | `05-discover-skills.md` | Audit AI skills |
| Documentation | `06-documentation.md` | Generate docs, detect drift |
| Implementation | `07-implementation.md` | Write production code |
| Performance | `08-performance.md` | Benchmark and optimize for speed and SEO |
| Review & Complete | `09-review-complete.md` | Final audit and pass/fail verdict (no merge) |
| Security | `10-security.md` | Security audit and fixes |
| Test | `11-test.md` | Write tests, run them, report coverage |
| Archive | `14-archive.md` | Merge an approved feature to the confirmed target branch and complete its lifecycle |
| Debug | `15-debug.md` | Reproduce, isolate, and fix defects — layout, APIs, runtime, glitches |

---

## Templates

SpecDrive includes starter templates for common stacks.

| Template | Stack |
|----------|-------|
| `generic` | Any project |
| `react-node` | React + Node |
| `nextjs` | Next.js |
| `expo` | Expo / React Native |
| `fastapi` | Python FastAPI |
| `turborepo` | Turborepo monorepo |

The default template is stored in `.sdrive/config.json`.

Manage templates:

```bash
sdrive template:list
sdrive template:set nextjs
```

---

## Versions

Every feature is versioned. Each version has its own phase, gates, tasks, and history.

### Automatic `v1`

When you run `/sdrive:propose` on a new feature, SpecDrive assigns it to `v1` automatically.

### Creating a New Version

For structural changes (new workflow, new user story, behavior change), create a new version:

```bash
sdrive version:new user-login
```

This:

- Migrates the current files into `v1/` (if they weren't already)
- Creates a new `v2/` folder
- Preserves `v1` history
- Sets `v2` as the current version

Then run `/sdrive:propose` to fill in `v2`.

### Comparing Versions

```bash
sdrive diff:version user-login v1 v2
```

Shows added and removed lines across spec, plan, and tasks.

### When to Use Versions

| Change | Version? |
|--------|----------|
| Typo fix | No |
| Small edge case | No |
| New user story | Yes |
| New workflow | Yes |
| Behavior change | Yes |

### Version Isolation

All agents operate within the **current version** folder only. Older versions are never modified.

---

## Feature Lifecycle

A feature moves through three spec folders. Each transition has exactly one owner:

| Transition | Owner | Notes |
|------------|-------|-------|
| → `specs/backlog/<feature>/<version>/` | `/sdrive:propose` | New specs are created in `backlog/` with `phase: backlog` |
| `backlog/` → `ongoing/` | `/sdrive:apply` | Happens at the start of implementation; sets `phase: ongoing` |
| `ongoing/` → `completed/` | `/sdrive:archive` | Happens after merge and archive; sets `phase: completed` |

`completed/` is immutable. There is no transition back to `ongoing/`; a new version is the only way to add scope after release. `/sdrive:apply` MUST NOT begin implementation while the spec is still in `backlog/`. If the feature is in neither `backlog/` nor `ongoing/`, the agent stops and asks.

> **Note:** `governance/` is not lifecycle-partitioned. Governance files live at `.sdrive/governance/<feature>/<version>/` regardless of the spec's lifecycle folder.

### Making a Change After Release

`archive` deletes the feature branch, so a completed feature has no branch of its own. The completed version is immutable; to make a further change:

1. Run **`sdrive version:new <feature>`**. It creates a new version under `ongoing/` and leaves the released version and its record untouched.
2. Make the change on the new branch.
3. `/sdrive:test` → `/sdrive:review` → `/sdrive:archive`, as normal.

**A minor change is NOT a new version** (CON-604). New versions are only for structural changes — a new workflow, a new user story, or a behaviour change. Small edits stay in the current version while it is still open, and `/sdrive:update-propose` extends the existing spec in place.

A defect in already-shipped code is a *different* work unit: use a `fix/<ticket>` or `hotfix/<ticket>` branch off the target rather than reopening the feature.

### Branching Policy (Enterprise Standard)

One branch per feature is mandatory. The constitution encodes this as **CON-606 – CON-612**, so it is enforceable project governance, not just agent guidance.

| Rule | Requirement |
|------|-------------|
| **CON-606** | **One branch per feature.** Two features never share a branch, and a feature is never implemented on another feature's branch |
| **CON-607** | The branch is named `feature/<feature-name>` (kebab-case). If that name is taken, append `-v2`, `-v3`, … |
| **CON-608** | Never implement on the repository's default or protected branch. The default branch is resolved dynamically — never assumed to be `main` |
| **CON-609** | Branch from an approved base branch with a clean working tree (`git status --porcelain` must be empty). Creation happens in `/sdrive:propose`; `/sdrive:apply` only resumes it |
| **CON-610** | Delete the feature branch after a confirmed merge — locally (`git branch -d`) and on the remote (`git push origin --delete`) — unless the user declines. Never delete the merge target branch |
| **CON-611** | One review unit per branch. `/sdrive:archive` refuses to merge a branch that contains other in-flight features' commits |
| **CON-612** | Base a feature branch on the branch it will merge into — `git log <target>..<base>` must be empty. Stacking on another in-flight feature branch is reported with its consequences and must be confirmed, never silent. Dependent work uses `sdrive version:new`, not a stacked feature |

**`/sdrive:propose` picks the base and creates the feature's own branch, before any spec file is written.** It lists every local and remote branch, recommends the integration branch, flags branches already in use by another feature, and records `branch` + `base` in `workflow-state.json`. `/sdrive:apply` and `/sdrive:review` only read that recorded branch and base — neither chooses a base, creates a branch, or asks for a merge target. `/sdrive:archive` merges into `feature.base`, then asks separately whether to delete the feature branch.

Doing it this way is what prevents overlap: the base is chosen while nothing depends on it, so two features can never be cut from one another's work by accident, and the merge target is written down at the start instead of reconstructed at archive time.

#### Branching models

SpecDrive does not require a particular branching model, and it has **no setting** for one. A model is a consequence of two facts it reads every time it needs them:

1. **The integration branch** — where features land. Resolved from the repository: `refs/remotes/origin/HEAD`, then a conventional remote-tracking branch (`main`, `master`, `trunk`, `develop`), then the current branch. It is never assumed to be `main`, and the current-branch fallback is refused outright if that branch is a feature's own branch.
2. **Each feature's `base`** — the branch that feature was based on, recorded on the feature in `.sdrive/workflow-state.json` when `/sdrive:propose` creates its branch.

Everything else follows from those two:

| Model | What SpecDrive sees | Where work lands |
|-------|--------------------|------------------|
| **Trunk-based** | one integration branch, and no feature records a branch of its own | the integration branch |
| **GitHub Flow** | one integration branch, one branch of its own per feature | the integration branch |
| **Git Flow** | integration branch is `develop`, `main` receives releases | `develop` |
| **Stacked features** | every feature's `base` is another feature's branch | the integration branch — the parent is the **review base**, not the destination |
| **Custom / per-feature targets** | features record different non-peer bases | each feature's own recorded base |

> **One model is named at a time — never two.** Showing "GitHub Flow / trunk-based" would read as if a project ran both at once, which is never true. A single label is derived from the two observable facts above, so the read-out never has to hedge.
>
> Trunk-based development with short-lived branches and GitHub Flow produce the identical shape. GitHub Flow is reported whenever a started feature has a branch of its own — which is the shape SpecDrive itself enforces (CON-606). **Trunk-based** is reported only when no feature records a branch at all, so work is visibly going straight to the trunk.

**The dashboard shows which one you are on.** The bottom of the sidebar has a **Branching** read-out: the resolved model, the branch features actually land on, and a count of features stacked on a peer branch (hover it for the full reasoning). It is derived on every request and nothing is stored, so there is nothing to configure, nothing to migrate, and no way for it to change how a feature is archived.

**Stacking is supported, but never silent.** Pointing a feature's `base` at another in-flight feature branch is allowed — that is normal for dependent work. What SpecDrive refuses to do is *pretend the parent is the destination*. `sdrive archive:check <feature>` reports it as a blocker (CON-611): merging the child before the parent lands would ship the parent's unaudited commits.

**A base link is historical metadata, not a live destination.** Once a parent lands, its branch is deleted (CON-610), so a child that was stacked on it then lands on the integration branch directly.

---

## Directory Structure

```text
.sdrive/
├── agents/               # 16 agent definitions
├── commands/             # Manifest, router, gates, permissions
├── schemas/              # JSON schemas
├── specs/                # Human-readable specs (lifecycle-partitioned)
│   ├── backlog/          # Created by /sdrive:propose
│   │   └── <feature>/
│   │       └── <version>/
│   ├── ongoing/          # Entered by /sdrive:apply
│   └── completed/        # Entered by /sdrive:archive
├── governance/           # Machine-readable JSON (NOT lifecycle-partitioned)
│   └── <feature>/
│       └── <version>/    # spec, plan, tasks, traceability, test-evidence, verification
├── onboarding/           # Brownfield onboarding inventory + migration results
├── mcp/                  # MCP server config for AI chat integration
├── migrations/           # Migration adapters (OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, generic)
├── prototype/            # UI/UX prototypes
├── reports/              # Security, performance, docs, tests, debug reports
├── context/              # Discovered project context
├── dashboard/            # Local web dashboard
├── skills/               # AI skills
├── templates/            # Starter templates
├── constitution.md       # Governance source of truth
├── config.json           # Default template + governance/test settings
├── package.json          # Marker: keeps .sdrive/ CommonJS (see Upgrading)
├── framework-manifest.json # Installed file hashes for update --check (generated)
├── audit-log.json        # Hash-chained governance events
├── team.json             # Team roles and rules
└── workflow-state.json   # Feature lifecycle state (per-version + onboarding)
```

---

## Validation

Run the governance validator:

```bash
sdrive validate
```

This checks all governance JSON against the schemas, including `config.json`.

If anything is invalid, it reports exact errors.

### Config Validation

```bash
sdrive config:validate
```

Checks only `.sdrive/config.json`.

### Doctor

```bash
sdrive doctor
```

One command that explains a broken setup: Node version, Git identity, `.sdrive`
layout, config/workflow schemas, team roster, permission coverage, adapter
registry, CommonJS marker, framework-manifest drift, validator dependencies,
test command, and audit-chain integrity.

- `sdrive doctor --json` is the same result for CI or an editor.
- `sdrive doctor --fix` applies only safe repairs (the `.sdrive/package.json`
  marker and a refreshed `framework-manifest.json`).
- Exit code `9` means at least one blocking check failed.

### Test evidence

`/sdrive:test` writes tests; `sdrive test` runs them and records what happened.

```bash
sdrive test user-login
sdrive test user-login --cmd "pnpm vitest run"
sdrive test user-login --json
```

It resolves the command from `.sdrive/config.json` (`test.command`), a
`package.json` `test` script, `go.mod`, or a Python test config, runs it, and
writes:

```text
.sdrive/governance/<feature>/<version>/test-evidence.json
```

The file records the command, exit code, pass/fail/skip counts, commit, branch,
duration, output hash, and any `TEST-###` / `AC-###` IDs found in the output.

New projects enable evidence-backed review by default:

```json
{
  "governance": {
    "requireTestEvidence": true,
    "allowStaleEvidence": false,
    "requireStructuredReview": true
  }
}
```

`requireStructuredReview` makes the review gate require `review.json` with a
matching `HEAD` commit and reviewer record. Existing projects keep the
prose-only behaviour until they opt in:

```bash
sdrive config:set governance.requireTestEvidence true
sdrive config:set governance.requireStructuredReview true
```

When enabled, `sdrive approve <feature> review` refuses unless the evidence
exists, shows zero failures, and was recorded at `HEAD`. `allowStaleEvidence:
true` relaxes only the commit check; it never accepts a failing run.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | success |
| `1` | unexpected/internal error |
| `2` | not a SpecDrive project / not initialized |
| `3` | gate blocked (evidence missing or unmet) |
| `4` | validation failed (schema/governance) |
| `5` | permission denied |
| `6` | usage error |
| `7` | verification drift (missing/renamed code) |
| `8` | tests failed |
| `9` | doctor found blocking problems |

Machine-readable output is available with `--json` on `status`, `validate`,
`verify`, `approve`, `archive:check`, `archive:finalize`, `doctor`, `test`,
`check`, `config:validate`, and the team/adapter commands.

### Pre-commit Hook

Validate governance and verify ready features before every commit:

```bash
sdrive hooks:install
```

The hook runs the governance validator, then `sdrive verify` for each feature whose `phase` is `ongoing` **and** whose `implementation` gate is `approved`. Deferred, backlog, and in-progress features are skipped — so one feature's state never blocks commits for another.

If a hook already exists, it is preserved as `.git/hooks/pre-commit.local` and runs after SpecDrive's checks. If the installed validator cannot resolve `ajv`, the hook warns and continues; `sdrive validate` validates in-process and is the supported path.

---

## Spec-to-Code Verification

SpecDrive includes a deterministic validator that compares `plan.json` against actual code.

It detects:

- Missing implementation
- Renamed components, functions, endpoints, fields
- Extra code not in the plan
- Dependencies not installed

### Run Verification

```bash
sdrive verify user-login
```

### Where It Runs

- After `/sdrive:apply`
- Before `/sdrive:review`
- On every `git commit` (if hooks installed)
- In CI on every PR

### Report

Results saved to:

```text
.sdrive/governance/<feature>/<version>/verification.json
```

Status can be:

| Status | Meaning |
|--------|---------|
| `pass` | Everything matches |
| `warn` | Extra code detected |
| `fail` | Missing or renamed code detected |

### Source Roots

SpecDrive reads source folders from the constitution.

If no source root is defined, it scans common folders:

- `src`, `app`, `lib`, `pages`, `server`, `internal`, `cmd`, `pkg`, `api`, `apps`, `packages`

---

## CI/CD Integration

SpecDrive ships with a reusable CI recipe. Create
`.github/workflows/sdrive-governance.yml`:

```yaml
name: SpecDrive Governance

on:
  pull_request:
    paths:
      - '.sdrive/**'
      - 'package.json'

jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install the project's dependencies (if it is a Node project)
        run: npm ci

      - name: Diagnosis
        run: npx specdrive-cli@latest doctor --json

      - name: Governance, verification, and test evidence
        run: npx specdrive-cli@latest check --tests --json
```

`check` runs doctor, schema validation, and (with `--tests`) the configured test
command for every ongoing feature, recording `test-evidence.json` as it goes. It
does not need `cd .sdrive && npm install`: validation runs in-process, so the
validator's own dependencies are never installed into your project.

For a single feature:

```bash
npx specdrive-cli@latest verify user-login --json
npx specdrive-cli@latest test user-login --json
npx specdrive-cli@latest approve user-login review --json
```

---

## MCP Server

SpecDrive ships with an MCP server so AI tools can call SpecDrive directly from chat.

You can ask in plain language:

```text
Show me all features
Is the governance valid?
Get the traceability for user-login
```

The AI tool calls SpecDrive automatically through MCP.

### Setup

`sdrive init` creates the MCP server at:

```text
.sdrive/mcp/server.js
```

MCP clients are wired **automatically** based on the tools you select — there is
no separate prompt. Each client uses its own config schema:

| Client | Config Path | Config Key |
|--------|-------------|------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` | `mcpServers` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` |
| Cursor | `.cursor/mcp.json` | `mcpServers` |
| Cline | `.cline/mcp.json` | `mcpServers` |
| GitHub Copilot (VS Code) | `.vscode/mcp.json` | `servers` (with `type: "stdio"`) |

SpecDrive never overwrites existing MCP entries. It merges safely.

### Available MCP Methods

| Method | Purpose |
|--------|---------|
| `specdrive.list_features` | List all features |
| `specdrive.get_feature` | Get details for a feature |
| `specdrive.get_spec` | Get `spec.json` for a feature |
| `specdrive.get_traceability` | Get traceability matrix |
| `specdrive.validate` | Run governance validator |
| `specdrive.status` | Feature summary with current step, gates, and next action |
| `specdrive.next_action` | The exact command to run next for a feature |

The server also exposes MCP **resources**:

```text
specdrive://features/<name>/spec
specdrive://features/<name>/plan
specdrive://features/<name>/tasks
specdrive://features/<name>/traceability
```

Protocol versions `2025-06-18`, `2025-03-26`, and `2024-11-05` are negotiated at
`initialize`. A malformed request returns JSON-RPC `-32700` and does not stop the
server.

---

## Tool Support

SpecDrive ships 30 tool definitions. Each one names the file(s) that tool actually
reads, in that tool's own format.

| Tool | Adapter |
|------|---------|
| Any `AGENTS.md` tool | `AGENTS.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| VS Code / Copilot | `.github/instructions/sdrive.instructions.md` |
| Cline | `.clinerules/sdrive.md` |
| Claude Code | `.claude/commands/sdrive/*.md` (16 native commands) |
| Cursor | `.cursor/rules/sdrive.mdc` |
| Amazon Q Developer | `.amazonq/rules/sdrive.md` |
| Gemini CLI | `GEMINI.md` + `.gemini/commands/sdrive/*.toml` (16 native commands) |
| Continue | `.continue/rules/sdrive.md` |
| Codex | `AGENTS.md` |
| Windsurf | `.windsurf/rules/sdrive.md` |
| Kilo Code | `.kilocode/rules/sdrive.md` |
| OpenCode | `AGENTS.md` + `.opencode/commands/sdrive-*.md` (16 native commands) |
| Qoder | `.qoder/rules/sdrive.md` |
| Qwen Code | `QWEN.md` |
| Atlassian Rovo Dev | `AGENTS.md` |
| Roo Code | `.roo/rules/sdrive.md` + `.roo/commands/sdrive-*.md` (16 native commands) |
| Amp | `AGENTS.md` |
| Warp | `WARP.md` |
| Zed | `.rules` |
| Aider | `CONVENTIONS.md` |
| Kiro (AWS) | `.kiro/steering/sdrive.md` |
| JetBrains Junie | `.junie/guidelines.md` |
| Factory Droid | `AGENTS.md` |
| Trae | `.trae/rules/project_rules.md` |
| OpenHands | `.openhands/microagents/sdrive.md` |
| Google Antigravity | `AGENTS.md` |
| Augment Code | `.augment/rules/sdrive.md` |
| goose | `.goosehints` |
| Crush | `CRUSH.md` |

Adapters are generated automatically when you run `sdrive init`.

During initialization, you select which tools you use. Only selected tools get adapters.

`AGENTS.md` is the cross-tool standard, so a tool that adopts it works without a
SpecDrive release. For anything not in the list above, register it yourself:

```bash
sdrive adapters:add <name> --path <file> --format md
sdrive adapters:list
sdrive adapters:verify
```

See [docs/tool-adapters.md](docs/tool-adapters.md) for the registry format.

---

## Team Collaboration

SpecDrive supports team roles.

| Role | Can approve | Can implement |
|------|-------------|---------------|
| admin | ✅ | ✅ |
| reviewer | ✅ | ❌ |
| developer | ❌ | ✅ |

Manage team:

```bash
sdrive team:add alice admin
sdrive team:list
sdrive team:update bob reviewer
sdrive team:remove carol
```

`sdrive init` adds the current Git user as the first `admin`. While the roster is
empty, the first member must be the acting Git user, so a typo cannot lock the
person adding it out of every mutating command.

### Sync from GitHub

Automatically pull collaborators from your GitHub repository:

```bash
sdrive team:sync
```

Roles are auto-assigned:

- GitHub admins → `admin`
- Others → `developer`

Reviewer roles must be assigned manually.

---

## Permissions

SpecDrive enforces role-based permissions on both slash commands and CLI commands.

Permission rules live in:

```text
.sdrive/commands/permissions.json
```

The current Git user is detected via:

```bash
git config user.name
```

That user must exist in `.sdrive/team.json`.

If they are not in the team, or their role is not allowed, the command is blocked before execution.

Mutating commands are **deny-by-default**: a command with no rule is refused, not
allowed. Read-only commands may run without a rule. A missing
`.sdrive/scripts/check-permission.js` also fails closed; it is never treated as
"no governance installed, carry on".

Check coverage at any time:

```bash
sdrive permissions:check
```

The only way to bypass permissions is the explicit
`SDRIVE_SKIP_PERMISSIONS=1` test flag. It is reported on stderr when used and
must never be set in a shared environment.

Approval and permission events are written to `.sdrive/audit-log.json` as a
hash chain. Verify it with:

```bash
sdrive audit:verify
```

Customize rules by editing `.sdrive/commands/permissions.json`.

---

## Contributing

Contributions are welcome.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, test, and release rules.
- Read [SECURITY.md](SECURITY.md) before reporting a vulnerability.
- Run `npm ci && npm test` before opening a pull request.
- After changing `agents/`, `commands/`, `dashboard/`, `mcp/`, `schemas/`,
  `scripts/`, or `templates/`, run `npm run dogfood` so the reference
  installation under `.sdrive/` matches the source.

---

## License

MIT
```