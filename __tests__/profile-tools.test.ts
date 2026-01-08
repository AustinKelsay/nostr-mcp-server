import { describe, it, expect } from 'bun:test';
import { createKeypair, createProfile, updateProfile } from '../profile/profile-tools.js';
import { schnorr } from '@noble/curves/secp256k1';

describe('Profile Tools', () => {
  describe('createKeypair', () => {
    it('should generate a valid keypair in both formats by default', async () => {
      const result = await createKeypair();
      
      expect(result.publicKey).toBeDefined();
      expect(result.privateKey).toBeDefined();
      expect(result.npub).toBeDefined();
      expect(result.nsec).toBeDefined();
      
      // Check hex format
      expect(result.publicKey).toMatch(/^[0-9a-f]{64}$/);
      expect(result.privateKey).toMatch(/^[0-9a-f]{64}$/);
      
      // Check npub/nsec format
      expect(result.npub).toMatch(/^npub1[0-9a-z]+$/);
      expect(result.nsec).toMatch(/^nsec1[0-9a-z]+$/);
    });

    it('should generate only hex format when requested', async () => {
      const result = await createKeypair('hex');
      
      expect(result.publicKey).toBeDefined();
      expect(result.privateKey).toBeDefined();
      expect(result.npub).toBeUndefined();
      expect(result.nsec).toBeUndefined();
    });

    it('should generate only npub format when requested', async () => {
      const result = await createKeypair('npub');
      
      expect(result.publicKey).toBeUndefined();
      expect(result.privateKey).toBeUndefined();
      expect(result.npub).toBeDefined();
      expect(result.nsec).toBeDefined();
    });

    it('should generate cryptographically valid keypairs', async () => {
      const result = await createKeypair('hex');

      // Verify that the public key can be derived from the private key
      const derivedPubkey = Buffer.from(schnorr.getPublicKey(result.privateKey!)).toString('hex');
      expect(derivedPubkey).toBe(result.publicKey!);
    });
  });

  describe('createProfile', () => {
    it('should create a profile with minimal data', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const result = await createProfile(
        privateKey!,
        { name: 'Test User' },
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('no relays specified');
      expect(result.eventId).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    it('should create a profile with all metadata fields', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const profileData = {
        name: 'Test User',
        about: 'A test user profile',
        picture: 'https://example.com/avatar.jpg',
        nip05: 'test@example.com',
        lud16: 'test@getalby.com',
        lud06: 'LNURL1234...',
        website: 'https://example.com'
      };
      
      const result = await createProfile(
        privateKey!,
        profileData,
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    it('should handle nsec format private keys', async () => {
      const { nsec } = await createKeypair('npub');
      
      const result = await createProfile(
        nsec!,
        { name: 'Test User' },
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    it('should fail with invalid private key', async () => {
      const result = await createProfile(
        'invalid_private_key',
        { name: 'Test User' },
        []
      );
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('error');
    });
  });

  describe('updateProfile', () => {
    it('should update a profile (same as create for kind 0)', async () => {
      const { privateKey } = await createKeypair('hex');
      
      const result = await updateProfile(
        privateKey!,
        { name: 'Updated User', about: 'Updated bio' },
        [] // No relays for testing
      );
      
      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });
  });
});