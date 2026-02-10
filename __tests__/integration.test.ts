import { describe, it, test, expect, beforeAll, afterAll } from 'bun:test';
import { NostrRelay } from '../utils/ephemeral-relay.js';
import { schnorr } from '@noble/curves/secp256k1';
import { randomBytes } from 'node:crypto';
import { sha256 } from '@noble/hashes/sha256';

// Generate a keypair for testing
function generatePrivateKey(): string {
  return Buffer.from(randomBytes(32)).toString('hex');
}

function getPublicKey(privateKey: string): string {
  return Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex');
}

// Create a signed event
function createSignedEvent(privateKey: string, kind: number, content: string, tags: string[][] = []) {
  const pubkey = getPublicKey(privateKey);
  const created_at = Math.floor(Date.now() / 1000);
  
  // Create event
  const event = {
    pubkey,
    created_at,
    kind,
    tags,
    content,
  };
  
  // Calculate event ID
  const eventData = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
  const id = Buffer.from(sha256(eventData)).toString('hex');
  
  // Sign the event
  const sig = Buffer.from(
    schnorr.sign(id, privateKey)
  ).toString('hex');
  
  return {
    ...event,
    id,
    sig
  };
}

describe('Nostr Integration Tests', () => {
  let relay: NostrRelay;
  let privateKey: string;
  let publicKey: string;
  
  beforeAll(async () => {
    privateKey = generatePrivateKey();
    publicKey = getPublicKey(privateKey);
    
    // Start the ephemeral relay
    // Use port 0 to avoid CI/local port conflicts.
    relay = new NostrRelay(0);
    await relay.start();
  });
  
  afterAll(async () => {
    // Shutdown relay
    await relay.close();
  });
  
  test('should publish and retrieve a profile', async () => {
    // Create a profile event (kind 0)
    const profileContent = JSON.stringify({
      name: 'Test User',
      about: 'This is a test profile',
      picture: 'https://example.com/avatar.jpg'
    });
    
    const profileEvent = createSignedEvent(privateKey, 0, profileContent);
    
    // Store it in the relay
    relay.store(profileEvent);
    
    // Verify it was stored
    expect(relay.cache.length).toBeGreaterThan(0);
    
    // Find the profile in the cache
    const retrievedProfile = relay.cache.find(event => 
      event.kind === 0 && event.pubkey === publicKey
    );
    
    // Verify profile data
    expect(retrievedProfile).toBeDefined();
    expect(retrievedProfile?.id).toBe(profileEvent.id);
    
    // Parse the content
    const parsedContent = JSON.parse(retrievedProfile?.content || '{}');
    expect(parsedContent.name).toBe('Test User');
    expect(parsedContent.about).toBe('This is a test profile');
  });
  
  test('should publish and retrieve a text note', async () => {
    // Create a text note (kind 1)
    const noteContent = 'This is a test note posted from integration tests!';
    const noteEvent = createSignedEvent(privateKey, 1, noteContent);
    
    // Store it in the relay
    relay.store(noteEvent);
    
    // Find the note in the cache
    const retrievedNote = relay.cache.find(event => 
      event.kind === 1 && event.pubkey === publicKey && event.content === noteContent
    );
    
    // Verify note data
    expect(retrievedNote).toBeDefined();
    expect(retrievedNote?.id).toBe(noteEvent.id);
    expect(retrievedNote?.content).toBe(noteContent);
  });
  
  test('should publish and retrieve a zap receipt', async () => {
    // Create a mock recipient public key
    const recipientKey = generatePrivateKey();
    const recipientPubkey = getPublicKey(recipientKey);
    
    // Create zap receipt tags
    const zapTags = [
      ['p', recipientPubkey],
      ['amount', '100000'], // 100 sats in millisats
      ['bolt11', 'lnbc100n...'],
      ['description', ''],
    ];
    
    // Create a zap receipt (kind 9735)
    const zapEvent = createSignedEvent(privateKey, 9735, '', zapTags);
    
    // Store it in the relay
    relay.store(zapEvent);
    
    // Find the zap in the cache
    const retrievedZap = relay.cache.find(event => 
      event.kind === 9735 && event.pubkey === publicKey
    );
    
    // Verify zap data
    expect(retrievedZap).toBeDefined();
    expect(retrievedZap?.id).toBe(zapEvent.id);
    
    // Verify zap tags
    const pTag = retrievedZap?.tags.find(tag => tag[0] === 'p');
    const amountTag = retrievedZap?.tags.find(tag => tag[0] === 'amount');
    
    expect(pTag?.[1]).toBe(recipientPubkey);
    expect(amountTag?.[1]).toBe('100000');
  });
  
  test('should filter events correctly', async () => {
    // Create multiple events of different kinds
    const profileEvent = createSignedEvent(privateKey, 0, JSON.stringify({ name: 'Filter Test' }));
    const textNote1 = createSignedEvent(privateKey, 1, 'Filter test note 1');
    const textNote2 = createSignedEvent(privateKey, 1, 'Filter test note 2');
    const reactionEvent = createSignedEvent(privateKey, 7, '+', [['e', 'fake-event-id']]);
    
    // Store all events
    relay.store(profileEvent);
    relay.store(textNote1);
    relay.store(textNote2);
    relay.store(reactionEvent);
    
    // Filter for just kind 1 events
    const textNotes = relay.cache.filter(event => 
      event.kind === 1 && event.pubkey === publicKey
    );
    
    // We should have at least 3 text notes (2 from this test plus 1 from earlier test)
    expect(textNotes.length).toBeGreaterThanOrEqual(3);
    
    // Filter for reaction events
    const reactions = relay.cache.filter(event => 
      event.kind === 7 && event.pubkey === publicKey
    );
    
    expect(reactions.length).toBeGreaterThanOrEqual(1);
    expect(reactions[0].content).toBe('+');
  });
  
  // The ephemeral-relay validates events during WebSocket communication,
  // but doesn't validate during direct store() calls - this test verifies this behavior
  test('should store events without validation when using direct store() method', () => {
    // Create a properly signed event
    const signedEvent = createSignedEvent(privateKey, 1, 'Verification test');
    
    // Store it in the relay
    relay.store(signedEvent);
    
    // Create an event with invalid signature
    const invalidEvent = {
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'Invalid signature event',
      id: 'invalid_id_that_doesnt_match_content',
      sig: 'invalid_signature_0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
    };
    
    // Get the current cache size
    const cacheSizeBefore = relay.cache.length;
    
    // Store the invalid event (this should succeed since store() doesn't validate)
    relay.store(invalidEvent);
    
    // Cache size should increase since the invalid event should be added
    const cacheSizeAfter = relay.cache.length;
    
    // Verify the event was added (expected behavior for direct store calls)
    expect(cacheSizeAfter).toBe(cacheSizeBefore + 1);
    
    // Find the invalid event in the cache
    const invalidEventInCache = relay.cache.find(event => event.id === 'invalid_id_that_doesnt_match_content');
    expect(invalidEventInCache).toBeDefined();
    
    // Note: This confirms the current behavior, but in websocket-integration.test.ts we
    // verify that invalid events are properly rejected over WebSocket communication
  });
}); 
