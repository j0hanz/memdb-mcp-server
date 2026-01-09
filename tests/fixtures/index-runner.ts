import { setTimeout as delay } from 'node:timers/promises';

import '../../src/index.js';

await delay(1500);
process.emit('SIGTERM');
