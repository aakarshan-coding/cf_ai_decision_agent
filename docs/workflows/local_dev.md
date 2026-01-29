---
title: Local Development · Cloudflare Workflows docs
description: Workflows support local development using Wrangler, the
  command-line interface for Workers. Wrangler runs an emulated version of
  Workflows compared to the one that Cloudflare runs globally.
lastUpdated: 2025-09-18T22:01:54.000Z
chatbotDeprioritize: false
source_url:
  html: https://developers.cloudflare.com/workflows/build/local-development/
  md: https://developers.cloudflare.com/workflows/build/local-development/index.md
---

Workflows support local development using [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/), the command-line interface for Workers. Wrangler runs an emulated version of Workflows compared to the one that Cloudflare runs globally.

## Prerequisites

To develop locally with Workflows, you will need:

* [Wrangler v3.89.0](https://blog.cloudflare.com/wrangler3/) or later.

* Node.js version of `18.0.0` or later. Consider using a Node version manager like [Volta](https://volta.sh/) or [nvm](https://github.com/nvm-sh/nvm) to avoid permission issues and change Node versions.

* If you are new to Workflows and/or Cloudflare Workers, refer to the [Workflows Guide](https://developers.cloudflare.com/workflows/get-started/guide/) to install `wrangler` and deploy their first Workflows.

## Start a local development session

Open your terminal and run the following commands to start a local development session:

```sh
# Confirm we are using wrangler v3.89.0+
npx wrangler --version
```

```sh
⛅️ wrangler 3.89.0
```

Start a local dev session

```sh
# Start a local dev session:
npx wrangler dev
```

```sh
------------------
Your worker has access to the following bindings:
- Workflows:
  - MY_WORKFLOW: MyWorkflow
⎔ Starting local server...
[wrangler:inf] Ready on http://127.0.0.1:8787/
```

Local development sessions create a standalone, local-only environment that mirrors the production environment Workflows runs in so you can test your Workflows *before* you deploy to production.

Refer to the [`wrangler dev` documentation](https://developers.cloudflare.com/workers/wrangler/commands/#dev) to learn more about how to configure a local development session.

## Known Issues

Workflows are not supported as [remote bindings](https://developers.cloudflare.com/workers/development-testing/#remote-bindings) or when using `npx wrangler dev --remote`.

Wrangler Workflows commands `npx wrangler workflow [cmd]` are not supported for local development, as they target production API.
