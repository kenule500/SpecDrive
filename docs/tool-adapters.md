# SpecDrive Tool Adapter Reference

SpecDrive works with multiple AI coding tools through adapters and MCP.

---

## How It Works

1. SpecDrive core lives in `.sdrive/`
2. Each tool gets a small adapter file
3. The adapter tells the tool how to use `/sdrive:*` commands
4. Tools that support MCP can also call SpecDrive directly

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

## MCP Server

For tools that support Model Context Protocol (MCP), SpecDrive also runs an MCP server.

This allows AI tools to call SpecDrive directly from chat.

Example:

```text
Show me all features
Is the governance valid?
Get the traceability for user-login
```

No slash commands needed.

---

## MCP Setup

`sdrive init` creates:

```text
.sdrive/mcp/server.js
.sdrive/mcp/mcp.json
.sdrive/mcp/vision-bridge.json
```

MCP clients are wired **automatically** based on the tools you select — there is
no separate prompt. Each client uses its own config schema:

| Client | Config Path | Config Key |
|--------|-------------|------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` | `mcpServers` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` |
| Cursor | `.cursor/mcp.json` | `mcpServers` |
| Cline | `.cline/mcp.json` | `mcpServers` |
| GitHub Copilot (VS Code) | `.vscode/mcp.json` | `servers` (with `type: "stdio"`) |

> **Note:** VS Code uses `servers` with an explicit `type`, while other clients
> use `mcpServers`. SpecDrive writes the correct shape per client.

---

## Vision Bridge (image reading for text-only models)

Text-only models (DeepSeek, etc.) cannot see images. SpecDrive wires
[`vision-bridge-mcp`](https://www.npmjs.com/package/vision-bridge-mcp) alongside
its own MCP server so **all 14 agents** can read screenshots, mockups, and
diagrams by delegating to a vision model.

It is added automatically on `sdrive init` for every MCP-capable tool, and can be
re-wired at any time:

```bash
sdrive vision                 # wire all MCP-capable tools
sdrive vision --tools cursor  # wire a specific tool
```

Tools exposed to agents:

| Tool | Purpose |
|------|---------|
| `describe_image` | Markdown description of an image |
| `extract_text` | OCR text out of a screenshot |
| `compare_images` | Diff a reference against a rendered result |
| `vision_status` | Confirm the bridge is configured |
| `vision_rules` | Return the agent usage rules |

**Configuration:** set `VISION_BRIDGE_API_KEY` in your shell (never commit it).
SpecDrive writes only a placeholder (`process.env.VISION_BRIDGE_API_KEY`) to the
MCP config. Defaults to an OpenAI-compatible endpoint (Aliyun DashScope) with
`qwen-vl-max`; override `VISION_BRIDGE_BASE_URL` / `VISION_BRIDGE_MODELS` for
another provider (e.g. local Ollama `llava`).

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

SpecDrive never overwrites existing MCP entries.

If SpecDrive is already in the config, it is skipped.

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