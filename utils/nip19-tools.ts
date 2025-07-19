import { z } from "zod";
import { convertNip19Entity, analyzeNip19Entity, ConversionInput } from "./conversion.js";

// Schema for convertNip19 tool
export const convertNip19ToolConfig = {
  input: z.string().describe("The NIP-19 entity or hex string to convert"),
  targetType: z.enum(['npub', 'nsec', 'note', 'hex', 'nprofile', 'nevent', 'naddr']).describe("The target format to convert to"),
  relays: z.array(z.string()).optional().describe("Optional relay URLs for complex entities (nprofile, nevent, naddr)"),
  author: z.string().optional().describe("Optional author pubkey (hex format) for nevent/naddr"),
  kind: z.number().optional().describe("Optional event kind for nevent/naddr"),
  identifier: z.string().optional().describe("Required identifier for naddr conversion"),
};

// Schema for analyzeNip19 tool
export const analyzeNip19ToolConfig = {
  input: z.string().describe("The NIP-19 entity or hex string to analyze"),
};

/**
 * Convert any NIP-19 entity to another format
 */
export async function convertNip19(
  input: string,
  targetType: 'npub' | 'nsec' | 'note' | 'hex' | 'nprofile' | 'nevent' | 'naddr',
  relays?: string[],
  author?: string,
  kind?: number,
  identifier?: string
): Promise<{ success: boolean, message: string, result?: string, originalType?: string, data?: any }> {
  try {
    const options: ConversionInput = {
      input,
      targetType,
      entityData: {
        ...(relays && { relays }),
        ...(author && { author }),
        ...(kind && { kind }),
        ...(identifier && { identifier })
      }
    };

    const result = convertNip19Entity(options);
    
    if (!result.success) {
      return {
        success: false,
        message: result.message || 'Conversion failed'
      };
    }

    return {
      success: true,
      message: result.message || 'Conversion successful',
      result: result.result,
      originalType: result.originalType,
      data: result.data
    };
  } catch (error) {
    return {
      success: false,
      message: `Error during conversion: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Analyze any NIP-19 entity to get its type and decoded data
 */
export async function analyzeNip19(
  input: string
): Promise<{ success: boolean, message: string, type?: string, data?: any }> {
  try {
    const result = analyzeNip19Entity(input);
    
    if (!result.success) {
      return {
        success: false,
        message: result.message || 'Analysis failed'
      };
    }

    return {
      success: true,
      message: result.message || 'Analysis successful',
      type: result.originalType,
      data: result.data
    };
  } catch (error) {
    return {
      success: false,
      message: `Error during analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Format analysis result for display
 */
export function formatAnalysisResult(type: string, data: any): string {
  switch (type) {
    case 'hex':
      return `Hex String: ${data}`;
    
    case 'npub':
      return `Public Key (npub): ${data}`;
    
    case 'nsec':
      return `Private Key (nsec): ${data}`;
    
    case 'note':
      return `Note ID: ${data}`;
    
    case 'nprofile':
      return [
        `Profile Entity:`,
        `  Public Key: ${data.pubkey}`,
        `  Relays: ${data.relays?.length ? data.relays.join(', ') : 'None'}`
      ].join('\n');
    
    case 'nevent':
      return [
        `Event Entity:`,
        `  Event ID: ${data.id}`,
        `  Author: ${data.author || 'Not specified'}`,
        `  Kind: ${data.kind || 'Not specified'}`,
        `  Relays: ${data.relays?.length ? data.relays.join(', ') : 'None'}`
      ].join('\n');
    
    case 'naddr':
      return [
        `Address Entity:`,
        `  Identifier: ${data.identifier}`,
        `  Public Key: ${data.pubkey}`,
        `  Kind: ${data.kind}`,
        `  Relays: ${data.relays?.length ? data.relays.join(', ') : 'None'}`
      ].join('\n');
    
    default:
      return `Unknown type: ${type}`;
  }
}