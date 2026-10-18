# Changelog

Notable changes to `specdrive-cli`. Everything here is user-facing: what shipped,
what it changes for an existing project, and what to run after upgrading.

SpecDrive is pre-1.0, so a release that adds features ships as a patch bump.

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
