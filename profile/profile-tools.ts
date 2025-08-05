import { z } from "zod";
import {
  DEFAULT_RELAYS
} from "../utils/index.js";
import { generateKeypair, createEvent, getEventHash, signEvent, decode as nip19decode, encodePublicKey, encodePrivateKey } from "snstr";
import { getFreshPool } from "../utils/index.js";
import { schnorr } from '@noble/curves/secp256k1';

// Schema for createKeypair tool
export const createKeypairToolConfig = {
  format: z.enum(["both", "hex", "npub"]).default("both").describe("Format to return keys in: hex only, npub only, or both"),
};

// Schema for createProfile tool
export const createProfileToolConfig = {
  privateKey: z.string().describe("Private key to sign the profile with (hex format or nsec format)"),
  name: z.string().optional().describe("Display name for the profile"),
  about: z.string().optional().describe("About/bio text for the profile"),
  picture: z.string().optional().describe("URL to profile picture"),
  nip05: z.string().optional().describe("NIP-05 identifier (like email@domain.com)"),
  lud16: z.string().optional().describe("Lightning address for receiving payments"),
  lud06: z.string().optional().describe("LNURL for receiving payments"),
  website: z.string().optional().describe("Personal website URL"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to publish to"),
};

// Schema for updateProfile tool
export const updateProfileToolConfig = {
  privateKey: z.string().describe("Private key to sign the profile with (hex format or nsec format)"),
  name: z.string().optional().describe("Display name for the profile"),
  about: z.string().optional().describe("About/bio text for the profile"),
  picture: z.string().optional().describe("URL to profile picture"),
  nip05: z.string().optional().describe("NIP-05 identifier (like email@domain.com)"),
  lud16: z.string().optional().describe("Lightning address for receiving payments"),
  lud06: z.string().optional().describe("LNURL for receiving payments"),
  website: z.string().optional().describe("Personal website URL"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to publish to"),
};

// Schema for postNote tool
export const postNoteToolConfig = {
  privateKey: z.string().describe("Private key to sign the note with (hex format or nsec format)"),
  content: z.string().describe("Content of the note to post"),
  tags: z.array(z.array(z.string())).optional().describe("Optional tags to include with the note"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to publish to"),
};

// Helper function to convert private key to hex if nsec format
function normalizePrivateKey(privateKey: string): string {
  if (privateKey.startsWith('nsec')) {
    // Validate nsec format before type assertion
    if (!/^nsec1[0-9a-z]+$/.test(privateKey)) {
      throw new Error('Invalid nsec format: must match pattern nsec1[0-9a-z]+');
    }
    
    const decoded = nip19decode(privateKey as `${string}1${string}`);
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec format');
    }
    return decoded.data;
  }
  
  // Validate hex format for non-nsec keys
  if (!/^[0-9a-f]{64}$/.test(privateKey)) {
    throw new Error('Invalid private key format: must be 64-character hex string or valid nsec format');
  }
  
  return privateKey;
}

// Helper function to derive public key from private key
function getPublicKeyFromPrivate(privateKey: string): string {
  return Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex');
}

/**
 * Generate a new Nostr keypair
 */
export async function createKeypair(
  format: "both" | "hex" | "npub" = "both"
): Promise<{ publicKey?: string, privateKey?: string, npub?: string, nsec?: string }> {
  try {
    // Generate a new keypair
    const keys = await generateKeypair();
    
    const result: { publicKey?: string, privateKey?: string, npub?: string, nsec?: string } = {};
    
    if (format === "hex" || format === "both") {
      result.publicKey = keys.publicKey;
      result.privateKey = keys.privateKey;
    }
    
    if (format === "npub" || format === "both") {
      result.npub = encodePublicKey(keys.publicKey);
      result.nsec = encodePrivateKey(keys.privateKey);
    }
    
    return result;
  } catch (error) {
    throw new Error(`Failed to generate keypair: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Create a new Nostr profile (kind 0 event)
 */
export async function createProfile(
  privateKey: string,
  profileData: {
    name?: string;
    about?: string;
    picture?: string;
    nip05?: string;
    lud16?: string;
    lud06?: string;
    website?: string;
  },
  relays: string[] = DEFAULT_RELAYS
): Promise<{ success: boolean, message: string, eventId?: string, publicKey?: string }> {
  try {
    // Normalize private key
    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    
    // Derive public key from private key
    const publicKey = getPublicKeyFromPrivate(normalizedPrivateKey);
    
    // Create profile metadata object
    const metadata: {
      name?: string;
      about?: string;
      picture?: string;
      nip05?: string;
      lud16?: string;
      lud06?: string;
      website?: string;
    } = {};
    if (profileData.name) metadata.name = profileData.name;
    if (profileData.about) metadata.about = profileData.about;
    if (profileData.picture) metadata.picture = profileData.picture;
    if (profileData.nip05) metadata.nip05 = profileData.nip05;
    if (profileData.lud16) metadata.lud16 = profileData.lud16;
    if (profileData.lud06) metadata.lud06 = profileData.lud06;
    if (profileData.website) metadata.website = profileData.website;
    
    // Create a fresh pool for this request
    const pool = getFreshPool(relays);
    
    try {
      // Create the profile event template
      const profileTemplate = createEvent({
        kind: 0, // kind 0 is profile metadata
        content: JSON.stringify(metadata),
        tags: []
      }, publicKey);
      
      // Get event hash and sign it
      const eventId = await getEventHash(profileTemplate);
      const signature = await signEvent(eventId, normalizedPrivateKey);
      
      // Create complete signed event
      const signedProfile = {
        ...profileTemplate,
        id: eventId,
        sig: signature
      };
      
      // If no relays specified, just return success with event creation
      if (relays.length === 0) {
        return {
          success: true,
          message: 'Profile event created successfully (no relays specified for publishing)',
          eventId: signedProfile.id,
          publicKey: publicKey,
        };
      }
      
      // Publish to relays - pool.publish returns array of promises
      const pubPromises = pool.publish(relays, signedProfile);
      
      // Wait for all publish attempts to complete or timeout
      const results = await Promise.allSettled(pubPromises);
      
      // Check if at least one relay accepted the profile
      const successCount = results.filter(r => 
        r.status === 'fulfilled' && r.value?.success === true
      ).length;
      
      if (successCount === 0) {
        return {
          success: false,
          message: 'Failed to publish profile to any relay',
        };
      }
      
      return {
        success: true,
        message: `Profile published to ${successCount}/${relays.length} relays`,
        eventId: signedProfile.id,
        publicKey: publicKey,
      };
    } catch (error) {
      console.error("Error creating profile:", error);
      
      return {
        success: false,
        message: `Error creating profile: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    } finally {
      // Clean up any subscriptions and close the pool
      await pool.close();
    }
  } catch (error) {
    return {
      success: false,
      message: `Fatal error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Update an existing Nostr profile (kind 0 event)
 * This creates a new profile event that replaces the previous one
 */
export async function updateProfile(
  privateKey: string,
  profileData: {
    name?: string;
    about?: string;
    picture?: string;
    nip05?: string;
    lud16?: string;
    lud06?: string;
    website?: string;
  },
  relays: string[] = DEFAULT_RELAYS
): Promise<{ success: boolean, message: string, eventId?: string, publicKey?: string }> {
  // For kind 0 events (profiles), updating is the same as creating
  // The newest event replaces the older one
  return createProfile(privateKey, profileData, relays);
}

/**
 * Post a note using an existing private key (authenticated posting)
 * This is a convenient all-in-one function that creates, signs, and publishes a note
 */
export async function postNote(
  privateKey: string,
  content: string,
  tags: string[][] = [],
  relays: string[] = DEFAULT_RELAYS
): Promise<{ success: boolean, message: string, noteId?: string, publicKey?: string }> {
  try {
    // console.log(`Preparing to post authenticated note to ${relays.join(", ")}`);
    
    // Normalize private key
    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    
    // Derive public key from private key
    const publicKey = getPublicKeyFromPrivate(normalizedPrivateKey);
    
    // Create a fresh pool for this request
    const pool = getFreshPool(relays);
    
    try {
      // Create the note event template
      const noteTemplate = createEvent({
        kind: 1, // kind 1 is a text note
        content,
        tags
      }, publicKey);
      
      // Get event hash and sign it
      const eventId = await getEventHash(noteTemplate);
      const signature = await signEvent(eventId, normalizedPrivateKey);
      
      // Create complete signed event
      const signedNote = {
        ...noteTemplate,
        id: eventId,
        sig: signature
      };
      
      // If no relays specified, just return success with event creation
      if (relays.length === 0) {
        return {
          success: true,
          message: 'Note created and signed successfully (no relays specified for publishing)',
          noteId: signedNote.id,
          publicKey: publicKey,
        };
      }
      
      // Publish to relays - pool.publish returns array of promises
      const pubPromises = pool.publish(relays, signedNote);
      
      // Wait for all publish attempts to complete or timeout
      const results = await Promise.allSettled(pubPromises);
      
      // Check if at least one relay accepted the note
      const successCount = results.filter(r => 
        r.status === 'fulfilled' && r.value?.success === true
      ).length;
      
      if (successCount === 0) {
        return {
          success: false,
          message: 'Failed to publish note to any relay',
        };
      }
      
      return {
        success: true,
        message: `Note published to ${successCount}/${relays.length} relays`,
        noteId: signedNote.id,
        publicKey: publicKey,
      };
    } catch (error) {
      console.error("Error posting note:", error);
      
      return {
        success: false,
        message: `Error posting note: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    } finally {
      // Clean up any subscriptions and close the pool
      await pool.close();
    }
  } catch (error) {
    return {
      success: false,
      message: `Fatal error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}