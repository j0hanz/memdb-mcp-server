import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';

const { BatchRejectingStdioServerTransport } =
  await import('../src/stdio-transport.js');

const writeUtf8Line = (stream: PassThrough, line: string): void => {
  stream.write(Buffer.from(`${line}\n`, 'utf8'));
};

const createJsonLineReader = (
  stdout: PassThrough
): { next: () => Promise<unknown>; close: () => void } => {
  let buffer = '';
  const pending: Array<(value: unknown) => void> = [];
  const queued: unknown[] = [];

  const deliver = (value: unknown) => {
    const resolve = pending.shift();
    if (resolve) {
      resolve(value);
      return;
    }
    queued.push(value);
  };

  const onData = (chunk: Buffer | string) => {
    buffer += chunk.toString();
    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) return;
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      deliver(JSON.parse(line));
    }
  };

  stdout.on('data', onData);

  return {
    next: async () => {
      const existing = queued.shift();
      if (existing !== undefined) return existing;
      return await new Promise((resolve) => pending.push(resolve));
    },
    close: () => {
      stdout.off('data', onData);
    },
  };
};

type JsonRpcError = {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
  };
};

void describe('BatchRejectingStdioServerTransport', () => {
  void it('responds to invalid Request.id types with -32600 and id=null', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();

    const transport = new BatchRejectingStdioServerTransport(stdin, stdout);
    await transport.start();
    const reader = createJsonLineReader(stdout);

    try {
      writeUtf8Line(
        stdin,
        JSON.stringify({ jsonrpc: '2.0', id: null, method: 'tools/list' })
      );

      const message = (await reader.next()) as JsonRpcError;
      assert.strictEqual(message.jsonrpc, '2.0');
      assert.strictEqual(message.id, null);
      assert.strictEqual(message.error.code, -32600);
    } finally {
      reader.close();
      await transport.close();
    }
  });

  void it('responds to parse errors with -32700 and id=null', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();

    const transport = new BatchRejectingStdioServerTransport(stdin, stdout);
    await transport.start();
    const reader = createJsonLineReader(stdout);
    try {
      writeUtf8Line(stdin, '{not-json');

      const message = (await reader.next()) as JsonRpcError;
      assert.strictEqual(message.jsonrpc, '2.0');
      assert.strictEqual(message.id, null);
      assert.strictEqual(message.error.code, -32700);
    } finally {
      reader.close();
      await transport.close();
    }
  });

  void it('rejects batch arrays with no usable ids by emitting one -32600 with id=null', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();

    const transport = new BatchRejectingStdioServerTransport(stdin, stdout);
    await transport.start();
    const reader = createJsonLineReader(stdout);
    try {
      writeUtf8Line(
        stdin,
        JSON.stringify([{ jsonrpc: '2.0', method: 'tools/list' }])
      );

      const message = (await reader.next()) as JsonRpcError;
      assert.strictEqual(message.jsonrpc, '2.0');
      assert.strictEqual(message.id, null);
      assert.strictEqual(message.error.code, -32600);
    } finally {
      reader.close();
      await transport.close();
    }
  });

  void it('rejects batch arrays by emitting -32600 for each usable id', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();

    const transport = new BatchRejectingStdioServerTransport(stdin, stdout);
    await transport.start();
    const reader = createJsonLineReader(stdout);
    try {
      writeUtf8Line(
        stdin,
        JSON.stringify([
          { jsonrpc: '2.0', id: 1, method: 'tools/list' },
          { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        ])
      );

      const first = (await reader.next()) as JsonRpcError;
      const second = (await reader.next()) as JsonRpcError;

      assert.deepStrictEqual(
        [first.id, first.error.code, second.id, second.error.code],
        [1, -32600, 2, -32600]
      );
    } finally {
      reader.close();
      await transport.close();
    }
  });
});
