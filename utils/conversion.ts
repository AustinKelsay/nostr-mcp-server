import { decode, encodePublicKey } from "snstr";

/**
 * Convert an npub or hex string to hex format
 * @param pubkey The pubkey in either npub or hex format
 * @returns The pubkey in hex format, or null if invalid
 */
export function npubToHex(pubkey: string): string | null {
  try {
    // Clean up input
    pubkey = pubkey.trim();
    
    // If already hex
    if (/^[0-9a-fA-F]{64}$/.test(pubkey)) {
      return pubkey.toLowerCase();
    }
    
    // If npub
    if (pubkey.startsWith('npub1')) {
      try {
        const result = decode(pubkey as `${string}1${string}`);
        if (result.type === 'npub') {
          return result.data;
        }
      } catch (e) {
        console.error('Error decoding npub:', e);
        return null;
      }
    }
    
    // Not a valid pubkey format
    return null;
  } catch (error) {
    console.error('Error in npubToHex:', error);
    return null;
  }
}

/**
 * Convert a hex pubkey to npub format
 * @param hex The pubkey in hex format
 * @returns The pubkey in npub format, or null if invalid
 */
export function hexToNpub(hex: string): string | null {
  try {
    // Clean up input
    hex = hex.trim();
    
    // Validate hex format
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      return null;
    }
    
    // Convert to npub
    return encodePublicKey(hex.toLowerCase());
  } catch (error) {
    console.error('Error in hexToNpub:', error);
    return null;
  }
} 