import { describe, it, expect, beforeAll } from 'bun:test';
import { generateKeypair } from 'snstr';
import { NostrEvent } from '../utils/index.js';
import { 
  formatProfile, 
  formatNote,
} from '../note/note-tools.js';

describe('Note Tools Unit Tests', () => {
  let testKeys: { publicKey: string; privateKey: string };
  
  beforeAll(async () => {
    testKeys = await generateKeypair();
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
});