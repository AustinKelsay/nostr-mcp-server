# Nostr MCP Server

> ⚠️ **This project is no longer maintained.** It has been superseded by **[nostr-agent-interface](https://github.com/AustinKelsay/nostr-agent-interface)** — a newer, improved version with additional Blossom file storage support and an expanded tool set.

For the full MCP server with 48 tools, see:  
**https://github.com/AustinKelsay/nostr-agent-interface**

---

### What changed?

The `nostr-agent-interface` (NAI) builds on this project and adds:

- **Blossom file storage** — 8 new tools for uploading, downloading, listing, deleting, and mirroring blobs
- **Expanded tool count** — 48 MCP tools covering profile, notes, relays, DMs, zaps, and now blob storage
- **Cleaner architecture** — improved module organization and signing via `snstr`
- **Built-in budget monitoring** — optional Plaid-connected budget tracking for personal finance

### Migrating

If you're using `nostr-mcp-server`, switch to:

```bash
npm install -g nostr-agent-interface
```

Or point to the source:

```bash
git clone https://github.com/AustinKelsay/nostr-agent-interface.git
cd nostr-agent-interface
npm install && npm run build
```

### Old tool count

This repo contains 40 tools (documented in the git history).

The active repo (`nostr-agent-interface`) has **48 tools**.
