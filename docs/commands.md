---

```markdown
# SpecDrive Command Reference

SpecDrive has two types of commands:

- Terminal commands — run in your shell
- Slash commands — run in your AI tool

---

## Terminal Commands

| Command | Purpose |
|---------|---------|
| `sdrive init` | Initialize SpecDrive structure and adapters |
| `sdrive validate` | Validate all governance files |
| `sdrive status` | Show feature lifecycle state |
| `sdrive approve <gate>` | Approve a workflow gate |
| `sdrive create <feature>` | Create feature scaffold (internal) |
| `sdrive team:add <username> <role>` | Add a new team member |
| `sdrive team:remove <username>` | Remove a team member |
| `sdrive team:list` | List all team members |
| `sdrive team:update <username> <role>` | Update a member's role |
| `sdrive team:sync` | Sync team members from GitHub collaborators |
| `sdrive template:list` | List available templates |
| `sdrive template:set <name>` | Set default template |
| `sdrive hooks:install` | Install pre-commit validation hook |
| `sdrive migrate` | Migrate specs from OpenSpec or Spec-Kit |
| `sdrive diff <old> <new>` | Show differences between two spec files |
| `sdrive openapi:generate <feature>` | Generate OpenAPI spec from plan.json |
| `sdrive dashboard` | Start local web dashboard |

---

### `sdrive init`

Initializes SpecDrive in the current project.

```bash
sdrive init
```

Creates:

- `.sdrive/` structure
- `workflow-state.json`
- `constitution.md`
- Tool adapters
- MCP server and config

---

### `sdrive validate`

Runs the governance validator.

```bash
sdrive validate
```

Checks all JSON files against schemas.

---

### `sdrive status`

Shows all features and their lifecycle state.

```bash
sdrive status
```

---

### `sdrive approve <gate>`

Approves a workflow gate.

```bash
sdrive approve specification
```

Allowed gates:

- `specification`
- `planning`
- `implementation`
- `review`

---

### `sdrive team:add <username> <role>`

Adds a new team member.

```bash
sdrive team:add alice admin
```

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

### `sdrive hooks:install`

Installs a pre-commit hook that runs governance validation.

```bash
sdrive hooks:install
```

---

### `sdrive migrate`

Migrates existing specs from OpenSpec or Spec-Kit.

```bash
sdrive migrate
```

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

Output saved to `.sdrive/governance/<feature>/openapi.json`.

---

### `sdrive dashboard`

Starts a local web dashboard on port `4747`.

```bash
sdrive dashboard
```

Open `http://localhost:4747` to view:

- Features and branches
- Gates and approvals
- Traceability coverage
- Team members
- Recent activity

---

## Slash Commands

| Command | Agent | Purpose |
|---------|-------|---------|
| `/sdrive:constitution` | Constitution | Create/update constitution |
| `/sdrive:propose` | Specification | Create spec, plan, tasks |
| `/sdrive:design` | UI/UX | Build prototype |
| `/sdrive:sync` | Cascade | Sync downstream files |
| `/sdrive:skills` | Discover-skills | Manage AI skills |
| `/sdrive:docs` | Documentation | Generate docs |
| `/sdrive:apply` | Implementation | Write production code |
| `/sdrive:performance` | Performance | Benchmark and optimize |
| `/sdrive:review` | Review & Complete | Final audit and merge |
| `/sdrive:secure` | Security | Security audit |

---

## Feature Commands

Some commands accept a feature name or description.

### Examples

```text
/sdrive:propose "User login with email and password"
/sdrive:apply user-login
/sdrive:review user-login
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

## Gated Commands

Some commands require approval before they run.

| Command | Required Gates |
|---------|----------------|
| `/sdrive:propose` | specification, planning |
| `/sdrive:apply` | implementation |
| `/sdrive:review` | review |

If a gate is not approved, the command is blocked.

Approve a gate with:

```bash
sdrive approve <gate>
```
```

---

This is the full updated command reference with all commands.