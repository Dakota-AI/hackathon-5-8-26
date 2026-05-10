---
name: agents-cloud-preview-tunnels
description: Publish a running local web server from an Agents Cloud resident runner to a public HTTPS preview URL.
version: 0.1.0
---

# Agents Cloud Preview Tunnels

Use this when you build or run a web app and need the user to click a live URL.

## Command

```bash
agents-cloud-preview expose --port 3000 --label my-app
```

The command:
1. creates a short-lived preview tunnel,
2. prints JSON containing `previewUrl`,
3. keeps running and proxies public HTTPS traffic to `http://127.0.0.1:<port>`.

## Workflow

1. Start the app server bound to localhost, for example:
   ```bash
   npm run dev -- --host 127.0.0.1 --port 3000
   ```
2. In another process, expose it:
   ```bash
   agents-cloud-preview expose --port 3000 --label app
   ```
3. Copy the printed `previewUrl` into the user-facing response and/or emit an `artifact.created` event.

## Rules

- Only expose ports for apps you started intentionally.
- Bind dev servers to `127.0.0.1`, not `0.0.0.0`, unless there is a specific reason.
- Do not expose secrets/admin consoles.
- The tunnel is public-by-unguessable-URL for v0 and expires by TTL.
- Keep the `agents-cloud-preview` process alive while the preview should remain reachable.
