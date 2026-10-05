# Releasing SpecDrive

`specdrive-cli` is published to npm with **Trusted Publishing (OIDC)** from GitHub
Actions. There is no npm write token to create, store, rotate, or leak, and no
release can go live without a maintainer approving it with 2FA.

## Release flow

1. Bump the version, without letting npm create the tag yet:

   ```bash
   npm version patch --no-git-tag-version
   ```

2. Commit it:

   ```bash
   git add -A
   git commit -m "chore: release vX.Y.Z"
   ```

3. Tag it and push both:

   ```bash
   git tag vX.Y.Z
   git push origin main
   git push origin vX.Y.Z
   ```

4. `.github/workflows/publish.yml` takes over and **stages** the version. It is not
   live yet.

5. Approve the staged version with 2FA to publish it:

   ```bash
   npm stage list specdrive-cli     # note the stage id
   npm stage approve <stage-id>     # prompts for your 2FA code
   ```

   Or approve it in the browser: npmjs.com → `specdrive-cli` → **Staged Packages**
   → **Approve**.

The workflow refuses to publish if the tag and the `package.json` version
disagree, and it prints the exact tarball contents first so you can see what is
about to ship.

## One-time setup

On npmjs.com → **Packages** → `specdrive-cli` → **Settings** → **Trusted
publishing** → *Add trusted publisher* → **GitHub Actions**:

| Field | Value |
| --- | --- |
| Organization or user | `kenule500` |
| Repository | `SpecDrive` |
| Workflow filename | `publish.yml` |
| Environment name | *(leave blank)* |

Enter **only the filename** — not `.github/workflows/publish.yml`. Every field is
case-sensitive and must match exactly, but npm does not validate them when you
save; a mismatch only shows up as `ENEEDAUTH` at publish time.

### The release gate

Approval happens in **npm's staging queue**, not in GitHub. The publish job runs
`npm stage publish`, which lands the version in a staging area instead of
publishing it. A maintainer then approves it with 2FA, and only then does it
become public. Nothing reaches the registry without that approval.

This is deliberate. A GitHub environment would be the more natural place for the
gate, but GitHub restricts them to **public repositories on the Free plan**:

> Users with GitHub Free plans can only configure environments for public
> repositories. … you will not be able to configure any environments.

This repository is private, so an `environment:` entry would auto-create an
environment with **no protection rules** and the gate would silently do nothing —
worse than no gate, because it looks like one. npm's stage-only mode gives the
same guarantee with no plan requirement.

See [Switching the gate to a GitHub environment later](#switching-the-gate-to-a-github-environment-later)
if that changes.

### Allowed actions: leave direct publishing OFF

A trusted publisher connection **cannot be edited after creation** — changing it
means deleting and re-creating it. `npm stage publish` is always permitted; the
choice is whether direct `npm publish` is also permitted.

**Do not enable "Allow `npm publish`".** That permission *is* the gate. Without
it the workflow can only stage, and every release waits for your 2FA approval.
With it, CI could publish unattended and the gate would mean nothing.

Set the **Environment name** field to **blank** as well — staging is the gate, so
there is no GitHub environment to name. (If the workflow ever declares an
`environment:`, the two must match exactly or publishing fails with
`ENEEDAUTH`.)

## Recommended hardening

Once trusted publishing is confirmed working, disable token-based publishing
entirely:

**Package Settings → Publishing access → "Require two-factor authentication and
disallow tokens" → Update Package Settings.**

This affects only traditional tokens; trusted publishers keep working. It removes
the bypass-2FA token class that npm is currently retiring (account changes
Aug 2026, direct publishing Jan 2027) and means no long-lived write credential
exists anywhere.

## Publishing by hand (fallback)

If you ever need to publish from a local machine, do it with an OTP so npm gets
the 2FA proof-of-presence up front:

```bash
npm publish --otp=<6-digit-code>
```

Without the OTP, a **bypass-2FA** token does not fail — it does something more
confusing: npm returns `PUT 202`, reports success, exits 0, and the version is not
actually on the registry yet. An immediate retry then fails with:

```text
E409 Cannot publish over previously staged version "X.Y.Z"
```

Give it a few minutes and it appears. `--otp` avoids the whole detour.

## Provenance

npm normally attaches a provenance attestation to OIDC publishes. It is skipped
for **private** source repositories, which is the case for
`kenule500/SpecDrive`, so releases will not show a provenance badge on npm.
Publishing itself is unaffected.

## Switching the gate to a GitHub environment later

If the repository moves to GitHub Pro, or becomes public, you can move the gate
from npm's staging queue into GitHub:

1. Create an environment named `npm-publish` with **Required reviewers** set to
   yourself
2. Add `environment: npm-publish` to the `publish` job in the workflow
3. Change the final step from `npm stage publish` back to
   `npm publish --access public`
4. Delete and re-create the trusted publisher connection — this time allowing
   direct `npm publish` and setting *Environment name* to `npm-publish`

Do **not** enable **Prevent self-review** while you are the only reviewer: it
would stop you approving your own releases and deadlock every publish.
