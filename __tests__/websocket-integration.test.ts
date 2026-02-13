import { describe, it, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { NostrRelay } from '../utils/ephemeral-relay.js';
import { schnorr } from '@noble/curves/secp256k1';
import { randomBytes } from 'node:crypto';
import { sha256 } from '@noble/hashes/sha256';
import WebSocket from 'ws';

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

describe('WebSocket Nostr Integration Tests', () => {
  let relay: NostrRelay;
  let relayUrl: string;
  let ws: WebSocket;
  let privateKey: string;
  let publicKey: string;
  
  beforeAll(async () => {
    privateKey = generatePrivateKey();
    publicKey = getPublicKey(privateKey);
    
    // Start the ephemeral relay
    // Use port 0 so the OS chooses an available ephemeral port (avoids CI/local port conflicts).
    relay = new NostrRelay(0);
    await relay.start();
    relayUrl = relay.url;
  });
  
  beforeEach(async () => {
    // Create a new WebSocket connection before each test
    const connectPromise = new Promise<void>((resolve, reject) => {
      ws = new WebSocket(relayUrl);
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });
    
    await connectPromise;
  });
  
  afterEach(async () => {
    // Close WebSocket connection after each test
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
        // Wait for close to complete
        await new Promise(resolve => {
          ws.on('close', resolve);
          setTimeout(resolve, 100); // Fallback timeout
        });
      }
      ws.removeAllListeners();
    }
  });
  
  afterAll(async () => {
    // Ensure all WebSocket connections are closed
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Shutdown relay
    await relay.close();
    
    // Give time for all async operations to complete
    await new Promise(resolve => setTimeout(resolve, 200));
  });
  
  // Helper function to send a message and wait for response
  const sendAndWait = (message: any): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const responses: any[] = [];
      const responseHandler = (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          responses.push(response);
          
          // EOSE or OK messages indicate we can resolve
          if (
            (response[0] === 'EOSE' && response[1] === 'test-sub') || 
            (response[0] === 'OK')
          ) {
            resolve(responses);
            ws.off('message', responseHandler);
          }
        } catch (e) {
          reject(e);
        }
      };
      
      ws.on('message', responseHandler);
      ws.send(JSON.stringify(message));
      
      // Add a timeout
      setTimeout(() => {
        resolve(responses);
        ws.off('message', responseHandler);
      }, 2000);
    });
  };
  
  test('should connect to the relay', () => {
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });
  
  test('should publish an event and get OK response', async () => {
    // Create a test event
    const event = createSignedEvent(privateKey, 1, 'WebSocket test note');
    
    // Send EVENT message
    const responses = await sendAndWait(['EVENT', event]);
    
    // Check for OK response
    const okResponse = responses.find(resp => resp[0] === 'OK' && resp[1] === event.id);
    expect(okResponse).toBeDefined();
    expect(okResponse[2]).toBe(true); // Success flag
  });
  
  test('should publish an event and retrieve it with REQ', async () => {
    // Create a test event with unique content
    const uniqueContent = `WebSocket REQ test note ${Date.now()}`;
    const event = createSignedEvent(privateKey, 1, uniqueContent);
    
    // Send EVENT message
    await sendAndWait(['EVENT', event]);
    
    // Now send a REQ to get this event
    const subId = 'test-sub';
    const responses = await sendAndWait([
      'REQ', 
      subId, 
      {
        kinds: [1],
        authors: [publicKey],
      }
    ]);
    
    // Check that we got an EVENT response with our event
    const eventResponse = responses.find(resp => 
      resp[0] === 'EVENT' && 
      resp[1] === subId && 
      resp[2].content === uniqueContent
    );
    
    expect(eventResponse).toBeDefined();
    expect(eventResponse[2].id).toBe(event.id);
    
    // Check that we got an EOSE response
    const eoseResponse = responses.find(resp => resp[0] === 'EOSE' && resp[1] === subId);
    expect(eoseResponse).toBeDefined();
  });
  
  test('should handle multiple subscriptions', async () => {
    // Create events of different kinds
    const profileEvent = createSignedEvent(
      privateKey, 
      0, 
      JSON.stringify({ name: 'WebSocket Test' })
    );
    
    const noteEvent = createSignedEvent(
      privateKey, 
      1, 
      'WebSocket multi-subscription test'
    );
    
    // Publish both events
    await sendAndWait(['EVENT', profileEvent]);
    await sendAndWait(['EVENT', noteEvent]);
    
    // Subscribe to profiles only
    const profileSubId = 'profile-sub';
    const profileResponses = await sendAndWait([
      'REQ', 
      profileSubId, 
      {
        kinds: [0],
        authors: [publicKey],
      }
    ]);
    
    // Subscribe to notes only
    const noteSubId = 'note-sub';
    const noteResponses = await sendAndWait([
      'REQ', 
      noteSubId, 
      {
        kinds: [1],
        authors: [publicKey],
      }
    ]);
    
    // Check profile subscription got profile event
    const profileEventResponse = profileResponses.find(resp => 
      resp[0] === 'EVENT' && 
      resp[1] === profileSubId && 
      resp[2].kind === 0
    );
    
    expect(profileEventResponse).toBeDefined();
    
    // Check note subscription got note event
    const noteEventResponse = noteResponses.find(resp => 
      resp[0] === 'EVENT' && 
      resp[1] === noteSubId && 
      resp[2].kind === 1
    );
    
    expect(noteEventResponse).toBeDefined();
  });
  
  test('should support subscription closing', async () => {
    // Create a test event
    const event = createSignedEvent(privateKey, 1, 'Subscription close test');
    
    // Publish the event
    await sendAndWait(['EVENT', event]);
    
    // Create a subscription
    const subId = 'close-test-sub';
    await sendAndWait([
      'REQ', 
      subId, 
      {
        kinds: [1],
        authors: [publicKey],
      }
    ]);
    
    // Close the subscription
    ws.send(JSON.stringify(['CLOSE', subId]));
    
    // Create a new subscription with the same ID
    // This should work if the previous subscription was properly closed
    const newResponses = await sendAndWait([
      'REQ', 
      subId, 
      {
        kinds: [1],
        authors: [publicKey],
      }
    ]);
    
    // Verify we got an EOSE for the new subscription
    const eoseResponse = newResponses.find(resp => resp[0] === 'EOSE' && resp[1] === subId);
    expect(eoseResponse).toBeDefined();
  });
  
  test('should reject events with invalid signatures or silently ignore them', async () => {
    // Create an event with invalid signature
    const invalidEvent = {
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'Event with invalid signature',
      id: Buffer.from(sha256(JSON.stringify([0, publicKey, Math.floor(Date.now() / 1000), 1, [], 'Event with invalid signature']))).toString('hex'),
      sig: 'invalid_signature_0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
    };
    
    // Send EVENT message with invalid signature
    const responses = await sendAndWait(['EVENT', invalidEvent]);
    
    // Check for OK response with failure flag, or no response which means silent rejection
    const okResponse = responses.find(resp => 
      resp[0] === 'OK' && 
      resp[1] === invalidEvent.id
    );
    
    // If the relay responds to invalid events, it should be with failure
    if (okResponse) {
      expect(okResponse[2]).toBe(false); // Success flag should be false
    }
    
    // Now verify that a valid event works properly
    const validEvent = createSignedEvent(privateKey, 1, 'Event with valid signature');
    
    // Send EVENT message with valid signature
    const validResponses = await sendAndWait(['EVENT', validEvent]);
    
    // Check for OK response with success flag
    const validOkResponse = validResponses.find(resp => 
      resp[0] === 'OK' && 
      resp[1] === validEvent.id
    );
    
    expect(validOkResponse).toBeDefined();
    expect(validOkResponse[2]).toBe(true); // Success flag should be true
    
    // Verify the valid event made it to the relay's cache
    const eventInCache = relay.cache.find(e => e.id === validEvent.id);
    expect(eventInCache).toBeDefined();
    
    // Verify the invalid event didn't make it to the relay's cache
    const invalidEventInCache = relay.cache.find(e => e.id === invalidEvent.id);
    expect(invalidEventInCache).toBeUndefined();
  });
}); 
