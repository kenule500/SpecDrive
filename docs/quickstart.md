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

The constitution defines your test framework, run command, and test folder.

---

## 4. Propose Your First Feature

```text
/sdrive:propose "User login with email and password"
```

Approve:

- Gate 1: Spec + traceability
- Gate 2: Plan + tasks

SpecDrive assigns the feature to `v1` automatically.

---

## 5. Implement

```text
/sdrive:apply
```

The agent asks:

- Which base branch to use
- Whether to create a new branch

The agent writes production code only.

After tasks are complete, it runs:

```bash
sdrive verify user-login
```

This checks that code matches the plan.

---

## 6. Write Tests

```text
/sdrive:test user-login
```

The Test Agent:

- Writes one test per acceptance criterion
- Requires approval before writing
- Runs the tests
- Updates traceability
- Generates a coverage report

---

## 7. Review and Merge

```text
/sdrive:review
```

Review runs verification and coverage checks before allowing merge.

Approve the final merge.

---

## Done

Your first feature is now spec-driven, traceable, tested, verified, and governed.

---

## Making Major Changes Later

If you need to change the feature in a structural way:

```bash
sdrive version:new user-login
```

This:

- Migrates the current files into `v1/`
- Creates a new `v2/` folder
- Preserves v1 history
- Sets `v2` as the current version

Then run `/sdrive:propose` again to fill in `v2`.

To compare versions:

```bash
sdrive diff:version user-login v1 v2
```

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

Verify code manually:

```bash
sdrive verify user-login
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

## What changed

| Addition | Reason |
|----------|--------|
| Step 4 note about automatic `v1` | Users understand versioning kicks in immediately |
| New "Making Major Changes Later" section | Shows `version:new` and `diff:version` |
| "Done" line notes version tracking | Reminds user versions are used under the hood |

---