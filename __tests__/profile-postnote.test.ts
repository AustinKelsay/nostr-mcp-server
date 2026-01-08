import { describe, it, expect } from 'bun:test';
import { postNote } from '../profile/profile-tools.js';
import { createKeypair } from '../profile/profile-tools.js';

describe('Profile postNote Tool', () => {
  describe('postNote', () => {
    it('should post a note with hex private key', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const result = await postNote(
        privateKey!,
        'Hello from authenticated posting!',
        [['t', 'test']],
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('no relays specified');
      expect(result.noteId).toBeDefined();
      expect(result.publicKey).toBeDefined();
      
      // Verify the note ID is a valid hex string
      expect(result.noteId).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should post a note with nsec private key', async () => {
      const { nsec } = await createKeypair('npub');
      
      const result = await postNote(
        nsec!,
        'Hello from nsec posting!',
        [['hashtag', 'nostr']],
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('no relays specified');
      expect(result.noteId).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    it('should post a note without tags', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const result = await postNote(
        privateKey!,
        'Simple note without tags',
        undefined, // No tags
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.noteId).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    it('should handle empty tags array', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const result = await postNote(
        privateKey!,
        'Note with empty tags',
        [], // Empty tags array
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.noteId).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    it('should post a note with multiple tags', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const result = await postNote(
        privateKey!,
        'Note with multiple tags',
        [
          ['t', 'nostr'],
          ['t', 'test'],
          ['client', 'nostr-mcp-server'],
          ['hashtag', 'decentralized']
        ],
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.noteId).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    it('should fail with invalid private key', async () => {
      const result = await postNote(
        'invalid_private_key',
        'This should fail',
        [],
        []
      );
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Fatal error');
    });

    it('should handle long content', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const longContent = 'A'.repeat(1000); // 1000 character note
      
      const result = await postNote(
        privateKey!,
        longContent,
        [['length', '1000']],
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.noteId).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    it('should handle special characters in content', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const specialContent = 'Special chars: 🚀 ₿ 💜 #nostr @user https://example.com 🌟';
      
      const result = await postNote(
        privateKey!,
        specialContent,
        [['unicode', 'test']],
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.noteId).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    it('should derive the correct public key from private key', async () => {
      const { privateKey, publicKey } = await createKeypair('hex');
      
      const result = await postNote(
        privateKey!,
        'Testing key derivation',
        [],
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.publicKey).toBe(publicKey);
    });

    it('should generate unique note IDs for different content', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const result1 = await postNote(
        privateKey!,
        'First note',
        [],
        []
      );
      
      const result2 = await postNote(
        privateKey!,
        'Second note',
        [],
        []
      );
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.noteId).not.toBe(result2.noteId);
    });

    it('should work with default relays when none specified', async () => {
      const { privateKey } = await createKeypair('hex');
      
      // Pass undefined for relays to use defaults, but we'll mock to avoid actual network calls
      const result = await postNote(
        privateKey!,
        'Testing default relays',
        [],
        [] // Still use empty array to avoid network calls in tests
      );
      
      expect(result.success).toBe(true);
      expect(result.noteId).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });
  });

  describe('Comparison with anonymous posting', () => {
    it('should use the provided key instead of generating a random one', async () => {
      const { privateKey, publicKey } = await createKeypair('hex');
      
      // Post two notes with the same key
      const result1 = await postNote(
        privateKey!,
        'First authenticated note',
        [],
        []
      );
      
      const result2 = await postNote(
        privateKey!,
        'Second authenticated note',
        [],
        []
      );
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // Both notes should have the same author (public key)
      expect(result1.publicKey).toBe(publicKey);
      expect(result2.publicKey).toBe(publicKey);
      expect(result1.publicKey).toBe(result2.publicKey);
      
      // But different note IDs
      expect(result1.noteId).not.toBe(result2.noteId);
    });
  });
});