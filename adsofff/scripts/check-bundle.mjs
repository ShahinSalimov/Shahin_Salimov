// Fails the build if server-only code or secret material ends up in the browser bundle.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const FORBIDDEN = [
  { label: 'Anthropic SDK', re: /x-stainless-|@anthropic-ai\/sdk|Anthropic\/JS/ },
  { label: 'OpenAI SDK', re: /OpenAI\/JS|api\.openai\.com/ },
  { label: 'server env names', re: /AI_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY/ },
  { label: 'API key-shaped string', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
];

const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css|json|map)$/.test(f)) files.push(p);
  }
};
walk(DIST);

const problems = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const { label, re } of FORBIDDEN) if (re.test(text)) problems.push(`${label} found in ${f.replace(DIST, 'dist/')}`);
}
if (problems.length) {
  console.error('Bundle check failed:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`Bundle check passed: ${files.length} files, no server code or secrets.`);
