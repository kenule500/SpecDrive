# SpecDrive Command Reference

SpecDrive has two types of commands:

- Terminal commands — run in your shell
- Slash commands — run in your AI tool

---

## The next-action notice

Every execution ends by naming the next action and where it runs:

```
Next Action: sdrive validate checkout
   where: on the terminal
```

- `/sdrive:*` is marked **on the chat** — only the AI tool can load it.
- `sdrive ...` is marked **on the terminal** — an agent with a shell runs it itself
  (CON-715); the user only types it when no agent is in the loop.
- `sdrive approve ...` also runs on the terminal, but only the user gives it: the
  approval is the governance sign-off.

Commands rendered through the shared result helper carry the same answer in
`--json` as `next: { command, where, reason }`.

---

## Terminal Commands

| Command | Purpose |
|---------|---------|
| `sdrive init` | Initialize SpecDrive structure and adapters |
| `sdrive update` | Refresh framework files (dashboard, mcp, scripts, schemas, commands) without touching your specs or governance |
| `sdrive update --check` | Report drift between `.sdrive/` and the framework manifest |
| `sdrive onboard` | Scan an existing project (usually run automatically by `/sdrive:onboard`) |
| `sdrive doctor` | Diagnose the installation |
| `sdrive migrate:detect` | Detect known spec-driven frameworks |
| `sdrive migrate:plan <framework>` | Show source→target mappings without writing |
| `sdrive migrate:apply <framework> --yes` | Import a framework's specs as drafts |
| `sdrive migrate:verify <id>` | Verify imported files (`--strict` for schemas) |
| `sdrive migrate:rollback <id>` | Restore state and remove migration files |
| `sdrive validate` | Validate all governance files (`--json` for CI) |
| `sdrive config:validate` | Validate `.sdrive/config.json` |
| `sdrive config:get <key>` | Read a config value by dot path |
| `sdrive config:set <key> <value>` | Write a config value |
| `sdrive status` | Show feature lifecycle state and the next action |
| `sdrive next [feature]` | Print the exact next steps, marking which an agent runs itself and which need a person |
| `sdrive test <feature>` | Run tests and record `test-evidence.json` |
| `sdrive check` | Run doctor + validation (+ tests with `--tests`) |
| `sdrive approve <feature> <gate>` | Approve a workflow gate (verifies the stage is genuinely complete) |
| `sdrive create <feature>` | Create feature scaffold (internal) |
| `sdrive update-propose <feature>` | Validate an existing feature for extension (internal) |
| `sdrive assign <feature> <username>` | Assign an owner to a feature |
| `sdrive team:add <username> <role>` | Add a new team member |
| `sdrive team:remove <username>` | Remove a team member |
| `sdrive team:list` | List all team members |
| `sdrive team:update <username> <role>` | Update a member's role |
| `sdrive team:sync` | Sync team members from GitHub collaborators |
| `sdrive template:list` | List available templates |
| `sdrive template:set <name>` | Set default template |
| `sdrive adapters:list` | List every AI tool and the exact files each one reads |
| `sdrive adapters:verify` | Check the tool registry for paths a tool would never read |
| `sdrive adapters:add <name> --path <file>` | Support a tool SpecDrive does not ship |
| `sdrive mcp:list` | List built-in MCP servers and client config status |
| `sdrive mcp:sync` | Add SpecDrive and knowledge servers to existing MCP configs |
| `sdrive knowledge:fetch [library]` | Download focused Context7 docs into `.sdrive/context/external/` |
| `sdrive permissions:check` | Verify every command has a permission rule |
| `sdrive audit:verify` | Verify the audit-log hash chain |
| `sdrive hooks:install` | Install pre-commit validation hook (preserves an existing hook) |
| `sdrive diff <old> <new>` | Show differences between two spec files |
| `sdrive openapi:generate <feature>` | Generate OpenAPI spec from plan.json |
| `sdrive dashboard` | Start local web dashboard (also auto-started by `init` / `onboard` in a terminal) |
| `sdrive archive:check <feature>` | Report whether a feature may be archived, and why not. Reads only — changes nothing |
| `sdrive archive:finalize <feature> [--merge-commit <sha>]` | Record a completed archive. Refuses unless all four gates are already approved |
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
- `.sdrive/commands/*.js` (gate, archive, and router rules)
- `.sdrive/framework-manifest.json`
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

Report drift without writing:

```bash
sdrive update --check
sdrive update --check --json
```

`--check` compares `.sdrive/` with the hashes recorded at install time and exits
`7` when a framework file has been modified, deleted, or added.

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

### `sdrive group:resolve <expression>`

Resolves a bracketed group expression against `.sdrive/product/backlog.md`. This is the same
resolver `/sdrive:propose [ ... ]` uses, exposed so an agent can show the selection before
creating anything.

```bash
sdrive group:resolve "[wave1 p2]"
sdrive group:resolve "[signup, multilanguage, video call]" --json
```

| Expression | Means |
|------------|-------|
| `[wave1 p2]` | backlog items in wave 1 **and** priority 2 |
| `[wave1]` | every item in wave 1 |
| `[p0]` | every P0 item, in any wave |
| `[BP-004, BP-012]` | those two items |
| `[signup, video call]` | features by name — `video call` stays one name |
| `[m5 p2]` | Milestone **M5** and priority P2 |
| `[w2 p1 build]` | wave 2, priority 1, and only rows whose `Kind` is `build` |
| `[b1]` | the declared batch `b1` — **always one branch**, and refused if the batch is broken |

`wN` / `waveN` selects the **dependency-derived wave** — the same wave `/sdrive:worktree`
works from. `mN` / `milestoneN` selects the **Milestone** column. Those are different columns
and they do not always agree (in a plan where `M5` holds three crates the dependency wave can
be 1), so the two are never treated as synonyms: `[w1]` and `[m5]` can select different items.

#### Sharing one branch

The same command answers whether a selection *can* share one branch:

| Flag | Effect |
|------|--------|
| *(none)* | reports the gated items and says a shared branch would wait on them |
| `--exclude-gated` | drops them from the result (they stay in the backlog) |
| `--allow-gated` | accepts them anyway, knowing they hold the group |

**Gated** means the row is `needs discovery` or `deferred`, or its dependency cell names
access that has to be granted ("partner access", "credentials", "onboarding"). A shared
branch merges only when every member passes review (CON-611), so one gated member stalls the
whole group. A selection larger than four features warns rather than blocks: that is 8+
approval stops, and one failure freezes all of them.

