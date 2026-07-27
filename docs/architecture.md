# First-batch architecture

The hackathon branch is an independent system:

```text
seed/API -> CockroachDB hearth_entries -> worker lease -> embedding provider
                         |                    |
                         +-- session overlay  +-- content-hash guarded commit
```

The immutable `demo_public` scope stores baseline content and embeddings.
Visitor touches of baseline entries are written to `hearth_session_entry_state`.
Session-created entries remain in their own scope. No hackathon component points
at the production SQLite database.

The entries table deliberately separates content and embedding columns into
column families. Worker claims use a conditional atomic `UPDATE ... RETURNING`
instead of `SKIP LOCKED`: CockroachDB does not support `SKIP LOCKED` on tables
with multiple column families. Serialization failures are retried by the client.
