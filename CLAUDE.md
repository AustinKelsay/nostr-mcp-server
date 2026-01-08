# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Model Context Protocol (MCP) server** that provides Nostr capabilities to LLMs. It implements 17 tools for interacting with the Nostr network including profile management, note creation/publishing, zap handling, and NIP-19 entity conversion.

Built with **snstr** (lightweight TypeScript Nostr library) and the **@modelcontextprotocol/sdk**.

## Common Commands

```bash
# Build the project (compiles TypeScript and sets executable permissions)
bun run build

# Run all tests
bun test

# Run a specific test file
bun test __tests__/basic.test.ts

# Start the MCP server
bun start

# Start with Node.js (runtime is dual-compatible)
npm run start:node
```

## Architecture

### Entry Point
- `index.ts` - Main MCP server setup and tool registration. All 17 tools are registered here with their handlers.

### Module Structure
Each feature area has its own directory with a `*-tools.ts` file containing:
- Zod schemas for tool configuration
- Core business logic functions
- Formatting helpers

| Directory | Purpose |
|-----------|---------|
| `profile/` | Keypair generation, profile creation/updates, authenticated note posting |
| `note/` | Note creation, signing, publishing, anonymous posting, reading |
| `zap/` | Zap receipt processing, anonymous zaps, LNURL handling |
| `utils/` | Shared utilities (see below) |

### Utils Module (`utils/`)
- `constants.ts` - `DEFAULT_RELAYS`, `QUERY_TIMEOUT`, `KINDS` enum
- `conversion.ts` - NIP-19 encoding/decoding (`npubToHex`, `hexToNpub`)
- `formatting.ts` - Output formatting helpers
- `pool.ts` - `getFreshPool()` for Nostr relay connections
- `nip19-tools.ts` - NIP-19 entity conversion and analysis
- `ephemeral-relay.ts` - In-memory Nostr relay for testing

### Key Patterns
- Each tool handler creates a fresh relay pool via `getFreshPool()` and closes it in a `finally` block
- Public keys accept both hex and npub formats - use `npubToHex()` to normalize
- Private keys accept both hex and nsec formats - use `normalizePrivateKey()` helper
- Tool configs use Zod schemas defined in each module's `*ToolConfig` exports

## Testing

Tests use Bun's native test runner with an ephemeral in-memory relay (`utils/ephemeral-relay.ts`) - no external network needed.

- **Unit tests**: `basic.test.ts`, `profile-tools.test.ts`, `note-*.test.ts`, `zap-*.test.ts`, `nip19-*.test.ts`
- **Integration tests**: `integration.test.ts` (relay interaction), `websocket-integration.test.ts` (WebSocket protocol)

Note: Tests require Bun. The runtime is dual-compatible (Bun or Node.js).

## Key Dependencies
- `snstr` - Nostr protocol (keypairs, events, signing, NIP-19)
- `@noble/curves` - secp256k1 cryptography
- `light-bolt11-decoder` - Lightning invoice parsing
- `zod` - Schema validation for tool inputs
