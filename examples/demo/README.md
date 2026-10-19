# Demo governance artifacts

These files are illustrative examples, kept out of the repository root because
the CLI reads only `.sdrive/`. They show the shape of a feature state, a team
roster, an audit log, and a constitution without pretending to be live project
state.

| File | Shows |
|---|---|
| `workflow-state.json` | A feature (`user-login`) mid-implementation, with gate history |
| `team.json` | An `admin` / `developer` / `reviewer` roster |
| `audit-log.json` | An empty audit log; live logs gain `prevHash`/`hash` |
| `constitution.md` | The kind of document `/sdrive:constitution` writes |
| `governance/` | Placeholder for the per-feature governance folder |

To try the CLI against them, copy the relevant files into a temporary project's
`.sdrive/` directory. Do not copy them over a real project's state.
