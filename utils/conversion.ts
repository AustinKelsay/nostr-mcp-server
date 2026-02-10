import { 
  decode, 
  encodePublicKey,
  encodePrivateKey,
  encodeNoteId,
  encodeProfile,
  encodeEvent,
  encodeAddress
} from "snstr";

/**
 * Simple relay URL validation - checks for ws:// or wss:// protocol
 */
function isValidRelayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') &&
           !!parsed.hostname &&
           !parsed.username && // No credentials in URL
           !parsed.password;
  } catch {
    return false;
  }
}

/**
 * Filter invalid relay URLs from profile data
 */
function filterProfile(profile: any): any {
  if (!profile || typeof profile !== 'object') return profile;
  
  return {
    ...profile,
    relays: profile.relays ? profile.relays.filter(isValidRelayUrl) : []
  };
}

/**
 * Filter invalid relay URLs from event data
 */
function filterEvent(event: any): any {
  if (!event || typeof event !== 'object') return event;
  
  return {
    ...event,
    relays: event.relays ? event.relays.filter(isValidRelayUrl) : []
  };
}

/**
 * Filter invalid relay URLs from address data
 */
function filterAddress(address: any): any {
  if (!address || typeof address !== 'object') return address;
  
  return {
    ...address,
    relays: address.relays ? address.relays.filter(isValidRelayUrl) : []
  };
}

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

/**
 * Universal NIP-19 entity converter
 * Converts between different NIP-19 formats and hex formats
 */
export interface ConversionInput {
  /** The input string to convert */
  input: string;
  /** The target format to convert to */
  targetType: 'npub' | 'nsec' | 'note' | 'hex' | 'nprofile' | 'nevent' | 'naddr';
  /** Additional data for complex entities (nprofile, nevent, naddr) */
  entityData?: {
    /** Relay URLs for the entity */
    relays?: string[];
    /** Author pubkey (for nevent/naddr) */
    author?: string;
    /** Event kind (for nevent/naddr) */
    kind?: number;
    /** Identifier for naddr */
    identifier?: string;
  };
}

export interface ConversionResult {
  success: boolean;
  result?: string;
  originalType?: string;
  // Alias for callers that expect a nip19decode-like shape.
  type?: string;
  targetType?: string;
  message?: string;
  data?: any;
}

/**
 * Convert any NIP-19 entity to any other format
 */
