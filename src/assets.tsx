import type { ReactNode } from 'react';
import type { AssetKind, MapItem } from './types';
import { rowNumbers } from './geometry';

export interface AssetDef {
  kind: AssetKind;
  name: string;
  category: 'Site' | 'Parking' | 'Structure' | 'Nature' | 'Markings';
  /** default box size */
  w: number;
  h: number;
  defaults?: Partial<MapItem>;
  /** what the inspector lets you edit */
  hasLabel?: boolean;
  hasColor?: boolean;
  hint?: string;
}

export const SWATCHES = [
  '#ffffff',
  '#f2c94c',
  '#39d353',
  '#2f80ed',
  '#9b51e0',
  '#eb5757',
  '#f2994a',
  '#1f2328',
];

export const SURFACES: { name: string; color: string }[] = [
  { name: 'Asphalt', color: '#5d6168' },
  { name: 'Light asphalt', color: '#8a8e94' },
  { name: 'Concrete', color: '#b8bbc0' },
  { name: 'Dark', color: '#2a2d33' },
  { name: 'Grass', color: '#5f8f4e' },
];

export const ASSETS: AssetDef[] = [
  {
    kind: 'spaceRow',
    name: 'Row of spaces',
    category: 'Parking',
    w: 360,
    h: 72,
    defaults: { prefix: 'A', start: 1, count: 10, color: '#ffffff' },
    hasColor: true,
    hint: 'Numbered automatically: set the row letter, first number and count.',
  },
  {
    kind: 'space',
    name: 'Single space',
    category: 'Parking',
    w: 36,
    h: 72,
    defaults: { label: '1', color: '#ffffff' },
    hasLabel: true,
    hasColor: true,
  },
  {
    kind: 'space',
    name: 'Accessible space',
    category: 'Parking',
    w: 54,
    h: 72,
    defaults: { label: 'ADA 1', color: '#2f80ed', accessible: true },
    hasLabel: true,
    hasColor: true,
  },
  {
    kind: 'booth',
    name: 'Valet booth',
    category: 'Parking',
    w: 42,
    h: 42,
    defaults: { label: 'V', color: '#d93025' },
    hasLabel: true,
    hasColor: true,
  },
  {
    kind: 'ramp',
    name: 'Ramp',
    category: 'Parking',
    w: 160,
    h: 220,
    defaults: { label: 'RAMP UP' },
    hasLabel: true,
  },
  {
    kind: 'car',
    name: 'Car',
    category: 'Parking',
    w: 32,
    h: 66,
    defaults: { color: '#2f80ed' },
    hasColor: true,
  },
  { kind: 'wall', name: 'Wall', category: 'Structure', w: 300, h: 14, hasColor: true, defaults: { color: '#2a2d33' } },
  { kind: 'pole', name: 'Pole / pillar', category: 'Structure', w: 18, h: 18 },
  { kind: 'stairs', name: 'Stairs', category: 'Structure', w: 80, h: 100, defaults: { label: 'STAIRS' }, hasLabel: true },
  { kind: 'elevator', name: 'Elevator', category: 'Structure', w: 80, h: 84, defaults: { label: 'ELEVATOR' }, hasLabel: true },
  {
    kind: 'building',
    name: 'Building',
    category: 'Structure',
    w: 260,
    h: 160,
    defaults: { label: 'Building', color: '#d8d2c4' },
    hasLabel: true,
    hasColor: true,
  },
  { kind: 'tree', name: 'Tree', category: 'Nature', w: 64, h: 64 },
  { kind: 'palm', name: 'Palm tree', category: 'Nature', w: 72, h: 72 },
  { kind: 'bush', name: 'Shrub', category: 'Nature', w: 40, h: 30 },
  {
    kind: 'island',
    name: 'Planter island',
    category: 'Nature',
    w: 140,
    h: 40,
    defaults: { color: '#4f8a3c' },
    hasColor: true,
  },
  { kind: 'arrow', name: 'Arrow', category: 'Markings', w: 30, h: 72, defaults: { color: '#ffffff' }, hasColor: true },
  { kind: 'crosswalk', name: 'Crosswalk', category: 'Markings', w: 120, h: 60 },
  { kind: 'laneLine', name: 'Painted line', category: 'Markings', w: 220, h: 8, defaults: { color: '#f2c94c' }, hasColor: true },
  { kind: 'curb', name: 'Curb / barrier', category: 'Markings', w: 160, h: 8, defaults: { color: '#1f2328' }, hasColor: true },
  {
    kind: 'zone',
    name: 'Colored area',
    category: 'Markings',
    w: 300,
    h: 200,
    defaults: { label: 'Area 1', color: '#39d353' },
    hasLabel: true,
    hasColor: true,
    hint: 'A highlighted area such as "Back Lot" or "VIP".',
  },
  {
    kind: 'label',
    name: 'Words',
    category: 'Markings',
    w: 180,
    h: 32,
    defaults: { label: 'ONE WAY', fontSize: 20, color: '#ffffff' },
    hasLabel: true,
    hasColor: true,
  },
  // ---------- site pieces: what event plans and evacuation maps mark ----------
  { kind: 'entrance', name: 'Entrance', category: 'Site', w: 130, h: 44, defaults: { label: 'ENTRANCE', color: '#2e9e44' }, hasLabel: true, hasColor: true },
  { kind: 'exit', name: 'Exit', category: 'Site', w: 100, h: 44, defaults: { label: 'EXIT', color: '#d93636' }, hasLabel: true, hasColor: true },
  { kind: 'gate', name: 'Gate', category: 'Site', w: 140, h: 30, defaults: { label: 'Gate 1', color: '#f2c94c' }, hasLabel: true, hasColor: true },
  { kind: 'fence', name: 'Fence', category: 'Site', w: 300, h: 12, defaults: { color: '#cfd3d8' }, hasColor: true },
  { kind: 'stage', name: 'Stage', category: 'Site', w: 260, h: 150, defaults: { label: 'Main stage', color: '#2a2d33' }, hasLabel: true, hasColor: true },
  { kind: 'tent', name: 'Tent', category: 'Site', w: 120, h: 120, defaults: { label: '', color: '#f5f5f2' }, hasLabel: true, hasColor: true },
  { kind: 'toilets', name: 'Toilets', category: 'Site', w: 56, h: 56, defaults: { color: '#2f6fdb' }, hasColor: true },
  { kind: 'firstAid', name: 'First aid', category: 'Site', w: 56, h: 56, defaults: { color: '#1f8a4c' } },
  { kind: 'assembly', name: 'Assembly point', category: 'Site', w: 64, h: 64, defaults: { color: '#1f8a4c' } },
  { kind: 'info', name: 'Info point', category: 'Site', w: 52, h: 52, defaults: { color: '#2f6fdb' }, hasColor: true },
  { kind: 'loadingDock', name: 'Loading dock', category: 'Site', w: 180, h: 90, defaults: { label: 'LOADING DOCK' }, hasLabel: true },
  { kind: 'extinguisher', name: 'Fire extinguisher', category: 'Site', w: 40, h: 40 },
  { kind: 'north', name: 'North arrow', category: 'Site', w: 56, h: 80 },
];

