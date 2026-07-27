# First-batch evidence status

Captured: 2026-07-27

## Verified on this workstation

- Node.js: `v24.18.0`
- npm install: 14 packages, 0 reported vulnerabilities
- `npm run validate:sample`: 5/5 fictional entries valid
- Cloud migration: passed against CockroachDB Cloud Basic v26.2.1 in AWS `us-east-2`
- Cloud test run: 14 passed, 0 failed, 0 skipped (`HEARTH_INTEGRATION=1`)
- Scope-prefix cosine vector index: present and enabled
- Vector nearest-neighbor query: exact fixture ranked first with distance `0`
- `EXPLAIN (OPT)`: `vector-search hearth_entries@hearth_entries_scope_embedding_idx`
- JavaScript syntax check: every repository `.js` file passed `node --check`
- `git diff --check`: passed before the initial commit
- Local repository commit: `b52aca3`

The four CockroachDB integration tests now pass:

1. two workers never claim the same row;
2. an expired processing lease is reclaimed;
3. stale provider output cannot overwrite changed content;
4. sealed seed rows have NULL embedding, `not_required`, and zero provider calls.

## External execution gate closed

Docker remains uninstalled and is no longer on the critical path. Migration,
scope-prefix vector `EXPLAIN`, and all four CRDB integration tests ran directly
against the managed Basic cluster. No connection string or credential is stored
in this evidence file.

The vector smoke test also exposed a planner constraint: a redundant
`embedding IS NOT NULL` filter prevented use of the vector index. The smoke
query now constrains the index prefix (`scope_id`) and relies on the schema
invariants that sealed and rule rows never receive embeddings. Eligibility
filtering for returned rows remains mandatory before any result is surfaced.

The fixed compose image remains available for later reviewer-path verification.
