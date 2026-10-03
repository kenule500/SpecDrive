# SpecDrive Agent Reference

SpecDrive uses 14 specialized agents. Each agent has one slash command.

---

## Agent List

| # | Agent | Command | File |
|---|-------|---------|------|
| 0 | Onboarding | `/sdrive:onboard` | `00-onboarding.md` |
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
| 11 | Test | `/sdrive:test` | `11-test.md` |
| 12 | Product Plan | `/sdrive:product-plan` | `12-product-plan.md` |
| 13 | Update Proposal | `/sdrive:update-propose` | `13-update-propose.md` |

---

## Onboarding Agent

**Command:** `/sdrive:onboard`

**Purpose:** Adopt SpecDrive into an existing project (brownfield) without breaking it, and migrate OpenSpec or Spec-Kit specs. This is the only command needed for brownfield onboarding.

**What it does:**

- If no inventory exists, runs `node .sdrive/scripts/onboard.js` internally to scan the project
- If an inventory exists but is stale, asks the user whether to rescan
- Reads `.sdrive/onboarding/inventory.json`
- Asks the user what to fill vs. defer
- Generates a baseline constitution from discovered facts (if approved)
- Generates retroactive specs for existing features (if approved)
- Migrates OpenSpec specs when detected and approved
- Migrates Spec-Kit specs and constitution when detected and approved
- Records missing, deferred, migrated, and skipped items in `workflow-state.json` under `onboarding`
- Never overwrites, deletes, or fabricates

**Migration rules:**

- Original `openspec/` and `.specify/` folders are never deleted
- Every migrated feature is marked `retroactive: true`
- Every migrated feature records `migratedFrom: openspec | speckit`
- Every migration is logged in `workflow-state.json` under `onboarding.migrated`
- Skipped migrations are logged under `onboarding.skipped`

**When to use:**

- When introducing SpecDrive to an existing project
- Only once per project

---

## Constitution Agent

**Command:** `/sdrive:constitution`

**Purpose:** Create or update the project constitution.

**What it does:**

- Discovers project stack, standards, and architecture
- Detects test framework, command, and folder
- Creates context files under `.sdrive/context/`
- Merges rules into `.sdrive/constitution.md`
- Includes versioning rules (`CON-603` to `CON-605`)
- Includes verify-completion rule (`CON-602`)
- Runs `sdrive verify <feature>` for active features when source rules change
- Requires human approval

---

## Product Plan Agent

**Command:** `/sdrive:product-plan` (optional)

**Purpose:** Turn an early product idea into an approved product overview, conceptual app mockup, high-level design-system plan, roadmap, milestones, and product-level feature backlog.

**What it does:**

- Interviews the user and records confirmed information separately from assumptions and recommendations
- Captures inspiration references and high-level design guidance without copying protected work
- Creates a non-interactive, conceptual app map/mockup; it does not build a working prototype
- Proposes milestones, roadmap order, dependencies, and candidate features
- Asks the user whether to add, change, or defer feature candidates before saving
- Saves approved documents under `.sdrive/product/`
- Leaves each backlog item for `/sdrive:propose` to detail later; it does not create feature specs or workflow-state entries

**When to use:**

- When a developer has an app idea but lacks a product plan or roadmap
- Skip it when a suitable plan already exists and use `/sdrive:propose` for a specific feature

---

## Specification Agent

**Command:** `/sdrive:propose`

**Purpose:** Create feature specification, technical plan, and tasks.

**What it does:**

- Accepts natural feature description
- Generates feature name
- Uses default template from `.sdrive/config.json`
- Detects the current version from `workflow-state.json`
- Creates spec, plan, tasks, traceability in `.sdrive/specs/<status>/<feature>/<version>/`
- Assigns the feature to `v1` automatically if new
- Runs anti-redundancy check
- Two approval gates

---

## UI/UX Agent

**Command:** `/sdrive:design`

**Purpose:** Build interactive prototype.

**What it does:**

- Reads spec and traceability from the current version folder
- Creates design system in `.sdrive/prototype/`
- Builds screens with vanilla HTML/CSS/JS
- Supports light/dark mode
- Maps screens to user stories
- Updates traceability in the current version folder

---

## Cascade Agent

**Command:** `/sdrive:sync`

**Purpose:** Sync spec → plan → tasks.

**What it does:**

- Detects changes in higher-level files
- Updates downstream files
- Preserves IDs and task status
- Operates only within the current version
- Runs `sdrive verify <feature>` after sync

**When to use:** When you have **manually hand-edited** a single file (e.g. `spec.md`) and need the downstream files re-synced. You do **not** need it after `/sdrive:update-propose`, which cascades all files itself.

---

## Update Proposal Agent

**Command:** `/sdrive:update-propose`

**Purpose:** Extend an existing feature specification with new requirements, user stories, and acceptance criteria.

