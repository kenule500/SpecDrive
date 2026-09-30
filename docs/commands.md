# SpecDrive Command Reference

SpecDrive has two types of commands:

- Terminal commands — run in your shell
- Slash commands — run in your AI tool

---

## Terminal Commands

| Command | Purpose |
|---------|---------|
| `sdrive init` | Initialize SpecDrive structure and adapters |
| `sdrive update` | Refresh framework files (dashboard, mcp, scripts, schemas) without touching your specs or governance |
| `sdrive onboard` | Scan an existing project (usually run automatically by `/sdrive:onboard`) |
| `sdrive validate` | Validate all governance files |
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

### `sdrive init`

Initializes SpecDrive in the current project.

```bash
sdrive init
```

Asks one question — which AI tools you use. MCP wiring is applied automatically
for the tools you pick.

Creates:

- `.sdrive/` structure
- `workflow-state.json`
- `constitution.md`
- Tool adapters
- MCP server and config
- `.sdrive/logo.png`

For non-interactive setup, pass `--tools`:

```bash
sdrive init --tools github-copilot
sdrive init --tools github-copilot,cursor,cline
sdrive init --tools all
sdrive init --tools none
```

---

### `sdrive update`

Refreshes framework-owned files from the installed CLI version.

```bash
sdrive update
```

Use this after upgrading the CLI so bug fixes reach an existing project.

Refreshes:

- `.sdrive/dashboard/`
- `.sdrive/mcp/`
- `.sdrive/scripts/`
- `.sdrive/schemas/`
- `.sdrive/agents/`
- `.sdrive/templates/`
- `.sdrive/logo.png`

Leaves untouched:

- `.sdrive/specs/`
- `.sdrive/governance/`
- `.sdrive/constitution.md`
- `.sdrive/config.json`
- `.sdrive/team.json`
- `.sdrive/workflow-state.json`

Preview changes without writing:

```bash
sdrive update --dry-run
```

---

### `sdrive onboard`

Scans the project for onboarding. Usually run automatically by `/sdrive:onboard`.

```bash
sdrive onboard
```

What it does:

- Scans the project for stack, structure, and missing SpecDrive files
- Detects `openspec/` and `.specify/` folders
- Records detected external spec systems in the inventory
- Writes `.sdrive/onboarding/inventory.json` and `report.md`
- Refuses to run twice (checks for an `onboarding` block in `workflow-state.json`)

You do not need to run this manually. The Onboarding Agent runs it internally if needed.

---

### `sdrive validate`

Runs the governance validator.

```bash
sdrive validate
```

Checks all JSON files against schemas, including `config.json`.

---

### `sdrive config:validate`

Validates only `.sdrive/config.json`.

```bash
sdrive config:validate
```

Checks that `defaultTemplate` is a valid template and that no unknown keys exist.

---

### `sdrive status`

Shows all features and their lifecycle state.

```bash
sdrive status
```

For each feature, it lists every version and its phase, step, and gate status.

---

### `sdrive approve <gate>`

Approves a workflow gate.

```bash
sdrive approve specification
```

Allowed gates:

- `specification`
- `planning`
- `implementation`
- `review`

Approval applies to the feature's current version.

---

### `sdrive team:add <username> <role>`

Adds a new team member.

```bash
sdrive team:add alice admin
```

---

### `sdrive team:remove <username>`

Removes a team member.

```bash
sdrive team:remove bob
```

---

### `sdrive team:list`

Lists all team members.

```bash
sdrive team:list
```

---

### `sdrive team:update <username> <role>`

Updates a member's role.

```bash
sdrive team:update carol reviewer
```

---

### `sdrive team:sync`

Syncs team members from GitHub collaborators.

```bash
sdrive team:sync
```

Requires GitHub CLI (`gh`) and a GitHub remote.

---

### `sdrive template:list`

Lists all available templates.

```bash
sdrive template:list
```

---

### `sdrive template:set <name>`

Changes the default template.

```bash
sdrive template:set nextjs
```

---

### `sdrive hooks:install`

Installs a pre-commit hook that runs governance validation.

```bash
sdrive hooks:install
```

---

### `sdrive diff <old> <new>`

Compares two spec files and shows differences.

```bash
sdrive diff spec-v1.md spec-v2.md
```

