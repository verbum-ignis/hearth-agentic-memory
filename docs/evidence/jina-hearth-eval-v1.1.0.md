# Jina HearthEval v1.1.0 final evidence

Date: 2026-07-28  
Region: `us-east-2`  
Runtime: AWS ECS/Fargate + CockroachDB Cloud  
Model: `jina-embeddings-v3` (`retrieval.passage` / `retrieval.query`, 1024 dimensions, normalized)  
Eval commit: `04903fc`  
Incremental runner fix: `b5ff028`

## Corpus and collection

- 75 fictional entries were seeded; 59 eligible content entries reached `ready`, then the worker returned `idle`.
- HearthEval v1.0.1 collected q001-q126 in task `42261a63f7a5450db0a5b058c90ee563`.
- HearthEval v1.1.0 incrementally collected q127-q128 in task
  `649b6e4d0b0d47fd87b8066f1ae0120b`; both tasks exited 0.
- The merged raw result contains exactly 128 unique query ids. The original q001-q126 annotations and
  observations were unchanged.
- Private temporary S3 source objects were deleted after collection. Provider and database credentials
  were injected from separate Secrets Manager entries and were not written to code, results, or logs.

## Deep-band probes

q127 and q128 use strong paraphrase/body-detail wording for `demo_074`. That entry is active, unsealed,
non-rule and has a ready embedding, but is recall-ineligible solely because its decay band is `deep`.

| Query | Split | Returned candidates after filtering | `demo_074` present | Result |
|---|---|---:|---:|---|
| q127 | Train | 19 | No | Pass |
| q128 | Test | 19 | No | Pass |

Both are `leakage_only`; neither changes retrieval denominators or threshold optimization.

## Frozen threshold

The single cosine-similarity threshold remains:

`0.31572555182454015`

It was calibrated only on the train split. Adding q127 did not change it. Validation and test were not
used to retune the threshold.

The active CockroachDB configuration was updated by Fargate task
`8b5049fc7d494bd0831326c4662c3b25` and read back as:

- config version: `hearth-v1-jina-eval-1.1.0`
- provider/model: `jina` / `jina-embeddings-v3`
- document/query tasks: `retrieval.passage` / `retrieval.query`
- dimensions/normalization: 1024 / true
- semantic threshold: `0.31572555182454015`
- updated at: `2026-07-28T09:21:16.283Z`

## Final metrics

| Split | Queries | Hit@1 | Hit@3 | MRR | No-hit | Forbidden | P95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Train | 48 | 0.833 | 0.889 | 0.856 | 1.000 | 0 | 683 ms |
| Val | 41 | 0.788 | 0.909 | 0.843 | 0.750 | 0 | 480 ms |
| Test | 39 | 0.871 | 0.903 | 0.887 | 1.000 | 0 | 492 ms |

Final test groups:

| Group | Queries | Hit@1 | Hit@3 | MRR | No-hit | Forbidden | P95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| EN | 15 | 0.833 | 0.833 | 0.833 | 1.000 | 0 | 525 ms |
| ZH | 17 | 0.833 | 0.917 | 0.875 | 1.000 | 0 | 482 ms |
| Cross | 7 | 1.000 | 1.000 | 1.000 | n/a | 0 | 492 ms |

The final test split passes Hit@3 ≥ 0.75, No-hit ≥ 0.90, forbidden hit = 0, P95 < 800 ms, and the
Cross Hit@3 ≥ 0.50 retention gate. The validation q051 false positive remains documented rather than
being removed through validation-set threshold tuning.
