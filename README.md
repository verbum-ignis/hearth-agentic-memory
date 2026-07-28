# Hearth · A save point for an agent's life

Hearth is not another chat history. It is a save point for agent memory:
retrieval brings records to the fire; the agent chooses which records to open
before continuing its own story.

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
AWS supplies the deployed application and worker runtime; the Bedrock account
gate is not a dependency of semantic recall.
