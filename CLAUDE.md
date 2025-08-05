# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides Nostr protocol capabilities to LLMs like Claude. It enables LLMs to interact with the Nostr decentralized social network, fetch profiles, notes, zap (micropayment) data, search NIPs (Nostr Implementation Possibilities), and send anonymous content.

## Development Commands

### Build and Run
```bash
npm run build    # Compile TypeScript to JavaScript in build/ directory
npm start        # Run the compiled server (runs build/index.js)
```

### Testing
```bash
npm test                               # Run all tests with Jest
npm test -- __tests__/basic.test.ts   # Run specific test file
```

### Development Workflow
1. Make changes to TypeScript files
2. Run `npm run build` to compile
3. Test changes with `npm test`
4. For MCP testing, restart Claude Desktop or IDE after rebuilding

## Architecture

### Core Components

- **`index.ts`**: Main MCP server setup and tool registration. All 16 Nostr tools are defined here using the MCP SDK.
- **Module Structure**:
  - `profile/`: Identity management and profile operations (`profile-tools.ts`)
  - `note/`: Note reading and anonymous posting functionality (`note-tools.ts`)
  - `zap/`: Lightning payment (zap) functionality (`zap-tools.ts`) 
  - `nips/`: NIP search and caching (`nips-tools.ts`)
  - `utils/`: Shared utilities
    - `index.ts`: Re-exports common utilities
    - `constants.ts`: Global constants and relay configurations
    - `formatting.ts`: Output formatting helpers
    - `nip19-tools.ts`: NIP-19 entity conversion and analysis
    - `ephemeral-relay.ts`: In-memory Nostr relay for testing

### Key Design Patterns

- **Fresh Connection Pools**: Each tool call creates a new Nostr relay connection pool via `getFreshPool()` and properly cleans up afterward
- **Timeout Management**: All relay queries use `QUERY_TIMEOUT` (8 seconds) to prevent hanging
- **Format Support**: Native support for both hex pubkeys and npub format with automatic conversion via `npubToHex()`
- **Modular Tools**: Each major feature is implemented as a separate tool with its own Zod schema

### Nostr Protocol Integration

- Uses `snstr` library for core Nostr functionality (event creation, signing, encoding)
- Implements multiple NIPs:
  - NIP-01: Basic protocol flow 
  - NIP-19: Entity encoding (npub, nsec, note, nprofile, nevent, naddr)
  - NIP-57: Lightning Zaps with proper validation
- Supports anonymous operations with temporary keypairs
- WebSocket connections to multiple default relays for data redundancy

### Tool Categories

1. **Identity & Profile Management** (4 tools):
   - `createKeypair`: Generate new Nostr keypairs
   - `createProfile`: Create new profile (kind 0 event)
   - `updateProfile`: Update existing profile
   - `postNote`: Authenticated note posting

2. **Reading & Querying** (3 tools):
   - `getProfile`: Fetch user profiles
   - `getKind1Notes`: Fetch text notes
   - `getLongFormNotes`: Fetch long-form content

3. **Zaps (Lightning Payments)** (4 tools):
   - `getReceivedZaps`: Fetch received zaps
   - `getSentZaps`: Fetch sent zaps
   - `getAllZaps`: Fetch all zaps with summary
   - `sendAnonymousZap`: Prepare anonymous zap

4. **Note Creation & Publishing** (4 tools):
   - `createNote`: Create unsigned note event
   - `signNote`: Sign note event
   - `publishNote`: Publish signed note
   - `postAnonymousNote`: Anonymous posting

5. **Utilities** (3 tools):
   - `searchNips`: Search NIPs with relevance scoring
   - `convertNip19`: Convert between NIP-19 formats
   - `analyzeNip19`: Analyze NIP-19 entities

## Important Constants

- **Default timeout**: `QUERY_TIMEOUT` = 8000ms
- **Default relays**: Defined in `utils/constants.ts`:
  - wss://relay.damus.io
  - wss://relay.nostr.band
  - wss://relay.primal.net
  - wss://nos.lol
  - wss://purplerelay.com
  - wss://nostr.land
- **Supported Nostr kinds**: 
  - 0: Metadata (profiles)
  - 1: Text notes
  - 30023: Long-form content
  - 9735: Zap receipts

## Testing Setup

- Uses Jest with TypeScript support via `ts-jest`
- **Test timeout**: 30 seconds (configured in `jest.config.cjs`)
- **Test configuration**: 
  - ESM support with proper TypeScript transformation
  - Setup file: `jest.setup.js` for test environment configuration
  - TypeScript config: `tsconfig.jest.json` for test-specific settings
- **Test structure**:
  - Unit tests: Basic formatting, data processing, mocks
  - Integration tests: Real Nostr protocol interaction using ephemeral relay
  - WebSocket tests: Connection management and event publishing
- **Ephemeral relay**: `utils/ephemeral-relay.ts` provides in-memory Nostr relay for isolated testing
- Tests verify cryptographic signatures, event validation, and protocol compliance

## Key Dependencies

- `@modelcontextprotocol/sdk`: MCP server framework (^1.11.0)
- `snstr`: Core Nostr protocol implementation (^0.1.0)
- `light-bolt11-decoder`: Lightning invoice parsing for zaps (^3.2.0)
- `ws`: WebSocket client for relay connections (^8.16.1)
- `zod`: Schema validation for tool parameters (^3.24.2)
- `@noble/curves`: Cryptographic operations (^1.8.2)
- `@noble/hashes`: Hash functions (^1.7.2)

## Important Development Guidelines

- **File modification preference**: Always prefer editing existing files over creating new ones
- **Documentation policy**: Never proactively create documentation files (*.md) or README files unless explicitly requested
- **MCP restart requirement**: After making changes and rebuilding, restart Claude Desktop or your IDE to pick up the changes
- **Testing workflow**: Always run tests after making changes to ensure nothing is broken
- **Error handling**: All tools return structured responses with success/failure status and descriptive messages
- **Resource cleanup**: Always close relay connections in finally blocks to prevent resource leaks