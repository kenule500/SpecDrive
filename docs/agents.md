# SpecDrive Agent Reference

SpecDrive uses 10 specialized agents. Each agent has one slash command.

---

## Agent List

| # | Agent | Command | File |
|---|-------|---------|------|
| 1 | Constitution | `/sdrive:constitution` | `01-constitution.md` |
| 2 | Specification | `/sdrive:propose` | `02-specification.md` |
| 3 | UI/UX | `/sdrive:design` | `03-uiux.md` |
| 4 | Cascade | `/sdrive:sync` | `04-cascade.md` |
| 5 | Discover-skills | `/sdrive:skills` | `05-discover-skills.md` |
| 6 | Documentation | `/sdrive:docs` | `06-documentation.md` |
| 7 | Implementation | `/sdrive:apply` | `07-implementation.md` |
| 8 | Performance | `/sdrive:performance` | `08-performance.md` |
| 9 | Review & Complete | `/sdrive:review` | `09-review-complete.md` |
| 10 | Security | `/sdrive:secure` | `10-security.md` |

---

## Constitution Agent

**Command:** `/sdrive:constitution`

**Purpose:** Create or update the project constitution.

**What it does:**

- Discovers project stack, standards, and architecture
- Creates context files under `.sdrive/context/`
- Merges rules into `.sdrive/constitution.md`
- Requires human approval

---

## Specification Agent

**Command:** `/sdrive:propose`

**Purpose:** Create feature specification, technical plan, and tasks.

**What it does:**

- Accepts natural feature description
- Generates feature name
- Uses default template from `.sdrive/config.json`
- Creates spec, plan, tasks, traceability
- Runs anti-redundancy check
- Two approval gates

---

## UI/UX Agent

**Command:** `/sdrive:design`

**Purpose:** Build interactive prototype.

**What it does:**

- Creates design system in `.sdrive/prototype/`
- Builds screens with vanilla HTML/CSS/JS
- Supports light/dark mode
- Maps screens to user stories

---

## Cascade Agent

**Command:** `/sdrive:sync`

**Purpose:** Sync spec → plan → tasks.

**What it does:**

- Detects changes in higher-level files
- Updates downstream files
- Preserves IDs and task status

---

## Discover-skills Agent

**Command:** `/sdrive:skills`

**Purpose:** Audit and manage AI skills.

**What it does:**

- Scans existing skills
- Discovers new skills from GitHub
- Verifies security before recommending

---

## Documentation Agent

**Command:** `/sdrive:docs`

**Purpose:** Generate documentation.

**What it does:**

- Adds inline docs with traceability IDs
- Updates README
- Detects code/spec drift

---

## Implementation Agent

**Command:** `/sdrive:apply`

**Purpose:** Write production code.

**What it does:**

- Reads approved tasks
- Asks about base branch and feature branch
- Implements tasks with tests
- Commits and pushes
- Records branch name in workflow state

---

## Performance Agent

**Command:** `/sdrive:performance`

**Purpose:** Benchmark and optimize.

**What it does:**

- Measures baseline
- Identifies bottlenecks
- Optimizes after approval

---

## Review & Complete Agent

**Command:** `/sdrive:review`

**Purpose:** Final audit and merge.

**What it does:**

- Audits code against spec
- Requires human merge approval
- Archives completed feature

---

## Security Agent

**Command:** `/sdrive:secure`

**Purpose:** Security audit and fixes.

**What it does:**

- Threat modeling
- OWASP checks
- Dependency scanning
- Fixes with approval