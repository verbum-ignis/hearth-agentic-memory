# Jina embedding smoke on AWS

Date: 2026-07-27  
Region: `us-east-2`  
Runtime: one-shot ECS/Fargate task, Node.js 22 Alpine  
Model: `jina-embeddings-v3`

The task ran in a public subnet with an assigned public IP and a security group
with no ingress rules. The API key was injected from AWS Secrets Manager through
a permissions-boundary-constrained execution role. Logs contained no key, input
text, response body, embedding values, or personal memory data.

Observed result:

```json
{
  "ok": true,
  "model": "jina-embeddings-v3",
  "documentDimensions": 1024,
  "queryDimensions": 1024,
  "documentNorm": 1,
  "queryNorm": 1,
  "crossLingualCosine": 0.425,
  "documentLatencyMs": 1514,
  "queryLatencyMs": 273
}
```

The document used `retrieval.passage`; the Chinese query used
`retrieval.query`. The first request includes connection/model warm-up effects;
the second request is the warm-path observation. This single pair proves the
provider and deployment contract, but it is not sufficient to set a semantic
threshold. Threshold calibration remains gated on HearthEval.
