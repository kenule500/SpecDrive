# SpecDrive: What to Add Next to Solve Development Issues

**Status:** the first implementation pass is in the working tree (not published).
See [Implementation status](#implementation-status) at the end for what shipped,
what remains, and how it was verified.
**Scope reviewed:** the whole repository at `v0.1.42` (CLI, scripts, gates, dashboard, MCP server, adapters, schemas, tests, docs, CI).
**Date:** 2026-10-18 (review), 2026-10-19 (implementation pass)

---

## 1. Short version

SpecDrive already has the hard part: the gate rules are **code**, not prompt text. `commands/gates.js` and `commands/archive.js` refuse to record an approval whose evidence is missing, and the shared accessors stop ten call sites from disagreeing about what "approved" means. That is a genuinely good design and should not be weakened.

The gaps are in the **development loop around it**:

1. **It cannot prove its own claims.** `/sdrive:test` and `/sdrive:review` are still agent prompts. A human (or an agent) can write `Status: PASS` and a few `testIds` into JSON and satisfy the review gate. Nothing runs a test.
2. **It cannot be automated.** There is no `--json`, no stable exit-code contract, no CI command, and the repository's own CI does not run its tests.
3. **It is hard to develop.** `src/index.js` is 2,545 lines, the tests have no runner, the repo commits a byte-identical copy of its own assets under `.sdrive/`, and the `.sdrive/` in this repository is not even a working installation (`team.json`, `config.json`, and `constitution.md` are missing).
4. **It can be bypassed.** A missing permission script fails open, a missing permission rule allows by default, the audit log is a plain editable JSON file, and state writes are unguarded read-modify-write.

The recommendations below are ordered by what unblocks the most work per unit of effort. Each one names the concrete command, file, or contract to add.

---

## 2. What I verified

These are observations from the checkout, not impressions.

| Check | Result |
|---|---|
| `npm test` | `npm error Missing script: "test"` — no scripts block in `package.json` at all |
| Test suite | 16 files / 3,541 lines, no runner, no CI job |
| CI | Only `.github/workflows/publish.yml`. It explicitly says it runs no `npm test` |
| Lockfile | None (`package-lock.json` absent) |
| `.gitignore` | Absent |
| `src/index.js` | 2,545 lines, 88.7 KB, 68 `process.exit()` calls, 20 `execSync()` calls |
| `--json` | Only `adapters:list` has it |
| Duplication | `.sdrive/` contains 76 byte-identical asset files + `logo.png`; 80 tracked files total |
| Dogfooding | `.sdrive/team.json`, `.sdrive/config.json`, `.sdrive/constitution.md` are **missing** → `router.js` denies every slash command |
| `sdrive validate` in this repo | **Fails** on a committed test fixture (`overview.problemStatement` shorter than 10 chars) |
| Stale test | `test/test-create.js` runs `.sdrive/src/index.js`, which `sdrive init` never creates |
| Test side effects | Running `test-validator.js` deletes the tracked `.sdrive/governance/test-feature/*` fixture |
| Dead files at root | `workflow-state.json`, `team.json`, `audit-log.json`, `constitution.md`, empty `governance/` — no code reads them |
| MCP server | Malformed stdin crashes the process (`JSON.parse` inside the `catch` at `mcp/server.js:285`) |
| Dashboard binding | `server.listen(port, cb)` with no host → binds `0.0.0.0`/`::`, while a comment claims localhost |
| `sdrive update` | Refreshes `dashboard, mcp, scripts, schemas, agents, templates` — **not `commands/`** |
| Permissions | `migrate` rule exists with no CLI command; `update`, `assign`, `status`, `team:list`, `template:list` have no rule (allowed by default) |
| Docs vs CLI | Complete Reference documents `sdrive migrate`; README's CI snippet runs `verify.js` with no feature argument |
| Encoding | `dashboard/app.js` has 21 lines of mojibake (`Â·`, `âœ“`, `ðŸ’¤`, …) |

---

## 3. What to add

### Theme A — Make the repository safe to develop (P0)

These are not product features, but without them every other change is guesswork.

#### A1. A real test entry point and CI matrix

**Add:** `package.json` scripts + `.github/workflows/ci.yml`.

```json
"scripts": {
  "test": "node --test test/",
  "test:unit": "node --test test/unit/",
  "test:e2e": "node --test test/e2e/",
  "lint": "eslint .",
  "format:check": "prettier --check .",
  "docs:check": "node scripts/check-docs.js",
  "pack:check": "npm pack --dry-run",
  "ci": "npm run lint && npm run test && npm run docs:check"
}
```

The `test/unit` and `test/e2e` directories are the target layout from A2; until that split lands, `npm test` runs everything under `test/` (Node's runner discovers the existing `test-*.js` names).

**Why:** the 16 existing tests are the only regression net around gate logic that is explicitly designed to refuse unsafe writes. Right now nothing runs them. A bug in `gates.js` reaches npm unobserved.

**CI shape:** Node 18/20/22/24 × Ubuntu/Windows/macOS. Windows matters because the CLI contains platform-specific code (`chcp`, `STATUS_CONTROL_C_EXIT`, `%APPDATA%`). Add `npm ci` and `npm audit --omit=dev` (non-blocking at first). Make `publish.yml` depend on CI, or run `npm test` before `npm stage publish`.

**Acceptance:** a red test blocks a tag; `npm test` works from a fresh clone after `npm ci`.

#### A2. Hermetic test helpers, and fix the stale tests

**Add:** `test/helpers/sandbox.js` with:

- `createProject()` — temp dir, minimal `.sdrive/` (schemas, scripts, commands, empty state, team with one admin).
- `runCli(args, { cwd, env })` — `execFileSync(process.execPath, [CLI, ...args], { cwd, env: { ...env, SDRIVE_NO_DASHBOARD: "1" } })`. Array args, never a shell string.
- `readState()` / `writeState()` / `assertGate()` helpers.
- A `--keep` flag for debugging failed sandboxes.

**Fix:**
- Delete or rewrite `test-create.js` (it points at a path that does not exist).
- Rewrite `test-end-to-end.js` to build its fixture in a temp dir instead of clearing `.sdrive/workflow-state.json`.
- Make `test-validator.js` and `test-router.js` use the sandbox helper. Today `test-validator.js` writes into the repository's own `.sdrive/` and deletes the tracked `test-feature` fixture in cleanup; `test-router.js` depends on this repository having a populated `.sdrive/team.json`.
- Move `test/*.js` to `test/unit` and `test/e2e`, or add a filename convention.

**Why:** a test that mutates the developer's `.sdrive/` and deletes tracked files cannot be run casually, so it will not be run. Test artifacts have already leaked into git (`.sdrive/governance/test-feature/`).

**Acceptance:** `git status` is clean after `npm test`; tests pass on Windows and Linux; no test reads `process.cwd()` of the repo.

#### A3. Repository hygiene

**Add:**
- `.gitignore` — `node_modules/`, `.npm-cache/`, `coverage/`, `.DS_Store`, `*.log`, and (decision needed) `.sdrive/`.
- `.editorconfig` — UTF-8, LF, 2-space JS/JSON/MD.
- `.nvmrc` — pin the Node version used in CI.
- `LICENSE` — MIT text; `package.json` declares MIT but no file exists.
- `CONTRIBUTING.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`.

**Why:** a new contributor currently has no statement of how to run anything, no license file, and no guard against committing `node_modules/`, which is easy to create and currently not ignored.

#### A4. Stop committing the `.sdrive/` mirror — generate it

**Problem:** the repository tracks both the real source (`scripts/`, `schemas/`, `templates/`, `agents/`, `dashboard/`, `mcp/`, `commands/`) and a byte-identical installed copy under `.sdrive/`. There are 76 duplicated files plus a 256 KB duplicated logo. The copies are currently identical, which is exactly the condition under which nobody notices when they stop being identical.

**Add:**
- Remove `.sdrive/` from git, add it to `.gitignore`.
- Add `npm run dogfood` / `sdrive self:init` that runs the packaged `init` into this repo (or `scripts/sync-sdrive.js` that mirrors the seven asset dirs).
- Keep a small, explicit `.sdrive/` fixture only if tests need one — under `test/fixtures/`, not the repo root.

**Trade-off:** the repo loses its "example installation" checked into git. If that example is valuable, move it to `examples/demo/.sdrive/` and generate it in CI.

#### A5. Make dogfooding actually work

**Add:** a `sdrive doctor` command (see B3) and run it in CI against this repo.

**At review time:** `.sdrive/` had no `team.json`, no `config.json`, no `constitution.md`, and an empty `workflow-state.json`. Result: `node .sdrive/commands/router.js /sdrive:skills` → "Permission denied"; `sdrive validate` → skipped config and failed on a leftover fixture; `sdrive status` → "No features found" while root `workflow-state.json` described a `user-login` feature that no command could see.

**Resolved:** `sdrive doctor --fix` created `config.json` and `team.json`; `team:add` seeded the admin; the committed `test-feature` fixture was removed; the root demo files moved to `examples/demo/`. `sdrive doctor` and `sdrive validate` now pass in this repository.

**Do:**
- Run `sdrive init --tools none --no-dashboard` and commit the resulting config/team (or document the bootstrap step in CONTRIBUTING).
- Delete the root `workflow-state.json`, `team.json`, `audit-log.json`, `constitution.md`, and empty `governance/`. They are not read by any code path (`grep` confirms every read is under `.sdrive/`). Either move them to `examples/` or remove them.
- Remove the committed `test-feature` fixture, or make it schema-valid and move it under `test/fixtures/`.

#### A6. Break up `src/index.js` and expose a programmatic API

**Problem:** one 2,545-line file registers 31 commands, owns `init`, `update`, MCP wiring, adapter generation, git branch handling, and `process.exit()` on every error. It parses on `require`, so it cannot be imported by a test or embedded in another tool.

**Add:**

```text
src/
  index.js            # bin shim: require("./cli").run(process.argv)
  cli.js              # commander wiring only
  commands/           # init.js, update.js, status.js, approve.js, ...
  lib/
    paths.js          # project root, .sdrive paths, CommonJS scope
    state.js          # read/write/lock/validate workflow state
    execute.js        # execFile wrapper
    output.js         # JSON vs human output, exit codes
scripts/              # developer-facing scripts (unchanged)
```

- Export `run(argv, { cwd, env })` returning `{ code, data }` instead of exiting.
- Keep `process.exit()` only in `src/index.js`.
- Add `exports` and `types` (JSDoc + `checkJs`) to `package.json`.

**Why:** it makes unit tests possible without spawning a process, and it lets the dashboard/MCP call the same code instead of re-implementing rules (which they already partly do through `requireRules`).

#### A7. Fix the encoding drift

**Add:** re-save `dashboard/app.js` as UTF-8 (21 lines currently render `Â·`, `âœ“`, `ðŸ’¤`, etc.), and add a CI check (`scripts/check-encoding.js`) that fails on the mojibake byte sequences `C3 82 C2 B7`, `C3 A2 E2 82 AC`, `C3 B0 C5 B8`.

---

### Theme B — Make the gates trustworthy and automatable (P1)

#### B1. Evidence ingestion: make `/sdrive:test` produce machine-checkable proof

**This is the highest-value product addition.** Today the review gate requires a `testIds` array and `status: "complete"` in `traceability.json`, plus `Status: PASS` in `review.md`. All three are text a human or agent can author without running anything.

**Add:** `sdrive test <feature> [--cmd "<command>"] [--report <junit.xml>] [--json]`

Behavior:
1. Resolve the test command from `.sdrive/config.json` (`test.command`), the constitution, or `--cmd`.
2. Run it with `execFile`/`spawn` (no shell string), capture stdout/stderr, exit code, duration.
3. Parse JUnit XML, Jest JSON, Vitest JSON, pytest JSON, or `go test -json` into `{ testId, name, status, duration, file }`.
4. Map test names containing `AC-###` to acceptance criteria.
5. Write `.sdrive/governance/<feature>/<version>/test-evidence.json`:

```json
{
  "feature": "user-login",
  "version": "v1",
  "command": "npm test -- --runInBand",
  "exitCode": 0,
  "commit": "edc273b",
  "startedAt": "2026-10-18T22:00:00Z",
  "durationMs": 18432,
  "reportHash": "sha256:…",
  "summary": { "total": 42, "passed": 42, "failed": 0, "skipped": 0 },
  "tests": [{ "testId": "TEST-001", "name": "AC-001 logs in", "status": "passed", "acIds": ["AC-001"] }]
}
```

6. `sdrive approve <feature> review` requires that `test-evidence.json` exists, `exitCode === 0`, `failed === 0`, and its `commit` matches `HEAD` (or `--allow-stale`). `traceability.json` test IDs must be a subset of the evidence's test IDs.
7. `sdrive verify <feature>` can then report "evidence-backed" vs "self-reported".

**Why:** it converts the framework's central claim ("a gate cannot be approved on trust") from a property of the checker to a property of the evidence. It also gives developers a useful command: run the tests and update traceability in one step, instead of hand-editing JSON.

**Acceptance:** deleting `test-evidence.json` blocks review; a failing test blocks review; a stale commit blocks review with a clear message; the report is reproducible from the command in the file.

#### B2. Tamper-evident audit trail and signed approvals

**Add:**
- `audit-log.json` entries gain `prevHash` and `hash` (SHA-256 over canonical JSON + previous hash), forming a chain.
- Optional HMAC with a key from `SDRIVE_AUDIT_KEY` / OS keychain for teams that need it.
- `sdrive audit:verify` — recompute the chain, report the first broken link.
- Approval entries record `commit`, `evidenceHash`, `command`, `args`, and the actor.

**Why:** the current log is a plain JSON array anyone can rewrite. For an "enterprise governance" tool, an editable approval log is the weakest possible link. A hash chain is cheap and detects casual edits; HMAC detects deliberate ones.

#### B3. `sdrive doctor` — one command that explains a broken setup

**Add:** `sdrive doctor [--json] [--fix]`

Checks:
- Node version satisfies `engines` (currently `>=18`).
- Git identity is set (permissions depend on `git config user.name`).
- `.sdrive/` exists and contains `config.json`, `team.json`, `workflow-state.json`, `schemas/`, `scripts/`, `commands/`.
- `workflow-state.json` and `config.json` validate against their schemas.
- Team roster is non-empty; the current git user has a role; permission rules cover every mutating CLI command.
- Adapter registry passes `adapters:verify --strict`.
- `.sdrive/package.json` exists with `type: commonjs`.
- The installed `.sdrive` version matches the CLI version (see B8).
- `ajv` is resolvable from the project (see B7).
- Dashboard port is free (optional).
- Stale test fixtures / uncommitted state (warn only).

**Output contract:** each check is `{ id, status: "ok"|"warn"|"fail", message, fix }`; `--fix` applies only safe fixes (create missing `team.json` skeleton, write `.sdrive/package.json`, regenerate adapters). Exit `0` if no fails, `3` if fails.

**Why:** it would have caught every one of the dogfooding failures in this repo in one command, and it is the first thing a new user needs when a command says "run `sdrive init` first".

#### B4. Machine-readable output and a stable exit-code contract

**Add:** global `--json`, `--no-color`, `--quiet`, `--verbose`.

Apply to at least: `status`, `validate`, `verify`, `approve`, `archive:check`, `archive:finalize`, `adapters:list`, `doctor`, `test`.

```json
{ "ok": false, "command": "approve", "code": 3,
  "data": { "feature": "user-login", "version": "v1", "gate": "review" },
  "blockers": ["2 of 5 acceptance criteria have no passing test (AC-003, AC-004)"],
  "warnings": [] }
```

Exit codes (documented in `docs/commands.md`):

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | unexpected/internal error |
| 2 | not a SpecDrive project / not initialized |
| 3 | gate blocked (evidence missing or unmet) |
| 4 | validation failed (schema/governance) |
| 5 | permission denied |
| 6 | usage error (bad flag/argument) |
| 7 | verification drift (missing/renamed code) |

**Why:** without this, CI can only grep emoji, and the dashboard/MCP must re-implement logic. It is also the prerequisite for an editor extension and for `sdrive check`.

#### B5. Atomic state writes and a lock

**Add:** `src/lib/state.js`:

- `withLock(projectRoot, fn)` using `fs.openSync(path, "wx")` on `.sdrive/.state.lock` with stale-lock detection and a timeout.
- `writeJsonAtomic(file, data)` — write `file.tmp`, `fsync`, `rename`.
- `mutateState(root, mutator)` — read, validate, mutate, validate, atomic write, audit; on validation failure, write nothing.
- Back up the previous state to `.sdrive/.backups/workflow-state.<timestamp>.json` (keep last N).

Use it for `workflow-state.json`, `team.json`, `config.json`, `audit-log.json`, and governance JSON.

**Why:** `sdrive approve`, the dashboard, and an editor can currently write the same file concurrently and lose updates; a crash mid-write leaves truncated JSON; and no command validates state on write (only `sdrive validate` does, on demand). This is a data-loss bug waiting for a team of more than one.

#### B6. Deny-by-default permissions, fail-closed

**Add:**
- Every mutating CLI command gets an explicit rule. `update`, `assign`, `status`, `team:list`, `template:list` currently have none and are allowed by default (with a warning).
- Remove the `migrate` rule or add the command (see C8).
- If `.sdrive/scripts/check-permission.js` is missing, **fail** for mutating commands instead of returning success. Emit a clear "governance is not installed; run `sdrive doctor`" error.
- `sdrive permissions:check` — verifies every command in `commands/manifest.json` + `src/index.js` has a rule, and every rule names an existing command.
- Permission decisions are written to the audit log (allow and deny), not only denials.

**Why:** a governance tool that silently allows when its checker is deleted is not enforcing governance. The fix is small and the failure mode becomes honest.

#### B7. Fix the validator's `ajv` dependency

**Problem:** `sdrive validate` spawns `.sdrive/scripts/validate-governance.js`, which does `require("ajv")`. Node resolves that from the **consuming project's** `node_modules`, not from the globally installed CLI. `sdrive init` copies no `package.json` with dependencies (`.sdrive/package.json` is only `{"type":"commonjs"}`). In any project without `ajv` in an ancestor `node_modules`, validation fails with `MODULE_NOT_FOUND`.

This machine happens to have `node_modules/ajv` in a parent directory of the checkout, which masks the bug. A project on another drive, or a clean machine, will not.

**Add one of:**
- **Preferred:** run validation in-process from the CLI (`src/lib/validate.js` uses the CLI's own `ajv`), and make the installed script a thin wrapper that prints "run `sdrive validate`" if `ajv` is missing.
- Or vendor a minimal validator (only the keywords these six schemas use) under `.sdrive/scripts/lib/`.
- Or ship `.sdrive/package.json` with `dependencies: { ajv, ajv-formats }` and have `init`/`update` run `npm install --prefix .sdrive` (with an offline fallback and a clear error).

**Also:** the README CI snippet (`cd .sdrive && npm install`) is based on this bug but cannot work, because `.sdrive/package.json` declares no dependencies. Fix the snippet and add `sdrive ci init` (C3).

#### B8. Install manifest, drift detection, and a real `update`

**Add:** `.sdrive/framework-manifest.json`:

```json
{
  "cliVersion": "0.1.42",
  "installedAt": "2026-10-18T22:00:00Z",
  "files": { "scripts/verify.js": "sha256:…", "commands/gates.js": "sha256:…" }
}
```

- `sdrive update --check` / `sdrive doctor` compares hashes and reports locally modified framework files.
- `sdrive update` refreshes **`commands/`** as well (currently excluded from `frameworkDirs`, so fixes to `gates.js`/`archive.js`/`router.js` never reach existing projects). Keep a three-way merge or back up local edits before overwriting.
- `sdrive update` refuses to run when the project's CLI version is newer than the package (downgrade guard).

**Why:** the CLI's `approve` loads `../commands/gates.js` from the **package**, while `pre-commit.js` loads `.sdrive/commands/gates.js` from the **project**. Because `update` never refreshes the project copy, those two can disagree about what "approved" means — exactly the class of bug the shared accessors were written to prevent. The manifest makes the drift visible and the refresh actually ship fixes.

---

### Theme C — Add capabilities that solve developers' real problems (P2)

These are the product-level additions. They are ordered by leverage.

#### C1. `sdrive impact` — what does this change touch?

**Add:** `sdrive impact <feature> [--since <ref>] [--json]`

Uses `git diff --name-only <ref>...HEAD` plus `traceability.json` / `plan.json` to list:
- tasks whose files changed,
- acceptance criteria whose tests are now stale,
- docs whose referenced paths changed,
- untracked files not in the plan (reuse `verify.js`'s "extra" logic).

**Why:** it turns "run the whole suite and hope" into "re-test these 3 ACs". It also gives `/sdrive:review` a concrete drift list instead of a generic audit.

#### C2. Issue-tracker ingestion and PR linkage

**Add:**
- `sdrive issue:import <id|url>` — GitHub Issues, Jira, Linear → draft `spec.md` + `spec.json` (requirements from the issue body, ACs from a checklist).
- `sdrive issue:link <feature> <id|url>` — stores the link in `workflow-state.json` and `spec.json`.
- `sdrive pr:link <feature> --pr <number>` — records the PR, checks it is merged into `feature.base`, and lets `archive:finalize` verify the merge.
- `sdrive issue:export <feature>` — posts status/AC progress back.

**Why:** this is the missing bridge between the ticket where the problem is described and the spec where it is solved. It also gives non-developers a view without reading `.sdrive/`.

#### C3. `sdrive ci init` and a reusable GitHub Action

**Add:**
- `sdrive ci init --provider github|gitlab|azure` generates a correct workflow:
  - installs the CLI (`npm ci` in the project if it is a Node project, otherwise `npx specdrive-cli`),
  - runs `sdrive validate --json`, `sdrive verify <feature> --json`, `sdrive doctor`,
  - runs the project's tests via `sdrive test`,
  - uploads evidence as artifacts.
- `action.yml` at the repo root so users can `uses: kenule500/SpecDrive@v1` (for org-internal use while the repository is private).
- Fix the README snippet: `node .sdrive/scripts/verify.js` requires a feature argument and currently always exits 1.

**Why:** the documented CI integration does not work today. A generated, tested workflow is also the best advertisement for the tool.

#### C4. `sdrive check` — one command for pre-commit and CI

**Add:** `sdrive check [--staged] [--changed] [--json]`

Runs, in order and stops at the first failure (or `--all`):
1. `doctor` (fast subset),
2. `validate`,
3. `verify` for features whose implementation gate is approved (current pre-commit logic),
4. `test` for changed features (optional, `--tests`),
5. configured `lint` / `build` commands from `.sdrive/config.json`.

Wire it to `.git/hooks/pre-commit` (replacing the current `pre-commit.js` call) and to CI.

**Why:** the current pre-commit validates JSON and verifies only features whose implementation gate is approved. It does not run the project's tests, lint, or build, so it cannot catch the most common regressions.

#### C5. MCP server: fix the crash and expand it

**Fix:**
- `mcp/server.js:285` crashes on malformed JSON because the `catch` calls `JSON.parse(line)` again. Wrap the first parse in its own `try`, respond with JSON-RPC `-32700`, and keep the process alive.
- `specdrive.status` reads `feature.phase`, but `workflow-state.schema.json` puts `phase` on **versions**, not features. Read `feature.versions.find(v => v.id === feature.currentVersion).phase`.
- Negotiate protocol version; currently hard-coded `2024-11-05`.

**Add tools:**
- `specdrive.status` richer: current step, blockers, next command.
- `specdrive.next_action` — the same `nextAction` the dashboard computes.
- `specdrive.validate` structured results (not a string).
- `specdrive.approve` (write, permission-checked, with a confirm token).
- `specdrive.create` (write).
- `specdrive.verify` / `specdrive.test` (long-running; return a job id).
- Resources: `specdrive://features/<name>/spec`, `.../traceability`, `.../plan`.
- Prompts: the 16 slash commands as MCP prompts, so a client can list them.

**Why:** MCP is the integration surface for every AI tool; six read-only tools is a fraction of what the CLI can do, and the malformed-input crash is a one-line fix with an outsized reliability impact.

#### C6. Dashboard: bind localhost, add security headers, and optional actions

**Fix:**
- `server.listen(port, "127.0.0.1", cb)` by default; `SDRIVE_HOST=0.0.0.0` to opt in, with a printed warning.
- Security headers: `Content-Security-Policy` (no inline script beyond the app's own, no `unsafe-eval`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` for `/api/*`.
- Sanitize markdown link protocols to `http:`, `https:`, `mailto:` (currently `[x](javascript:…)` is rendered).
- Add a per-session token (query or cookie) when binding beyond localhost.

**Then, optionally:** approve/assign/archive actions behind a confirm token, so the dashboard is not permanently read-only. If write actions stay out of scope, say so in the README (it currently implies a "command reference" but not actions).

**Why:** a no-auth server on `0.0.0.0` that can read every project file (minus a deny list) is a LAN data-exposure bug. The comment in `apiFile` says "only listens on localhost"; the code does not.

#### C7. Performance/security evidence ingestion

**Add:** `sdrive report:ingest --type lighthouse|trivy|semgrep|axe --file <report>`

Normalizes third-party reports into `.sdrive/reports/{performance,security,accessibility}/<feature>-<version>-<date>.json` and links findings to NFR IDs. `/sdrive:performance` and `/sdrive:secure` then have numbers to approve, instead of prose.

**Why:** the NFR gates are the ones most likely to be "approved" without measurement. This is the same evidence principle as B1, applied to performance and security.

#### C8. Restore or remove migration; wire or remove plugins

- The Complete Reference documents `sdrive migrate`, `commands/permissions.json` has a `migrate` rule, and `scripts/migrate.js` prints a deprecation message. Pick one: add `sdrive migrate openspec|speckit` (the scripts exist) or remove the rule and the doc reference.
- `scripts/load-plugins.js`, `plugins/registry.json`, and `plugins/example-plugin/` are not referenced by the CLI. Either wire a plugin API (validators, detectors, dashboard panels, report ingesters) or delete them. Dead extension points are worse than none: they imply a capability that does not exist.

#### C9. Docs and manifest drift check

**Add:** `scripts/check-docs.js` (run in CI):

- Every `sdrive <command>` mentioned in README/docs exists in `src/index.js`.
- Every command in `commands/manifest.json` has an agent file and a permission rule.
- Every agent file is referenced by the manifest.
- Every tool in `commands/tools.json` passes `adapters:verify`.
- Every code sample in docs is executed in a sandbox (at least `--help` and `init --tools none`).

**Why:** the repo already has drift (`migrate`, missing README entries for `update-propose`/`assign`, a broken CI snippet). A check is cheaper than a docs rewrite.

#### C10. Agent/prompt lint and golden tests

The 16 agent files are the product's behavior, but they are untested prose.

**Add:**
- `agents.schema.json` + `npm run agents:lint`: required frontmatter keys (`name`, `user-invocable`, `tools`), required sections (Purpose, What it does, When to use, Approval), no references to commands/files that do not exist.
- Golden tests for `manifest.json` → adapter generation (the registry already has `writeAdapters`; test each format: `md`, `mdc`, `toml`, `command-set`).
- A "prompt contract" test: every `/sdrive:*` command's agent file mentions the CLI commands it is allowed to run.

**Why:** when an agent prompt and the CLI disagree, the user gets a confident wrong answer. Linting and golden tests make that class of drift visible in CI.

---

## 4. Suggested sequence

### Sprint 1 — "make it developable" (1 week)

1. A1 scripts + CI matrix.
2. A2 sandbox helper, fix/delete stale tests, make tests hermetic.
3. A3 `.gitignore`, `.editorconfig`, `.nvmrc`, LICENSE.
4. A7 encoding fix.
5. A5 dogfooding cleanup (delete dead root state, init `.sdrive`).

**Exit criteria:** `npm ci && npm test && npm run lint` green on Windows and Linux; `git status` clean after tests; CI runs on every PR.

### Sprint 2 — "make it trustworthy" (2 weeks)

1. B1 evidence ingestion (`sdrive test` + `test-evidence.json` + gate enforcement).
2. B4 `--json` + exit codes for `status`, `validate`, `verify`, `approve`, `archive:check`.
3. B5 atomic state + lock.
4. B3 `sdrive doctor` (MVP: the checks that would have caught this repo's issues).

**Exit criteria:** review cannot be approved from hand-written JSON; CI can consume `--json`; concurrent approve/status does not corrupt state.

### Sprint 3 — "make it automatic" (2 weeks)

1. B6 deny-by-default + `permissions:check`.
2. B8 install manifest + `commands/` refresh + `update --check`.
3. B7 validator dependency fix.
4. C3 `sdrive ci init` + `action.yml`.
5. C4 `sdrive check` + pre-commit wiring.

**Exit criteria:** a fresh project on a clean machine runs `init → propose → apply → test → approve → archive` with no manual dependency install; `update` propagates a gate fix.

### Sprint 4 — "make it solve more" (ongoing)

C1 impact, C2 issue tracker, C5 MCP write tools, C6 dashboard hardening, C7 report ingestion, C9/C10 drift checks.

---

## 5. Top five, if only five

1. **`sdrive test` + `test-evidence.json` + gate enforcement** (B1). It is the difference between "the gate checks a claim" and "the gate checks a fact".
2. **Test runner + CI matrix** (A1/A2). Without it, every change to gate logic is unreviewed.
3. **`sdrive doctor`** (B3). It turns the most common failure ("run `init` first") into a diagnosis, and it would have caught this repo's broken dogfooding.
4. **`--json` + exit codes** (B4). It unlocks CI, editors, and agent integrations without scraping emoji.
5. **Atomic state + locking** (B5). It prevents silent data loss the moment two people or two processes touch the same feature.

---

## 6. Trade-offs and things not to do

- **Don't auto-install dependencies from `init`** without a flag. It is surprising and fails offline. Prefer bundling the validator or running it in-process.
- **Don't make the dashboard writable by default.** If write actions are added, require a token and an explicit `--allow-write`; governance writes should stay deliberate.
- **Don't make `--json` a separate code path.** Build human output on top of the same structured result, or the two will drift.
- **Don't delete the `.sdrive/` mirror without providing `npm run dogfood`.** Contributors need a one-command way to reproduce the installed layout.
- **Don't block `update` on a clean tree forever.** Back up modified framework files and report them; refusing to update is how projects get stuck on an old version.

---

## Appendix — Evidence log

Commands run during this review (all read-only except `npm install` and temporary files, which were cleaned up):

```text
npm install --cache .npm-cache        # succeeded; deps resolve
npm test                              # Missing script: "test"
node test/*.js                        # 5/16 exit 0 in this sandbox; several failures are
                                      # piped-stdio EPERM, not logic — see note below
node .sdrive/scripts/validate-governance.js
                                      # FAILS: committed test-feature fixture violates minLength
node .sdrive/commands/router.js /sdrive:skills
                                      # Permission denied: .sdrive/team.json is missing
node src/index.js status              # "No features found" while root workflow-state.json has one
node src/index.js adapters:verify     # 30 tools valid; 5 unverified warnings
'not json' | node mcp/server.js       # SyntaxError at mcp/server.js:285; process exits
npm run ... (no scripts)
```

Note on test results: this agent runs under a Windows file sandbox that blocks named-pipe stdio, so tests using `execSync`/`spawnSync` with default `stdio: "pipe"` fail with `EPERM` independently of the code under test. The failures I treat as real in this document are the ones confirmed by direct inspection or by running the underlying command without a pipe:

- `test-create.js` → `MODULE_NOT_FOUND: .sdrive/src/index.js` (path never exists).
- `test-validator.js` → its cleanup deletes the tracked `.sdrive/governance/test-feature/` fixture; that same fixture is schema-invalid, so `sdrive validate` fails when it is present.
- `test-router.js` → permission denied because `.sdrive/team.json` is absent.
- `test-end-to-end.js` → depends on `test-create.js`.

The test-suite count (5/16 green) should be re-run in a normal shell before being used as a baseline; the structural findings (no runner, stale paths, non-hermetic tests, committed fixture) do not depend on it.

---

## Implementation status

Implemented in the working tree on 2026-10-19. **Not published; no version bump.**

| Area | Status |
|---|---|
| A1 test script + CI matrix | Added `npm test`, `npm run lint`, `npm run encoding:check`, `npm run docs:check`, `npm run ci`, `.github/workflows/ci.yml` (Node 18–24 × Linux/Windows/macOS) |
| A2 hermetic tests | Added `test/helpers/sandbox.js`; rewrote `test-create`, `test-validator`, `test-router`, `test-end-to-end`; added unit tests for state, permissions, evidence, audit; added MCP test |
| A3 repo hygiene | `.gitignore`, `.editorconfig`, `.nvmrc`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` |
| A4 duplicate `.sdrive/` | Kept (CI dogfood job), but generated from source by `npm run dogfood`; added framework manifest |
| A5 dogfooding | `sdrive doctor` passes in this repository; dead root state files moved to `examples/demo/`; `.sdrive/config.json` and `.sdrive/team.json` created by `doctor --fix` + `team:add` |
| A6 split `src/index.js` | Partial: shared logic moved to `src/lib/` (exit, output, execute, state, permissions, manifest, evidence, doctor, audit). `src/index.js` remains the wiring layer |
| A7 encoding | Fixed all mojibake in `dashboard/app.js`; `scripts/check-encoding.js` in CI |
| B1 test evidence | Implemented `sdrive test`, `test-evidence.schema.json`, gate enforcement, config opt-in |
| B1b structured review | Implemented `review.schema.json`, `review.json`, commit/branch binding, diff scope, test-quality/security/NFR/CI checks, human PASS confirmation, config opt-in |
| B2 audit chain | Implemented `prevHash`/`hash`, `sdrive audit:verify`; HMAC deferred |
| B3 doctor | Implemented with `--json` and `--fix` |
| B4 JSON + exit codes | Implemented on the high-value commands; not every command yet |
| B5 atomic state | Implemented for workflow-state, team, config, audit; archive writes atomically |
| B6 permissions | Deny-by-default, fail-closed, `permissions:check`, all rules added |
| B7 validator dependency | `sdrive validate` runs in-process; doctor checks the installed script's resolution |
| B8 update/manifest | `commands/*.js` refreshed; `update --check`; manifest written by init/update/dogfood |
| Migration adapters | `migrate:detect/plan/apply/verify/rollback` for OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, and generic folders; reports and rollback under `.sdrive/migration-runs/` |
| Dashboard visibility | Quality page (validation + migration runs) and feature Evidence tab (test evidence, review.json, archive readiness, stale-commit warning) |
| C1–C10 | Not started (impact, issue import, CI generator, MCP write tools, report ingestion, docs/agent generators) |

### Verification performed

- `node scripts/check-syntax.js` — 69 files parse.
- `node scripts/check-encoding.js` — clean.
- Full `npm test` — 53/53 pass (after `npm ci`).
- `npm run ci` — lint, encoding, tests, and docs/registry drift all pass.
- Manual CLI runs in temp projects: `init`, `doctor`, `team:add`, `config:set`,
  `test` (evidence written), `approve review` (refused without evidence,
  accepted with passing evidence), `update --check`, `permissions:check`,
  `audit:verify`.
- Live dashboard: `GET /` and `/theme.js` return 200, CSP and `nosniff` headers
  are present, and the server binds loopback.