export function assetFor(it: Pick<MapItem, 'kind' | 'accessible'>): AssetDef {
  if (it.kind === 'space' && it.accessible) return ASSETS.find((a) => a.name === 'Accessible space')!;
  return ASSETS.find((a) => a.kind === it.kind)!;
}

/** Text that stays upright no matter how its item is rotated. */
function Upright({
  x = 0,
  y = 0,
  rot,
  size,
  fill,
  weight = 600,
  outline,
  children,
}: {
  outline?: string;
  x?: number;
  y?: number;
  rot: number;
  size: number;
  fill: string;
  weight?: number;
  children: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${-rot})`}>
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size}
        fontWeight={weight}
        fill={fill}
        stroke={outline}
        strokeWidth={outline ? Math.max(1, size * 0.14) : undefined}
        strokeLinejoin="round"
        paintOrder="stroke"
        style={{ userSelect: 'none' }}
      >
        {children}
      </text>
    </g>
  );
}

const SPACE_FILL = '#f3f4f6';

export function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150;
}
const SPACE_TEXT = '#1f2328';

function fitText(text: string, boxW: number, boxH: number, max = 22) {
  const len = Math.max(1, text.length);
  return Math.max(6, Math.min(max, boxH * 0.55, (boxW * 0.9) / (len * 0.62)));
}

/** Size of a box once rotated, used to fit upright text. */
function uprightBox(w: number, h: number, rot: number) {
  const r = (rot * Math.PI) / 180;
  // a cell turned mostly sideways shows its depth as its on-screen width
  return Math.abs(Math.sin(r)) > Math.abs(Math.cos(r)) ? { w: h, h: w } : { w, h };
}

function SpaceCell({
  cx,
  w,
  h,
  rot,
  color,
  text,
  accessible,
  size,
}: {
  size?: number;
  cx: number;
  w: number;
  h: number;
  rot: number;
  color: string;
  text: string;
  accessible?: boolean;
}) {
  const box = uprightBox(w, h, rot);
  return (
    <g>
      <rect
        x={cx - w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={accessible ? '#dbe8fb' : SPACE_FILL}
        fillOpacity={0.88}
        stroke={color}
        strokeWidth={2}
      />
      {accessible && (
        <rect
          x={cx - w / 2 + 3}
          y={-h / 2 + 3}
          width={w - 6}
          height={h - 6}
          fill="none"
          stroke="#2f80ed"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
      {text && (
        <Upright x={cx} rot={rot} size={size ?? fitText(text, box.w, box.h)} fill={SPACE_TEXT}>
          {text}
        </Upright>
      )}
    </g>
  );
}

function arrowPath(w: number, h: number) {
  const hw = w / 2;
  const hh = h / 2;
  const head = Math.min(h * 0.42, w * 1.1);
  const shaft = w * 0.32;
  return `M0 ${-hh} L${hw} ${-hh + head} L${shaft} ${-hh + head} L${shaft} ${hh} L${-shaft} ${hh} L${-shaft} ${-hh + head} L${-hw} ${-hh + head} Z`;
}

/** Draws an item in local coordinates: centered on (0,0), unrotated. */
export function renderAsset(it: MapItem): ReactNode {
  const { w, h, rotation: rot } = it;
  const x0 = -w / 2;
  const y0 = -h / 2;
  const color = it.color ?? assetFor(it).defaults?.color ?? '#ffffff';

  switch (it.kind) {
    case 'space':
      return <SpaceCell cx={0} w={w} h={h} rot={rot} color={color} text={it.label ?? ''} accessible={it.accessible} />;

    case 'spaceRow': {
      const nums = rowNumbers(it);
      const cw = w / nums.length;
      const prefix = (it.prefix ?? '').trim();
      const badge = Math.min(26, h * 0.6);
      // one text size for the whole row so 9 and 10 don't look different
      const longest = nums.reduce((a, n) => Math.max(a, String(n).length), 1);
      const box = uprightBox(cw, h, rot);
      const size = fitText('8'.repeat(longest), box.w, box.h);
      return (
        <g>
          {nums.map((n, i) => (
            <SpaceCell key={i} cx={x0 + (i + 0.5) * cw} w={cw} h={h} rot={rot} color={color} text={String(n)} size={size} />
          ))}
          {prefix && (
            <g>
              <circle cx={x0 - badge * 0.7} cy={0} r={badge / 2} fill={color} stroke="#1f2328" strokeWidth={1.5} />
              <Upright x={x0 - badge * 0.7} rot={rot} size={fitText(prefix, badge, badge, 16)} fill="#1f2328" weight={800}>
                {prefix}
              </Upright>
            </g>
          )}
        </g>
      );
    }

    case 'booth':
      return (
        <g>
          <rect x={x0 + 2} y={y0 + 3} width={w} height={h} rx={6} fill="#000" opacity={0.25} />
          <rect x={x0} y={y0} width={w} height={h} rx={6} fill={color} stroke="#fff" strokeWidth={2} />
          <Upright rot={rot} size={fitText(it.label || 'V', w, h, h * 0.62)} fill="#fff" weight={800}>
            {it.label || 'V'}
          </Upright>
        </g>
      );

    case 'ramp': {
      const chevrons = [];
      const step = 26;
      for (let y = y0 + 18; y < y0 + h - 12; y += step) {
        chevrons.push(
          <path
            key={y}
            d={`M${x0 + w * 0.18} ${y + 14} L0 ${y} L${x0 + w * 0.82} ${y + 14}`}
            fill="none"
            stroke="#9aa0a8"
            strokeWidth={3}
          />,
        );
      }
      return (
        <g>
          <rect x={x0} y={y0} width={w} height={h} fill="#3b4048" stroke="#22252a" strokeWidth={3} />
          {chevrons}
          {it.label && (
            <g>
              <rect x={x0 + 8} y={h / 2 - 34} width={w - 16} height={26} rx={4} fill="#22252a" opacity={0.8} />
              <Upright y={h / 2 - 21} rot={rot} size={fitText(it.label, w - 20, 24, 16)} fill="#fff" weight={700}>
                {it.label}
              </Upright>
            </g>
          )}
        </g>
      );
    }

    case 'car':
      return (
        <g>
          <rect x={x0 + 2} y={y0 + 3} width={w} height={h} rx={w * 0.3} fill="#000" opacity={0.25} />
          <rect x={x0} y={y0} width={w} height={h} rx={w * 0.3} fill={color} stroke="#0b0d10" strokeWidth={1} />
          <rect x={x0 + w * 0.14} y={y0 + h * 0.22} width={w * 0.72} height={h * 0.16} rx={3} fill="#1d2633" />
          <rect x={x0 + w * 0.16} y={y0 + h * 0.4} width={w * 0.68} height={h * 0.3} rx={3} fill="#fff" opacity={0.18} />
          <rect x={x0 + w * 0.14} y={y0 + h * 0.72} width={w * 0.72} height={h * 0.1} rx={3} fill="#1d2633" />
          <rect x={x0 + w * 0.12} y={y0 + 1} width={w * 0.22} height={h * 0.05} rx={1} fill="#fff6c2" />
          <rect x={x0 + w * 0.66} y={y0 + 1} width={w * 0.22} height={h * 0.05} rx={1} fill="#fff6c2" />
        </g>
      );

    case 'wall':
      return <rect x={x0} y={y0} width={w} height={h} fill={color} />;

    case 'pole':
      return (
        <g>
          <rect x={x0 + 2} y={y0 + 2} width={w} height={h} fill="#000" opacity={0.3} />
          <rect x={x0} y={y0} width={w} height={h} fill="#2a2d33" stroke="#0e1013" strokeWidth={1} />
          <rect x={x0 + w * 0.2} y={y0 + h * 0.2} width={w * 0.3} height={h * 0.3} fill="#555b64" />
        </g>
      );

    case 'stairs': {
      const steps = [];
      const top = y0 + h * 0.34;
      const bottom = y0 + h * 0.62;
      for (let i = 0; i < 5; i++) {
        const sx = x0 + w * 0.25 + i * (w * 0.1);
        const sy = bottom - i * ((bottom - top) / 4);
        steps.push(<rect key={i} x={sx} y={sy} width={w * 0.1} height={bottom - sy + 4} fill="#d0d4da" />);
      }
      return (
        <g>
          <rect x={x0} y={y0} width={w} height={h} rx={4} fill="#2a2d33" stroke="#565c66" strokeWidth={2} />
          {steps}
          <Upright y={y0 + h * 0.16} rot={rot} size={fitText(it.label ?? '', w * 0.9, h * 0.2, 13)} fill="#fff" weight={700}>
            {it.label}
          </Upright>
        </g>
      );
    }

    case 'elevator': {
      const bw = w * 0.56;
      const bh = h * 0.42;
      return (
        <g>
          <rect x={x0} y={y0} width={w} height={h} rx={4} fill="#2a2d33" stroke="#565c66" strokeWidth={2} />
          <rect x={-bw / 2} y={y0 + h * 0.38} width={bw} height={bh} fill="none" stroke="#d0d4da" strokeWidth={2} />
          <line x1={0} y1={y0 + h * 0.38} x2={0} y2={y0 + h * 0.38 + bh} stroke="#d0d4da" strokeWidth={2} />
          <circle cx={-bw / 4} cy={y0 + h * 0.5} r={w * 0.05} fill="#d0d4da" />
          <circle cx={bw / 4} cy={y0 + h * 0.5} r={w * 0.05} fill="#d0d4da" />
          <Upright y={y0 + h * 0.18} rot={rot} size={fitText(it.label ?? '', w * 0.9, h * 0.2, 12)} fill="#fff" weight={700}>
            {it.label}
          </Upright>
        </g>
      );
    }

    case 'building': {
      const inset = Math.min(10, w * 0.06, h * 0.06);
      return (
        <g>
          <rect x={x0 + 4} y={y0 + 6} width={w} height={h} fill="#000" opacity={0.25} />
          <rect x={x0} y={y0} width={w} height={h} fill={color} stroke="#3a3d42" strokeWidth={3} />
          <rect
            x={x0 + inset}
            y={y0 + inset}
            width={w - inset * 2}
            height={h - inset * 2}
            fill="none"
            stroke="#000"
            strokeOpacity={0.15}
            strokeWidth={2}
          />
          {it.label && (
            <Upright rot={rot} size={fitText(it.label, Math.max(w, h) * 0.85, Math.min(w, h), 26)} fill="#1f2328" weight={700}>
              {it.label}
            </Upright>
          )}
        </g>
      );
    }

    case 'tree': {
      const r = Math.min(w, h) / 2;
      return (
        <g>
          <ellipse cx={r * 0.18} cy={r * 0.22} rx={r} ry={r * 0.95} fill="#000" opacity={0.28} />
          <circle r={r} fill="#2e6b2f" />
          <circle cx={-r * 0.3} cy={-r * 0.25} r={r * 0.55} fill="#3f8a3c" />
          <circle cx={r * 0.32} cy={-r * 0.1} r={r * 0.5} fill="#3f8a3c" />
          <circle cx={0} cy={r * 0.35} r={r * 0.5} fill="#3a8237" />
          <circle cx={-r * 0.35} cy={-r * 0.38} r={r * 0.22} fill="#6cb85a" />
          <circle cx={r * 0.25} cy={-r * 0.3} r={r * 0.16} fill="#6cb85a" />
        </g>
      );
    }

    case 'palm': {
      const r = Math.min(w, h) / 2;
      const fronds = Array.from({ length: 9 }, (_, i) => {
        const a = (i * 360) / 9;
        return (
          <g key={i} transform={`rotate(${a})`}>
            <path
              d={`M0 0 Q${r * 0.25} ${-r * 0.5} 0 ${-r} Q${-r * 0.25} ${-r * 0.5} 0 0`}
              fill={i % 2 ? '#3f8f3a' : '#4fa446'}
              stroke="#2b6528"
              strokeWidth={1}
            />
            <line x1={0} y1={0} x2={0} y2={-r * 0.92} stroke="#2b6528" strokeWidth={1} />
          </g>
        );
      });
      return (
        <g>
          <circle cx={r * 0.2} cy={r * 0.22} r={r * 0.85} fill="#000" opacity={0.22} />
          {fronds}
          <circle r={r * 0.12} fill="#7a5a32" />
        </g>
      );
    }

    case 'bush':
      return (
        <g>
          <ellipse cx={2} cy={3} rx={w / 2} ry={h / 2} fill="#000" opacity={0.22} />
          <circle cx={-w * 0.22} cy={h * 0.05} r={Math.min(w, h) * 0.38} fill="#3a7d34" />
          <circle cx={w * 0.2} cy={0} r={Math.min(w, h) * 0.42} fill="#468f3e" />
          <circle cx={0} cy={-h * 0.16} r={Math.min(w, h) * 0.34} fill="#56a24b" />
        </g>
      );

    case 'island':
      return (
        <g>
          <rect x={x0} y={y0} width={w} height={h} rx={Math.min(w / 2, h / 2, 22)} fill="#d9d5c8" />
          <rect x={x0 + 4} y={y0 + 4} width={w - 8} height={h - 8} rx={Math.max(0, Math.min(w / 2, h / 2, 22) - 4)} fill={color} />
        </g>
      );

    case 'arrow':
      return <path d={arrowPath(w, h)} fill={color} stroke="#000" strokeOpacity={0.25} strokeWidth={1} />;

    case 'crosswalk': {
      const n = Math.max(2, Math.round(w / 16));
      const sw = w / (n * 2 - 1);
      return (
        <g>
          {Array.from({ length: n }, (_, i) => (
            <rect key={i} x={x0 + i * sw * 2} y={y0} width={sw} height={h} fill="#f5f5f5" opacity={0.92} />
          ))}
        </g>
      );
    }

    case 'laneLine': {
      const t = Math.max(1.5, h / 3);
      return (
        <g>
          <rect x={x0} y={y0} width={w} height={t} fill={color} />
          <rect x={x0} y={h / 2 - t} width={w} height={t} fill={color} />
        </g>
      );
    }

    case 'curb':
      return (
        <line
          x1={x0}
          y1={0}
          x2={-x0}
          y2={0}
          stroke={color}
          strokeWidth={Math.max(2, h * 0.6)}
          strokeDasharray={`${h * 0.8} ${h * 0.8}`}
        />
      );

    case 'zone':
      return (
        <g>
          <rect x={x0} y={y0} width={w} height={h} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={3} strokeDasharray="10 6" />
          {it.label && (
            <Upright rot={rot} size={fitText(it.label, w * 0.8, h * 0.4, 34)} fill={color} weight={800} outline="#0006">
              {it.label}
            </Upright>
          )}
        </g>
      );

    case 'entrance':
    case 'exit': {
      const t = it.label || (it.kind === 'exit' ? 'EXIT' : 'ENTRANCE');
      return (
        <g>
          <rect x={x0 + 2} y={y0 + 3} width={w} height={h} rx={h * 0.22} fill="#000" opacity={0.25} />
          <rect x={x0} y={y0} width={w} height={h} rx={h * 0.22} fill={color} stroke="#fff" strokeWidth={2} />
          <path d={arrowPath(h * 0.42, h * 0.62)} transform={`translate(${x0 + h * 0.42} 0) rotate(${it.kind === 'exit' ? -90 : 90})`} fill="#fff" />
          <Upright x={h * 0.3} rot={rot} size={fitText(t, w - h * 0.9, h, h * 0.45)} fill="#fff" weight={800}>
            {t}
          </Upright>
        </g>
      );
    }

    case 'gate': {
      const post = Math.min(h, 16);
      return (
        <g>
          <line x1={x0 + post} y1={0} x2={w / 2 - post} y2={-h * 0.35} stroke={color} strokeWidth={Math.max(3, h * 0.18)} strokeLinecap="round" />
          <rect x={x0} y={-post / 2} width={post} height={post} fill="#2a2d33" stroke="#fff" strokeWidth={1.5} />
          <rect x={w / 2 - post} y={-post / 2} width={post} height={post} fill="#2a2d33" stroke="#fff" strokeWidth={1.5} />
          {it.label && (
            <Upright y={h * 0.25 + 4} rot={rot} size={fitText(it.label, w * 0.8, h, 15)} fill="#fff" weight={700} outline="#0009">
              {it.label}
            </Upright>
          )}
        </g>
      );
    }

    case 'fence': {
      const n = Math.max(2, Math.round(w / 30));
      return (
        <g>
          <line x1={x0} y1={0} x2={-x0} y2={0} stroke={color} strokeWidth={Math.max(2, h * 0.3)} />
          {Array.from({ length: n + 1 }, (_, i) => (
            <rect key={i} x={x0 + (i * w) / n - h / 3} y={-h / 2} width={(h * 2) / 3} height={h} fill={color} stroke="#1f2328" strokeWidth={1} />
          ))}
        </g>
      );
    }

    case 'stage': {
      const apron = Math.min(h * 0.22, 34);
      return (
        <g>
          <rect x={x0 + 4} y={y0 + 6} width={w} height={h} fill="#000" opacity={0.25} />
          <rect x={x0} y={y0} width={w} height={h - apron} fill={color} stroke="#000" strokeWidth={2} />
          <path d={`M${x0} ${h / 2 - apron} L${-x0} ${h / 2 - apron} L${-x0 - w * 0.08} ${h / 2} L${x0 + w * 0.08} ${h / 2} Z`} fill="#4a4f57" stroke="#000" strokeWidth={2} />
          {it.label && (
            <Upright y={-apron / 2} rot={rot} size={fitText(it.label, w * 0.8, h * 0.5, 28)} fill={isLight(color) ? '#1f2328' : '#fff'} weight={800}>
              {it.label}
            </Upright>
          )}
        </g>
      );
    }

    case 'tent':
      return (
        <g>
          <rect x={x0 + 3} y={y0 + 5} width={w} height={h} fill="#000" opacity={0.22} />
          <rect x={x0} y={y0} width={w} height={h} fill={color} stroke="#9aa0a8" strokeWidth={2} />
          <path d={`M${x0} ${y0} L${-x0} ${-y0} M${-x0} ${y0} L${x0} ${-y0}`} stroke="#9aa0a8" strokeWidth={1.5} />
          {it.label && (
            <g>
              <rect x={x0 + 6} y={-12} width={w - 12} height={24} rx={4} fill="#fff" opacity={0.9} />
              <Upright rot={rot} size={fitText(it.label, w - 16, 22, 15)} fill="#1f2328" weight={700}>
                {it.label}
              </Upright>
            </g>
          )}
        </g>
      );

    case 'toilets':
    case 'firstAid':
    case 'assembly':
    case 'info':
    case 'extinguisher': {
      const s = Math.min(w, h);
      const r = s * 0.16;
      const bg = it.kind === 'extinguisher' ? '#d93636' : color;
      const fg = '#fff';
      let glyph: ReactNode;
      if (it.kind === 'firstAid') {
        const a = s * 0.13;
        const b = s * 0.36;
        glyph = <path d={`M${-a} ${-b} H${a} V${-a} H${b} V${a} H${a} V${b} H${-a} V${a} H${-b} V${-a} H${-a} Z`} fill={fg} />;
      } else if (it.kind === 'info') {
        glyph = (
          <g>
            <circle cy={-s * 0.2} r={s * 0.07} fill={fg} />
            <rect x={-s * 0.06} y={-s * 0.06} width={s * 0.12} height={s * 0.34} rx={s * 0.03} fill={fg} />
          </g>
        );
      } else if (it.kind === 'assembly') {
        // four people gathered at the middle, arrows pointing in
        glyph = (
          <g>
            {[0, 90, 180, 270].map((a) => (
              <g key={a} transform={`rotate(${a})`}>
                <circle cx={0} cy={-s * 0.13} r={s * 0.05} fill={fg} />
                <path d={`M0 ${-s * 0.24} L${-s * 0.07} ${-s * 0.34} L${s * 0.07} ${-s * 0.34} Z`} fill={fg} />
              </g>
            ))}
          </g>
        );
      } else if (it.kind === 'extinguisher') {
        glyph = (
          <g>
            <rect x={-s * 0.13} y={-s * 0.18} width={s * 0.26} height={s * 0.5} rx={s * 0.08} fill={fg} />
            <path d={`M0 ${-s * 0.18} V${-s * 0.3} H${s * 0.2}`} stroke={fg} strokeWidth={s * 0.06} fill="none" />
          </g>
        );
      } else {
        // toilets: a man and a woman
        const p = (dx: number, skirt: boolean) => (
          <g transform={`translate(${dx} 0)`}>
            <circle cy={-s * 0.24} r={s * 0.07} fill={fg} />
            {skirt ? (
              <path d={`M${-s * 0.06} ${-s * 0.14} H${s * 0.06} L${s * 0.13} ${s * 0.14} H${-s * 0.13} Z M${-s * 0.06} ${s * 0.14} V${s * 0.32} M${s * 0.06} ${s * 0.14} V${s * 0.32}`} fill={fg} stroke={fg} strokeWidth={s * 0.05} />
            ) : (
              <rect x={-s * 0.08} y={-s * 0.14} width={s * 0.16} height={s * 0.46} rx={s * 0.03} fill={fg} />
            )}
          </g>
        );
        glyph = (
          <g>
            {p(-s * 0.17, false)}
            <line x1={0} y1={-s * 0.34} x2={0} y2={s * 0.34} stroke={fg} strokeWidth={s * 0.03} />
            {p(s * 0.17, true)}
          </g>
        );
      }
      return (
        <g>
          <rect x={-s / 2 + 2} y={-s / 2 + 3} width={s} height={s} rx={it.kind === 'info' ? s / 2 : r} fill="#000" opacity={0.25} />
          <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={it.kind === 'info' ? s / 2 : r} fill={bg} stroke="#fff" strokeWidth={2} />
          <g transform={`rotate(${-rot})`}>{glyph}</g>
        </g>
      );
    }

    case 'loadingDock': {
      const stripes = Math.max(3, Math.round(w / 28));
      return (
        <g>
          <clipPath id={`dock-${it.id}`}>
            <rect x={x0} y={y0} width={w} height={h} />
          </clipPath>
          <rect x={x0} y={y0} width={w} height={h} fill="#f2c94c" />
          <g clipPath={`url(#dock-${it.id})`}>
            {Array.from({ length: stripes * 2 }, (_, i) => (
              <path key={i} d={`M${x0 + i * 28 - h} ${-y0} L${x0 + i * 28} ${y0} L${x0 + i * 28 + 12} ${y0} L${x0 + i * 28 - h + 12} ${-y0} Z`} fill="#1f2328" />
            ))}
          </g>
          <rect x={x0} y={y0} width={w} height={h} fill="none" stroke="#1f2328" strokeWidth={3} />
          {it.label && (
            <g>
              <rect x={x0 + 8} y={-14} width={w - 16} height={28} rx={4} fill="#1f2328" />
              <Upright rot={rot} size={fitText(it.label, w - 24, 24, 16)} fill="#fff" weight={800}>
                {it.label}
              </Upright>
            </g>
          )}
        </g>
      );
    }

    case 'north':
      return (
        <g>
          <circle r={Math.min(w, h) * 0.42} cy={h * 0.08} fill="#fff" opacity={0.85} stroke="#1f2328" strokeWidth={2} />
          <path d={`M0 ${y0 + h * 0.12} L${w * 0.2} ${h * 0.3} L0 ${h * 0.18} L${-w * 0.2} ${h * 0.3} Z`} fill="#1f2328" />
          <text y={y0 + h * 0.08} textAnchor="middle" dominantBaseline="central" fontSize={h * 0.2} fontWeight={800} fill="#1f2328" stroke="#fff" strokeWidth={3} paintOrder="stroke">
            N
          </text>
        </g>
      );

    case 'label':
      return (
        <Upright rot={0} size={it.fontSize ?? 20} fill={color} weight={700} outline={isLight(color) ? '#0009' : '#fff9'}>
          {it.label}
        </Upright>
      );
  }
}
