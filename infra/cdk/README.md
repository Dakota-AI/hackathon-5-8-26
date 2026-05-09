# AWS CDK

AWS CDK app placeholder.

Stack groups to implement first:

1. `FoundationStack`: accounts, tags, KMS, shared parameters.
2. `NetworkStack`: VPC, private subnets, endpoints, NAT strategy, security groups.
3. `StorageStack`: S3 workspace/audit/preview buckets, EFS, lifecycle policies.
4. `StateStack`: DynamoDB run/task/event tables, EventBridge, SQS.
5. `ClusterStack`: ECS cluster, Fargate capacity, Managed Instances capacity providers.
6. `RuntimeStack`: task definitions for agent, Codex, Hermes, builder, eval, preview.
7. `OrchestrationStack`: Step Functions for run classes.
8. `EdgePreviewStack`: ALB, ACM, Route 53 wildcard, preview-router service.
9. `ObservabilityStack`: logs, metrics, alarms, dashboards.
