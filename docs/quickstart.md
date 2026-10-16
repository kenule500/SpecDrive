# SpecDrive Quickstart

This guide gets you from zero to your first governed feature in minutes.

---

## 1. Install SpecDrive

Install globally so the `sdrive` command is available everywhere.

```bash
npm install -g specdrive-cli@latest
```

Other package managers:

```bash
pnpm add -g specdrive-cli@latest
yarn global add specdrive-cli@latest
bun add -g specdrive-cli@latest
```

Or run it without installing (Deno):

```bash
deno run -A npm:specdrive-cli@latest --version
```

---

## 2. Initialize Your Project

Inside your project root:

```bash
sdrive init
```

SpecDrive will ask you to:

1. Select which AI tools you use

MCP wiring is applied automatically for the tools you pick — no second prompt.

It then creates:

- `.sdrive/` folder structure
- Tool adapters for selected tools
- MCP server and config
- Default config

For non-interactive setup (CI, scripts, agents), pass `--tools`:

```bash
sdrive init --tools github-copilot
sdrive init --tools all
sdrive init --tools none
```

### Updating Later

After upgrading the CLI, refresh your project's framework files:

```bash
sdrive update
```

This updates the dashboard, MCP server, scripts, and schemas while leaving your
specs, governance, and constitution untouched.

---

## 3. Create Your Constitution

In your AI tool:

```text
/sdrive:constitution
```

Approve the generated context files and constitution.

The constitution defines your test framework, run command, and test folder.

---

## Optional: Create a Product Plan

If you have an app idea but do not yet have a product overview or roadmap, run:

```text
/sdrive:product-plan
```

It can help prepare a conceptual app mockup, milestones, and an approved feature backlog. It does not create a working prototype. If you already have a plan, skip this and continue to `/sdrive:propose`.

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

- Which base branch to use — the feature always gets its OWN `feature/<feature>` branch (one branch per feature)
- Whether to create a new branch

The agent writes production code only.

It also moves the feature from `specs/backlog/` to `specs/ongoing/` and sets the version's `phase` to `ongoing` — this is the moment work begins.

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
- Organizes test files by feature under your project's test folder, using your framework's own naming convention
- Requires approval before writing
- Runs the tests
- Updates traceability
- Generates a coverage report

---

## 7. Review and Archive

```text
/sdrive:review
```

Review runs verification and coverage checks and writes a pass/fail verdict. It does **not** merge.

If the audit fails, the feature stays in `ongoing/` and review reports the findings.

Once review returns `Status: PASS`, archive the feature:

```text
/sdrive:archive
```

Archive merges the approved feature to the confirmed target branch — the default branch is detected and confirmed with you, never assumed — and completes its lifecycle. The feature folder moves from `specs/ongoing/` to `specs/completed/` and the version's `phase` becomes `completed`.

---

## Done

Your first feature is now spec-driven, traceable, tested, verified, and governed.

---

## Onboarding an Existing Project

If your project already has code but no SpecDrive governance, run this instead of step 2:

```text
/sdrive:onboard
```

That is the only command you need.

The Onboarding Agent will:

1. Scan your project automatically
2. Detect OpenSpec or Spec-Kit folders
3. Show an inventory for your approval
4. Ask what to fill vs. defer
5. Optionally generate a baseline constitution
6. Optionally generate retroactive specs for existing features
7. Optionally migrate OpenSpec or Spec-Kit specs

If you prefer to scan from the terminal before opening your AI tool:

```bash
sdrive onboard
```

But this is optional. The agent will run the scan itself if needed.

---

## Making Major Changes Later

If you need to change a feature in a structural way:

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

Performance or SEO issues?

```text
/sdrive:performance
```

Something visibly broken — a layout defect, a failing endpoint, a console error?

```text
/sdrive:debug "cards overlap on the services page"
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

`sdrive init` already starts it for you at the end, if you ran it in a terminal —
press `Ctrl+C` when you are done. Use `--no-dashboard` to skip that.

---

## Commands Reference

See [commands.md](commands.md) for all commands.
```