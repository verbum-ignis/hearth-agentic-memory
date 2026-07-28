# Hearth · A save point for an agent's life

[![reproduction](https://github.com/verbum-ignis/hearth-agentic-memory/actions/workflows/reproduction.yml/badge.svg)](https://github.com/verbum-ignis/hearth-agentic-memory/actions/workflows/reproduction.yml)
[![secret scan](https://github.com/verbum-ignis/hearth-agentic-memory/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/verbum-ignis/hearth-agentic-memory/actions/workflows/secret-scan.yml)

Hearth is a save point for an agent's life: memories fade, resurface, and the
agent chooses which ones to open before continuing its own story.

## Hackathon project and prior concept

The private Hearth concept predates the competition. This public implementation
is a new, isolated application written during the CockroachDB × AWS Hackathon
submission period. It uses a fictional bilingual dataset and does not copy,
read, or write production Hearth data. The competition code, CockroachDB
schema, retrieval evaluation, web demo, and AWS runtime were built for this
submission.

## What is working

- CockroachDB distributed vector recall over English and Chinese memories;
- deterministic keys + semantic surfacing with lifecycle and privacy filters;
- decay, anchors, sealed records, supersession, and per-session state overlays;
- asynchronous embedding jobs with leases, retries, and stale-write protection;
- opaque server sessions, atomic quotas, query caching, and graceful degradation;
- HearthEval v1.1: 128 queries across 15 categories with a train-only threshold;
- a browser demo for surfacing, session saves, pending-to-ready state, and the
  memory constellation.

## CockroachDB tools used

Hearth meaningfully integrates two CockroachDB hackathon tools:

1. **Distributed Vector Indexing** powers scope-prefiltered cosine recall over
   1,024-dimensional bilingual memory embeddings. The retrieval path forces the
   vector index, then applies session overlays, lifecycle rules, decay, sealed
   isolation, and the calibrated similarity threshold before returning results.
2. **CockroachDB Cloud Managed MCP** is the read-only operational surface for a
   Hearth memory health check. An authorized Codex client verifies core schemas,
   embedding coverage and integrity, effective decay-band distribution, recent
   touch/session-overlay activity, and vector-index visibility without reading
   memory bodies or receiving write access. A redacted real-cluster run is in
   [`docs/evidence/crdb-managed-mcp.md`](docs/evidence/crdb-managed-mcp.md).

## Run locally

Requirements: Node.js 22.13+ and Docker with Compose.

```bash
npm install
docker compose up -d cockroach
npm run db:migrate
npm run db:smoke
npm run validate:sample
npm run seed:sample
npm test
npm run server
```

Open `http://localhost:3000`. The zero-key fixture path proves orchestration,
keys recall, save flow, and UI behavior; it is deliberately not described as
semantic retrieval. The evaluated cloud path uses Jina `jina-embeddings-v3`
with separate passage/query tasks and a frozen threshold.

The default local URL is
`postgresql://root@localhost:26257/hearth?sslmode=disable`. Copy `.env.example`
to `.env` only when overriding defaults; never commit `.env`.

## Layout

```text
apps/worker/       asynchronous embedding worker
apps/server/       API, secure sessions, recall and demo endpoints
data/              versioned fictional demo-data contracts and samples
db/migrations/     CockroachDB schema
docs/              architecture and reproducibility evidence
packages/core/     shared normalization, decay and embedding contracts
packages/db/       CockroachDB connection and transaction helpers
scripts/           migration, seed, validation and vector smoke tools
test/              unit and CockroachDB integration tests
web/               dependency-free English-first demo UI
```

`EMBEDDING_PROVIDER=fixture` is deterministic and proves orchestration only;
it is not presented as semantic retrieval. Jina is the frozen embedding path.
AWS Fargate has verified the Jina worker path; public application deployment is
in progress. The Bedrock account gate is not a dependency of semantic recall.