#### Batches — a declared branch group

A backlog `Batch` column (`b1`, `b2`, …) records the items that **land together on one
branch**. The two axes are different in kind:

| | Wave (`wN`) | Batch (`bN`) |
|---|---|---|
| Question | what can run in parallel | what must merge at the same moment |
| Source | **derived** from `Depends on` | **declared** by a human in the backlog |
| `/sdrive:propose` | asks the branch question | `[b1]` alone **implies one branch** |

`[b1]` is validated, and a broken batch is a **refusal** rather than a blocker — it was
written by hand, so it should be fixed in the backlog:

- every member must be `Kind: build` (a decision has no test; a release postdates the merge);
- no member may be gated;
- every member must be in the **same wave** (otherwise they can never all be ready at once);
- more than four members warns.

Anything else in the brackets — `[b1, signup]`, `[b1 p1]` — is a plain selection again, and
the branch question is asked as usual: "one branch" is a property of the whole expression,
never of a fragment.

A comma separates items; a space filters them. A comma-separated segment is a filter only
when **every word** in it is a recognised selector (`wN`/`waveN`, `mN`/`milestoneN`, `pN`,
`BP-###`, `build`/`decision`/`release`, a status, `@tag`); otherwise the whole segment is a
feature name — which is why `video call` stays one name while `w2 p1 build` is a filter.

Exit code `0` when at least one item resolved, `4` when nothing matched — and the error lists
the waves and priorities that are selectable.

---

### `node .sdrive/scripts/worktree.js`

The deterministic helper behind `/sdrive:worktree`: it decides what is ready, opens the branch and
worktree, and records the preparation. The agent asks the questions; this does the part that must
be exact, so a model cannot open a later-wave branch while its dependency is still ongoing.

```bash
node .sdrive/scripts/worktree.js list [--json]
node .sdrive/scripts/worktree.js create --item BP-003 --branch feature/BP-003 [--base main] [--path <dir>] [--dry-run] [--json]
node .sdrive/scripts/worktree.js create --items BP-003,BP-004 --branch feature/start [--base main] [--dry-run] [--json]
node .sdrive/scripts/worktree.js remove (--item BP-003 | --items BP-003,BP-004 | --branch feature/x | --path <dir>) [--keep-branch] [--force] [--json]
```

| Command | What it does |
|---|---|
| `list` | readiness, the current wave, and `topologies` — the branch groupings that can actually finish |
| `create` | one branch, one worktree, one record. `--items` puts several items on **one** branch |
| `remove` | deletes the worktree, clears the record, and `git branch -d`s the branch (kept if it holds unmerged commits) |

#### The branch topology question

`list` returns `topologies` with three parts, and the agent offers only what is in `options`:

| Field | Contents |
|---|---|
| `options` | groupings that **can** reach archive: a declared batch first, then one branch for the whole ready set (only within the four-feature cap and with nothing gated), then one branch per item as the safe fallback |
| `rejected` | a grouping the user may expect but that cannot finish — e.g. `shared-all` over the cap, or one containing a gated item — with the reason |
| `excluded` | items no topology helps: a `decision` has no test to pass, a `release` step runs after the merge |

One shared branch merges once, when every member passes review (CON-611). Per-item branches merge
independently, so a stalled item blocks nobody.

#### Guards on `create`

Applied before any git command runs, in both `--item` and `--items` form:

- the item exists in the backlog and is `backlog` (no feature, no prepared worktree);
- its plan status is not `deferred` / `needs discovery`, and it has no outside blocker;
- every `Depends on` entry is `completed`;
- it is in the **current wave** — a later wave is refused, naming the wave to finish first;
- for `--items`, the selection passes the same `checkBatch` rules `/sdrive:propose` uses, so it
  cannot smuggle in a group that could not finish;
- the branch does not exist, the path is free, and the base exists.

`--dry-run` prints the branch, path, base, the record, and the next command, and writes nothing.

#### One branch is one feature

`create --items BP-001,BP-002` records `items: ["BP-001","BP-002"]` (and `item` for readers
written before shared branches existed), and returns
`next: /sdrive:propose "[BP-001, BP-002]"`. A shared branch therefore becomes **one** feature
whose `productItems` lists every member — never two features on one branch.

#### Undoing a preparation

`remove` exists because a directory deleted by hand left a record stuck at `prepared`, which made
its item permanently ineligible with no command to correct it. `list` marks each record `present`,
or `missing` when the directory is gone. `--force` discards uncommitted work, so it is never
automatic.

#### State ownership

`.sdrive/workflow-state.json` is **tracked**, and every worktree carries its own copy. When two
branches change it, the merge keeps every feature, worktree and version entry; the newer
`updatedAt` wins a clash. Nothing is ever resolved by deleting records. Writes take
`.sdrive/.state.lock` and replace the file atomically, so two `create` runs cannot lose a record.

---

### `sdrive status`

Shows all features and their lifecycle state.

```bash
sdrive status
```

For each feature, it lists every version and its phase, step, and gate status.

---

### `sdrive next [feature]`

Prints the exact next steps and **who can run each one**. This is the command an agent
runs instead of writing you a to-do list.

```bash
sdrive next checkout
sdrive next checkout --write     # also record it in .sdrive/handoff.json
sdrive next --json               # every feature, machine-readable
```

```text
📁 checkout v1
   1. [run yourself] sdrive verify checkout
      Verify compares plan.json to the code before any gate reads it.
   2. [run yourself] sdrive test checkout
      The implementation gate needs a recorded passing run.
   3. [needs you] sdrive approve checkout implementation
      Approving is a sign-off, so it stays with you.
```

Three kinds, and the split is a fact about the tool rather than a preference:

| `kind` | What it means | Who runs it |
|---|---|---|
| `cli` | a script — `verify`, `test`, `check`, `validate`, `archive:check` | **the agent**, with its terminal |
| `slash` | a prompt the host loads, e.g. `/sdrive:review` | **you** — every agent declares `agents: []`, so no agent can start another |
| `human` | `sdrive approve` | **you** — the approval *is* the governance act |

A failed review changes the answer without changing the command: when `review.json`
carries a `remediation` block, the `slash` steps come from it (each finding names the
command that clears it), followed by `sdrive test`, a re-approval of `implementation`
(new fix tasks leave that gate unsatisfied), and `/sdrive:review` again.

`--write` requires a single feature and writes `.sdrive/handoff.json`:

