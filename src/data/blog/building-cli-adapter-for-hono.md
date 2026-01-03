---
title: "Turn a Hono App into a Debuggable CLI (No Server, Just app.fetch)"
pubDatetime: 2026-01-03T10:23:00+09:00
description: A thin library that lets you call Hono apps directly from the CLI, with zero side effects and easy MCP server support.
tags:
  - hono
  - node
  - typescript
  - cli
---

If you've ever built a CLI and hated the edit-run-repeat loop, this pattern helps:

- Put all business logic in a Hono app
- Call it from the CLI via `app.fetch()` (no HTTP server)
- Keep the adapter pure: no stdout/stderr writes, your CLI owns the output

This post shows a minimal setup, how argv maps to URL/query/body, and optional OpenAPI-powered `--help`.

## TL;DR

- [hono-cli-adapter](https://github.com/kiyo-e/hono-cli-adapter) lets you call Hono apps directly from the CLI
- Your logic stays in Hono—debug with Postman, ship as CLI
- Zero stdout writes; your CLI controls all output
- Same Hono app works for CLI, HTTP, and MCP servers

## The Problem

Debugging CLI tools is tedious. Run, tweak args, run again. No request history, no easy inspection.

What if your CLI logic lived behind HTTP endpoints instead? You'd get Postman for debugging, saved requests for regression tests, and a single source of truth for both CLI and API.

## What I Built

[hono-cli-adapter](https://github.com/kiyo-e/hono-cli-adapter) — a thin library that converts CLI arguments into HTTP requests and calls your Hono app's `app.fetch()` directly.

No actual HTTP server needed. Just your Hono app and a few lines of CLI glue.

## Getting Started

Install:

```bash
npm install hono-cli-adapter
```

First, your Hono app (this is the logic you want to call from CLI):

```ts
// app.ts
import { Hono } from 'hono'
export const app = new Hono()

app.post('/hello/:name', (c) => c.text(`Hello, ${c.req.param('name')}!`))
app.post('/create-user', async (c) => {
  const body = await c.req.json()
  return c.json({ ok: true, user: body })
})
```

Then, your CLI (just 4 lines):

```ts
#!/usr/bin/env node
// cli.ts
import { cli } from 'hono-cli-adapter'
import { app } from './app.js'

await cli(app)
```

Run it:

```bash
node cli.js hello Taro
# -> Hello, Taro!

node cli.js create-user -- name=Taro email=taro@example.com
# -> {"ok":true,"user":{"name":"Taro","email":"taro@example.com"}}

node cli.js --list   # List available routes
node cli.js --help   # Show help
```

That's it. The same `app.ts` works with Postman during dev, as an HTTP API in production, and now as a CLI.

## How argv Maps to HTTP

| CLI input | Becomes |
|-----------|---------|
| `hello Taro` | Path segments (`POST /hello/Taro`) |
| `--foo=bar` | Query string (`?foo=bar`) |
| `-- key=value` | JSON body (`{"key":"value"}`) |
| `--env KEY=VALUE` | Env overlay (highest priority) |

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

## MCP Server Support

Here's where Hono really shines. The same app works as:

```
┌─────────────┐
│   app.ts    │  ← Your business logic (single source of truth)
└─────────────┘
       │
       ├──→ cli.ts (hono-cli-adapter) → CLI
       ├──→ server.ts (Hono serve)    → HTTP API
       └──→ mcp.ts (mcp-hono-adapter) → MCP Server
```

Just swap the entrypoint. No logic duplication. If you're building MCP tools, this pattern saves a ton of maintenance.

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
node cli.js do-thing --env API_KEY=secret-123
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

Hono + CLI is a pattern that deserves more attention. You get web tooling during dev, trivial MCP support, and a testable core—all without duplicating logic.

Check it out: [github.com/kiyo-e/hono-cli-adapter](https://github.com/kiyo-e/hono-cli-adapter)
