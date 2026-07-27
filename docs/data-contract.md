# Demo data contract v1

The canonical machine-readable handoff is `data/demo-data.schema.json`; Markdown
remains the editorial source. Bodies must not be placed in a Markdown table
because escaped pipes and multiline prose make seed parsing ambiguous.

Two fields intentionally separate concepts that looked like one quota in the
world-building draft:

- `language`: the language actually stored in the entry (`en` or `zh`).
- `demo_group`: the 40 EN / 25 ZH / 10 cross-lingual allocation. A `cross`
  entry is still written in one language; its paired evaluation query uses the
  other language.
- `eval_groups`: all reports in which the entry/query pair participates.

`expected_band` and `expected_eligibility` are required and are checked at the
document-level `band_as_of` timestamp. Narrative event time is `occurred_at`;
decay uses `last_accessed`. This keeps the fictional March–July chronology
separate from the operational recall clock.

Sealed and rule entries are seeded with `embedding_status='not_required'` and a
NULL embedding. They never enter the worker claim predicate. Integration tests
verify both that state and the absence of provider-call rows.
