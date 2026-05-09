# Preview Router

Wildcard website/artifact preview router placeholder.

Routing model:

```text
*.domain.com -> Route 53 -> ACM -> ALB -> preview-router
```

The router resolves the host against a registry and serves:

- Static S3 deployments.
- Long-lived ECS preview services.
- Short-lived preview tasks.
- Archived/unavailable responses.

Do not create one ALB listener rule or target group per project preview.
