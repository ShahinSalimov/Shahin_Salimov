// Starts the Vite dev server and the AdSpark API server together (works on Windows, macOS and Linux).
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const run = (args) => spawn(isWin ? 'npm.cmd' : 'npm', args, { stdio: 'inherit', shell: isWin });

const children = [run(['run', 'dev:server']), run(['run', 'dev'])];
const stop = () => {
  for (const c of children) c.kill();
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) c.on('exit', (code) => code && code !== 0 && stop());
