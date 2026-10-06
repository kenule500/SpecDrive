# SpecDrive Schema Reference

SpecDrive uses 5 JSON Schemas for deterministic validation.

---

## Schema List

| Schema | Validates |
|--------|-----------|
| `spec.schema.json` | Feature specifications |
| `plan.schema.json` | Technical plans |
| `tasks.schema.json` | Execution tasks |
| `traceability.schema.json` | Traceability matrix |
| `workflow-state.schema.json` | Feature lifecycle state |

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
| `branch` | **The branch this feature is tied to.** Written by `/sdrive:apply` when the branch is created or resumed, and by `sdrive amend` when a branch is chosen. This is the single source of truth — `/sdrive:review`, `/sdrive:secure` and `/sdrive:archive` read it rather than guessing the name or hardcoding `main`. Optional: absent for features that have not been branched yet. |
| `base` | **The branch this feature's branch was cut from.** Written by `/sdrive:apply` and by `sdrive amend` alongside `branch`. Because CON-612 requires a feature branch to be based on the branch it will merge into, `/sdrive:archive` recommends `base` as the target branch instead of guessing the repository default — so it is the exact answer, not a proxy for it. Optional: absent for features that have not been branched yet. |
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
| `event` | What happened (e.g. `specification_approved`, `feature_amended`) |
| `timestamp` | ISO-8601 timestamp |
| `actor` | The Git user (`git config user.name`) who performed the action. Older entries written before actor capture may omit this field. |

---

## 6. audit-log.json

The audit trail at `.sdrive/audit-log.json` records explicit governance events. Each event has:

| Field | Description |
|-------|-------------|
| `event` | Event name (e.g. `gate_approved`) |
| `timestamp` | ISO-8601 timestamp |
| `actor` | The acting user, resolved from `git config user.name` with an OS-username fallback |
| `feature` | Related feature name (optional) |
| `version` | Related version id (optional) |
| `details` | Free-form extra context (optional) |

The dashboard Activity page merges this file with `workflow-state.json` history and displays the `actor` for each entry. Events recorded before actor capture show as `unknown`.

---

## Validation

All schemas are validated by:

```bash
sdrive validate
```

This runs the governance validator script.