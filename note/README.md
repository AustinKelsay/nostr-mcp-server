# Note Tools

This directory contains tools for working with Nostr notes, including reading, creating, signing, and publishing standard text notes (kind 1) and long-form content (kind 30023).

## Files

- `note-tools.ts`: Core functionality for note operations and profile reading using **snstr**

## Features

### Reading & Querying
- **Profile Processing**: Fetch and format user profiles (kind 0)
- **Text Note Handling**: Retrieve and display standard text notes (kind 1)
- **Long-form Content**: Support for NIP-23 long-form articles (kind 30023)
- **Multi-relay Support**: Query across multiple relays simultaneously 
- **Input Flexibility**: Support for both hex and npub formatted public keys

### Note Creation & Publishing
- **Modular Note Creation**: Create unsigned note events with `createNote`
- **Cryptographic Signing**: Sign note events with private keys using `signNote`
- **Relay Publishing**: Publish signed notes to specified relays with `publishNote`
- **Anonymous Posting**: Create anonymous notes with one-time keypairs using snstr's secure key generation
- **Format Support**: Accept both hex and nsec private key formats
- **Tag Support**: Add hashtags, mentions, and custom metadata to notes

### Technical Features
- **Modern Crypto**: Uses snstr for event creation, signing, and validation
- **Key Derivation**: Automatically derive public keys from private keys
- **Signature Validation**: Verify that private keys match note authors
- **Relay Management**: Handle connection pooling and cleanup
- **Error Handling**: Comprehensive error handling with user-friendly messages

## Usage

```typescript
import { 
  formatProfile, 
  formatNote,
  createNote,
  signNote,
  publishNote,
  postAnonymousNote,
  getProfileToolConfig, 
  getKind1NotesToolConfig,
  getLongFormNotesToolConfig,
  createNoteToolConfig,
  signNoteToolConfig,
  publishNoteToolConfig
} from "./note/note-tools.js";

// Format a profile event for display
const profileText = formatProfile(profileEvent);

// Format a note event for display
const noteText = formatNote(noteEvent);

// Create, sign, and publish a note (modular approach)
const createResult = await createNote(privateKey, "Hello Nostr!", [["t", "intro"]]);
const signResult = await signNote(privateKey, createResult.noteEvent);
const publishResult = await publishNote(signResult.signedNote, relays);

// Post an anonymous note (uses snstr for key generation and signing)
const anonResult = await postAnonymousNote("Anonymous message", relays, tags);

// Tool config schemas are exported for use with MCP
const noteCreationTool = server.tool(
  "createNote",
  "Create a new kind 1 note event",
  createNoteToolConfig,
  async (params) => {
    // Implementation
  }
);
```

## Schema Definitions

The module exports configuration schemas for Model Context Protocol tools:

### Reading Tools
- `getProfileToolConfig`: Schema for the getProfile tool
- `getKind1NotesToolConfig`: Schema for the getKind1Notes tool
- `getLongFormNotesToolConfig`: Schema for the getLongFormNotes tool

### Note Creation Tools
- `createNoteToolConfig`: Schema for creating unsigned note events
- `signNoteToolConfig`: Schema for signing note events with private keys
- `publishNoteToolConfig`: Schema for publishing signed notes to relays

### Anonymous Posting
- `postAnonymousNoteToolConfig`: Schema for anonymous note posting

These schemas define the parameters and validation rules for each tool, ensuring proper input handling and type safety. 