```json
{
  "feature": "checkout",
  "version": "v1",
  "recordedAt": "2026-11-01T10:04:00.000Z",
  "by": "sam",
  "steps": [{ "command": "sdrive test checkout", "kind": "cli", "why": "…" }]
}
```

That file is git-ignored on purpose: it describes one working copy's next move, not a
governance record, and merging it between branches would be meaningless. It exists so a
session that ends today is resumable tomorrow, in any editor, without a chat log.

---

### `sdrive approve <feature> <gate>`

Approves a workflow gate — but only after verifying that the stage's artifacts actually exist. An approval is a claim that the work is done, so the check runs **before** anything is written; if it fails, the state file is left untouched and the command exits non-zero.

```bash
sdrive approve user-login specification
```

Delegated approval is opt-in and intended for agents clearing the mechanical
gates:

```bash
sdrive approve user-login specification --delegated --reason "Spec artifacts verified by sdrive check"
```

It requires `governance.approvalMode: "delegated"`, the gate must be listed in
`governance.delegatedGates`, and `--reason` is mandatory. The history records
`by: "agent:<git-user>"`, `delegated: true`, and the reason. `review` can never
be delegated, and `archive` still requires the human merge decision. Manual
approval continues to work in either mode.

Allowed gates, in order:

- `specification` — requires `spec.md` and `spec.json`
- `planning` — requires `specification` approved, plus `plan.md`, `tasks.md`, `plan.json`, `tasks.json`, and `traceability.json`
- `implementation` — requires `specification` and `planning` approved, every task in `tasks.json` either `completed` or descoped with a `resolution`, and no failing `verification.json`
- `review` — requires `implementation` approved, a `review.md` recording `Status: PASS`, and (when `governance.requireStructuredReview` is enabled) a matching `review.json` with the same verdict and `HEAD` commit

Extra safeguards:

- Every preceding gate must already be `approved`.
- Gates cannot be approved on an archived feature (`specs/completed/`) — archived features are immutable. Use `sdrive version:new <feature>` only for new scope; the completed version stays archived.
- The feature is named explicitly; the command never falls back to the first feature in the list.
- Overwriting a `rejected` or `in_progress` value is reported, and the previous value is recorded in the version history.

Approval applies to the feature's current version.

---

### `sdrive team:add <username> <role>`

Adds a new team member.

```bash
sdrive team:add alice admin
```

`sdrive init` already adds the current Git user as `admin`. While the roster is
empty, the first member must be the acting Git user (`SDRIVE_ACTOR`, or
`git config user.name`), which prevents a typo from locking the caller out of
every mutating command.

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

### `sdrive adapters:list`

Lists every AI tool SpecDrive can configure, the exact files each one reads, the
format, and whether the path is verified against vendor documentation.

```bash
sdrive adapters:list
sdrive adapters:list --json
```

---

### `sdrive adapters:verify`

Checks the tool registry for entries a tool would never read: an extension that
disagrees with its format, `.mdc` without frontmatter, `.toml` outside a command
file, two tools disagreeing about one path, or a path escaping the project.

```bash
sdrive adapters:verify
sdrive adapters:verify --strict   # unverified paths fail
```

Exit code is `1` when anything is wrong, so it can gate CI.

---

### `sdrive adapters:add <name>`

Registers a tool SpecDrive does not ship, and generates its adapter. This is how
"any tool" is supported without waiting for a release.

```bash
sdrive adapters:add my-tool \
  --path .mytool/rules/sdrive.md \
  --format md \
  --label "My Tool" \
  --docs "https://example.com/docs"
```

| Flag | Purpose |
|------|---------|
| `--path <path>` | Required. File the tool reads |
| `--format <format>` | `md` (default), `mdc`, `toml` |
| `--extension <ext>` | When the extension differs from the format |
| `--kind <kind>` | `rules` (default), `command`, or `command-set` |
| `--naming <naming>` | For `command-set`: `nested` or `prefixed` |
| `--frontmatter <json>` | YAML frontmatter, e.g. `'{"alwaysApply":true}'` |
| `--docs <url>` | Vendor page documenting the path |
| `--mcp-client <id>` | Also wire MCP: `claude-desktop`, `cursor`, `cline`, `roo`, `gemini-cli`, `vscode` |
| `--unverified` | Record that the path is a best guess |
| `--no-generate` | Register only |

The entry is validated before it is saved, so a path your tool ignores is
rejected rather than silently doing nothing.

---

### `sdrive mcp:list`

Shows the built-in MCP servers and whether each supported client config exists,
which entries it has, and which defaults are still missing.

```bash
sdrive mcp:list
sdrive mcp:list --json
```

---

### `sdrive mcp:sync`

Adds the SpecDrive governance server and the built-in knowledge servers
(`ux-ui-library`, `stackwise`, `context7`) to MCP client configs. Existing
entries, including servers you added yourself, are never overwritten.

```bash
sdrive mcp:sync                  # update configs that already exist
sdrive mcp:sync --client cursor  # create/update one client
sdrive mcp:sync --all            # create/update every supported client
sdrive mcp:sync --no-knowledge   # wire only the SpecDrive server
sdrive mcp:sync --dry-run        # show changes without writing
```

Client ids: `claude-desktop`, `cursor`, `cline`, `roo`, `gemini-cli`, `vscode`.

To keep only the SpecDrive server permanently:

```bash
sdrive config:set mcp.defaultServers false
```

Claude Desktop only accepts stdio entries, so remote defaults are bridged with
`npx -y mcp-remote <url> --transport http-only`.

---

### `sdrive knowledge:fetch [library]`

Downloads a focused slice of a library's current documentation from Context7.
This is the fallback for clients that cannot use the Context7 MCP server, and a
way to keep a durable copy of the docs an agent used.

```bash
sdrive knowledge:fetch next.js --query "routing"
sdrive knowledge:fetch /vercel/next.js --query "middleware" --tokens 6000
sdrive knowledge:fetch --library-id /vercel/next.js --query "middleware"
sdrive knowledge:fetch react --query "hooks" --out .sdrive/context/external/react-hooks.md
```

| Flag | Purpose |
|------|---------|
| `--query <query>` | Topic to focus on (default: `overview`) |
| `--library-id <id>` | Skip the search and use a Context7 id such as `/vercel/next.js` |
| `--tokens <n>` | Approximate token budget (default: `8000`) |
| `--out <path>` | Custom output path, relative to the project root |
| `--force` | Replace a file SpecDrive did not generate |
| `--json` | Print the result as JSON |

