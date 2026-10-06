<p align="center">
  <img src="logo.png" alt="SpecDrive" width="120" />
</p>

# SpecDrive

**Enterprise Spec-Driven Development for AI Coding Tools**

SpecDrive gives AI coding tools like GitHub Copilot, Cline, Claude Code, and Cursor a deterministic governance layer for spec-driven development.

It adds:

- 16 specialized governance agents
- Machine-readable JSON schemas
- Requirement → AC → task → test traceability
- Per-version lifecycle tracking
- Human approval gates
- Anti-redundancy checks
- Spec-to-code verification
- Brownfield onboarding for existing projects
- OpenSpec and Spec-Kit migration
- Anti-hallucination controls
- CI/CD integration

---

## Table of Contents

- [Why SpecDrive](#why-specdrive)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Where to Run Commands](#where-to-run-commands)
- [Quickstart](#quickstart)
- [Web Dashboard](#web-dashboard)
- [Onboarding an Existing Project](#onboarding-an-existing-project)
- [Migrating from OpenSpec or Spec-Kit](#migrating-from-openspec-or-spec-kit)
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
- Human approval at every critical phase
- Anti-redundancy engine
- Deterministic governance validator
- Spec-to-code verification
- Per-version lifecycle tracking
- Brownfield onboarding without breaking existing code
- OpenSpec and Spec-Kit migration

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
initialized with. To pull in the latest dashboard, MCP server, scripts, and
schemas, run:

```bash
sdrive update
```

This refreshes **framework-owned** files only:

| Refreshed | Left untouched |
|-----------|----------------|
| `.sdrive/dashboard/` | `.sdrive/specs/` |
| `.sdrive/mcp/` | `.sdrive/governance/` |
| `.sdrive/scripts/` | `.sdrive/constitution.md` |
| `.sdrive/schemas/` | `.sdrive/config.json` |
| `.sdrive/agents/` | `.sdrive/team.json` |
| `.sdrive/templates/` | `.sdrive/workflow-state.json` |
| `.sdrive/logo.png` | |

Preview changes first with a dry run:

```bash
sdrive update --dry-run
```

---

## Where to Run Commands

| Command Type | Where to Run | Example |
|--------------|--------------|---------|
| Terminal command | In your terminal / shell | `sdrive init` |
| Slash command | In your AI tool's chat | `/sdrive:propose "User login"` |

**Rule:** If it starts with `sdrive`, run it in the terminal. If it starts with `/sdrive:`, run it in your AI chat.

---

## Quickstart

1. Initialize the project:

```bash
sdrive init
```

2. Create your constitution:

```text
/sdrive:constitution
```

Optional: If you have an app idea but no product roadmap yet, run `/sdrive:product-plan` to draft a conceptual app overview and approved backlog. Skip it if you already have a plan.

3. Propose a feature:

```text
/sdrive:propose "User login with email and password"
```

4. Implement:

```text
/sdrive:apply
```

5. Write tests:

```text
/sdrive:test user-login
```

6. Review:

```text
/sdrive:review
```

7. Archive (merge to the confirmed target branch and complete the lifecycle):

```text
/sdrive:archive
```

> **Tip:** At any point, run `sdrive dashboard` to open the local web dashboard — a visual view of your specs, features, gates, team, and activity. See [Web Dashboard](#web-dashboard).

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

### What It Shows

- Onboarding status (greenfield, brownfield partial, brownfield complete)
- Detected external spec systems (OpenSpec, Spec-Kit)
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
- Team members and roles
- Recent audit activity

### Feature Detail Page

Click any feature to open its detail page, which has three tabs:

- **Tasks** — the task list for the current version, with status
- **Reports** — every report written for the feature (docs, performance, reviews, security, tests, debug), read straight from `.sdrive/reports/`
- **Spec Files** — the raw spec, plan, tasks, traceability, and review documents for the current version, rendered in the dashboard so you never have to open your repo to read them

### Command Reference

The dashboard also includes a **Commands** page listing every slash command, its owning agent, and its description. Clicking a command opens a detail drawer with its purpose, gates, and validators.

### Filters

The dashboard includes a filter bar:

- Search by feature name
- Filter by phase
- Filter by verification status
- Filter by test coverage
- Show current version only

### Notes

- The dashboard runs locally, starting on port `4747`
- If `4747` is already in use (for example another project's dashboard is running),
  it automatically falls back to the next free port (`4748`, `4749`, …) and prints
  the URL it chose
- Override the starting port with the `SDRIVE_PORT` environment variable
- It reads directly from `.sdrive/`
- No data leaves your machine

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
5. Ask which missing pieces to fill vs. defer
6. Optionally generate a baseline constitution
7. Optionally generate retroactive specs for existing features
8. Optionally migrate OpenSpec or Spec-Kit specs
9. Record onboarding state in `workflow-state.json`

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

## Migrating from OpenSpec or Spec-Kit

Migration is part of onboarding. It runs automatically when OpenSpec or Spec-Kit is detected and the user approves.

### Step 1: Detect

When the Onboarding Agent runs, it scans for:

- `openspec/` folder
- `.specify/` folder

If found, it records them in `.sdrive/onboarding/inventory.json` under `detectedSystems`.

### Step 2: Migrate

The agent will ask:

> "I found an OpenSpec project with 3 specs and 2 changes. Migrate them into SpecDrive?"

Options:

1. Migrate all
2. Skip migration

### What Migration Does

**OpenSpec → SpecDrive:**

- `openspec/specs/<feature>/` → `.sdrive/specs/ongoing/<feature>/v1/`
- `openspec/changes/<name>/` → `.sdrive/specs/ongoing/<name>/v1/`
- `openspec/archive/<feature>/` → `.sdrive/specs/completed/<feature>/v1/`

**Spec-Kit → SpecDrive:**

- `.specify/specs/###-<feature>/` → `.sdrive/specs/ongoing/<feature>/v1/`
- `.specify/memory/constitution.md` → merged into `.sdrive/constitution.md`

### What Migration Preserves

- Original `openspec/` and `.specify/` folders are never deleted
- All migrated features are marked `retroactive: true`
- Every migrated feature records `migratedFrom: openspec` or `migratedFrom: speckit`
- Every migration is logged in `workflow-state.json` under `onboarding.migrated`
- Skipped migrations are logged under `onboarding.skipped`

### What Migration Does NOT Do

- Does not overwrite existing SpecDrive files
- Does not invent requirements
- Does not link tests
- Does not run verification
- Does not modify source code

---

## Core Workflow

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

Creates the feature specification, traceability matrix, technical plan, and execution tasks.

**What it does:**

- Accepts a natural feature description
- Generates a kebab-case feature name
- Uses default template from `.sdrive/config.json`
- Creates spec, plan, tasks, and traceability files
- Assigns the feature to `v1` automatically if new
- Runs anti-redundancy check
- Requires two human approval gates

**When to use:**

- Whenever a new feature is needed
- Before any code is written

---

### 2b. `/sdrive:update-propose`

Extends an **existing** feature specification with new requirements, user stories, and acceptance criteria.

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

- **Moves the feature from `specs/backlog/` to `specs/ongoing/`** and sets the version's `phase` to `ongoing`
- Reads approved tasks and plan from the current version
- Creates the feature's OWN branch, `feature/<feature>` — one branch per feature (CON-606)
- Creates the feature branch with a suggested name and user approval
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
- Runs `sdrive verify <feature>` and the governance validator

**When to use:**

- After `/sdrive:apply`
- Before `/sdrive:review`

**Batch mode:**

- `/sdrive:test --all` — test every ongoing feature, one after the other

---

### 5. `/sdrive:review`

Final audit and pass/fail verdict. Does **not** merge or archive.

**What it does:**

- Verifies coverage: every AC has a linked, existing, passing test
- Runs spec-to-code verification
- Audits code against spec and traceability
- Writes a `review.md` report with `Status: PASS` or `Status: FAIL`
- On failure: records the findings in `review.md`, adds fix tasks, and stops (no PR, no branch, no merge)
- On pass: notifies you to run `/sdrive:archive <feature>`
- Requires human approval before the verdict is recorded

**When to use:**

- After `/sdrive:test`
- Before shipping to production

**Batch mode:**

- `/sdrive:review --all` — review every ongoing feature one after the other (a failed feature is never cleared for archive)

---

### 6. `/sdrive:archive`

Merges an approved feature to the confirmed target branch and completes its lifecycle.

**What it does:**

- Requires a passing `review.md` for the current version (Review-First Rule)
- Requires human merge approval
- Merges the current version and marks it as `completed`
- Moves the feature folder from `ongoing/` to `completed/`
- Preserves older versions
- Updates governance and workflow state, then cleans up the branch
- Verifies permission before and after merge

**When to use:**

- Only after `/sdrive:review` has returned `Status: PASS`

**Batch mode:**

- `/sdrive:archive --all` — archive every ongoing feature that has passed review, one after the other

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
| `/sdrive:archive --all` | Archives every ongoing feature that has passed review. |
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
| `/sdrive:update-propose` | Extend an existing feature spec | When adding requirements to a feature that already exists |
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
| `sdrive update` | Refresh framework files without touching specs or governance |
| `sdrive onboard` | Scan an existing project (usually run automatically by `/sdrive:onboard`) |
| `sdrive validate` | Validate governance files |
| `sdrive config:validate` | Validate `.sdrive/config.json` |
| `sdrive status` | Show feature lifecycle state |
| `sdrive approve <feature> <gate>` | Approve a workflow gate (verifies the stage is genuinely complete) |
| `sdrive create <feature>` | Create feature scaffold (internal) |
| `sdrive team:add <username> <role>` | Add a new team member |
| `sdrive team:remove <username>` | Remove a team member |
| `sdrive team:list` | List all team members |
| `sdrive team:update <username> <role>` | Update a member's role |
| `sdrive team:sync` | Sync team members from GitHub collaborators |
| `sdrive template:list` | List available templates |
| `sdrive template:set <name>` | Set default template |
| `sdrive hooks:install` | Install pre-commit validation hook |
| `sdrive diff <old> <new>` | Show differences between two spec files |
| `sdrive openapi:generate <feature>` | Generate OpenAPI spec from plan.json |
| `sdrive dashboard` | Start local web dashboard |
| `sdrive amend <feature> --reason "..."` | Correct a wrongly-closed record — moves that version back to `ongoing/` (corrective action; new scope uses `sdrive version:new`) |
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
| `completed/` → `ongoing/` | `sdrive amend <feature> --reason "..."` | Corrective action on a wrongly-closed record |

`/sdrive:apply` MUST NOT begin implementation while the spec is still in `backlog/`. If the feature is in neither `backlog/` nor `ongoing/`, the agent stops and asks.

> **Note:** `governance/` is not lifecycle-partitioned. Governance files live at `.sdrive/governance/<feature>/<version>/` regardless of the spec's lifecycle folder.

### Returning to a Completed Feature

`archive` deletes the feature branch, so a completed feature has no branch of its own. To make a further change:

1. **`sdrive amend <feature> --reason "..."`** — for a closure that was *wrong*, for example a feature shipped before its tests were written. It moves that version back to `ongoing/` and resets the `review` gate to `pending`. It asks which branch the work should happen on, and **which branch to base it on** — the detected default branch is recommended, because that is where the merged code now lives. The reason is required and recorded, because that is what makes it a corrective action rather than an edit to history. To *change* a released feature, use `sdrive version:new <feature>` instead — that creates a new version and leaves the released one untouched.
2. Make the change on the new branch.
3. `/sdrive:test` → `/sdrive:review` → `/sdrive:archive`, as normal.

**A minor change is NOT a new version** (CON-604). New versions are only for structural changes — a new workflow, a new user story, or a behaviour change. Small edits stay in the current version, and `/sdrive:update-propose` extends the existing spec in place.

A defect in already-shipped code is a *different* work unit: use a `fix/<ticket>` or `hotfix/<ticket>` branch off the target rather than amending the feature.

### Branching Policy (Enterprise Standard)

One branch per feature is mandatory. The constitution encodes this as **CON-606 – CON-612**, so it is enforceable project governance, not just agent guidance.

| Rule | Requirement |
|------|-------------|
| **CON-606** | **One branch per feature.** Two features never share a branch, and a feature is never implemented on another feature's branch |
| **CON-607** | The branch is named `feature/<feature-name>` (kebab-case). If that name is taken, append `-v2`, `-v3`, … |
| **CON-608** | Never implement on the repository's default or protected branch. The default branch is resolved dynamically — never assumed to be `main` |
| **CON-609** | Branch from an approved base branch with a clean working tree (`git status --porcelain` must be empty) |
| **CON-610** | Delete the feature branch after a confirmed merge — locally (`git branch -d`) and on the remote (`git push origin --delete`) — unless the user declines. Never delete the merge target branch |
| **CON-611** | One review unit per branch. `/sdrive:archive` refuses to merge a branch that contains other in-flight features' commits |
| **CON-612** | Base a feature branch on the branch it will merge into — `git log <target>..<base>` must be empty. Stacking on another in-flight feature branch is reported with its consequences and must be confirmed, never silent. Dependent work uses `sdrive version:new`, not a stacked feature |

`/sdrive:apply` always creates or resumes the feature's **own** branch. Resuming the same feature's existing branch is still one-branch-per-feature. `/sdrive:archive` asks which branch to merge into (detected, never assumed), then asks separately whether to delete the feature branch.

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
│       └── <version>/
├── onboarding/           # Brownfield onboarding inventory + migration results
├── mcp/                  # MCP server config for AI chat integration
├── prototype/            # UI/UX prototypes
├── reports/              # Security, performance, docs, tests, debug reports
├── context/              # Discovered project context
├── dashboard/            # Local web dashboard
├── skills/               # AI skills
├── templates/            # Starter templates
├── constitution.md       # Governance source of truth
├── config.json           # Default template + settings
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

### Pre-commit Hook

Validate governance and verify ready features before every commit:

```bash
sdrive hooks:install
```

The hook runs the governance validator, then `sdrive verify` for each feature whose `phase` is `ongoing` **and** whose `implementation` gate is `approved`. Deferred, backlog, and in-progress features are skipped — so one feature's state never blocks commits for another.

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

SpecDrive ships with a GitHub Actions workflow.

Create `.github/workflows/sdrive-governance.yml`:

```yaml
name: SpecDrive Governance Validation

on:
  pull_request:
    branches:
      - main
    paths:
      - '.sdrive/**'
      - 'package.json'

jobs:
  validate-governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install Dependencies
        run: |
          cd .sdrive
          npm install
      - name: Run Governance Validation
        run: node .sdrive/scripts/validate-governance.js
      - name: Run Spec-to-Code Verification
        run: node .sdrive/scripts/verify.js
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
| `specdrive.status` | Get status summary |

---

## Tool Support

SpecDrive supports 15 AI tools.

| Tool | Adapter |
|------|---------|
| GitHub Copilot | `.github/copilot-instructions.md` |
| Cline | `.clinerules/sdrive.md` |
| Claude Code | `.claude/commands/sdrive.md` |
| Cursor | `.cursor/rules/sdrive.md` |
| VS Code | `.vscode/sdrive-commands.json` |
| Amazon Q Developer | `.amazonq/rules/sdrive.md` |
| Gemini CLI | `.gemini/commands/sdrive.md` |
| Continue | `.continue/rules/sdrive.md` |
| Codex | `.codex/rules/sdrive.md` |
| Windsurf | `.windsurf/rules/sdrive.md` |
| Kilo Code | `.kilocode/rules/sdrive.md` |
| OpenCode | `.opencode/rules/sdrive.md` |
| Qoder | `.qoder/rules/sdrive.md` |
| Qwen Code | `.qwen/rules/sdrive.md` |
| Rovo Dev CLI | `.rovo/rules/sdrive.md` |

Adapters are generated automatically when you run `sdrive init`.

During initialization, you select which tools you use. Only selected tools get adapters.

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

Customize rules by editing `.sdrive/commands/permissions.json`.

---

## Contributing

Contributions are welcome.

Please read the constitution and agent definitions before contributing.

---

## License

MIT
```