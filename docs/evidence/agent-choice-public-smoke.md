# Agent choice boundary · public smoke evidence

Captured against the public AWS deployment after commit `abbba74`.

## Open path

- Semantic status: `ready`
- Surfaced memory: `demo_001`
- Selected and delivered: `demo_001`
- Touched: `demo_001`
- First response: `replayed=false`
- Identical retry: `replayed=true`
- A body was delivered only after the server accepted the selected ID.

## Skip path

- Surfaced memories: `demo_022`, `demo_023`, `demo_058`
- Choice: `skip`
- Selected: `0`
- Delivered bodies: `0`
- Touched: `0`
- Every candidate can be reconstructed as skipped from the immutable candidate
  snapshot plus the empty selected-ID set.

## Boundary exercised

The smoke test used the opaque session cookie issued by the public service. The
server locked the run, checked the run's idempotency key and session owner,
verified that every selected ID belonged to the immutable candidate snapshot,
delivered only selected bodies, wrote session-only touch overlays, and completed
the choice ledger in one CockroachDB transaction.

No private Hearth data, credentials, authorization URLs, or memory bodies are
included in this evidence file.

## Session constellation transition

The post-deployment constellation smoke used `demo_002`, whose immutable
baseline was intentionally old enough to be `half_sunk`.

| State | Baseline band | Effective band | Touched in session | Stored scope |
|---|---|---|---|---|
| Before open | `half_sunk` | `half_sunk` | `false` | `demo` |
| After open | `half_sunk` | `active` | `true` | `demo` |

The selected body and touch both referenced `demo_002`. The effective star moved
closer only through the session overlay; the source entry remained in the
immutable demo scope.
