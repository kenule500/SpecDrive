# SpecDrive Tool Adapter Reference

SpecDrive works with multiple AI coding tools through adapters and MCP.

---

## How It Works

1. SpecDrive core lives in `.sdrive/`
2. Each tool gets the file(s) it actually reads
3. That file tells the tool how to use `/sdrive:*` commands
4. Tools that support MCP can also call SpecDrive directly

---

## One Tool Can Need More Than One File

A tool's definition in `.sdrive/commands/tools.json` is a list of paths, not a
single string:

```json
{
  "name": "gemini-cli",
  "label": "Gemini CLI",
  "mcpClient": "gemini-cli",
  "docs": "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/custom-commands.md",
  "adapterPaths": [
    { "path": "GEMINI.md", "format": "md", "kind": "rules" },
    { "path": ".gemini/commands/sdrive.toml", "format": "toml", "kind": "command" }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `path` | File the tool reads, relative to the project root |
| `format` | Content syntax: `md`, `mdc`, or `toml` |
| `extension` | Optional, when the extension differs from the format (`.rules`, `.goosehints`) |
| `kind` | `rules` (always-on instructions) or `command` (an invocable slash command) |
| `frontmatter` | Optional YAML frontmatter, required by some tools |
| `mcpClient` | Optional. Wires that client's MCP config. Omit when the tool has none |
| `docs` | Vendor page that documents this path |
| `verified` | `false` marks a best guess that has not been checked against vendor docs |

`format` describes the **content**, `extension` describes the **file name**. They
usually agree, but Zed reads Markdown from `.rules` and goose reads Markdown from
`.goosehints`, so they are modelled separately rather than forcing a fake format.

### Why this matters

The first version of the registry stored one `adapterPath` string per tool. Four
adapters pointed at files their tool never loads:

| Tool | Old path | Reality |
|------|----------|---------|
| Gemini CLI | `.gemini/commands/sdrive.md` | Custom commands must be `.toml`; a `.md` there is ignored |
| Cursor | `.cursor/rules/sdrive.md` | A plain `.md` in `.cursor/rules` is ignored; rules need `.mdc` + frontmatter |
| Qwen Code | `.qwen/rules/sdrive.md` | The context file is `QWEN.md` |
| VS Code | `.vscode/sdrive-commands.json` | No such convention; Copilot reads `.github/instructions/*.instructions.md` |

`sdrive adapters:verify` refuses that class of mistake: an extension that
disagrees with its format, `.mdc` without frontmatter, `.toml` outside a command
file, two tools disagreeing about one path, or a path escaping the project.

---

## Supported Tools

SpecDrive ships 30 definitions. Several share `AGENTS.md`, which is written once.

| Tool | File(s) |
|------|---------|
| Any `AGENTS.md` tool | `AGENTS.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| VS Code / Copilot | `.github/instructions/sdrive.instructions.md` |
| Cline | `.clinerules/sdrive.md` |
| Claude Code | `.claude/commands/sdrive.md` |
| Cursor | `.cursor/rules/sdrive.mdc` |
| Amazon Q Developer | `.amazonq/rules/sdrive.md` |
| Gemini CLI | `GEMINI.md`, `.gemini/commands/sdrive.toml` |
| Continue | `.continue/rules/sdrive.md` |
| Codex | `AGENTS.md` |
| Windsurf | `.windsurf/rules/sdrive.md` |
| Kilo Code | `.kilocode/rules/sdrive.md` |
| OpenCode | `AGENTS.md` |
| Qoder | `.qoder/rules/sdrive.md` (unverified) |
| Qwen Code | `QWEN.md` |
| Atlassian Rovo Dev | `AGENTS.md` (unverified) |
| Roo Code | `.roo/rules/sdrive.md` |
| Amp | `AGENTS.md` |
| Warp | `WARP.md` |
| Zed | `.rules` |
| Aider | `CONVENTIONS.md` |
| Kiro (AWS) | `.kiro/steering/sdrive.md` |
| JetBrains Junie | `.junie/guidelines.md` |
| Factory Droid | `AGENTS.md` |
| Trae | `.trae/rules/project_rules.md` (unverified) |
| OpenHands | `.openhands/microagents/sdrive.md` (unverified) |
| Google Antigravity | `AGENTS.md` (unverified) |
| Augment Code | `.augment/rules/sdrive.md` |
| goose | `.goosehints` |
| Crush | `CRUSH.md` |

Run `sdrive adapters:list` for the authoritative, installed list.

`AGENTS.md` is the cross-tool standard stewarded by the Agentic AI Foundation, so
a tool that adopts it is supported the day it ships — no SpecDrive release needed.

---

## Generate Adapters

Adapters are generated automatically when you run:

```bash
sdrive init
```

During initialization you select which tools you use. Only selected tools get
adapters. Non-interactive:

```bash
sdrive init --tools all
sdrive init --tools qwen-code,cursor
```

To regenerate later:

```bash
node .sdrive/scripts/generate-adapters.js --tools cursor,gemini-cli
```

---

## Add a Tool SpecDrive Does Not Ship

Any tool can be supported without waiting for a release:

```bash
sdrive adapters:add windsurf-next \
  --path .windsurf-next/rules/sdrive.md \
  --format md \
  --label "Windsurf Next" \
  --docs "https://example.com/docs/rules"
```

| Flag | Purpose |
|------|---------|
| `--path` | Required. File the tool reads |
| `--format` | `md` (default), `mdc`, `toml` |
| `--extension` | When the extension differs, e.g. `--extension .rules` |
| `--kind` | `rules` (default) or `command` |
| `--frontmatter` | JSON, e.g. `'{"alwaysApply":true}'` |
| `--mcp-client` | `claude-desktop`, `cursor`, `cline`, `roo`, `gemini-cli`, `vscode` |
| `--unverified` | Record that the path is a best guess, not checked against vendor docs |
| `--no-generate` | Register only; write the file later |

The entry is validated before it is saved, so a path your tool would ignore is
rejected instead of silently doing nothing.

You can also edit `.sdrive/commands/tools.json` by hand and run
`sdrive adapters:verify`.

---

## Verify

```bash
sdrive adapters:verify            # warnings for unverified paths, exit 0
sdrive adapters:verify --strict   # unverified paths fail
```

Run it in CI alongside `sdrive validate` so a registry entry cannot rot after a
vendor renames the file.

---

## MCP Server

For tools that support Model Context Protocol (MCP), SpecDrive also runs an MCP
server, so AI tools can call SpecDrive directly from chat.

```text
Show me all features
Is the governance valid?
Get the traceability for user-login
```

`mcpClient` in the registry decides which client config is written. Only clients
SpecDrive knows how to write are wired - a tool with no `mcpClient` gets a file
adapter and nothing else, because writing a config a tool never reads is worse
than writing none.

| Client | Config Path | Config Key |
|--------|-------------|------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` | `mcpServers` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` |
| Cursor | `.cursor/mcp.json` | `mcpServers` |
| Cline | `.cline/mcp.json` | `mcpServers` |
| Roo Code | `.roo/mcp.json` | `mcpServers` |
| Gemini CLI | `.gemini/settings.json` | `mcpServers` |
| GitHub Copilot (VS Code) | `.vscode/mcp.json` | `servers` (with `type: "stdio"`) |

> **Note:** VS Code uses `servers` with an explicit `type`, while the others use
> `mcpServers`. SpecDrive writes the correct shape per client.

---

## MCP Methods

| Method | Purpose |
|--------|---------|
| `specdrive.list_features` | List all features |
| `specdrive.get_feature` | Get details for a feature |
| `specdrive.get_spec` | Get `spec.json` for a feature |
| `specdrive.get_traceability` | Get traceability matrix |
| `specdrive.validate` | Run governance validator |
| `specdrive.status` | Get status summary |

---

## Safety Rule

SpecDrive never overwrites an existing adapter file. If the file is already
there, it is skipped and reported — edit it if you want it to differ.

The same applies to MCP configs: an existing `specdrive` entry is left alone.

---

## Upgrading

`sdrive update` refreshes framework files and merges new tools into your
existing `.sdrive/commands/tools.json`:

- entries you added or edited are preserved
- tools that shipped after your `init` are appended
- a registry still in the old single-`adapterPath` shape is repaired in place,
  which is how the Cursor / Gemini / Qwen / VS Code fixes reach an existing
  project

Stale adapter files from the old paths are not deleted, because SpecDrive cannot
tell them apart from files you wrote yourself.
