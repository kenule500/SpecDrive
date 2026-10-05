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

4. `.github/workflows/publish.yml` takes over and publishes that tag. Watch it on
   the repository's **Actions** tab.

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
| Environment name | (leave blank) |

Enter **only the filename** — not `.github/workflows/publish.yml`. Every field is
case-sensitive and must match exactly, but npm does not validate them when you
save; a mismatch only shows up as `ENEEDAUTH` at publish time.

### Choose "Allowed actions" now

A trusted publisher connection **cannot be edited after creation** — changing it
means deleting and re-creating it. `npm stage publish` is always permitted; the
choice is whether direct `npm publish` is also permitted.

| Choice | What happens on a release | When to pick it |
| --- | --- | --- |
| Allow `npm publish` | CI publishes directly and unattended. | Normal case. |
| Stage-only | CI submits the version to the staging queue and a maintainer must approve it with 2FA before it goes live. | Release becomes a hard human gate. |

If you choose stage-only, change the final line of the workflow from
`npm publish --access public` to `npm stage publish`.

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
