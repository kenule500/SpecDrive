# Changelog

Notable changes to `specdrive-cli`. Everything here is user-facing: what shipped,
what it changes for an existing project, and what to run after upgrading.

SpecDrive is pre-1.0, so a release that adds features ships as a patch bump.

---

## Unreleased

Nothing yet.

---

## 0.1.51 — 2026-10-30

**Groups and batches: `/sdrive:propose [w2 p1]`, `[m5 p1 build]`, `[b1]` — and many features
on one branch, when the user says so.**

> Supersedes `0.1.50`, which was published from an earlier commit: that tarball has the group
> expressions and the shared-branch rules, but not the `Kind` selector, the gated refusal, the
> declared `Batch` column, or the dashboard and documentation work below.

`/sdrive:propose` now accepts a bracketed *selection* instead of a single feature name. A
comma separates items, a space filters them, and a segment is a filter only when every word
in it is a selector — so `[wave1 p2]` is a query while `[signup, video call]` is two
features and `video call` stays one name.

### Added

- `sdrive group:resolve "<expression>" [--json]` — the resolver `/sdrive:propose [ ... ]`
  uses, exposed so an agent can show the selection, its count, and the suggested branch name
  before anything is created. Exit `4` when nothing matches, listing the waves and
  priorities that *are* selectable.
- `/sdrive:propose [ ... ]`: resolve → show the list → confirm → ask the branch question
  **once** → run the per-feature workflow for each feature, stopping at every Gate 1 and
  Gate 2. Grouping buys one branch decision and one name, never one approval.
- **Shared branches are a recorded decision, not an accident.** Two features may record the
  same `branch`; the group is derived from that equality, so there is nothing to store and
  nothing to migrate.
- **`Kind` on backlog items** (`build` | `decision` | `release`) with a matching selector, so
  `[w2 p1 build]` excludes the work a coverage gate cannot pass — a decision has no test, and
  a release cannot run before the build lands. The product plan only needs a `Kind` column;
  without one every row is treated as a build, exactly as before.
- **Declared batches: a backlog `Batch` column** (`b1`, `b2`, …) records the items that land
  together on one branch, and `[b1]` is the one-word form of "all of these, one branch". Wave
  is *derived* from dependencies; a batch is *declared* by a human. A broken batch is refused
  rather than warned about — a member that is not a `build`, a gated member, or members split
  across two waves. Anything else in the brackets (`[b1, signup]`) reverts to a plain
  selection, so "one branch" is a property of the whole expression, never of a fragment.
- **A shared branch that would stall is refused, not just warned about.**
  `sdrive group:resolve` reports the *gated* items — `needs discovery`, `deferred`, or a
  dependency cell naming access that must be granted — because a shared branch merges only
  when every member passes review, so one gated member holds the whole group.
  `--exclude-gated` drops them from the selection, `--allow-gated` accepts the wait, and a
  selection larger than four features warns (8+ approval stops; one failure freezes all).
- **Only viable branch topologies are offered.** `sdrive group:resolve` now returns
  `topology.options`, each with `ok`, plus `topology.excluded` for members no topology can
  save — a decision cannot pass a coverage gate, and a release step postdates the merge. A
  shared branch is never offered for a set containing a gated member, because it could not
  archive. The agent builds the branch question from the viable options instead of inventing
  its own, so a deadlocked topology can no longer be picked.

### Changed

- `sdrive archive:check` / `archive:finalize` treat a shared branch as one review unit: the
  branch merges once, when **every** feature recording it is ready, and the refusal names
  the sibling and quotes its own blockers (CON-611).
- **CON-606** and **CON-611** are amended: one branch per feature remains the default, but
  features share a branch by recorded decision, and a shared branch still lands as a single
  review unit.

### Notes

- The dashboard Branching read-out does not yet count shared branches — it still reports the
  model (GitHub Flow / trunk-based / stacked). Planned, not shipped.

---

## 0.1.50 — 2026-10-29

**Groups: `/sdrive:propose [wave1 p2]`, and many features on one branch — when the user says
so.** Published from the `groups` commit; superseded by `0.1.51`.

### Added

- `/sdrive:propose [ ... ]`: a bracketed argument is a *selection*, not a feature name. A comma
  separates items, a space filters them, and a segment is a filter only when every word in it
  is a selector — so `[wave1 p2]` is a query while `[signup, video call]` is two features.
