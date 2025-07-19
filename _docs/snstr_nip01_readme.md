# NIP-01: Basic Protocol Flow Specification

This directory contains the implementation of [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), which defines the core protocol functionality of Nostr.

## Overview

NIP-01 is the foundational specification for Nostr, outlining the basic protocol flow, event format, relay communication, and subscription mechanism. This implementation provides a complete client and relay interface with comprehensive validation for Nostr events.

## Key Features

- ✅ **Event Creation and Validation**: Full support for creating, signing, and validating Nostr events
- ✅ **Relay Communication**: WebSocket-based connection management with automatic reconnection
- ✅ **Subscription Management**: Rich filter-based subscription system
- ✅ **Timestamp Verification**: Event timestamp validation with configurable drift tolerance
- ✅ **Ephemeral Relay**: Built-in relay implementation for testing and development

## Basic Usage

### Creating and Publishing Events

```typescript
import { Nostr } from 'snstr';

// Initialize client with relays
const client = new Nostr(['wss://relay.nostr.band']);

// Generate or import keys
const keys = await client.generateKeys();
// or
const keys = client.importKeys('privateKeyHex');

// Connect to relays
await client.connectToRelays();

// Publish a text note
const event = await client.publishTextNote('Hello, Nostr!');
console.log(`Published event with ID: ${event.id}`);
```

### Subscribing to Events

```typescript
import { Nostr, RelayEvent } from 'snstr';

const client = new Nostr(['wss://relay.nostr.band']);

// Connect to relays
await client.connectToRelays();

// Set up connection event handlers
client.on(RelayEvent.Connect, (relay) => {
  console.log(`Connected to ${relay}`);
});

// Subscribe with filters
const subIds = client.subscribe(
  [{ kinds: [1], limit: 10 }], // Filter for text notes, limited to 10
  (event, relay) => {
    console.log(`Received event from ${relay}:`, event);
  }
);

// Later, unsubscribe
client.unsubscribe(subIds);
```

### Querying Events Across Relays

```typescript
import { Nostr } from 'snstr';

const client = new Nostr(['wss://relay.nostr.band', 'wss://nos.lol']);
await client.connectToRelays();

// Fetch multiple events from all connected relays
const events = await client.fetchMany(
  [
    { kinds: [1], authors: ['pubkey1'], limit: 10 },
    { kinds: [0], authors: ['pubkey1'] } // Profile metadata
  ],
  { maxWait: 5000 } // Maximum wait time in milliseconds
);

console.log(`Retrieved ${events.length} events`);

// Fetch the most recent single event matching filters
const latestEvent = await client.fetchOne(
  [{ kinds: [1], authors: ['pubkey1'] }],
  { maxWait: 3000 }
);

if (latestEvent) {
  console.log('Latest event:', latestEvent.content);
}
```

#### Key Features of fetchMany and fetchOne

- **Cross-relay aggregation**: Automatically queries all connected relays and deduplicates results
- **Timeout handling**: Configurable `maxWait` option prevents hanging queries (defaults to 5000ms)
- **Event ordering**: `fetchOne` returns the newest event based on `created_at` timestamp
- **Automatic cleanup**: Subscriptions are automatically closed after completion
- **Error resilience**: Individual relay failures don't affect the overall query

### Working with Events Directly

```typescript
import { createEvent } from 'snstr';
import { validateEvent } from 'snstr/nip01/event';

// Create an event
const event = createEvent({
  kind: 1,
  content: 'Hello, world!',
  tags: [['p', 'pubkeyHex', 'recommended relay URL']],
  privateKey: 'privateKeyHex'
});

// Verify an event
const isValid = await validateEvent(event);
```

## Implementation Details

### Files in this Directory

- **event.ts**: Event creation, validation, and utility functions
- **nostr.ts**: Main Nostr client implementation
- **relay.ts**: Relay connection and subscription management

### Event Validation

This implementation enforces strict validation rules:

1. Event IDs are verified against the serialized event content
2. Signatures are verified against the event ID and public key
3. Timestamps are validated with configurable drift allowance
4. Content and tag format validation based on event kinds

