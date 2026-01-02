import path from 'node:path';
import process from 'node:process';

export const config = {
  dbPath:
    process.env.MEMDB_PATH ?? path.join(process.cwd(), 'data', 'memory.db'),
};
