---
title: "Zero Egress Costs: How I Built P2P File Sharing with Cloudflare"
pubDatetime: 2026-01-09
description: "File sharing services charge you for every byte. I built one where files never touch the server — and egress costs stay at zero, no matter the file size."
tags:
  - webrtc
  - cloudflare
  - hono
  - typescript
---

## TL;DR

I built a P2P file sharing tool where files transfer directly between browsers. The server only handles WebRTC signaling — actual files never touch it. Transfer a 10GB file? Still zero egress costs. The stack: Hono + Cloudflare Workers + Durable Objects + STUN.

**Demo**: https://share-files.karakuri-maker.com/  
**Repo**: https://github.com/kiyo-e/p2p-share-files

---

## The Problem: Egress Costs Add Up Fast

Every file sharing service charges you for bandwidth. S3, R2, whatever — you pay for every byte that leaves the server.

I ran the numbers for a simple use case: sharing large video files with a few friends. Even with Cloudflare R2's "generous" free tier, a few 4GB files per month and I'm paying. Scale that to actual users? The bill gets ugly.

I wanted something different: **zero transfer costs, regardless of file size**.

The answer was obvious in hindsight — don't let files touch the server at all.

## The Solution: WebRTC + Cloudflare

WebRTC lets browsers talk directly to each other. No server in the middle. The catch? You still need a server for "signaling" — exchanging connection info so browsers can find each other.

Here's the architecture:

```
┌─────────────┐         ┌─────────────────────┐         ┌─────────────┐
│   Sender    │◄───────►│   Durable Object    │◄───────►│  Receiver   │
│             │   WS    │   (signaling only)  │   WS    │             │
└─────────────┘         └─────────────────────┘         └─────────────┘
       │                                                       │
       │                                                       │
       └──────────────────── WebRTC P2P ───────────────────────┘
                         (files go here)
```

Signaling messages are tiny — a few KB. Files flow directly between browsers. The server never sees them.

## The Stack

| Layer | Tech | Why |
|-------|------|-----|
| Framework | **Hono** | TypeScript-first, perfect Cloudflare integration |
| Hosting | **Cloudflare Workers** | Edge deployment, cheap |
| State | **Durable Objects** | WebSocket connections + room state |
| NAT traversal | **Cloudflare STUN** | Free, same vendor |

Everything stays within Cloudflare. One `wrangler deploy` and it's live.

## Why Durable Objects?

Workers are stateless. That's usually fine, but signaling needs state — you need to track who's in which room, and relay messages between them.

Durable Objects solve this perfectly. Each room gets its own instance:

```typescript
app.get('/ws/:roomId', (c) => {
  const roomId = c.req.param('roomId')
  const id = c.env.ROOM.idFromName(roomId)
  const stub = c.env.ROOM.get(id)
  return stub.fetch(c.req.raw)
})
```

The Durable Object handles all WebSocket connections for that room. When someone sends an offer, it relays to the right peer. Simple.

```typescript
export class Room extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const clientId = new URL(request.url).searchParams.get('cid') 
      ?? crypto.randomUUID()
    
    this.closeDuplicateClient(clientId)  // Handle reconnects
    
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    
    return new Response(null, { status: 101, webSocket: pair[0] })
  }
  
  webSocketMessage(ws: WebSocket, message: string) {
    // Relay signaling messages to the right peer
  }
}
```

## The Hard Part: Reconnection

Getting the initial connection working took a day. Making reconnection reliable took a week.

### Problem 1: Ghost Connections

User reloads the page. Browser closes WebSocket. But Durable Object doesn't know immediately — there's a delay before `webSocketClose` fires. New connection comes in, now you have duplicates.

**Fix**: Client IDs stored in localStorage.

```typescript
function getClientId() {
  const stored = localStorage.getItem('client-id')
  if (stored) return stored
  const id = crypto.randomUUID()
  localStorage.setItem('client-id', id)
  return id
}
```

When a new connection arrives with the same client ID, force-close the old one:

```typescript
private closeDuplicateClient(clientId: string) {
  for (const socket of this.ctx.getWebSockets()) {
    const attachment = socket.deserializeAttachment()
    if (attachment?.cid === clientId) {
      socket.close(1000, 'replaced')
    }
  }
}
```

### Problem 2: Stale Signaling Messages

Old offer/answer messages from the previous session arrive after reconnection. They mix with new session messages. Everything breaks.

**Fix**: Session IDs on every signaling message.

```typescript
const sendOffer = async (peer: OffererPeer) => {
  const sid = ++peer.signalSid  // Increment on every new offer
  peer.activeSid = sid

  const offer = await peer.pc.createOffer({ iceRestart: true })
  await peer.pc.setLocalDescription(offer)
  
  send({ type: 'offer', to: peer.peerId, sid, sdp: offer })
}

// Receiving side: ignore mismatched session IDs
if (msg.sid !== peer.activeSid) return
```

Client IDs handle duplicate connections. Session IDs handle stale messages. Both together finally made it stable.

## The No-TURN Trade-off

I deliberately skipped TURN servers.

TURN relays traffic through a server when P2P fails (strict corporate firewalls, symmetric NAT). But that defeats the whole point — files would go through my server, and I'd pay egress.

Without TURN, some corporate networks won't work. That's the trade-off. For my use case — sharing files with friends and colleagues on normal networks — STUN alone works fine.

If I needed to support stricter environments, I'd add TURN as an option and charge for it. But the free tier stays P2P-only.

## Bonus: E2E Encryption

Optional E2E encryption using URL fragments:

```
https://example.com/room/ABC123#k=Base64EncodedKey
```

The `#` fragment never hits the server. Cloudflare Workers never see the key. Only browsers sharing the link can decrypt.

## What I Learned

**Durable Objects are underrated.** Everyone talks about Workers, but Durable Objects are what make stateful edge applications possible. WebSocket management, room state, connection queueing — all in one primitive.

**WebRTC reconnection is painful.** The happy path works quickly. The reconnection edge cases take 10x longer. Budget for it.

**TURN is a business decision, not a technical one.** You can always add it later. Starting without it keeps costs at zero and forces you to validate whether P2P alone is good enough.

**The Cloudflare stack is underrated for real-time apps.** Workers + Durable Objects + STUN. No external dependencies. One deploy command. It just works.

---

The best file transfer is the one that never touches your server.

**Demo**: https://share-files.karakuri-maker.com/  
**Code**: https://github.com/kiyo-e/p2p-share-files