### WebSocket Management

The relay connection includes:

1. Automatic reconnection with configurable backoff
2. Connection pooling for efficient relay communication
3. Message queue for handling offline scenarios
4. Proper subscription management across reconnects

### RelayPool Management

The `RelayPool` class provides advanced multi-relay management with intelligent connection handling, automatic failover, and efficient resource management.

#### Key Features

- **Dynamic Relay Management**: Add and remove relays at runtime
- **Connection Pooling**: Efficient connection reuse and management
- **Automatic Failover**: Graceful handling of relay failures
- **Batch Operations**: Publish and query across multiple relays simultaneously
- **Resource Cleanup**: Proper connection cleanup and memory management

#### Basic RelayPool Usage

```typescript
import { RelayPool } from 'snstr/nip01/relayPool';
import { createEvent } from 'snstr';

// Initialize with multiple relays
const pool = new RelayPool([
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.damus.io'
]);

// Add additional relays dynamically
pool.addRelay('wss://relay.snort.social');

// Publish to multiple relays
const event = createEvent({
  kind: 1,
  content: 'Hello from RelayPool!',
  tags: [],
  privateKey: 'your-private-key'
});

const publishPromises = pool.publish(['wss://relay.nostr.band', 'wss://nos.lol'], event);
const results = await Promise.all(publishPromises);

// Subscribe across multiple relays
const subscription = await pool.subscribe(
  ['wss://relay.nostr.band', 'wss://nos.lol'],
  [{ kinds: [1], limit: 10 }],
  (event, relayUrl) => {
    console.log(`Received event from ${relayUrl}:`, event);
  },
  () => {
    console.log('All relays finished sending stored events');
  }
);

// Query for events synchronously
const events = await pool.querySync(
  ['wss://relay.nostr.band', 'wss://nos.lol'],
  { kinds: [1], authors: ['pubkey'], limit: 5 },
  { timeout: 10000 }
);

// Get a single event (most recent)
const latestEvent = await pool.get(
  ['wss://relay.nostr.band', 'wss://nos.lol'],
  { kinds: [1], authors: ['pubkey'] },
  { timeout: 5000 }
);

// Cleanup
await pool.close();
```

#### Advanced RelayPool Configuration

```typescript
import { RelayPool, RemoveRelayResult } from 'snstr/nip01/relayPool';

// Initialize with connection options
const pool = new RelayPool(
  ['wss://relay.nostr.band'],
  {
    relayOptions: {
      connectionTimeout: 10000,
      autoReconnect: true,
      maxReconnectAttempts: 5,
      maxReconnectDelay: 30000,
      bufferFlushDelay: 1000
    }
  }
);

// Add relay with specific options
const relay = pool.addRelay('wss://nos.lol', {
  connectionTimeout: 5000,
  autoReconnect: false
});

// Ensure relay connection
const connectedRelay = await pool.ensureRelay('wss://relay.damus.io');

// Remove relay with error handling
const removeResult = pool.removeRelay('wss://invalid-relay.com');
switch (removeResult) {
  case RemoveRelayResult.Removed:
    console.log('Relay successfully removed');
    break;
  case RemoveRelayResult.NotFound:
    console.log('Relay was not in the pool');
    break;
  case RemoveRelayResult.InvalidUrl:
    console.log('Invalid relay URL provided');
    break;
}

// Close specific relays
await pool.close(['wss://relay.nostr.band', 'wss://nos.lol']);
```

#### Error Handling and Resilience

```typescript
import { RelayPool } from 'snstr/nip01/relayPool';

const pool = new RelayPool([
  'wss://relay.nostr.band',
  'wss://invalid-relay.com', // This will fail gracefully
  'wss://nos.lol'
]);

// Subscribe with error handling
const subscription = await pool.subscribe(
  ['wss://relay.nostr.band', 'wss://invalid-relay.com', 'wss://nos.lol'],
  [{ kinds: [1], limit: 10 }],
  (event, relayUrl) => {
    console.log(`Event from ${relayUrl}:`, event);
  },
  () => {
    console.log('EOSE received from all successful relays');
  }
);

// Query with timeout and error handling
try {
  const events = await pool.querySync(
    ['wss://relay.nostr.band', 'wss://unreliable-relay.com'],
    { kinds: [1], limit: 5 },
    { timeout: 5000 } // 5 second timeout
  );
  console.log(`Retrieved ${events.length} events`);
} catch (error) {
  console.error('Query failed:', error);
}

// Cleanup
subscription.close();
await pool.close();
```

