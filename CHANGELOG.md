# Changelog

Notable changes to `specdrive-cli`. Everything here is user-facing: what shipped,
what it changes for an existing project, and what to run after upgrading.

SpecDrive is pre-1.0, so a release that adds features ships as a patch bump.

---

## 0.1.40 — 2026-10-18

**Documentation and workflow release. No CLI code changes.**

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

### Documentation

0.1.39's tarball was built before this changelog and the README's tool section
existed, so the package page did not mention any of it. 0.1.40 carries:

- `CHANGELOG.md` in the published package
- a README front page that names the 30 adapters, native slash commands, and
  `sdrive adapters:add`
- an `sdrive adapters:verify` step in the upgrading instructions
- a "historical snapshot" note on `SpecDrive-Complete-System-Reference.md`, which
  still described 13 agents and 15 tools

If you only want the tool-support features, 0.1.39 already has them. 0.1.40 adds
the branch-workflow change and the documentation.

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
