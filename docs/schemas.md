# SpecDrive Schema Reference

SpecDrive uses 8 JSON Schemas for deterministic validation.

---

## Schema List

| Schema | Validates |
|--------|-----------|
| `spec.schema.json` | Feature specifications |
| `plan.schema.json` | Technical plans |
| `tasks.schema.json` | Execution tasks |
| `traceability.schema.json` | Traceability matrix |
| `workflow-state.schema.json` | Feature lifecycle state |
| `config.schema.json` | Project configuration |
| `test-evidence.schema.json` | Recorded test runs |
| `review.schema.json` | Structured review records |

All schemas live in:

```text
.sdrive/schemas/
```

---

## 1. spec.schema.json

Validates the feature specification.

### Key Fields

| Field | Type | Required |
|-------|------|----------|
| `feature` | string | Yes |
| `version` | integer | Yes |
| `overview` | object | Yes |
| `userStories` | array | Yes |
| `functionalRequirements` | array | No |
| `nonFunctionalRequirements` | array | No |

### ID Patterns

- User stories: `US-001`
- Acceptance criteria: `AC-001`
- Functional requirements: `FR-001`
- Non-functional requirements: `NFR-001`

### Out-of-scope acceptance criteria

An acceptance criterion can describe behaviour that cannot be implemented — a provider
endpoint that was never published, a report nobody can query. Do not delete it and do not
reword it: mark it withdrawn and say why.

| Field | Type | Required |
|-------|------|----------|
| `withdrawn` | boolean | No |
| `withdrawnReason` | string, 20+ characters | Yes when `withdrawn` is `true` |
| `withdrawnEvidence` | string, 10+ characters | Yes when `withdrawn` is `true` |

```json
{
  "id": "AC-004",
  "text": "Updating a lead status writes back to Google Local Services Ads.",
  "withdrawn": true,
  "withdrawnReason": "The localservices:v1 discovery document publishes no lead-status update method.",
  "withdrawnEvidence": "https://localservices.googleapis.com/$discovery/rest?version=v1"
}
```

A withdrawn criterion stays in `spec.json` and in the traceability record, is reported by
the planning and review gates, and is excluded from coverage. `sdrive approve <feature>
review` refuses a withdrawal with no reason and evidence, and refuses a feature whose
criteria are all withdrawn: withdrawing is a recorded decision, not a way to skip a test.

---

## 2. plan.schema.json

Validates the technical plan.

### Key Fields

| Field | Type | Required |
|-------|------|----------|
| `feature` | string | Yes |
| `version` | integer | Yes |
| `architecture` | object | Yes |
| `dataModel` | object | Yes |
| `apiContracts` | array | No |
| `dependencies` | array | No |

### Action Fields

Entities:

- `create`
- `update`
- `no_change`
- `delete`

Fields:

- `add`
- `modify`
- `remove`
- `no_change`

### Descoped plan items

`architecture.components[]`, `dataModel.entities[]`, and `apiContracts[]` accept the same
optional `resolution` block as a task:

```json
{
  "method": "POST",
  "path": "/api/leads/{id}/status",
  "action": "create",
  "linkedRequirements": ["FR-014"],
  "resolution": {
    "kind": "deferred",
    "reason": "localservices:v1 publishes no lead-status update method.",
    "at": "2026-10-29"
  }
}
```

`sdrive verify` reports a resolved item under **Withdrawn** instead of **Missing**, and
inherits it to the fields of a resolved entity — so a table that will never exist does
not report forty missing columns. `verification.json` gains `summary.withdrawn` and
`items.withdrawn`, and its `status` is unaffected by withdrawn items.

---

## 3. tasks.schema.json

Validates execution tasks.

### Key Fields

| Field | Type | Required |
|-------|------|----------|
| `feature` | string | Yes |
| `version` | integer | Yes |
| `phases` | array | Yes |

### Task ID Pattern

Tasks use:

```text
T1.1, T1.2, T2.1
```

Where `T` = task, first number = phase, second number = task number.

### Task fields

| Field | Type | Required |
|-------|------|----------|
| `id` | string (`T1.1`) | Yes |
| `title` | string | Yes |
| `linkedRequirements` | array of `FR-###` / `NFR-###` | Yes |
| `completed` | boolean | Yes |
| `resolution` | object | No |

### Descoped tasks

A task that will not be done — a partner that never granted access, a provider route
that does not exist — is **not** `completed` and must not be left as an outstanding
failure. It is descoped:

```json
{
  "id": "T5.2",
  "title": "Push lead status back to Google Local Services Ads",
  "linkedRequirements": ["FR-014"],
  "completed": false,
  "resolution": {
    "kind": "deferred",
    "reason": "localservices:v1 publishes no lead-status update method and ADP access was never granted.",
    "at": "2026-10-29"
  }
}
```

