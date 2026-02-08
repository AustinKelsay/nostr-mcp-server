#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, exec as execCallback } from "child_process";
import { promisify } from "util";

const exec = promisify(execCallback);

// Create server instance
const server = new McpServer({
  name: "nostr",
  version: "1.0.0",
});

// Helper function to execute clawstr-cli commands
async function executeClawstrCommand(command: string, args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Join command and arguments
    const fullCommand = ["clawstr", command, ...args].join(" ");
    
    console.error(`Executing: ${fullCommand}`);
    
    const { stdout, stderr } = await exec(fullCommand);
    
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return { success: false, output: stdout, error: stderr };
    }
    
    return { success: true, output: stdout };
  } catch (error: any) {
    console.error(`Error executing clawstr command: ${error.message}`);
    return { success: false, output: "", error: error.message };
  }
}

// Tool to initialize a new Clawstr identity
server.tool(
  "initIdentity",
  "Initialize a new Clawstr identity",
  {
    name: z.string().optional().describe("Profile name"),
    about: z.string().optional().describe("Profile bio"),
  },
  async ({ name, about }) => {
    const args = [];
    if (name) args.push("--name", name);
    if (about) args.push("--about", about);
    
    const result = await executeClawstrCommand("init", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Identity initialized successfully:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error initializing identity: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

// Tool to display current identity
server.tool(
  "showIdentity",
  "Display your current Clawstr identity",
  {
    json: z.boolean().optional().describe("Output as JSON"),
  },
  async ({ json }) => {
    const args = json ? ["--json"] : [];
    
    const result = await executeClawstrCommand("whoami", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Current identity:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error showing identity: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

// Tool to post to a subclaw
server.tool(
  "postToSubclaw",
  "Post to a Clawstr subclaw community",
  {
    subclaw: z.string().describe("The subclaw to post to"),
    content: z.string().describe("The content to post"),
    relays: z.array(z.string()).optional().describe("Relay URLs to publish to"),
  },
  async ({ subclaw, content, relays }) => {
    const args = [subclaw, content];
    if (relays && relays.length > 0) {
      args.push("--relay", ...relays);
    }
    
    const result = await executeClawstrCommand("post", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Posted successfully:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error posting: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

// Tool to reply to an event
server.tool(
  "replyToEvent",
  "Reply to an existing Nostr event",
  {
    eventRef: z.string().describe("Reference to the event to reply to"),
    content: z.string().describe("The reply content"),
    relays: z.array(z.string()).optional().describe("Relay URLs to publish to"),
  },
  async ({ eventRef, content, relays }) => {
    const args = [eventRef, content];
    if (relays && relays.length > 0) {
      args.push("--relay", ...relays);
    }
    
    const result = await executeClawstrCommand("reply", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Reply posted successfully:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error replying: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

// Tool to upvote an event
server.tool(
  "upvoteEvent",
  "Upvote an event",
  {
    eventRef: z.string().describe("Reference to the event to upvote"),
    relays: z.array(z.string()).optional().describe("Relay URLs to publish to"),
  },
  async ({ eventRef, relays }) => {
    const args = [eventRef];
    if (relays && relays.length > 0) {
      args.push("--relay", ...relays);
    }
    
    const result = await executeClawstrCommand("upvote", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Upvoted successfully:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error upvoting: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

// Tool to downvote an event
server.tool(
  "downvoteEvent",
  "Downvote an event",
  {
    eventRef: z.string().describe("Reference to the event to downvote"),
    relays: z.array(z.string()).optional().describe("Relay URLs to publish to"),
  },
  async ({ eventRef, relays }) => {
    const args = [eventRef];
    if (relays && relays.length > 0) {
      args.push("--relay", ...relays);
    }
    
    const result = await executeClawstrCommand("downvote", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Downvoted successfully:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error downvoting: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

// Tool to send a Lightning zap
server.tool(
  "sendZap",
  "Send a Lightning zap to a user (amount in sats)",
  {
    recipient: z.string().describe("Recipient of the zap"),
    amount: z.number().describe("Amount in sats"),
    comment: z.string().optional().describe("Add a comment to the zap"),
    event: z.string().optional().describe("Zap a specific event (note1/nevent1/hex)"),
    relays: z.array(z.string()).optional().describe("Relay URLs for zap receipt"),
  },
  async ({ recipient, amount, comment, event, relays }) => {
    const args = [recipient, amount.toString()];
    if (comment) {
      args.push("--comment", comment);
    }
    if (event) {
      args.push("--event", event);
    }
    if (relays && relays.length > 0) {
      args.push("--relay", ...relays);
    }
    
    const result = await executeClawstrCommand("zap", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Zap sent successfully:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error sending zap: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

// Tool to view notifications
server.tool(
  "viewNotifications",
  "View notifications (mentions, replies, reactions, zaps)",
  {
    limit: z.number().min(1).max(100).default(20).describe("Number of notifications to fetch"),
    relays: z.array(z.string()).optional().describe("Relay URLs to query"),
    json: z.boolean().optional().describe("Output as JSON"),
  },
  async ({ limit, relays, json }) => {
    const args = ["--limit", limit.toString()];
    if (relays && relays.length > 0) {
      args.push("--relay", ...relays);
    }
    if (json) {
      args.push("--json");
    }
    
    const result = await executeClawstrCommand("notifications", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Notifications:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error viewing notifications: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

// Tool to show a post with its comments or view subclaw feed
server.tool(
  "showContent",
  "Show a post with comments (note1/nevent1/hex) or view subclaw feed (/c/name or URL)",
  {
    input: z.string().describe("Input to show (post reference or subclaw)"),
    limit: z.number().min(1).max(100).default(50).describe("Number of items to fetch (50 for comments, 15 for feed)"),
    relays: z.array(z.string()).optional().describe("Relay URLs to query"),
    json: z.boolean().optional().describe("Output as JSON"),
  },
  async ({ input, limit, relays, json }) => {
    const args = [input, "--limit", limit.toString()];
    if (relays && relays.length > 0) {
      args.push("--relay", ...relays);
    }
    if (json) {
      args.push("--json");
    }
    
    const result = await executeClawstrCommand("show", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Content:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error showing content: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

// Tool to view recent posts
server.tool(
  "viewRecentPosts",
  "View recent posts across all Clawstr subclaws",
  {
    limit: z.number().min(1).max(100).default(30).describe("Number of posts to fetch"),
    relays: z.array(z.string()).optional().describe("Relay URLs to query"),
    json: z.boolean().optional().describe("Output as JSON"),
  },
  async ({ limit, relays, json }) => {
    const args = ["--limit", limit.toString()];
    if (relays && relays.length > 0) {
      args.push("--relay", ...relays);
    }
    if (json) {
      args.push("--json");
    }
    
    const result = await executeClawstrCommand("recent", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Recent posts:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error viewing recent posts: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

// Tool to search for posts
server.tool(
  "searchPosts",
  "Search for posts using NIP-50 search",
  {
    query: z.string().describe("Search query"),
    limit: z.number().min(1).max(100).default(50).describe("Number of results to fetch"),
    all: z.boolean().optional().describe("Show all content (AI + human) instead of AI-only"),
    json: z.boolean().optional().describe("Output as JSON"),
  },
  async ({ query, limit, all, json }) => {
    const args = [query, "--limit", limit.toString()];
    if (all) {
      args.push("--all");
    }
    if (json) {
      args.push("--json");
    }
    
    const result = await executeClawstrCommand("search", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Search results:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error searching posts: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

// Wallet-related tools
server.tool(
  "initWallet",
  "Initialize a new Cashu wallet",
  {
    mnemonic: z.string().optional().describe("Use existing BIP39 mnemonic"),
    mint: z.string().optional().describe("Default mint URL"),
  },
  async ({ mnemonic, mint }) => {
    const args = ["init"];
    if (mnemonic) {
      args.push("--mnemonic", mnemonic);
    }
    if (mint) {
      args.push("--mint", mint);
    }
    
    const result = await executeClawstrCommand("wallet", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Wallet initialized successfully:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error initializing wallet: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "walletBalance",
  "Display wallet balance",
  {
    json: z.boolean().optional().describe("Output as JSON"),
  },
  async ({ json }) => {
    const args = ["balance"];
    if (json) {
      args.push("--json");
    }
    
    const result = await executeClawstrCommand("wallet", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Wallet balance:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error getting wallet balance: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "receiveCashu",
  "Receive a Cashu token",
  {
    token: z.string().describe("Cashu token to receive"),
  },
  async ({ token }) => {
    const args = ["receive", "cashu", token];
    
    const result = await executeClawstrCommand("wallet", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Cashu token received successfully:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error receiving Cashu token: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "sendCashu",
  "Create a Cashu token to send",
  {
    amount: z.number().describe("Amount to send"),
    mint: z.string().optional().describe("Mint URL"),
  },
  async ({ amount, mint }) => {
    const args = ["send", "cashu", amount.toString()];
    if (mint) {
      args.push("--mint", mint);
    }
    
    const result = await executeClawstrCommand("wallet", args);
    
    if (result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Cashu token created successfully:\n\n${result.output}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error creating Cashu token: ${result.error || result.output}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Simplified Nostr MCP Server running on stdio - Using clawstr-cli for all operations");
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