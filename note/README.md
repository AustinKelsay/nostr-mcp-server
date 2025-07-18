# Note Tools

This directory contains tools for working with Nostr notes and profiles, including standard text notes (kind 1) and long-form content (kind 30023).

## Files

- `note-tools.ts`: Core functionality for fetching and formatting profiles and notes using **snstr**

## Features

- **Profile Processing**: Fetch and format user profiles (kind 0)
- **Text Note Handling**: Retrieve and display standard text notes (kind 1)
- **Long-form Content**: Support for NIP-23 long-form articles (kind 30023)
- **Anonymous Posting**: Create anonymous notes with one-time keypairs using snstr's secure key generation
- **Metadata Extraction**: Parse and display profile metadata and note context
- **Multi-relay Support**: Query across multiple relays simultaneously 
- **Input Flexibility**: Support for both hex and npub formatted public keys
- **Modern Crypto**: Uses snstr for event creation, signing, and validation

## Usage

```typescript
import { 
  formatProfile, 
  formatNote,
  postAnonymousNote,
  getProfileToolConfig, 
  getKind1NotesToolConfig,
  getLongFormNotesToolConfig 
} from "./note/note-tools.js";

// Format a profile event for display
const profileText = formatProfile(profileEvent);

// Format a note event for display
const noteText = formatNote(noteEvent);

// Post an anonymous note (uses snstr for key generation and signing)
const result = await postAnonymousNote("Hello Nostr!", relays, tags);

// Tool config schemas are exported for use with MCP
const profileTool = server.tool(
  "getProfile",
  "Get a Nostr profile by public key",
  getProfileToolConfig,
  async (params) => {
    // Implementation
  }
);
```

## Schema Definitions

The module exports configuration schemas for Model Context Protocol tools:

- `getProfileToolConfig`: Schema for the getProfile tool
- `getKind1NotesToolConfig`: Schema for the getKind1Notes tool
- `getLongFormNotesToolConfig`: Schema for the getLongFormNotes tool

These schemas define the parameters and validation rules for each tool, ensuring proper input handling. 