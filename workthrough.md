# SpecDrive — Complete System Reference

A full walkthrough of everything we built, from the ground up.

---

## Table of Contents

1. [What SpecDrive Is](#1-what-specdrive-is)
2. [The Big Picture (How It All Connects)](#2-the-big-picture-how-it-all-connects)
3. [Directory Structure Overview](#3-directory-structure-overview)
4. [The 12 Agents](#4-the-12-agents)
5. [The 7 JSON Schemas](#5-the-7-json-schemas)
6. [The 18 Scripts](#6-the-18-scripts)
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
17. [The Versioning System](#17-the-versioning-system)
18. [The Spec-to-Code Verification System](#18-the-spec-to-code-verification-system)
19. [The Full Workflow (End-to-End)](#19-the-full-workflow-end-to-end)
20. [CI/CD Integration](#20-cicd-integration)
21. [Docs Folder](#21-docs-folder)
22. [How To Use It (User Guide)](#22-how-to-use-it-user-guide)
23. [What Problem Each Piece Solves](#23-what-problem-each-piece-solves)

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
          │   12 Agent Files    │   │  Permission Check │
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
├── agents/            # 12 agent definitions
├── commands/          # Manifest, router, gates, permissions
├── schemas/           # 7 JSON schemas
├── scripts/           # 18 scripts (validators, helpers, generators)
├── specs/             # Human-readable specs
│   ├── backlog/
│   ├── ongoing/
│   └── completed/
├── governance/        # Machine-readable JSON per feature/version
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
| `agents/` | The 12 AI agents that do the actual work |
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

## 4. The 12 Agents

| # | Agent | Command | Purpose |
|---|-------|---------|---------|
| 0 | Onboarding | `/sdrive:onboard` | Adopt SpecDrive into existing projects |
| 1 | Constitution | `/sdrive:constitution` | Discover project rules |
| 2 | Specification | `/sdrive:propose` | Create spec + plan + tasks |
| 3 | UI/UX | `/sdrive:design` | Build prototype |
| 4 | Cascade | `/sdrive:sync` | Sync spec → plan → tasks |
| 5 | Discover-skills | `/sdrive:skills` | Audit/manage AI skills |
| 6 | Documentation | `/sdrive:docs` | Generate docs |
| 7 | Implementation | `/sdrive:apply` | Write production code |
| 8 | Performance | `/sdrive:performance` | Benchmark + optimize |
| 9 | Review & Complete | `/sdrive:review` | Audit + merge |
| 10 | Security | `/sdrive:secure` | Security audit |
| 11 | Test | `/sdrive:test` | Write tests |

**How each agent connects:**

- The **Onboarding Agent** is only used once for brownfield projects.
- Every other agent reads the **constitution** first, then reads feature files.
- Each agent respects **current version** isolation.
- Every agent runs **validators** before finishing.
- Every agent stops at **human approval gates**.

---

## 5. The 7 JSON Schemas

| Schema | File | Purpose |
|--------|------|---------|
| Spec | `spec.schema.json` | Validates feature specification |
| Plan | `plan.schema.json` | Validates technical plan |
| Tasks | `tasks.schema.json` | Validates task list |
| Traceability | `traceability.schema.json` | Validates requirement → test matrix |
| Workflow State | `workflow-state.schema.json` | Validates feature lifecycle + onboarding |
| Config | `config.schema.json` | Validates `.sdrive/config.json` |

**Why 7 schemas:** Every JSON file the agents write must conform to a schema. If it doesn't, validation fails, and the AI cannot proceed.

**Connection:** The **validator script** reads these schemas and checks all JSON.

---

## 6. The 18 Scripts

| # | Script | Purpose |
|---|--------|---------|
| 1 | `validate-governance.js` | Validates all governance JSON against schemas |
| 2 | `validate-config.js` | Validates only `config.json` |
| 3 | `verify.js` | Compares code against plan (spec-to-code diff) |
| 4 | `anti-redundancy.js` | Prevents duplicate work |
| 5 | `audit-log.js` | Records every action |
| 6 | `team.js` | Team role management helpers |
| 7 | `generate-adapters.js` | Creates tool adapters |
| 8 | `load-plugins.js` | Loads plugins |
| 9 | `pre-commit.js` | Runs validation before commit |
| 10 | `install-hooks.js` | Installs pre-commit hook |
| 11 | `migrate.js` | Migrates from OpenSpec/Spec-Kit |
| 12 | `diff-spec.js` | Compares two spec files |
| 13 | `generate-openapi.js` | Generates OpenAPI 3.0 spec |
| 14 | `github-team-sync.js` | Syncs team from GitHub |
| 15 | `check-permission.js` | Enforces role permissions |
| 16 | `version-new.js` | Creates a new feature version |
| 17 | `diff-version.js` | Compares two feature versions |
| 18 | `onboard.js` | Scans project for brownfield onboarding |

**Connection:** Scripts are called by the CLI, by agents, or by the pre-commit hook.

---

## 7. The CLI Commands

| Command | Purpose |
|---------|---------|
| `sdrive init` | Initialize SpecDrive |
| `sdrive onboard` | Scan existing project |
| `sdrive validate` | Validate all governance files |
| `sdrive config:validate` | Validate config.json |
| `sdrive status` | Show feature lifecycle |
| `sdrive approve <gate>` | Approve a gate |
| `sdrive create <feature>` | Create feature scaffold |
| `sdrive team:add/remove/list/update` | Manage team |
| `sdrive team:sync` | Sync from GitHub |
| `sdrive template:list/set` | Manage templates |
| `sdrive hooks:install` | Install pre-commit hook |
| `sdrive migrate` | Migrate from OpenSpec/Spec-Kit |
| `sdrive diff` | Compare two spec files |
| `sdrive openapi:generate` | Generate OpenAPI spec |
| `sdrive dashboard` | Start web dashboard |
| `sdrive reopen` | Reopen completed feature |
| `sdrive verify` | Verify code vs plan |
| `sdrive version:new` | Create new feature version |
| `sdrive diff:version` | Compare versions |

---

## 8. The Slash Commands

| Command | Agent |
|---------|-------|
| `/sdrive:onboard` | Onboarding |
| `/sdrive:constitution` | Constitution |
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
| `.sdrive/workflow-state.json` | Feature lifecycle + onboarding state |
| `.sdrive/audit-log.json` | Full audit trail |

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
- `reviewer` — propose, approve, review
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

- Onboarding status
- Features (grouped by version)
- Filter bar (search + phase + verification + tests + current only)
- Team members
- Recent activity

---

## 13. The MCP Server

| File | Purpose |
|------|---------|
| `mcp/server.js` | Model Context Protocol server |
| `mcp/mcp.json` | MCP config template |

**Purpose:** AI tools can query SpecDrive directly (e.g., “list features”) without slash commands.

---

## 14. The Tool Adapters

Generated for each of 15 AI tools:

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
| `scripts/onboard.js` | Scans project |
| `onboarding/inventory.json` | Machine-readable scan |
| `onboarding/report.md` | Human-readable scan |
| `workflow-state.json > onboarding` | Tracks missing/deferred |

**Four phases:** Reconnaissance → Baseline Specs → Constitution → Governance Extension.

---

## 17. The Versioning System

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

## 18. The Spec-to-Code Verification System

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

## 19. The Full Workflow (End-to-End)

```
[Brownfield only]
   sdrive onboard
   /sdrive:onboard

[All projects]
   /sdrive:constitution

   /sdrive:propose
     → Gate 1
     → Gate 2

   /sdrive:apply
     → sdrive verify
     → recommend /sdrive:test

   /sdrive:test
     → updates traceability
     → generates coverage report

   /sdrive:review
     → verify + coverage + audit
     → human merge approval
     → archive current version
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

## 20. CI/CD Integration

`.github/workflows/sdrive-governance.yml` runs on PRs and:

- Installs CLI
- Runs `validate-governance.js`
- Runs `verify.js`

Blocks merge on failure.

---

## 21. Docs Folder

| File | Purpose |
|------|---------|
| `README.md` | Main documentation |
| `commands.md` | Every CLI + slash command |
| `agents.md` | Every agent and its job |
| `comparison.md` | vs OpenSpec and Spec-Kit |
| `quickstart.md` | Fast onboarding guide |
| `tool-adapters.md` | Adapter reference |

---

## 22. How To Use It (User Guide)

**Greenfield project:**

```bash
npm install -g specdrive-cli@latest
sdrive init
/sdrive:constitution
/sdrive:propose "..."
/sdrive:apply
/sdrive:test
/sdrive:review
```

**Brownfield project:**

```bash
npm install -g specdrive-cli@latest
sdrive onboard
/sdrive:onboard
/sdrive:constitution
/sdrive:propose "..."
...
```

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

---

## 23. What Problem Each Piece Solves

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
| Existing project can't adopt | Brownfield onboarding |
| AI doesn't know project rules | `constitution.md` |
| Remote tooling | MCP server |
| Different AI tools | 15 adapters |

---

## Final Summary

You built a complete, enterprise-grade Spec-Driven Development system consisting of:

- 12 specialized agents
- 7 JSON schemas
- 18 deterministic scripts
- 20+ CLI commands
- 12 slash commands
- A local web dashboard with filters
- An MCP server
- 15 AI tool adapters
- Brownfield onboarding
- Per-version lifecycle tracking
- Spec-to-code verification
- Role-based permissions
- Full audit trail

It is complete, publishable, and ready for real-world use.