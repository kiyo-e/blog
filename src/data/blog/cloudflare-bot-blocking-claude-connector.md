---
title: "Why Claude's Custom Connector Failed on Cloudflare (and How I Fixed It)"
description: "A debugging story about Cloudflare's AI Bot blocking feature breaking Claude's custom connector while ChatGPT worked fine."
pubDatetime: 2025-06-18T12:00:00Z
tags:
  - cloudflare
  - claude
  - chatgpt
  - api
  - cloudflare-workers
---

## TL;DR

I built a custom connector API on Cloudflare Workers that worked perfectly with ChatGPT but failed with Claude. The culprit? Cloudflare's "AI Bot" blocking feature. Turning it off in **Security → Bots** fixed the issue instantly.

---

## The Problem

I was building a custom connector that works with both ChatGPT and Claude. Hosted it on Cloudflare Workers, tested with ChatGPT—worked fine. Then I tried Claude with the exact same setup. Connection error. Every. Single. Time.

Same API, same endpoint, same configuration. Why would Claude fail when ChatGPT succeeded?

## The Solution

**Cloudflare's security settings were blocking Claude.**

Specifically, under **Security → Bots**, the "Block AI Bots" option was set to "Block on all pages." Switching this to "Off" allowed Claude to connect immediately.

## The Debugging Journey

Here's how I tracked down the issue:

### Step 1: Initial Setup

Created the connector API on Cloudflare Workers and deployed it to a custom domain. Configured ChatGPT's connector feature, ran the connection test. Success. Requests were logged, responses were correct.

### Step 2: Claude Fails

Set up Claude with the identical endpoint. Connection test failed with a generic "Cannot connect" error—no details, no hints.

Checked my configuration multiple times. Everything looked correct.

### Step 3: Checking the Logs

This is where things got interesting. I opened Cloudflare Workers logs and found that **Claude's requests never reached the Worker**. ChatGPT's requests were logged, but nothing from Claude.

### Step 4: Ruling Out Application Code

Maybe my code had some edge case? I rebuilt the entire app from scratch—just authentication, nothing else. Deployed it. Same result. Claude still couldn't connect.

So the application code wasn't the problem.

### Step 5: The Breakthrough

On a hunch, I tried connecting using the default `*.workers.dev` URL instead of my custom domain.

It worked.

Same app, same Claude configuration—different URL. That was the clue I needed. The issue had to be domain-specific.

### Step 6: Finding the Setting

Went to Cloudflare Dashboard → **Security → Bots**. Found "Block AI Bots" enabled with "Block on all pages" selected.

Changed it to "Off," saved, and ran Claude's connection test again.

Success. Finally.

## Why This Happened

Cloudflare treats different AI services' User-Agents differently. ChatGPT apparently wasn't flagged, but Claude was. This makes sense for protecting regular websites from AI scraping, but it breaks legitimate API integrations.

The `*.workers.dev` domain doesn't inherit your custom domain's security settings, which is why it worked as a bypass.

## Key Takeaway

If you're hosting a custom connector on Cloudflare and Claude won't connect:

1. Go to **Security → Bots** in your Cloudflare dashboard
2. Find "Block AI Bots"
3. Set it to **Off**

That's it. A 30-second fix for hours of debugging.

## Conclusion

The frustrating part was that ChatGPT worked fine, which sent me down the wrong debugging path. I assumed the issue was Claude-specific—maybe different auth requirements, maybe a bug in my code.

Turns out it was just Cloudflare doing its job a little too well.

Hope this saves someone else the headache.