- `sdrive group:resolve "<expression>" [--json]` — the same resolver, so an agent can show the
  selection and its count before anything is created.
- Shared branches as a recorded decision: two features may record the same `branch`, and the
  group is derived from that equality rather than stored.

### Changed

- `sdrive archive:check` / `archive:finalize` treat a shared branch as one review unit: it
  merges once, when **every** feature recording it is ready (CON-611).
- CON-606 and CON-611 amended: one branch per feature stays the default, but a shared branch
  lands as a single review unit.

---

## 0.1.49 — 2026-10-29

### Changed

- `sdrive verify` names a missing field with its entity — `AngiImportOutcome.line`, not a
  bare `line`. A lone field name in the missing list cannot distinguish a parser gap from a
  rename; `Entity.field` makes the difference readable at a glance.

### Fixed

- A Rust struct field with no trailing comma was silently dropped, so a plan field could be
  reported as missing while every sibling on the same struct matched. Fields are now parsed
  per line, which also tolerates a trailing inline comment and a `#[...]` attribute on the
  field line.

---

## 0.1.48 — 2026-10-29

### Fixed

- `sdrive verify` reported every Rust entity and every one of its fields as `Missing`.
  Entities were read from SQL, Prisma, TypeORM, and TypeScript only; fields from SQL,
  Prisma, and TypeScript only. A `pub struct` — with or without `pub`, and with generics
  such as `Option<T>` — was invisible to both, so an entity declared in a file the
  scanner had already matched still came back as missing.
- A rename could claim a file that already satisfied a different component. The test
  compared the first five characters of the whole path, so `crates/wirekit/Cargo.toml`
  "matched" `crates/dado/src/diag.rs` — both begin "crate". A rename now needs a similar
  basename and a file no other item has claimed; an unmatched item is reported as
  missing rather than renamed onto an unrelated file.
- A plan that declares `Cargo.toml`, `README.md`, or a YAML file as a `modify` component
  was told they were missing, because those extensions were never scanned. They are now.

---

## 0.1.47 — 2026-10-29

### Added

- **Withdrawn acceptance criteria.** A criterion that describes behaviour nobody can
  implement — a provider endpoint that was never published, a report nobody can query —
  can now be marked `withdrawn: true` in `spec.json` with a `withdrawnReason` and a
  `withdrawnEvidence` citation. The criterion stays in the specification and in the
  traceability record, is excluded from review coverage, and is reported by the planning
  gate, the review gate, and archive. Projects no longer need to fork
  `.sdrive/schemas/spec.schema.json` to describe an out-of-scope criterion — and no
  longer drift from `framework-manifest.json` if they did.
- **Descoped tasks and plan items.** `tasks.json` tasks and `plan.json` components,
  entities, and API contracts accept an optional `resolution`
  (`kind` + mandatory `reason`, optional `at`). A resolved task is neither complete nor
  outstanding: `sdrive approve <feature> implementation` stops counting it and names it,
  which is what lets a bundled feature that lost one leg archive without implementing the
  impossible or deleting the record. `sdrive verify` reports resolved plan items as
  `Withdrawn` instead of `Missing`, inherits an entity's resolution to its fields, and
  records both in `verification.json`. The dashboard counts a descoped task as neither
  pending nor complete, so progress can still reach 100%.

### Changed

- Withdrawal is refused rather than trusted: `sdrive approve <feature> review` fails when
  a flagged criterion has no reason and evidence, and fails when every criterion is
  withdrawn, so the coverage gate cannot be cleared by withdrawing scope.

### Fixed

- `sdrive verify` scanned no files in a Cargo workspace. `crates` was missing from the
  root list, and the constitution reader required a trailing slash so the `crates/*` form
  a Rust constitution uses never matched. A Rust project therefore reported its whole plan
  as missing (`Matched: 0, Missing: 83` on a feature whose code was present). `crates` is
  now a root, and a declared root is read from `` `crates/*` ``, `` `crates/` ``, and
  `` `src/components/` `` alike.
