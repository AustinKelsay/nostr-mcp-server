# Nostr MCP Server Test Suite

This directory contains tests for the Nostr MCP server functionality.

## Overview

The test suite uses Jest to test both the core functionality and protocol integration of the Nostr MCP server using **snstr** for cryptographic operations. It includes:

1. Unit Tests - Testing isolated business logic
2. Integration Tests - Testing with a real (but in-memory) Nostr relay
3. Clean execution with proper resource management and no console warnings

## Test Files

### Unit Tests
- `basic.test.ts`: Simple tests for profile formatting and zap receipt processing
- `profile-notes-simple.test.ts`: Tests for profile and note data structures
- `profile-tools.test.ts`: Tests for keypair generation, profile creation, and identity management
- `note-creation.test.ts`: Tests for note creation, signing, and publishing workflows
- `profile-postnote.test.ts`: Tests for authenticated note posting with existing private keys
- `zap-tools-simple.test.ts`: Tests for zap processing and anonymous zap preparation
- `mocks.ts`: Contains mock data for unit tests

### Integration Tests
- `integration.test.ts`: Tests direct interaction with an ephemeral Nostr relay
- `websocket-integration.test.ts`: Tests WebSocket communication with a Nostr relay

## Running Tests

To run all tests (with clean execution and automatic resource cleanup):

```bash
npm test
```

To run a specific test file:

```bash
npm test -- __tests__/basic.test.ts
npm test -- __tests__/integration.test.ts
```

## Test Environment

The test suite is configured for clean execution:
- `NODE_ENV=test` is automatically set for all test runs
- Console warnings from debug logging are suppressed during tests
- WebSocket connections are properly cleaned up with timeout handling
- Jest uses `--forceExit` to ensure no hanging processes
- Test timeout is set to 30 seconds to prevent hanging tests

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