import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { findModel, finalPrompt, planSegments, type GenerationParams } from '@workspace/vexora-core';
import { mediaPath, mediaUrl, newKey, registerMedia } from '../../services/storage';
import { concatVideos, lastFrame } from './ffmpeg';
import type { AIProvider, PollResult } from './types';

/**
 * Seedance 2.5 on Replicate (https://replicate.com/bytedance/seedance-2.5).
 * Replicate's prediction API (POST /v1/models/{model}/predictions, GET /v1/predictions/{id}) is stable.
 * The model's INPUT FIELD NAMES below come from its public schema as found in Nov 2026 —
 * VERIFY them on the model's API page (Replicate → model → API) before going live; they are all in buildInput().
 *
 * Videos longer than the vendor limit (30 s) are made in parts: each next part starts from the last
 * frame of the previous one, then ffmpeg joins them into one MP4 stored on our media storage.
 */
const API = 'https://api.replicate.com/v1';
const MODEL = process.env.SEEDANCE_MODEL ?? 'bytedance/seedance-2.5';
const token = () => process.env.REPLICATE_API_TOKEN ?? '';

interface Part { duration: number; predictionId: string | null; key?: string }
interface State { parts: Part[]; current: number; userId: string; frameKey?: string }

function buildInput(p: GenerationParams, duration: number, firstFrameUrl?: string, referenceUrl?: string) {
  return {
    prompt: finalPrompt(p),
    duration,
    resolution: p.resolution ?? '720p',
    aspect_ratio: firstFrameUrl ? 'adaptive' : p.aspect,
    generate_audio: p.audio !== false,
    ...(p.seed !== null ? { seed: p.seed } : {}),
    // first frame (continuation parts) and reference images are mutually exclusive in the schema
    ...(firstFrameUrl ? { image: firstFrameUrl } : referenceUrl ? { reference_images: [referenceUrl] } : {}),
  };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...init?.headers } });
  if (!res.ok) throw new Error(`Replicate ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

async function startPart(p: GenerationParams, duration: number, firstFrameUrl?: string): Promise<string> {
  const referenceUrl = p.referenceKey ? mediaUrl(p.referenceKey) : undefined;
  const pred = await api<{ id: string }>(`/models/${MODEL}/predictions`, { method: 'POST', body: JSON.stringify({ input: buildInput(p, duration, firstFrameUrl, referenceUrl) }) });
  return pred.id;
}

async function download(url: string, key: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  await writeFile(mediaPath(key), Buffer.from(await res.arrayBuffer()));
}

export const replicateAI: AIProvider = {
  id: 'replicate',

  async submit(_id, params, ctx) {
    const m = findModel(params.modelId)!;
    const durations = planSegments(params.durationSec, m.maxSegment ?? params.durationSec);
    const first = await startPart(params, durations[0]);
    const state: State = { parts: durations.map((d, i) => ({ duration: d, predictionId: i === 0 ? first : null })), current: 0, userId: ctx.userId };
    return { providerJobId: first, finishAt: null, state };
  },

  async poll(row): Promise<PollResult> {
    const p = row.params as GenerationParams;
    const s = structuredClone(row.state as State);
    const part = s.parts[s.current];
    const total = s.parts.length;
    const pred = await api<{ status: string; output: string | string[] | null; error?: string }>(`/predictions/${part.predictionId}`);

    if (pred.status === 'failed' || pred.status === 'canceled') return { status: 'failed', error: pred.error ?? pred.status, state: s };
    if (pred.status !== 'succeeded') {
      const within = pred.status === 'processing' ? 0.5 : 0.1;
      return { status: 'running', progress: (s.current + within) / (total + (total > 1 ? 0.3 : 0)), parts: { total, current: s.current + 1 }, state: s };
    }

    const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    if (!url) return { status: 'failed', error: 'empty output', state: s };
    part.key = newKey('mp4');
    await download(url, part.key);

    if (s.current + 1 < total) {
      // Next part continues from this part's last frame.
      s.frameKey = newKey('png');
      await lastFrame(mediaPath(part.key), mediaPath(s.frameKey));
      await registerMedia(s.frameKey, 'image/png', 'frame', s.userId);
      s.current += 1;
      s.parts[s.current].predictionId = await startPart(p, s.parts[s.current].duration, mediaUrl(s.frameKey));
      return { status: 'running', progress: s.current / (total + 0.3), parts: { total, current: s.current + 1 }, state: s };
    }

    let finalKey = part.key;
    if (total > 1) {
      finalKey = newKey('mp4');
      await concatVideos(s.parts.map((x) => mediaPath(x.key!)), mediaPath(finalKey));
    }
    await registerMedia(finalKey, 'video/mp4', 'output', s.userId);
    return { status: 'done', state: s, results: [{ id: randomUUID(), kind: 'video', aspect: p.aspect, seed: p.seed ?? 0, url: mediaUrl(finalKey) }] };
  },

  async cancel(row) {
    const s = row.state as State | null;
    const id = s?.parts[s.current]?.predictionId;
    if (id) await api(`/predictions/${id}/cancel`, { method: 'POST' }).catch(() => undefined);
  },
};
