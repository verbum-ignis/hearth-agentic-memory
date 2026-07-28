# CockroachDB Cloud Managed MCP evidence

## Run contract

- Captured at: `2026-07-28T15:20:24Z`
- Client: OpenAI Codex using CockroachDB Cloud Managed MCP
- Authorization: OAuth with mandatory read scope; write scope was not granted
- Target: the hackathon demo cluster (identifiers and credentials redacted)
- Data policy: metadata and aggregate queries only; no memory body was selected
- Mutations: none

The agent first inspected the repository's real eligibility and decay contracts,
then used only Managed MCP metadata, `SHOW`, and aggregate `SELECT` operations to
run the health check. No database connection string, SQL user credential, token,
private filesystem path, or complete memory content is recorded here.

## Health-check result

### Schema

The MCP client found one application database containing 12 `hearth_*` tables.
It verified the core schemas for `hearth_entries`, `hearth_touch_log`,
`hearth_session_entry_state`, and `hearth_demo_sessions`, including the
`VECTOR(1024)` field and lifecycle, privacy, embedding-state, touch, and overlay
columns required by the repository contracts.

### Embedding coverage and integrity

Eligibility was calculated from the implemented worker contract: unsealed,
active entries of type `event`, `project`, `letter`, or `stream`.

| Metric | Count |
|---|---:|
| Total memories | 76 |
| Embedding-eligible | 60 |
| Ready | 59 |
| Pending | 1 |
| Processing | 0 |
| Failed | 0 |
| Ready coverage | 98.33% |

The 76-row operational snapshot consists of the frozen 75-entry fictional
dataset (`demo_001` through `demo_075`) plus one session-scoped event created
through the browser demo. That live demo write is the single eligible row still
shown as `pending`; it is not part of HearthEval and does not change the public
seed dataset.

Integrity checks returned zero ready rows without a vector, zero non-ready rows
with a vector, and zero ineligible rows marked ready.

### Effective decay bands

The query used effective access state plus the repository's stream windows,
other-type windows, tier multipliers, anchor behavior, and archived semantics.

| Effective band | Count |
|---|---:|
| Active | 30 |
| Glimmer | 12 |
| Beacon | 8 |
| Half-sunk | 16 |
| Deep | 5 |
| Anchor | 5 |
| Nebula | 0 |

No session overlays existed at capture time, so effective and baseline bands
were identical for this snapshot.

### Touches, sessions, and vector index

- Touch log: 0 total and 0 during the last 24 hours, 7 days, and 30 days.
- Session overlays: 0 rows across 0 sessions and 0 entries.
- Demo sessions: 1 total and 1 unexpired.
- `hearth_entries_scope_embedding_idx` was present and visible over scoped
  cosine-vector columns.

The read-only Managed MCP surface exposed the index definition and visibility,
but not build/backfill progress or operational telemetry. This check also did
not perform writes, query-plan execution tests, or memory-content inspection.

## Assessment and demo use

The cluster had one pending session write, no failed embeddings, and no
embedding-integrity anomalies. The absence of touches and overlays records the
pre-interaction state rather than a database fault.

For the submission video, this evidence maps to a short real invocation: show
the read-only MCP health-check request, then the aggregate embedding coverage,
decay-band table, touch/overlay snapshot, and visible vector index. Credentials,
cluster identifiers, and memory contents remain off-screen.
