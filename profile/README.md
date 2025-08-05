# Profile Tools

This directory contains tools for managing Nostr identities, including keypair generation, profile creation and updates, and authenticated note posting.

## Files

- `profile-tools.ts`: Core functionality for identity management and profile operations using **snstr**

## Features

### Keypair Generation
- **Secure Key Generation**: Generate cryptographically secure keypairs using secp256k1 curve
- **Format Flexibility**: Output keys in hex format, npub/nsec format, or both
- **Standards Compliance**: Full compatibility with NIP-19 encoding standards

### Profile Management
- **Profile Creation**: Create new Nostr profiles (kind 0 events) with comprehensive metadata
- **Profile Updates**: Update existing profiles with new information (replaceable events)
- **Metadata Support**: Full support for standard profile fields:
  - **Identity**: name, display_name, about
  - **Media**: picture, banner
  - **Verification**: nip05 identifiers
  - **Lightning**: lud16 (Lightning Address), lud06 (LNURL)
  - **Web**: website links

### Authenticated Note Posting
- **All-in-One Posting**: Complete workflow from creation to publishing in a single command
- **Identity Preservation**: Posts appear under your established Nostr identity
- **Key Format Support**: Accept both hex and nsec private key formats
- **Tag Support**: Add hashtags, mentions, and custom metadata
- **Relay Control**: Publish to specific relays or use defaults

## Usage

```typescript
import { 
  createKeypair,
  createProfile,
  updateProfile,
  postNote,
  createKeypairToolConfig,
  createProfileToolConfig,
  updateProfileToolConfig,
  postNoteToolConfig
} from "./profile/profile-tools.js";

// Generate a new keypair
const keys = await createKeypair("both"); // Returns both hex and npub/nsec

// Create a new profile
const profileResult = await createProfile(
  keys.privateKey,
  {
    name: "Alice",
    about: "Bitcoin developer and privacy advocate",
    picture: "https://example.com/alice.jpg",
    nip05: "alice@example.com",
    lud16: "alice@getalby.com",
    website: "https://alice.dev"
  },
  relays
);

// Update an existing profile
const updateResult = await updateProfile(
  keys.privateKey,
  {
    about: "Updated bio: Bitcoin developer, privacy advocate, and coffee enthusiast",
    website: "https://alice.dev/blog"
  },
  relays
);

// Post an authenticated note
const noteResult = await postNote(
  keys.nsec, // Can use nsec or hex format
  "GM Nostr! ☀️ Building the future of social media",
  [["t", "gm"], ["t", "nostr"], ["client", "mcp-server"]],
  relays
);

// Tool config schemas are exported for use with MCP
const keypairTool = server.tool(
  "createKeypair",
  "Generate a new Nostr keypair",
  createKeypairToolConfig,
  async (params) => {
    // Implementation
  }
);
```

## Schema Definitions

The module exports configuration schemas for Model Context Protocol tools:

### Identity Management
- `createKeypairToolConfig`: Schema for keypair generation with format options
- `createProfileToolConfig`: Schema for creating new profiles with metadata
- `updateProfileToolConfig`: Schema for updating existing profiles

### Authenticated Posting
- `postNoteToolConfig`: Schema for authenticated note posting with private keys

## Key Features

### Security
- **Private Key Handling**: Secure normalization of hex and nsec format keys
- **Key Derivation**: Automatic public key derivation from private keys
- **Cryptographic Validation**: Verify key pairs match before signing operations

### Flexibility
- **Format Support**: Handle both hex and NIP-19 encoded key formats seamlessly
- **Relay Management**: Support for custom relay lists or default configurations
- **Metadata Control**: Granular control over profile fields and note content

### Error Handling
- **Comprehensive Validation**: Input validation for all key formats and metadata
- **User-Friendly Messages**: Clear error messages for common issues
- **Graceful Degradation**: Handle network issues and relay failures gracefully

## Integration with Note Tools

The profile tools complement the note tools by providing:
- **Identity Context**: Established identity for authenticated posting vs anonymous posting
- **Profile Management**: Tools to create and maintain the identity used in authenticated notes
- **Convenience Functions**: All-in-one posting vs modular note creation/signing/publishing

This separation allows users to choose between:
- **Quick Posting**: Use `postNote` for immediate authenticated posting
- **Advanced Workflows**: Use note tools for complex signing and publishing scenarios
- **Identity Management**: Use profile tools to establish and maintain Nostr identities