// Fallback for `npm run build:tsc`: copy icons and codex files next to the compiled .js files.
// `npm run build` (n8n-node build) does this for you.
import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const src = join(dir, name);
    if (statSync(src).isDirectory()) walk(src);
    else if (name.endsWith('.svg') || name.endsWith('.node.json')) cpSync(src, join('dist', src));
  }
}
for (const dir of ['nodes', 'credentials', 'icons']) if (existsSync(dir)) walk(dir);
console.log('Copied icons and codex files into dist/');
