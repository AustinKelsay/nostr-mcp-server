import { RelayPool } from "snstr";

/**
 * Extended RelayPool with compatibility methods for existing codebase
 */
export class CompatibleRelayPool extends RelayPool {
  constructor(relays: string[] = []) {
    super(relays);
  }

  /**
   * Compatibility method to match existing codebase API
   * Maps to snstr's querySync method
   */
  async get(relays: string[], filter: NostrFilter): Promise<NostrEvent | null> {
    try {
      const events = await this.querySync(relays, filter, { timeout: 8000 });
      return events.length > 0 ? events[0] : null;
    } catch (error) {
      console.error('Error in pool.get:', error);
      return null;
    }
  }

  /**
   * Compatibility method to match existing codebase API  
   * Maps to snstr's querySync method for multiple events
   */
  async getMany(relays: string[], filter: NostrFilter): Promise<NostrEvent[]> {
    try {
      return await this.querySync(relays, filter, { timeout: 8000 });
    } catch (error) {
      console.error('Error in pool.getMany:', error);
      return [];
    }
  }

  /**
   * Compatibility method to match existing codebase API
   * Maps to snstr's close method but ignores relay parameter
   */
  async close(_relays?: string[]): Promise<void> {
    try {
      await super.close();
    } catch (error) {
      console.error('Error in pool.close:', error);
    }
  }
}

/**
 * Create a fresh RelayPool instance for making Nostr requests
 * @returns A new CompatibleRelayPool instance
 */
export function getFreshPool(relays: string[] = []): CompatibleRelayPool {
  return new CompatibleRelayPool(relays);
}

/**
 * Interface for Nostr events
 */
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Interface for Nostr filter parameters
 */
export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [key: string]: unknown;
  [key: `#${string}`]: string[];
} 
