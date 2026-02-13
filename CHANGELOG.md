# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0] - 2026-02-13

### Added
- Added generic event tooling (`queryEvents`, `createNostrEvent`, `signNostrEvent`, `publishNostrEvent`)
- Added social tooling for follow/unfollow, reactions, reposts, deletions, and threaded replies
- Added relay list tooling for NIP-65 (`getRelayList`, `setRelayList`) with optional NIP-42 relay authentication
- Added direct message tooling for NIP-04 and NIP-44/NIP-17 workflows, including encrypt/decrypt, send, inbox, and conversation retrieval
- Added `since`/`until` pagination support for event queries
- Added dedicated test suites for event tools, social tools, relay tools, DM tools, and NIP-42 auth flows

### Changed
- Updated `snstr` dependency to `v0.3.1`
- Unified private-key normalization and signing helpers across note/event/social/relay/DM flows
- Centralized shared constants and query timeout usage in DM/relay/social tools and related tests

### Fixed
- Improved deterministic latest-event selection and shared contact/relay list formatting
- Fixed relay and DM auth error handling; DM handlers now correctly forward `authPrivateKey`
- Hardened relay auth key handling in NIP-42 flows

### Removed
- Removed an accidentally tracked local Claude Desktop config file from the repository history

## [2.1.0] - 2026-01-08

### Added
- Added `.npmignore` to control published npm package contents

### Changed
- Migrated test runner from Jest to Bun's native test runner for faster test execution
- Simplified build scripts using native shell commands
- Updated release scripts to use Bun (`bun test && bun run build`)
- Updated GitHub release workflow to align with Bun-based release CI
- Updated npm package metadata/docs, including npm badge updates in README
- Published the package updates to npm

### Removed
- NIPs search functionality (`searchNips` tool) - simplifies the server by removing external GitHub API dependencies
- `node-fetch` dependency (Bun has built-in fetch support)
- Jest configuration and dependencies (`jest.config.cjs`, `jest.setup.js`, `tsconfig.jest.json`)

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