- `sdrive verify` took dependencies from `package.json` only, and returned early when a
  project had none — so every declared library dependency in a Rust, Python, or Go project
  was reported missing. It now reads `Cargo.toml` (workspace and member manifests) and
  `requirements.txt` as well, and no longer treats `internal`, `service`, or `external`
  plan dependencies as manifest-verifiable: a reused crate or a partner agreement can
  never appear in a lockfile, and reporting it as missing pinned `verification.json` to
  `fail` permanently.
  unmet prerequisite. The prerequisite list is derived by slicing `GATE_ORDER` before the
  gate and filtering the gate itself out, so an off-by-one or a duplicate entry cannot
  produce a refusal the user has no way to satisfy.
- Prerequisite refusals now state which gate is being approved and the full gate order,
  instead of naming a gate with no context.
- `sdrive approve` warns when `.sdrive/` was installed by a different CLI version than the
  one running. Version skew is the usual reason a refusal cannot be reproduced from the
  user's side, and `sdrive doctor` was the only place that reported it.
- macOS dashboards compare canonical project paths, so switching between a
  project spelled `/var/...` and one spelled `/private/var/...` works and the
  same project is not listed twice.
- `sdrive doctor` treats a missing `.sdrive/migrations/` as a layout problem, like the
  other framework directories it already checks.

---

## 0.1.46 — 2026-10-24

**Built-in knowledge MCP servers, MCP sync commands, and a Context7 fallback.**

`sdrive init` now wires three hosted knowledge servers alongside the SpecDrive
governance server: `ux-ui-library`, `stackwise`, and `context7`. Existing MCP
entries are preserved, so projects can add their own servers without losing
them. The agents also know when to use each server.

### Added

- Default MCP entries for `ux-ui-library`
  (`https://ux-ui-library.vercel.app/api/mcp`), `stackwise`
  (`https://stackwisehq.vercel.app/api/mcp`), and Context7
  (`https://mcp.context7.com/mcp`).
- `sdrive mcp:list` and `sdrive mcp:sync` for auditing and refreshing client
  configs. `--client`, `--all`, `--no-knowledge`, and `--dry-run` are supported.
- `sdrive knowledge:fetch <library>`: downloads a focused Context7 docs slice
  into `.sdrive/context/external/` when the MCP server is unavailable or a
  durable copy is needed.
- `mcp.defaultServers` in `.sdrive/config.json` (default: `true`) to opt out of
  the hosted knowledge servers while keeping the governance server.
- Agent guidance for `ux-ui-library` (UI/UX), `stackwise` (backend, data, AI),
  and Context7 (library APIs) in the constitution, specification, design,
  implementation, performance, review, security, product-plan, update-propose,
  cascade, and debug agents.

### Changed

- Claude Desktop remote entries use the `mcp-remote` stdio bridge because
  `claude_desktop_config.json` only accepts stdio entries. Cursor, Cline, Roo
  Code, Gemini CLI, and VS Code use their native remote HTTP shapes.
- The SpecDrive MCP server's `initialize` instructions now point agents at the
  knowledge servers and the `knowledge:fetch` fallback.

### Fixed

- `sdrive dashboard` now passes the CLI's dependency path to the server it
  starts, so the copied governance validator can load `ajv` in a project that
  has no `node_modules` of its own. The dashboard's validation panel no longer
  reports a false failure on a freshly initialized project.

### Upgrade

```bash
npm install -g specdrive-cli@latest
sdrive update
sdrive mcp:sync
```

`mcp:sync` only updates config files that already exist unless you pass
`--client <id>` or `--all`.

---

## 0.1.45 — 2026-10-23

**Product Plan detail drawers, prototype references, and a darker dashboard.**

Product Plan rows now open a right-side feature drawer with the description,
dependencies, lifecycle, and next step. `/sdrive:product-plan` asks about
Figma-style prototypes and visual references, and the dashboard dark theme
moves to a near-black base.

### Added

- Dashboard **Projects page**: the dashboard now opens on a portfolio of every
  project it can see (status, features, live count, current feature, gate
  progress, last activity). Cards open a project; the page reads only
  `workflow-state.json` and `audit-log.json`, never git. A rejected gate is
  "Needs attention"; pending gates are shown as the next step, not a blocker.
- `sdrive dashboard` (and the `init`/`onboard` auto-start) now **reuses a
  running dashboard**: it probes ports from `SDRIVE_PORT` upward, switches the
  first SpecDrive dashboard it finds to the current project, and exits instead
  of opening another port and tab. `SDRIVE_NO_REUSE=1` forces a new server.
