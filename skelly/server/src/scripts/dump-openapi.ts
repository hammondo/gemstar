/**
 * Writes the OpenAPI JSON spec to dashboard/src/api/openapi.json so that
 * openapi-typescript can generate typed client schemas without a running server.
 *
 * Usage: npm run dump:openapi  (from the server directory)
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiSpec } from '../openapi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../../../dashboard/src/api/openapi.json');

const spec = buildOpenApiSpec();
writeFileSync(outPath, JSON.stringify(spec, null, 2));
console.log(`OpenAPI spec written to ${outPath}`);
