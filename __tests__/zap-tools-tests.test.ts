import { describe, it, expect, beforeAll } from 'bun:test';
import { generateKeypair, createEvent, getEventHash, signEvent } from 'snstr';
import { NostrEvent } from '../utils/index.js';
import { 
  processZapReceipt, 
  validateZapReceipt, 
  formatZapReceipt,
  parseZapRequestData,
  determineZapDirection,
  ZapReceipt,
  CachedZap 
} from '../zap/zap-tools.js';

describe('Zap Processing Functions', () => {
  let testKeys: { publicKey: string; privateKey: string };
  let zapperKeys: { publicKey: string; privateKey: string };
  
  beforeAll(async () => {
    testKeys = await generateKeypair();
    zapperKeys = await generateKeypair();
  });

  describe('validateZapReceipt', () => {
    it('should validate a proper zap receipt', () => {
      const zapReceipt: NostrEvent = {
        id: 'test-id',
        pubkey: zapperKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 9735,
        tags: [
          ['p', testKeys.publicKey],
          ['bolt11', 'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52x86fux2ypatgddc6k63n7erqz25le42c4u4ecky03ylcqca784w'],
          ['description', JSON.stringify({ 
            kind: 9734, 
            content: 'Test zap',
            tags: [['p', testKeys.publicKey]],
            pubkey: 'sender-pubkey'
          })]
        ],
        content: '',
        sig: 'test-sig'
      };

      const result = validateZapReceipt(zapReceipt);
      
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject invalid kind', () => {
      const invalidReceipt: NostrEvent = {
        id: 'test-id',
        pubkey: zapperKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1, // Wrong kind
        tags: [],
        content: '',
        sig: 'test-sig'
      };

      const result = validateZapReceipt(invalidReceipt);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Not a zap receipt');
    });

    it('should reject missing bolt11 tag', () => {
      const invalidReceipt: NostrEvent = {
        id: 'test-id',
        pubkey: zapperKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 9735,
        tags: [
          ['p', testKeys.publicKey],
          ['description', '{}'] // Missing bolt11
        ],
        content: '',
        sig: 'test-sig'
      };

      const result = validateZapReceipt(invalidReceipt);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing bolt11');
    });
  });

  describe('parseZapRequestData', () => {
    it('should parse zap request from description tag', () => {
      const zapRequest = {
        kind: 9734,
        content: 'Great post!',
        tags: [
          ['p', testKeys.publicKey],
          ['amount', '100000']
        ],
        pubkey: 'sender-pubkey',
        created_at: Math.floor(Date.now() / 1000)
      };

      const zapReceipt: NostrEvent = {
        id: 'test-id',
        pubkey: zapperKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 9735,
        tags: [
          ['p', testKeys.publicKey],
          ['bolt11', 'lnbc1pvjluez'],
          ['description', JSON.stringify(zapRequest)]
        ],
        content: '',
        sig: 'test-sig'
      };

      const result = parseZapRequestData(zapReceipt);
      
      expect(result).toBeDefined();
      expect(result?.content).toBe('Great post!');
      expect(result?.pubkey).toBe('sender-pubkey');
      expect(result?.amount).toBe(100000);
    });

    it('should handle missing description tag', () => {
      const zapReceipt: NostrEvent = {
        id: 'test-id',
        pubkey: zapperKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 9735,
        tags: [
          ['p', testKeys.publicKey],
          ['bolt11', 'lnbc10u1p...']
        ],
        content: '',
        sig: 'test-sig'
      };

      const result = parseZapRequestData(zapReceipt);
      
      expect(result).toBeUndefined();
    });
  });

  describe('determineZapDirection', () => {
    it('should identify received zaps', () => {
      const zapReceipt: ZapReceipt = {
        id: 'test-id',
        pubkey: zapperKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 9735,
        tags: [
          ['p', testKeys.publicKey], // Recipient
          ['P', 'sender-pubkey'] // Sender
        ],
        content: '',
        sig: 'test-sig'
      };

      const direction = determineZapDirection(zapReceipt, testKeys.publicKey);
      
      expect(direction).toBe('received');
    });

    it('should identify sent zaps', () => {
      const zapReceipt: ZapReceipt = {
        id: 'test-id',
        pubkey: zapperKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 9735,
        tags: [
          ['p', 'recipient-pubkey'], // Recipient
          ['P', testKeys.publicKey] // Sender
        ],
        content: '',
        sig: 'test-sig'
      };

      const direction = determineZapDirection(zapReceipt, testKeys.publicKey);
      
      expect(direction).toBe('sent');
    });

    it('should identify self zaps', () => {
      const zapReceipt: ZapReceipt = {
        id: 'test-id',
        pubkey: zapperKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 9735,
        tags: [
          ['p', testKeys.publicKey], // Recipient
          ['P', testKeys.publicKey] // Sender (same)
        ],
        content: '',
        sig: 'test-sig'
      };

      const direction = determineZapDirection(zapReceipt, testKeys.publicKey);
      
      expect(direction).toBe('self');
    });
  });

  describe('formatZapReceipt', () => {
    it('should format a zap receipt', () => {
      const zapRequest = {
        kind: 9734,
        content: 'Great content!',
        tags: [
          ['p', testKeys.publicKey],
          ['amount', '50000']
        ],
        pubkey: 'sender-pubkey',
        created_at: Math.floor(Date.now() / 1000)
      };

      const zapReceipt: NostrEvent = {
        id: 'abcdef123456',
        pubkey: zapperKeys.publicKey,
        created_at: Math.floor(Date.now() / 1000) - 3600,
        kind: 9735,
        tags: [
          ['p', testKeys.publicKey],
          ['P', 'sender-pubkey'],
          ['bolt11', 'lnbc1pvjluez'],
          ['description', JSON.stringify(zapRequest)]
        ],
        content: '',
        sig: 'test-sig'
      };

      const formatted = formatZapReceipt(zapReceipt, testKeys.publicKey);
      
      // The format has changed, so we check for key elements
      expect(formatted).toContain('RECEIVED');
      expect(formatted).toContain('Great content!');
      expect(formatted).toContain('From: sender-');
    });
  });
});