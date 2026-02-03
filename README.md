# Nostr MCP Server

[![npm version](https://badge.fury.io/js/nostr-mcp-server.svg)](https://www.npmjs.com/package/nostr-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server that provides Nostr capabilities to LLMs like Claude.

https://github.com/user-attachments/assets/1d2d47d0-c61b-44e2-85be-5985d2a81c64

## Features

This server implements 17 tools for interacting with the Nostr network:

### Reading & Querying Tools
1. `getProfile`: Fetches a user's profile information by public key
2. `getKind1Notes`: Fetches text notes (kind 1) authored by a user
3. `getLongFormNotes`: Fetches long-form content (kind 30023) authored by a user
4. `getReceivedZaps`: Fetches zaps received by a user, including detailed payment information
5. `getSentZaps`: Fetches zaps sent by a user, including detailed payment information
6. `getAllZaps`: Fetches both sent and received zaps for a user, clearly labeled with direction and totals

### Identity & Profile Management Tools
7. `createKeypair`: Generate new Nostr keypairs in hex and/or npub/nsec format
8. `createProfile`: Create a new Nostr profile (kind 0 event) with metadata
9. `updateProfile`: Update an existing Nostr profile with new metadata

### Note Creation & Publishing Tools
10. `prepareNoteEvent`: Create unsigned kind 1 note events with specified content and tags (Step 1 of manual flow)
11. `signNote`: Sign note events with a private key, generating cryptographically valid signatures (Step 2 of manual flow)
12. `publishNote`: Publish signed notes to specified Nostr relays (Step 3 of manual flow)
13. `postNote`: All-in-one authenticated note posting using an existing private key (Recommended for simple posting)

### Anonymous Tools
14. `sendAnonymousZap`: Prepare an anonymous zap to a profile or event, generating a lightning invoice for payment
15. `postAnonymousNote`: Post an anonymous note using a randomly generated one-time keypair

### NIP-19 Entity Tools
16. `convertNip19`: Convert between different NIP-19 entity formats (hex, npub, nsec, note, nprofile, nevent, naddr)
17. `analyzeNip19`: Analyze and decode any NIP-19 entity to understand its type and contents

All tools fully support both hex public keys and npub format, with user-friendly display of Nostr identifiers.

## Installation

### Option 1: Install from npm (Recommended)

```bash
npm install -g nostr-mcp-server
```

### Option 2: Install from source (using Bun - Recommended)

```bash
# Clone the repository
git clone https://github.com/austinkelsay/nostr-mcp-server.git
cd nostr-mcp-server

# Install dependencies
bun install

# Build the project
bun run build
```

### Option 3: Install from source (using npm)

```bash
# Clone the repository
git clone https://github.com/austinkelsay/nostr-mcp-server.git
cd nostr-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Connecting to Claude for Desktop

1. Make sure you have [Claude for Desktop](https://claude.ai/desktop) installed and updated to the latest version.

2. Configure Claude for Desktop by editing or creating the configuration file:

   For macOS:
   ```bash
   vim ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

   For Windows:
   ```bash
   notepad %AppData%\Claude\claude_desktop_config.json
   ```

3. Add the Nostr server to your configuration:

   **If installed via npm:**
   ```json
   {
       "mcpServers": {
           "nostr": {
               "command": "npx",
               "args": [
                   "nostr-mcp-server"
               ]
           }
       }
   }
   ```

   **If installed from source:**
   ```json
   {
       "mcpServers": {
           "nostr": {
               "command": "node",
               "args": [
                   "/ABSOLUTE/PATH/TO/nostr-mcp-server/build/index.js"
               ]
           }
       }
   }
   ```

   For source installations, replace `/ABSOLUTE/PATH/TO/` with the actual path to your project.

4. Restart Claude for Desktop.

## Connecting to Cursor

1. Make sure you have [Cursor](https://cursor.sh/) installed and updated to the latest version.

2. Configure Cursor by creating or editing the configuration file:

   For macOS:
   ```bash
   vim ~/.cursor/config.json
   ```

   For Windows:
   ```bash
   notepad %USERPROFILE%\.cursor\config.json
   ```

3. Add the Nostr server to your configuration:

   **If installed via npm:**
   ```json
   {
       "mcpServers": {
           "nostr": {
               "command": "npx",
               "args": [
                   "nostr-mcp-server"
               ]
           }
       }
   }
   ```

   **If installed from source:**
   ```json
   {
       "mcpServers": {
           "nostr": {
               "command": "node",
               "args": [
                   "/ABSOLUTE/PATH/TO/nostr-mcp-server/build/index.js"
               ]
           }
       }
   }
   ```

   For source installations, replace `/ABSOLUTE/PATH/TO/` with the actual path to your project.

4. Restart Cursor.

## Connecting to Goose

1. Make sure you have [Goose](https://github.com/block/goose) installed and properly configured.

2. Add the Nostr MCP server to your Goose configuration:

   Open your Goose configuration file (typically `~/.config/goose/profiles.yaml`) and add the following to your profile's `mcpServers` section:

   **If installed via npm:**
   ```yaml
   profiles:
     default:
       provider: # your existing provider config
       model: # your existing model config
       mcpServers:
         - name: nostr
           command: npx
           args:
             - nostr-mcp-server
   ```

   **If installed from source:**
   ```yaml
   profiles:
     default:
       provider: # your existing provider config
       model: # your existing model config
       mcpServers:
         - name: nostr
           command: node
           args:
             - /ABSOLUTE/PATH/TO/nostr-mcp-server/build/index.js
   ```

   For source installations, replace `/ABSOLUTE/PATH/TO/` with the actual path to your project.

3. Restart Goose or reload your configuration for the changes to take effect.

4. You can verify the MCP server is connected by asking Goose:
   ```
   What MCP tools do you have available for Nostr?
   ```

## Usage in Claude

Once configured, you can ask Claude to use the Nostr tools by making requests like:

### Reading & Querying
- "Show me the profile information for npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8"
- "What are the recent posts from npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8?"
- "Show me the long-form articles from npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8"
- "How many zaps has npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8 received?"
- "Show me the zaps sent by npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8"
- "Show me all zaps (both sent and received) for npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8"

### Identity & Profile Management
- "Generate a new Nostr keypair for me"
- "Create a keypair in both hex and npub format"
- "Create a new profile with name 'Alice' and about 'Bitcoiner and developer'"
- "Update my profile with picture 'https://example.com/avatar.jpg' and website 'https://alice.dev'"

### Note Creation & Publishing
- "Prepare a note event with content 'Hello Nostr!' and tags #intro #nostr"
- "Sign this note event with my private key nsec1xyz..."
- "Publish this signed note to wss://relay.damus.io and wss://nos.lol"
- "Post a note saying 'GM Nostr! ☀️' using my private key nsec1xyz..."

### Anonymous Operations
- "Send an anonymous zap of 100 sats to npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8"
- "Send 1000 sats to note1abcdef... with a comment saying 'Great post!'"
- "Post an anonymous note saying 'Hello Nostr world!'"
- "Create an anonymous post with tags #bitcoin and #nostr"

### NIP-19 Entity Conversion & Analysis
- "Convert this hex pubkey to npub: 06639334b39dd9cf4aa1323375931bec1d6cd43b5de30af7b70b08262e5f6e3f"
- "Convert npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8 to hex format"
- "Convert this note ID to nevent format with relay hints"
- "What type of entity is nprofile1qqsw3dy8cpu...? Analyze it for me"
- "Decode and analyze this NIP-19 entity: nevent1qqs..."

The server automatically handles conversion between npub and hex formats, so you can use either format in your queries. Results are displayed with user-friendly npub identifiers.

## Anonymous Notes

The `postAnonymousNote` tool allows users to post notes to the Nostr network without revealing their identity. Key points about anonymous notes:

- The note will be published using a random one-time keypair generated just for this post
- The private key is never stored or saved anywhere - it's used only for signing the note
- You receive the public key and note ID in the response if you want to reference them
- You can optionally specify custom tags to include with your note
- By default, the note is published to several popular relays to ensure good propagation

Examples:
```
"Post an anonymous note saying 'Just trying out the anonymous posting feature!'"
"Create an anonymous note with the content 'Testing the Nostr anonymity features' and tags #test #anonymous"
"Post anonymously to Nostr: 'I can share thoughts without linking to my identity'"
```

For more control, you can specify custom relays:
```
"Post an anonymous note to relay wss://relay.damus.io saying 'Hello Nostr world!'"
```

This feature is useful for:
- Testing posts without affecting your main identity
- Sharing information anonymously
- Creating temporary or throwaway content

## Identity & Profile Management

The server provides comprehensive tools for managing Nostr identities and profiles:

### Keypair Generation
The `createKeypair` tool generates cryptographically secure Nostr keypairs using the secp256k1 curve. You can choose to receive keys in hex format, npub/nsec format, or both:

```
"Generate a new Nostr keypair in both hex and npub format"
"Create a keypair with only hex keys"
"Generate keys in npub format only"
```

### Profile Creation & Updates
Create and manage Nostr profiles (kind 0 events) with full metadata support:

- **Names & Bio**: Set display names, usernames, and about text
- **Media**: Add profile pictures and banners
- **Identity**: Configure NIP-05 identifiers for verification
- **Lightning**: Set up Lightning addresses (LUD-16) and LNURL (LUD-06) for payments
- **Web Presence**: Add personal websites and social links

Examples:
```
"Create a profile with name 'Alice', about 'Bitcoin developer', and picture 'https://example.com/alice.jpg'"
"Update my profile to add website 'https://alice.dev' and Lightning address 'alice@getalby.com'"
```

## Authenticated Note Posting

### Individual Note Operations
For advanced users who need granular control over the note creation process:

- **`prepareNoteEvent`**: Creates unsigned note events with your content and tags
- **`signNote`**: Signs note events with your private key
- **`publishNote`**: Publishes signed notes to your chosen relays

This modular approach allows for:
- Offline note creation and later signing
- Batch operations across multiple notes
- Integration with external signing workflows
- Publishing to different relay sets

### All-in-One Posting
The `postNote` tool provides a convenient single-command approach for authenticated posting:

```
"Post a note saying 'GM Nostr! ☀️' using my private key nsec1xyz..."
"Create a post with content 'Just shipped a new feature!' and tags #development #nostr"
"Post 'Beautiful sunset today 🌅' with tags #photography #nature to relay wss://relay.damus.io"
```

Key features:
- **Authenticated Identity**: Posts appear under your established Nostr identity
- **Format Flexibility**: Accepts both hex and nsec private key formats
- **Tag Support**: Add hashtags, mentions, and custom metadata
- **Relay Control**: Publish to specific relays or use defaults

## Advanced Usage

You can specify custom relays for any query:

- "Show me the profile for npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8 using relay wss://relay.damus.io"

You can also specify the number of notes or zaps to fetch:

- "Show me the latest 20 notes from npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8"

For anonymous zaps, you can include optional comments and specify the target type:

- "Send an anonymous zap of 500 sats to note1abcdef... with the comment 'Great post!'"
- "Send 1000 sats anonymously to nevent1qys... using relay wss://relay.damus.io"

For zap queries, you can enable extra validation and debugging:

- "Show me all zaps for npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8 with validation and debug enabled"

## Limitations

- The server has a default 8-second timeout for queries to prevent hanging
- Only public keys in hex format or npub format are supported
- Only a subset of relays is used by default

## Implementation Details

- Built with **[snstr](https://github.com/austinkelsay/snstr)** - a lightweight, modern TypeScript library for Nostr protocol implementation
- Native support for npub format using NIP-19 encoding/decoding
- NIP-57 compliant zap receipt detection with direction-awareness (sent/received/self)
- Advanced bolt11 invoice parsing with payment amount extraction
- Smart caching system for improved performance with large volumes of zaps
- Total sats calculations for sent/received/self zaps with net balance
- Optional NIP-57 validation for ensuring zap receipt integrity
- Anonymous zap support with lightning invoice generation
- Support for zapping profiles, events (note IDs), and replaceable events (naddr)
- Each tool call creates a fresh connection to the relays, ensuring reliable data retrieval
- Comprehensive test suite with clean execution and proper resource cleanup

## Anonymous Zaps

The `sendAnonymousZap` tool lets users send zaps without revealing their Nostr identity. Key points about anonymous zaps:

- The zap will appear to come from an anonymous user in the recipient's wallet
- The zap follows the NIP-57 protocol but without a sender signature
- The recipient can still receive the payment and any included message
- You can zap profiles (using npub/hex pubkey), specific events (using note/nevent/hex ID), or replaceable events (using naddr)
- The server generates a lightning invoice for payment that you can copy into your Lightning wallet

Examples:
```
"Send an anonymous zap of 100 sats to npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8"
"Send 1000 sats anonymously to note1abcdef... with the comment 'Great post!'"
```

The server fully validates LNURL services according to LNURL-pay (LUD-06) and Lightning Address (LUD-16) specifications, ensuring compatibility with various wallet implementations.

## Troubleshooting

- If queries time out, try increasing the `QUERY_TIMEOUT` value in the source code (currently 8 seconds)
- If no data is found, try specifying different relays that might have the data
- Check Claude's MCP logs for detailed error information

## Default Relays

The server uses the following relays by default:
- wss://relay.damus.io
- wss://relay.nostr.band
- wss://relay.primal.net
- wss://nos.lol
- wss://purplerelay.com
- wss://nostr.land

## Development

To modify or extend this server:

1. Edit the relevant file:
   - `index.ts`: Main server and tool registration
   - `profile/profile-tools.ts`: Identity management, keypair generation, profile creation ([Documentation](./profile/README.md))
   - `note/note-tools.ts`: Note creation, signing, publishing, and reading functionality ([Documentation](./note/README.md))
   - `zap/zap-tools.ts`: Zap-related functionality ([Documentation](./zap/README.md))
   - `utils/`: Shared utility functions
     - `constants.ts`: Global constants and relay configurations
     - `conversion.ts`: NIP-19 entity conversion utilities (hex/npub/nprofile/nevent/naddr)
     - `formatting.ts`: Output formatting helpers
     - `nip19-tools.ts`: NIP-19 entity conversion and analysis tools
     - `pool.ts`: Nostr connection pool management
     - `ephemeral-relay.ts`: In-memory Nostr relay for testing

2. Run `bun run build` (or `npm run build`) to compile

3. Restart Claude for Desktop or Cursor to pick up your changes

## Testing

We've implemented a comprehensive test suite using Bun's native test runner to test both basic functionality and integration with the Nostr protocol:

```bash
# Run all tests (using Bun - Recommended)
bun test

# Run a specific test file
bun test __tests__/basic.test.ts

# Run integration tests
bun test __tests__/integration.test.ts
```

The test suite includes:

### Unit Tests
- `basic.test.ts` - Tests simple profile formatting and zap receipt processing
- `profile-notes-simple.test.ts` - Tests profile and note data structures
- `profile-tools.test.ts` - Tests keypair generation, profile creation, and identity management
- `note-creation.test.ts` - Tests note creation, signing, and publishing workflows
- `note-tools-functions.test.ts` - Tests note formatting, creation, signing, and publishing functions
- `note-tools-unit.test.ts` - Unit tests for note formatting functions
- `profile-postnote.test.ts` - Tests authenticated note posting with existing private keys
- `zap-tools-simple.test.ts` - Tests zap processing and anonymous zap preparation
- `zap-tools-tests.test.ts` - Tests zap validation, parsing, and direction determination
- `nip19-conversion.test.ts` - Tests NIP-19 entity conversion and analysis (28 test cases)

### Integration Tests
- `integration.test.ts` - Tests interaction with an ephemeral Nostr relay including:
  - Publishing profile events
  - Creating and retrieving text notes
  - Publishing zap receipts
  - Filtering events

- `websocket-integration.test.ts` - Tests WebSocket communication with a Nostr relay:
  - Publishing events over WebSocket
  - Subscribing to events with filters
  - Managing multiple subscriptions
  - Closing subscriptions
  - Verifying that events with invalid signatures are rejected

### Test Infrastructure
- All integration tests use our `ephemeral-relay.ts` implementation—a fully functional in-memory Nostr relay
- Tests use **snstr** for cryptographic event signing and verification
- Clean test execution with proper resource cleanup and no console warnings
- Automated WebSocket connection management with timeout handling
- Isolated test environment requiring no external network connections

For more details about the test suite, see [__tests__/README.md](./__tests__/README.md).

## Codebase Organization

The codebase is organized into modules:
- Core server setup in `index.ts`
- Specialized functionality in dedicated directories:
  - [`profile/`](./profile/README.md): Identity management, keypair generation, and profile creation
  - [`note/`](./note/README.md): Note creation, signing, publishing, and reading functionality
  - [`zap/`](./zap/README.md): Zap handling and anonymous zapping
- Common utilities in the `utils/` directory

This modular structure makes the codebase more maintainable, reduces duplication, and enables easier feature extensions. For detailed information about each module's features and implementation, see their respective documentation.