- Dashboard project switcher: the topbar project name switches between the
  current project, `SDRIVE_PROJECTS`, `~/.sdrive/projects.json`, and sibling
  projects with a `.sdrive/config.json`. Switching reuses the same URL and port
  and clears cached git/health/stamp data.
- A dashboard now **records the project it serves** in
  `~/.sdrive/projects.json` on start (`SDRIVE_NO_REGISTRY=1` opts out). Projects
  in different source trees stay switchable after being opened once, instead of
  each needing its own dashboard tab.
- Dashboard **Product Plan backlog**: columns are now mapped by header text, so
  a `User value` column no longer appears as the milestone, and the summary and
  legend tables are no longer counted as candidates. Milestones come from the
  section headings. New **Depends on** and **Base for** columns show the
  feature dependency graph, and a **wave** badge groups items that can be
  developed in parallel; external prerequisites (for example `app review`) are
  listed beside feature dependencies. An expandable guide under the table adds
  a worked example, a next-step recipe, common mistakes, and a glossary.
- Dashboard defaults to **dark mode**; an explicit Light choice is remembered,
  and the OS preference no longer overrides the default.
- Dashboard **Product Plan page**: backlog, ongoing, and completed counts, a
  wave-first sort, search by ID or feature name, status/wave/milestone/priority
  filters, and 20 items per page.
- Every Product Plan row now has a **View more** button that opens an animated
  right-side drawer with the feature description, dependencies, lifecycle,
  branch/worktree, and next step. New backlogs can add a `Details` column;
  older backlogs fall back to `User value`.
- `/sdrive:worktree` prepares a branch and isolated worktree for each selected
  backlog item whose dependencies are completed and whose wave is ready. It
  records the prepared branch/worktree in `workflow-state.json` and hands off to
  `/sdrive:propose`, which reuses them.

### Changed

- Archived features are now immutable. `sdrive amend` is removed, `reopen` is
  hidden, and new work on a released feature starts with `sdrive version:new`.
  There is no path that edits a completed version in place.
- The dashboard dark theme now uses a **near-black** base and darker surfaces,
  borders, sidebar, skeletons, and scrims, while keeping the same text and
  status-chip contrast.

### Fixed

- `/sdrive:apply` no longer asks which branch a feature should eventually merge
  into. That target is `feature.base`, chosen by `/sdrive:propose` before the
  spec is written. Apply and review now read it, and `/sdrive:archive` merges
  into it; the stale apply-time prompt contradicted CON-612 and duplicated the
  propose decision.

---

## 0.1.43 — 2026-10-19

**Evidence-backed review, migration adapters, a safer install, and a richer
dashboard.**

This release moves SpecDrive's guarantees from prompt text into verifiable
artifacts: test evidence, structured reviews, hash-chained audit events, atomic
state writes, adapter-based migrations, and dashboard visibility for all of it.

### Added

- `sdrive test <feature>` runs the project's test command and records
  `.sdrive/governance/<feature>/<version>/test-evidence.json` (command, exit
  code, counts, commit, output hash, `TEST-###` / `AC-###` IDs).
- `governance.requireTestEvidence` (new projects default to `true`) makes
  `sdrive approve <feature> review` require evidence with zero failures at
  `HEAD`. Existing projects opt in with
  `sdrive config:set governance.requireTestEvidence true`.
- `review.schema.json` and `governance.requireStructuredReview` (new projects
  default to `true`). `/sdrive:review` writes `review.json` with the verdict,
  commit, branch/base, reviewer, coverage, criteria, findings, and evidence
  paths; the review gate reads it and refuses a verdict for a different commit.
- `/sdrive:review` now binds the verdict to `HEAD`, requires a clean tree and
  the recorded feature branch, audits the diff against `base`, checks test
  quality, security/NFR/docs evidence and CI, asks the human to confirm a PASS,
  and warns on self-review.
- Dashboard **Quality** page: schema validation results and detected/recent
  migrations. Feature **Evidence** tab: test evidence, structured review
  findings, stale-commit warning, and archive readiness.
- `sdrive doctor` checks Node, Git identity, layout, config/workflow schemas,
  team, permission coverage, adapters, CommonJS scope, framework-manifest drift,
  validator dependencies, test command, and audit-chain integrity. `--json` and
  `--fix` are supported.
