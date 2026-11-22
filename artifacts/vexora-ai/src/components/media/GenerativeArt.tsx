import { memo, useId } from 'react';
import { rng, pick } from '@/lib/random';
import type { AspectRatio, MediaKind } from '@/types';
import { aspectToRatio } from '@/lib/format';
import { useI18n } from '@/i18n';

const PALETTES = [
  ['#1e4744', '#3fa796', '#f4d3a1', '#e7957b'],
  ['#223a5e', '#6c9bd2', '#f3e3c3', '#9cc5b8'],
  ['#3d3350', '#b39bc8', '#f6dcc8', '#7fb7a6'],
  ['#2f4a3a', '#8dbf8b', '#f1e4c2', '#e3a86b'],
] as const;

interface Props { seed: number; aspect: AspectRatio; kind?: MediaKind; animate?: boolean; className?: string }

/** Procedural, copyright-free placeholder artwork. Same seed → same picture. */
export const GenerativeArt = memo(function GenerativeArt({ seed, aspect, kind = 'image', animate = false, className }: Props) {
  const uid = useId().replace(/:/g, '');
  const { t } = useI18n();
  const r = rng(seed);
  const pal = pick(r, PALETTES);
  const W = 400;
  const H = Math.round(W / aspectToRatio(aspect));
  const mode = Math.floor(r() * 3);
  const blobs = Array.from({ length: 5 + Math.floor(r() * 4) }, () => ({
    cx: r() * W, cy: r() * H, rad: 40 + r() * 180, c: pal[1 + Math.floor(r() * 3)], o: 0.35 + r() * 0.5,
  }));
  const rings = Array.from({ length: 6 + Math.floor(r() * 8) }, (_, i) => ({ r: 20 + i * (12 + r() * 18), w: 1 + r() * 3 }));
  const horizon = H * (0.45 + r() * 0.3);
  const sunR = 30 + r() * 70;
  const sunX = W * (0.2 + r() * 0.6);
  const dur = 6 + r() * 6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={t('common.synthetic')}>
      <defs>
        <filter id={`b${uid}`}><feGaussianBlur stdDeviation={mode === 0 ? 38 : 26} /></filter>
        <filter id={`n${uid}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed % 997} />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 0.9  0 0 0 0 0.8  0 0 0 0.09 0" />
        </filter>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal[0]} />
          <stop offset="1" stopColor={pal[3]} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#g${uid})`} />
      {mode === 0 && (
        <g filter={`url(#b${uid})`}>
          {blobs.map((b, i) => (
            <circle key={i} cx={b.cx} cy={b.cy} r={b.rad} fill={b.c} opacity={b.o}>
              {animate && <animate attributeName="cx" values={`${b.cx};${b.cx + 60};${b.cx}`} dur={`${dur + i}s`} repeatCount="indefinite" />}
            </circle>
          ))}
        </g>
      )}
      {mode === 1 && (
        <g>
          <circle cx={sunX} cy={horizon} r={sunR} fill={pal[2]} />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={0} y={horizon - sunR + i * (sunR / 4) + sunR / 2} width={W} height={2 + i} fill={pal[0]} />
          ))}
          <rect y={horizon} width={W} height={H - horizon} fill={pal[0]} opacity="0.92" />
          {Array.from({ length: 10 }, (_, i) => (
            <line key={i} x1={W / 2} y1={horizon} x2={(i / 9) * W * 2 - W / 2} y2={H} stroke={pal[1]} strokeOpacity="0.45" />
          ))}
          <g filter={`url(#b${uid})`}><circle cx={sunX} cy={horizon} r={sunR * 1.6} fill={pal[1]} opacity="0.35" /></g>
        </g>
      )}
      {mode === 2 && (
        <g transform={`translate(${W / 2} ${H / 2})`}>
          <g filter={`url(#b${uid})`}><circle r={Math.min(W, H) * 0.45} fill={pal[1]} opacity="0.5" /></g>
          <g>
            {rings.map((x, i) => (
              <circle key={i} r={x.r} fill="none" stroke={i % 2 ? pal[2] : pal[1]} strokeWidth={x.w} strokeDasharray={`${4 + i * 3} ${6 + i}`} opacity={0.85 - i * 0.04} />
            ))}
            {animate && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={`${dur * 3}s`} repeatCount="indefinite" />}
          </g>
        </g>
      )}
      <rect width={W} height={H} filter={`url(#n${uid})`} />
    </svg>
  );
});
