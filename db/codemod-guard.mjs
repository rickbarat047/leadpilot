// One-off codemod: wraps every exported API route handler with guard() from
// '@/lib/api' (Next 14.2 has no onRequestError — see PRODUCTION.md P4).
//   export async function POST(req) { ... }   →   export const POST = guard(async (req) => { ... });
// Runs from the project root: node ./db/codemod-guard.mjs
import fs from 'node:fs';
import path from 'node:path';

const API_DIR = path.join(process.cwd(), 'src', 'app', 'api');
const HANDLER = /^export async function (GET|POST|PUT|PATCH|DELETE)\((.*)\) \{$/gm;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}

let filesChanged = 0;
let handlersChanged = 0;

for (const file of walk(API_DIR)) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;
  let count = 0;

  // Replace each handler header, then its column-0 closing brace.
  src = src.replace(HANDLER, (m, name, sig) => {
    count += 1;
    // Find the function's closing `}` (next line that is exactly `}`).
    return `@@GUARD@@${name}@@${sig}@@`;
  });

  if (count === 0) continue;

  // Process placeholders sequentially: each placeholder's body ends at the next `}` line.
  const lines = src.split('\n');
  const out = [];
  let pending = null; // { name }
  for (const line of lines) {
    const m = line.match(/^@@GUARD@@([^@]+)@@(.*)@@$/);
    if (m) {
      out.push(`export const ${m[1]} = guard(async (${m[2]}) => {`);
      pending = m[1];
      continue;
    }
    if (pending !== null && line === '}') {
      out.push('});');
      pending = null;
      continue;
    }
    out.push(line);
  }
  src = out.join('\n');

  // Ensure `guard` is imported from '@/lib/api'.
  if (!/\bguard\b\s*\}? from '@\/lib\/api'/.test(src) && !/import \{[^}]*\bguard\b[^}]*\} from '@\/lib\/api'/.test(src)) {
    const apiImport = src.match(/^import \{([^}]+)\} from '@\/lib\/api';$/m);
    if (apiImport) {
      const names = apiImport[1].split(',').map((s) => s.trim()).filter(Boolean);
      if (!names.includes('guard')) names.push('guard');
      src = src.replace(apiImport[0], `import { ${names.join(', ')} } from '@/lib/api';`);
    } else {
      // No api import yet — add one after the first import line.
      const firstImport = src.match(/^import .*;$/m);
      if (firstImport) {
        src = src.replace(firstImport[0], `${firstImport[0]}\nimport { guard } from '@/lib/api';`);
      } else {
        src = `import { guard } from '@/lib/api';\n${src}`;
      }
    }
  }

  if (src !== orig) {
    fs.writeFileSync(file, src);
    filesChanged += 1;
    handlersChanged += count;
    console.log(`wrapped ${count} in ${path.relative(process.cwd(), file)}`);
  }
}

console.log(`done: ${handlersChanged} handlers in ${filesChanged} files`);