export function convertNip19Entity(options: ConversionInput): ConversionResult;
export function convertNip19Entity(input: string): ConversionResult;
export function convertNip19Entity(arg: ConversionInput | string): ConversionResult {
  // Convenience: allow callers to "decode safely" (with relay URL filtering)
  // by passing just an input string.
  if (typeof arg === "string") {
    return analyzeNip19Entity(arg);
  }

  try {
    const { input, targetType, entityData } = arg;
    const cleanInput = input.trim();

    // First, detect what type of input we have
    let sourceData: any;
    let sourceType: string | undefined;

    // Try to decode as NIP-19 entity first
    if (cleanInput.includes('1')) {
      try {
        const decoded = decode(cleanInput as `${string}1${string}`);
        sourceType = decoded.type;
        sourceData = decoded.data;
      } catch (e) {
        // Not a valid NIP-19 entity, might be hex
      }
    }

    // If not NIP-19, check if it's hex
    if (!sourceType) {
      if (/^[0-9a-fA-F]{64}$/.test(cleanInput)) {
        sourceType = 'hex';
        sourceData = cleanInput.toLowerCase();
      } else {
        return {
          success: false,
          message: 'Input is not a valid NIP-19 entity or hex string'
        };
      }
    }

    // Apply security filtering for complex types
    if (['nprofile', 'nevent', 'naddr'].includes(sourceType)) {
      if (sourceType === 'nprofile') {
        sourceData = filterProfile(sourceData);
      } else if (sourceType === 'nevent') {
        sourceData = filterEvent(sourceData);
      } else if (sourceType === 'naddr') {
        sourceData = filterAddress(sourceData);
      }
    }

    // Now convert to target type
    let result: string;

    switch (targetType) {
      case 'hex':
        const hexResult = extractHexFromEntity(sourceType, sourceData);
        if (!hexResult) throw new Error('Cannot extract hex from input');
        result = hexResult;
        break;

      case 'npub':
        const pubkeyHex = extractHexFromEntity(sourceType, sourceData);
        if (!pubkeyHex) throw new Error('Cannot extract pubkey from input');
        result = encodePublicKey(pubkeyHex);
        break;

      case 'nsec':
        if (sourceType !== 'nsec' && sourceType !== 'hex') {
          throw new Error('Can only convert private keys to nsec format');
        }
        const privkeyHex = sourceData;
        result = encodePrivateKey(privkeyHex);
        break;

      case 'note':
        if (sourceType === 'nevent') {
          result = encodeNoteId(sourceData.id);
        } else if (sourceType === 'note') {
          result = cleanInput; // Already a note
        } else if (sourceType === 'hex') {
          result = encodeNoteId(sourceData);
        } else {
          throw new Error('Cannot convert this entity type to note format');
        }
        break;

      case 'nprofile':
        const profilePubkey = extractHexFromEntity(sourceType, sourceData);
        if (!profilePubkey) throw new Error('Cannot extract pubkey from input');
        
        const profileData = {
          pubkey: profilePubkey,
          relays: entityData?.relays?.filter(url => isValidRelayUrl(url)) || []
        };
        result = encodeProfile(profileData);
        break;

      case 'nevent':
        let eventId: string;
        if (sourceType === 'nevent') {
          eventId = sourceData.id;
        } else if (sourceType === 'note') {
          eventId = sourceData;
        } else if (sourceType === 'hex') {
          eventId = sourceData;
        } else {
          throw new Error('Cannot convert this entity type to nevent format');
        }

        const eventData = {
          id: eventId,
          relays: entityData?.relays?.filter(url => isValidRelayUrl(url)) || [],
          ...(entityData?.author && { author: entityData.author }),
          ...(entityData?.kind && { kind: entityData.kind })
        };
        result = encodeEvent(eventData);
        break;

      case 'naddr':
        if (!entityData?.identifier || !entityData?.kind) {
          throw new Error('naddr conversion requires identifier and kind');
        }

        const addrPubkey = extractHexFromEntity(sourceType, sourceData);
        if (!addrPubkey) {
          if (!entityData?.author) {
            throw new Error('naddr conversion requires a pubkey (from input or entityData.author)');
          }
        }

        const addressData = {
          identifier: entityData.identifier,
          pubkey: addrPubkey || entityData.author!,
          kind: entityData.kind,
          relays: entityData?.relays?.filter(url => isValidRelayUrl(url)) || []
        };
        result = encodeAddress(addressData);
        break;

      default:
        throw new Error(`Unsupported target type: ${targetType}`);
    }

    return {
      success: true,
      result,
      originalType: sourceType,
      type: sourceType,
      targetType,
      message: `Successfully converted ${sourceType} to ${targetType}`,
      data: sourceData
    };

  } catch (error) {
    return {
      success: false,
      message: `Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Extract hex data from any entity type
 * For entities that contain multiple hex values (like nevent), this function
 * prioritizes pubkeys over event IDs for compatibility with npub/nprofile conversions
 */
function extractHexFromEntity(sourceType: string, sourceData: any): string | null {
  switch (sourceType) {
    case 'hex':
      return sourceData;
    case 'npub':
    case 'nsec':
    case 'note':
      return sourceData;
    case 'nprofile':
      return sourceData.pubkey;
    case 'nevent':
      // For nevent, we return the author pubkey if available
      // This is because extractHexFromEntity is primarily used for pubkey extraction
      // when converting to npub/nprofile formats
      // If you need the event ID, access sourceData.id directly
      return sourceData.author || null;
    case 'naddr':
      return sourceData.pubkey;
    default:
      return null;
  }
}

/**
 * Get information about any NIP-19 entity without conversion
 */
export function analyzeNip19Entity(input: string): ConversionResult {
  try {
    const cleanInput = input.trim();
    
    // Check if hex
    if (/^[0-9a-fA-F]{64}$/.test(cleanInput)) {
      return {
        success: true,
        originalType: 'hex',
        type: 'hex',
        message: 'Valid 64-character hex string',
        data: cleanInput.toLowerCase()
      };
    }

    // Try to decode as NIP-19
    if (cleanInput.includes('1')) {
      const decoded = decode(cleanInput as `${string}1${string}`);
      
      // Apply security filtering for complex types
      let safeData = decoded.data;
      if (['nprofile', 'nevent', 'naddr'].includes(decoded.type)) {
        if (decoded.type === 'nprofile') {
          safeData = filterProfile(decoded.data);
        } else if (decoded.type === 'nevent') {
          safeData = filterEvent(decoded.data);
        } else if (decoded.type === 'naddr') {
          safeData = filterAddress(decoded.data);
        }
      }

      return {
        success: true,
        originalType: decoded.type,
        type: decoded.type,
        message: `Valid ${decoded.type} entity`,
        data: safeData
      };
    }

    return {
      success: false,
      message: 'Input is not a valid NIP-19 entity or hex string'
    };

  } catch (error) {
    return {
      success: false,
      message: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
} 
