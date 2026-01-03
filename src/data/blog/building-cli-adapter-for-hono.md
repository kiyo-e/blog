---
title: Building a CLI Adapter for Hono
pubDatetime: 2026-01-03T10:23:00+09:00
description: A thin library that lets you call Hono apps directly from the CLI, with zero side effects and easy MCP server support.
tags:
  - hono
  - cli
  - typescript
  - mcp
---

## TL;DR

- `hono-cli-adapter` lets you call Hono apps directly from the CLI
- Your logic stays in Hono—debug with Postman, ship as CLI
- Zero stdout writes; your CLI controls all output
- Bonus: trivial MCP server support by swapping entrypoints

## The Problem

Debugging CLI tools is tedious. Run, tweak args, run again. No request history, no easy inspection.

What if your CLI logic lived behind HTTP endpoints instead?

## What I Built

[hono-cli-adapter](https://github.com/kiyo-e/hono-cli-adapter) — a thin library that converts CLI arguments into HTTP requests and calls your Hono app's `app.fetch()` directly.

No actual HTTP server needed. Just your Hono app and a few lines of CLI glue.

Why Hono?

- **Dev with web tools**: Use Postman or Insomnia while building. Save requests, inspect responses, iterate fast.
- **MCP ready**: Swap the entrypoint and you get both local and remote MCP server support. Same logic, different transports.
- **Testable**: Your Hono app is the source of truth. Test it independently.

## Getting Started

Install:

```bash
npm install hono-cli-adapter
```

Create your CLI:

```ts
#!/usr/bin/env node
import { cli } from 'hono-cli-adapter'
import { app } from './app.js'

await cli(app)
```

Run it:

```bash
# Call /hello/:name route
node my-cli.js hello Taro
# -> "Hello, Taro!"

# List available routes
node my-cli.js --list

# Show help
node my-cli.js --help
```

That's the basics. CLI arguments become URL paths and query params, then hit `app.fetch()`.

## How It Works

Three design constraints:

**1. Thin CLI, fat Hono**

All business logic lives in Hono. The CLI just handles flags and output. This keeps behavior consistent between CLI and HTTP, and makes your Hono app fully testable on its own.

**2. No side effects**

The library never touches stdout. You decide how to format output:

```ts
const { code, lines } = await runCli(app, process)
for (const l of lines) console.log(l)  // or JSON.stringify, or pipe somewhere
process.exit(code)
```

**3. POST-only**

CLI commands trigger actions. POST makes sense. GET support can come later if needed.

## Advanced Usage

### Environment Variables

Three layers, last wins:

```ts
// 1. process.env (base)
// 2. options.env (adapter config)
// 3. --env flags (highest priority)

await cli(app, process, { env: { API_URL: 'https://dev.example.com' } })
```

```bash
node my-cli.js do-thing --env API_KEY=secret-123
```

### Request Body

Tokens after `--` become JSON body:

```bash
node my-cli.js create-user -- name=Taro email=taro@example.com
# Sends: { "name": "Taro", "email": "taro@example.com" }
```

### beforeFetch Hook

Transform requests per command:

```ts
await adaptAndFetch(app, process.argv.slice(2), {
  beforeFetch: {
    upload: async (req, argv) => {
      if (argv.file) {
        const buf = await fs.readFile(argv.file)
        const headers = new Headers(req.headers)
        headers.set('content-type', 'application/octet-stream')
        return new Request(req, { body: buf, headers })
      }
    }
  }
})
```

### OpenAPI Integration

Pass a spec to enrich `--help`:

```ts
await runCli(app, process, { openapi: myOpenApiSpec })
```

Shows parameter types, required/optional, descriptions. Pairs well with `hono-openapi`.

## Gotchas

**`listPostRoutes` uses Hono internals**

It inspects Hono's internal router structure. May break on major Hono updates. For production, consider maintaining your own route list.

**ESM only**

No CommonJS. Node 18+ required.

## Wrapping Up

Hono + CLI is a pattern that deserves more attention. You get web tooling during dev, easy MCP support, and a testable core—all without duplicating logic.

Check it out: [github.com/kiyo-e/hono-cli-adapter](https://github.com/kiyo-e/hono-cli-adapter)