- `sdrive check` runs doctor + validation (+ `--tests`) in one pass for CI and
  pre-push use.
- `sdrive permissions:check` verifies every CLI/slash command has a rule.
- `sdrive audit:verify` verifies the new hash-chained audit log.
- `sdrive config:get` / `sdrive config:set` for dot-path configuration.
- Migration adapters and `sdrive migrate:detect`, `migrate:plan`, `migrate:apply`,
  `migrate:verify`, and `migrate:rollback`. The adapters cover OpenSpec, GitHub
  Spec Kit, AWS Kiro, Agent OS, BMAD, and generic `specs/` folders. Every
  migration is planned before writing, records a source→target report under
  `.sdrive/migration-runs/`, and can be rolled back to the pre-migration
  `workflow-state.json`.
- `sdrive update --check` reports drift against `.sdrive/framework-manifest.json`.
- `sdrive status --json`, plus `--json` on `validate`, `verify`, `approve`,
  `archive:check`, `archive:finalize`, `doctor`, `test`, `check`, team, and
  adapter commands. Stable exit codes `0`–`9` are documented.

### Changed

- Every chat command now stages, commits, and pushes the changes it made after
  its work is complete and any required approval is granted. Commits use the
  `specdrive(<command>):` prefix; nothing is force-pushed. `/sdrive:archive` is
  exempt: it merges the feature into its confirmed target branch and pushes that
  branch instead.
- `/sdrive:archive` now detects merge conflicts before merging and resolves only
  mechanical ones on the feature branch. After a resolution it re-runs
  `sdrive validate`, `sdrive verify`, and the test suite; semantic, migration,
  security, or secret conflicts abort the merge and leave the feature in
  `ongoing/`.
- `sdrive validate` validates in-process with the CLI's own `ajv`, so it works
  in projects without a local `node_modules`.
- `sdrive update` now refreshes `commands/*.js` (gate/archive/router rules) and
  records a framework manifest. Previous versions left those files stale forever.
- `sdrive status` reports assignee, branch/base, and the next action.
- Mutating CLI commands are deny-by-default. Missing permission files fail
  closed; `SDRIVE_SKIP_PERMISSIONS=1` is a reported test-only escape hatch.
- `workflow-state.json`, `team.json`, and `audit-log.json` writes are atomic,
  locked, schema-validated (workflow state), and backed up.
- The dashboard binds `127.0.0.1` by default (`SDRIVE_HOST` opt-in), sends
  CSP/frame/referrer/no-sniff headers, marks API responses `no-store`, and
  sanitizes markdown link schemes.
- The MCP server negotiates protocol versions, exposes
  `specdrive.next_action` and `specdrive://` resources, and survives malformed
  JSON instead of crashing. `specdrive.status` now reads the version-level phase.
- `sdrive hooks:install` preserves an existing pre-commit hook as
  `pre-commit.local` instead of overwriting it.
- `commands/router.js` requires a feature for commands that accept one, even when
  the command has no gates.

### Fixed

- `dashboard/app.js` mojibake that rendered garbled icons and separators.
- `test/test-create.js` pointed at `.sdrive/src/index.js`, a path `init` never
  creates.
- `test/test-validator.js` deleted a tracked fixture; tests now run in temp
  projects.
- A documented `sdrive migrate` command with no implementation, and a CI snippet
  that ran `verify.js` without a feature.
- Shell-string execution of installed scripts (`diff`, `openapi:generate`,
  `version:new`, `diff:version`, `team:sync`, `hooks:install`, `onboard`) now
  uses argument arrays.

### For existing projects

Run after upgrading:

```bash
sdrive update
sdrive doctor
sdrive config:set governance.requireTestEvidence true   # optional opt-in
```

---

## 0.1.42 — 2026-10-18

**Archive now demands evidence, and merges back where the feature came from.**

Two changes are bundled here: the archive rules below, and the branch-workflow
change that was staged as 0.1.41 but never published.

### Enforced in code, not just in the prompt

`archive:check` and `archive:finalize` now block when:

- **`/sdrive:test` never ran** — there is no `test-report-<feature>-<version>-<date>.md`
  in `.sdrive/reports/tests/`. Only `/sdrive:test` writes that file, so its absence
  is the honest signal that coverage in `traceability.json` was never backed by a
  run. The blocker names the command to fix it.
