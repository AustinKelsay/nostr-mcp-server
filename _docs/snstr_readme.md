# SNSTR - Simple Nostr Software Toolkit for Retards

### Still Under Construction 🚧

SNSTR is a lightweight TypeScript library for interacting with the Nostr protocol. It provides a simple, easy-to-use API with minimal dependencies.

## Table of Contents

- [Features](#features)
- [Supported NIPs](#supported-nips)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Configuring Rate Limits](#configuring-rate-limits)
- [Documentation](#documentation)
- [Examples](#examples)
- [Testing](#testing)
- [Scripts](#scripts)
  - [Build Scripts](#build-scripts)
  - [Testing Scripts](#testing-scripts)
  - [Example Scripts](#example-scripts)
  - [Code Quality Scripts](#code-quality-scripts)
- [Development](#development)
- [Security](#security)
- [Release Process](#release-process)

## Features

### Core Functionality

- Event creation and signing with comprehensive validation
- Relay connections with automatic reconnect
- **RelayPool for multi-relay management** - Efficient connection pooling, automatic failover, and batch operations
- **Cross-relay event querying** - `fetchMany()` and `fetchOne()` methods for aggregated event retrieval
- Filter-based subscriptions
- Support for replaceable events (kinds 0, 3, 10000-19999)
- Support for addressable events (kinds 30000-39999)

### Advanced Features

- Encrypted messaging with both NIP-04 (AES-CBC) and NIP-44 (ChaCha20+HMAC)
- Identity verification with NIP-05 DNS-based identifiers
- Browser extension integration via NIP-07
- Remote signing capability via NIP-46
- Automatic subscription cleanup with `autoClose` option
- Lightning Zaps integration via NIP-57
- Threaded conversations via NIP-10
- Wallet connection via NIP-47
- Relay list metadata via NIP-65
- Built-in ephemeral relay for testing and development

## Supported NIPs

SNSTR currently implements the following Nostr Implementation Possibilities (NIPs):

- **NIP-01**: Basic protocol functionality with comprehensive event validation
- **NIP-02**: Contact List events and interactions (Kind 3)
- **NIP-04**: Encrypted direct messages using AES-CBC
- **NIP-05**: DNS identifier verification and relay discovery
- **NIP-07**: Browser extension integration for key management
- **NIP-09**: Event deletion requests for removing published events
- **NIP-10**: Text notes and threading metadata
- **NIP-11**: Relay Information Document for discovering relay capabilities
- **NIP-17**: Gift wrapped direct messages using NIP-44 encryption
- **NIP-19**: Bech32-encoded entities for human-readable identifiers
- **NIP-21**: URI scheme for nostr links
- **NIP-44**: Improved encryption with ChaCha20 and HMAC-SHA256 authentication
- **NIP-46**: Remote signing (bunker) support for secure key management
- **NIP-47**: Nostr Wallet Connect for secure wallet communication
- **NIP-50**: Search capability via `search` subscription filters
- **NIP-57**: Lightning Zaps protocol for Bitcoin payments via Lightning
- **NIP-65**: Relay List metadata for read/write relay preferences
- **NIP-66**: Relay discovery and liveness monitoring

For detailed information on each implementation, see the corresponding directories in the `src/` directory (e.g., `src/nip01/`, `src/nip04/`, etc.).

## Installation

```bash
# Install from npm (coming soon)
npm install snstr

# For now, clone and build locally:
git clone https://github.com/AustinKelsay/snstr.git
cd snstr
npm install
npm run build
```

**Note**: The library is currently in development and not yet published to npm. Use the local build method above until the first release is published.

## Basic Usage

```typescript
import { Nostr, RelayEvent } from "snstr";

async function main() {
  // Initialize with relays and connection timeout
  const client = new Nostr(["wss://relay.nostr.band"]);

  // Generate keypair
  const keys = await client.generateKeys();

  // Connect to relays
  await client.connectToRelays();

  // Set up event handlers
  client.on(RelayEvent.Connect, (relay) => {
    console.log(`Connected to ${relay}`);
  });

  // Publish a note
  const note = await client.publishTextNote("Hello, Nostr!");
  console.log(`Published note with ID: ${note?.id}`);

  // Subscribe to events
  const subIds = client.subscribe(
    [{ kinds: [1], limit: 10 }], // Filter for text notes
    (event, relay) => {
      console.log(`Received event from ${relay}:`, event);
    },
    undefined,
    { autoClose: true, eoseTimeout: 5000 },
  );

  // Query events from all relays
  const manyEvents = await client.fetchMany(
    [{ kinds: [1], authors: ["pubkey"], limit: 10 }],
    { maxWait: 5000 }
  );
  console.log(`Found ${manyEvents.length} events`);

  // Get the most recent event from all relays
  const latestEvent = await client.fetchOne(
    [{ kinds: [1], authors: ["pubkey"] }],
    { maxWait: 3000 }
  );
  if (latestEvent) {
    console.log("Latest event:", latestEvent.content);
  }

  // Cleanup
  setTimeout(() => {
    client.unsubscribe(subIds);
    client.disconnectFromRelays();
  }, 10000);
}

main().catch(console.error);
```

### Configuring Rate Limits

SNSTR includes built-in rate limiting to prevent abuse. Configure custom limits when creating a client:

```typescript
import { Nostr } from "snstr";

const client = new Nostr(["wss://relay.nostr.band"], {
  rateLimits: {
    subscribe: { limit: 100, windowMs: 60000 }, // 100 per minute (default: 50)
    publish: { limit: 200, windowMs: 60000 },   // 200 per minute (default: 100)
    fetch: { limit: 500, windowMs: 60000 }      // 500 per minute (default: 200)
  }
});

// Update limits dynamically
client.updateRateLimits({ subscribe: { limit: 150, windowMs: 30000 } });
```

See [NIP-01 documentation](src/nip01/README.md#rate-limiting) for detailed configuration options.

### Using RelayPool for Multi-Relay Management

```typescript
import { RelayPool, generateKeys, createEvent } from "snstr";

async function relayPoolExample() {
  // Initialize RelayPool with multiple relays
  const pool = new RelayPool([
    "wss://relay.nostr.band",
    "wss://nos.lol", 
    "wss://relay.damus.io"
  ]);

  // Generate keypair
  const keys = await generateKeys();

  // Publish to multiple relays simultaneously
  const event = createEvent({
    kind: 1,
    content: "Hello from RelayPool!",
    tags: [],
    privateKey: keys.privateKey
  });

  const publishPromises = pool.publish(
    ["wss://relay.nostr.band", "wss://nos.lol"], 
    event
  );
  const results = await Promise.all(publishPromises);

  // Subscribe across multiple relays with automatic failover
  const subscription = await pool.subscribe(
    ["wss://relay.nostr.band", "wss://nos.lol", "wss://relay.damus.io"],
    [{ kinds: [1], limit: 10 }],
    (event, relayUrl) => {
      console.log(`Event from ${relayUrl}:`, event.content);
    },
    () => {
      console.log("All relays finished sending stored events");
    }
  );

  // Query events synchronously from multiple relays
  const events = await pool.querySync(
    ["wss://relay.nostr.band", "wss://nos.lol"],
    { kinds: [1], limit: 5 },
    { timeout: 10000 }
  );
  console.log(`Retrieved ${events.length} events`);

  // Cleanup
  subscription.close();
  await pool.close();
}

relayPoolExample().catch(console.error);
```

### Event Querying with fetchMany and fetchOne

```typescript
import { Nostr } from "snstr";

async function queryExample() {
  const client = new Nostr(["wss://relay.nostr.band", "wss://nos.lol"]);
  await client.connectToRelays();

  // Fetch multiple events from all connected relays
  const events = await client.fetchMany(
    [
      { kinds: [1], authors: ["pubkey1", "pubkey2"], limit: 20 },
      { kinds: [0], authors: ["pubkey1"] } // Profile metadata
    ],
    { maxWait: 5000 } // Wait up to 5 seconds
  );
  
  console.log(`Retrieved ${events.length} events from all relays`);
  
  // Fetch the most recent single event
  const latestNote = await client.fetchOne(
    [{ kinds: [1], authors: ["pubkey1"] }],
    { maxWait: 3000 }
  );
  
  if (latestNote) {
    console.log("Latest note:", latestNote.content);
  }

  client.disconnectFromRelays();
}

queryExample().catch(console.error);
```

For more examples including encryption, relay management, and NIP-specific features, see the [examples directory](./examples/README.md).

### Custom WebSocket Implementation

SNSTR relies on `websocket-polyfill` when running in Node.js. If you want to provide your own `WebSocket` class (for example when using a different runtime), you can set it with `useWebSocketImplementation`:

```typescript
import { useWebSocketImplementation } from "snstr";
import WS from "isomorphic-ws";

useWebSocketImplementation(WS);
```

You can also reset back to the default implementation:

```typescript
import { resetWebSocketImplementation } from "snstr";

resetWebSocketImplementation();
```

**Note**: To run the custom WebSocket example (`npm run example:custom-websocket`), you need to install a WebSocket package first:

```bash
# Install the ws package (used in the example)
npm install ws
npm install --save-dev @types/ws

# Or use isomorphic-ws for cross-platform compatibility
npm install isomorphic-ws
```

## Documentation

The project is organized with detailed documentation for different components:

#### Core Documentation

- **[Test Documentation](tests/README.md)**: Overview of test organization and execution
- **[Examples Documentation](examples/README.md)**: Complete guide to examples for all features

#### NIP Documentation

- **[NIP-01](src/nip01/README.md)**: Basic protocol functionality
- **[NIP-02](src/nip02/README.md)**: Contact List recommendation
- **[NIP-04](src/nip04/README.md)**: Encrypted direct messages
- **[NIP-05](src/nip05/README.md)**: DNS identifier verification
- **[NIP-07](src/nip07/README.md)**: Browser extension integration
- **[NIP-09](src/nip09/README.md)**: Event deletion requests
- **[NIP-10](src/nip10/README.md)**: Text notes and threads
- **[NIP-11](src/nip11/README.md)**: Relay information document
- **[NIP-17](src/nip17/README.md)**: Gift wrapped direct messages
- **[NIP-19](src/nip19/README.md)**: Bech32-encoded entities
- **[NIP-21](src/nip21/README.md)**: URI scheme for nostr links
- **[NIP-44](src/nip44/README.md)**: Versioned encryption
- **[NIP-46](src/nip46/README.md)**: Remote signing protocol
- **[NIP-47](src/nip47/README.md)**: Nostr Wallet Connect
- **[NIP-50](src/nip50/README.md)**: Search capability
- **[NIP-57](src/nip57/README.md)**: Lightning Zaps
- **[NIP-65](src/nip65/README.md)**: Relay List metadata
- **[NIP-66](src/nip66/README.md)**: Relay discovery and liveness monitoring

#### Standardization Guidelines

- **[NIP Implementation Guide](src/NIP_STANDARDIZATION.md)**: Standards for implementing NIPs
- **[Test Standardization](tests/TEST_STANDARDIZATION.md)**: Guide for writing standardized tests
- **[Example Standardization](examples/EXAMPLE_STANDARDIZATION.md)**: Guide for creating standardized examples

## Examples

SNSTR includes comprehensive examples for all supported features and NIPs:

```bash
# Run the basic example
npm run example

# Run the direct messaging example
npm run example:dm  # Uses NIP-04 implementation

# Run additional basic examples
npm run example:verbose         # Verbose logging
npm run example:debug           # Debug logging
npm run example:custom-websocket # Custom WebSocket implementation
npm run example:crypto          # Cryptographic functions
npm run example:rate-limits     # Rate limit configuration demo

# Run NIP-01 examples
npm run example:nip01:event:ordering      # Event ordering demonstration
npm run example:nip01:event:addressable   # Addressable events
npm run example:nip01:event:replaceable   # Replaceable events
npm run example:nip01:relay:connection    # Relay connection management
npm run example:nip01:relay:pool          # RelayPool multi-relay demo
npm run example:nip01:relay:filters       # Filter types
npm run example:nip01:relay:auto-close    # Auto-unsubscribe example
npm run example:nip01:relay:query         # Pooled event queries
npm run example:nip01:relay:reconnect     # Relay reconnection
npm run example:nip01:validation          # NIP-01 validation flow

# Run other NIP-specific examples
npm run example:nip04  # Encrypted direct messages
npm run example:nip05  # DNS identifiers
npm run example:nip09  # Deletion requests
npm run example:nip19  # Bech32-encoded entities
npm run example:nip44  # Versioned encryption
npm run example:nip17  # Gift wrapped direct messages
npm run example:nip46  # Remote signing protocol
npm run example:nip50  # Search capability
npm run example:nip57  # Lightning Zaps
npm run example:nip65  # Relay list metadata
npm run example:nip66  # Relay discovery and monitoring

# Additional NIP-specific example variants
npm run example:nip07          # Browser extension (runs local server)
npm run example:nip07:build    # Build browser extension examples
npm run example:nip07:dm       # Browser extension direct message
npm run example:nip10          # Text Notes and Threads (see README)
npm run example:nip11          # Relay information
npm run example:nip19:bech32   # Basic Bech32 examples
npm run example:nip19:tlv      # TLV entity examples
npm run example:nip19:validation # Validation examples
npm run example:nip19:security # Security features
npm run example:nip21          # URI scheme
npm run example:nip44:js       # JavaScript version of NIP-44
npm run example:nip44:version-compat # Version compatibility
npm run example:nip44:test-vector    # Test vector validation
npm run example:nip46:minimal       # Minimal NIP-46 example
npm run example:nip46:basic         # Basic NIP-46 example
npm run example:nip46:advanced      # Advanced features
npm run example:nip46:from-scratch  # Implementation from scratch
npm run example:nip46:simple        # Simple client/server
npm run example:nip47:verbose       # Verbose wallet connect
npm run example:nip47:client-service # Client service example
npm run example:nip47:error-handling # Error handling
npm run example:nip47:expiration    # Request expiration
npm run example:nip57:client        # Zap client
npm run example:nip57:lnurl         # LNURL server simulation
npm run example:nip57:validation    # Invoice validation
```

For a full list of examples and detailed descriptions, see the [examples README](./examples/README.md).

## Testing

SNSTR includes a comprehensive test suite that uses an ephemeral relay to avoid external dependencies:

```bash
# Run all tests
npm test

# Run tests by category
npm run test:core     # Core functionality tests (NIP-01)
npm run test:crypto   # Encryption and crypto tests
npm run test:identity # Identity-related tests
npm run test:protocols # Protocol implementation tests

# Run tests for specific NIPs
npm run test:nip01    # NIP-01 (core protocol)
npm run test:nip02    # NIP-02 (Contact Lists)
npm run test:nip04    # NIP-04 (encrypted messages)
npm run test:nip44    # NIP-44 (versioned encryption)
npm run test:nip17    # NIP-17 (direct messaging)
npm run test:nip57    # NIP-57 (Lightning Zaps)
```

The test suite is organized by NIP number, with dedicated directories for each implemented NIP (e.g., `tests/nip01/`, `tests/nip04/`, etc.). This structure allows for focused testing of specific implementations while maintaining comprehensive coverage.

For more information about the test structure and methodology, see the [tests README](./tests/README.md).

## Scripts

SNSTR provides numerous npm scripts to help with development, testing, and running examples:

### Build Scripts

```bash
# Build the library
npm run build

# Build example files
npm run build:examples
```

### Testing Scripts

```bash
# Run all tests
npm test

# Run tests with watch mode
npm run test:watch

# Generate code coverage report
npm run test:coverage

# Test by category
npm run test:core          # Core functionality (NIP-01)
npm run test:crypto        # All crypto (utils/crypto + NIP-04 + NIP-44)
npm run test:identity      # Identity-related features (NIP-05, NIP-07, NIP-19)
npm run test:protocols     # Protocol implementations (NIP-46, NIP-47, NIP-57)
npm run test:integration   # Integration tests

# Test specific NIP-01 components
npm run test:nip01         # All NIP-01 tests
npm run test:nip01:event   # Event-related tests
npm run test:nip01:relay   # Relay-related tests
npm run test:nip01:relay:connection      # Relay connection tests
npm run test:nip01:relay:filter      # Relay filter tests
npm run test:nip01:relay:reconnect   # Relay reconnection tests
npm run test:nip01:relay:pool        # RelayPool tests
npm run test:nostr         # Nostr client
npm run test:event         # Event creation and validation
npm run test:event:ordering          # Event ordering tests
npm run test:event:addressable       # Addressable events tests
npm run test:event:all               # All event tests
npm run test:relay         # Relay functionality
npm run test:crypto:core   # Core crypto utilities

# Test specific NIPs
npm run test:nip02         # NIP-02 (Contact Lists)
npm run test:nip04         # NIP-04 (Encrypted Direct Messages)
npm run test:nip05         # NIP-05 (DNS Identifiers)
npm run test:nip07         # NIP-07 (Browser Extensions)
npm run test:nip09         # NIP-09 (Event Deletion Requests)
npm run test:nip10         # NIP-10 (Text Notes and Threads)
npm run test:nip11         # NIP-11 (Relay Information)
npm run test:nip17         # NIP-17 (Direct Messages)
npm run test:nip19         # NIP-19 (Bech32 Entities)
npm run test:nip21         # NIP-21 (URI Scheme)
npm run test:nip44         # NIP-44 (Versioned Encryption)
npm run test:nip46         # NIP-46 (Remote Signing)
npm run test:nip47         # NIP-47 (Wallet Connect)
npm run test:nip50         # NIP-50 (Search Capability)
npm run test:nip57         # NIP-57 (Lightning Zaps)
npm run test:nip65         # NIP-65 (Relay List Metadata)
npm run test:nip66         # NIP-66 (Relay Discovery)
```

### Example Scripts

```bash
# Run the basic example
npm run example

# Run with different logging levels
npm run example:verbose    # Verbose logging
npm run example:debug      # Debug logging

# NIP-01 examples
npm run example:nip01:event:ordering     # Event ordering demonstration
npm run example:nip01:event:addressable  # Addressable events
npm run example:nip01:event:replaceable  # Replaceable events
npm run example:nip01:relay:connection   # Relay connection management
npm run example:nip01:relay:pool        # RelayPool multi-relay demo
npm run example:nip01:relay:filters      # Filter types
npm run example:nip01:relay:query        # Pooled event queries
npm run example:nip01:relay:reconnect    # Relay reconnection
npm run example:nip01:validation         # NIP-01 validation flow

# Example categories
npm run example:basic      # Basic functionality (core, crypto, direct messages)
npm run example:messaging  # Messaging examples (DM, NIP-04, NIP-44)
npm run example:identity   # Identity examples (NIP-05, NIP-07, NIP-19)
npm run example:payments   # Payment examples (NIP-47, NIP-57)
npm run example:advanced   # Advanced protocol examples (NIP-46, error handling)

# Feature-specific examples
npm run example:crypto     # Cryptographic functions
npm run example:dm         # Direct messaging (NIP-04)

# NIP-specific examples
npm run example:nip02      # Contact Lists (NIP-02)
npm run example:nip04      # Encrypted direct messages (NIP-04)
npm run example:nip05      # DNS identifiers (NIP-05)
npm run example:nip07      # Browser extensions (NIP-07)
npm run example:nip09      # Deletion requests (NIP-09)
npm run example:nip10      # Text notes and threads (NIP-10)
npm run example:nip11      # Relay information (NIP-11)
npm run example:nip21      # URI scheme (NIP-21)
npm run example:nip17      # Gift wrapped direct messages (NIP-17)
npm run example:nip19      # Bech32-encoded entities (NIP-19)
npm run example:nip44      # Versioned encryption (NIP-44)
npm run example:nip46      # Remote signing protocol (NIP-46)
npm run example:nip47      # Wallet connect (NIP-47)
npm run example:nip50      # Search capability (NIP-50)
npm run example:nip57      # Lightning zaps (NIP-57)
npm run example:nip65      # Relay list metadata (NIP-65)
npm run example:nip66      # Relay discovery and monitoring (NIP-66)
```

### Code Quality Scripts

```bash
# Run linting
npm run lint

# Format code with Prettier
npm run format
```

For a complete list of available scripts, see the `scripts` section in `package.json`.

## Development

```bash
# Build the project
npm run build

# Build examples
npm run build:examples

# Run linting
npm run lint

# Format code
npm run format
```

### Directory Structure Notes

- **Source Code**: All NIP implementations follow the `src/nipXX` naming pattern (lowercase)
- **Core Protocol**: NIP-01 is implemented in the `src/nip01/` directory with specialized files:
  - `event.ts`: Event creation, validation, and utilities
  - `nostr.ts`: Main Nostr client implementation
  - `relay.ts`: Relay connection and subscription management
  - `relayPool.ts`: Multi-relay pool management
- **Examples**: Organized by NIP in `examples/nipXX` directories
  - NIP-01 examples further divided into `event/` and `relay/` subdirectories
  - Client-specific examples in `examples/client`
- **Tests**: Organized by NIP in `tests/nipXX` directories
- For more details on code organization standards, see the [NIP Implementation Guide](src/NIP_STANDARDIZATION.md)

## Security

SNSTR implements robust security features throughout the codebase:

- **Comprehensive Event Validation**: Full verification of event signatures and structure
- **Secure Key Generation**: Safe private key generation within the secp256k1 curve limits
- **NIP-19 Security**: Relay URL validation and filtering to prevent injection attacks
- **NIP-44 Encryption**: Authenticated encryption with ChaCha20 and HMAC-SHA256
- **Input Validation**: Thorough validation and error checking across all components

For details on security considerations for specific NIPs, see the documentation in each implementation folder.

## Release Process

SNSTR uses GitHub Actions for continuous integration and automated releases.

### Automated Workflow

The project includes a GitHub Actions workflow that:

1. **Builds and tests** the library on multiple Node.js versions (16.x, 18.x, 20.x)
2. **Runs linting** to ensure code quality
3. **Executes all tests** with coverage reports
4. **Builds the main library** and examples
5. **Creates releases** when triggered by version tags or manual dispatch

### Creating a Release

There are two ways to trigger a release:

#### Option 1: Manual Release via GitHub Actions

1. Go to the "Actions" tab in the GitHub repository
2. Select the "Build, Test, and Release" workflow
3. Click "Run workflow"
4. Choose the release type (patch, minor, or major)
5. Click "Run workflow" to start the process

This will:

- Bump the version in package.json
- Create a git tag
- Build the project
- Create a GitHub Release
- Publish to npm (if configured with NPM_TOKEN)

#### Option 2: Manual Tag Creation

1. Update the version in package.json locally
2. Create and push a git tag:
   ```bash
   git tag -a v0.1.1 -m "Release v0.1.1"
   git push origin v0.1.1
   ```
3. The GitHub Actions workflow will automatically create a release

### Release Prerequisites

To enable npm publishing, you need to:

1. Add your NPM_TOKEN to repository secrets
2. Ensure you have proper access to the npm package name