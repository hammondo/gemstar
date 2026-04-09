import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const dirs = [
    'data/campaigns',
    'data/pending-review',
    'data/approved',
    'data/published',
    'data/trends',
    'data/fresha-exports',
    'logs',
];

for (const dir of dirs) {
    mkdirSync(resolve(ROOT, dir), { recursive: true });
    console.log(`Created ${dir}`);
}

const { initDb } = await import('../bodyspace/db.js');
await initDb();

console.log('BodySpace server setup complete');