Files are saved under `.sdrive/context/external/`. Set `CONTEXT7_API_KEY` to use an
authenticated key. A generated cache file is refreshed on the next fetch; a
hand-written file is only replaced with `--force`.

---

### `sdrive hooks:install`

Installs the SpecDrive pre-commit hook.

```bash
sdrive hooks:install
```

The hook runs two things on every commit:

1. The governance validator.
2. `sdrive verify` for features that are **ready for it** — only a feature whose `phase` is `ongoing` **and** whose `implementation` gate is `approved`. Features in `backlog/` or `completed/`, and features still being implemented, are skipped and reported.

> **Note:** The commit is blocked if governance validation fails, or if any verified feature returns `fail` (missing or renamed code). A `warn` status does not block. Because deferred and in-progress features are skipped, work on one feature never blocks commits for another.

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

If a dashboard is already running on this machine, the command **reuses it**:
it switches that server to the current project and exits, printing the URL. Only
when no dashboard answers does it start one, beginning on port `4747` and falling
back to the next free port (`4748`, `4749`, …). Override the starting port with
the `SDRIVE_PORT` environment variable, or force a separate server with
`SDRIVE_NO_REUSE=1`. Switch projects from the dashboard itself: click the project
name in the top bar, or open **Projects** in the sidebar and pick a card.

`sdrive init` and `sdrive onboard` **start the dashboard for you** when they finish, so a new project has something to look at immediately. Press `Ctrl+C` to stop it and get your prompt back — that is the normal way to stop a server, and it is reported as "Dashboard stopped", never as a failure.

| Flag / variable | Effect |
|-----------------|--------|
| `--no-dashboard` | Skip the auto-start on `sdrive init` and `sdrive onboard` |
| `SDRIVE_NO_DASHBOARD=1` | Skip the auto-start everywhere, including inside scripts |
| `SDRIVE_HOST` | Bind a different interface; default `127.0.0.1`, with a warning because there is no authentication |
| `SDRIVE_PROJECTS` | Path-delimited list of additional projects for the topbar project switcher |
| `SDRIVE_NO_REGISTRY` | Do not record this project in `~/.sdrive/projects.json` on start |
| `SDRIVE_NO_REUSE` | Always start a new dashboard instead of switching a running one |

The dashboard opens on **Projects**, one card per project it can see: status,
feature and live counts, the feature being worked on, gate progress, rejected or
next gates, and the last recorded activity. Opening a card switches to that
project. The page reads only each project's `workflow-state.json` and
`audit-log.json` — never git — so it stays fast with several projects.

The topbar project name is a switcher. It discovers the current project,
`SDRIVE_PROJECTS`, `~/.sdrive/projects.json`, and sibling projects with a
`.sdrive/config.json`. Switching reuses the same URL and port, clears the
git/health/portfolio caches, and reloads; one server has one active project at a
time.

A dashboard records the project it serves in `~/.sdrive/projects.json` when it
starts (unless `SDRIVE_NO_REGISTRY=1`). Projects living in different source
trees therefore reach each other after each has been opened once, instead of
each needing its own dashboard tab.

The auto-start is skipped by itself when there is no interactive terminal. A script or CI run would otherwise block forever on a server that never exits, so in that case the command prints how to start it manually instead.

Open `http://localhost:4747` to view:

- Onboarding status
- Detected external spec systems (OpenSpec, Spec Kit, Kiro, Agent OS, BMAD, generic)
- Migrated and skipped features
- Features and versions
- Gates and approvals per version
- Traceability coverage per version
- Spec-to-code verification status per version
- Test coverage per version
- **Test evidence, structured review findings, and archive readiness** on each feature's Evidence tab
- **Schema validation, detected migration frameworks, and recent migration runs** on the Quality page
- Team members
- Recent activity
- Project health, with the one action most worth doing next

The dashboard also supports filters:

- Search by feature name
- Filter by phase
- Filter by verification status
- Filter by test coverage
- Show current version only

#### Project health

The health score is auditable rather than decorative. Each component reports the
evidence behind it, and the panel shows which components it could score:

| Component | Weight | Reads |
| --- | --- | --- |
| Gate progress | 30 | Approved gates across live features |
| Traceability coverage | 25 | Requirement → code links that resolve |
| Verification | 15 | Features with no drift in their latest report |
| Archivable | 15 | Features that would pass `sdrive archive:check` now |
| Freshness | 15 | Days since the last audit event, decaying over 14 days |

Unscorable components are dropped from the denominator and shown as "not scored"
rather than counted as zero. The suggested next action is validated with the same
`checkGateRequirements` the CLI uses, so the dashboard never recommends an approval
that would be refused.

#### Reading spec files in place

File paths in spec documents become clickable when they resolve to a real file in
the project. Clicking opens a modal (85% of the window width, 90% of its height)
with a find bar that highlights every match and steps through them.

Existence is verified before a path becomes a link, so prose, CSS class names, and
package specifiers stay as plain text. The endpoint behind it reads only: it refuses
paths outside the project root, secret-shaped names (`.env*`, `*.pem`, `*.key`,
`secrets.json`, `.npmrc`, `.git/`, and anything matching `secret`, `credential`, or
`private-key`), files over 512 KB, and binary files.

#### Live refresh

The page polls a cheap `/api/stamp` fingerprint every five seconds and re-renders
only the panels whose data changed. Polling pauses while the tab is hidden and
catches up when it becomes visible again.

---

### `sdrive create`

Creates the backlog and governance scaffold for a feature without running an
agent. It is normally called by `/sdrive:propose`.

```bash
sdrive create user-login
```

Writes `specs/backlog/<feature>/` (`spec.md`, `plan.md`, `tasks.md`) and
`governance/<feature>/` (`spec.json`, `plan.json`, `tasks.json`,
`traceability.json`). The scaffold is deliberately incomplete; `sdrive validate`
rejects it until the agent fills it in.

---

### `sdrive update-propose`

Validates that an existing feature is editable before `/sdrive:update-propose`
extends it. Internal helper.

```bash
sdrive update-propose user-login
```

Refuses a released version; use `sdrive version:new` for new scope.

---

### `sdrive assign`

Assigns an owner to a feature.

```bash
sdrive assign user-login alice
```

Warns, but does not block, when the username is not on the team roster. Writes
`workflow-state.json` atomically.

---

### `sdrive test`

Runs the project's tests and records machine-checkable evidence for the feature.

```bash
sdrive test user-login
sdrive test user-login --cmd "pnpm vitest run"
sdrive test user-login --version v2 --timeout 900000
sdrive test user-login --prove          # also run the suite at the base commit
sdrive test user-login --prove --base origin/main
sdrive test user-login --json
```

