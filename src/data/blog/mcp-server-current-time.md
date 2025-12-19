---
title: "Building a Simple MCP Server That Just Returns the Current Time"
description: "How I built a minimal MCP server to solve the time drift problem in long ChatGPT and Claude conversations"
pubDate: 2024-12-19
tags: ["mcp", "cloudflare", "chatgpt", "claude", "typescript"]
---

## TL;DR

- Long conversations with ChatGPT/Claude lose track of real time
- Built a simple MCP server that returns the current time
- Deploy it on Cloudflare Workers, register as a custom connector
- URL: `https://what-time.kiyo-e.com/mcp`
- Repo: [github.com/kiyo-e/time-mcp](https://github.com/kiyo-e/time-mcp/)

## The Problem

I use ChatGPT's scheduled tasks feature to check my Google Calendar and Tasks every morning. Throughout the day, I discuss tasks and schedules with it while working.

Here's the issue: ChatGPT only knows the time from when the conversation started (via the system prompt). As the conversation continues, its sense of time drifts. It might mention an upcoming meeting that already happened, or suggest afternoon tasks when it's already evening.

This small disconnect becomes surprisingly frustrating.

## The Solution

I built an MCP server that does exactly one thing: return the current time.

```
https://what-time.kiyo-e.com/mcp
```

Register this as a custom connector in ChatGPT or Claude, and instruct the LLM to check the time before discussing schedules. Now it always knows "what time it is."

## Implementation

Built with Cloudflare Workers + MCP SDK. The entire implementation is about 50 lines.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpHandler } from 'agents/mcp';
import { z } from 'zod';

const server = new McpServer({
  name: 'mcp-time-worker',
  version: '0.2.0'
});

server.tool(
  'get_time',
  'Returns the current date and time (to the second) in a given IANA time zone.',
  z.object({
    timezone: z.string().describe('IANA time zone, e.g. Asia/Tokyo').optional()
  }),
  async ({ timezone }) => {
    const tz = timezone || 'Asia/Tokyo';
    const now = formatTime(tz);
    return {
      content: [{ type: 'text', text: now }],
      metadata: { timezone: tz }
    };
  }
);
```

The `get_time` tool returns the current time in ISO 8601 format like `2025-06-15T14:30:45+09:00`. You can specify any IANA timezone (`Asia/Tokyo`, `America/New_York`, etc.).

The time formatting uses `Intl.DateTimeFormat` with UTC offset calculation:

```typescript
function formatTime(tz: string): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});

  // Calculate UTC offset
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const zoned = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const offsetMinutes = (zoned.getTime() - utc.getTime()) / 60000;
  // ... build offset string and return
}
```

## Setup Guide

### ChatGPT (Pro / Plus)

1. Go to **Settings → Apps & Connectors → Advanced settings** and enable "Developer Mode"
2. Click **Create connector**
3. Enter:
   - Name: `What time is it?` (or anything you like)
   - URL: `https://what-time.kiyo-e.com/mcp`
   - Authentication: None
4. In chat, click **+ icon → select your connector** to enable it

### Claude (Pro / Max / Team)

1. Click the **Search and tools** icon in the chat interface
2. Select **Manage connectors**
3. Click **Add custom connector**
4. Enter:
   - Name: `What time is it?`
   - URL: `https://what-time.kiyo-e.com/mcp`

Then instruct the LLM: "Always check the current time before discussing schedules or tasks."

## Takeaways

Cloudflare Workers made this trivially easy. Write some code, deploy instantly, zero maintenance. Perfect for small utilities like this.

MCP as a protocol is proving its value. Even something as simple as "return the current time" becomes useful when you can inject accurate context into LLM conversations. The standardization means this one server works with both ChatGPT and Claude.

## Conclusion

- Problem: LLMs lose track of time in long conversations
- Solution: A simple MCP server that returns the current time
- URL: `https://what-time.kiyo-e.com/mcp`
- Source: [github.com/kiyo-e/time-mcp](https://github.com/kiyo-e/time-mcp/)

Give it a try.
