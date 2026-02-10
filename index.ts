#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import WebSocket from "ws";
import {
  NostrEvent,
  NostrFilter,
  KINDS,
  DEFAULT_RELAYS,
  QUERY_TIMEOUT,
  getFreshPool,
  npubToHex,
  formatPubkey
} from "./utils/index.js";
import {
  ZapReceipt,
  formatZapReceipt,
  processZapReceipt,
  validateZapReceipt,
  prepareAnonymousZap,
  sendAnonymousZapToolConfig,
  getReceivedZapsToolConfig,
  getSentZapsToolConfig,
  getAllZapsToolConfig
} from "./zap/zap-tools.js";
import {
  formatProfile,
  formatNote,
  getProfileToolConfig,
  getKind1NotesToolConfig,
  getLongFormNotesToolConfig,
  postAnonymousNoteToolConfig,
  postAnonymousNote,
  createNote,
  signNote,
  publishNote,
  createNoteToolConfig,
  signNoteToolConfig,
  publishNoteToolConfig
} from "./note/note-tools.js";
import {
  createKeypair,
  createProfile,
  updateProfile,
  postNote,
  createKeypairToolConfig,
  createProfileToolConfig,
  updateProfileToolConfig,
  postNoteToolConfig
} from "./profile/profile-tools.js";
import {
  convertNip19,
  analyzeNip19,
  convertNip19ToolConfig,
  analyzeNip19ToolConfig,
  formatAnalysisResult
} from "./utils/nip19-tools.js";
import {
  queryEventsToolConfig,
  queryEvents,
  formatEventsList,
  createNostrEventToolConfig,
  createNostrEvent,
  signNostrEventToolConfig,
  signNostrEvent,
  publishNostrEventToolConfig,
  publishNostrEvent
} from "./event/event-tools.js";
import {
  getContactListToolConfig,
  getContactList,
  getFollowingToolConfig,
  getFollowing,
  followToolConfig,
  follow,
  unfollowToolConfig,
  unfollow,
  reactToEventToolConfig,
  reactToEvent,
  repostEventToolConfig,
  repostEvent,
  deleteEventToolConfig,
  deleteEvent,
  replyToEventToolConfig,
  replyToEvent,
  formatContacts
} from "./social/social-tools.js";

// Set WebSocket implementation for Node.js (Bun has native WebSocket)
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

// Create server instance
const server = new McpServer({
  name: "nostr",
  version: "1.0.0",
});

// Register Nostr tools
server.tool(
  "getProfile",
  "Get a Nostr profile by public key",
  getProfileToolConfig,
  async ({ pubkey, relays }, extra) => {
    // Convert npub to hex if needed
    const hexPubkey = npubToHex(pubkey);
    if (!hexPubkey) {
      return {
        content: [
          {
            type: "text",
            text: "Invalid public key format. Please provide a valid hex pubkey or npub.",
          },
        ],
      };
    }
    
    // Generate a friendly display version of the pubkey
    const displayPubkey = formatPubkey(hexPubkey);
    
    const relaysToUse = relays || DEFAULT_RELAYS;
    // Create a fresh pool for this request
    const pool = getFreshPool(relaysToUse);
    
    try {
      console.error(`Fetching profile for ${hexPubkey} from ${relaysToUse.join(", ")}`);
      
      // Query for profile (kind 0) - snstr handles timeout internally
      const profile = await pool.get(
        relaysToUse,
        {
          kinds: [KINDS.Metadata],
          authors: [hexPubkey],
        } as NostrFilter
      );
      
      if (!profile) {
        return {
          content: [
            {
              type: "text",
              text: `No profile found for ${displayPubkey}`,
            },
          ],
        };
      }
      
      const formatted = formatProfile(profile);
      
      return {
        content: [
          {
            type: "text",
            text: `Profile for ${displayPubkey}:\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      console.error("Error fetching profile:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error fetching profile for ${displayPubkey}: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    } finally {
      // Clean up any subscriptions and close the pool
      await pool.close();
    }
  }
);

server.tool(
  "getKind1Notes",
  "Get text notes (kind 1) by public key",
  getKind1NotesToolConfig,
  async ({ pubkey, limit, relays }, extra) => {
    // Convert npub to hex if needed
    const hexPubkey = npubToHex(pubkey);
    if (!hexPubkey) {
      return {
        content: [
          {
            type: "text",
            text: "Invalid public key format. Please provide a valid hex pubkey or npub.",
          },
        ],
      };
    }
    
    // Generate a friendly display version of the pubkey
    const displayPubkey = formatPubkey(hexPubkey);
    
    const relaysToUse = relays || DEFAULT_RELAYS;
    // Create a fresh pool for this request
    const pool = getFreshPool(relaysToUse);
    
    try {
      console.error(`Fetching kind 1 notes for ${hexPubkey} from ${relaysToUse.join(", ")}`);
      
      // Query for text notes - snstr handles timeout internally
      const notes = await pool.querySync(
        relaysToUse,
        {
          kinds: [KINDS.Text],
          authors: [hexPubkey],
          limit,
        } as NostrFilter,
        { timeout: QUERY_TIMEOUT }
      );
      
      if (!notes || notes.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No notes found for ${displayPubkey}`,
            },
          ],
        };
      }
      
      // Sort notes by created_at in descending order (newest first)
      notes.sort((a, b) => b.created_at - a.created_at);
      
      const formattedNotes = notes.map(formatNote).join("\n");
      
      return {
        content: [
          {
            type: "text",
            text: `Found ${notes.length} notes from ${displayPubkey}:\n\n${formattedNotes}`,
          },
        ],
      };
    } catch (error) {
      console.error("Error fetching notes:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error fetching notes for ${displayPubkey}: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    } finally {
      // Clean up any subscriptions and close the pool
      await pool.close();
    }
  }
);