- **`/sdrive:review` never ran** — `review.md` for the current version has no
  `Status: PASS` (already enforced at approval time; now re-checked at archive).

A feature approved before 0.1.42 may therefore be refused until `/sdrive:test` is
run once for that version. That is the intent: archive is the last moment an
untested claim can be caught, because a feature in `specs/completed/` is already on
the target branch.

### Merge destination is the branch it came from

`/sdrive:archive` merges into `feature.base` — recorded by `/sdrive:propose` when it
created the branch. There is no "which branch?" menu any more, and the default
branch is never assumed. The only exceptions are stated before merging:

- the base is a peer feature branch that has not landed (stacked) — the parent
  lands first, then this feature lands on the integration branch
- the base has since been deleted or was never recorded — falls back to the
  integration branch, reported as a fallback (and as a warning in `archive:check`)

### Delete or keep

After the merge, it asks whether to delete the branch `/sdrive:propose` created or
keep it. Delete is recommended, keep leaves both the local and remote branch
untouched, and either answer is reported.

### Tests

`test/test-archive-evidence.js` covers the new refusals in-process: no report →
refused with the fix named; report + PASS review → archivable; tests but no verdict
→ refused; legacy feature without `base` → archivable with a warning. 9 checks.

---

### Branch creation moved to `/sdrive:propose`

`/sdrive:apply` used to ask which base branch to use and create `feature/<feature>`
itself — after the spec already existed. That meant choosing a base **blind**: if
it already carried another in-flight feature's commits, the two were silently
stacked, and you only found out when `/sdrive:archive` refused the merge.

Now `/sdrive:propose` does it first, before writing anything:

1. lists **every local and remote branch** — integration branch recommended, the
   current branch marked, any branch already in use by another feature flagged
2. takes your pick as **both the base and the merge target** (CON-612)
3. switches to that base, creates `feature/<feature>` from it, and leaves you **on
   the new branch**
4. records `branch` and `base` in `workflow-state.json` before any spec file exists

`/sdrive:apply` only resumes the recorded branch. With no recorded branch it stops
and points back to `/sdrive:propose` — it never invents one. This is what prevents
overlap: the base is decided while nothing depends on it, and the merge target is
written down at the start instead of reconstructed at archive time.

Guards, unchanged in spirit but now enforced at proposal time: a clean working
tree, never the default branch, never another feature's branch, and a base that
carries another feature's commits requires explicit confirmation.

Only the agent instructions and the command manifest changed; the CLI is
unchanged. Re-run `sdrive update` (or re-install) to pick up the new agents.

> **Correction to 0.1.40:** that entry described this change a release early. The
> 0.1.40 package still has `/sdrive:apply` creating the branch. Use 0.1.41.

---

## 0.1.40 — 2026-10-18

**Documentation release. No CLI or agent changes.**

0.1.39's tarball was built before this changelog and the README's tool section
existed, so the package page did not mention any of it. 0.1.40 carried:

- `CHANGELOG.md` in the published package
- a README front page that names the 30 adapters, native slash commands, and
  `sdrive adapters:add`
- an `sdrive adapters:verify` step in the upgrading instructions
- a "historical snapshot" note on `SpecDrive-Complete-System-Reference.md`, which
  still described 13 agents and 15 tools

---

## 0.1.39 — 2026-10-18

### Tool support: 15 → 30

Fifteen tools are new: **Roo Code, Amp, Warp, Zed, Aider, Kiro, Junie, Factory,
Trae, OpenHands, Antigravity, Augment Code, goose, Crush**, plus a shared
**`AGENTS.md`** adapter for the cross-tool standard.

`AGENTS.md` is written once even when several selected tools read it, so
`--tools all` produces 87 files, not 87 duplicated prompts.

### Native slash commands

Four tools now get **one file per command** instead of a single routing stub:

| Tool | Path | You get |
|------|------|---------|
| Claude Code | `.claude/commands/sdrive/` | `/sdrive:propose`, `/sdrive:apply`, … 16 commands |
| Gemini CLI | `.gemini/commands/sdrive/` | the same 16, as TOML with `{{args}}` |
| Roo Code | `.roo/commands/` | `/sdrive-propose`, … 16 commands |
| OpenCode | `.opencode/commands/` | `/sdrive-propose`, … 16 commands |