| `resolution` field | Type | Required |
|--------------------|------|----------|
| `kind` | `deferred` \| `superseded` | Yes |
| `reason` | string, 20+ characters | Yes |
| `at` | string (ISO date) | No |

The implementation gate counts a resolved task as neither done nor outstanding, and
names it in its output, so the reduction is visible rather than silent. A `resolution`
with no reason is not a resolution: the task still counts as incomplete and
`sdrive validate` rejects the file.

---

## 4. traceability.schema.json

Validates the traceability matrix.

### Key Fields

| Field | Type | Required |
|-------|------|----------|
| `feature` | string | Yes |
| `version` | integer | Yes |
| `rows` | array | Yes |

### Row Fields

| Field | Description |
|-------|-------------|
| `requirementId` | FR or NFR ID |
| `acceptanceCriteriaIds` | Linked AC IDs |
| `planSection` | Plan section reference |
| `taskIds` | Linked task IDs |
| `testIds` | Linked test IDs |
| `status` | not_started, in_progress, complete |

---

## 5. workflow-state.schema.json

Validates feature lifecycle state.

### Feature Fields

Each entry in `features[]`:

| Field | Description |
|-------|-------------|
| `name` | Feature name (kebab-case) |
| `branch` | **The branch this feature is tied to.** Written by `/sdrive:propose` when it creates or reuses the branch (including a worktree prepared by `/sdrive:worktree`). This is the single source of truth - `/sdrive:apply`, `/sdrive:review`, `/sdrive:secure` and `/sdrive:archive` read it rather than guessing the name or hardcoding `main`. Optional: absent for features that have not been branched yet. |
| `base` | **The branch this feature's branch was cut from.** Written by `/sdrive:propose` alongside `branch` (or inherited from the worktree record created by `/sdrive:worktree`). Because CON-612 requires a feature branch to be based on the branch it will merge into, `/sdrive:archive` merges into `base` instead of guessing the repository default - so it is the exact answer, not a proxy for it. `/sdrive:apply` and `/sdrive:review` only read it; neither asks for it again. Optional: absent for features that have not been branched yet. |
| `productItems` | The Product Plan items (`BP-###`) this feature implements, for example `["BP-003"]`. Written by `/sdrive:propose` when the feature comes from `.sdrive/product/backlog.md`. The dashboard and `/sdrive:worktree` use it to map work back to the plan. Optional for features created without a Product Plan. |
| `currentVersion` | The active version (`v1`, `v2`, ...) |
| `versions[]` | Per-version `id`, `phase`, `currentStep`, `gates`, and `history` |

### Phase Values

- `backlog` — created by `/sdrive:propose`
- `ongoing` — set by `/sdrive:apply` when implementation begins
- `completed` — set by `/sdrive:archive` after merge and archive
- `blocked`

### Current Step Values

- `specification`
- `planning`
- `implementation`
- `review`

### Gate Values

- `pending`
- `approved`
- `rejected`
- `in_progress` (implementation only)

### History Entries

Each version records a `history` array. Every entry has:

| Field | Description |
|-------|-------------|
| `event` | What happened (e.g. `specification_approved`, `feature_archived`) |
| `timestamp` | ISO-8601 timestamp |
| `actor` | The Git user (`git config user.name`) who performed the action. Older entries written before actor capture may omit this field. |

### Worktree Records

`worktrees[]` is written by `/sdrive:worktree` and consumed by `/sdrive:propose`:

| Field | Description |
|-------|-------------|
| `item` | The first Product Plan item (`BP-###`) prepared in this worktree. Kept so readers written before shared branches existed still match. |
| `items` | Every item the branch carries, as an array. Present on shared branches; a single-item worktree may also carry it as `["BP-003"]`. |
| `branch` | The branch created in the worktree (`feature/BP-003` or `feature/chat`). **One record per branch.** |
| `base` | The integration branch the worktree was cut from |
| `path` | Absolute path of the worktree |
| `title` | The backlog feature title(s) at preparation time; a shared branch joins them with ` + ` |
| `createdAt` | ISO-8601 timestamp |
| `updatedAt` | ISO-8601 timestamp of the last write. When two branches change this file, the merge keeps every entry and the newer `updatedAt` wins a clash. |
| `status` | `prepared`; `active` and `released` are reserved for later lifecycle updates |

A worktree record makes the item `ongoing` in the Product Plan, but it is not a
feature. `/sdrive:propose` still creates the feature and records `branch` and
`base` on it — and because one branch is one feature, a shared branch becomes a
single feature whose `productItems` lists every member.

