import { performance } from 'node:perf_hooks';
import process from 'node:process';

process.env.MEMDB_PATH = ':memory:';

const { createMemory, getRelated, linkMemories, searchMemories } =
  await import('../src/core/memory-service.js');
const { closeDb } = await import('../src/core/database.js');

const totalMemories = 500;
const tags = Array.from({ length: 10 }, (_, i) => `tag-${i}`);
const hashes: string[] = [];

for (let i = 0; i < totalMemories; i += 1) {
  const tag = tags[i % tags.length] ?? 'tag-0';
  const content = `memory ${i} alpha beta ${i % 7}`;
  const result = createMemory(content, [tag], i % 5, 'bench');
  hashes.push(result.hash);
}

for (let i = 0; i < 50; i += 1) {
  linkMemories(hashes[i] ?? '', hashes[i + 1] ?? '', 'related');
}

const measure = (label: string, fn: () => void, runs: number) => {
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.floor(samples.length * 0.95) - 1);
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return {
    label,
    runs,
    avgMs: Number(avg.toFixed(3)),
    p95Ms: Number(samples[p95Index]?.toFixed(3) ?? 0),
    minMs: Number(samples[0]?.toFixed(3) ?? 0),
    maxMs: Number(samples[samples.length - 1]?.toFixed(3) ?? 0),
  };
};

const searchMetrics = measure(
  'searchMemories',
  () => {
    searchMemories('alpha', 20, ['tag-1']);
  },
  200
);

const relatedMetrics = measure(
  'getRelated',
  () => {
    getRelated(hashes[0] ?? '', 'related', 2);
  },
  200
);

if (global.gc) {
  global.gc();
}

const mem = process.memoryUsage();
const toMb = (bytes: number): number =>
  Number((bytes / 1024 / 1024).toFixed(2));

const report = {
  dataset: { totalMemories, relatedLinks: 50 },
  search: searchMetrics,
  related: relatedMetrics,
  memoryMB: {
    rss: toMb(mem.rss),
    heapUsed: toMb(mem.heapUsed),
    heapTotal: toMb(mem.heapTotal),
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
closeDb();