#### RelayPool vs Direct Relay Usage

Use RelayPool when you need:
- **Multi-relay operations**: Publishing or querying across multiple relays
- **Automatic failover**: Resilience against individual relay failures  
- **Dynamic relay management**: Adding/removing relays at runtime
- **Batch operations**: Efficient handling of multiple relay connections
- **Resource management**: Automatic cleanup and connection pooling

Use direct Relay class when you need:
- **Single relay focus**: Working with one specific relay
- **Fine-grained control**: Detailed control over individual relay behavior
- **Custom connection handling**: Specific reconnection or error handling logic

## Rate Limiting

SNSTR includes built-in rate limiting to prevent abuse and DoS attacks on Nostr relays. Rate limits are enforced on three main operations: subscriptions, publishes, and fetch operations.

### Default Rate Limits

- **Subscriptions**: 50 per minute
- **Publishes**: 100 per minute  
- **Fetches**: 200 per minute

### Configuring Rate Limits

#### Basic Configuration

```typescript
import { Nostr, NostrOptions } from 'snstr';

const options: NostrOptions = {
  rateLimits: {
    subscribe: { limit: 100, windowMs: 60000 }, // 100 subscriptions per minute
    publish: { limit: 200, windowMs: 60000 },   // 200 publishes per minute
    fetch: { limit: 500, windowMs: 60000 }      // 500 fetches per minute
  }
};

const client = new Nostr(['wss://relay.nostr.band'], options);
```

#### Partial Configuration

You can configure only specific limits; unspecified limits will use defaults:

```typescript
const client = new Nostr(['wss://relay.nostr.band'], {
  rateLimits: {
    subscribe: { limit: 200, windowMs: 30000 } // Only configure subscriptions
    // publish and fetch will use default limits
  }
});
```

#### Custom Time Windows

Adjust the time window for different use cases:

```typescript
const client = new Nostr(['wss://relay.nostr.band'], {
  rateLimits: {
    subscribe: { limit: 10, windowMs: 5000 },   // 10 per 5 seconds
    publish: { limit: 50, windowMs: 30000 },    // 50 per 30 seconds
    fetch: { limit: 100, windowMs: 10000 }      // 100 per 10 seconds
  }
});
```

### Dynamic Rate Limit Management

#### Getting Current Configuration

```typescript
const currentLimits = client.getRateLimits();
console.log('Current rate limits:', currentLimits);
// Output: { subscribe: { limit: 50, windowMs: 60000 }, ... }
```

#### Updating Limits at Runtime

```typescript
// Update specific limits
client.updateRateLimits({
  subscribe: { limit: 300, windowMs: 60000 },
  fetch: { limit: 1000, windowMs: 120000 }
});

// Partial updates are supported
client.updateRateLimits({
  publish: { limit: 150, windowMs: 45000 }
});
```

#### Resetting Rate Limit Counters

```typescript
// Reset all rate limit counters
client.resetRateLimits();

// Useful when you want to clear the current usage without waiting for the window to expire
```

### Rate Limit Error Handling

When rate limits are exceeded, a `SecurityValidationError` is thrown:

```typescript
import { Nostr } from 'snstr';

const client = new Nostr(['wss://relay.nostr.band'], {
  rateLimits: {
    subscribe: { limit: 1, windowMs: 60000 } // Very restrictive for demo
  }
});

await client.connectToRelays();

try {
  // First subscription works
  client.subscribe([{ kinds: [1], limit: 10 }], (event) => {
    console.log('Event:', event);
  });
  
  // Second subscription will be rate limited
  client.subscribe([{ kinds: [1], limit: 10 }], (event) => {
    console.log('Event:', event);
  });
} catch (error) {
  if (error.name === 'SecurityValidationError') {
    console.error('Rate limit exceeded:', error.message);
    // Handle rate limiting gracefully
  }
}
```