Command resolution order:

1. `--cmd`
2. `.sdrive/config.json` → `test.command` (or `governance.testCommand`)
3. `package.json` → `scripts.test` (runs `npm test`)
4. `go.mod` → `go test ./...`
5. Python test config → `pytest`

Writes `.sdrive/governance/<feature>/<version>/test-evidence.json` with the
command, exit code, pass/fail/skip counts, commit, branch, duration, output hash,
and `TEST-###` / `AC-###` IDs found in the output.

#### `--prove` — red before green

A test that passes both before and after a change proves nothing, and it satisfies
every other check in the review gate: it passes, it is bound to `HEAD`, it appears in
traceability, and it has no `.only` or empty assertion. `--prove` closes that hole by
running the same command in a throwaway worktree at the feature's base commit:

```text
Red-before-green: 3 of 4 criteria fail at main — 1 pass without the change
```

For every acceptance criterion `traceability.json` links to a test, it records
`redGreen[]` in the evidence:

| Field | Meaning |
|---|---|
| `ac` | the criterion |
| `proven` | `true` when the suite FAILED at the base commit |
| `baseExitCode` | the exit code observed there, so the claim is checkable by hand |
| `method` | `base-run` |
| `reason` | why it is not proven, when it is not |

**A suite that crashes at base is not proof.** A missing dependency or the wrong
runtime also exits non-zero, which would make every test look honest. A run with no
recognisable results is reported as *not recorded*, with the reason, instead of being
used as evidence.

The base is the feature's recorded `baseBranch`, then `origin/HEAD`, then `main`, then
`HEAD~1`; `--base` overrides all of it. The worktree is removed with
`git worktree remove --force` and `git worktree prune` immediately afterwards.

Exit codes: `0` passed, `8` tests failed (the evidence is still written). A failure to
record proof does **not** change the exit code — it warns, because the gate is what
refuses, and it says why.

When `governance.requireTestEvidence` is `true`, `sdrive approve <feature>
review` requires evidence with `exitCode: 0`, no failures, and a commit matching
`HEAD`. `governance.allowStaleEvidence: true` relaxes only the commit check.

When `governance.requireRedGreen` is `true`, the gate additionally requires
`redGreen[]` to cover every in-scope criterion with `proven: true`. Switching it on
stamps `governance.redGreenEnforceFrom`, and **features whose earliest recorded
activity predates that stamp are grandfathered** — the refusal names the cutoff and
says so in a warning rather than blocking work that was already in flight. A feature
with no recorded timestamps at all counts as unknown age and is grandfathered too;
enforcing on work of unknowable age is how an upgrade refuses an entire project at
once.

---

### `sdrive check`

Runs the standard checks in one pass.

```bash
sdrive check
sdrive check --json
sdrive check --tests
sdrive check --skip-doctor
```

- doctor (blocking checks only)
- governance schema validation
- with `--tests`: the configured test command for every ongoing feature,
  recording evidence

Designed for CI and a pre-push habit. Exit `0` when everything passes, `4` when a
check fails.

---

### `sdrive doctor`

Diagnoses a broken installation.

```bash
sdrive doctor
sdrive doctor --json
sdrive doctor --fix
```

Checks: Node version, Git identity, `.sdrive/` layout, config and workflow-state
schemas, team roster, permission coverage, adapter registry, CommonJS marker,
framework-manifest drift, validator dependency resolution, test command, and
audit-chain integrity.

`--fix` applies only safe repairs (`.sdrive/package.json`, framework manifest).
Exit `9` means a blocking check failed.

---

### `sdrive permissions:check`

Verifies that every mutating CLI command and every slash command has a rule in
`.sdrive/commands/permissions.json`, and that no rule names a command that no
longer exists.

```bash
sdrive permissions:check
sdrive permissions:check --json
```

Mutating commands are deny-by-default. A missing `.sdrive/scripts/check-permission.js`
also fails closed.

---

### `sdrive audit:verify`

Verifies the hash chain of `.sdrive/audit-log.json`.

```bash
sdrive audit:verify
sdrive audit:verify --json
```

Each new event commits to the previous hash. Editing an old entry breaks every
later link. Legacy unhashed entries are reported but do not fail the check.

---

### `sdrive config:get`

Reads a value from `.sdrive/config.json` by dot path.

```bash
sdrive config:get governance.requireTestEvidence
sdrive config:get governance.requireTestEvidence --json
```

---

### `sdrive config:set`

Writes a value to `.sdrive/config.json` by dot path. `true`, `false`, numbers, and
JSON are parsed; everything else is a string. The result is validated against
`config.schema.json` before it is written.

```bash
sdrive config:set governance.requireTestEvidence true
sdrive config:set governance.requireStructuredReview true
sdrive config:set test.command "pnpm vitest run"
```

---

### `sdrive archive:check`

Reports whether a feature can be archived, and why not. Reads only; changes
nothing.

```bash
sdrive archive:check user-login
sdrive archive:check user-login --json
```

It refuses when a gate is not approved, when the evidence behind an approval has
changed, or when the spec is not in `specs/ongoing/`. Exit `3` when blocked.

---

### `sdrive archive:finalize`

Closes a feature's lifecycle: moves its spec to `completed/` and marks the
version completed. It never grants an approval.

```bash
sdrive archive:finalize user-login --merge-commit <sha>
sdrive archive:finalize user-login --json
```

Exit `3` when it refuses; nothing is written in that case.

---


## Exit codes

| Code | Meaning |
|---|---|
| `0` | success |
| `1` | unexpected/internal error |
| `2` | not initialized |
| `3` | gate blocked |
| `4` | validation failed |
| `5` | permission denied |
| `6` | usage error |
| `7` | verification drift |
| `8` | tests failed |
| `9` | doctor found blocking problems |

`--json` prints `{ ok, command, code, data, blockers, warnings }`; human output is
rendered from the same object.

---

## Migration commands

Migration is adapter-based. The same five commands work for every supported
framework.

### `sdrive migrate:detect`

```bash
sdrive migrate:detect
sdrive migrate:detect --json
```

Detects OpenSpec, GitHub Spec Kit, AWS Kiro, Agent OS, BMAD, and generic
`specs/` folders. Detection is read-only.

### `sdrive migrate:plan <framework>`

```bash
sdrive migrate:plan kiro
sdrive migrate:plan kiro --json --out plan.json
```

