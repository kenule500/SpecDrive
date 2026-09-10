---

Here is the final `quickstart.md` with MCP, dashboard, and all commands referenced.

Save as:

```text
.sdrive/docs/quickstart.md
```

---

```markdown
# SpecDrive Quickstart

This guide gets you from zero to your first governed feature in minutes.

---

## 1. Install SpecDrive

```bash
npm install -g specdrive-cli@latest
```

---

## 2. Initialize Your Project

Inside your project root:

```bash
sdrive init
```

SpecDrive will ask you to:

1. Select which AI tools you use
2. Select a default template
3. Wire MCP clients (optional)

It then creates:

- `.sdrive/` folder structure
- Tool adapters for selected tools
- MCP server
- Default config

---

## 3. Create Your Constitution

In your AI tool:

```text
/sdrive:constitution
```

Approve the generated context files and constitution.

---

## 4. Propose Your First Feature

```text
/sdrive:propose "User login with email and password"
```

Approve:

- Gate 1: Spec + traceability
- Gate 2: Plan + tasks

---

## 5. Implement

```text
/sdrive:apply
```

The agent asks:

- Which base branch to use
- Whether to create a new branch

Approve and let it work.

---

## 6. Review and Merge

```text
/sdrive:review
```

Approve the final merge.

---

## Done

Your first feature is now spec-driven, traceable, and governed.

---

## Optional

Need a prototype first?

```text
/sdrive:design
```

Concerned about security?

```text
/sdrive:secure
```

Performance issues?

```text
/sdrive:performance
```

Docs outdated?

```text
/sdrive:docs
```

Generate OpenAPI:

```bash
sdrive openapi:generate user-login
```

View dashboard:

```bash
sdrive dashboard
```

---

## Commands Reference

See [commands.md](commands.md) for all commands.
```

---

This is the final `quickstart.md`.