Each generated command names its agent file, carries the manifest description,
and advertises an `argument-hint` when it takes a feature (`<feature> | --all`).

### Any tool, without waiting for a release

```bash
sdrive adapters:list                     # every tool, path, format, MCP client
sdrive adapters:verify                   # is this path one the tool would read?
sdrive adapters:verify --strict           # unverified paths become errors
sdrive adapters:add my-tool --path .mytool/rules/sdrive.md --format md
```

`adapters:add` validates before saving: unknown formats, an extension that
disagrees with the format, `.mdc` without frontmatter, absolute paths, paths
escaping the project, and duplicate names are all rejected.

### The registry now models what tools actually read

A tool definition is a list of `{ path, format, kind }` entries rather than one
string, because:

- one tool can need two files (Gemini reads `GEMINI.md` **and**
  `.gemini/commands/*.toml`)
- not every tool reads Markdown — Cursor requires `.mdc` with frontmatter,
  Gemini requires `.toml`
- `format` (content) is separate from `extension` (file name), because Zed reads
  Markdown from `.rules` and goose from `.goosehints`

Optional fields: `extension`, `frontmatter`, `naming`, `mcpClient`, `docs`, and
`verified`. Registry version is `2.0.0`.

### MCP wiring is data, not a second list

`mcpClient` travels with the tool. **Roo Code** (`.roo/mcp.json`) and
**Gemini CLI** (`.gemini/settings.json`) are now wired as well, alongside Claude
Desktop, Cursor, Cline and VS Code.

### Onboarding no longer quotes a scaffold README as your product vision

A `create-next-app` README used to become the overview: *"This is a Next.js
project bootstrapped with create-next-app."* That is true of thousands of
unrelated repositories.

The scan now detects generator boilerplate (create-next-app, create-vite,
create-remix, create-t3-app, create-svelte, create-nuxt, create-expo-app) and
treats such a README as absent rather than quoting it:

- `projectBrief.readmeQuality` is `template` or `missing`, `templateSignals`
  names what matched, and the overview is written **without a Vision section**,
  with the banner explaining why and the questions a person has to answer
- the Onboarding Agent asks: **interview me now / keep the draft / defer**
- interviewing reuses the Product Plan questions and writes `Status: Approved`
  with `Source: onboarding interview`, preserving the derived draft underneath
- a README that *is* real is still shown back to you for confirmation, because a
  scan can spot a template but only you can spot a stale description

### Fixed: five adapters that pointed at files their tool never reads

| Tool | Was | Now |
|------|-----|-----|
| Gemini CLI | `.gemini/commands/sdrive.md` (ignored — must be `.toml`) | `GEMINI.md` + `.gemini/commands/sdrive/*.toml` |
| Cursor | `.cursor/rules/sdrive.md` (ignored — plain `.md` needs no frontmatter) | `.cursor/rules/sdrive.mdc` |
| Qwen Code | `.qwen/rules/sdrive.md` | `QWEN.md` |
| VS Code | `.vscode/sdrive-commands.json` | `.github/instructions/sdrive.instructions.md` |
| Codex | `.codex/rules/sdrive.md` | `AGENTS.md` |

The old adapter test only asserted `fs.existsSync`, which is why these passed
while doing nothing. It now asserts extension↔format, required frontmatter, TOML
`prompt` fields, shared paths written once, and that a broken registry is
rejected.

### Upgrading from 0.1.38

```bash
npm install -g specdrive-cli@latest
sdrive update        # refreshes scripts/, agents/, dashboard/, and merges new tools
sdrive adapters:verify
```

- `sdrive update` merges new tool definitions into `.sdrive/commands/tools.json`
- entries you added or edited are **preserved**
- a registry still in the old single-`adapterPath` shape is repaired in place
- adapter **files** written by the old paths are left on disk, because SpecDrive
  cannot tell them from files you wrote yourself. Delete them if you want the
  directory tidy.

---

## 0.1.38 and earlier

Before this file existed. The README's [Updating SpecDrive](README.md#updating-specdrive)
section documents the two hard gates added in 0.1.36–0.1.38: review approval now
requires real traceability coverage, and `archive:finalize` no longer promotes
gates on your behalf.
