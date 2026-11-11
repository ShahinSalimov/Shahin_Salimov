// Cross-platform build of the single-file offline edition (works in Windows PowerShell and cmd too).
import { spawnSync } from 'node:child_process';
const isWin = process.platform === 'win32';
const r = spawnSync(isWin ? 'npx.cmd' : 'npx', ['vite', 'build'], { stdio: 'inherit', shell: isWin, env: { ...process.env, VITE_STANDALONE: '1' } });
process.exit(r.status ?? 1);
