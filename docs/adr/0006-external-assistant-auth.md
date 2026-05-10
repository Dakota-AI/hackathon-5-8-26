# ADR 0006: External Assistant Auth

Date: 2026-05-09
Status: Accepted

## Context

The product may support user-linked assistant accounts in trusted environments,
but production multi-tenant automation needs a supportable credential model for
hosted workers, billing, rotation, policy enforcement, and incident response.

## Decision

Use API-key or service-account auth as the production default.

Support optional linked user-account mode only after the trusted-runner security
model is implemented.

Rules:

- Never store provider API keys or assistant auth files in git.
- Treat local auth files like passwords.
- Do not share one user auth file across concurrent workers.
- Do not use user-linked auth for public or untrusted worker environments.
- Track usage and quotas in the platform database regardless of auth mode.

## Consequences

- Production automation has a supportable billing and rotation model.
- User-linked auth can be added later without blocking the MVP.
- The product should not promise subscription-credit-backed 24/7 hosted
  automation until terms and auth behavior are verified.
