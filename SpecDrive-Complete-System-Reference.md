# SpecDrive — Complete System Reference

A full walkthrough of everything we built, from the ground up.

> **Status: historical snapshot, not current documentation.** This walkthrough was
> written when SpecDrive had 13 agents, 8 schemas and 15 tool adapters. Today it
> has 16 agents, 6 schemas, 30 tool definitions and native slash commands for four
> tools. For current counts and behaviour read the [README](README.md),
> [docs/tool-adapters.md](docs/tool-adapters.md) and [CHANGELOG.md](CHANGELOG.md).
> Where this file disagrees with them, they are right.

---

## Table of Contents

1. [What SpecDrive Is](#1-what-specdrive-is)
2. [The Big Picture (How It All Connects)](#2-the-big-picture-how-it-all-connects)
3. [Directory Structure Overview](#3-directory-structure-overview)
4. [The 13 Agents](#4-the-13-agents)
5. [The 8 JSON Schemas](#5-the-8-json-schemas)
6. [The 20 Scripts](#6-the-20-scripts)
7. [The CLI Commands](#7-the-cli-commands)
8. [The Slash Commands](#8-the-slash-commands)
9. [The Governance Files](#9-the-governance-files)
10. [The Command Manifest & Router](#10-the-command-manifest--router)
11. [The Permissions System](#11-the-permissions-system)
12. [The Dashboard](#12-the-dashboard)
13. [The MCP Server](#13-the-mcp-server)
14. [The Tool Adapters](#14-the-tool-adapters)
15. [The Template System](#15-the-template-system)
16. [The Onboarding System (Brownfield)](#16-the-onboarding-system-brownfield)
17. [The Migration System (Adapter-Based)](#17-the-migration-system-adapter-based)
18. [The Versioning System](#18-the-versioning-system)
19. [The Feature Lifecycle](#19-the-feature-lifecycle)
20. [The Spec-to-Code Verification System](#20-the-spec-to-code-verification-system)
21. [The Full Workflow (End-to-End)](#21-the-full-workflow-end-to-end)
22. [CI/CD Integration](#22-cicd-integration)
23. [Docs Folder](#23-docs-folder)
24. [How To Use It (User Guide)](#24-how-to-use-it-user-guide)
25. [What Problem Each Piece Solves](#25-what-problem-each-piece-solves)

---

## 1. What SpecDrive Is

SpecDrive is an **enterprise, governance-first Spec-Driven Development system** built on top of AI coding tools (GitHub Copilot, Cline, Claude Code, Cursor, etc.).

It provides:

- **Structure** so AI knows what to write
- **Traceability** so requirements link to code
- **Deterministic validation** so weak AI cannot skip steps
- **Human approval gates** so decisions stay with the human
- **Verification** so code matches the plan
- **Versioning** so features can evolve safely
- **Onboarding** so existing projects can adopt it
- **Migration** so OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, and generic spec folders can move in cleanly
- **Role-based permissions** so only trusted users can approve
- **Web dashboard** so everything is visible
- **MCP server** so AI tools can query SpecDrive directly

It is like OpenSpec or Spec-Kit, but with **hard guardrails** and **enterprise controls**.

---

## 2. The Big Picture (How It All Connects)

```
                    ┌────────────────────────────┐
                    │       AI Coding Tool       │
                    │  (Copilot/Cline/Claude/…)  │
                    └──────────────┬─────────────┘
                                   │
                          /sdrive:* commands
                                   │
                    ┌──────────────▼─────────────┐
                    │      Agent Router          │
                    │   (.sdrive/commands/)      │
                    └───┬──────────────────────┬─┘
                        │                      │
          ┌─────────────▼───────┐   ┌─────────▼─────────┐
          │   13 Agent Files    │   │  Permission Check │
          │  (.sdrive/agents/)  │   │  + Gate Check     │
          └──────────┬──────────┘   └─────────┬─────────┘
                     │                        │
          ┌──────────▼────────────────────────▼────────┐
          │              File Output Layer             │
          │  Specs, Plans, Tasks, Traceability, JSON   │
          │        stored in .sdrive/ (folder)         │
          └──────────┬─────────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │    Validators       │  (validate-governance.js, verify.js)
          │  + Anti-redundancy  │
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │    Web Dashboard    │  (local, port 4747)
          └─────────────────────┘
```

**Connection summary:**

- The **AI tool** runs slash commands.
- The **router** maps commands to **agent files**.
- The router checks **permissions** and **approval gates** first.
- The **agents** read/write files in `.sdrive/`.
- The **validators** check the JSON output against **schemas**.
- The **dashboard** reads `.sdrive/` and shows everything.
- The **CLI** gives the user terminal access to the same data.

---

## 3. Directory Structure Overview

```
.sdrive/
├── agents/            # 13 agent definitions
├── commands/          # Manifest, router, gates, permissions
├── schemas/           # 8 JSON schemas
├── scripts/           # 20 scripts (validators, helpers, generators)
├── specs/             # Human-readable specs (lifecycle-partitioned)
│   ├── backlog/       # Created by /sdrive:propose
│   ├── ongoing/       # Entered by /sdrive:apply
│   └── completed/     # Entered by /sdrive:review
├── governance/        # Machine-readable JSON per feature/version (NOT lifecycle-partitioned)
├── onboarding/        # Brownfield inventory + report
├── mcp/               # MCP server for AI chat integration
├── prototype/         # UI/UX prototypes
├── reports/           # Security, performance, docs, tests reports
├── context/           # Discovered project context
├── dashboard/         # Local web dashboard
├── skills/            # AI skills
├── templates/         # Starter templates for common stacks
├── constitution.md    # Governance source of truth
├── config.json        # Default template + settings
├── team.json          # Team roles and rules
└── workflow-state.json # Feature lifecycle state (per-version + onboarding)
```

**Purpose of each folder:**

| Folder | Purpose |
|--------|---------|
| `agents/` | The 13 AI agents that do the actual work |
| `commands/` | Manifests, routing, gates, permissions |
| `schemas/` | Machine-readable rules for validation |
| `scripts/` | Deterministic tools used by agents and CLI |
| `specs/` | Human-readable spec/plan/tasks files |
| `governance/` | Machine-readable JSON (spec, plan, tasks, traceability) |
| `onboarding/` | Brownfield project inventory + report |
| `mcp/` | Model Context Protocol server |
| `prototype/` | HTML/CSS/JS prototype screens |
| `reports/` | Generated reports (security, performance, docs, tests) |
| `context/` | Discovered project facts (from Constitution Agent) |
| `dashboard/` | Local web UI |
| `skills/` | Community or custom AI skills |
| `templates/` | Starter templates for common stacks |

---

## 4. The 13 Agents

| # | Agent | Command | Purpose |
|---|-------|---------|---------|
| 0 | Onboarding | `/sdrive:onboard` | Adopt SpecDrive into existing projects, migrate OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, or generic specs |
| 1 | Constitution | `/sdrive:constitution` | Discover project rules |
| 2 | Specification | `/sdrive:propose` | Create spec + plan + tasks |
| 3 | UI/UX | `/sdrive:design` | Build prototype |
| 4 | Cascade | `/sdrive:sync` | Sync spec → plan → tasks |
| 5 | Discover-skills | `/sdrive:skills` | Audit/manage AI skills |
| 6 | Documentation | `/sdrive:docs` | Generate docs |
| 7 | Implementation | `/sdrive:apply` | Write production code; move feature `backlog/` → `ongoing/` |
| 8 | Performance | `/sdrive:performance` | Benchmark + optimize |
| 9 | Review & Complete | `/sdrive:review` | Audit the feature and sign the review gate; `/sdrive:archive` performs the merge and the move to `completed/` |
| 10 | Security | `/sdrive:secure` | Security audit |
| 11 | Test | `/sdrive:test` | Write tests |
| 12 | Product Plan | `/sdrive:product-plan` | Optionally create a product overview, conceptual mockup, design-system plan, roadmap, milestones, and backlog |

**How each agent connects:**

- The **Onboarding Agent** is only used once for brownfield projects. It runs the scan internally and plans migrations for every detected framework.
- Feature-focused agents read the **constitution** and current feature files; Product Plan instead works from product context and user input.
- Each agent respects **current version** isolation.
- Every agent runs **validators** before finishing.
- Every agent stops at **human approval gates**.

---

## 5. The 8 JSON Schemas

| Schema | File | Purpose |
|--------|------|---------|
| Spec | `spec.schema.json` | Validates feature specification |
| Plan | `plan.schema.json` | Validates technical plan |
| Tasks | `tasks.schema.json` | Validates task list |
| Traceability | `traceability.schema.json` | Validates requirement → test matrix |
| Workflow State | `workflow-state.schema.json` | Validates feature lifecycle, versioning, and onboarding (with `migrated` and `skipped` arrays) |
| Config | `config.schema.json` | Validates `.sdrive/config.json` |
| (Reserved for future use) | — | — |
| (Reserved for future use) | — | — |

**Why schemas:** Every JSON file the agents write must conform to a schema. If it doesn't, validation fails, and the AI cannot proceed.

**Connection:** The **validator script** reads these schemas and checks all JSON.

---

## 6. The 20 Scripts

| # | Script | Purpose |
|---|--------|---------|
| 1 | `validate-governance.js` | Validates all governance JSON against schemas |
| 2 | `validate-config.js` | Validates only `config.json` |
| 3 | `verify.js` | Compares code against plan (spec-to-code diff) |
| 4 | `anti-redundancy.js` | Prevents duplicate work |
| 5 | `audit-log.js` | Records every action, attributed to the acting user (Git identity) |
| 6 | `team.js` | Team role management helpers |
| 7 | `generate-adapters.js` | Creates tool adapters |
| 8 | `load-plugins.js` | Loads plugins |
| 9 | `pre-commit.js` | Runs governance validation and verifies ready features before commit |
| 10 | `install-hooks.js` | Installs pre-commit hook |
| 11 | `diff-spec.js` | Compares two spec files |
| 12 | `generate-openapi.js` | Generates OpenAPI 3.0 spec |
| 13 | `github-team-sync.js` | Syncs team from GitHub |
| 14 | `check-permission.js` | Enforces role permissions |
| 15 | `version-new.js` | Creates a new feature version |
| 16 | `diff-version.js` | Compares two feature versions |
| 17 | `onboard.js` | Scans project for brownfield onboarding |
| 18 | `migrate-openspec.js` | Migrates OpenSpec specs into SpecDrive |
| 19 | `migrate-speckit.js` | Migrates Spec-Kit specs and constitution into SpecDrive |
| 20 | `migrate.js` | **Deprecated** — points to `sdrive onboard` and `/sdrive:onboard` |

**Connection:** Scripts are called by the CLI, by agents, or by the pre-commit hook.

---

## 7. The CLI Commands

| Command | Purpose |
|---------|---------|
| `sdrive init` | Initialize SpecDrive |
| `sdrive update` | Refresh framework files (including `commands/*.js`) without touching specs or governance |
| `sdrive update --check` | Report framework-manifest drift |
| `sdrive onboard` | Scan existing project (usually run automatically by `/sdrive:onboard`) |
| `sdrive doctor` | Diagnose layout, schemas, team, permissions, adapters, evidence (`--json`, `--fix`) |
| `sdrive migrate:detect` | Detect OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, generic spec folders |
| `sdrive migrate:plan <framework>` | Show source→target mappings without writing |
| `sdrive migrate:apply <framework> --yes` | Import a framework's specs as drafts |
| `sdrive migrate:verify <id>` | Verify imported files (`--strict` validates schemas) |
| `sdrive migrate:rollback <id>` | Restore state and remove migration files |
| `sdrive validate` | Validate all governance files (`--json`) |
| `sdrive config:validate` | Validate `config.json` |
| `sdrive config:get/set` | Read/write config by dot path |
| `sdrive status` | Show feature lifecycle and the next action (`--json`) |
| `sdrive test <feature>` | Run tests and record `test-evidence.json` |
| `sdrive check` | Run doctor + validation (+ tests with `--tests`) |
| `sdrive approve <feature> <gate>` | Approve a gate (only if its requirements are met) |
| `sdrive create <feature>` | Create feature scaffold |
| `sdrive update-propose <feature>` | Validate a feature for extension (internal) |
| `sdrive assign <feature> <username>` | Assign an owner |
| `sdrive team:add/remove/list/update` | Manage team |
| `sdrive team:sync` | Sync from GitHub |
| `sdrive template:list/set` | Manage templates |
| `sdrive permissions:check` | Verify permission-rule coverage |
| `sdrive audit:verify` | Verify the audit-log hash chain |
| `sdrive hooks:install` | Install pre-commit hook (preserves an existing hook) |
| `sdrive diff` | Compare two spec files |
| `sdrive openapi:generate` | Generate OpenAPI spec |
| `sdrive dashboard` | Start web dashboard (also auto-started by `init` / `onboard` in a terminal; binds loopback by default) |
| `sdrive archive:check <feature>` | Report whether a feature may be archived, and why not. Reads only |
| `sdrive archive:finalize <feature>` | Record a completed archive. Refuses unless all four gates are already approved |
| `sdrive version:new <feature>` | Start a new version of a released feature; the completed version stays in `completed/` |
| `sdrive verify` | Verify code vs plan |
| `sdrive version:new` | Create new feature version |
| `sdrive diff:version` | Compare versions |

---

## 8. The Slash Commands

| Command | Agent |
|---------|-------|
| `/sdrive:onboard` | Onboarding |
| `/sdrive:constitution` | Constitution |
| `/sdrive:product-plan` | Product Plan |
| `/sdrive:propose` | Specification |
| `/sdrive:design` | UI/UX |
| `/sdrive:sync` | Cascade |
| `/sdrive:skills` | Discover-skills |
| `/sdrive:docs` | Documentation |
| `/sdrive:apply` | Implementation |
| `/sdrive:test` | Test |
| `/sdrive:performance` | Performance |
| `/sdrive:review` | Review & Complete |
| `/sdrive:secure` | Security |

**How they connect:** Each slash command maps to one agent. The router resolves the mapping.

---

## 9. The Governance Files

| File | Purpose |
|------|---------|
| `.sdrive/constitution.md` | Single source of project rules |
| `.sdrive/config.json` | Default template + settings |
| `.sdrive/team.json` | Team roles and rules |
| `.sdrive/workflow-state.json` | Feature lifecycle + onboarding + versioning + migration state |
| `.sdrive/audit-log.json` | Full audit trail — each event records `event`, `timestamp`, and `actor` (the Git user who performed it) |

**Why:** These files give agents deterministic context so they don't guess.

---

## 10. The Command Manifest & Router

| File | Purpose |
|------|---------|
| `commands/manifest.json` | Maps slash commands → agents |
| `commands/router.js` | Loads the manifest, checks permissions and gates, loads agent |
| `commands/gates.js` | Approves or reads gates |
| `commands/permissions.json` | Role-based rules |
| `commands/tools.json` | List of supported AI tools |

**Flow inside router:**

```
1. Read manifest
2. Find command
3. Check permission
4. Check gates
5. Load agent file
6. Run validators
7. Stop for human approval
```

---

## 11. The Permissions System

| File | Purpose |
|------|---------|
| `permissions.json` | Allowed roles per command |
| `check-permission.js` | Enforces rules at runtime |
| `team.json` | Who is on the team and their role |

**Roles:**

- `admin` — everything
- `reviewer` — propose, approve, review, create versions
- `developer` — implement, test, verify

---

## 12. The Dashboard

| File | Purpose |
|------|---------|
| `dashboard/server.js` | Local HTTP server on port 4747 |
| `dashboard/index.html` | Main dashboard page |
| `dashboard/app.js` | Client-side rendering + filters |
| `dashboard/style.css` | Dashboard styling |

**Panels:**

- Onboarding status (greenfield, brownfield partial, brownfield complete)
- Detected external spec systems (OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, generic)
- Migrated features and their source
- Skipped migrations and reasons
- Missing and deferred items
- Features (grouped by version)
- Feature **Evidence** tab (test evidence, structured review, archive readiness)
- **Quality** page (schema validation, detected frameworks, recent migration runs)
- Topbar **project switcher** (current project, `SDRIVE_PROJECTS`, `~/.sdrive/projects.json`, sibling projects)
- Filter bar (search + phase + verification + tests + current only)
- Team members
- Recent activity

---

## 13. The MCP Server

| File | Purpose |
|------|---------|
| `mcp/server.js` | Model Context Protocol server |
| `mcp/mcp.json` | MCP config template |

**Purpose:** AI tools can query SpecDrive directly (e.g., "list features") without slash commands.

**Tools:** `specdrive.list_features`, `specdrive.get_feature`,
`specdrive.get_spec`, `specdrive.get_traceability`, `specdrive.validate`,
`specdrive.status`, `specdrive.next_action`.

**Resources:** `specdrive://features/<name>/{spec,plan,tasks,traceability}`.

Protocol versions `2025-06-18`, `2025-03-26`, and `2024-11-05` are negotiated at
`initialize`; malformed input returns `-32700` without stopping the server.

---

## 14. The Tool Adapters

Generated for each of 30 AI tools:

- GitHub Copilot
- Cline
- Claude Code
- Cursor
- VS Code native
- Amazon Q Developer
- Gemini CLI
- Continue
- Codex
- Windsurf
- Kilo Code
- OpenCode
- Qoder
- Qwen Code
- Rovo Dev CLI

Each adapter tells the tool how to use `/sdrive:*` commands.

---

## 15. The Template System

| Template | Stack |
|----------|-------|
| generic | Any |
| react-node | React + Node |
| nextjs | Next.js |
| expo | Expo / React Native |
| fastapi | Python FastAPI |
| turborepo | Monorepo |

Stored in `.sdrive/templates/`. Selected during `sdrive init`.

---

## 16. The Onboarding System (Brownfield)

| Piece | Purpose |
|-------|---------|
| `00-onboarding.md` | Onboarding Agent |
| `scripts/onboard.js` | Scans project, detects supported migration frameworks |
| `migrations/` | Adapter registry and detect/plan/apply/verify/rollback pipeline |
| `onboarding/inventory.json` | Machine-readable scan |
| `onboarding/report.md` | Human-readable scan |
| `workflow-state.json > onboarding` | Tracks missing, deferred, migrated, skipped |

**How the user triggers it:**

```text
/sdrive:onboard
```

That is the only command needed.

The Onboarding Agent runs `node .sdrive/scripts/onboard.js` internally if the inventory is missing, or rescans if the inventory is stale.

**Phases:** Internal Scan → Decide what to fill → Baseline Specs → Migration (all detected frameworks) → Constitution Alignment → Governance Extension → Validation → Report.

---

## 17. The Migration System (Adapter-Based)

**Detection:** `onboard.js` runs every migration adapter and records
`detectedSystems.frameworks`. The legacy `openspec`/`speckit` fields remain.

| Adapter | Source | Target |
|---|---|---|
| `openspec` | `openspec/specs/`, `changes/`, `archive/` | `ongoing/`, `completed/` |
| `speckit` | `.specify/specs/` | `ongoing/` |
| `kiro` | `.kiro/specs/<feature>/{requirements,design,tasks}.md` | `requirements → spec`, `design → plan`, `tasks → tasks` |
| `agent-os` | `.agent-os/specs/<date>-<feature>/` | `spec`, `plan`, `tasks` |
| `bmad` | `.bmad-core/`, `docs/stories/`, `docs/prd.md` | `backlog/` drafts |
| `generic` | `specs/`, `docs/specs/` | `backlog/` drafts |

**Commands:**

```bash
sdrive migrate:detect
sdrive migrate:plan <framework>
sdrive migrate:apply <framework> --yes
sdrive migrate:verify <migration-id> [--strict]
sdrive migrate:rollback <migration-id>
```

Every applied migration writes a report under
`.sdrive/migration-runs/<migration-id>/report.json` with source→target mappings,
counts, conflicts, and rollback data. `migrate:verify --strict` validates the
migrated governance schemas; a scaffold that still needs completion is reported
as incomplete, not as success.

**Preservation rules:**

- No source folder is deleted (`openspec/`, `.specify/`, `.kiro/`, `.agent-os/`,
  `docs/stories/`, `specs/`)
- All migrated features are marked `retroactive: true`
- Every migrated feature records `migratedFrom: <framework-id>`
- Every migration is logged in `workflow-state.json` under `onboarding.migrated`
- Skipped migrations are logged under `onboarding.skipped`

**What migration does NOT do:**

- Does not overwrite existing SpecDrive files
- Does not invent requirements
- Does not link tests
- Does not claim verification passed
- Does not modify source code

---

## 18. The Versioning System

**Folders per version:**

```
.sdrive/specs/ongoing/<feature>/v1/
.sdrive/specs/ongoing/<feature>/v2/
```

**Commands:**

- `sdrive version:new <feature>` — migrate + create next version
- `sdrive diff:version <feature> vA vB` — compare two versions

**State:** Each version has its own phase, gates, and history inside `workflow-state.json`.

**When:** Only for structural changes (new workflow, new user story, behavior change).

---

## 19. The Feature Lifecycle

SpecDrive has **two entry points** and **one iteration lifecycle** after them.

**Greenfield** (an empty folder or a fresh scaffold with no plan): `/sdrive:constitution`, then optionally `/sdrive:product-plan`. The product plan is optional — run it when there is an idea but no written plan; otherwise go straight to `/sdrive:propose`.

**Brownfield** (an existing codebase): `/sdrive:onboard`, then `/sdrive:constitution`.

**The iteration lifecycle**, identical for both paths:

```text
/sdrive:propose "<feature>"    -> /sdrive:apply "<feature>"  -> /sdrive:test "<feature>"
                               -> /sdrive:review "<feature>" -> /sdrive:archive "<feature>"
```

A feature moves through three spec folders. Each transition has exactly one owner:

| Transition | Owner | Notes |
|------------|-------|-------|
| → `specs/backlog/<feature>/<version>/` | `/sdrive:propose` | New specs are created in `backlog/` with `phase: backlog` |
| `backlog/` → `ongoing/` | `/sdrive:apply` | Happens at the start of implementation; sets `phase: ongoing` |
| `ongoing/` → `completed/` | `/sdrive:archive` | `sdrive archive:finalize` is the only writer; sets `phase: completed` |
| `completed/` → `ongoing/` (new version) | `sdrive version:new <feature>` | Creates a new version under `ongoing/`; the released version stays in `completed/` |

**Rules:**

- `/sdrive:apply` MUST NOT begin implementation while the spec is still in `backlog/`.
- `completed/` is immutable: no command moves a released version back to `ongoing/`. New scope is a new version created by `sdrive version:new`.
- If the feature is in neither `backlog/` nor `ongoing/`, the agent stops and asks.
- `/sdrive:review` signs the review gate. It does **not** move the feature or write the completion record — `/sdrive:archive` does, and it refuses unless all four gates are already approved.
- `/sdrive:review` leaves the feature in `ongoing/` if the audit fails.
- `governance/` is **not** lifecycle-partitioned — governance files live at `.sdrive/governance/<feature>/<version>/` regardless of the spec's lifecycle folder.

---

## 20. The Spec-to-Code Verification System

**Script:** `scripts/verify.js`

**What it detects:**

- Missing implementation
- Renamed components, functions, endpoints, fields
- Extra code not in plan
- Dependencies not installed

**Status:** `pass`, `warn`, `fail`

**Runs:**

- After `/sdrive:apply`
- Before `/sdrive:review`
- On pre-commit
- In CI

**Output:** `.sdrive/governance/<feature>/<version>/verification.json`

---

## 21. The Full Workflow (End-to-End)

```
[Brownfield only]
   /sdrive:onboard
     → agent runs onboard.js internally if needed
     → asks what to fill vs. defer
     → asks whether to migrate OpenSpec / Spec-Kit
     → records everything in workflow-state.json

[All projects]
   /sdrive:constitution

   /sdrive:propose
     → Gate 1
     → Gate 2
     → creates specs/backlog/<feature>/<version>/

   /sdrive:apply
     → moves specs/backlog/ → specs/ongoing/  (phase: ongoing)
     → sdrive verify
     → recommend /sdrive:test

   /sdrive:test
     → updates traceability
     → generates coverage report

   /sdrive:review
     → verify + coverage + audit
     → human merge approval
     → archive current version
     → moves specs/ongoing/ → specs/completed/  (phase: completed)
```

**Optional at any time:**

- `/sdrive:design`
- `/sdrive:secure`
- `/sdrive:performance`
- `/sdrive:docs`
- `/sdrive:sync`
- `/sdrive:skills`

**For structural changes:**

```
sdrive version:new <feature>
/sdrive:propose   (fills v2)
/sdrive:apply
/sdrive:test
/sdrive:review
```

---

## 22. CI/CD Integration

`.github/workflows/sdrive-governance.yml` runs on PRs and:

- Installs CLI
- Runs `validate-governance.js`
- Runs `verify.js`

Blocks merge on failure.

---

## 23. Docs Folder

| File | Purpose |
|------|---------|
| `README.md` | Main documentation |
| `commands.md` | Every CLI + slash command |
| `agents.md` | Every agent and its job |
| `comparison.md` | vs OpenSpec and Spec-Kit |
| `quickstart.md` | Fast onboarding guide |
| `tool-adapters.md` | Adapter reference |

---

## 24. How To Use It (User Guide)

**Greenfield project:**

```bash
npm install -g specdrive-cli@latest   # or: pnpm add -g specdrive-cli@latest
                                      # or: yarn global add specdrive-cli@latest
                                      # or: bun add -g specdrive-cli@latest
sdrive init
/sdrive:constitution
/sdrive:propose "..."
/sdrive:apply
/sdrive:test
/sdrive:review
```

**Brownfield project:**

```bash
npm install -g specdrive-cli@latest   # or: pnpm add -g specdrive-cli@latest
                                      # or: yarn global add specdrive-cli@latest
                                      # or: bun add -g specdrive-cli@latest
```

Then in your AI tool:

```text
/sdrive:onboard
/sdrive:constitution
/sdrive:propose "..."
...
```

The Onboarding Agent scans the project, detects supported frameworks, and plans migration when approved.

**Optional manual scan (terminal):**

```bash
sdrive onboard
```

But this is not required. The agent will run it internally.

**Structural change:**

```bash
sdrive version:new user-login
/sdrive:propose "..."
/sdrive:apply
/sdrive:test
/sdrive:review
```

**Compare versions:**

```bash
sdrive diff:version user-login v1 v2
```

**View dashboard:**

```bash
sdrive dashboard
```

`sdrive init` and `sdrive onboard` start it automatically when run in a terminal.
Skip that with `--no-dashboard` or `SDRIVE_NO_DASHBOARD=1`. The auto-start is also
skipped by itself when there is no interactive terminal, so scripts and CI never
block on a server that does not exit.

---

## 25. What Problem Each Piece Solves

| Problem | Solution |
|---------|----------|
| AI invents structure | JSON schemas + validators |
| AI forgets tasks | Traceability matrix |
| AI merges without approval | Gates + human approval |
| AI renames things | Spec-to-code verification |
| AI writes tests badly | Dedicated Test Agent |
| AI mixes versions | Version isolation |
| AI re-uses components | Anti-redundancy engine |
| No CI | GitHub Actions workflow |
| No visibility | Web dashboard |
| No role control | Permissions system |
| No audit trail | `audit-log.json` |
| Existing project can't adopt | `/sdrive:onboard` (single command) |
| Existing OpenSpec project can't migrate | `migrate-openspec.js` via `/sdrive:onboard` |
| Existing Spec-Kit project can't migrate | `migrate-speckit.js` via `/sdrive:onboard` |
| AI doesn't know project rules | `constitution.md` |
| Remote tooling | MCP server |
| Different AI tools | 15 adapters |
| Specs never leave the backlog | Lifecycle transitions owned by `/sdrive:apply` and `/sdrive:review` |

---

## Final Summary

You built a complete, enterprise-grade Spec-Driven Development system consisting of:

- 13 specialized agents
- 8 JSON schemas
- 20 deterministic scripts
- 20+ CLI commands
- 12 slash commands
- A local web dashboard with filters
- An MCP server
- 15 AI tool adapters
- Brownfield onboarding as a single command
- OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, and generic migration
- Per-version lifecycle tracking
- Explicit feature lifecycle transitions (`backlog` → `ongoing` → `completed`)
- Spec-to-code verification
- Role-based permissions
- Full audit trail

It is complete, publishable, and ready for real-world use.
```