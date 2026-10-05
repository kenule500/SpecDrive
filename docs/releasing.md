# Releasing SpecDrive

`specdrive-cli` is published to npm with **Trusted Publishing (OIDC)** from GitHub
Actions. There is no npm write token to create, store, rotate, or leak.

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

4. `.github/workflows/publish.yml` takes over. The run **pauses for your
   approval** in the `npm-publish` environment, then publishes. Approve it on the
   repository's **Actions** tab (open the run → *Review deployments* → approve).

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
| Environment name | `npm-publish` |

Enter **only the filename** — not `.github/workflows/publish.yml`. Every field is
case-sensitive and must match exactly, but npm does not validate them when you
save; a mismatch only shows up as `ENEEDAUTH` at publish time.

### The release approval gate

Approval happens in **GitHub**, not npm. The `publish` job declares
`environment: npm-publish`, so GitHub pauses the run and issues the OIDC token
only after a required reviewer approves it.

Set this up once in the repository:

1. GitHub → **Settings** → **Environments** → *New environment* → name it exactly
   `npm-publish`
2. Under **Deployment protection rules**, enable **Required reviewers** and add
   yourself
3. Save

If the environment does not exist, GitHub creates it automatically on the first
run — the release still succeeds, it simply will not pause. Add the reviewers to
actually turn the gate on.

The environment name is case-sensitive and must match in **both** places: the
`environment:` line in the workflow, and the *Environment name* field in npm's
form. Change one without the other and publishing fails with `ENEEDAUTH`.

### Choose "Allowed actions" now

A trusted publisher connection **cannot be edited after creation** — changing it
means deleting and re-creating it. `npm stage publish` is always permitted; the
choice is whether direct `npm publish` is also permitted.

Because the approval gate lives in GitHub, **select "Allow `npm publish`"**. The
human gate is already enforced before the job is allowed to run, so stage-only
would layer a second, permanent approval step on top of it.

Only choose stage-only if you *also* want the version to sit in npm's staging
queue for a separate 2FA approval after the GitHub gate passes. If you do, change
the final line of the workflow from `npm publish --access public` to
`npm stage publish`.

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