server.tool(
  "getReceivedZaps",
  "Get zaps received by a public key",
  getReceivedZapsToolConfig,
  async ({ pubkey, limit, relays, validateReceipts, debug }) => {
    // Convert npub to hex if needed
    const hexPubkey = npubToHex(pubkey);
    if (!hexPubkey) {
      return {
        content: [
          {
            type: "text",
            text: "Invalid public key format. Please provide a valid hex pubkey or npub.",
          },
        ],
      };
    }
    
    // Generate a friendly display version of the pubkey
    const displayPubkey = formatPubkey(hexPubkey);
    
    const relaysToUse = relays || DEFAULT_RELAYS;
    // Create a fresh pool for this request
    const pool = getFreshPool(relaysToUse);
    
    try {
      console.error(`Fetching zaps for ${hexPubkey} from ${relaysToUse.join(", ")}`);
      
      // Query for received zaps - snstr handles timeout internally
      const zaps = await pool.querySync(
        relaysToUse,
        {
          kinds: [KINDS.ZapReceipt],
          "#p": [hexPubkey], // lowercase 'p' for recipient
          limit: Math.ceil(limit * 1.5), // Fetch a bit more to account for potential invalid zaps
        } as NostrFilter,
        { timeout: QUERY_TIMEOUT }
      );
      
      if (!zaps || zaps.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No zaps found for ${displayPubkey}`,
            },
          ],
        };
      }
      
      if (debug) {
        console.error(`Retrieved ${zaps.length} raw zap receipts`);
      }
      
      // Process and optionally validate zaps
      let processedZaps: any[] = [];
      let invalidCount = 0;
      
      for (const zap of zaps) {
        try {
          // Process the zap receipt with context of the target pubkey
          const processedZap = processZapReceipt(zap as ZapReceipt, hexPubkey);
          
          // Skip zaps that aren't actually received by this pubkey
          if (processedZap.direction !== 'received' && processedZap.direction !== 'self') {
            if (debug) {
              console.error(`Skipping zap ${zap.id.slice(0, 8)}... with direction ${processedZap.direction}`);
            }
            continue;
          }
          
          // Validate if requested
          if (validateReceipts) {
            const validationResult = validateZapReceipt(zap);
            if (!validationResult.valid) {
              if (debug) {
                console.error(`Invalid zap receipt ${zap.id.slice(0, 8)}...: ${validationResult.reason}`);
              }
              invalidCount++;
              continue;
            }
          }
          
          processedZaps.push(processedZap);
        } catch (error) {
          if (debug) {
            console.error(`Error processing zap ${zap.id.slice(0, 8)}...`, error);
          }
        }
      }
      
      if (processedZaps.length === 0) {
        let message = `No valid zaps found for ${displayPubkey}`;
        if (invalidCount > 0) {
          message += ` (${invalidCount} invalid zaps were filtered out)`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: message,
            },
          ],
        };
      }
      
      // Sort zaps by created_at in descending order (newest first)
      processedZaps.sort((a, b) => b.created_at - a.created_at);
      
      // Limit to requested number
      processedZaps = processedZaps.slice(0, limit);
      
      // Calculate total sats received
      const totalSats = processedZaps.reduce((sum, zap) => sum + (zap.amountSats || 0), 0);
      
      const formattedZaps = processedZaps.map(zap => formatZapReceipt(zap, hexPubkey)).join("\n");
      
      return {
        content: [
          {
            type: "text",
            text: `Found ${processedZaps.length} zaps received by ${displayPubkey}.\nTotal received: ${totalSats} sats\n\n${formattedZaps}`,
          },
        ],
      };
    } catch (error) {
      console.error("Error fetching zaps:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error fetching zaps for ${displayPubkey}: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    } finally {
      // Clean up any subscriptions and close the pool
      await pool.close();
    }
  },
);

server.tool(
  "getSentZaps",
  "Get zaps sent by a public key",
  getSentZapsToolConfig,
  async ({ pubkey, limit, relays, validateReceipts, debug }) => {
    // Convert npub to hex if needed
    const hexPubkey = npubToHex(pubkey);
    if (!hexPubkey) {
      return {
        content: [
          {
            type: "text",
            text: "Invalid public key format. Please provide a valid hex pubkey or npub.",
          },
        ],
      };
    }
    
    // Generate a friendly display version of the pubkey
    const displayPubkey = formatPubkey(hexPubkey);
    
    const relaysToUse = relays || DEFAULT_RELAYS;
    // Create a fresh pool for this request
    const pool = getFreshPool(relaysToUse);
    
    try {
      console.error(`Fetching sent zaps for ${hexPubkey} from ${relaysToUse.join(", ")}`);
      
      // First try the direct and correct approach: query with uppercase 'P' tag (NIP-57)
      if (debug) console.error("Trying direct query with #P tag...");
      
      let potentialSentZaps: NostrEvent[] = [];
      try {
        potentialSentZaps = await pool.querySync(
          relaysToUse,
          {
            kinds: [KINDS.ZapReceipt],
            "#P": [hexPubkey], // uppercase 'P' for sender
            limit: Math.ceil(limit * 1.5), // Fetch a bit more to account for potential invalid zaps
          } as NostrFilter,
          { timeout: QUERY_TIMEOUT }
        );
        if (debug) console.error(`Direct #P tag query returned ${potentialSentZaps.length} results`);
      } catch (e: unknown) {
        if (debug) console.error(`Direct #P tag query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      
      // If the direct query didn't return enough results, try the fallback method
      if (!potentialSentZaps || potentialSentZaps.length < limit) {
        if (debug) console.error("Direct query yielded insufficient results, trying fallback approach...");
        
        // Try a fallback approach - fetch a larger set of zap receipts
        const additionalZaps = await pool.querySync(
          relaysToUse,
          {
            kinds: [KINDS.ZapReceipt],
            limit: Math.max(limit * 10, 100), // Get a larger sample
          } as NostrFilter,
          { timeout: QUERY_TIMEOUT }
        );
        
        if (debug) {
          console.error(`Retrieved ${additionalZaps?.length || 0} additional zap receipts to analyze`);
        }
        
        if (additionalZaps && additionalZaps.length > 0) {
          // Add these to our potential sent zaps
          potentialSentZaps = [...potentialSentZaps, ...additionalZaps];
        }
      }
      
      if (!potentialSentZaps || potentialSentZaps.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No zap receipts found to analyze",
              },
            ],
          };
        }
        
      // Process and filter zaps
      let processedZaps: any[] = [];
      let invalidCount = 0;
      let nonSentCount = 0;
      
      if (debug) {
        console.error(`Processing ${potentialSentZaps.length} potential sent zaps...`);
      }
      
      // Process each zap to determine if it was sent by the target pubkey
      for (const zap of potentialSentZaps) {
        try {
          // Process the zap receipt with context of the target pubkey
          const processedZap = processZapReceipt(zap as ZapReceipt, hexPubkey);
          
          // Skip zaps that aren't sent by this pubkey
          if (processedZap.direction !== 'sent' && processedZap.direction !== 'self') {
            if (debug) {
              console.error(`Skipping zap ${zap.id.slice(0, 8)}... with direction ${processedZap.direction}`);
            }
            nonSentCount++;
            continue;
          }
          
          // Validate if requested
          if (validateReceipts) {
            const validationResult = validateZapReceipt(zap);
            if (!validationResult.valid) {
              if (debug) {
                console.error(`Invalid zap receipt ${zap.id.slice(0, 8)}...: ${validationResult.reason}`);
              }
              invalidCount++;
              continue;
            }
          }
          
          processedZaps.push(processedZap);
          } catch (error) {
            if (debug) {
            console.error(`Error processing zap ${zap.id.slice(0, 8)}...`, error);
          }
        }
      }
      
      // Deduplicate by zap ID
      const uniqueZaps = new Map<string, any>();
      processedZaps.forEach(zap => uniqueZaps.set(zap.id, zap));
      processedZaps = Array.from(uniqueZaps.values());
      
      if (processedZaps.length === 0) {
        let message = `No zaps sent by ${displayPubkey} were found.`;
        if (invalidCount > 0 || nonSentCount > 0) {
          message += ` (${invalidCount} invalid zaps and ${nonSentCount} non-sent zaps were filtered out)`;
        }
        message += " This could be because:\n1. The user hasn't sent any zaps\n2. The zap receipts don't properly contain the sender's pubkey\n3. The relays queried don't have this data";
        
        return {
          content: [
            {
              type: "text",
              text: message,
            },
          ],
        };
      }
      
      // Sort zaps by created_at in descending order (newest first)
      processedZaps.sort((a, b) => b.created_at - a.created_at);
      
      // Limit to requested number
      processedZaps = processedZaps.slice(0, limit);
      
      // Calculate total sats sent
      const totalSats = processedZaps.reduce((sum, zap) => sum + (zap.amountSats || 0), 0);
      
      // For debugging, examine the first zap in detail
      if (debug && processedZaps.length > 0) {
        const firstZap = processedZaps[0];
        console.error("Sample sent zap:", JSON.stringify(firstZap, null, 2));
      }
      
      const formattedZaps = processedZaps.map(zap => formatZapReceipt(zap, hexPubkey)).join("\n");
      
      return {
        content: [
          {
            type: "text",
            text: `Found ${processedZaps.length} zaps sent by ${displayPubkey}.\nTotal sent: ${totalSats} sats\n\n${formattedZaps}`,
          },
        ],
      };
    } catch (error) {
      console.error("Error fetching sent zaps:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error fetching sent zaps for ${displayPubkey}: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    } finally {
      // Clean up any subscriptions and close the pool
      await pool.close();
    }
  },
);

server.tool(
  "getAllZaps",
  "Get all zaps (sent and received) for a public key",
  getAllZapsToolConfig,
  async ({ pubkey, limit, relays, validateReceipts, debug }) => {
    // Convert npub to hex if needed
    const hexPubkey = npubToHex(pubkey);
    if (!hexPubkey) {
      return {
        content: [
          {
            type: "text",
            text: "Invalid public key format. Please provide a valid hex pubkey or npub.",
          },
        ],
      };
    }
    
    // Generate a friendly display version of the pubkey
    const displayPubkey = formatPubkey(hexPubkey);
    
    const relaysToUse = relays || DEFAULT_RELAYS;
    // Create a fresh pool for this request
    const pool = getFreshPool(relaysToUse);
    
    try {
      console.error(`Fetching all zaps for ${hexPubkey} from ${relaysToUse.join(", ")}`);
      
      // Use a more efficient approach: fetch all potentially relevant zaps in parallel
      
      // Prepare all required queries in parallel to reduce total time
      const fetchPromises = [
        // 1. Fetch received zaps (lowercase 'p' tag)
        pool.querySync(
        relaysToUse,
        {
          kinds: [KINDS.ZapReceipt],
          "#p": [hexPubkey],
            limit: Math.ceil(limit * 1.5),
        } as NostrFilter,
        { timeout: QUERY_TIMEOUT }
        ),
        
        // 2. Fetch sent zaps (uppercase 'P' tag)
        pool.querySync(
        relaysToUse,
        {
          kinds: [KINDS.ZapReceipt],
          "#P": [hexPubkey],
            limit: Math.ceil(limit * 1.5),
        } as NostrFilter,
        { timeout: QUERY_TIMEOUT }
        )
      ];
      
      // Add a general query if we're in debug mode or need more comprehensive results
      if (debug) {
        fetchPromises.push(
          pool.querySync(
          relaysToUse,
          {
            kinds: [KINDS.ZapReceipt],
              limit: Math.max(limit * 5, 50),
          } as NostrFilter,
          { timeout: QUERY_TIMEOUT }
          )
        );
      }
      
      // Execute all queries in parallel
      const results = await Promise.allSettled(fetchPromises);
      
      // Collect all zaps from successful queries
      const allZaps: NostrEvent[] = [];
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const zaps = result.value as NostrEvent[];
        if (debug) {
            const queryTypes = ['Received', 'Sent', 'General'];
            console.error(`${queryTypes[index]} query returned ${zaps.length} results`);
          }
          allZaps.push(...zaps);
        } else if (debug) {
          const queryTypes = ['Received', 'Sent', 'General'];
          console.error(`${queryTypes[index]} query failed:`, result.reason);
        }
      });
      
      if (allZaps.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No zaps found for ${displayPubkey}. Try specifying different relays that might have the data.`,
            },
          ],
        };
      }
      
      if (debug) {
        console.error(`Retrieved ${allZaps.length} total zaps before deduplication`);
      }
      
      // Deduplicate by zap ID
      const uniqueZapsMap = new Map<string, NostrEvent>();
      allZaps.forEach(zap => uniqueZapsMap.set(zap.id, zap));
      const uniqueZaps = Array.from(uniqueZapsMap.values());
      
      if (debug) {
        console.error(`Deduplicated to ${uniqueZaps.length} unique zaps`);
      }
      
      // Process each zap to determine its relevance to the target pubkey
      let processedZaps: any[] = [];
      let invalidCount = 0;
      let irrelevantCount = 0;
      
      for (const zap of uniqueZaps) {
        try {
          // Process the zap with the target pubkey as context
          const processedZap = processZapReceipt(zap as ZapReceipt, hexPubkey);
          
          // Skip zaps that are neither sent nor received by this pubkey
          if (processedZap.direction === 'unknown') {
              if (debug) {
              console.error(`Skipping irrelevant zap ${zap.id.slice(0, 8)}...`);
            }
            irrelevantCount++;
            continue;
          }
          
          // Validate if requested
          if (validateReceipts) {
            const validationResult = validateZapReceipt(zap);
            if (!validationResult.valid) {
            if (debug) {
                console.error(`Invalid zap receipt ${zap.id.slice(0, 8)}...: ${validationResult.reason}`);
            }
              invalidCount++;
              continue;
          }
          }
        
          processedZaps.push(processedZap);
        } catch (error) {
        if (debug) {
            console.error(`Error processing zap ${zap.id.slice(0, 8)}...`, error);
          }
        }
      }
      
      if (processedZaps.length === 0) {
        let message = `No relevant zaps found for ${displayPubkey}.`;
        if (invalidCount > 0 || irrelevantCount > 0) {
          message += ` (${invalidCount} invalid zaps and ${irrelevantCount} irrelevant zaps were filtered out)`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: message,
            },
          ],
        };
      }
      
      // Sort zaps by created_at in descending order (newest first)
      processedZaps.sort((a, b) => b.created_at - a.created_at);
      
      // Calculate statistics: sent, received, and self zaps
      const sentZaps = processedZaps.filter(zap => zap.direction === 'sent');
      const receivedZaps = processedZaps.filter(zap => zap.direction === 'received');
      const selfZaps = processedZaps.filter(zap => zap.direction === 'self');
      
      // Calculate total sats
      const totalSent = sentZaps.reduce((sum, zap) => sum + (zap.amountSats || 0), 0);
      const totalReceived = receivedZaps.reduce((sum, zap) => sum + (zap.amountSats || 0), 0);
      const totalSelfZaps = selfZaps.reduce((sum, zap) => sum + (zap.amountSats || 0), 0);
      
      // Limit to requested number for display
      processedZaps = processedZaps.slice(0, limit);
      
      // Format the zaps with the pubkey context
      const formattedZaps = processedZaps.map(zap => formatZapReceipt(zap, hexPubkey)).join("\n");
      
      // Prepare summary statistics
      const summary = [
        `Zap Summary for ${displayPubkey}:`,
        `- ${sentZaps.length} zaps sent (${totalSent} sats)`,
        `- ${receivedZaps.length} zaps received (${totalReceived} sats)`,
        `- ${selfZaps.length} self-zaps (${totalSelfZaps} sats)`,
        `- Net balance: ${totalReceived - totalSent} sats`,
        `\nShowing ${processedZaps.length} most recent zaps:\n`
      ].join("\n");
      
      return {
        content: [
          {
            type: "text",
            text: `${summary}\n${formattedZaps}`,
          },
        ],
      };
    } catch (error) {
      console.error("Error fetching all zaps:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error fetching all zaps for ${displayPubkey}: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    } finally {
      // Clean up any subscriptions and close the pool
      await pool.close();
    }
  },
);

