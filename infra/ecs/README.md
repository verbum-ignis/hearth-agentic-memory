# ECS worker infrastructure

All ECS runtime roles use the `hearth-runtime-boundary` permissions boundary.
The execution role may only retrieve `hearth-*` secrets and write `/ecs/hearth-*`
logs. Tasks run in public subnets with an assigned public IP and a security group
with no ingress rules. The worker initiates outbound HTTPS connections only.

The Jina smoke task is intentionally one-shot. Its log output contains only the
HTTP status, model identifier, vector dimensions, normalization check, latency,
and a cross-lingual similarity score. It never logs the API key, input text,
full response, or embedding values.
