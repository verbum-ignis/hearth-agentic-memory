# First-batch evidence status

Captured: 2026-07-27

## Verified on this workstation

- Node.js: `v24.18.0`
- npm install: 14 packages, 0 reported vulnerabilities
- `npm run validate:sample`: 5/5 fictional entries valid
- `npm test`: 9 passed, 0 failed, 4 CRDB integration tests explicitly skipped
- JavaScript syntax check: every repository `.js` file passed `node --check`
- `git diff --check`: passed before the initial commit
- Local repository commit: `b52aca3`

The four skipped tests are not counted as passes:

1. two workers never claim the same row;
2. an expired processing lease is reclaimed;
3. stale provider output cannot overwrite changed content;
4. sealed seed rows have NULL embedding, `not_required`, and zero provider calls.

## External execution gate still open

Docker is not installed on this workstation, so `docker compose`, migration,
scope-prefix vector `EXPLAIN`, and the four CRDB integration tests have not run.

An official CockroachDB v26.2.3 Windows package was attempted as a non-Docker
fallback. The CockroachDB binary host repeatedly terminated the transfer; a
resumed file failed ZIP integrity and was quarantined under ignored `.tools/`.
No database evidence has been fabricated.

Close this gate by either:

- installing Docker Desktop, then running the commands in `docs/crdb-local.md`;
  or
- providing the CockroachDB Cloud demo connection through a local secret after
  Tang completes the Day 0 account checklist.

The fixed compose image and migration remain ready for that run.
