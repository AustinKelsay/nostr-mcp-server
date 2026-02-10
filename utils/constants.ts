// Set a reasonable timeout for queries
export const QUERY_TIMEOUT = 8000;

// Define default relays
export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://purplerelay.com",
  "wss://nostr.land"
];

// Add more popular relays that we can try if the default ones fail
export const FALLBACK_RELAYS = [
  "wss://nostr.mom",
  "wss://nostr.noones.com",
  "wss://nostr-pub.wellorder.net",
  "wss://nostr.bitcoiner.social",
  "wss://at.nostrworks.com",
  "wss://lightningrelay.com",
];

// Define event kinds
export const KINDS = {
  // NIP-01 / common kinds
  METADATA: 0,
  TEXT: 1,
  CONTACT_LIST: 3,
  DELETE: 5,
  REPOST: 6,
  REACTION: 7,
  ZAP_REQUEST: 9734,
  ZAP_RECEIPT: 9735,

  // Back-compat aliases (older naming used in parts of this repo)
  Metadata: 0,
  Text: 1,
  ContactList: 3,
  Delete: 5,
  Repost: 6,
  Reaction: 7,
  ZapRequest: 9734,
  ZapReceipt: 9735,
};
