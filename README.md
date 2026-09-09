
```markdown
# SpecDrive

**Enterprise Spec-Driven Development for AI Coding Tools**

SpecDrive gives AI coding tools like GitHub Copilot, Cline, Claude Code, and Cursor a deterministic governance layer for spec-driven development.

It adds:

- 10 specialized governance agents
- Machine-readable JSON schemas
- Requirement → AC → task → test traceability
- Human approval gates
- Anti-redundancy checks
- Anti-hallucination controls
- CI/CD integration

---

## Table of Contents

- [Why SpecDrive](#why-specdrive)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Where to Run Commands](#where-to-run-commands)
- [Quickstart](#quickstart)
- [Core Workflow](#core-workflow)
- [Optional Commands](#optional-commands)
- [Terminal Commands](#terminal-commands)
- [Agents](#agents)
- [Directory Structure](#directory-structure)
- [Validation](#validation)
- [CI/CD Integration](#cicd-integration)
- [Tool Support](#tool-support)
- [Team Collaboration](#team-collaboration)
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

SpecDrive will ask you to select which AI tools you use.

It then creates the `.sdrive/` folder and tool adapters for the selected tools.

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

3. Propose a feature:

```text
/sdrive:propose "User login with email and password"
```

4. Implement:

```text
/sdrive:apply
```

5. Review and merge:

```text
/sdrive:review
```

---

## Core Workflow

### 1. `/sdrive:constitution`

Creates or updates the project constitution.

**What it does:**

- Discovers project stack, coding standards, and architecture
- Creates context files under `.sdrive/context/`
- Merges rules into `.sdrive/constitution.md`
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
- Creates spec, plan, tasks, and traceability files
- Runs anti-redundancy check
- Requires two human approval gates

**When to use:**

- Whenever a new feature is needed
- Before any code is written

---

### 3. `/sdrive:apply`

Writes production code from the approved tasks.

**What it does:**

- Reads approved tasks and plan
- Asks which base branch to pull from
- Creates a feature branch with user approval
- Implements tasks one by one
- Runs validators and tests
- Commits and pushes

**When to use:**

- After spec and plan are approved
- When implementation is ready

---

### 4. `/sdrive:review`

Final audit, merge, and archive.

**What it does:**

- Audits code against spec and traceability
- Runs security and quality checks
- Requires human approval before merging
- Merges to main and archives the feature

**When to use:**

- After implementation is complete
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
| `sdrive validate` | Validate governance files |
| `sdrive status` | Show feature lifecycle state |
| `sdrive approve <gate>` | Approve a workflow gate |
| `sdrive create <feature>` | Create feature scaffold (internal) |
| `sdrive team:add <username> <role>` | Add a new team member |
| `sdrive team:remove <username>` | Remove a team member |
| `sdrive team:list` | List all team members |
| `sdrive team:update <username> <role>` | Update a member's role |

---

## Agents

| Agent | File | Role |
|-------|------|------|
| Constitution | `01-constitution.md` | Discover project rules, merge into constitution |
| Specification | `02-specification.md` | Generate spec, plan, tasks, traceability |
| UI/UX | `03-uiux.md` | Build interactive prototype |
| Cascade | `04-cascade.md` | Sync spec → plan → tasks |
| Discover-skills | `05-discover-skills.md` | Audit AI skills |
| Documentation | `06-documentation.md` | Generate docs, detect drift |
| Implementation | `07-implementation.md` | Write production code |
| Performance | `08-performance.md` | Benchmark and optimize |
| Review & Complete | `09-review-complete.md` | Final audit and merge |
| Security | `10-security.md` | Security audit and fixes |

---

## Directory Structure

```text
.sdrive/
├── agents/               # 10 agent definitions
├── commands/             # Manifest, router, gates
├── schemas/              # JSON schemas
├── specs/                # Human-readable specs
│   ├── backlog/
│   ├── ongoing/
│   └── completed/
├── governance/           # Machine-readable JSON
├── prototype/            # UI/UX prototypes
├── reports/              # Security, performance, docs reports
├── context/              # Discovered project context
├── skills/               # AI skills
├── constitution.md       # Governance source of truth
└── workflow-state.json   # Feature lifecycle state
```

---

## Validation

Run the governance validator:

```bash
sdrive validate
```

This checks all governance JSON against the schemas.

If anything is invalid, it reports exact errors.

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
```

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

---

## Contributing

Contributions are welcome.

Please read the constitution and agent definitions before contributing.

---

## License

MIT
```

---

This README is now clean and correct.