---

### `sdrive openapi:generate <feature>`

Generates OpenAPI 3.0 spec from `plan.json`.

```bash
sdrive openapi:generate user-login
```

Output saved to `.sdrive/governance/<feature>/<version>/openapi.json`.

---

### `sdrive verify <feature>`

Verifies that code matches the plan.

```bash
sdrive verify user-login
```

Detects:

- Missing implementation
- Renamed components, functions, endpoints, fields
- Extra code not in the plan
- Dependencies not installed

Writes a report to:

```text
.sdrive/governance/<feature>/<version>/verification.json
```

Returns exit code `1` if verification fails.

Status values:

| Status | Meaning |
|--------|---------|
| `pass` | Everything matches |
| `warn` | Extra code detected |
| `fail` | Missing or renamed code detected |

---

### `sdrive version:new <feature>`

Creates a new version of a feature.

```bash
sdrive version:new user-login
```

What it does:

- Migrates current files into `v1/` if no versions exist
- Creates the next version folder (e.g., `v2/`)
- Preserves older versions
- Sets `currentVersion` in `workflow-state.json`
- Logs the event

Use for structural changes only (new workflow, new user story, behavior change).

---

### `sdrive diff:version <feature> <vA> <vB>`

Compares two versions of a feature.

```bash
sdrive diff:version user-login v1 v2
```

Shows added and removed lines across `spec.md`, `plan.md`, and `tasks.md`.

---

### `sdrive dashboard`

Starts a local web dashboard, beginning on port `4747`.

```bash
sdrive dashboard
```

If `4747` is already in use, it automatically falls back to the next free port
(`4748`, `4749`, …) and prints the URL it chose. Override the starting port with
the `SDRIVE_PORT` environment variable.

Open `http://localhost:4747` to view:

- Onboarding status
- Detected external spec systems (OpenSpec, Spec-Kit)
- Migrated and skipped features
- Features and versions
- Gates and approvals per version
- Traceability coverage per version
- Spec-to-code verification status per version
- Test coverage per version
- Team members
- Recent activity

The dashboard also supports filters:

- Search by feature name
- Filter by phase
- Filter by verification status
- Filter by test coverage
- Show current version only

---

## Slash Commands

> **Typical workflow:** `/sdrive:onboard` (brownfield only) → `/sdrive:constitution` → optionally `/sdrive:blueprint` → `/sdrive:propose` → `/sdrive:apply` → `/sdrive:test` → `/sdrive:review`

| Command | Agent | Purpose |
|---------|-------|---------|
| `/sdrive:onboard` | Onboarding | Adopt SpecDrive into an existing project, migrate OpenSpec/Spec-Kit |
| `/sdrive:constitution` | Constitution | Create/update constitution |
| `/sdrive:blueprint` | Blueprint | Optionally draft an app overview, conceptual mockup, roadmap, milestones, and backlog |
| `/sdrive:propose` | Specification | Create spec, plan, tasks |
| `/sdrive:design` | UI/UX | Build prototype |
| `/sdrive:sync` | Cascade | Sync downstream files |
| `/sdrive:skills` | Discover-skills | Manage AI skills |
| `/sdrive:docs` | Documentation | Generate docs |
| `/sdrive:apply` | Implementation | Write production code |
| `/sdrive:test` | Test | Write tests, run them, report coverage |
| `/sdrive:performance` | Performance | Benchmark and optimize |
| `/sdrive:review` | Review & Complete | Final audit and merge |
| `/sdrive:secure` | Security | Security audit |

---

### `/sdrive:blueprint` (optional)

Use this when you have an application idea but need help shaping the product-level plan. Developers who already have a suitable plan can skip it and go directly to `/sdrive:propose`.

```text
/sdrive:blueprint
```

After gathering user input and any inspiration references, Blueprint proposes:

- `.sdrive/product/overview.md` — product purpose, users, guidance, references, assumptions, and open questions
- `.sdrive/product/mockup.md` — a conceptual app map, key areas/screens, navigation, and user journeys (not a working prototype)
- `.sdrive/product/design-system.md` — sourced design principles and proposed visual/component guidance (no implementation tokens or UI code)
- `.sdrive/product/roadmap.md` — suggested milestones, sequencing, and dependencies
- `.sdrive/product/backlog.md` — user-approved product-level feature candidates, initially pending

