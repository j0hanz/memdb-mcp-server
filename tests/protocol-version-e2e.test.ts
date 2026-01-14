import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { describe, it } from 'node:test';

type JsonRpcErrorResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string };
};

const readJsonLine = async (
  stdout: NodeJS.ReadableStream
): Promise<unknown> => {
  let buffer = '';

  return await new Promise((resolve, reject) => {
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) return;

      const line = buffer.slice(0, newlineIndex);
      stdout.off('data', onData);
      try {
        resolve(JSON.parse(line));
      } catch (error) {
        reject(error);
      }
    };

    stdout.on('data', onData);
  });
};

void describe('protocol version negotiation (e2e)', () => {
  void it('rejects initialize with protocolVersion 2025-03-26', async () => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx/esm', 'src/index.ts'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MEMDB_PATH: ':memory:',
          MEMDB_LOG_LEVEL: 'error',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    try {
      assert.ok(child.stdin);
      assert.ok(child.stdout);

      const initializeRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '0.0.0' },
        },
      };

      child.stdin.write(`${JSON.stringify(initializeRequest)}\n`);

      const raw = await readJsonLine(child.stdout);
      const message = raw as JsonRpcErrorResponse;

      assert.strictEqual(message.jsonrpc, '2.0');
      assert.strictEqual(message.id, 1);
      assert.strictEqual(message.error.code, -32000);
      assert.match(message.error.message, /Unsupported protocol version/i);
    } finally {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  });
});
