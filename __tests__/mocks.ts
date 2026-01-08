// Mock Nostr events and utility functions for testing
import { mock } from 'bun:test';

export const MOCK_HEX_PUBKEY = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
export const MOCK_NPUB = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6';

export const mockProfile = {
  id: '1234',
  pubkey: MOCK_HEX_PUBKEY,
  created_at: Math.floor(Date.now() / 1000) - 3600,
  kind: 0,
  tags: [],
  content: JSON.stringify({
    name: 'Test User',
    display_name: 'Tester',
    about: 'A test profile for unit tests',
    picture: 'https://example.com/avatar.jpg',
    nip05: 'test@example.com'
  }),
  sig: 'mock_signature'
};

export const mockNote = {
  id: '5678',
  pubkey: MOCK_HEX_PUBKEY,
  created_at: Math.floor(Date.now() / 1000) - 1800,
  kind: 1,
  tags: [],
  content: 'This is a test note from the test user.',
  sig: 'mock_signature'
};

export const mockLongFormNote = {
  id: '9012',
  pubkey: MOCK_HEX_PUBKEY,
  created_at: Math.floor(Date.now() / 1000) - 86400,
  kind: 30023,
  tags: [
    ['title', 'Test Long Form Content'],
    ['summary', 'This is a test summary of a long form article'],
    ['published_at', (Math.floor(Date.now() / 1000) - 86400).toString()],
    ['d', 'test-identifier']
  ],
  content: 'This is a test long form content article with much more text than a normal note would have.',
  sig: 'mock_signature'
};

export const mockZapReceipt = {
  id: 'abcd',
  pubkey: 'lightning_service_pubkey',
  created_at: Math.floor(Date.now() / 1000) - 900,
  kind: 9735,
  tags: [
    ['p', MOCK_HEX_PUBKEY],
    ['bolt11', 'lnbc100n1...'],
    ['description', JSON.stringify({
      content: '',
      created_at: Math.floor(Date.now() / 1000) - 901,
      id: 'zap_request_id',
      kind: 9734,
      pubkey: 'sender_pubkey',
      tags: [
        ['amount', '10000'], // 100 sats in millisats
        ['relays', 'wss://relay.example.com'],
        ['p', MOCK_HEX_PUBKEY]
      ]
    })]
  ],
  content: '',
  sig: 'mock_signature'
};

// Mock response for lightning service for anonymous zaps
export const mockLightningServiceResponse = {
  callback: 'https://example.com/callback',
  maxSendable: 100000000,
  minSendable: 1000,
  metadata: JSON.stringify({
    name: 'Test User',
    pubkey: MOCK_HEX_PUBKEY
  }),
  allowsNostr: true,
  nostrPubkey: MOCK_HEX_PUBKEY
};

// Mock response for invoice generation
export const mockInvoiceResponse = {
  pr: 'lnbc100n1...',  // Mock lightning invoice
  success: true,
  verify: 'https://example.com/verify'
};

// Mock response for NIP search
export const mockNipSearchResults = [
  {
    number: 57,
    title: 'Lightning Zaps',
    summary: 'This NIP defines a protocol for sending zaps via the Lightning Network.',
    relevance: 0.95,
    content: '# NIP-57\n\n## Lightning Zaps\n\nThis is mock content for the zaps NIP.'
  },
  {
    number: 1,
    title: 'Basic protocol flow description',
    summary: 'Basic protocol flow and interaction between clients and relays.',
    relevance: 0.5,
    content: '# NIP-01\n\n## Basic protocol flow description\n\nThis is mock content for the basic protocol NIP.'
  }
]; 