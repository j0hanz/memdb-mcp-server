import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

import { ProtocolVersionGuardTransport } from '../src/protocol-version-guard.js';

class TransportStub implements Transport {
  onclose: () => void = () => {};
  onerror: (error: Error) => void = () => {};
  onmessage: NonNullable<Transport['onmessage']> = () => {};

  readonly sent: JSONRPCMessage[] = [];

  async start(): Promise<void> {}

  async close(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    this.sent.push(message);
  }
}

void describe('ProtocolVersionGuardTransport', () => {
  void it('rejects batch arrays with no usable ids by emitting -32600 with id=null', async () => {
    const inner = new TransportStub();
    const guard = new ProtocolVersionGuardTransport(inner, ['2025-06-18']);
    await guard.start();

    const batch = [{ jsonrpc: '2.0', method: 'tools/list' }];
    const deliver = inner.onmessage as unknown as (message: unknown) => void;
    deliver(batch);

    assert.strictEqual(inner.sent.length, 1);
    const sent = inner.sent[0] as {
      jsonrpc: '2.0';
      id: null;
      error: { code: number };
    };
    assert.strictEqual(sent.jsonrpc, '2.0');
    assert.strictEqual(sent.id, null);
    assert.strictEqual(sent.error.code, -32600);
  });
});
