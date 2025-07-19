# NIP-10: Text Notes and Threads

Implementation of [NIP-10](https://github.com/nostr-protocol/nips/blob/master/10.md) which defines how `kind:1` text notes reference each other in threads.

## Overview

NIP-10 standardizes how text notes (kind 1) reference each other to form threaded conversations. It introduces marked `e` tags for replies, `e` tags with `mention` markers for quoting other events, and proper `p` tag usage for mentioning authors. This enables clients to build coherent conversation threads and display replies in context.

## Key Features

- 🧵 **Thread Management** – Create and parse threaded conversations with proper references
- 🏷️ **Marked E Tags** – Support for `root` and `reply` markers for clear thread structure
- 💬 **Quote Support** – `e` tags with `mention` markers for quoting events with optional relay hints
- 👥 **Author References** – Proper `p` tag handling for mentioned users
- 🔄 **Backward Compatibility** – Support for deprecated positional `e` tag scheme
- 🔍 **Thread Parsing** – Extract complete thread information from events

## Basic Usage

### Creating Thread References

```typescript
import { createReplyTags, createQuoteTag, parseThreadReferences } from 'snstr';

// Reply to an event in a thread
const replyTags = createReplyTags(
  { id: rootEventId, relay: 'wss://relay.example.com' },  // Root event
  { id: parentEventId, relay: 'wss://relay.example.com' } // Direct parent
);

// Quote an event (returns an 'e' tag with 'mention' marker)
const quoteTag = createQuoteTag({ 
  id: quotedEventId, 
  relay: 'wss://other-relay.com' 
});
// quoteTag: ['e', quotedEventId, 'wss://other-relay.com', 'mention']

// Build complete event
const replyEvent = {
  kind: 1,
  content: 'This is my reply to the thread',
  tags: [
    ...replyTags,
    ['p', authorPubkey], // Mention the original author
  ],
  // ... other event fields
};
```

### Parsing Thread Information

```typescript
import { parseThreadReferences } from 'snstr';

// Extract thread information from an event
const threadInfo = parseThreadReferences(event);
console.log('Root event:', threadInfo.root);
console.log('Reply target:', threadInfo.reply);
console.log('Quoted events:', threadInfo.quotes);
console.log('Mentioned authors:', threadInfo.mentions);
```

## Advanced Usage

### Building Complete Thread Structures

```typescript
import { createReplyTags, parseThreadReferences } from 'snstr';

class ThreadBuilder {
  static createRootReply(rootEventId, rootPubkey, content, privateKey) {
    return {
      kind: 1,
      content,
      tags: [
        ['e', rootEventId, '', 'reply'],
        ['p', rootPubkey]
      ],
      // ... sign with privateKey
    };
  }
  
  static createNestedReply(rootEventId, rootPubkey, parentEventId, parentPubkey, content, privateKey) {
    const tags = createReplyTags(
      { id: rootEventId },
      { id: parentEventId }
    );
    
    return {
      kind: 1,
      content,
      tags: [
        ...tags,
        ['p', rootPubkey],
        ['p', parentPubkey]
      ],
      // ... sign with privateKey
    };
  }
}
```

### Thread Navigation

```typescript
import { parseThreadReferences } from 'snstr';

function buildThreadTree(events) {
  const threads = new Map();
  
  events.forEach(event => {
    const refs = parseThreadReferences(event);
    
    if (refs.root) {
      // This is part of a thread
      if (!threads.has(refs.root.id)) {
        threads.set(refs.root.id, { root: refs.root.id, replies: [] });
      }
      threads.get(refs.root.id).replies.push({
        event,
        parentId: refs.reply?.id || refs.root.id
      });
    } else {
      // This might be a root post
      if (!threads.has(event.id)) {
        threads.set(event.id, { root: event.id, replies: [] });
      }
    }
  });
  
  return threads;
}
```

## API Reference

### `createReplyTags(root: ThreadPointer, reply?: ThreadPointer): Tag[]`

Creates proper `e` tags for replying in a thread.

**Parameters:**
- `root`: The root event of the thread
  - `id: string` - Event ID
  - `relay?: string` - Optional relay hint
- `reply`: The immediate parent being replied to (optional)
  - `id: string` - Event ID  
  - `relay?: string` - Optional relay hint

**Returns:** Array of properly marked `e` tags

```typescript
// Reply to root only
const rootOnlyTags = createReplyTags({ id: rootId });
// [['e', rootId, '', 'reply']]

// Reply in thread with parent
const threadTags = createReplyTags(
  { id: rootId, relay: 'wss://root-relay.com' },
  { id: parentId, relay: 'wss://parent-relay.com' }
);
// [
//   ['e', rootId, 'wss://root-relay.com', 'root'],
//   ['e', parentId, 'wss://parent-relay.com', 'reply']
// ]
```

### `createQuoteTag(event: ThreadPointer): Tag`

Creates an `e` tag with a `mention` marker for quoting an event.

**Parameters:**
- `event`: The event being quoted
  - `id: string` - Event ID
  - `relay?: string` - Optional relay hint

**Returns:** An `e` tag with `mention` marker for the quoted event

```typescript
// Quote an event
const quoteTag = createQuoteTag({ id: quotedEventId, relay: 'wss://relay.com' });
// ['e', quotedEventId, 'wss://relay.com', 'mention']
```

### `parseThreadReferences(event: NostrEvent): ThreadReferences`

Parses thread information from an event.

**Returns:** Object containing:
- `root?: ThreadPointer` - Root event of the thread
- `reply?: ThreadPointer` - Direct reply target
- `quotes: ThreadPointer[]` - Quoted events
- `mentions: ThreadPointer[]` - Other mentioned events (unmarked e tags)

## Thread Patterns

### Root Post
```typescript
// A root post has no e tags
{
  kind: 1,
  content: "Starting a new discussion about Nostr",
  tags: [],
  // ...
}
```

### Direct Reply to Root
```typescript
{
  kind: 1,
  content: "Great point about decentralization!",
  tags: [
    ['e', rootEventId, 'wss://relay.com', 'reply'],
    ['p', rootAuthorPubkey]
  ],
  // ...
}
```

### Nested Reply
```typescript
{
  kind: 1,
  content: "I agree with both of you",
  tags: [
    ['e', rootEventId, 'wss://relay.com', 'root'],
    ['e', parentEventId, 'wss://relay.com', 'reply'],
    ['p', rootAuthorPubkey],
    ['p', parentAuthorPubkey]
  ],
  // ...
}
```

### Quote Post
```typescript
{
  kind: 1,
  content: "This is exactly what I was thinking! nostr:note1...",
  tags: [
    ['e', quotedEventId, 'wss://relay.com', 'mention'],
    ['p', quotedAuthorPubkey]
  ],
  // ...
}
```

## Examples

For complete examples and documentation, see:
- [NIP-10 Examples README](../../examples/nip10/README.md) - Threading examples and documentation

## Testing

Run the NIP-10 tests:

```bash
npm run test:nip10
```

## Implementation Details

### Parsing Strategy

`parseThreadReferences` uses a sophisticated parsing strategy:

1. **Marked Tags First**: Looks for `e` tags with `root` and `reply` markers
2. **Positional Fallback**: Falls back to positional scheme for backward compatibility
3. **Quote Extraction**: Processes `e` tags with `mention` markers for quoted events
4. **Author Collection**: Gathers mentioned authors from `p` tags

### Backward Compatibility

The implementation supports the deprecated positional `e` tag scheme:
- First `e` tag = root (if multiple tags exist)
- Last `e` tag = reply target
- Middle tags = additional context

### Best Practices

1. **Always include relay hints** when known
2. **Mention all relevant authors** in `p` tags
3. **Use marked tags** rather than positional for new implementations
4. **Keep thread depth reasonable** for better user experience

```typescript
// Good: Clear thread structure
const replyTags = createReplyTags(
  { id: rootId, relay: knownRelay },
  { id: parentId, relay: knownRelay }
);

// Add relevant p tags
const pTags = [
  ['p', rootAuthor],
  ['p', parentAuthor],
  ['p', mentionedUser]
];
```