# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides Nostr protocol capabilities to LLMs like Claude. It enables LLMs to interact with the Nostr decentralized social network, fetch profiles, notes, zap (micropayment) data, search NIPs (Nostr Implementation Possibilities), and send anonymous content.

## Development Commands

### Build and Run
```bash
npm run build    # Compile TypeScript to JavaScript in build/ directory
npm start        # Run the compiled server
```

### Testing
```bash
npm test                               # Run all tests
npm test -- __tests__/basic.test.ts   # Run specific test file
```

### Development Workflow
1. Make changes to TypeScript files
2. Run `npm run build` to compile
3. Test changes with `npm test`
4. For MCP testing, restart Claude Desktop or IDE after rebuilding

## Architecture

### Core Components

- **`index.ts`**: Main MCP server setup and tool registration. All Nostr tools are defined here using the MCP SDK.
- **Module Structure**:
  - `note/`: Profile and text note functionality (`note-tools.ts`)
  - `zap/`: Lightning payment (zap) functionality (`zap-tools.ts`) 
  - `nips/`: NIP search and caching (`nips-tools.ts`)
  - `utils/`: Shared utilities (connection pools, format conversion, constants)

### Key Design Patterns

- **Fresh Connection Pools**: Each tool call creates a new Nostr relay connection pool via `getFreshPool()` and properly cleans up afterward
- **Timeout Management**: All relay queries use `QUERY_TIMEOUT` (8 seconds) to prevent hanging
- **Format Support**: Native support for both hex pubkeys and npub format with automatic conversion
- **Modular Tools**: Each major feature (profiles, notes, zaps, NIPs) is implemented as a separate tool with its own schema

### Nostr Protocol Integration

- Uses `snstr` for core Nostr functionality
- Implements NIP-57 (Lightning Zaps) with proper validation
- Supports anonymous operations (posting and zapping) with temporary keypairs
- WebSocket connections to multiple default relays for data redundancy

### Tool Categories

1. **Profile/Notes**: `getProfile`, `getKind1Notes`, `getLongFormNotes`, `postAnonymousNote`
2. **Zaps**: `getReceivedZaps`, `getSentZaps`, `getAllZaps`, `sendAnonymousZap`
3. **Search**: `searchNips`

## Important Constants

- **Default timeout**: `QUERY_TIMEOUT` = 8000ms
- **Default relays**: Defined in `utils/constants.ts` (wss://relay.damus.io, wss://relay.nostr.band, etc.)
- **Supported Nostr kinds**: Text notes (1), Metadata (0), Long-form (30023), Zap receipts (9735)

## Testing Setup

- Uses Jest with TypeScript support via `ts-jest`
- **Test timeout**: 30 seconds (configured in `jest.config.cjs`)
- **Test configuration**: ESM support with proper TypeScript transformation
- **Test categories**:
  - Unit tests: Basic formatting and data processing
  - Integration tests: Real Nostr protocol interaction using ephemeral relay
- **Ephemeral relay**: `utils/ephemeral-relay.ts` provides in-memory Nostr relay for isolated testing
- Tests verify cryptographic signatures, event validation, and protocol compliance

## Key Dependencies

- `@modelcontextprotocol/sdk`: MCP server framework
- `snstr`: Core Nostr protocol implementation
- `light-bolt11-decoder`: Lightning invoice parsing for zaps
- `@nostr-dev-kit/ndk`: Additional Nostr functionality
- `ws`: WebSocket client for relay connections

## Important Development Guidelines

- **File modification preference**: Always prefer editing existing files over creating new ones
- **Documentation policy**: Never proactively create documentation files (*.md) or README files unless explicitly requested
- **MCP restart requirement**: After making changes and rebuilding, restart Claude Desktop or your IDE to pick up the changes
- **Testing workflow**: Always run tests after making changes to ensure nothing is broken