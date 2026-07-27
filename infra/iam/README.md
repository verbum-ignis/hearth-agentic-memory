# HearthDeploy IAM bootstrap

These policies are the IAM exception layered on top of the `PowerUserAccess`
permission set used for temporary hackathon deployment sessions.

## One-time administrator setup

1. Replace every `<ACCOUNT_ID>` placeholder in both JSON files with the 12-digit
   AWS account ID. Keep the deployment region as `us-east-2`.
2. Create the customer-managed policy `hearth-runtime-boundary` from
   `hearth-runtime-boundary.json`.
3. Create the customer-managed policy `hearth-deploy-bootstrap` from
   `hearth-deploy-bootstrap-policy.json`.
4. In IAM Identity Center, create the `HearthDeploy` permission set with a short
   session duration, attach AWS managed `PowerUserAccess`, and attach
   `hearth-deploy-bootstrap` as a customer-managed policy reference.
5. Assign only the dedicated Hearth deployment identity. Require MFA and use
   `aws configure sso`; do not create an IAM user or long-lived access key.

Every runtime role whose name starts with `hearth-` must be created with the
`hearth-runtime-boundary` permissions boundary. The boundary caps inline role
policies, so the bootstrap permission cannot be used to turn an App Runner or
ECS role into an administrator.

The deployment identity may pass `hearth-*` roles only to App Runner or ECS
tasks. The only non-prefixed IAM resource it may create is App Runner's own
service-linked role.

## Teardown

After judging, delete the `HearthDeploy` assignment/permission set and the
temporary `hearth-*` runtime roles after their App Runner/ECS resources have
been removed. Keep audit logs until the submission retention window ends.
