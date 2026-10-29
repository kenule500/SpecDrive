# SpecDrive Agent Reference

SpecDrive uses 17 specialized agents. Each agent has one slash command.

## Git behaviour

Every chat command commits and pushes the changes it made after its work is
complete and any required human approval has been granted. The commit message
uses the `specdrive(<command>):` prefix, for example:

```text
specdrive(propose): add user-login specification
specdrive(test): record user-login test evidence
```

The agent stages only its own files, skips the commit when there is nothing to
commit, never force-pushes, and reports the commit SHA and branch.

`/sdrive:archive` is the exception. It does not create a separate
commit-and-push step: it merges the feature into its confirmed target branch and
pushes that branch. `/sdrive:worktree` is also an exception: it prepares local
branches and worktrees and records them in `workflow-state.json`, but it does not
commit or push. `/sdrive:propose` commits its own artifacts inside the worktree.

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
| 9 | Review | `/sdrive:review` | `09-review-complete.md` |
| 10 | Security | `/sdrive:secure` | `10-security.md` |
| 11 | Test | `/sdrive:test` | `11-test.md` |
| 12 | Product Plan | `/sdrive:product-plan` | `12-product-plan.md` |
| 13 | Update Proposal | `/sdrive:update-propose` | `13-update-propose.md` |
| 14 | Archive | `/sdrive:archive` | `14-archive.md` |
| 15 | Debug | `/sdrive:debug` | `15-debug.md` |
| 16 | Worktree | `/sdrive:worktree` | `16-worktree.md` |

---

## Onboarding Agent

**Command:** `/sdrive:onboard`

**Purpose:** Adopt SpecDrive into an existing project (brownfield) without breaking it, and migrate OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, or generic spec folders. This is the only command needed for brownfield onboarding.

**What it does:**

- If no inventory exists, runs `node .sdrive/scripts/onboard.js` internally to scan the project
- If an inventory exists but is stale, asks the user whether to rescan
- Reads `.sdrive/onboarding/inventory.json`
- **Checks the README before describing the product.** If it is generator boilerplate (create-next-app, create-vite, …) or missing, the scan records `projectBrief.readmeQuality` as `template`/`missing` and the agent asks whether to interview the user and write a real `.sdrive/product/overview.md`, rather than quoting "This is a Next.js project bootstrapped with create-next-app" as the vision
- Asks the user what to fill vs. defer
- Generates a baseline constitution from discovered facts (if approved)
- Generates retroactive specs for existing features (if approved)
- Plans and applies migrations through `sdrive migrate:detect/plan/apply/verify/rollback` for OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, and generic spec folders
- Reports partial mappings, conflicts, and placeholder requirements instead of claiming a migration is complete
- Records missing, deferred, migrated, and skipped items in `workflow-state.json` under `onboarding`
- Never overwrites, deletes, or fabricates

**Asking about the product overview:**

- Triggered when `projectBrief.readmeQuality` is `template` or `missing`, or `needsProductInput` is true
- When the README *is* usable, the derived Vision sentence is still shown for confirmation — a scan can spot a template README, but only the user can say whether a real README has drifted from the code
- The question offers three choices: interview now (recommended), keep the draft, or defer
- Interviewing reuses the Product Plan questions (problem, users, flows, success criteria, non-goals) and writes `Status: Approved`, `Source: onboarding interview`, preserving the derived draft under `## Previous draft (derived)`
- It never creates feature specs or workflow-state entries — that stays `/sdrive:propose`'s job
- Deferring records `product/overview.md` in `onboarding.deferred`

**Migration rules:**

- Original `openspec/`, `.specify/`, `.kiro/`, `.agent-os/`, `docs/stories/`, and `specs/` folders are never deleted
- Every migrated feature is marked `retroactive: true`
- Every migrated feature records `migratedFrom: <framework-id>`
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
- Asks specifically about an existing prototype (Figma, Framer, Penpot, Sketch, Adobe XD), visual references (Dribbble, Behance, Mobbin, screenshots), and similar products, then records source, access status, what the user likes, and patterns to adapt
- Writes a `Details` description for each backlog item so the dashboard's **View more** drawer can explain what the feature does
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