server.tool(
  "getLongFormNotes",
  "Get long-form notes (kind 30023) by public key",
  getLongFormNotesToolConfig,
  async ({ pubkey, limit, relays }, extra) => {
    // Convert npub to hex if needed
    const hexPubkey = npubToHex(pubkey);
    if (!hexPubkey) {
      return {
        content: [
          {
            type: "text",
            text: "Invalid public key format. Please provide a valid hex pubkey or npub.",
          },
        ],
      };
    }
    
    // Generate a friendly display version of the pubkey
    const displayPubkey = formatPubkey(hexPubkey);
    
    const relaysToUse = relays || DEFAULT_RELAYS;
    // Create a fresh pool for this request
    const pool = getFreshPool(relaysToUse);
    
    try {
      console.error(`Fetching long-form notes for ${hexPubkey} from ${relaysToUse.join(", ")}`);
      
      // Query for long-form notes - snstr handles timeout internally
      const notes = await pool.querySync(
        relaysToUse,
        {
          kinds: [30023], // NIP-23 long-form content
          authors: [hexPubkey],
          limit,
        } as NostrFilter,
        { timeout: QUERY_TIMEOUT }
      );
      
      if (!notes || notes.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No long-form notes found for ${displayPubkey}`,
            },
          ],
        };
      }
      
      // Sort notes by created_at in descending order (newest first)
      notes.sort((a, b) => b.created_at - a.created_at);
      
      // Format each note with enhanced metadata
      const formattedNotes = notes.map(note => {
        // Extract metadata from tags
        const title = note.tags.find(tag => tag[0] === "title")?.[1] || "Untitled";
        const image = note.tags.find(tag => tag[0] === "image")?.[1];
        const summary = note.tags.find(tag => tag[0] === "summary")?.[1];
        const publishedAt = note.tags.find(tag => tag[0] === "published_at")?.[1];
        const identifier = note.tags.find(tag => tag[0] === "d")?.[1];
        
        // Format the output
        const lines = [
          `Title: ${title}`,
          `Created: ${new Date(note.created_at * 1000).toLocaleString()}`,
          publishedAt ? `Published: ${new Date(parseInt(publishedAt) * 1000).toLocaleString()}` : null,
          image ? `Image: ${image}` : null,
          summary ? `Summary: ${summary}` : null,
          identifier ? `Identifier: ${identifier}` : null,
          `Content:`,
          note.content,
          `---`,
        ].filter(Boolean).join("\n");
        
        return lines;
      }).join("\n\n");
      
      return {
        content: [
          {
            type: "text",
            text: `Found ${notes.length} long-form notes from ${displayPubkey}:\n\n${formattedNotes}`,
          },
        ],
      };
    } catch (error) {
      console.error("Error fetching long-form notes:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error fetching long-form notes for ${displayPubkey}: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    } finally {
      // Clean up any subscriptions and close the pool
      await pool.close();
    }
  }
);

server.tool(
  "queryEvents",
  "Query Nostr events using a generic filter (kinds/authors/ids/tags/timestamps)",
  queryEventsToolConfig,
  async ({ relays, kinds, authors, ids, since, until, limit, tags, search }) => {
    const result = await queryEvents({ relays, kinds, authors, ids, since, until, limit, tags, search });

    if (!result.success) {
      return {
        content: [{ type: "text", text: result.message }],
      };
    }

    const events = result.events ?? [];
    if (events.length === 0) {
      return {
        content: [{ type: "text", text: "No events found." }],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `${result.message}\n\n${formatEventsList(events)}`,
        },
      ],
    };
  },
);

server.tool(
  "getContactList",
  "Get a user's contact list (kind 3) and followed pubkeys",
  getContactListToolConfig,
  async ({ pubkey, relays }) => {
    const res = await getContactList({ pubkey, relays });
    if (!res.success) return { content: [{ type: "text", text: res.message }] };
    return {
      content: [
        {
          type: "text",
          text: `${res.message}\n\n${formatContacts(res.contacts ?? [])}`,
        },
      ],
    };
  },
);

server.tool(
  "getFollowing",
  "Get pubkeys a user is following (alias of getContactList)",
  getFollowingToolConfig,
  async ({ pubkey, relays }) => {
    const res = await getFollowing({ pubkey, relays });
    if (!res.success) return { content: [{ type: "text", text: res.message }] };
    return {
      content: [
        {
          type: "text",
          text: `${res.message}\n\n${formatContacts(res.contacts ?? [])}`,
        },
      ],
    };
  },
);

server.tool(
  "follow",
  "Follow a pubkey by updating your contact list (kind 3)",
  followToolConfig,
  async ({ privateKey, targetPubkey, relayHint, petname, relays }) => {
    const res = await follow({ privateKey, targetPubkey, relayHint, petname, relays });
    return { content: [{ type: "text", text: res.message }] };
  },
);

server.tool(
  "unfollow",
  "Unfollow a pubkey by updating your contact list (kind 3)",
  unfollowToolConfig,
  async ({ privateKey, targetPubkey, relays }) => {
    const res = await unfollow({ privateKey, targetPubkey, relays });
    return { content: [{ type: "text", text: res.message }] };
  },
);

server.tool(
  "reactToEvent",
  "React to an event (kind 7)",
  reactToEventToolConfig,
  async ({ privateKey, target, reaction, relays }) => {
    const res = await reactToEvent({ privateKey, target, reaction, relays });
    return { content: [{ type: "text", text: res.message }] };
  },
);

server.tool(
  "repostEvent",
  "Repost an event (kind 6)",
  repostEventToolConfig,
  async ({ privateKey, target, relays }) => {
    const res = await repostEvent({ privateKey, target, relays });
    return { content: [{ type: "text", text: res.message }] };
  },
);

server.tool(
  "deleteEvent",
  "Delete one or more events (kind 5 deletion request)",
  deleteEventToolConfig,
  async ({ privateKey, targets, reason, relays }) => {
    const res = await deleteEvent({ privateKey, targets, reason, relays });
    return { content: [{ type: "text", text: res.message }] };
  },
);

server.tool(
  "replyToEvent",
  "Reply to an event with correct NIP-10 thread tags (kind 1)",
  replyToEventToolConfig,
  async ({ privateKey, target, content, tags, relays }) => {
    const res = await replyToEvent({ privateKey, target, content, tags, relays });
    return { content: [{ type: "text", text: res.message }] };
  },
);

server.tool(
  "sendAnonymousZap",
  "Prepare an anonymous zap to a profile or event",
  sendAnonymousZapToolConfig,
  async ({ target, amountSats, comment, relays }) => {
    // Use supplied relays or defaults
    const relaysToUse = relays || DEFAULT_RELAYS;
    
    try {
      // console.error(`Preparing anonymous zap to ${target} for ${amountSats} sats`);
      
      // Prepare the anonymous zap
      const zapResult = await prepareAnonymousZap(target, amountSats, comment, relaysToUse);
      
      if (!zapResult || !zapResult.success) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to prepare anonymous zap: ${zapResult?.message || "Unknown error"}`,
            },
          ],
        };
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Anonymous zap prepared successfully!\n\nAmount: ${amountSats} sats${comment ? `\nComment: "${comment}"` : ""}\nTarget: ${target}\n\nInvoice:\n${zapResult.invoice}\n\nCopy this invoice into your Lightning wallet to pay. After payment, the recipient will receive the zap anonymously.`,
          },
        ],
      };
    } catch (error) {
      console.error("Error in sendAnonymousZap tool:", error);
      
      let errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      // Provide a more helpful message for common errors
      if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("ETIMEDOUT")) {
        errorMessage = `Could not connect to the Lightning service. This might be a temporary network issue or the service might be down. Error: ${errorMessage}`;
      } else if (errorMessage.includes("Timeout")) {
        errorMessage = "The operation timed out. This might be due to slow relays or network connectivity issues.";
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Error preparing anonymous zap: ${errorMessage}`,
          },
        ],
      };
    }
  },
);