Shows every source→target file mapping, target lifecycle, conflicts, partial
mappings, placeholders, and warnings. It writes nothing unless `--out` is used.

### `sdrive migrate:apply <framework>`

```bash
sdrive migrate:apply kiro --yes
sdrive migrate:apply kiro --dry-run
```

Imports the plan. `--yes` is required; without it the command only prints the
plan. Each feature is marked `retroactive: true` and records
`migratedFrom: <framework-id>`. Migrated governance is a schema-valid
**placeholder** (`US-001`, `AC-001`, `FR-001`, `T1.1`) — replace it with the
source requirements using `/sdrive:propose` (backlog) or `/sdrive:sync`
(ongoing) before review.

Reports are written to:

```text
.sdrive/migration-runs/<migration-id>/report.json
```

### `sdrive migrate:verify <migration-id>`

```bash
sdrive migrate:verify <migration-id>
sdrive migrate:verify <migration-id> --strict
```

Checks that every mapped file exists and the report is consistent. `--strict`
also validates the migrated governance JSON against the schemas. The imported
placeholder is schema-valid; a strict failure means the placeholder or the
source mapping is broken.

### `sdrive migrate:rollback <migration-id>`

```bash
sdrive migrate:rollback <migration-id>
```

Restores `workflow-state.json` from the pre-migration snapshot and removes the
files the migration created. A `rollback.json` record is written next to the
report.

---

## Slash Commands

> **Typical workflow:** `/sdrive:onboard` (brownfield only) → `/sdrive:constitution` → optionally `/sdrive:product-plan` → `/sdrive:propose` → `/sdrive:apply` → `/sdrive:test` → `/sdrive:review` → `/sdrive:archive`

> **Extending an existing feature:** `/sdrive:update-propose "<feature>" <what to add>` → `sdrive approve <feature> specification` → `/sdrive:apply` → `/sdrive:test`

| Command | Agent | Purpose |
|---------|-------|---------|
| `/sdrive:onboard` | Onboarding | Adopt SpecDrive into an existing project, migrate OpenSpec/Spec Kit/Kiro/Agent OS/BMAD/generic specs, and offer a real product overview when the README is scaffold boilerplate |
| `/sdrive:constitution` | Constitution | Create/update constitution |
| `/sdrive:product-plan` | Product Plan | Optionally draft an app overview, conceptual mockup, roadmap, milestones, and backlog |
| `/sdrive:worktree` | Worktree | Prepare branches and isolated worktrees for the next ready Product Plan wave |
| `/sdrive:propose` | Specification | Create spec, plan, tasks |
| `/sdrive:update-propose` | Update Proposal | Extend an existing feature spec with new requirements, stories, and acceptance criteria |
| `/sdrive:design` | UI/UX | Build prototype |
| `/sdrive:sync` | Cascade | Sync downstream files after a manual edit |
| `/sdrive:skills` | Discover-skills | Manage AI skills |
| `/sdrive:docs` | Documentation | Generate docs |
| `/sdrive:apply` | Implementation | Write production code; move feature from `backlog/` to `ongoing/` |
| `/sdrive:test` | Test | Write tests, run them, report coverage |
| `/sdrive:performance` | Performance | Benchmark and optimize for speed and SEO |
| `/sdrive:debug` | Debug | Reproduce, isolate, and fix defects — layout, APIs, runtime, glitches |
| `/sdrive:review` | Review | Final audit — pass/fail verdict, no merge |
| `/sdrive:archive` | Archive | Merge an approved feature to the confirmed target branch and complete its lifecycle |
| `/sdrive:secure` | Security | Security audit |

---

### `/sdrive:product-plan` (optional)

Use this when you have an application idea but need help shaping the product-level plan. Developers who already have a suitable plan can skip it and go directly to `/sdrive:propose`.

```text
/sdrive:product-plan
```

After gathering user input and any inspiration references, Product Plan proposes:

- `.sdrive/product/overview.md` — product purpose, users, guidance, references, assumptions, and open questions
- `.sdrive/product/mockup.md` — a conceptual app map, key areas/screens, navigation, and user journeys (not a working prototype)
- `.sdrive/product/design-system.md` — sourced design principles and proposed visual/component guidance (no implementation tokens or UI code)
- `.sdrive/product/roadmap.md` — suggested milestones, sequencing, and dependencies
- `.sdrive/product/backlog.md` — user-approved product-level feature candidates, initially pending, with a `Details` description for each item

Product Plan explicitly asks whether you already have a prototype (Figma, Framer, Penpot, Sketch, Adobe XD), visual references (Dribbble, Behance, Mobbin, screenshots), or a similar product. It records the source, access status, what you like, and the high-level patterns to adapt. It does not copy protected layouts, text, assets, or branded designs, and it does not create a working prototype from a reference.

The dashboard renders the approved backlog as a paginated table sorted by dependency wave, with status, wave, milestone, and priority filters. Each row has a **View more** drawer showing its `Details` description, user value, confidence/source, dependencies, lifecycle, branch or worktree, and next step. Older backlogs without a `Details` column fall back to `User value`.

Product Plan asks whether to add, change, or defer feature ideas and gets approval before writing. It does not generate interactive prototypes, detailed feature specs, implementation tasks, or workflow-state entries. Select an approved backlog item later and run `/sdrive:propose "<feature description>"` to create its detailed plan.

> **Inspiration images:** If your AI session cannot view images (vision unavailable), Product Plan does not stall. It uses the text it can read — file names, folder names, link titles, and your own description — as high-level guidance, records the reference as an open question, and continues. You can always add detail later by describing the reference in your own words.

---

### `/sdrive:worktree` (optional)

Prepares branches and isolated git worktrees for Product Plan items that are ready to start.

```text
/sdrive:worktree
```

Run it after `/sdrive:product-plan` when you want to work on several approved backlog items without switching branches in one checkout.

**What it does:**

- Reads `Depends on`, plan status, and the dependency-derived wave from `.sdrive/product/backlog.md`
- Prepares only the lowest wave that still has eligible items; same-wave items are parallel-safe
- Skips an item when a dependency is not `completed`, an outside blocker is open, its plan status is `deferred`/`needs discovery`, it already has a feature, or it already has a prepared worktree
- Offers Product ID branches (`feature/BP-003`) or readable names (`feature/chat`) with suggestions and custom input
- Creates the branch and worktree and records it under `worktrees` in `.sdrive/workflow-state.json`
- Hands off to `/sdrive:propose` in the new worktree; `/sdrive:propose` reuses the prepared branch and records it as `feature.branch` and `feature.base`
- Does not write specs, code, or tests, and does not commit or push

