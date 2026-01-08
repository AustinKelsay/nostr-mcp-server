import { mock, describe, it, expect, beforeAll, beforeEach } from 'bun:test';
import { generateKeypair } from 'snstr';
import { NostrEvent } from '../utils/index.js';

// Mock the pool to prevent real WebSocket connections
const mockPool = {
  close: mock(() => {}),
  publish: mock(() => [
    Promise.resolve({ success: true }),
    Promise.resolve({ success: true })
  ])
};

// Mock the pool module directly
mock.module('../utils/pool.js', () => ({
  getFreshPool: mock(() => mockPool)
}));

// Now import the functions that use the mocked module
import {
  formatProfile,
  formatNote,
  createNote,
  signNote,
  publishNote
} from '../note/note-tools.js';

describe('Note Tools Functions', () => {
  let testKeys: { publicKey: string; privateKey: string };

  beforeAll(async () => {
    testKeys = await generateKeypair();
  });

  beforeEach(() => {
    // Reset mock state between tests
    mockPool.close.mockClear();
    mockPool.publish.mockClear();
  });

  describe('formatProfile', () => {
    it('should format a complete profile', () => {
      const profileEvent: NostrEvent = {
        id: 'profile-id',
        pubkey: testKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 0,
        tags: [],
        content: JSON.stringify({
          name: 'Test User',
          display_name: 'Tester',
          about: 'A test profile',
          picture: 'https://example.com/pic.jpg',
          nip05: 'test@example.com',
          lud16: 'test@getalby.com',
          lud06: 'LNURL123',
          website: 'https://example.com'
        }),
        sig: 'test-sig'
      };

      const formatted = formatProfile(profileEvent);

      expect(formatted).toContain('Name: Test User');
      expect(formatted).toContain('Display Name: Tester');
      expect(formatted).toContain('About: A test profile');
      expect(formatted).toContain('NIP-05: test@example.com');
      expect(formatted).toContain('Lightning Address (LUD-16): test@getalby.com');
      expect(formatted).toContain('LNURL (LUD-06): LNURL123');
      expect(formatted).toContain('Picture: https://example.com/pic.jpg');
      expect(formatted).toContain('Website: https://example.com');
    });

    it('should handle missing profile data', () => {
      const profileEvent: NostrEvent = {
        id: 'profile-id',
        pubkey: testKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 0,
        tags: [],
        content: JSON.stringify({
          name: 'Minimal User'
        }),
        sig: 'test-sig'
      };

      const formatted = formatProfile(profileEvent);

      expect(formatted).toContain('Name: Minimal User');
      expect(formatted).toContain('Display Name: Minimal User'); // Falls back to name
      expect(formatted).toContain('About: No about information');
      expect(formatted).toContain('NIP-05: Not set');
    });

    it('should handle malformed content', () => {
      const profileEvent: NostrEvent = {
        id: 'profile-id',
        pubkey: testKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 0,
        tags: [],
        content: 'invalid json',
        sig: 'test-sig'
      };

      const formatted = formatProfile(profileEvent);

      expect(formatted).toContain('Name: Unknown');
      expect(formatted).toContain('Display Name: Unknown');
    });

    it('should handle null profile', () => {
      const formatted = formatProfile(null as any);
      expect(formatted).toBe('No profile found');
    });
  });

  describe('formatNote', () => {
    it('should format a note correctly', () => {
      const noteEvent: NostrEvent = {
        id: 'note123',
        pubkey: testKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000) - 3600,
        kind: 1,
        tags: [],
        content: 'This is a test note #nostr',
        sig: 'test-sig'
      };

      const formatted = formatNote(noteEvent);

      expect(formatted).toContain('ID: note123');
      expect(formatted).toContain('Content: This is a test note #nostr');
      expect(formatted).toContain('Created:');
      expect(formatted).toContain('---');
    });

    it('should handle null note', () => {
      const formatted = formatNote(null as any);
      expect(formatted).toBe('');
    });
  });

  describe('createNote', () => {
    it('should create a valid unsigned note', async () => {
      const result = await createNote(
        testKeys.privateKey,
        'Hello Nostr!',
        [['t', 'greeting']]
      );

      expect(result.success).toBe(true);
      expect(result.noteEvent).toBeDefined();
      expect(result.publicKey).toBe(testKeys.publicKey);

      const note = result.noteEvent;
      expect(note.kind).toBe(1);
      expect(note.content).toBe('Hello Nostr!');
      expect(note.tags).toEqual([['t', 'greeting']]);
      expect(note.pubkey).toBe(testKeys.publicKey);
      expect(note.created_at).toBeDefined();

      // Should not have id or sig yet
      expect(note.id).toBeUndefined();
      expect(note.sig).toBeUndefined();
    });

    it('should handle nsec format', async () => {
      const nsec = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5';
      const result = await createNote(
        nsec,
        'Note with nsec'
      );

      expect(result.success).toBe(true);
      expect(result.noteEvent).toBeDefined();
    });

    it('should handle invalid private key', async () => {
      const result = await createNote(
        'invalid_key',
        'This should fail'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error creating note');
    });
  });

  describe('signNote', () => {
    it('should sign a note correctly', async () => {
      // First create a note
      const createResult = await createNote(
        testKeys.privateKey,
        'Note to sign',
        [['t', 'test']]
      );

      expect(createResult.success).toBe(true);

      // Then sign it
      const signResult = await signNote(
        testKeys.privateKey,
        createResult.noteEvent
      );

      expect(signResult.success).toBe(true);
      expect(signResult.signedNote).toBeDefined();

      const signed = signResult.signedNote;
      expect(signed.id).toBeDefined();
      expect(signed.sig).toBeDefined();
      expect(signed.id).toMatch(/^[0-9a-f]{64}$/);
      expect(signed.sig).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should reject mismatched keys', async () => {
      const otherKeys = await generateKeypair();

      // Create note with one key
      const createResult = await createNote(
        testKeys.privateKey,
        'Note with key 1'
      );

      // Try to sign with different key
      const signResult = await signNote(
        otherKeys.privateKey,
        createResult.noteEvent
      );

      expect(signResult.success).toBe(false);
      expect(signResult.message).toContain('does not match');
    });
  });

  describe('publishNote', () => {
    it('should handle no relays', async () => {
      const createResult = await createNote(testKeys.privateKey, 'Test');
      const signResult = await signNote(testKeys.privateKey, createResult.noteEvent);

      const publishResult = await publishNote(
        signResult.signedNote,
        []
      );

      expect(publishResult.success).toBe(true);
      expect(publishResult.message).toContain('no relays specified');
    });
  });
});