Blueprint asks whether to add, change, or defer feature ideas and gets approval before writing. It does not generate interactive prototypes, detailed feature specs, implementation tasks, or workflow-state entries. Select an approved backlog item later and run `/sdrive:propose "<feature description>"` to create its detailed plan.

> **Inspiration images:** If your AI session cannot view images (vision unavailable), Blueprint does not stall. It uses the text it can read — file names, folder names, link titles, and your own description — as high-level guidance, records the reference as an open question, and continues. You can always add detail later by describing the reference in your own words.

---

### `/sdrive:onboard`

Adopts SpecDrive into an existing project (brownfield) and migrates OpenSpec or Spec-Kit specs. This is the only command needed for brownfield onboarding.

```text
/sdrive:onboard
```

**What it does:**

- If `.sdrive/onboarding/inventory.json` does not exist, runs `node .sdrive/scripts/onboard.js` internally to scan the project
- If the inventory exists but is older than `workflow-state.json`, asks the user whether to rescan
- Reads `.sdrive/onboarding/inventory.json`
- Asks the user which missing pieces to fill vs. defer
- Generates a baseline constitution (if approved)
- Generates retroactive specs for existing features (if approved)
- Migrates OpenSpec and Spec-Kit specs (if detected and approved)
- Records missing, deferred, migrated, and skipped items in `workflow-state.json`
- Never overwrites, deletes, or fabricates

**OpenSpec migration:**

- `openspec/specs/<feature>/` → `.sdrive/specs/ongoing/<feature>/v1/`
- `openspec/changes/<name>/` → `.sdrive/specs/ongoing/<name>/v1/`
- `openspec/archive/<feature>/` → `.sdrive/specs/completed/<feature>/v1/`

**Spec-Kit migration:**

- `.specify/specs/###-<feature>/` → `.sdrive/specs/ongoing/<feature>/v1/`
- `.specify/memory/constitution.md` → merged into `.sdrive/constitution.md`

**Preservation rules:**

- Original `openspec/` and `.specify/` folders are never deleted
- All migrated features are marked `retroactive: true`
- Every migrated feature records `migratedFrom`
- Every migration is logged under `onboarding.migrated`
- Skipped migrations are logged under `onboarding.skipped`

**When to use:**

- Only once per existing project
- Never on greenfield projects

---

### `/sdrive:test`

Writes tests for every acceptance criterion, runs them, and reports coverage.

```text
/sdrive:test user-login
```

**What it does:**

- Reads spec, plan, tasks, and traceability from the current version
- Detects the project's test framework
- Writes one test per AC
- Test names include the AC ID
- Requires approval before writing
- Runs tests and updates `traceability.json` in the current version
- Generates a coverage report at `.sdrive/reports/tests/test-report-<feature>-<version>-<date>.md`
- Runs `sdrive verify <feature>` and the governance validator

**When to use:**

- After `/sdrive:apply`
- Before `/sdrive:review`

**What it does NOT do:**

- Write production code
- Fix production code
- Merge

---

## Feature Commands

Some commands accept a feature name or description.

### Examples

```text
/sdrive:propose "User login with email and password"
/sdrive:apply user-login
/sdrive:test user-login
/sdrive:review user-login
```

The natural description is converted to kebab-case automatically.

Example:

```text
"User login with email and password"
```

becomes:

```text
user-login-with-email-and-password
```

---

## Gated Commands

Some commands require approval before they run.

| Command | Required Gates |
|---------|----------------|
| `/sdrive:propose` | specification, planning |
| `/sdrive:apply` | implementation |
| `/sdrive:review` | review |

If a gate is not approved, the command is blocked.

Approve a gate with:

```bash
sdrive approve <gate>
```

---

## Permission Rules

Some commands require specific team roles.

The current Git user is checked against `.sdrive/team.json`.

If the user is not allowed, the command is blocked.

### Default Permissions

| Role | Can do |
|------|--------|
| admin | Everything |
| reviewer | Approve, review, propose, blueprint, create versions |
| developer | Implement, test, run optimizations, verify |

### Permission File

```text
.sdrive/commands/permissions.json
```