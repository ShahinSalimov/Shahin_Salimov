import { execFile } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** True when the ffmpeg binary is on PATH (needed for videos longer than one vendor clip). */
export async function hasFfmpeg(): Promise<boolean> {
  try { await run('ffmpeg', ['-version'], { timeout: 5000 }); return true; } catch { return false; }
}

/** Saves the last frame of a video as PNG — the first frame of the next part. */
export async function lastFrame(video: string, outPng: string) {
  await run('ffmpeg', ['-y', '-sseof', '-0.1', '-i', video, '-frames:v', '1', '-update', '1', outPng], { timeout: 60_000 });
}

/** Joins parts into one MP4 (re-encodes so differing encoder settings never break the join). */
export async function concatVideos(parts: string[], out: string) {
  const list = `${out}.txt`;
  await writeFile(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  try {
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], { timeout: 600_000 });
  } finally { await unlink(list).catch(() => undefined); }
}
