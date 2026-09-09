# SpecDrive Tool Adapter Reference

SpecDrive works with multiple AI coding tools through adapters.

---

## How It Works

1. SpecDrive core lives in `.sdrive/`
2. Each tool gets a small adapter file
3. The adapter tells the tool how to use `/sdrive:*` commands

---

## Supported Tools

SpecDrive supports 15 AI tools.

| Tool | Adapter File |
|------|--------------|
| GitHub Copilot | `.github/copilot-instructions.md` |
| Cline | `.clinerules/sdrive.md` |
| Claude Code | `.claude/commands/sdrive.md` |
| Cursor | `.cursor/rules/sdrive.md` |
| VS Code | `.vscode/sdrive-commands.json` |
| Amazon Q Developer | `.amazonq/rules/sdrive.md` |
| Gemini CLI | `.gemini/commands/sdrive.md` |
| Continue | `.continue/rules/sdrive.md` |
| Codex | `.codex/rules/sdrive.md` |
| Windsurf | `.windsurf/rules/sdrive.md` |
| Kilo Code | `.kilocode/rules/sdrive.md` |
| OpenCode | `.opencode/rules/sdrive.md` |
| Qoder | `.qoder/rules/sdrive.md` |
| Qwen Code | `.qwen/rules/sdrive.md` |
| Rovo Dev CLI | `.rovo/rules/sdrive.md` |

---

## What Each Adapter Does

Every adapter tells the AI tool:

1. Read `.sdrive/commands/manifest.json`
2. Find the matching command
3. Read the agent file listed in `agentFile`
4. Follow that agent's instructions
5. Run validators after writing files
6. Stop at human approval gates

---

## Generate Adapters

Adapters are generated automatically when you run:

```bash
sdrive init
```

During initialization, you select which tools you use.

Only selected tools get adapters.

---

## Safety Rule

SpecDrive never overwrites existing files in `.github/`.

If a file exists, the generator skips it.

---

## Add a New Tool

1. Open `.sdrive/commands/tools.json`
2. Add a new entry:

```json
{
  "name": "new-tool",
  "adapterPath": ".newtool/sdrive.md"
}
```

3. Run `sdrive init` again

Done. No core changes needed.

---

## Tool Registry

File:

```text
.sdrive/commands/tools.json
```

Example:

```json
{
  "version": "1.0.0",
  "tools": [
    {
      "name": "github-copilot",
      "adapterPath": ".github/copilot-instructions.md"
    },
    {
      "name": "cline",
      "adapterPath": ".clinerules/sdrive.md"
    },
    {
      "name": "claude-code",
      "adapterPath": ".claude/commands/sdrive.md"
    },
    {
      "name": "cursor",
      "adapterPath": ".cursor/rules/sdrive.md"
    },
    {
      "name": "vscode-native",
      "adapterPath": ".vscode/sdrive-commands.json"
    }
  ]
}
```

---

## Custom Adapter Content

Adapter files are simple Markdown.

They do not contain agent logic.

They only point to the SpecDrive core.