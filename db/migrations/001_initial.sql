CREATE TABLE IF NOT EXISTS hearth_entries (
  id STRING PRIMARY KEY,
  scope_id STRING NOT NULL,
  language STRING NOT NULL CHECK (language IN ('en', 'zh')),
  type STRING NOT NULL CHECK (type IN ('rule', 'letter', 'event', 'project', 'stream')),
  keys JSONB NOT NULL DEFAULT '[]',
  hook STRING NOT NULL,
  body STRING NOT NULL,
  trigger_date DATE,
  trigger_done BOOL NOT NULL DEFAULT false,
  sealed BOOL NOT NULL DEFAULT false,
  anchor INT NOT NULL DEFAULT 0 CHECK (anchor BETWEEN 0 AND 3),
  tier_since TIMESTAMPTZ,
  last_accessed TIMESTAMPTZ NOT NULL,
  status STRING NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'retired', 'archived')),
  supersedes STRING REFERENCES hearth_entries (id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  content_hash STRING NOT NULL,
  embedding VECTOR(1024),
  embedding_model STRING,
  embedding_spec_version STRING,
  embedding_status STRING NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed', 'not_required')),
  embedding_updated_at TIMESTAMPTZ,
  embedding_error STRING,
  embedding_attempts INT NOT NULL DEFAULT 0 CHECK (embedding_attempts >= 0),
  embedding_claimed_at TIMESTAMPTZ,
  embedding_claim_token STRING,
  embedding_next_retry_at TIMESTAMPTZ,
  CONSTRAINT sealed_embedding_state CHECK (
    NOT sealed OR (embedding IS NULL AND embedding_status = 'not_required')
  ),
  CONSTRAINT rule_embedding_state CHECK (
    type != 'rule' OR (embedding IS NULL AND embedding_status = 'not_required')
  ),
  FAMILY core (
    id, scope_id, language, type, keys, hook, trigger_date, trigger_done,
    sealed, anchor, tier_since, last_accessed, status, supersedes,
    created_at, updated_at, expires_at, content_hash
  ),
  FAMILY content (body),
  FAMILY embedding_state (
    embedding, embedding_model, embedding_spec_version, embedding_status,
    embedding_updated_at, embedding_error, embedding_attempts,
    embedding_claimed_at, embedding_claim_token, embedding_next_retry_at
  )
);

CREATE INDEX IF NOT EXISTS hearth_entries_scope_status_idx
  ON hearth_entries (scope_id, status, sealed, type);

CREATE INDEX IF NOT EXISTS hearth_entries_embedding_queue_idx
  ON hearth_entries (embedding_status, embedding_next_retry_at, embedding_claimed_at)
  STORING (scope_id, sealed, type, content_hash);

CREATE VECTOR INDEX IF NOT EXISTS hearth_entries_scope_embedding_idx
  ON hearth_entries (scope_id, embedding vector_cosine_ops)
  WITH (min_partition_size = 1, max_partition_size = 64);

CREATE TABLE IF NOT EXISTS hearth_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id STRING NOT NULL,
  target_type STRING NOT NULL CHECK (target_type IN ('entry', 'meta', 'config')),
  target_id STRING NOT NULL,
  op STRING NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
  INDEX hearth_history_scope_target_idx (scope_id, target_type, target_id, created_at DESC)
);

CREATE TABLE IF NOT EXISTS hearth_demo_sessions (
  session_id_hash STRING PRIMARY KEY,
  scope_id STRING UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  write_count INT NOT NULL DEFAULT 0 CHECK (write_count >= 0),
  surface_count INT NOT NULL DEFAULT 0 CHECK (surface_count >= 0),
  embedding_count INT NOT NULL DEFAULT 0 CHECK (embedding_count >= 0),
  llm_count INT NOT NULL DEFAULT 0 CHECK (llm_count >= 0),
  INDEX hearth_demo_sessions_expiry_idx (expires_at)
);