`list` also reports `present` per record: `false` means the directory is gone, so
`worktree.js remove` is the supported way to clear it. A hand-deleted directory
otherwise leaves a record stuck at `prepared`, which keeps its items ineligible.

### Onboarding Fields

`onboarding.detectedSystems.frameworks[]` records every detected migration
adapter (`openspec`, `speckit`, `kiro`, `agent-os`, `bmad`, `generic`) with its
root, confidence, and counts. The legacy `openspec`/`speckit` objects remain.

`onboarding.migrated[].from` and `onboarding.skipped[].system` accept those same
framework IDs.

---

## 6. config.schema.json

Validates `.sdrive/config.json`.

| Field | Type | Description |
|-------|------|-------------|
| `defaultTemplate` | string | Required. One of `generic`, `react-node`, `nextjs`, `expo`, `fastapi`, `turborepo` |
| `governance.requireTestEvidence` | boolean | Require `test-evidence.json` before approving review |
| `governance.allowStaleEvidence` | boolean | Accept evidence recorded at an older commit |
| `governance.requireStructuredReview` | boolean | Require `review.json` with a matching commit and reviewer |
| `governance.testCommand` | string | Test command fallback |
| `governance.lintCommand` | string | Lint command for CI integrations |
| `governance.buildCommand` | string | Build command for CI integrations |
| `test.command` | string | Test command used by `sdrive test` |
| `test.timeoutMs` | integer | Test timeout in milliseconds |

New projects write `governance.requireTestEvidence: true` and
`governance.requireStructuredReview: true`. Existing projects keep the old
behaviour until they opt in:

```bash
sdrive config:set governance.requireTestEvidence true
sdrive config:set governance.requireStructuredReview true
```

---

## 7. test-evidence.schema.json

Validates `.sdrive/governance/<feature>/<version>/test-evidence.json`, written by
`sdrive test`.

| Field | Description |
|-------|-------------|
| `feature`, `version` | What the evidence belongs to |
| `command`, `source` | The command that ran and where it came from |
| `exitCode`, `timedOut`, `signal` | What happened |
| `commit`, `branch` | Git state at the time of the run |
| `startedAt`, `finishedAt`, `durationMs` | Timing |
| `outputHash` | SHA-256 of captured output |
| `summary` | `passed`, `failed`, `skipped`, `total` |
| `testIds`, `acIds` | `TEST-###` / `AC-###` IDs found in the output |
| `outputTail` | Last 4 KB of output (full logs belong in CI artifacts) |

The schema is enforced by `sdrive validate` and read by the review gate.

---

## 8. review.schema.json

Validates `.sdrive/governance/<feature>/<version>/review.json`, written by
`/sdrive:review`.

| Field | Description |
|-------|-------------|
| `feature`, `version` | What was reviewed |
| `status` | `PASS` or `FAIL` |
| `commit` | The exact `HEAD` the review applies to |
| `base`, `branch` | The recorded integration base and feature branch |
| `reviewedBy`, `reviewedAt` | Who reviewed it and when |
| `coverage` | Acceptance-criteria coverage percentage |
| `criteria[]` | Per-check result: `pass`, `fail`, `warn`, or `not_verified` |
| `findings[]` | Severity, issue, location, `fixRequired`, and linked `AC-###` IDs |
| `evidence` | Paths to test evidence, test report, verification, and audit record |

`review.json` is validated by `sdrive validate` and read by
`sdrive approve <feature> review` when `governance.requireStructuredReview` is
enabled. It must agree with the human `review.md` verdict.

---

## 9. audit-log.json

The audit trail at `.sdrive/audit-log.json` records explicit governance events. Each event has:

| Field | Description |
|-------|-------------|
| `event` | Event name (e.g. `gate_approved`) |
| `timestamp` | ISO-8601 timestamp |
| `actor` | The acting user, resolved from `git config user.name` with an OS-username fallback |
| `feature` | Related feature name (optional) |
| `version` | Related version id (optional) |
| `details` | Free-form extra context (optional) |
| `prevHash` | Hash of the previous hashed event (`GENESIS` for the first) |
| `hash` | SHA-256 over the canonical entry plus `prevHash` |

New entries form a hash chain. Editing an old entry breaks every later link;
`sdrive audit:verify` reports the first break. Legacy unhashed entries are
reported, not treated as failures.

The dashboard Activity page merges this file with `workflow-state.json` history and displays the `actor` for each entry. Events recorded before actor capture show as `unknown`.

---

## Validation

All schemas are validated by:

```bash
sdrive validate
```

The CLI validates in-process with its own `ajv`, so it works in a project that
has no `node_modules` of its own. The installed
`.sdrive/scripts/validate-governance.js` remains available for CI; it resolves
`ajv` from the consuming project, which `sdrive doctor` checks.