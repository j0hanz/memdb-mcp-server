import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';

import { assertSupportedProtocolVersion } from '../src/utils/protocol.js';

const describeTest = (title: string, fn: () => void): void => {
  void describe(title, fn);
};

const itTest = (title: string, fn: () => void): void => {
  void it(title, fn);
};

describeTest('protocol', () => {
  itTest('accepts supported protocol versions', () => {
    const version = SUPPORTED_PROTOCOL_VERSIONS[0];
    assert.ok(version);
    assert.doesNotThrow(() => {
      assertSupportedProtocolVersion(version);
    });
  });

  itTest('rejects unsupported protocol versions', () => {
    assert.throws(() => {
      assertSupportedProtocolVersion('0.0.0');
    }, /Unsupported protocol version/);
  });
});
