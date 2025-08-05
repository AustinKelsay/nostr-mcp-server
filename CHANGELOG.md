# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-08-05

### Added
- NIP-19 entity conversion tools (`convertNip19` and `analyzeNip19`)
- Comprehensive test suite with 14 test files covering all tools
- Profile management tools for creating and updating Nostr profiles
- Authenticated note posting with existing private keys
- Anonymous note and zap functionality
- Long-form content support (NIP-23, kind 30023)
- Zap validation and direction detection (sent/received/self)
- NIPs search functionality with relevance scoring
- Support for all major NIP-19 entity types (npub, nsec, note, nevent, nprofile, naddr)

### Changed
- Migrated from nostr-tools and NDK to snstr library for core Nostr functionality
- Improved error handling to prevent JSON response interference in MCP
- Enhanced zap processing with better BOLT11 invoice parsing
- Updated relay pool management for better connection handling

### Fixed
- Fixed extractHexFromEntity returning incorrect data types for nevent entities
- Removed console.log/console.error statements that interfered with MCP JSON responses
- Fixed TypeScript type definitions replacing `any` types with proper interfaces
- Corrected test expectations to match actual API behavior

## [1.0.0] - Initial Release

### Added
- Basic Nostr MCP server implementation
- 16 core tools for interacting with Nostr network
- Profile fetching and note reading functionality
- Zap receipt processing
- Basic anonymous operations
- Default relay configuration
- Claude Desktop integration support