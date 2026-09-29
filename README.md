# SpecDrive

**Enterprise Spec-Driven Development for AI Coding Tools**

SpecDrive gives AI coding tools like GitHub Copilot, Cline, Claude Code, and Cursor a deterministic governance layer for spec-driven development.

It adds:

- 12 specialized governance agents
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
- [Onboarding an Existing Project](#onboarding-an-existing-project)
- [Migrating from OpenSpec or Spec-Kit](#migrating-from-openspec-or-spec-kit)
- [Core Workflow](#core-workflow)
- [Optional Commands](#optional-commands)
- [Terminal Commands](#terminal-commands)
- [Agents](#agents)
- [Templates](#templates)
- [Versions](#versions)
- [Directory Structure](#directory-structure)
- [Validation](#validation)
- [Spec-to-Code Verification](#spec-to-code-verification)
- [CI/CD Integration](#cicd-integration)
- [MCP Server](#mcp-server)
- [Tool Support](#tool-support)
- [Web Dashboard](#web-dashboard)
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

### Global Install

```bash
npm install -g specdrive-cli@latest
```

### Verify Install

```bash
sdrive --version
```

### Initialize a Project

Inside your project root, run:

```bash
sdrive init
```

SpecDrive will ask you to:

1. Select which AI tools you use
2. Select a default template
3. Wire MCP clients (optional)

It then creates the `.sdrive/` folder, tool adapters, and MCP server.

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

Optional: If you have an app idea but no product roadmap yet, run `/sdrive:blueprint` to draft a conceptual app overview and approved backlog. Skip it if you already have a plan.

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

6. Review and merge:

```text
/sdrive:review
```

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

### 3. `/sdrive:apply`

Writes production code from the approved tasks.

**What it does:**

- Reads approved tasks and plan from the current version
- Asks which base branch to pull from
- Creates a feature branch with user approval
- Implements production code only (no tests)
- Runs `sdrive verify <feature>`
- Commits and pushes

**When to use:**

- After spec and plan are approved
- When implementation is ready

---

### 4. `/sdrive:test`

Writes tests for every acceptance criterion, runs them, and reports coverage.

**What it does:**

- Reads spec, plan, tasks, and traceability from the current version
- Detects the project's test framework
- Writes one test per AC
- Requires approval before writing
- Runs tests and updates `traceability.json`
- Generates a coverage report
- Runs `sdrive verify <feature>` and the governance validator

**When to use:**

- After `/sdrive:apply`
- Before `/sdrive:review`

---

### 5. `/sdrive:review`

Final audit, merge, and archive.

**What it does:**

- Verifies coverage: every AC has a linked, existing, passing test
- Runs spec-to-code verification
- Audits code against spec and traceability
- Requires human approval before merging
- Merges to main and archives the feature
- Marks the current version as `completed`
- Preserves older versions

**When to use:**

- After `/sdrive:test`
- Before shipping to production

---

## Optional Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/sdrive:design` | Build UI/UX prototype | When there is no existing prototype |
| `/sdrive:secure` | Security audit and fixes | When security is a concern |
| `/sdrive:performance` | Benchmark and optimize | When performance NFRs are not met |
| `/sdrive:docs` | Generate documentation | When docs are outdated or missing |
| `/sdrive:sync` | Sync spec → plan → tasks | When higher-level files change |
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

Benchmarks and optimizes performance.

**What it does:**

- Measures baseline metrics
- Identifies bottlenecks
- Applies optimizations with approval
- Verifies improvements

**When to use:**

- When performance NFRs are not met
- After major feature implementations

---

### `/sdrive:docs`

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
| `sdrive onboard` | Scan an existing project (usually run automatically by `/sdrive:onboard`) |
| `sdrive validate` | Validate governance files |
| `sdrive config:validate` | Validate `.sdrive/config.json` |
| `sdrive status` | Show feature lifecycle state |
| `sdrive approve <gate>` | Approve a workflow gate |
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
| `sdrive reopen <feature>` | Reopen a completed feature |
| `sdrive verify <feature>` | Verify code matches plan.json |
| `sdrive version:new <feature>` | Create a new version of a feature |
| `sdrive diff:version <feature> <vA> <vB>` | Compare two versions of a feature |

---

## Agents

| Agent | File | Role |
|-------|------|------|
| Onboarding | `00-onboarding.md` | Adopt SpecDrive into an existing project, migrate OpenSpec and Spec-Kit |
| Constitution | `01-constitution.md` | Discover project rules, merge into constitution |
| Blueprint | `12-blueprint.md` | Optionally create a product overview, conceptual mockup, design-system plan, roadmap, and backlog |
| Specification | `02-specification.md` | Generate spec, plan, tasks, traceability |
| UI/UX | `03-uiux.md` | Build interactive prototype |
| Cascade | `04-cascade.md` | Sync spec → plan → tasks |
| Discover-skills | `05-discover-skills.md` | Audit AI skills |
| Documentation | `06-documentation.md` | Generate docs, detect drift |
| Implementation | `07-implementation.md` | Write production code |
| Performance | `08-performance.md` | Benchmark and optimize |
| Review & Complete | `09-review-complete.md` | Final audit and merge |
| Security | `10-security.md` | Security audit and fixes |
| Test | `11-test.md` | Write tests, run them, report coverage |

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

## Directory Structure

```text
.sdrive/
├── agents/               # 13 agent definitions
├── commands/             # Manifest, router, gates, permissions
├── schemas/              # JSON schemas
├── specs/                # Human-readable specs
│   ├── backlog/
│   │   └── <feature>/
│   │       └── <version>/
│   ├── ongoing/
│   └── completed/
├── governance/           # Machine-readable JSON
│   └── <feature>/
│       └── <version>/
├── onboarding/           # Brownfield onboarding inventory + migration results
├── mcp/                  # MCP server for AI chat integration
├── prototype/            # UI/UX prototypes
├── reports/              # Security, performance, docs, tests reports
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

Automatically validate governance files before every commit:

```bash
sdrive hooks:install
```

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

It also asks which MCP clients to wire. Supported:

| Client | Config Path |
|--------|-------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | `.cursor/mcp.json` |
| Cline | `.cline/mcp.json` |
| VS Code | `.vscode/mcp.json` |

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

### Filters

The dashboard includes a filter bar:

- Search by feature name
- Filter by phase
- Filter by verification status
- Filter by test coverage
- Show current version only

### Notes

- The dashboard runs locally on port `4747`
- It reads directly from `.sdrive/`
- No data leaves your machine

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