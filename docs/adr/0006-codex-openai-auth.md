# ADR 0006: Codex And OpenAI Auth

Date: 2026-05-09
Status: Accepted

## Context

The user wants to use Codex and ideally draw usage from Codex/ChatGPT login credits. Current OpenAI docs recommend API-key auth for programmatic automation and treat ChatGPT-managed Codex auth in CI/CD as an advanced trusted-runner mode.

## Decision

Use OpenAI API-key/service-account auth as the production default.

Support optional linked Codex/ChatGPT account mode only after the trusted-runner security model is implemented.

Rules:

- Never store API keys or Codex auth files in git.
- Treat `auth.json` like a password.
- Do not share one user auth file across concurrent workers.
- Do not use user-linked Codex auth for public or untrusted worker environments.
- Track usage and quotas in the platform database regardless of auth mode.

## Consequences

- Production automation has a supportable billing and rotation model.
- User-linked Codex can be added later without blocking the MVP.
- The product should not promise subscription-credit-backed 24/7 hosted automation until terms and auth behavior are verified.
