import { describe, it, expect } from 'bun:test';
import { createNote, signNote, publishNote } from '../note/note-tools.js';
import { createKeypair } from '../profile/profile-tools.js';
import { schnorr } from '@noble/curves/secp256k1';

describe('Note Creation Tools', () => {
  describe('createNote', () => {
    it('should create a valid unsigned note event', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const result = await createNote(
        privateKey!,
        'Hello Nostr world!',
        [['t', 'test']]
      );
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('created successfully');
      expect(result.noteEvent).toBeDefined();
      expect(result.publicKey).toBeDefined();
      
      // Check the note event structure
      const note = result.noteEvent;
      expect(note.kind).toBe(1);
      expect(note.content).toBe('Hello Nostr world!');
      expect(note.tags).toEqual([['t', 'test']]);
      expect(note.pubkey).toBe(result.publicKey);
      expect(note.created_at).toBeDefined();
      expect(typeof note.created_at).toBe('number');
      
      // Should not have id or sig (unsigned)
      expect(note.id).toBeUndefined();
      expect(note.sig).toBeUndefined();
    });

    it('should create a note with no tags', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const result = await createNote(
        privateKey!,
        'Simple note without tags'
      );
      
      expect(result.success).toBe(true);
      expect(result.noteEvent.tags).toEqual([]);
    });

    it('should handle nsec format private keys', async () => {
      const { nsec } = await createKeypair('npub');
      
      const result = await createNote(
        nsec!,
        'Note with nsec key'
      );
      
      expect(result.success).toBe(true);
      expect(result.noteEvent).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    it('should fail with invalid private key', async () => {
      const result = await createNote(
        'invalid_private_key',
        'This should fail'
      );
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Error creating note');
    });
  });

  describe('signNote', () => {
    it('should sign a note event correctly', async () => {
      const { privateKey } = await createKeypair('hex');
      
      // First create a note
      const createResult = await createNote(
        privateKey!,
        'Note to be signed',
        [['hashtag', 'test']]
      );
      
      expect(createResult.success).toBe(true);
      
      // Then sign it
      const signResult = await signNote(
        privateKey!,
        createResult.noteEvent
      );
      
      expect(signResult.success).toBe(true);
      expect(signResult.message).toContain('signed successfully');
      expect(signResult.signedNote).toBeDefined();
      
      // Check the signed note structure
      const signedNote = signResult.signedNote;
      expect(signedNote.id).toBeDefined();
      expect(signedNote.sig).toBeDefined();
      expect(signedNote.kind).toBe(1);
      expect(signedNote.content).toBe('Note to be signed');
      expect(signedNote.tags).toEqual([['hashtag', 'test']]);
      expect(signedNote.pubkey).toBe(createResult.publicKey);
      
      // Verify the signature is valid (basic check)
      expect(typeof signedNote.id).toBe('string');
      expect(signedNote.id).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof signedNote.sig).toBe('string');
      expect(signedNote.sig).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should fail when private key does not match note pubkey', async () => {
      const { privateKey: privateKey1 } = await createKeypair('hex');
      const { privateKey: privateKey2 } = await createKeypair('hex');
      
      // Create note with first key
      const createResult = await createNote(
        privateKey1!,
        'Note created with key 1'
      );
      
      expect(createResult.success).toBe(true);
      
      // Try to sign with second key
      const signResult = await signNote(
        privateKey2!,
        createResult.noteEvent
      );
      
      expect(signResult.success).toBe(false);
      expect(signResult.message).toContain('does not match');
    });

    it('should handle nsec format private keys', async () => {
      const { nsec, npub } = await createKeypair('npub');
      
      // Create note using nsec
      const createResult = await createNote(
        nsec!,
        'Note with nsec'
      );
      
      expect(createResult.success).toBe(true);
      
      // Sign note using nsec
      const signResult = await signNote(
        nsec!,
        createResult.noteEvent
      );
      
      expect(signResult.success).toBe(true);
      expect(signResult.signedNote).toBeDefined();
    });
  });

  describe('publishNote', () => {
    it('should handle publishing with no relays', async () => {
      const { privateKey } = await createKeypair('hex');
      
      // Create and sign a note
      const createResult = await createNote(privateKey!, 'Test note');
      const signResult = await signNote(privateKey!, createResult.noteEvent);
      
      expect(createResult.success).toBe(true);
      expect(signResult.success).toBe(true);
      
      // Publish with no relays
      const publishResult = await publishNote(
        signResult.signedNote,
        []
      );
      
      expect(publishResult.success).toBe(true);
      expect(publishResult.message).toContain('no relays specified');
      expect(publishResult.noteId).toBe(signResult.signedNote.id);
    });

    it('should validate note structure', async () => {
      const { privateKey } = await createKeypair('hex');
      
      // Create and sign a note
      const createResult = await createNote(privateKey!, 'Valid note');
      const signResult = await signNote(privateKey!, createResult.noteEvent);
      
      expect(createResult.success).toBe(true);
      expect(signResult.success).toBe(true);
      
      // The note should have all required fields
      const note = signResult.signedNote;
      expect(note.id).toBeDefined();
      expect(note.pubkey).toBeDefined();
      expect(note.created_at).toBeDefined();
      expect(note.kind).toBe(1);
      expect(note.tags).toBeDefined();
      expect(note.content).toBe('Valid note');
      expect(note.sig).toBeDefined();
    });
  });

  describe('Full workflow', () => {
    it('should complete a full note creation, signing, and publishing workflow', async () => {
      const { privateKey } = await createKeypair('hex');
      
      // Step 1: Create note
      const createResult = await createNote(
        privateKey!,
        'Complete workflow test',
        [['t', 'workflow'], ['client', 'test']]
      );
      
      expect(createResult.success).toBe(true);
      expect(createResult.noteEvent.kind).toBe(1);
      expect(createResult.noteEvent.content).toBe('Complete workflow test');
      
      // Step 2: Sign note
      const signResult = await signNote(
        privateKey!,
        createResult.noteEvent
      );
      
      expect(signResult.success).toBe(true);
      expect(signResult.signedNote.id).toBeDefined();
      expect(signResult.signedNote.sig).toBeDefined();
      
      // Step 3: Publish note (no relays for testing)
      const publishResult = await publishNote(
        signResult.signedNote,
        []
      );
      
      expect(publishResult.success).toBe(true);
      expect(publishResult.noteId).toBe(signResult.signedNote.id);
      
      // Verify the complete signed event
      const finalNote = signResult.signedNote;
      expect(finalNote.id).toMatch(/^[0-9a-f]{64}$/);
      expect(finalNote.sig).toMatch(/^[0-9a-f]{128}$/);
      expect(finalNote.pubkey).toBe(createResult.publicKey);
      expect(finalNote.content).toBe('Complete workflow test');
      expect(finalNote.tags).toEqual([['t', 'workflow'], ['client', 'test']]);
    });
  });
});