# Nostr MCP Server

A Model Context Protocol (MCP) server that provides Nostr capabilities to LLMs like Claude.

<a href="https://glama.ai/mcp/servers/@AustinKelsay/nostr-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@AustinKelsay/nostr-mcp-server/badge" alt="Nostr Server MCP server" />
</a>

https://github.com/user-attachments/assets/1d2d47d0-c61b-44e2-85be-5985d2a81c64

## Features

This server implements five tools for interacting with the Nostr network:

1. `getProfile`: Fetches a user's profile information by public key
2. `getKind1Notes`: Fetches text notes (kind 1) authored by a user
3. `getReceivedZaps`: Fetches zaps received by a user, including detailed payment information
4. `getSentZaps`: Fetches zaps sent by a user, including detailed payment information
5. `getAllZaps`: Fetches both sent and received zaps for a user, clearly labeled with direction and totals

All tools fully support both hex public keys and npub format, with user-friendly display of Nostr identifiers.

## Installation

```bash
# Clone the repository
git clone https://github.com/austinkelsay/nostr-mcp-server.git
cd nostr-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Connecting to Claude for Desktop

1. Make sure you have [Claude for Desktop](https://claude.ai/desktop) installed and updated to the latest version.

2. Configure Claude for Desktop by editing or creating the configuration file:

   For macOS:
   ```bash
   vim ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

   For Windows:
   ```bash
   notepad %AppData%\Claude\claude_desktop_config.json
   ```

3. Add the Nostr server to your configuration:

   ```json
   {
       "mcpServers": {
           "nostr": {
               "command": "node",
               "args": [
                   "/ABSOLUTE/PATH/TO/nostr-mcp-server/build/index.js"
               ]
           }
       }
   }
   ```

   Be sure to replace `/ABSOLUTE/PATH/TO/` with the actual path to your project.

4. Restart Claude for Desktop.

## Usage in Claude

Once configured, you can ask Claude to use the Nostr tools by making requests like:

- "Show me the profile information for npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8"
- "What are the recent posts from npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8?"
- "How many zaps has npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8 received?"
- "Show me the zaps sent by npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8"
- "Show me all zaps (both sent and received) for npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8"

The server automatically handles conversion between npub and hex formats, so you can use either format in your queries. Results are displayed with user-friendly npub identifiers.

## Advanced Usage

You can specify custom relays for any query:

- "Show me the profile for npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8 using relay wss://relay.damus.io"

You can also specify the number of notes or zaps to fetch:

- "Show me the latest 20 notes from npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8"

For zap queries, you can enable extra validation and debugging:

- "Show me all zaps for npub1qny3tkh0acurzla8x3zy4nhrjz5zd8ne6dvrjehx9n9hr3lnj08qwuzwc8 with validation and debug enabled"

## Limitations

- The server has a default 8-second timeout for queries to prevent hanging
- Only public keys in hex format or npub format are supported
- Only a subset of relays is used by default

## Implementation Details

- Native support for npub format using NIP-19 encoding/decoding
- NIP-57 compliant zap receipt detection with direction-awareness (sent/received/self)
- Advanced bolt11 invoice parsing with payment amount extraction
- Smart caching system for improved performance with large volumes of zaps
- Total sats calculations for sent/received/self zaps with net balance
- Optional NIP-57 validation for ensuring zap receipt integrity
- Each tool call creates a fresh connection to the relays, ensuring reliable data retrieval

## Troubleshooting

- If queries time out, try increasing the `QUERY_TIMEOUT` value in the source code (currently 8 seconds)
- If no data is found, try specifying different relays that might have the data
- Check Claude's MCP logs for detailed error information

## Default Relays

The server uses the following relays by default:
- wss://relay.damus.io
- wss://relay.nostr.band
- wss://relay.primal.net
- wss://nos.lol
- wss://relay.current.fyi
- wss://nostr.bitcoiner.social

## Development

To modify or extend this server:

1. Edit the `index.ts` file in the project root
2. Run `npm run build` to compile
3. Restart Claude for Desktop to pick up your changes