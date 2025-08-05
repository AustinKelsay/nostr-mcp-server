import { z } from "zod";
import fetch from "node-fetch";
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Define the NIP data structure
export interface NipData {
  number: number;
  title: string;
  description: string;
  status: "draft" | "final" | "deprecated";
  kind?: number;
  tags?: string[];
  content: string;
}

// Define the search result structure
export interface NipSearchResult {
  nip: NipData;
  relevance: number;
  matchedTerms: string[];
}

// Cache configuration - 24 hours in milliseconds
const CACHE_TTL = 1000 * 60 * 60 * 24;
// Store cache in OS temp directory to ensure it's writable
const CACHE_DIR = path.join(os.tmpdir(), 'nostr-mcp-server');
const CACHE_FILE = path.join(CACHE_DIR, 'nips-cache.json');

// Loading state management
let isLoading = false;
let lastError: Error | null = null;
let nipsCache: NipData[] = [];
let lastFetchTime = 0;

// Search index
interface SearchIndex {
  titleIndex: Map<string, Set<number>>;
  descriptionIndex: Map<string, Set<number>>;
  contentIndex: Map<string, Set<number>>;
  numberIndex: Map<string, number>;
  kindIndex: Map<number, Set<number>>;
  tagIndex: Map<string, Set<number>>;
}

let searchIndex: SearchIndex = {
  titleIndex: new Map(),
  descriptionIndex: new Map(),
  contentIndex: new Map(),
  numberIndex: new Map(),
  kindIndex: new Map(),
  tagIndex: new Map()
};

interface GitHubFile {
  name: string;
  download_url: string;
}

// Ensure cache directory exists
function ensureCacheDirectory() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      console.error(`Created cache directory: ${CACHE_DIR}`);
    }
  } catch (error) {
    console.error('Failed to create cache directory:', error);
  }
}

// Load cache from disk with improved error handling
function loadCacheFromDisk(): boolean {
  try {
    ensureCacheDirectory();
    
    if (fs.existsSync(CACHE_FILE)) {
      const cacheData = fs.readFileSync(CACHE_FILE, 'utf8');
      
      try {
        const cacheObj = JSON.parse(cacheData);
        
        if (cacheObj && Array.isArray(cacheObj.nips) && typeof cacheObj.timestamp === 'number') {
          nipsCache = cacheObj.nips;
          lastFetchTime = cacheObj.timestamp;
          
          // Check if cache is fresh enough
          if (Date.now() - lastFetchTime < CACHE_TTL) {

            buildSearchIndex();
            return true;
          } else {
            console.error('Cache file exists but is expired');
            // We'll still use it temporarily but will refresh
            buildSearchIndex();
            return false;
          }
        }
      } catch (parseError) {
        console.error('Error parsing cache file:', parseError);
        // If file exists but is corrupted, delete it
        try {
          fs.unlinkSync(CACHE_FILE);
          console.error('Deleted corrupted cache file');
        } catch (unlinkError) {
          console.error('Failed to delete corrupted cache file:', unlinkError);
        }
      }
    }
    return false;
  } catch (error) {
    console.error('Error loading cache from disk:', error);
    return false;
  }
}

