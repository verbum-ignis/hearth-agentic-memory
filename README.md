# Hearth Hackathon

Hearth is a save point for agent memory: retrieval brings records to the fire;
the agent chooses which records to open before continuing the story.

This repository is the isolated hackathon implementation. It never reads or
writes the production Hearth SQLite database.

## Local first batch

Requirements: Node.js 22.13+ and Docker with Compose.

```bash
npm install
docker compose up -d cockroach
npm run db:migrate
npm run db:smoke
npm run validate:sample
npm run seed:sample
npm test
```

The default local URL is
`postgresql://root@localhost:26257/hearth?sslmode=disable`. Copy `.env.example`
to `.env` only when overriding defaults; never commit `.env`.

## Layout

```text
apps/worker/       asynchronous embedding worker
data/              versioned fictional demo-data contracts and samples
db/migrations/     CockroachDB schema
docs/              architecture and reproducibility evidence
packages/core/     shared normalization, decay and embedding contracts
packages/db/       CockroachDB connection and transaction helpers
scripts/           migration, seed, validation and vector smoke tools
test/              unit and CockroachDB integration tests
```

`EMBEDDING_PROVIDER=fixture` is deterministic and proves orchestration only;
it is not presented as semantic retrieval. The Bedrock implementation is added
after the Day 0 model-access gate.
