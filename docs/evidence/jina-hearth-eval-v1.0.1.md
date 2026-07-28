# Jina HearthEval v1.0.1 evidence

Date: 2026-07-28  
Region: `us-east-2`  
Runtime: one-shot ECS/Fargate tasks  
Model: `jina-embeddings-v3` (`retrieval.passage` / `retrieval.query`, 1024 dimensions, normalized)  
Dataset commit: `c473d9c`  
Recall/eval runner commit: `63ef14e`

## Execution

- Task `475f05357fbe4ef5a7b649f9c7e8b53e` seeded all 75 fictional entries and drained
  the embedding queue: 59 `ready`, followed by `idle`; exit code 0.
- Task `42261a63f7a5450db0a5b058c90ee563` collected all 126 HearthEval v1.0.1
  queries; exit code 0.
- ANN retrieval forced `hearth_entries_scope_embedding_idx` with only `scope_id`
  in the SQL predicate, oversampled top 20, then applied lifecycle, sealed, rule,
  trigger, deep-band and `exclude_ids` filtering before threshold/top-k.
- The temporary private S3 source object was deleted after both tasks. Jina and
  CockroachDB credentials were injected from separate Secrets Manager entries and
  did not appear in source archives, task output or result files.

## Threshold selection

The global cosine-similarity threshold was calibrated only on the train split:

`0.31572555182454015`

The limiting train no-hit case was q059 (balcony tomatoes vs the mint project),
whose nearest score was `0.3157255508245401`. Validation and test did not modify
the threshold.

## Results

| Split | Hit@1 | Hit@3 | MRR | No-hit | Forbidden | P95 |
|---|---:|---:|---:|---:|---:|---:|
| Train | 0.833 | 0.889 | 0.856 | 1.000 | 0 | 624 ms |
| Val | 0.788 | 0.909 | 0.843 | 0.750 | 0 | 480 ms |
| Test | 0.871 | 0.903 | 0.887 | 1.000 | 0 | 492 ms |

Test groups:

| Group | Queries | Hit@1 | Hit@3 | MRR | No-hit | Forbidden | P95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| EN | 15 | 0.833 | 0.833 | 0.833 | 1.000 | 0 | 525 ms |
| ZH | 16 | 0.833 | 0.917 | 0.875 | 1.000 | 0 | 482 ms |
| Cross | 7 | 1.000 | 1.000 | 1.000 | n/a | 0 | 492 ms |

The formal test split passes Hit@3 ≥ 0.75, No-hit ≥ 0.90, forbidden hit = 0,
P95 < 800 ms, and the Cross Hit@3 ≥ 0.50 retention gate. The validation no-hit
miss is q051: the unrelated company holiday/karaoke query returned `demo_028` at
`0.340546`. It is retained as an honest distribution warning; the threshold was
not retuned on validation data.

## Pending v1.1 delta

HearthEval v1.1 will add two `deep_band_probe` leakage-only queries for
`demo_074`. The entry already has an embedding but is independently ineligible
only because its decay band is `deep`. Once the annotation commit lands, only the
new queries need collection; the existing 126 raw observations remain valid.
