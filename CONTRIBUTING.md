# Contributing to SpecDrive

Thanks for helping improve SpecDrive. This repository is the CLI package and the
reference implementation of the workflow it ships.

## Requirements

- Node.js 18 or newer (`.nvmrc` pins the version used by CI)
- Git
- No global install is required for development

## Setup

```bash
npm ci
npm test
npm run lint
```

`npm test` uses Node's built-in test runner. There is no build step: `src/index.js`
is the executable, and the package ships source directly.

## Repository layout

| Path | What it is |
|---|---|
| `src/` | CLI entry point |
| `commands/` | Gate rules, archive rules, router, permissions, adapter registry |
| `scripts/` | Installed project scripts (validation, verification, onboarding, hooks) |
| `migrations/` | Migration adapter registry and per-framework detect/plan/apply support |
| `schemas/` | JSON Schemas for config, specs, plans, tasks, traceability, workflow state, test evidence, review records |
| `agents/` | The 16 agent instruction files used by AI tools |
| `dashboard/` | Local read-only web dashboard |
| `mcp/` | MCP server |
| `templates/` | Starter templates |
| `test/` | Tests (Node's test runner) |
| `.sdrive/` | The reference installation used by this repository (dogfooding) |

The root directories are the **source of truth**. `.sdrive/` is an installed copy.
After changing anything under `agents/`, `commands/`, `dashboard/`, `mcp/`,
`migrations/`, `schemas/`, `scripts/`, or `templates/`, run:

```bash
npm run dogfood
```

That refreshes `.sdrive/` from the source directories so the CLI, the dashboard,
and the MCP server in this repository all run the code you just changed.

## Tests

- Tests must be hermetic. Create a temporary project with `test/helpers/sandbox.js`;
  never write to the repository's `.sdrive/`.
- Prefer `spawnSync(process.execPath, [CLI, ...args])` over a shell string.
- Add a test for every behaviour change in a gate, archive rule, or state writer.
- `npm test` sets `SDRIVE_SKIP_PERMISSIONS=1` for the test process because test
  fixtures are not governed projects. Never rely on that flag in production code.

## Coding rules

- Keep `src/index.js` a thin wiring layer. Put reusable logic in `src/lib/`.
- Use `src/lib/state.js` for every write to `workflow-state.json`, `team.json`,
  `config.json`, or `audit-log.json`. Do not call `fs.writeFileSync` on those files
  directly.
- Use `src/lib/execute.js` instead of `execSync("node ...")`. Shell strings break on
  paths with spaces and on quotes; argument arrays do not.
- Do not add a new command without a permission rule in `commands/permissions.json`.
  `npm run permissions:check` enforces this.
- Do not add a user-visible command without updating `docs/commands.md` and the
  README table. `npm run docs:check` enforces this.

## Release

Do not publish from a pull request. Releases are tag-driven and gated by npm
staging; see [docs/releasing.md](docs/releasing.md). A version bump and a
`CHANGELOG.md` entry are part of the release pull request, not a feature PR.
