# Nostr Implementation Possibilities (NIPs) Tools

This directory contains tools for working with Nostr Implementation Possibilities (NIPs), which are the specifications that define the Nostr protocol. These tools complement the **snstr**-based implementation in the main server.

## Files

- `nips-tools.ts`: Core functionality for searching, fetching, and parsing NIPs from the official nostr-protocol repository

## Features

- **Persistent Caching**: NIPs are cached to disk with a 24-hour TTL to reduce GitHub API usage
- **Full-Text Search**: Efficiently search through NIP titles and content
- **Graceful Degradation**: Falls back to cached data when GitHub API is unavailable
- **Smart Indexing**: Maintains optimized search indices for fast lookups
- **Concurrent Processing**: Fetches multiple NIPs simultaneously in controlled batches
- **Loading State Management**: Tracks loading status and error conditions
- **MCP-Compatible Logging**: Uses stderr for logs to avoid interfering with JSON protocol

## Usage

```typescript
import { searchNips, formatNipResult } from "./nips/nips-tools.js";

// Search for NIPs related to a topic
const results = await searchNips("zaps");

// Format the results for display
const formattedResults = results.map(formatNipResult);
```

## Cache Structure

The NIPs cache is stored in the system temporary directory at `os.tmpdir()/nostr-mcp-server/nips-cache.json` and automatically refreshes every 24 hours. The cache includes:

- Full NIP contents and metadata
- Search indices for efficient lookups
- Last updated timestamp

This caching strategy minimizes API calls to GitHub while ensuring reasonably up-to-date information.

## Performance Enhancements

The NIPs module includes several performance optimizations:

- **Persistent Caching**: NIPs are cached to disk (with 24-hour TTL) to reduce GitHub API usage
- **Smart Search Indexing**: Two-pass indexing system for faster search and reduced memory usage
- **Conditional HTTP Requests**: Uses If-Modified-Since headers to minimize unnecessary data transfers
- **Exponential Backoff**: Implements backoff with jitter for more reliable GitHub API requests
- **Request Timeouts**: Uses AbortController to avoid hanging requests
- **Pre-filtering Optimization**: Identifies potential matches before scoring for faster searches
- **Batch Processing**: Processes GitHub API requests in controlled batches with proper error handling
- **Safe File Operations**: Uses atomic write operations to prevent cache corruption
- **MCP-Friendly Logging**: All logs use console.error to avoid interfering with stdout JSON communication

These enhancements ensure reliable operation even with intermittent connectivity or API rate limiting. 