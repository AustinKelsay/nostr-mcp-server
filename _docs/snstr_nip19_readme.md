# NIP-19: Bech32-Encoded Entities

This module implements [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md), which defines human-readable encodings for Nostr entities using the Bech32 format.

## Overview

NIP-19 provides standardized human-friendly encodings for various Nostr entities like public keys, private keys, event IDs, and more complex structures like profiles, events, and addresses. These encodings use the Bech32 format which includes:

- Human-readable prefixes (e.g., `npub`, `nsec`, `note`)
- Error detection capabilities
- Consistent formatting across different types of entities

## Key Features

- 🔤 **Multiple Entity Types**: Support for all NIP-19 entities (npub, nsec, note, nprofile, nevent, naddr)
- 🔄 **Bi-directional Conversion**: Encode and decode all entity types
- ✅ **Validation**: Thorough validation for all entity formats
- 💼 **TLV Handling**: Support for Type-Length-Value data in complex entities
- 🛡️ **Error Handling**: Meaningful error messages for invalid inputs
- ⚡ **Performance**: Optimized for speed and memory efficiency

## Basic Usage

### Working with Public Keys

```typescript
import { encodePublicKey, decodePublicKey } from 'snstr';

// Convert a hex public key to npub format
const npub = encodePublicKey('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');
console.log(npub); // npub1...

// Convert an npub back to hex format
const pubkey = decodePublicKey(npub);
console.log(pubkey); // 3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d
```

### Working with Private Keys

```typescript
import { encodePrivateKey, decodePrivateKey } from 'snstr';

// Convert a hex private key to nsec format
const nsec = encodePrivateKey('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');
console.log(nsec); // nsec1...

// Convert an nsec back to hex format
const privkey = decodePrivateKey(nsec);
console.log(privkey); // 3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d
```

### Working with Note IDs

```typescript
import { encodeNoteId, decodeNoteId } from 'snstr';

// Convert a hex note ID to note format
const note = encodeNoteId('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');
console.log(note); // note1...

// Convert a note back to hex format
const noteId = decodeNoteId(note);
console.log(noteId); // 3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d
```

### Working with Complex Entities (TLV)

#### Profiles (nprofile)

```typescript
import { encodeProfile, decodeProfile, filterProfile } from 'snstr';

// Create a profile with relays
const profileData = {
  pubkey: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
  relays: ['wss://relay.example.com', 'wss://relay2.example.com']
};

// Encode the profile data
const nprofile = encodeProfile(profileData);
console.log(nprofile); // nprofile1...

// Decode the nprofile back to profile data
const decodedProfile = decodeProfile(nprofile);
console.log(decodedProfile);
// {
//   pubkey: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
//   relays: ['wss://relay.example.com', 'wss://relay2.example.com']
// }

// ⚠️ Security Note: Filter invalid relay URLs after decoding
const safeProfile = filterProfile(decodedProfile);
```

#### Events (nevent)

```typescript
import { encodeEvent, decodeEvent, filterEvent } from 'snstr';

// Create an event reference with relays and author
const eventData = {
  id: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
  relays: ['wss://relay.example.com'],
  author: 'pubkey_here',
  kind: 1
};

// Encode the event data
const nevent = encodeEvent(eventData);
console.log(nevent); // nevent1...

// Decode the nevent back to event data
const decodedEvent = decodeEvent(nevent);

// Apply security filtering
const safeEvent = filterEvent(decodedEvent);
```

#### Addresses (naddr)

```typescript
import { encodeAddress, decodeAddress, filterAddress } from 'snstr';

// Create an address for a parameterized replaceable event
const addressData = {
  identifier: 'profile',
  pubkey: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
  kind: 30023,
  relays: ['wss://relay.example.com']
};

// Encode the address data
const naddr = encodeAddress(addressData);
console.log(naddr); // naddr1...

// Decode the naddr back to address data
const decodedAddress = decodeAddress(naddr);

// Apply security filtering
const safeAddress = filterAddress(decodedAddress);
```

### Universal Decoder

```typescript
import { decode, filterEntity } from 'snstr';

// Decode any NIP-19 entity
const result = decode('npub1xxxxxx...');
console.log(result);
// {
//   type: 'npub',
//   data: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
// }

// For complex types, apply security filtering
const complexResult = decode('nprofile1...');
if (['nprofile', 'nevent', 'naddr'].includes(complexResult.type)) {
  const safeData = filterEntity(complexResult.data);
  // Use safeData...
}
```

## Implementation Details

