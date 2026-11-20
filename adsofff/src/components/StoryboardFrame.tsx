import type { ShotType, StoryboardStyle } from '../lib/schemas';

const PALETTES: Record<StoryboardStyle, { bg: string; fill: string; stroke: string; accent: string; text: string; dash?: string }> = {
  Sketch: { bg: '#f4f1ea', fill: '#e6e0d2', stroke: '#3b3833', accent: '#8a8478', text: '#2b2925', dash: '0' },
  Clean: { bg: '#e9edf5', fill: '#cfd7e6', stroke: '#4a5670', accent: '#8065F6', text: '#1d2333' },
  Neon: { bg: '#0d1326', fill: '#19243a', stroke: '#36B8E8', accent: '#8065F6', text: '#f5f7ff' },
  Warm: { bg: '#f6e7d6', fill: '#ecc9a4', stroke: '#7a4a2a', accent: '#e07a3f', text: '#3a2414' },
};

function Figure({ x, y, s, p }: { x: number; y: number; s: number; p: (typeof PALETTES)[StoryboardStyle] }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} stroke={p.stroke} strokeWidth={2.4 / s} fill={p.fill} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="0" cy="-58" r="16" />
      <path d="M-26 20 C-26 -18 -16 -36 0 -36 C16 -36 26 -18 26 20 Z" />
    </g>
  );
}

function Shot({ shot, p }: { shot: ShotType; p: (typeof PALETTES)[StoryboardStyle] }) {
  const common = { stroke: p.stroke, strokeWidth: 2.4, fill: p.fill, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (shot) {
    case 'wide':
      return (
        <g>
          <path d="M0 128 L80 92 L130 112 L200 70 L260 104 L320 84 L320 180 L0 180 Z" {...common} opacity={0.55} />
          <line x1="0" y1="140" x2="320" y2="140" stroke={p.stroke} strokeWidth={1.6} opacity={0.6} />
          <rect x="226" y="98" width="42" height="42" {...common} />
          <Figure x={120} y={140} s={0.55} p={p} />
          <circle cx="62" cy="44" r="12" fill="none" stroke={p.accent} strokeWidth={2.4} />
        </g>
      );
    case 'close':
      return (
        <g>
          <circle cx="160" cy="92" r="58" {...common} />
          <path d="M70 180 C80 150 120 142 160 142 C200 142 240 150 250 180 Z" {...common} />
          <circle cx="140" cy="86" r="4" fill={p.stroke} stroke="none" />
          <circle cx="180" cy="86" r="4" fill={p.stroke} stroke="none" />
          <path d="M144 114 Q160 124 176 114" fill="none" stroke={p.stroke} strokeWidth={2.4} strokeLinecap="round" />
          <path d="M260 40 l14 -10 M266 54 l18 -2" stroke={p.accent} strokeWidth={2.4} strokeLinecap="round" />
        </g>
      );
    case 'product':
      return (
        <g>
          <ellipse cx="160" cy="150" rx="86" ry="14" fill={p.fill} stroke={p.stroke} strokeWidth={2} opacity={0.8} />
          <rect x="128" y="52" width="64" height="96" rx="10" {...common} />
          <rect x="146" y="38" width="28" height="16" rx="4" {...common} />
          <rect x="140" y="86" width="40" height="24" rx="4" fill={p.accent} stroke="none" opacity={0.85} />
          <path d="M92 60 l-14 -8 M96 88 l-18 0 M228 60 l14 -8 M224 88 l18 0" stroke={p.accent} strokeWidth={2.4} strokeLinecap="round" />
        </g>
      );
    case 'text':
      return (
        <g>
          <rect x="56" y="44" width="208" height="92" rx="14" {...common} />
          <rect x="80" y="66" width="160" height="12" rx="6" fill={p.stroke} opacity={0.8} />
          <rect x="96" y="88" width="128" height="10" rx="5" fill={p.stroke} opacity={0.45} />
          <rect x="120" y="110" width="80" height="16" rx="8" fill={p.accent} />
        </g>
      );
    case 'pov':
      return (
        <g>
          <rect x="96" y="70" width="128" height="70" rx="8" {...common} />
          <path d="M40 180 C60 140 90 128 118 124 L130 140 C110 150 96 166 92 180 Z" {...common} />
          <path d="M280 180 C260 140 230 128 202 124 L190 140 C210 150 224 166 228 180 Z" {...common} />
          <circle cx="160" cy="104" r="12" fill={p.accent} stroke="none" opacity={0.85} />
        </g>
      );
    default:
      return (
        <g>
          <rect x="196" y="80" width="64" height="70" rx="8" {...common} opacity={0.7} />
          <Figure x={130} y={150} s={1.05} p={p} />
          <line x1="0" y1="150" x2="320" y2="150" stroke={p.stroke} strokeWidth={1.6} opacity={0.5} />
        </g>
      );
  }
}

/** Original illustrative storyboard sketch. It is a layout aid, not a generated video frame. */
export function StoryboardFrame({ shot, style, text, number, className }: { shot: ShotType; style: StoryboardStyle; text?: string; number?: number; className?: string }) {
  const p = PALETTES[style];
  return (
    <svg viewBox="0 0 320 180" className={className} role="img" aria-label={`Illustrative ${shot} shot sketch${number ? ` for scene ${number}` : ''}`}>
      <rect width="320" height="180" fill={p.bg} />
      {style === 'Sketch' ? <rect x="6" y="6" width="308" height="168" fill="none" stroke={p.stroke} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} /> : null}
      <Shot shot={shot} p={p} />
      {number ? (
        <g>
          <rect x="10" y="10" width="34" height="20" rx="6" fill={p.stroke} opacity={0.9} />
          <text x="27" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill={p.bg} fontFamily="Inter Variable, sans-serif">
            {number}
          </text>
        </g>
      ) : null}
      {text ? (
        <g>
          <rect x="20" y="146" width="280" height="24" rx="6" fill="#000" opacity={0.55} />
          <text x="160" y="162" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff" fontFamily="Inter Variable, sans-serif">
            {text.length > 46 ? `${text.slice(0, 45)}…` : text}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