// Save cache to disk with improved error handling
function saveCacheToDisk(): void {
  try {
    ensureCacheDirectory();
    
    const cacheObj = {
      nips: nipsCache,
      timestamp: lastFetchTime
    };
    
    // Write to a temporary file first, then rename to avoid corruption
    const tempFile = `${CACHE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(cacheObj, null, 2), 'utf8');
    fs.renameSync(tempFile, CACHE_FILE);
    
    console.error(`Saved ${nipsCache.length} NIPs to cache file`);
  } catch (error) {
    console.error('Error saving cache to disk:', error);
  }
}

// Build search index from nips cache - optimized for speed
function buildSearchIndex(): void {

  
  // Reset indexes
  searchIndex = {
    titleIndex: new Map(),
    descriptionIndex: new Map(),
    contentIndex: new Map(),
    numberIndex: new Map(),
    kindIndex: new Map(),
    tagIndex: new Map()
  };
  
  // Pre-allocate sets to reduce memory allocations
  const uniqueWords = new Set<string>();
  
  // First pass: collect all unique words
  for (const nip of nipsCache) {
    // Index title words
    const titleWords = nip.title.toLowerCase().split(/\W+/).filter(word => word.length > 0);
    titleWords.forEach(word => uniqueWords.add(word));
    
    // Index description words
    const descWords = nip.description.toLowerCase().split(/\W+/).filter(word => word.length > 0);
    descWords.forEach(word => uniqueWords.add(word));
    
    // Index content selectively
    const contentWords = new Set(
      nip.content.toLowerCase()
        .split(/\W+/)
        .filter(word => word.length > 3)
    );
    contentWords.forEach(word => uniqueWords.add(word));
    
    // Add tags
    if (nip.tags) {
      nip.tags.forEach(tag => uniqueWords.add(tag.toLowerCase().trim()));
    }
  }
  
  // Pre-allocate maps for each unique word
  uniqueWords.forEach(word => {
    searchIndex.titleIndex.set(word, new Set());
    searchIndex.descriptionIndex.set(word, new Set());
    searchIndex.contentIndex.set(word, new Set());
  });
  
  // Second pass: fill the indexes
  for (const nip of nipsCache) {
    // Index NIP number
    searchIndex.numberIndex.set(nip.number.toString(), nip.number);
    
    // Index title words
    const titleWords = nip.title.toLowerCase().split(/\W+/).filter(word => word.length > 0);
    for (const word of titleWords) {
      searchIndex.titleIndex.get(word)?.add(nip.number);
    }
    
    // Index description words
    const descWords = nip.description.toLowerCase().split(/\W+/).filter(word => word.length > 0);
    for (const word of descWords) {
      searchIndex.descriptionIndex.get(word)?.add(nip.number);
    }
    
    // Index content (more selective to save memory)
    const contentWords = new Set(
      nip.content.toLowerCase()
        .split(/\W+/)
        .filter(word => word.length > 3)
    );
    
    for (const word of contentWords) {
      searchIndex.contentIndex.get(word)?.add(nip.number);
    }
    
    // Index kind
    if (nip.kind !== undefined) {
      if (!searchIndex.kindIndex.has(nip.kind)) {
        searchIndex.kindIndex.set(nip.kind, new Set());
      }
      searchIndex.kindIndex.get(nip.kind)?.add(nip.number);
    }
    
    // Index tags
    if (nip.tags) {
      for (const tag of nip.tags) {
        const normalizedTag = tag.toLowerCase().trim();
        if (!searchIndex.tagIndex.has(normalizedTag)) {
          searchIndex.tagIndex.set(normalizedTag, new Set());
        }
        searchIndex.tagIndex.get(normalizedTag)?.add(nip.number);
      }
    }
  }
  

}

// Calculate exponential backoff time for retries
function calculateBackoff(attempt: number, baseMs: number = 1000, maxMs: number = 30000): number {
  const backoff = Math.min(maxMs, baseMs * Math.pow(2, attempt - 1));
  // Add jitter to avoid thundering herd problem
  return backoff * (0.75 + Math.random() * 0.5);
}

// Function to fetch NIPs from GitHub with improved retries and error handling
async function fetchNipsFromGitHub(retries = 5): Promise<NipData[]> {
  isLoading = true;
  lastError = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.error(`Fetching NIPs from GitHub (attempt ${attempt}/${retries})`);
      
      // Fetch the NIPs directory listing with improved options
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'nostr-mcp-server'
      };
      
      // Use conditional request if we already have data
      if (nipsCache.length > 0) {
        headers['If-Modified-Since'] = new Date(lastFetchTime).toUTCString();
      }
      
      // Set timeout to avoid long-hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch('https://api.github.com/repos/nostr-protocol/nips/contents', { 
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // If not modified, use cache
      if (response.status === 304) {
        console.error('NIPs not modified since last fetch, using cache');
        isLoading = false;
        return nipsCache;
      }
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
      
      const files = await response.json() as GitHubFile[];
      
      // Filter for NIP markdown files more efficiently with a single regex
      const nipFileRegex = /^(\d+|[0-9A-Fa-f]+)\.md$/;
      const nipFiles = files.filter((file: GitHubFile) => nipFileRegex.test(file.name));
      
      console.error(`Found ${nipFiles.length} NIP files to process`);
      
      // Process files with improved concurrency controls
      // Increased batch size but with connection limits
      const batchSize = 10; // Process more files at once
      const nips: NipData[] = [];
      
      // Load all NIPs concurrently in controlled batches
      for (let i = 0; i < nipFiles.length; i += batchSize) {
        const batch = nipFiles.slice(i, i + batchSize);
        const batchPromises = batch.map(file => fetchNipFile(file, attempt));
        
        try {
          // Process batch with proper timeout
          const batchResults = await Promise.allSettled(batchPromises);
          
          // Handle fulfilled promises
          batchResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value !== null) {
              nips.push(result.value);
            }
          });
          
          // Add a small delay between batches to avoid rate limiting, shorter delay
          if (i + batchSize < nipFiles.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (batchError) {
          console.error(`Error processing batch starting at index ${i}:`, batchError);
          // Continue to next batch even if current fails
        }
      }
      
      console.error(`Successfully processed ${nips.length} NIPs`);
      isLoading = false;
      
      return nips;
      
    } catch (error: any) {
      const typedError = error as Error;
      console.error(`Error fetching NIPs from GitHub (attempt ${attempt}/${retries}):`, typedError.message);
      lastError = typedError;
      
      if (attempt === retries) {
        // On final retry failure, return cache if available or empty array
        console.error('All GitHub fetch attempts failed, using cached data if available');
        isLoading = false;
        return nipsCache.length > 0 ? nipsCache : [];
      }
      
      // Exponential backoff with jitter before retrying
      const backoffTime = calculateBackoff(attempt);
      console.error(`Retrying in ${Math.round(backoffTime/1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
  }
  
  isLoading = false;
  return [];
}

// Helper to fetch a single NIP file with improved error handling and timeouts
async function fetchNipFile(file: GitHubFile, attemptNumber: number): Promise<NipData | null> {
  try {
    // Set timeout to avoid hanging requests - higher for content
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const contentResponse = await fetch(file.download_url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'nostr-mcp-server',
        'Accept': 'text/plain'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!contentResponse.ok) {
      console.error(`Failed to fetch ${file.name}: ${contentResponse.status}`);
      return null;
    }
    
    const content = await contentResponse.text();
    const numberMatch = file.name.match(/^(\d+|[0-9A-Fa-f]+)\.md$/);
    if (!numberMatch) return null;
    
    const numberStr = numberMatch[1];
    const number = numberStr.match(/^[0-9A-Fa-f]+$/) ? 
      parseInt(numberStr, 16) : 
      parseInt(numberStr, 10);
    
    // More efficient parsing - fix title extraction
    const lines = content.split('\n');
    
    // Find the actual title after the NIP header
    let title = `NIP-${number}`;  // fallback
    let description = `NIP-${number} description`;  // fallback
    
    // Look for the title after the initial header and any decorative lines
    for (let i = 1; i < Math.min(lines.length, 10); i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and decorative lines (like ======)
      if (!line || line.match(/^[=\-_]+$/)) {
        continue;
      }
      
      // Skip lines that look like metadata tags (like `draft` `mandatory`)
      if (line.match(/^`[^`]+`(\s+`[^`]+`)*$/)) {
        continue;
      }
      
      // This should be the actual title
      title = line;
      description = line;  // Use the same line for both title and description
      break;
    }
    
    // Optimize regex searches
    const statusRegex = /Status:\s*(draft|final|deprecated)/i;
    const kindRegex = /Kind:\s*(\d+)/i;
    const tagRegex = /Tags:\s*([^\n]+)/gi;
    
    const statusMatch = content.match(statusRegex);
    const status = statusMatch ? statusMatch[1].toLowerCase() as "draft" | "final" | "deprecated" : "draft";
    
    const kindMatch = content.match(kindRegex);
    const kind = kindMatch ? parseInt(kindMatch[1], 10) : undefined;
    
    const tags: string[] = [];
    const tagMatches = content.matchAll(tagRegex);
    for (const match of tagMatches) {
      tags.push(...match[1].split(',').map((tag: string) => tag.trim()));
    }
    
    return {
      number,
      title,
      description,
      status,
      kind,
      tags: tags.length > 0 ? tags : undefined,
      content
    };
  } catch (error) {
    console.error(`Error processing NIP ${file.name}`);
    return null;
  }
}

// Function to get NIPs with improved caching and parallel loading
async function getNips(forceRefresh = false): Promise<NipData[]> {
  const now = Date.now();
  
  // First attempt to load from memory cache if it's fresh enough
  if (!forceRefresh && nipsCache.length > 0 && now - lastFetchTime < CACHE_TTL) {
    return nipsCache;
  }
  
  // If no memory cache, try loading from disk
  if (!forceRefresh && nipsCache.length === 0) {
    const loaded = loadCacheFromDisk();
    if (loaded && now - lastFetchTime < CACHE_TTL) {
      return nipsCache;
    }
  }
  
  // Avoid multiple parallel fetches
  if (isLoading) {
    console.error('NIPs already being fetched, using existing cache');
    // Return current cache while waiting
    return nipsCache.length > 0 ? nipsCache : [];
  }
  
  // Fetch fresh data
  try {
    const nips = await fetchNipsFromGitHub();
    
    // Only update cache if we got new data
    if (nips.length > 0) {
      nipsCache = nips;
      lastFetchTime = now;
      
      // Save to disk and build search index
      saveCacheToDisk();
      buildSearchIndex();
    }
    
    return nipsCache;
  } catch (error) {
    console.error("Error refreshing NIPs:", error);
    lastError = error instanceof Error ? error : new Error(String(error));
    
    // If we already have cached data, use it even if expired
    if (nipsCache.length > 0) {
      console.error("Using expired cache due to fetch error");
      return nipsCache;
    }
    
    // Last resort - try to load from disk regardless of timestamp
    if (loadCacheFromDisk()) {
      return nipsCache;
    }
    
    // No options left
    return [];
  }
}

// Helper function to calculate relevance score using the search index - optimized for performance
function calculateRelevance(nip: NipData, searchTerms: string[]): { score: number; matchedTerms: string[] } {
  const matchedTerms: string[] = [];
  let score = 0;
  
  // Convert search terms to lowercase for case-insensitive matching
  const lowerSearchTerms = searchTerms.map(term => term.toLowerCase());
  
  // Use a map to avoid duplicate scoring and O(n²) searches
  const termScores = new Map<string, number>();
  
  for (const term of lowerSearchTerms) {
    // Check for exact NIP number match (highest priority)
    if (nip.number.toString() === term) {
      score += 10;
      matchedTerms.push(term);
      continue;
    }
    
    let termMatched = false;
    
    // Check title matches (high weight)
    if (searchIndex.titleIndex.has(term) && 
        searchIndex.titleIndex.get(term)?.has(nip.number)) {
      score += 3;
      termMatched = true;
    }
    
    // Check description matches (medium weight)
    if (searchIndex.descriptionIndex.has(term) && 
        searchIndex.descriptionIndex.get(term)?.has(nip.number)) {
      score += 2;
      termMatched = true;
    }
    
    // Check content matches (lower weight)
    if (searchIndex.contentIndex.has(term) && 
        searchIndex.contentIndex.get(term)?.has(nip.number)) {
      score += 1;
      termMatched = true;
    }
    
    // Check kind match
    if (nip.kind !== undefined && nip.kind.toString() === term) {
      score += 4;
      termMatched = true;
    }
    
    // Check tag matches
    if (nip.tags && nip.tags.some(tag => tag.toLowerCase() === term)) {
      score += 3;
      termMatched = true;
    }
    
    // Partial matches in title (very important)
    if (nip.title.toLowerCase().includes(term)) {
      score += 2;
      termMatched = true;
    }
    
    if (termMatched && !matchedTerms.includes(term)) {
      matchedTerms.push(term);
    }
  }
  
  return { score, matchedTerms };
}

// Improved search function with performance optimizations
export async function searchNips(query: string, limit: number = 10): Promise<NipSearchResult[]> {

  
  // Ensure we have NIPs data and the search index is built
  const nips = await getNips();
  
  if (nips.length === 0) {
    console.error("No NIPs available for search");
    console.error('Completed searchNips with no results');
    return [];
  }
  
  // Handle direct NIP number search as a special case (fastest path)
  const nipNumberMatch = query.match(/^(?:NIP-?)?(\d+)$/i);
  if (nipNumberMatch) {
    const nipNumber = parseInt(nipNumberMatch[1], 10);
    const directNip = nips.find(nip => nip.number === nipNumber);
    
    if (directNip) {
      console.error('Completed searchNips with direct match');
      return [{
        nip: directNip,
        relevance: 100,
        matchedTerms: [nipNumber.toString()]
      }];
    }
  }
  
  // Split query into terms and filter out empty strings
  const searchTerms = query.split(/\s+/).filter(term => term.length > 0);
  
  // If the search terms are too short or common, warn about potential slow search
  if (searchTerms.some(term => term.length < 3)) {
    console.error('Search includes very short terms which may slow down the search');
  }
  
  // Search through all NIPs efficiently
  const results: NipSearchResult[] = [];
  
  // Pre-filter NIPs that might be relevant based on fast checks
  // This avoids scoring every NIP for performance
  const potentialMatches = new Set<number>();
  
  // First do a quick scan to find potential matches
  for (const term of searchTerms) {
    const lowerTerm = term.toLowerCase();
    
    // Number match
    if (searchIndex.numberIndex.has(lowerTerm)) {
      potentialMatches.add(searchIndex.numberIndex.get(lowerTerm)!);
    }
    
    // Title matches
    const titleMatches = searchIndex.titleIndex.get(lowerTerm);
    if (titleMatches) {
      titleMatches.forEach(num => potentialMatches.add(num));
    }
    
    // Description matches
    const descMatches = searchIndex.descriptionIndex.get(lowerTerm);
    if (descMatches) {
      descMatches.forEach(num => potentialMatches.add(num));
    }
    
    // Content matches only if we have few potential matches so far
    if (potentialMatches.size < 50) {
      const contentMatches = searchIndex.contentIndex.get(lowerTerm);
      if (contentMatches) {
        contentMatches.forEach(num => potentialMatches.add(num));
      }
    }
    
    // If we have too many potential matches, don't add more from content
    if (potentialMatches.size > 100) {
      break;
    }
  }
  
  // If no potential matches through indexing, do a linear scan
  if (potentialMatches.size === 0) {
    // Fallback: check titles directly
    for (const nip of nips) {
      for (const term of searchTerms) {
        if (nip.title.toLowerCase().includes(term.toLowerCase())) {
          potentialMatches.add(nip.number);
          break;
        }
      }
    }
  }
  
  // Score only the potential matches
  for (const nipNumber of potentialMatches) {
    const nip = nips.find(n => n.number === nipNumber);
    if (!nip) continue;
    
    const { score, matchedTerms } = calculateRelevance(nip, searchTerms);
    
    if (score > 0) {
      results.push({
        nip,
        relevance: score,
        matchedTerms
      });
    }
  }
  
  // Sort by relevance and limit results
  results.sort((a, b) => b.relevance - a.relevance);
  const limitedResults = results.slice(0, limit);
  

  
  return limitedResults;
}

// Format a NIP search result with cleaner output
export function formatNipResult(result: NipSearchResult, includeContent: boolean = false): string {
  const { nip, relevance, matchedTerms } = result;
  
  const lines = [
    `NIP-${nip.number}: ${nip.title}`,
    `Status: ${nip.status}`,
    nip.kind ? `Kind: ${nip.kind}` : null,
    `Description: ${nip.description}`,
    `Relevance Score: ${relevance}`,
    matchedTerms.length > 0 ? `Matched Terms: ${matchedTerms.join(", ")}` : null,
  ].filter(Boolean);
  
  if (includeContent) {
    lines.push("", "Content:", nip.content);
  }
  
  lines.push("---");
  
  return lines.join("\n");
}

// Initialize by loading cache on module import, with background fetch
(async () => {
  // Try to load from disk first
  const loaded = loadCacheFromDisk();
  
  // Always trigger a background fetch to ensure fresh data
  setTimeout(() => {
    getNips(false).catch(error => {
      console.error('Error initializing NIPs cache');
    });
  }, loaded ? 5000 : 0); // If we loaded from cache, wait 5 seconds before refreshing
})(); 