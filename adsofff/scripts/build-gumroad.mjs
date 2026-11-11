// Builds the Gumroad buyer package: gumroad/dist/AdSofff-v<version>.zip
// Dependency-free (own ZIP writer) so it runs the same on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const isWin = process.platform === 'win32';
const run = (args) => {
  const r = spawnSync(isWin ? 'npm.cmd' : 'npm', args, { cwd: root, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(['run', 'build:standalone']);
run(['run', 'export-demo']);

const name = `AdSofff-v${version}`;
const out = join(root, 'gumroad', 'dist');
const dir = join(out, name);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(dir, 'Sample Campaign'), { recursive: true });

copyFileSync(join(root, 'dist-standalone', 'index.html'), join(dir, 'AdSofff.html'));
for (const f of ['START-HERE.html', 'LICENSE.txt', 'CHANGELOG.txt']) copyFileSync(join(root, 'gumroad', 'package', f), join(dir, f));
copyFileSync(join(root, 'docs', 'demo', 'sample-campaign.pdf'), join(dir, 'Sample Campaign', 'Sample campaign report.pdf'));
copyFileSync(join(root, 'docs', 'demo', 'sample-campaign.txt'), join(dir, 'Sample Campaign', 'Sample campaign script.txt'));
copyFileSync(join(root, 'docs', 'demo', 'sample-campaign.adsofff.json'), join(dir, 'Sample Campaign', 'Sample campaign (import in AdSofff).json'));

// --- minimal ZIP writer (deflate, UTF-8 names) ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d).sort()) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(dir);
const local = [];
const central = [];
let offset = 0;
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
for (const p of files) {
  const data = readFileSync(p);
  const comp = deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(`${name}/${relative(dir, p).split('\\').join('/')}`, 'utf8');
  const crc = crc32(data);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
  h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nameBuf.length, 26);
  local.push(h, nameBuf, comp);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
  c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20);
  c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
  central.push(c, nameBuf);
  offset += 30 + nameBuf.length + comp.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const zipPath = join(out, `${name}.zip`);
writeFileSync(zipPath, Buffer.concat([...local, cd, end]));
console.log(`Gumroad package: ${relative(root, zipPath)} (${files.length} files, ${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB)`);