CREATE TABLE IF NOT EXISTS hearth_agent_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id_hash STRING NOT NULL REFERENCES hearth_demo_sessions (session_id_hash) ON DELETE CASCADE,
  query_hash STRING NOT NULL,
  candidate_snapshot JSONB NOT NULL,
  status STRING NOT NULL DEFAULT 'surfaced'
    CHECK (status IN ('surfaced', 'selecting', 'completed', 'failed')),
  selected_ids JSONB NOT NULL DEFAULT '[]',
  choice STRING CHECK (choice IN ('open', 'skip')),
  choice_reason STRING,
  response STRING,
  failure_code STRING,
  idempotency_key STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (session_id_hash, idempotency_key),
  INDEX hearth_agent_runs_expiry_idx (expires_at),
  INDEX hearth_agent_runs_session_idx (session_id_hash, created_at DESC)
);

CREATE TABLE IF NOT EXISTS hearth_touch_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id STRING NOT NULL REFERENCES hearth_entries (id) ON DELETE CASCADE,
  session_id_hash STRING REFERENCES hearth_demo_sessions (session_id_hash) ON DELETE CASCADE,
  scope_id STRING NOT NULL,
  touched_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
  source STRING NOT NULL DEFAULT 'agent' CHECK (source IN ('agent', 'explicit', 'system')),
  run_id UUID REFERENCES hearth_agent_runs (run_id) ON DELETE SET NULL,
  INDEX hearth_touch_log_entry_idx (entry_id, touched_at DESC),
  INDEX hearth_touch_log_scope_idx (scope_id, touched_at DESC)
);

CREATE TABLE IF NOT EXISTS hearth_session_entry_state (
  session_id_hash STRING NOT NULL REFERENCES hearth_demo_sessions (session_id_hash) ON DELETE CASCADE,
  entry_id STRING NOT NULL REFERENCES hearth_entries (id) ON DELETE CASCADE,
  effective_last_accessed TIMESTAMPTZ NOT NULL,
  effective_anchor INT NOT NULL CHECK (effective_anchor BETWEEN 0 AND 3),
  effective_tier_since TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (session_id_hash, entry_id)
);

CREATE TABLE IF NOT EXISTS hearth_global_daily_usage (
  usage_date DATE NOT NULL,
  capability STRING NOT NULL
    CHECK (capability IN ('embedding', 'selector', 'response', 'session_create')),
  used INT NOT NULL DEFAULT 0 CHECK (used >= 0),
  daily_limit INT NOT NULL CHECK (daily_limit >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (usage_date, capability),
  CONSTRAINT usage_within_limit CHECK (used <= daily_limit)
);

CREATE TABLE IF NOT EXISTS hearth_recall_config (
  config_key STRING PRIMARY KEY,
  config_version STRING NOT NULL,
  embedding_provider STRING NOT NULL,
  embedding_model STRING NOT NULL,
  embedding_dimensions INT NOT NULL CHECK (embedding_dimensions > 0),
  embedding_normalize BOOL NOT NULL,
  document_input_type STRING,
  query_input_type STRING,
  semantic_threshold DECIMAL NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp()
);

CREATE TABLE IF NOT EXISTS hearth_provider_calls (
  call_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability STRING NOT NULL CHECK (capability IN ('embedding', 'selector', 'response')),
  entry_id STRING REFERENCES hearth_entries (id) ON DELETE SET NULL,
  session_id_hash STRING REFERENCES hearth_demo_sessions (session_id_hash) ON DELETE SET NULL,
  provider STRING NOT NULL,
  model STRING NOT NULL,
  request_hash STRING NOT NULL,
  status STRING NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'timeout', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
  INDEX hearth_provider_calls_entry_idx (entry_id, created_at DESC),
  INDEX hearth_provider_calls_session_idx (session_id_hash, created_at DESC)
);

UPSERT INTO hearth_recall_config (
  config_key, config_version, embedding_provider, embedding_model,
  embedding_dimensions, embedding_normalize, semantic_threshold, settings
) VALUES (
  'active', 'hearth-v1', 'fixture', 'fixture-sha256-v1',
  1024, true, 0.55, '{"distance":"cosine","mode":"fixture-is-not-semantic"}'
);
