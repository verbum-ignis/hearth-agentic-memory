# Local CockroachDB vector prototype

## Pinned version

- Image: `cockroachdb/cockroach:v26.2.3`
- Database: `hearth`
- Vector dimensions: 1024
- Distance: cosine (`vector_cosine_ops`, `<=>`)
- Prefix: `scope_id`

The image is pinned to the latest v26.2 Regular patch available when the first
batch started. The migration explicitly enables
`feature.vector_index.enabled`, even though it defaults to enabled in this
release, so the required capability is visible and reproducible.

## Commands

```bash
docker compose up -d cockroach
npm run db:migrate
npm run db:smoke
```

`npm run db:smoke` creates deterministic fixture vectors in two scopes, runs a
two-scope `IN` query, records `EXPLAIN (OPT)` output, and asserts that the result
mentions the scope-prefix vector index.

## Evidence status

Not executed on the initial workstation: Docker was not installed. Do not treat
the expected plan below as measured evidence. After Docker is available, the
smoke script writes the actual version, query result and plan to
`docs/evidence/vector-index.actual.txt` (ignored until deliberately reviewed).
