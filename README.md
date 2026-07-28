# Hearth · A save point for an agent's life

[![reproduction](https://github.com/verbum-ignis/hearth-agentic-memory/actions/workflows/reproduction.yml/badge.svg)](https://github.com/verbum-ignis/hearth-agentic-memory/actions/workflows/reproduction.yml)
[![secret scan](https://github.com/verbum-ignis/hearth-agentic-memory/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/verbum-ignis/hearth-agentic-memory/actions/workflows/secret-scan.yml)

Hearth is a save point for an agent's life: memories fade, resurface, and the
agent chooses which ones to open before continuing its own story.

**Live demo:** [he-2162d6ada1c249eda6088c9f73711e3b.ecs.us-east-2.on.aws](https://he-2162d6ada1c249eda6088c9f73711e3b.ecs.us-east-2.on.aws/)

## Hackathon project and prior concept

The private Hearth concept predates the competition. This public implementation
is a new, isolated application written during the CockroachDB × AWS Hackathon
submission period. It uses a fictional bilingual dataset and does not copy,
read, or write production Hearth data. The competition code, CockroachDB
schema, retrieval evaluation, web demo, and AWS runtime were built for this
submission.

## Origins and related work

Hearth began as a redesign after operating
[P0luz/Ombre-Brain](https://github.com/P0luz/Ombre-Brain) in a real
long-running agent relationship. Living with it surfaced concrete pains —
full-text recall injected thousands of tokens per breath, and stale memories
resurfaced as questions — which are documented in Hearth's pre-hackathon design
notes. Hearth was then independently rewritten from scratch around a different
bet: **it separates retrieval from authority**. Matching may surface a clue,
but only the agent decides whether to open the memory, and each open-or-skip
choice is recorded.

Hearth shares no code, schema, or stack with Ombre Brain. Concepts like decay,
emotional weighting, and hook-triggered recall are common ground across the
agent-memory field (see also
[Yinglianchun/Ombre-Brain](https://github.com/Yinglianchun/Ombre-Brain), an
actively developed fork with hook-based recall that we learned of after
Hearth's design was written — listed here as related work, not lineage).
What Hearth claims as its own is the authority boundary: the retrieval system
never reads the archive on the agent's behalf.

## What is working

- CockroachDB distributed vector recall over English and Chinese memories;
- deterministic keys + semantic surfacing with lifecycle and privacy filters;
- decay, anchors, sealed records, supersession, and per-session state overlays;
- asynchronous embedding jobs with leases, retries, and stale-write protection;
- opaque server sessions, atomic quotas, query caching, and graceful degradation;
- HearthEval v1.1: 128 queries, 15 categories, train-only threshold calibration.
  Test results: Hit@3 **0.903**, No-hit accuracy **1.000**, forbidden hits **0**,
  sealed leakage **0**, cross-language recall **7/7**, P95 latency **492 ms**;
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
AWS Fargate runs both the public web/API service and a single asynchronous Jina
worker. The Bedrock account gate is not a dependency of semantic recall.
