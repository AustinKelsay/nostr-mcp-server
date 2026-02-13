# Nostr MCP Server Test Suite

This directory contains tests for the Nostr MCP server functionality.

## Overview

The test suite uses Bun's native test runner to cover both core functionality and protocol integration using **snstr** for cryptographic operations. It includes:

1. Unit Tests - Testing isolated business logic
2. Integration Tests - Testing with a real (but in-memory) Nostr relay
3. Clean execution with proper resource management and no console warnings

## Test Files

### Unit Tests
- `basic.test.ts`: Simple tests for profile formatting and zap receipt processing
- `dm-tools.test.ts`: Tests NIP-04/NIP-44 DM flows
- `event-tools.test.ts`: Tests generic event query/create/sign/publish flows
- `profile-notes-simple.test.ts`: Tests for profile and note data structures
- `profile-tools.test.ts`: Tests for keypair generation, profile creation, and identity management
- `note-creation.test.ts`: Tests for note creation, signing, and publishing workflows
- `note-tools-functions.test.ts`: Tests note tool helpers
- `note-tools-unit.test.ts`: Unit tests for note formatting functions
- `profile-postnote.test.ts`: Tests for authenticated note posting with existing private keys
- `relay-tools.test.ts`: Tests relay list tools and auth behavior
- `social-tools.test.ts`: Tests follow/unfollow/reaction/repost/delete/reply flows
- `zap-tools-simple.test.ts`: Tests for zap processing and anonymous zap preparation
- `zap-tools-tests.test.ts`: Tests zap validation and direction parsing
- `nip19-conversion.test.ts`: Tests NIP-19 conversion and analysis
- `nip42-auth.test.ts`: Tests NIP-42 relay auth behavior
- `mocks.ts`: Contains mock data for unit tests

### Integration Tests
- `integration.test.ts`: Tests direct interaction with an ephemeral Nostr relay
- `websocket-integration.test.ts`: Tests WebSocket communication with a Nostr relay

## Running Tests

To run all tests (with clean execution and automatic resource cleanup):

```bash
bun test
```

To run a specific test file:

```bash
bun test __tests__/basic.test.ts
bun test __tests__/integration.test.ts
```

## Test Environment

The test suite is configured for clean execution:
- `NODE_ENV=test` is automatically set for all test runs
- Console warnings from debug logging are suppressed during tests
- WebSocket connections are properly cleaned up with timeout handling
- Test timeouts are configured to prevent hanging processes

## Test Design

The tests use two approaches:

### Unit Tests
Unit tests use mocks to simulate the Nostr network and focus on testing business logic without actual network communication. This approach allows for:
- Fast test execution
- Deterministic behavior
- Testing error handling and edge cases

### Integration Tests
Integration tests use an in-memory ephemeral relay that implements the Nostr protocol, allowing:
- Testing with real cryptographically signed events using **snstr**
- Full event publication and retrieval workflows
- Testing WebSocket protocol communication
- Validating event verification works properly
- Clean resource cleanup with no hanging processes or warnings

## Test Coverage

The test suite provides coverage for:

### Identity & Profile Management
- Keypair generation in multiple formats (hex, npub/nsec)
- Profile creation and updates with comprehensive metadata
- Private key format handling and normalization

### Note Operations
- Note creation, signing, and publishing workflows
- Authenticated note posting with existing private keys
- Anonymous note posting with generated keypairs
- Tag support and content validation

### Event, Social, Relay, and DM Operations
- Generic event querying and publishing workflows
- Follow/unfollow and interaction events (reaction/repost/reply/delete)
- Relay list (NIP-65) reads/writes and relay auth behavior
- NIP-04 and NIP-44/NIP-17 message encryption and delivery

### Reading & Querying
- Profile retrieval and formatting
- Note retrieval and formatting
- Multi-relay querying and data aggregation

### Zap Operations
- Zap receipt processing and validation
- Anonymous zap preparation with snstr event signing

### Protocol & Infrastructure
- Full Nostr protocol event cycles
- WebSocket communication
- Event filtering and subscription management
- Cryptographic signature validation
- Resource cleanup and process management

## Adding Tests

When adding new features, consider adding:

1. Unit tests that:
   - Test the business logic in isolation
   - Verify error handling
   - Test edge cases

2. Integration tests that:
   - Verify the feature works with real Nostr events
   - Test the WebSocket protocol behavior if applicable
   - Verify end-to-end workflows
