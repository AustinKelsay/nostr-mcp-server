# Zap Tools

This directory contains tools for working with Nostr Zaps as defined in [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md), which enables Lightning Network payments via Nostr.

## Files

- `zap-tools.ts`: Core functionality for processing, validating, and interacting with Nostr zaps using **snstr**

## Features

- **Zap Receipt Validation**: Comprehensive NIP-57 compliant validation of zap receipts
- **Payment Amount Extraction**: Parse and extract sats amounts from BOLT11 invoices 
- **Directional Processing**: Determine if zaps were sent, received, or self-zapped
- **Anonymous Zapping**: Generate anonymous zaps to profiles and events using snstr's event creation and signing
- **Lightning Integration**: Full integration with LNURL-pay (LUD-06) and Lightning Address (LUD-16)
- **Smart Caching**: Efficiently cache processed zaps for better performance
- **Modern Crypto**: Uses snstr's secure key generation and event signing functions

## Usage

```typescript
import { 
  processZapReceipt, 
  validateZapReceipt, 
  formatZapReceipt,
  prepareAnonymousZap 
} from "./zap/zap-tools.js";

// Process a zap receipt
const processedZap = processZapReceipt(zapReceipt, userPubkey);

// Validate a zap receipt according to NIP-57
const validationResult = validateZapReceipt(zapReceipt);

// Format a zap for display
const formattedZap = formatZapReceipt(zap, contextPubkey);

// Prepare an anonymous zap (returns a lightning invoice)
// Uses snstr for secure key generation and event signing
const zapResult = await prepareAnonymousZap(targetNpub, 1000, "Great post!");
```

## Core Data Structures

The module defines several key interfaces and types:

- `ZapReceipt`: Represents a NIP-57 zap receipt (kind 9735)
- `ZapRequest`: Represents a NIP-57 zap request (kind 9734)
- `ZapDirection`: Enum for zap directions ('sent', 'received', 'self', 'unknown')
- `CachedZap`: Enhanced zap receipt with additional metadata
- `LnurlPayResponse`: LNURL-pay service response with zap capabilities
- `LnurlCallbackResponse`: Response from LNURL-pay callback with invoice

This structure enables robust processing and tracking of zap-related events on the Nostr network. 