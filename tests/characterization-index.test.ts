import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const waitForExit = async (
  child: ReturnType<typeof spawn>,
  timeoutMs: number
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> => {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for process to exit'));
    }, timeoutMs);

    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
};

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

void describe('characterization: index lifecycle', () => {
  void it('starts and shuts down via SIGTERM handler', async () => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx/esm', 'tests/fixtures/index-runner.ts'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          MEMDB_PATH: ':memory:',
          MEMDB_LOG_LEVEL: 'info',
          MEMDB_SHUTDOWN_TIMEOUT: '1000',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    const output = { stdout: '', stderr: '' };
    child.stdout?.on('data', (chunk: Buffer) => {
      output.stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output.stderr += chunk.toString('utf8');
    });

    const exit = await waitForExit(child, 4000);
    if (exit.code !== 0) {
      throw new Error(`Expected clean shutdown exit code, got ${exit.code}`);
    }
  });
});
