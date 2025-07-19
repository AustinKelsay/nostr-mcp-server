# NIP-57: Lightning Zaps

This module implements [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md), which defines a protocol for recording Lightning Network payments (zaps) on Nostr.

## Overview

NIP-57 defines two event types:
1. **Zap Request (kind 9734)**: Created by a sender to request a Lightning invoice from a recipient's LNURL server
2. **Zap Receipt (kind 9735)**: Created by a recipient's LNURL server after a successful payment

The protocol supports both standard zaps (signed by the sender) and anonymous zaps (where the sender's identity is not revealed in the zap receipt but still included as a `P` tag). This allows users to choose whether to make their zap payments public or private.

## Key Features

- 🔄 **Full Protocol Flow**: Complete implementation of the NIP-57 protocol flow
- ⚡ **Zap Requests/Receipts**: Create and validate zap events
- 🧾 **LNURL Integration**: Utilities for working with LNURL pay endpoints
- 💰 **Zap Splits**: Support for splitting zaps between multiple recipients
- ✅ **Validation**: Comprehensive verification of zap receipts
- 🔒 **Description Hash Verification**: Validates the bolt11 invoice description hash against the zap request
- 🔍 **Easy Querying**: Simple fetch/query methods for zap-related data
- 📊 **Stats**: Calculate total zap amounts and other statistics
- 🕶️ **Anonymous Zaps**: Support for private zaps where sender identity is protected

## Ephemeral Relay

The library provides an in-memory relay implementation for testing and development:

```typescript
import { NostrRelay } from '../utils/ephemeral-relay';

// Create an ephemeral relay on port 3000
// Optional: purge events every 60 seconds
const relay = new NostrRelay(3000, 60);
```

## Relay Tag Format

The NIP-57 spec requires a specific format for the `relays` tag in zap requests. According to the specification:

> `relays` is a list of relays the recipient's wallet should publish its `zap receipt` to. Note that relays should not be nested in an additional list, but should be included as shown in the example below.

This implementation follows the specification by storing all relay URLs in a single tag with `relays` as the first element:

```javascript
// Correct format (as implemented in this library)
[
  ["relays", "wss://relay1.example.com", "wss://relay2.example.com", "wss://relay3.example.com"]
]

// Incorrect format (do not do this)
[
  ["relays", ["wss://relay1.example.com", "wss://relay2.example.com", "wss://relay3.example.com"]]
]
```

When using the `createZapRequest` function, this format is correctly applied:

```typescript
const zapRequestTemplate = createZapRequest({
  recipientPubkey: 'recipient_pubkey_here',
  relays: [
    'wss://relay1.example.com',
    'wss://relay2.example.com'
  ],
  // other options...
}, 'sender_pubkey_here');

// In the resulting event, the relays tag will be:
// ["relays", "wss://relay1.example.com", "wss://relay2.example.com"]
```

This formatting is important for ensuring compatibility with other implementations of NIP-57.

## Description Hash Verification

This implementation includes a critical security feature: verification that the SHA-256 hash of the zap request matches the description_hash field in the bolt11 invoice. This helps prevent:

1. **Zap receipt forgery**: A malicious actor creating fake zap receipts without making actual payments
2. **Amount manipulation**: Creating a zap receipt that claims a different amount than was actually paid
3. **Receipt reuse**: Reusing valid payment proofs for different recipients or events

The validation function checks:
- The zap receipt is signed by the expected LNURL server
- The zap request signature is valid
- Recipient and event IDs match between the zap request and receipt
- The SHA-256 hash of the zap request matches the bolt11 invoice's description hash

This feature provides an additional layer of security beyond just checking signatures and ensures the zap receipt corresponds to an actual Lightning Network payment.

The code implementation:

```typescript
// Parse bolt11 invoice to extract description hash
const parsedInvoice = parseBolt11Invoice(bolt11);
if (!parsedInvoice || !parsedInvoice.descriptionHash) {
  return { valid: false, message: 'Invoice is missing description hash' };
}

// Calculate SHA-256 hash of the zap request JSON
const zapRequestJson = descriptionTag[1];
const hashBytes = sha256(zapRequestJson);

// Convert to hex for comparison
const calculatedHash = Array.from(hashBytes)
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');

// Compare the hashes
if (calculatedHash !== parsedInvoice.descriptionHash) {
  return { valid: false, message: 'Description hash mismatch' };
}
```

## Basic Usage

### Using the NostrZapClient

The `NostrZapClient` provides a simple, high-level interface for working with zaps:

```typescript
import { Nostr, NostrZapClient } from 'snstr';

// Initialize Nostr client
const nostr = new Nostr(['wss://relay.example.com']);
await nostr.setPrivateKey('your_private_key');
await nostr.connectToRelays();

// Create zap client
const zapClient = new NostrZapClient({
  client: nostr,
  defaultRelays: ['wss://relay.example.com']
});

// Send a zap
const result = await zapClient.sendZap({
  recipientPubkey: 'recipient_pubkey',
  lnurl: 'recipient_lnurl',
  amount: 1000000, // 1000 sats in millisats
  comment: 'Great post!',
  eventId: 'event_id_to_zap', // optional
  anonymousZap: false // Set to true for anonymous zaps
}, 'your_private_key');

if (result.success) {
  console.log(`Got invoice: ${result.invoice}`);
  // Pay invoice with a Lightning wallet
} else {
  console.error(`Error: ${result.error}`);
}

// Get zaps received by a user
const userZaps = await zapClient.fetchUserReceivedZaps('user_pubkey');

// Get total amount of zaps received
const stats = await zapClient.getTotalZapsReceived('user_pubkey');
console.log(`User received ${stats.total / 1000} sats across ${stats.count} zaps`);

// Get zaps for a specific event
const eventZaps = await zapClient.fetchEventZaps('event_id');
```

### Creating a Zap Request

```typescript
import { createZapRequest, signEvent } from 'snstr';

// Create a zap request
const zapRequestTemplate = createZapRequest({
  recipientPubkey: 'recipient_pubkey_here',
  eventId: 'event_being_zapped_here', // optional
  amount: 1000000, // 1000 sats in millisats
  relays: ['wss://relay.example.com'],
  content: 'Great post!', // Optional comment
  senderPubkey: 'your_pubkey' // For anonymous zaps
}, 'sender_pubkey_here');

// Sign the request
const signedZapRequest = await signEvent(zapRequestTemplate, 'sender_private_key');
```

### Validating a Zap Receipt

```typescript
import { validateZapReceipt } from 'snstr';

// Check if a zap receipt is valid
const validationResult = validateZapReceipt(
  zapReceiptEvent, 
  'lnurl_server_pubkey'
);

if (validationResult.valid) {
  console.log(`Valid zap of ${validationResult.amount} millisats`);
  console.log(`From: ${validationResult.sender}`);
  console.log(`To: ${validationResult.recipient}`);
  if (validationResult.content) {
    console.log(`Comment: ${validationResult.content}`);
  }
} else {
  console.error(`Invalid zap: ${validationResult.message}`);
}
```

### Working with Zap Splits

```typescript
import { parseZapSplit, calculateZapSplitAmounts } from 'snstr';

// Parse zap split information from an event
const zapSplitInfo = parseZapSplit(someEvent);

// Calculate actual amounts based on weights
const zapAmounts = calculateZapSplitAmounts(1000000, zapSplitInfo);

// Output split information
zapAmounts.forEach(({ pubkey, relay, amount }) => {
  console.log(`Send ${amount} millisats to ${pubkey} via ${relay}`);
});
```

## Protocol Flow

1. Client gets LNURL pay info from recipient's profile or post
2. Client creates a zap request (kind 9734)
3. Client sends zap request to recipient's LNURL server
4. LNURL server returns a Lightning invoice
5. Client pays the invoice
6. LNURL server creates and publishes a zap receipt (kind 9735)
7. Client can validate the zap receipt and display it

## LNURL Integration

The NIP-57 implementation works with LNURL-pay endpoints that support Nostr zaps. It includes utilities for parsing LNURL responses and validating that an endpoint supports zaps.

## Implementation Details

This implementation adheres strictly to the NIP-57 specification, including:

- Proper validation of zap request/receipt events
- Support for anonymous zaps using the `P` tag
- Support for zapping parameterized replaceable events with the `a` tag
- Support for zap splitting according to weight specifications
- Comprehensive bolt11 invoice validation, including description hash verification
- Detailed error reporting for validation failures
- Proper LNURL bech32 encoding/decoding

## Compatibility with Other Implementations

This library is designed to be fully compatible with other NIP-57 implementations including:

- Popular Nostr clients like Damus, Amethyst, and Iris
- Lightning wallets that support NIP-57 like Alby and Zeus
- LNURL servers including LNBits, LND-LNURL, and Core Lightning plugins

The code follows the specification exactly, particularly with:
- Correct format for relay tags that many implementations are strict about
- Proper handling of anonymous zaps with the `P` tag
- Full validation of the invoice description hash for security
- Support for both direct profile zaps and event-specific zaps

If you encounter compatibility issues with specific implementations, please file an issue in the repository.

## Security Considerations

- Zap receipts include verification of the invoice description hash for added security
- The library verifies that the bolt11 invoice actually commits to the zap request
- Clients should validate that zap receipts come from the expected LNURL server 

## Troubleshooting

### Common Issues

1. **LNURL Server Not Supporting Nostr Zaps**
   - Ensure the LNURL server includes `allowsNostr: true` and `nostrPubkey` in its response
   - Use `supportsNostrZaps()` to check before attempting to send a zap

2. **Invalid Zap Receipts**
   - The most common cause is a missing or invalid description hash in the bolt11 invoice
   - Verify that the LNURL server is creating invoices with the correct description hash
   - Use `validateZapReceipt()` with detailed error reporting to diagnose issues

3. **Relay Tag Format Problems**
   - Make sure relays are specified as `["relays", "url1", "url2", ...]` not nested arrays
   - Use the `createZapRequest()` function to ensure correct formatting

4. **Anonymous Zaps Not Working**
   - Ensure the `P` tag is used in the zap request (not lowercase `p`)
   - Verify that recipient servers are correctly handling the `P` tag

5. **Missing Zap Receipts**
   - Some LNURL servers don't reliably publish zap receipts to the specified relays
   - Try specifying well-known public relays in the zap request

If you encounter persistent issues, check the code examples for working implementations or file an issue in the repository with a detailed description of the problem.

## Examples

Check out the examples in the repository:

- [`basic-example.ts`](https://github.com/AustinKelsay/snstr/blob/main/examples/nip57/basic-example.ts): Simple demonstration of zap requests and receipts
- [`zap-client-example.ts`](https://github.com/AustinKelsay/snstr/blob/main/examples/nip57/zap-client-example.ts): Using the NostrZapClient for common zap operations
- [`lnurl-server-simulation.ts`](https://github.com/AustinKelsay/snstr/blob/main/examples/nip57/lnurl-server-simulation.ts): Full simulation of LNURL server handling zap requests
- [`invoice-validation-example.ts`](https://github.com/AustinKelsay/snstr/blob/main/examples/nip57/invoice-validation-example.ts): Invoice validation example for zap verification

You can run these examples using the npm scripts:

```bash
npm run example:nip57          # Basic NIP-57 example
npm run example:nip57:client   # Zap client example
npm run example:nip57:lnurl    # LNURL server simulation
npm run example:nip57:validation # Invoice validation example
``` 