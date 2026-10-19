# Security Policy

## Reporting a vulnerability

Please report security issues privately to the maintainers rather than opening a
public issue. Use GitHub's **Report a vulnerability** advisory flow on
`kenule500/SpecDrive`, or email the address listed on the repository owner's
profile.

Include:

- the version (`sdrive --version`),
- the command or endpoint involved,
- a minimal reproduction,
- the impact you believe it has.

You should receive an acknowledgement within a few days. Please give us a
reasonable window to ship a fix before public disclosure.

## Scope

SpecDrive runs locally and writes to files inside the project. The main security
surfaces are:

- the local dashboard HTTP server (read-only by design),
- the MCP server's stdio protocol,
- shell execution of project scripts and configured test commands,
- the permission and audit records under `.sdrive/`.

## Default posture

- The dashboard binds to `127.0.0.1` unless `SDRIVE_HOST` is set explicitly.
  Setting `SDRIVE_HOST` to a non-loopback address prints a warning: there is no
  authentication, so expose it only on a trusted network.
- The file viewer refuses secret-shaped paths and paths outside the project.
- CLI commands that mutate state are permission-checked against
  `.sdrive/team.json`; a project with no team roster allows only the bootstrap
  commands (`team:add`, `adapters:add`).
- `SDRIVE_SKIP_PERMISSIONS=1` exists for test harnesses. Do not set it in a shared
  environment; it is reported on stderr when used.

## Supported versions

Only the latest published minor version is supported. Pre-1.0 releases may change
behaviour in a patch release; see `CHANGELOG.md`.
