# Day 0 account and billing checklist

This checklist separates Tang's authorization actions from Codex's technical
smoke tests. Never paste passwords, access keys, cookies, full connection
strings, or card details into chat, source files, screenshots, or Git history.

## A. Tang: AWS account authorization

1. Create/sign in to the AWS account and attach the payment method personally.
2. Enable MFA on the root user. Create an administrative IAM identity for setup;
   do not use the root user for normal work.
3. Choose one commercial AWS region shared by Bedrock, App Runner/ECR/ECS and
   the CockroachDB Cloud cluster. Record only the region name in `.env`; do not
   create resources in several regions during smoke testing.
4. Open Amazon Bedrock's model catalog in that region and confirm
   `amazon.titan-embed-text-v2:0` is listed. Commercial AWS accounts now have
   model access by default when IAM/Marketplace prerequisites are satisfied;
   there is no legacy blanket “request all models” step for Titan.
5. Open Billing and Cost Management → Budgets → Create budget → Customize
   (advanced) → Cost budget. Create a fixed, expiring project budget of **USD
   60**, with actual-cost email thresholds at **USD 30, 50, and 60**. Budget
   notices are delayed billing signals, not a request-path circuit breaker.
6. Send Codex only: account steps complete, selected region, and whether each
   alert confirmation email arrived. Put credentials in the local secret store
   or deployment console when requested, never in Markdown.

Official references:

- [Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
- [Titan V2 request contract](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-embed-text.html)
- [AWS cost budget](https://docs.aws.amazon.com/cost-management/latest/userguide/create-cost-budget.html)

## B. Tang: CockroachDB Cloud authorization

1. Sign in to CockroachDB Cloud with SSO and enable MFA at the identity provider.
2. Create a **Basic** cluster on **AWS** in the same region chosen above. A
   CockroachDB Basic cluster does not require access to Tang's AWS account.
3. Name it `hearth-demo` (or another non-personal project name). Review the
   displayed maximum estimate before confirming any payment method.
4. Create a dedicated SQL user `hearth_app`; generate a unique password and save
   it in a password manager.
5. In Connect, select General connection string for `defaultdb`. Store the
   connection string locally as a secret. Do not send it through chat.
6. For the first SQL smoke test, restrict authorized networks to the current
   public IP if possible. CockroachDB Basic starts with `0.0.0.0/0`; do not
   assume that default is a security control. Public App Runner connectivity is
   reviewed separately before deployment.
7. Send Codex only: cluster created, cloud/region, SQL username, and a redacted
   host suffix. Codex will provide the exact SQL command to run without asking
   for the password in chat.

Official references:

- [Create a Basic cluster](https://www.cockroachlabs.com/docs/cockroachcloud/create-a-basic-cluster)
- [Connect to a Basic cluster](https://www.cockroachlabs.com/docs/cockroachcloud/connect-to-a-basic-cluster)
- [Manage Cloud users and roles](https://www.cockroachlabs.com/docs/cockroachcloud/managing-access)

## C. Codex smoke tests after Tang says both accounts are ready

1. Invoke Titan V2 once with `dimensions=1024` and `normalize=true`; record model
   ID, region, response dimension, latency and redacted request hash.
2. Connect to CRDB Cloud over TLS; create a disposable smoke table, transact,
   query it, and remove it.
3. Run the real migration and scope-prefix vector `EXPLAIN` against the demo
   database only.
4. Configure Cloud Managed MCP read-only and capture schema/count/index evidence.
5. Push a hello-world image to ECR and create the smallest App Runner service;
   verify stable HTTPS, `Secure/HttpOnly/SameSite=Strict` cookie behavior and the
   observed forwarding headers, then remove the smoke service if it is not
   reused.
6. Invoke the candidate selector with valid, illegal, duplicate, excessive and
   prose-wrapped IDs. If strict structured output is not reliable, take v3.4
   path B immediately.

Every result goes to `docs/evidence/` with secrets and user-identifying values
redacted. Account creation and payment remain Tang's actions.