- **Chooses the base branch and creates the feature branch first** — lists every local and remote branch (integration branch recommended, current branch marked, other features' branches flagged), switches to the chosen base, creates `feature/<feature>` from it, and stays on it
- **Records `branch` and `base`** in `workflow-state.json` before writing any spec file
- Accepts natural feature description
- Generates feature name
- Uses default template from `.sdrive/config.json`
- Detects the current version from `workflow-state.json`
- Creates spec, plan, tasks, traceability in `.sdrive/specs/<status>/<feature>/<version>/`
- Assigns the feature to `v1` automatically if new
- Runs anti-redundancy check
- Two approval gates

---

## Worktree Agent

**Command:** `/sdrive:worktree` (optional)

**Purpose:** Prepare branches and isolated git worktrees for Product Plan items that are ready to start.

**What it does:**

- Reads the backlog's `Depends on` and `Wave` columns and the live feature lifecycle
- Prepares only the lowest ready wave; an item with an incomplete dependency, outside blocker, `deferred`/`needs discovery` status, existing feature, or existing worktree is skipped with the reason
- Offers Product ID branches (`feature/BP-003`) or readable names (`feature/chat`) with suggestions and custom input
- Creates one branch and worktree per selected item and records them under `worktrees` in `workflow-state.json`
- Hands off to `/sdrive:propose`, which detects the prepared worktree and reuses its branch instead of creating another
- Does not write specs, plans, tasks, code, or tests; does not commit or push

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
- **Resumes the feature branch** `feature.branch` recorded by `/sdrive:propose`; it never chooses a base and never creates a branch. With no recorded branch it stops and points back to `/sdrive:propose`
- Implements production code only (no tests)
- Runs `sdrive verify <feature>` before declaring completion
- Commits and pushes
- Reports the recorded `feature.branch` and `feature.base`; it never asks for a merge target, because `/sdrive:propose` already chose it
- Recommends `/sdrive:test` as the next step

**Batch mode:** `/sdrive:apply --all` implements every ongoing feature, one branch each. It never merges in batch mode, and each feature still requires its own approval gate.

---

## Performance Agent

**Command:** `/sdrive:performance`

**Purpose:** Benchmark and optimize for speed and search visibility (SEO).

**What it does:**

- Reads NFRs from spec.json in the current version
- Measures baseline
- Identifies bottlenecks
- Runs an **SEO audit** for crawlability and discoverability issues (metadata, semantic structure, structured data, `robots.txt`/`sitemap.xml`, Core Web Vitals, `hreflang`)
- Optimizes after approval
- Writes report with version in filename
- Updates traceability only for performance NFR rows in the current version

**Two measured concerns:** The agent owns both **speed** (slower than the NFRs allow) and **SEO** (not discoverable or not readable by crawlers). Both are measured against a number, which is why both belong here. An SEO finding is reported even when every speed NFR passes — the NFR gate never suppresses it. The two lists are always reported separately and approved separately.

**Scope boundary:** A design judgement with no metric — "should this be a reusable component?", duplicated code, dead code — is **not** in scope. Those are noted under "Out of Scope Observations" and handed to `/sdrive:review`. Correctness defects (layout, API, runtime, glitches) are handed to `/sdrive:debug`.

**Batch mode:** `/sdrive:performance --all` optimises every ongoing feature and writes an aggregate report to `.sdrive/reports/performance/performance-report-all-<date>.md`.

---

## Debug Agent

**Command:** `/sdrive:debug`

**Purpose:** Reproduce, isolate, and fix defects — layout, APIs, runtime, and glitches. This is the chief debugger.

**What it does:**

- Reproduces the defect and captures before evidence
- Isolates it to the smallest unit that still exhibits it
- States the root cause in one sentence, distinguished from the symptom
- Gets approval, then applies the smallest correct fix
- Re-runs the reproduction and captures after evidence
- Adds a regression test that would have caught the defect
- Writes a versioned report to `.sdrive/reports/debug/`

**Defect classes:**

| Class | Examples | Detection |
|-------|----------|-----------|
| **LAYOUT** | Overlap, overflow, clipping, z-index collision, container escape, breakpoint breakage | Headless-browser bounding-box comparison |
| **API** | Failing endpoint, wrong status code, malformed payload, schema mismatch, auth failure, timeout | Issue the request, capture status/headers/body, compare to contract |
| **RUNTIME** | Uncaught exception, console error, hydration mismatch, unhandled rejection, state bug | Capture console output and stack trace |
| **GLITCH** | Flicker, shift on interaction, broken transition, misaligned icon, inconsistent spacing | Interaction trace plus before/after screenshots |

**Reactive, not proactive:** Run this when something is visibly wrong. It does not optimize for speed (that is `/sdrive:performance`) and does not audit against acceptance criteria (that is `/sdrive:review`).

**Evidence rule:** A fix is only verified when the same check that found the defect now passes. Reading the code is not verification.

**Batch mode:** `/sdrive:debug --all` sweeps every ongoing feature and writes an aggregate report to `.sdrive/reports/debug/debug-report-all-<date>.md`.

---

## Review Agent

**Command:** `/sdrive:review`

**Purpose:** Final audit and pass/fail verdict. Does NOT merge or archive.

**What it does:**

- Requires `sdrive verify <feature>` to return `pass` or `warn`
- Runs `sdrive check`, `sdrive validate`, `sdrive verify`, and `sdrive audit:verify` as structured CLI checks
- Verifies coverage: every AC has a linked, existing, passing test — criteria marked `withdrawn: true` with a reason and citation are reported instead of counted
- Requires the test report for the current version
- **Requires `sdrive test` evidence** — `test-evidence.json` must record a zero-exit run with no failures, at least one result, and a commit matching `HEAD`
- Binds the verdict to a commit: records `HEAD`, the feature branch/base, and requires a clean working tree
- Audits the diff against `base`, flagging unplanned files, untracked files, and commits from another feature
- Checks test quality (`.only`, `xit`, unjustified skips, empty assertions, AC IDs)
- Checks security, NFR evidence, docs, and CI status; unverified items are recorded as `not_verified`, not passed
- Audits code against spec
- Writes `review.md` (human report) and `review.json` (machine-readable verdict) with `Status: PASS` or `Status: FAIL`
- Asks the human to confirm a PASS verdict and records reviewer independence
- On failure: records the findings, adds fix tasks, and stops (no PR, no branch, no merge)
- On pass: notifies the user to run `/sdrive:archive <feature>`
- Verifies permission before and after the audit

**Lifecycle ownership:** `/sdrive:apply` owns `backlog/` → `ongoing/`; `/sdrive:archive` owns `ongoing/` → `completed/`. `completed/` is immutable: there is no reopen or amend path. New work on a released feature is `sdrive version:new`, which creates a new version and leaves the released one in `completed/`.

**Batch mode:** `/sdrive:review --all` reviews every ongoing feature one after the other and writes an aggregate report to `.sdrive/reports/reviews/review-report-all-<date>.md`. A feature that fails review is never cleared for archive.

---

## Archive Agent

**Command:** `/sdrive:archive`

**Purpose:** Merge an approved feature back into the branch it came from, and complete its lifecycle.

**What it does:**

- **Refuses until `/sdrive:test` has run** — a `test-report-<feature>-<version>-<date>.md` must exist in `.sdrive/reports/tests/`; coverage alone is not evidence that tests ran
- **Refuses until `/sdrive:review` has run** — `review.md` for the current version must record `Status: PASS`
- **Merges into `feature.base`**, the branch `/sdrive:propose` created the feature from — no branch menu; stacked and deleted-base cases are stated explicitly
- **Detects and resolves merge conflicts** before merging: only mechanical resolutions are allowed, on the feature branch; `sdrive validate`, `sdrive verify`, and the test suite must pass; semantic, migration, security, or secret conflicts stop the archive with `git merge --abort`
- Requires human merge approval
- Merges the current version and marks it as `completed`
- Preserves other versions
- Moves feature folder from `ongoing/` to `completed/` (the ongoing → completed transition)
- Updates governance and workflow state
- **Asks whether to delete or keep** the feature branch, then acts on the answer
- Verifies permission before and after merge

**Lifecycle ownership:** `/sdrive:archive` owns `ongoing/` → `completed/`.

**Batch mode:** `/sdrive:archive --all` archives every ongoing feature that has passed review, one after the other, and writes an aggregate report to `.sdrive/reports/reviews/archive-report-all-<date>.md`.

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
- Runs `sdrive test <feature>` so the run is recorded as `test-evidence.json` (command, exit code, counts, commit, output hash)
- Runs `sdrive verify <feature>` and the governance validator
- Does NOT write production code

**Batch mode:** `/sdrive:test --all` tests every ongoing feature, one after the other, and writes an aggregate report to `.sdrive/reports/tests/test-report-all-<date>.md`.