### Common Rate Limiting Scenarios

#### High-Frequency Applications

For applications that need to make many requests quickly:

```typescript
const client = new Nostr(['wss://relay.nostr.band'], {
  rateLimits: {
    subscribe: { limit: 500, windowMs: 60000 },
    publish: { limit: 300, windowMs: 60000 },
    fetch: { limit: 1000, windowMs: 60000 }
  }
});
```

#### Conservative/Public Services

For public services or when you want to be conservative:

```typescript
const client = new Nostr(['wss://relay.nostr.band'], {
  rateLimits: {
    subscribe: { limit: 20, windowMs: 60000 },
    publish: { limit: 30, windowMs: 60000 },
    fetch: { limit: 50, windowMs: 60000 }
  }
});
```

#### Development/Testing

For development where you want more permissive limits:

```typescript
const client = new Nostr(['wss://relay.nostr.band'], {
  rateLimits: {
    subscribe: { limit: 1000, windowMs: 60000 },
    publish: { limit: 1000, windowMs: 60000 },
    fetch: { limit: 2000, windowMs: 60000 }
  }
});
```

### Rate Limiting with RelayPool

RelayPool uses the same rate limiting mechanism, applied per operation across all relays:

```typescript
import { RelayPool } from 'snstr/nip01/relayPool';

const pool = new RelayPool(
  ['wss://relay.nostr.band', 'wss://nos.lol'],
  {
    rateLimits: {
      subscribe: { limit: 100, windowMs: 60000 }
    }
  }
);

// Rate limits apply to the total operations across all relays
await pool.subscribe(
  ['wss://relay.nostr.band', 'wss://nos.lol'], // 2 relays
  [{ kinds: [1], limit: 10 }], // Each relay gets the same subscription
  (event, relayUrl) => console.log(`Event from ${relayUrl}`)
);
// This counts as 2 subscription operations against the rate limit
```

### Best Practices

1. **Set Appropriate Limits**: Configure limits based on your application's actual needs
2. **Handle Errors Gracefully**: Always catch and handle `SecurityValidationError` exceptions
3. **Monitor Usage**: Use `getRateLimits()` to monitor current configuration
4. **Reset When Needed**: Use `resetRateLimits()` sparingly, typically only in error recovery scenarios
5. **Consider Relay Policies**: Some relays may have their own rate limiting independent of client-side limits

## Security Considerations

- Private keys are never exposed outside the library
- Event validation follows NIP-01 requirements strictly
- All inputs are validated to prevent injection attacks
- WebSocket connections are properly managed to prevent leaks
- Rate limiting prevents accidental DoS attacks on relays

## Advanced Usage

### Custom Event Handlers

```typescript
import { Nostr, RelayEvent } from 'snstr';

const client = new Nostr(['wss://relay.nostr.band']);

// Handle various relay events
client.on(RelayEvent.Connect, (relay) => {
  console.log(`Connected to ${relay}`);
});

client.on(RelayEvent.Disconnect, (relay) => {
  console.log(`Disconnected from ${relay}`);
});

client.on(RelayEvent.Error, (relay, error) => {
  console.error(`Error from ${relay}:`, error);
});

client.on(RelayEvent.Notice, (relay, message) => {
  console.log(`Notice from ${relay}:`, message);
});
```

### Custom Filters

```typescript
import { Nostr } from 'snstr';

const client = new Nostr(['wss://relay.nostr.band']);
await client.connectToRelays();

// Complex filtering
const subIds = client.subscribe([
  { 
    kinds: [1], 
    authors: ['pubkey1', 'pubkey2'],
    since: Math.floor(Date.now() / 1000) - 86400, // Last 24 hours
    limit: 50
  },
  {
    kinds: [3], // Contact lists
    authors: ['pubkey1']
  }
], (event) => {
  console.log('Received event:', event);
});
``` 