// Register NIP-19 conversion tools
server.tool(
  "convertNip19",
  "Convert any NIP-19 entity (npub, nsec, note, nprofile, nevent, naddr) to another format",
  convertNip19ToolConfig,
  async ({ input, targetType, relays, author, kind, identifier }) => {
    try {
      const result = await convertNip19(input, targetType, relays, author, kind, identifier);
      
      if (result.success) {
        let response = `Conversion successful!\n\n`;
        response += `Original: ${result.originalType} entity\n`;
        response += `Target: ${targetType}\n`;
        response += `Result: ${result.result}\n`;
        
        if (result.originalType && ['nprofile', 'nevent', 'naddr'].includes(result.originalType)) {
          response += `\nOriginal entity data:\n${formatAnalysisResult(result.originalType, result.data)}`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Conversion failed: ${result.message}`,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Error in convertNip19 tool:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error during conversion: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "analyzeNip19",
  "Analyze any NIP-19 entity or hex string to understand its type and contents",
  analyzeNip19ToolConfig,
  async ({ input }) => {
    try {
      const result = await analyzeNip19(input);
      
      if (result.success) {
        let response = `Analysis successful!\n\n`;
        response += `Type: ${result.type}\n\n`;
        response += formatAnalysisResult(result.type!, result.data);
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Analysis failed: ${result.message}`,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Error in analyzeNip19 tool:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error during analysis: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "postAnonymousNote",
  "Post an anonymous note to the Nostr network using a temporary keypair",
  postAnonymousNoteToolConfig,
  async ({ content, relays, tags }) => {
    try {
      const result = await postAnonymousNote(content, relays, tags);
      
      if (result.success) {
        let response = `Anonymous note posted successfully!\n\n`;
        response += `${result.message}\n`;
        if (result.noteId) {
          response += `Note ID: ${result.noteId}\n`;
        }
        if (result.publicKey) {
          response += `Anonymous Author: ${formatPubkey(result.publicKey)}\n`;
        }
        response += `Content: "${content}"\n`;
        if (tags && tags.length > 0) {
          response += `Tags: ${JSON.stringify(tags)}\n`;
        }
        if (relays && relays.length > 0) {
          response += `Relays: ${relays.join(", ")}\n`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Failed to post anonymous note: ${result.message}`,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Error in postAnonymousNote tool:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error posting anonymous note: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Register profile management tools
server.tool(
  "createKeypair",
  "Generate a new Nostr keypair",
  createKeypairToolConfig,
  async ({ format }) => {
    try {
      const result = await createKeypair(format);
      
      let response = "New Nostr keypair generated:\n\n";
      
      if (result.publicKey) {
        response += `Public Key (hex): ${result.publicKey}\n`;
      }
      if (result.privateKey) {
        response += `Private Key (hex): ${result.privateKey}\n`;
      }
      if (result.npub) {
        response += `Public Key (npub): ${result.npub}\n`;
      }
      if (result.nsec) {
        response += `Private Key (nsec): ${result.nsec}\n`;
      }
      
      response += "\n⚠️ IMPORTANT: Store your private key securely! This is the only copy and cannot be recovered if lost.";
      
      return {
        content: [
          {
            type: "text",
            text: response,
          },
        ],
      };
    } catch (error) {
      console.error("Error in createKeypair tool:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error generating keypair: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "createProfile",
  "Create a new Nostr profile (kind 0 event)",
  createProfileToolConfig,
  async ({ privateKey, name, about, picture, nip05, lud16, lud06, website, relays }) => {
    try {
      const profileData = {
        name,
        about,
        picture,
        nip05,
        lud16,
        lud06,
        website
      };
      
      const result = await createProfile(privateKey, profileData, relays);
      
      if (result.success) {
        let response = `Profile created successfully!\n\n`;
        response += `${result.message}\n`;
        if (result.eventId) {
          response += `Event ID: ${result.eventId}\n`;
        }
        if (result.publicKey) {
          response += `Public Key: ${formatPubkey(result.publicKey)}\n`;
        }
        
        // Show the profile data that was set
        response += "\nProfile data:\n";
        if (name) response += `Name: ${name}\n`;
        if (about) response += `About: ${about}\n`;
        if (picture) response += `Picture: ${picture}\n`;
        if (nip05) response += `NIP-05: ${nip05}\n`;
        if (lud16) response += `Lightning Address: ${lud16}\n`;
        if (lud06) response += `LNURL: ${lud06}\n`;
        if (website) response += `Website: ${website}\n`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create profile: ${result.message}`,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Error in createProfile tool:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error creating profile: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "updateProfile",
  "Update an existing Nostr profile (kind 0 event)",
  updateProfileToolConfig,
  async ({ privateKey, name, about, picture, nip05, lud16, lud06, website, relays }) => {
    try {
      const profileData = {
        name,
        about,
        picture,
        nip05,
        lud16,
        lud06,
        website
      };
      
      const result = await updateProfile(privateKey, profileData, relays);
      
      if (result.success) {
        let response = `Profile updated successfully!\n\n`;
        response += `${result.message}\n`;
        if (result.eventId) {
          response += `Event ID: ${result.eventId}\n`;
        }
        if (result.publicKey) {
          response += `Public Key: ${formatPubkey(result.publicKey)}\n`;
        }
        
        // Show the profile data that was updated
        response += "\nUpdated profile data:\n";
        if (name) response += `Name: ${name}\n`;
        if (about) response += `About: ${about}\n`;
        if (picture) response += `Picture: ${picture}\n`;
        if (nip05) response += `NIP-05: ${nip05}\n`;
        if (lud16) response += `Lightning Address: ${lud16}\n`;
        if (lud06) response += `LNURL: ${lud06}\n`;
        if (website) response += `Website: ${website}\n`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Failed to update profile: ${result.message}`,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Error in updateProfile tool:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error updating profile: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "postNote",
  "Post a note using an existing private key (authenticated posting)",
  postNoteToolConfig,
  async ({ privateKey, content, tags, relays }) => {
    try {
      const result = await postNote(privateKey, content, tags, relays);
      
      if (result.success) {
        let response = `Note posted successfully!\n\n`;
        response += `${result.message}\n`;
        if (result.noteId) {
          response += `Note ID: ${result.noteId}\n`;
        }
        if (result.publicKey) {
          response += `Author: ${formatPubkey(result.publicKey)}\n`;
        }
        response += `Content: "${content}"\n`;
        if (tags && tags.length > 0) {
          response += `Tags: ${JSON.stringify(tags)}\n`;
        }
        if (relays && relays.length > 0) {
          response += `Relays: ${relays.join(", ")}\n`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Failed to post note: ${result.message}`,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Error in postNote tool:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error posting note: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Register note creation and publishing tools
server.tool(
  "createNote",
  "Create a new kind 1 note event (unsigned)",
  createNoteToolConfig,
  async ({ privateKey, content, tags }) => {
    try {
      const result = await createNote(privateKey, content, tags);
      
      if (result.success) {
        let response = `Note event created successfully!\n\n`;
        response += `${result.message}\n`;
        if (result.publicKey) {
          response += `Author: ${formatPubkey(result.publicKey)}\n`;
        }
        response += `Content: "${content}"\n`;
        if (tags && tags.length > 0) {
          response += `Tags: ${JSON.stringify(tags)}\n`;
        }
        
        response += `\nNote Event (unsigned):\n${JSON.stringify(result.noteEvent, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create note: ${result.message}`,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Error in createNote tool:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error creating note: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "signNote",
  "Sign a note event with a private key",
  signNoteToolConfig,
  async ({ privateKey, noteEvent }) => {
    try {
      const result = await signNote(privateKey, noteEvent);
      
      if (result.success) {
        let response = `Note signed successfully!\n\n`;
        response += `${result.message}\n`;
        response += `Note ID: ${result.signedNote?.id}\n`;
        response += `Content: "${noteEvent.content}"\n`;
        
        response += `\nSigned Note Event:\n${JSON.stringify(result.signedNote, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Failed to sign note: ${result.message}`,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Error in signNote tool:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error signing note: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "publishNote",
  "Publish a signed note to Nostr relays",
  publishNoteToolConfig,
  async ({ signedNote, relays }) => {
    try {
      const result = await publishNote(signedNote, relays);
      
      if (result.success) {
        let response = `Note published successfully!\n\n`;
        response += `${result.message}\n`;
        if (result.noteId) {
          response += `Note ID: ${result.noteId}\n`;
        }
        response += `Content: "${signedNote.content}"\n`;
        response += `Author: ${formatPubkey(signedNote.pubkey)}\n`;
        if (relays && relays.length > 0) {
          response += `Relays: ${relays.join(", ")}\n`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Failed to publish note: ${result.message}`,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Error in publishNote tool:", error);
      
      return {
        content: [
          {
            type: "text",
            text: `Error publishing note: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Register generic event creation/signing/publishing tools
server.tool(
  "createNostrEvent",
  "Create an unsigned Nostr event of any kind (requires pubkey or privateKey to derive pubkey)",
  createNostrEventToolConfig,
  async ({ kind, content, tags, createdAt, pubkey, privateKey }) => {
    const result = await createNostrEvent({ kind, content, tags, createdAt, pubkey, privateKey });

    if (!result.success) {
      return { content: [{ type: "text", text: result.message }] };
    }

    return {
      content: [
        {
          type: "text",
          text: `${result.message}\n\nUnsigned Event:\n${JSON.stringify(result.event, null, 2)}`,
        },
      ],
    };
  },
);

server.tool(
  "signNostrEvent",
  "Sign an unsigned Nostr event with a private key",
  signNostrEventToolConfig,
  async ({ privateKey, event }) => {
    const result = await signNostrEvent({ privateKey, event: event as any });

    if (!result.success) {
      return { content: [{ type: "text", text: result.message }] };
    }

    return {
      content: [
        {
          type: "text",
          text: `${result.message}\n\nSigned Event:\n${JSON.stringify(result.signedEvent, null, 2)}`,
        },
      ],
    };
  },
);

server.tool(
  "publishNostrEvent",
  "Publish a signed Nostr event to relays",
  publishNostrEventToolConfig,
  async ({ signedEvent, relays }) => {
    const result = await publishNostrEvent({ signedEvent: signedEvent as any, relays });

    return {
      content: [{ type: "text", text: result.message }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Nostr MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

// Add handlers for unexpected termination
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Don't exit - keep the server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - keep the server running
}); 