- Uses the `@scure/base` library for Bech32 encoding and decoding
- Implements TLV (Type-Length-Value) encoding for complex entities
- Includes robust validation for relay URLs and other entity components
- Handles large bech32 strings with custom limits
- Optimized error handling with detailed error messages

## Security Considerations

When working with NIP-19 entities, keep these security considerations in mind:

### Decoding Security

The NIP-19 specification requires decoders to be permissive, which means our decoder will include potentially invalid URLs in the output. Always filter decoded entities to prevent security risks.

### Security Features

The SNSTR implementation includes several security enhancements:

1. **Size Constraints**:
   - Maximum of 20 TLV entries (reduced from the typical 100)
   - Maximum relay URL length: 512 characters
   - Maximum identifier length: 1024 characters
   - Default bech32 data limit: 5000 bytes

2. **URL Validation During Encoding**: 
   - Enforces `wss://` or `ws://` protocol
   - Rejects URLs with credentials (username/password)
   - Validates URL structure

### Security Utilities

The library provides built-in functions to help filter potentially malicious data:

```typescript
import { 
  isValidRelayUrl,   // Check a single URL
  filterProfile,     // Filter nprofile entities
  filterEvent,       // Filter nevent entities
  filterAddress,     // Filter naddr entities
  filterEntity       // Generic filter for any entity type
} from 'snstr';

// Step 1: Decode the entity
const profile = decodeProfile(nprofileString);

// Step 2: Filter invalid/malicious relay URLs
const safeProfile = filterProfile(profile);

// Check individual URLs
if (isValidRelayUrl('wss://relay.example.com')) {
  // URL is safe to use
}
```

### Safe Decoding Pattern

Always follow this pattern when working with complex NIP-19 entities:

```typescript
import { decode, filterEntity } from 'snstr';

function safelyDecodeEntity(bech32Str) {
  try {
    const result = decode(bech32Str);
    
    // Simple types don't need filtering
    if (['npub', 'nsec', 'note'].includes(result.type)) {
      return result.data;
    }
    
    // Complex types need filtering
    if (['nprofile', 'nevent', 'naddr'].includes(result.type)) {
      return filterEntity(result.data);
    }
    
    return null;
  } catch (error) {
    console.error('Error decoding entity:', error);
    return null;
  }
}

// Usage
const safeEntity = safelyDecodeEntity(bech32String);
```

For a complete example, see [nip19-security.ts](../../examples/nip19/nip19-security.ts). 

## TypeScript Types

The SNSTR implementation provides complete TypeScript typings with zero `any` types for all NIP-19 entities. Here's a breakdown of the typing system:

### Basic Types

```typescript
// Hexadecimal string (32-byte public key, private key, or note ID)
type HexString = string;

// Bech32 encoded string (prefix1data format)
type Bech32String = `${string}1${string}`;

// Valid relay URL string (ws:// or wss://)
type RelayUrl = string;
```

### Entity Data Types

```typescript
// Profile data structure (nprofile)
interface ProfileData {
  pubkey: HexString;
  relays?: RelayUrl[];
}

// Event data structure (nevent)
interface EventData {
  id: HexString;
  relays?: RelayUrl[];
  author?: HexString;
  kind?: number;
}

// Address data structure (naddr)
interface AddressData {
  identifier: string;
  pubkey: HexString;
  kind: number;
  relays?: RelayUrl[];
}
```

### Decoded Entity Types

```typescript
// Union type for all possible decoded entity types
type DecodedEntity = 
  | { type: "npub"; data: HexString }
  | { type: "nsec"; data: HexString }
  | { type: "note"; data: HexString }
  | { type: "nprofile"; data: ProfileData }
  | { type: "nevent"; data: EventData }
  | { type: "naddr"; data: AddressData };
```

### TLV Types

```typescript
// Type-Length-Value entry structure
interface TLVEntry {
  type: TLVType | number;
  value: Uint8Array;
}

// TLV types enum
enum TLVType {
  Special = 0, // Depends on prefix: pubkey for nprofile, event id for nevent, identifier (d tag) for naddr
  Relay = 1,   // Optional relay URL where the entity might be found
  Author = 2,  // Author pubkey (for naddr, required; for nevent, optional)
  Kind = 3,    // Event kind (for naddr, required; for nevent, optional)
}
```

### Safety with Type Validation

The typing system ensures that:

1. All entity structures are properly validated
2. Encoding/decoding functions have precise input and output types
3. Security functions like `filterProfile`, `filterEvent`, and `filterAddress` preserve types
4. The universal `decode` function returns a discriminated union of all possible entity types

These types make it easier to work with NIP-19 entities in TypeScript by providing autocompletion and type checking. 