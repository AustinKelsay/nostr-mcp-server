# NIP-05: DNS-Based Internet Identifiers

This module implements [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md), which defines a protocol for mapping human-readable identifiers to Nostr public keys.

## Overview

NIP-05 allows users to verify ownership of a domain name or subdomain and associate it with their Nostr public key. It works by hosting a `.well-known/nostr.json` file on a web server, containing mappings from local-parts to public keys.

## Key Features

- 🔍 **Verification**: Verify that a NIP-05 identifier matches a given public key
- 🌐 **Lookup**: Get the public key for a given NIP-05 identifier
- 🔑 **Key Retrieval**: Extract just the public key from a NIP-05 identifier
- 📡 **Relay Discovery**: Get recommended relays associated with a NIP-05 identifier
- 🔒 **Security**: Enforces TLS certificate validation for secure connections

## Basic Usage

### Verifying an Identifier

```typescript
import { verifyNIP05 } from 'snstr';

// Check if an identifier matches a public key
const isValid = await verifyNIP05(
  'name@example.com',
  '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
);

if (isValid) {
  console.log('Identifier matches the public key!');
} else {
  console.log('Verification failed.');
}
```

### Looking Up an Identifier

```typescript
import { lookupNIP05 } from 'snstr';

// Get the full response for a NIP-05 identifier
const response = await lookupNIP05('name@example.com');

if (response) {
  console.log('Public key:', response.names['name']);
  
  // Check for associated relays
  if (response.relays) {
    for (const [pubkey, relayList] of Object.entries(response.relays)) {
      console.log(`Relays for ${pubkey}:`, relayList);
    }
  }
}
```

### Getting a Public Key from an Identifier

```typescript
import { getNIP05PubKey } from 'snstr';

// Get just the public key for a NIP-05 identifier
const pubkey = await getNIP05PubKey('name@example.com');

if (pubkey) {
  console.log('Found public key:', pubkey);
} else {
  console.log('Could not find public key for this identifier.');
}
```

### Discovering Relays for a User

```typescript
import { getNIP05Relays } from 'snstr';

// Get recommended relays for a NIP-05 identifier
const relays = await getNIP05Relays('name@example.com', 'public_key_hex');

if (relays) {
  console.log('Recommended relays:', relays);
} else {
  console.log('No relays found for this identifier.');
}

// Always provide the pubkey when retrieving relays
const pubkey = await getNIP05PubKey('name@example.com');
if (pubkey) {
  const verifiedRelays = await getNIP05Relays('name@example.com', pubkey);
  console.log('Relays for verified pubkey:', verifiedRelays);
}
```

## Implementation Details

- Uses a secure HTTPS GET request with TLS certificate validation
- Handles identifiers case-insensitively for improved user experience
- Provides appropriate error handling for malformed responses
- Includes type checking to ensure responses match the expected format
- Works across both browser and Node.js environments

## Security Considerations

- Always verify that the NIP-05 identifier matches the expected public key before trusting messages
- TLS certificate validation is enforced to prevent man-in-the-middle attacks
- Remember that NIP-05 depends on DNS and HTTPS, which may be compromised or censored
- Treat NIP-05 as a helpful hint for human-readable identifiers, not as a cryptographic proof of identity 