```bash
node .sdrive/scripts/worktree.js list --json
node .sdrive/scripts/worktree.js create --item BP-003 --branch feature/BP-003 --base main --json
```

The helper writes the same lifecycle view the dashboard uses: `backlog`, `ongoing`, and `completed`. A completed version is never reopened; new scope starts with `sdrive version:new`.

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

### `/sdrive:update-propose`

Extends an **existing** feature specification with new requirements, user stories, and acceptance criteria.

```text
/sdrive:update-propose "signup-page" add google auth
```

**What it does:**

- Requires an existing feature (use `/sdrive:propose` for brand-new features)
- Continues ID sequences (`FR-###`, `NFR-###`, `US-###`, `AC-###`) from the highest existing ID
- Appends to `spec.md`, `plan.md`, `tasks.md`, and `traceability.json` without rewriting or reordering existing content
- Cascades the new requirements all the way down the hierarchy in one run
- Resets the `specification` gate to `pending` (new requirements invalidate prior approval)
- Two approval gates (spec, then plan/tasks)

**When to use:**

- When a feature proposal needs changes before the feature is archived
- When a released feature must be changed — run `sdrive version:new <feature>`. That creates a new version under `ongoing/` and leaves the released version and its record untouched. A completed version is immutable; there is no amend or reopen path

**What it does NOT do:**

- Create brand-new features (use `/sdrive:propose`)
- Write or run tests (use `/sdrive:test`)

> **Note:** You do **not** need to run `/sdrive:sync` afterward — this command already cascades spec, plan, tasks, and traceability. `/sdrive:sync` is only for re-syncing after a manual hand-edit of a single file.

---

### `/sdrive:test`

Writes tests for every acceptance criterion, runs them, and reports coverage.

```text
/sdrive:test user-login
```

**What it does:**

- Reads spec, plan, tasks, and traceability from the current version
- Detects the project's test framework and its test file naming convention
- Writes one test per AC, organized by feature under the project's test folder using the framework's own convention (`<test-folder>/<feature>/<subfeature>.<test-suffix>.<ext>`)
- Test names include the AC ID
- Requires approval before writing
- Runs tests and updates `traceability.json` in the current version
- Generates a coverage report at `.sdrive/reports/tests/test-report-<feature>-<version>-<date>.md`
- Writes all artifacts (reports, logs, captured output) under `.sdrive/` — never to the project root
- Runs `sdrive verify <feature>` and the governance validator

**When to use:**

- After `/sdrive:apply`
- Before `/sdrive:review`
**Batch mode:**

```text
/sdrive:test --all
```

Tests every ongoing feature, one after the other, and writes an aggregate report to `.sdrive/reports/tests/test-report-all-<date>.md`.

**What it does NOT do:**

- Write production code
- Fix production code
- Merge

---
### `/sdrive:debug`

Reproduces, isolates, and fixes defects — layout breakage, API failures, runtime errors, and visual glitches. This is the chief debugger.

```text
/sdrive:debug "cards overlap on the services page"
```

**What it does:**

- Reproduces the defect and captures before evidence (measurements, status codes, stack traces, screenshots)
- Isolates it to the smallest unit that still exhibits it
- States the root cause in one sentence, distinguished from the symptom
- Requires approval before changing code
- Applies the smallest correct fix — no unrelated refactoring
- Re-runs the reproduction and captures after evidence with the same method
- Adds a regression test that would have caught the defect
- Writes a versioned report to `.sdrive/reports/debug/debug-report-<feature>-<version>-<date>.md`

**Defect classes:**

| Class | Examples | Detection |
|-------|----------|-----------|
| **LAYOUT** | Overlap, overflow, clipping, z-index collision, container escape, breakpoint breakage | Headless-browser bounding-box comparison |
| **API** | Failing endpoint, wrong status code, malformed payload, schema mismatch, auth failure, timeout | Issue the request, capture status/headers/body, compare to contract |
| **RUNTIME** | Uncaught exception, console error, hydration mismatch, unhandled rejection, state bug | Capture console output and stack trace |
| **GLITCH** | Flicker, shift on interaction, broken transition, misaligned icon, inconsistent spacing | Interaction trace plus before/after screenshots |

**When to use:**

- When something is visibly wrong — a broken layout, a failing endpoint, a console error, a visual glitch
- After `/sdrive:performance` hands off a correctness defect

**Batch mode:**

```text
/sdrive:debug --all
```

Sweeps every ongoing feature for defects, one after the other, and writes an aggregate report to `.sdrive/reports/debug/debug-report-all-<date>.md`.

**What it does NOT do:**

- Optimize for speed (use `/sdrive:performance`)
- Audit against acceptance criteria (use `/sdrive:review`)
- Write new features (use `/sdrive:apply`)

---

### `/sdrive:review`

Audits the implementation against the spec, traceability matrix, constitution, and the actual change. It does **not** merge or archive.

```text
/sdrive:review user-login
/sdrive:review --all
```

**What it does:**

- Runs `sdrive check`, `sdrive validate`, `sdrive verify`, and `sdrive audit:verify` and reads their structured output
- Requires `test-evidence.json` with a zero-exit run, no failures, at least one result, and a commit matching `HEAD`
- Binds the review to `HEAD`, the feature branch, and its recorded `base`; refuses a dirty tree or a branch mismatch
- Audits the diff against `base` and flags unplanned files, untracked files, missing planned files, and commits from another feature
- Checks coverage, test quality (`.only`, `xit`, skips, empty assertions, AC IDs), security, NFR evidence, docs, and CI
- Records human confirmation and reviewer independence
- Writes `review.md` in the spec version folder and `review.json` in the governance version folder with the same verdict

**Verdict files:**

```text
.sdrive/specs/<lifecycle>/<feature>/<version>/review.md      # human report
.sdrive/governance/<feature>/<version>/review.json           # machine-readable verdict
```

`review.json` is validated by `sdrive validate` and read by `sdrive approve <feature> review` when `governance.requireStructuredReview` is enabled.

**When to use:**

- After `/sdrive:test` has recorded passing evidence
- Before `/sdrive:archive`

**What it does NOT do:**

- Merge, move the feature to `completed/`, create a branch, or create a PR
- Write or fix tests (use `/sdrive:test`)

**Batch mode:**

```text
/sdrive:review --all
```

