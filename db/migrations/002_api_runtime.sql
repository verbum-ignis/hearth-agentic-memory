CREATE TABLE IF NOT EXISTS hearth_query_embedding_cache (
  cache_key STRING PRIMARY KEY,
  embedding_model STRING NOT NULL,
  embedding_spec_version STRING NOT NULL,
  query_hash STRING NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  INDEX hearth_query_embedding_cache_expiry_idx (expires_at)
);

CREATE TABLE IF NOT EXISTS hearth_ip_daily_usage (
  usage_date DATE NOT NULL,
  ip_hash STRING NOT NULL,
  capability STRING NOT NULL CHECK (capability IN ('session_create')),
  used INT NOT NULL DEFAULT 0 CHECK (used >= 0),
  daily_limit INT NOT NULL CHECK (daily_limit >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (usage_date, ip_hash, capability),
  CONSTRAINT ip_usage_within_limit CHECK (used <= daily_limit)
);
