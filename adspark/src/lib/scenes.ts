import type { Scene } from './schemas';
import { uid } from './engine/util';

export const totalDuration = (scenes: Scene[]) => scenes.reduce((a, s) => a + s.duration, 0);

export function blankScene(): Scene {
  return {
    id: uid('s_'),
    duration: 3,
    beat: 'custom',
    shot: 'medium',
    visual: 'Describe what the viewer sees.',
    camera: 'Static medium shot on a tripod.',
    action: 'Describe what the person or product does.',
    onScreenText: '',
    voiceover: '',
    sfx: '',
    transition: 'Hard cut.',
  };
}

export function insertAfter(scenes: Scene[], index: number, scene: Scene): Scene[] {
  const next = [...scenes];
  next.splice(index + 1, 0, scene);
  return next;
}

export function duplicateAt(scenes: Scene[], index: number): Scene[] {
  const s = scenes[index];
  if (!s) return scenes;
  return insertAfter(scenes, index, { ...s, id: uid('s_') });
}

export function removeAt(scenes: Scene[], index: number): Scene[] {
  return scenes.filter((_, i) => i !== index);
}

export function move(scenes: Scene[], from: number, to: number): Scene[] {
  if (to < 0 || to >= scenes.length || from === to) return scenes;
  const next = [...scenes];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function patchScene(scenes: Scene[], id: string, patch: Partial<Scene>): Scene[] {
  return scenes.map((s) => (s.id === id ? { ...s, ...patch } : s));
}