**What it does:**

- Requires an existing feature (use `/sdrive:propose` for brand-new features)
- Continues ID sequences (`FR-###`, `NFR-###`, `US-###`, `AC-###`) from the highest existing ID
- Appends to `spec.md`, `plan.md`, `tasks.md`, and `traceability.json` without rewriting existing content
- Cascades the new requirements all the way down the hierarchy in one run
- Resets the `specification` gate to `pending` (new requirements invalidate prior approval)
- Two approval gates (spec, then plan/tasks)

**When to use:** When adding requirements to a feature that already exists.

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

- Reads spec, plan, tasks, and traceability from the current version
- Adds inline docs with traceability IDs
- Updates README
- Detects code/spec drift
- Generates coverage report
- Only writes to the current version folder if feature-scoped

**Batch mode:** `/sdrive:docs --all` documents every ongoing feature and writes an aggregate report to `.sdrive/docs/coverage-report-all-<date>.md`.

---

## Implementation Agent

**Command:** `/sdrive:apply`

**Purpose:** Write production code.

**What it does:**

- **Moves the feature from `specs/backlog/` to `specs/ongoing/`** and sets the version's `phase` to `ongoing` (the backlog → ongoing transition)
- Reads approved tasks and plan from the current version
- Asks about base branch and feature branch
- Implements production code only (no tests)
- Runs `sdrive verify <feature>` before declaring completion
- Commits and pushes
- Records branch name in workflow state
- Recommends `/sdrive:test` as the next step

**Batch mode:** `/sdrive:apply --all` implements every ongoing feature, one branch each. It never merges in batch mode, and each feature still requires its own approval gate.

---

## Performance Agent

**Command:** `/sdrive:performance`

**Purpose:** Benchmark and optimize.

**What it does:**

- Reads NFRs from spec.json in the current version
- Measures baseline
- Identifies bottlenecks
- Optimizes after approval
- Writes report with version in filename
- Updates traceability only for performance NFR rows in the current version

**Batch mode:** `/sdrive:performance --all` optimises every ongoing feature and writes an aggregate report to `.sdrive/reports/performance/performance-report-all-<date>.md`.

---

## Review & Complete Agent

**Command:** `/sdrive:review`

**Purpose:** Final audit, merge, and archive.

**What it does:**

- Requires `sdrive verify <feature>` to return `pass` or `warn` before merging
- Verifies coverage: every AC has a linked, existing, passing test
- Requires the test report for the current version
- Audits code against spec
- Requires human merge approval
- Merges the current version and marks it as `completed`
- Preserves other versions
- Moves feature folder from `ongoing/` to `completed/` (the ongoing → completed transition)
- Verifies permission before and after merge

**Lifecycle ownership:** `/sdrive:apply` owns `backlog/` → `ongoing/`; `/sdrive:review` owns `ongoing/` → `completed/`; `sdrive reopen` owns `completed/` → `ongoing/`.

**Batch mode:** `/sdrive:review --all` reviews every ongoing feature one after the other and writes an aggregate report to `.sdrive/reports/reviews/review-report-all-<date>.md`. A feature that fails review is never merged.

---

## Security Agent

**Command:** `/sdrive:secure`

**Purpose:** Security audit and fixes.

**What it does:**

- Reads spec, plan, tasks, and traceability from the current version
- Threat modeling
- OWASP checks
- Dependency scanning
- Fixes with approval
- Writes report with version in filename
- Updates traceability only for security NFR rows in the current version

**Batch mode:** `/sdrive:secure --all` audits every ongoing feature and writes an aggregate report to `.sdrive/reports/security/security-audit-all-<date>.md`. Approval gates still apply per feature.

---

## Test Agent

**Command:** `/sdrive:test`

**Purpose:** Write tests for acceptance criteria, run them, and report coverage.

**What it does:**

- Reads spec, plan, tasks, and traceability from the current version
- Detects the project's test framework from the constitution and project files, including its test file naming convention and suffix
- Writes one test per acceptance criterion, organized by feature under the project's test folder using the framework's own convention (`<test-folder>/<feature>/<subfeature>.<test-suffix>.<ext>`)
- Test names include the AC ID (e.g., `AC-001`)
- Requires user approval before writing tests
- Runs tests and captures pass/fail directly from the tool result (no shell redirection to log files)
- Updates `traceability.json` with test IDs and status in the current version
- Generates a coverage report at `.sdrive/reports/tests/test-report-<feature>-<version>-<date>.md`
- Writes all artifacts (reports, logs, captured output) under `.sdrive/` — never to the project root

**Batch mode:** `/sdrive:test --all` tests every ongoing feature, one after the other, and writes an aggregate report to `.sdrive/reports/tests/test-report-all-<date>.md`.
- Runs `sdrive verify <feature>` and the governance validator
- Does NOT write production code