Reviews every ongoing feature one after the other and writes an aggregate report to `.sdrive/reports/reviews/review-report-all-<date>.md`. A feature that fails review is never cleared for archive.

---

### `/sdrive:archive`

Merges an approved feature to the confirmed target branch and completes its lifecycle.

```text
/sdrive:archive user-login
```

**What it does:**

- Requires a passing `review.md` for the current version (Review-First Rule)
- Requires human merge approval
- **Checks mergeability and resolves mechanical conflicts** by merging the target branch into the feature branch, then re-running `sdrive validate`, `sdrive verify`, and the test suite. Semantic, migration, security, or secret conflicts stop the archive with `git merge --abort`
- Merges the current version and marks it as `completed`
- Preserves other versions
- Moves the feature folder from `ongoing/` to `completed/`
- Updates governance and workflow state, then cleans up the branch
- Verifies permission before and after merge

**When to use:**

- Only after `/sdrive:review` has returned `Status: PASS`

**Batch mode:**

```text
/sdrive:archive --all
```

Archives every ongoing feature that has passed review, one after the other, and writes an aggregate report to `.sdrive/reports/reviews/archive-report-all-<date>.md`.

**What it does NOT do:**

- Audit code (use `/sdrive:review`)
- Write or fix production code
- Write or run tests
- Force-push, bypass branch protection, or guess a semantic conflict resolution

---
## Batch Mode (`--all`)

Eight commands accept a `--all` flag that runs them across **every ongoing feature** instead of a single one. Features are processed sequentially and an aggregate report is written at the end.

| Command | `--all` behaviour | Aggregate report |
|---------|-------------------|------------------|
| `/sdrive:apply --all` | Implements every ongoing feature, one branch each. Does **not** merge. | `.sdrive/reports/implementation-report-all-<date>.md` |
| `/sdrive:test --all` | Tests every ongoing feature. | `.sdrive/reports/tests/test-report-all-<date>.md` |
| `/sdrive:review --all` | Reviews every ongoing feature one after the other. Never clears a feature that fails review for archive. | `.sdrive/reports/reviews/review-report-all-<date>.md` |
| `/sdrive:archive --all` | Archives every ongoing feature that has passed review. | `.sdrive/reports/reviews/archive-report-all-<date>.md` |
| `/sdrive:secure --all` | Audits every ongoing feature. Approval gates still apply per feature. | `.sdrive/reports/security/security-audit-all-<date>.md` |
| `/sdrive:performance --all` | Optimises every ongoing feature. | `.sdrive/reports/performance/performance-report-all-<date>.md` |
| `/sdrive:debug --all` | Sweeps every ongoing feature for defects. | `.sdrive/reports/debug/debug-report-all-<date>.md` |
| `/sdrive:docs --all` | Documents every ongoing feature. | `.sdrive/docs/coverage-report-all-<date>.md` |

**Behaviour notes:**

- **Gates are evaluated per feature.** In `--all` mode the router does not gate-check a single feature; each feature's gates are checked individually by the agent as it is processed.
- **Failures do not stop the batch.** If one feature fails, the agent records the failure and continues with the next, then summarises everything in the aggregate report.
- **`/sdrive:apply --all` never merges.** Each feature gets its own branch and its own approval gate.
- **`/sdrive:archive --all` only archives features that passed review.** A feature without a passing `review.md` is skipped and reported.
- **Commands that do not support `--all`** (e.g. `/sdrive:propose`, `/sdrive:constitution`, `/sdrive:design`) reject the flag with a clear error.

---

## Feature Commands

Some commands accept a feature name or description.

### Examples

```text
/sdrive:propose "User login with email and password"
/sdrive:update-propose "user-login" add google auth
/sdrive:apply user-login
/sdrive:test user-login
/sdrive:review user-login
/sdrive:archive user-login
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

## Feature Lifecycle

SpecDrive has **two entry points** and **one iteration lifecycle** after them. Everything else is optional.

### Greenfield — a brand-new project

An empty folder, or a fresh scaffold with no plan in place yet.

```text
/sdrive:constitution
/sdrive:product-plan
```

`/sdrive:product-plan` is **optional**. Run it when you have an idea but no written plan, or an empty repo. If you already know what you are building, go straight from the constitution to `/sdrive:propose`.

### Brownfield — an existing codebase

The code already exists and development is well past the early stages.

```text
/sdrive:onboard
/sdrive:constitution
```

`/sdrive:onboard` inventories what is there and never overwrites or deletes anything.

### The iteration lifecycle (both paths)

Every feature follows the same five steps. Run any of them without a feature name and SpecDrive asks whether you mean **all ongoing features** or one from a detected list.

```text
/sdrive:propose "<feature>"    # spec, plan, tasks, traceability
/sdrive:apply "<feature>"      # implementation
/sdrive:test "<feature>"       # write and run the tests
/sdrive:review "<feature>"     # audit, then sign the review gate
/sdrive:archive "<feature>"    # merge to the integration branch, close the version
```

### Spec folders and who moves a feature between them

A feature moves through three spec folders. Each transition has exactly one owner:

| Transition | Owner | Notes |
|------------|-------|-------|
| → `specs/backlog/<feature>/<version>/` | `/sdrive:propose` | New specs are created in `backlog/` with `phase: backlog` |
| `backlog/` → `ongoing/` | `/sdrive:apply` | Happens at the start of implementation; sets `phase: ongoing` |
| `ongoing/` → `completed/` | `/sdrive:archive` | Happens after merge and archive; sets `phase: completed` |
`completed/` is immutable. There is no transition back to `ongoing/`; use `sdrive version:new` for new scope. `/sdrive:apply` MUST NOT begin implementation while the spec is still in `backlog/`. If the feature is in neither `backlog/` nor `ongoing/`, the agent stops and asks.

> **Note:** `governance/` is not lifecycle-partitioned. Governance files live at `.sdrive/governance/<feature>/<version>/` regardless of the spec's lifecycle folder.

---

## Gated Commands

Some commands require approval before they run.

| Command | Required Gates |
|---------|----------------|
| `/sdrive:propose` | specification, planning |
| `/sdrive:update-propose` | specification, planning |
| `/sdrive:apply` | implementation |
| `/sdrive:review` | review |
| `/sdrive:archive` | review |

If a gate is not approved, the command is blocked.

Approve a gate with:

```bash
sdrive approve <feature> <gate>
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
| reviewer | Approve, review, propose, product-plan, create versions |
| developer | Implement, test, run optimizations, verify |

### Permission File

```text
.sdrive/commands/permissions.json
```