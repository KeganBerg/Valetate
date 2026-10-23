import { assetFor } from './assets';
import { uid } from './geometry';
import type { AssetKind, LotMap, MapItem } from './types';

type Extra = Partial<Omit<MapItem, 'id' | 'kind'>>;

function box(kind: AssetKind, x: number, y: number, w: number, h: number, extra: Extra = {}): MapItem {
  const defaults = assetFor({ kind, accessible: extra.accessible }).defaults ?? {};
  return { id: uid(), kind, x, y, w, h, rotation: 0, ...defaults, ...extra };
}

/** Place by center, optionally rotated. */
function at(kind: AssetKind, cx: number, cy: number, w: number, h: number, rotation = 0, extra: Extra = {}): MapItem {
  return box(kind, cx - w / 2, cy - h / 2, w, h, { rotation, ...extra });
}

function row(x: number, y: number, w: number, h: number, prefix: string, start: number, count: number, extra: Extra = {}) {
  return box('spaceRow', x, y, w, h, { prefix, start, count, reverse: false, ...extra });
}

/** A vertical row drawn inside the on-screen box (x, y, w, h); spot `start` is at the top. */
function vrow(x: number, y: number, w: number, h: number, prefix: string, start: number, count: number, extra: Extra = {}) {
  return at('spaceRow', x + w / 2, y + h / 2, h, w, 90, { prefix, start, count, reverse: false, ...extra });
}

function space(x: number, y: number, w: number, h: number, label: string, extra: Extra = {}) {
  return box('space', x, y, w, h, { label, ...extra });
}

function text(cx: number, cy: number, label: string, fontSize = 20, color = '#ffffff', rotation = 0) {
  const w = Math.max(40, label.length * fontSize * 0.62);
  return at('label', cx, cy, w, fontSize * 1.5, rotation, { label, fontSize, color });
}

export interface Template {
  key: string;
  name: string;
  description: string;
  group: 'Start from' | 'Examples';
  build: () => Omit<LotMap, 'id' | 'updatedAt'>;
}

// ---------- generic starters ----------

function blank(): Omit<LotMap, 'id' | 'updatedAt'> {
  return { name: 'Untitled lot', width: 1400, height: 900, surface: '#5d6168', items: [] };
}

function surfaceLot(): Omit<LotMap, 'id' | 'updatedAt'> {
  const items: MapItem[] = [
    row(120, 60, 1080, 80, 'A', 1, 30),
    row(120, 260, 1080, 80, 'B', 1, 30),
    row(120, 340, 1080, 80, 'C', 1, 30),
    row(120, 540, 1080, 80, 'D', 1, 30),
    row(120, 620, 1080, 80, 'E', 1, 30),
    at('arrow', 60, 450, 30, 72, 0),
    at('arrow', 1260, 450, 30, 72, 180),
    at('booth', 660, 830, 46, 46),
    text(660, 790, 'VALET STAND', 18),
    at('crosswalk', 660, 760, 120, 40),
    at('tree', 60, 70, 70, 70),
    at('tree', 1260, 70, 70, 70),
    at('palm', 60, 820, 72, 72),
    at('palm', 1260, 820, 72, 72),
  ];
  return { name: 'Surface lot', width: 1320, height: 900, surface: '#5d6168', items };
}

/** A typical one-level garage: 120 numbered spaces in six color-coded rows. */
function garageLevel(): Omit<LotMap, 'id' | 'updatedAt'> {
  const W = 1312;
  const items: MapItem[] = [
    // outer walls
    box('wall', 28, 20, W - 56, 16),
    box('wall', 28, 20, 16, 1150),
    box('wall', W - 44, 20, 16, 1150),
    box('wall', 28, 1154, 470, 16),
    box('wall', 482, 960, 16, 210),
    box('wall', 800, 960, W - 828, 16),
    // spaces
    row(68, 52, 1177, 92, '', 1, 20, { color: '#e6b800' }),
    row(68, 196, 1177, 92, '', 21, 20, { color: '#2e9e44' }),
    row(68, 376, 1177, 92, '', 41, 20, { color: '#2f6fdb' }),
    box('island', 340, 500, 612, 172, { color: '#a9adb3' }),
    row(352, 510, 588, 74, '', 61, 10, { color: '#8a3fc7' }),
    row(352, 588, 588, 74, '', 71, 10, { color: '#8a3fc7' }),
    row(68, 744, 1177, 86, '', 81, 20, { color: '#d93636' }),
    row(68, 870, 1177, 84, '', 101, 20, { color: '#f08a24' }),
    // stairs & elevator core
    box('wall', 1142, 474, 128, 244, { color: '#2a2d33' }),
    box('stairs', 1178, 504, 76, 100),
    box('elevator', 1178, 614, 76, 88),
    // traffic
    text(290, 331, 'ONE WAY', 22),
    text(980, 331, 'ONE WAY', 22),
    text(290, 710, 'ONE WAY', 22),
    text(980, 710, 'ONE WAY', 22),
    at('arrow', 180, 331, 22, 60, -90),
    at('arrow', 1084, 331, 22, 60, 90),
    at('arrow', 180, 710, 22, 60, -90),
    at('arrow', 1084, 710, 22, 60, 90),
    at('arrow', 150, 580, 24, 72, 0),
    at('arrow', 242, 580, 24, 72, 0),
    at('arrow', 1018, 580, 24, 72, 180),
    at('arrow', 1086, 580, 24, 72, 180),
    box('ramp', 92, 990, 236, 160, { label: 'RAMP UP' }),
    at('laneLine', 648, 1065, 210, 8, 90),
    at('arrow', 570, 1030, 26, 70, 0),
    at('arrow', 723, 1030, 26, 70, 180),
    text(570, 1088, 'ENTRANCE', 20),
    text(723, 1088, 'EXIT', 20),
    text(1075, 1040, 'GARAGE · LEVEL 1', 24, '#1f2328'),
  ];
  // structural columns between rows
  for (const x of [324, 652, 985]) {
    for (const y of [44, 186, 378, 746, 880]) items.push(at('pole', x, y, 18, 18));
  }
  items.push(at('pole', 342, 578, 18, 18), at('pole', 950, 578, 18, 18));
  return { name: 'Garage level 1', width: W, height: 1200, surface: '#b8bbc0', items };
}

// ---------- examples recreated from real valet maps ----------

/** Broward Center for the Performing Arts, back lot (rows A–J). */
function browardBackLot(): Omit<LotMap, 'id' | 'updatedAt'> {
  // traced from the original map, stretched sideways so narrow spaces stay readable
  const SX = 3.6;
  const SY = 3;
  const X = (v: number) => (v - 207) * SX;
  const Y = (v: number) => (v - 355) * SY;
  const r = (x1: number, x2: number, y1: number, y2: number, prefix: string, start: number, count: number) =>
    row(X(x1), Y(y1), (x2 - x1) * SX, (y2 - y1) * SY, prefix, start, count, { color: '#39d353' });
  const items: MapItem[] = [
    r(262, 488, 381, 401, 'I', 1, 30),
    r(278, 445, 414, 434, 'H', 1, 20),
    r(462, 520, 414, 434, 'H', 21, 5),
    r(278, 445, 436, 456, 'G', 1, 20),
    r(462, 520, 436, 456, 'G', 21, 5),
    r(285, 470, 482, 502, 'F', 1, 20),
    r(282, 470, 506, 526, 'E', 1, 20),
    r(478, 635, 512, 532, 'E', 21, 10),
    r(283, 585, 549, 569, 'D', 1, 25),
    r(283, 578, 575, 595, 'C', 1, 25),
    r(305, 415, 616, 634, 'B', 1, 9),
    r(318, 415, 640, 660, 'A', 1, 9),
    r(465, 630, 635, 655, 'A', 10, 11),
    vrow(X(238), Y(410), 60, 240 * SY, 'J', 1, 20, { color: '#39d353' }),
    box('zone', X(643), Y(518), 232 * SX, 140 * SY, { label: 'Back Lot', color: '#39d353' }),
    at('palm', X(222), Y(372), 80, 80),
    at('palm', X(500), Y(470), 72, 72),
    at('tree', X(610), Y(475), 100, 100),
    at('tree', X(445), Y(615), 90, 90),
    at('palm', X(700), Y(470), 80, 80),
    at('bush', X(285), Y(470), 54, 40),
    at('bush', X(605), Y(548), 54, 40),
    text(X(760), Y(372), 'Broward Center for the Performing Arts', 36),
    text(X(760), Y(398), 'Spot 1 starts on the left (or the top) and counts up', 20, '#e8ffe8'),
  ];
  return { name: 'Broward Center – Back lot', width: 2460, height: 1040, surface: '#5d6168', items };
}

/** Broward Center for the Performing Arts, front ramp and valet booth. */
function browardFront(): Omit<LotMap, 'id' | 'updatedAt'> {
  const items: MapItem[] = [
    box('building', 700, 690, 560, 300, { label: 'Au-Rene Theater', color: '#e7dfc9' }),
    box('building', 700, 150, 330, 190, { label: 'Amaturo Theater', color: '#e7dfc9' }),
    box('building', 920, 400, 340, 170, { label: 'Abdo New River Room', color: '#e7dfc9' }),
    box('building', 700, 600, 220, 50, { label: 'Intermezzo Lounge', color: '#e7dfc9' }),
    at('building', 470, 230, 160, 110, 35, { label: "Marti's Bistro", color: '#c9b79c' }),
    box('island', 520, 420, 150, 360, { color: '#7fb3d5' }),
    // the ramp, bottom-left to top-right
    at('spaceRow', 330, 900, 340, 40, -62, { prefix: 'R1', start: 1, count: 6, color: '#f2c94c' }),
    at('spaceRow', 440, 580, 300, 40, -80, { prefix: 'R', start: 1, count: 5, color: '#f2c94c' }),
    at('spaceRow', 560, 255, 230, 40, -55, { prefix: 'R2', start: 1, count: 4, color: '#f2c94c' }),
    at('spaceRow', 790, 70, 180, 40, -4, { prefix: 'R2', start: 5, count: 3, color: '#f2c94c' }),
    at('booth', 640, 450, 46, 46),
    at('palm', 600, 760, 66, 66),
    at('palm', 610, 330, 60, 60),
    at('palm', 380, 380, 60, 60),
    at('tree', 250, 640, 90, 90),
    at('tree', 1120, 80, 90, 90),
    text(170, 60, 'Broward Center · Front', 30),
    text(170, 100, 'R = Ramp (yellow tickets / Preferred Parking)', 16),
    text(170, 126, 'V = Valet booth', 16),
  ];
  return { name: 'Broward Center – Front ramp', width: 1300, height: 1060, surface: '#6f7378', items };
}

/** West Palm Beach Marriott, 1001 Okeechobee Blvd. */
function marriottWpb(): Omit<LotMap, 'id' | 'updatedAt'> {
  const items: MapItem[] = [
    row(65, 12, 435, 56, '', 1, 17, { reverse: true }),
    vrow(17, 67, 53, 216, '', 18, 8),
    vrow(132, 140, 55, 270, '', 26, 10, { reverse: true }),
    vrow(190, 140, 53, 270, '', 36, 10),
    vrow(310, 145, 52, 123, '', 49, 5, { reverse: true }),
    space(305, 288, 52, 22, '48'),
    space(305, 340, 52, 22, '47'),
    space(305, 388, 52, 22, '46'),
    vrow(385, 145, 52, 123, '', 54, 5),
    vrow(502, 70, 54, 200, '', 65, 8, { reverse: true }),
    at('spaceRow', 614, 605, 210, 30, -32, { prefix: 'R', start: 1, count: 4, color: '#f2c94c' }),
    box('zone', 376, 282, 62, 128, { label: '', color: '#2f80ed' }),
    at('crosswalk', 368, 410, 240, 16, 90),
    at('curb', 100, 424, 90, 6),
    at('curb', 270, 424, 80, 6),
    at('curb', 420, 274, 60, 6),
    at('curb', 527, 274, 60, 6),
    box('island', 128, 410, 120, 16),
    box('island', 300, 410, 140, 16),
    box('building', 15, 520, 295, 200, { label: 'Marriott', color: '#e9e6df' }),
    box('building', 360, 600, 110, 120, { label: '', color: '#e9e6df' }),
    box('building', 600, 590, 280, 130, { label: '', color: '#d9cfbd' }),
    at('booth', 437, 700, 36, 26),
    at('arrow', 680, 360, 18, 90, 180, { color: '#3fae5a' }),
    at('arrow', 755, 340, 18, 110, 0, { color: '#3fae5a' }),
    at('arrow', 328, 590, 14, 60, 180, { color: '#3fae5a' }),
    at('arrow', 530, 615, 14, 80, 58, { color: '#3fae5a' }),
    at('tree', 620, 60, 120, 120),
    at('tree', 640, 190, 130, 130),
    at('tree', 600, 320, 110, 110),
    at('tree', 30, 30, 60, 60),
    at('palm', 130, 125, 56, 56),
    at('palm', 215, 122, 56, 56),
    at('palm', 322, 125, 56, 56),
    at('palm', 412, 128, 56, 56),
    at('palm', 215, 420, 50, 50),
    at('palm', 340, 428, 50, 50),
    at('palm', 415, 420, 50, 50),
    at('palm', 590, 425, 54, 54),
    at('palm', 840, 385, 60, 60),
    at('palm', 715, 395, 56, 56),
    box('building', 625, 30, 238, 240, { label: '', color: '#e9ecef' }),
    text(744, 70, 'West Palm Beach Marriott', 18, '#1f2328'),
    text(744, 96, '1001 Okeechobee Blvd', 15, '#1f2328'),
    text(744, 170, '65 spots + 4 on the ramp', 16, '#1f2328'),
    text(744, 194, '69 spots total', 16, '#1f2328'),
  ];
  return { name: 'WPB Marriott', width: 960, height: 720, surface: '#9a9c9e', items };
}

export const TEMPLATES: Template[] = [
  { key: 'blank', name: 'Blank lot', description: 'Start from an empty lot', group: 'Start from', build: blank },
  { key: 'surface', name: 'Surface lot', description: 'Five lettered rows, booth and lanes', group: 'Start from', build: surfaceLot },
  { key: 'garage', name: 'Garage level', description: '120 spaces, ramp, stairs, elevator', group: 'Start from', build: garageLevel },
  { key: 'broward-back', name: 'Broward Center – Back lot', description: 'Rows A–J and the back lot', group: 'Examples', build: browardBackLot },
  { key: 'broward-front', name: 'Broward Center – Front ramp', description: 'Ramp spots R1, R, R2 and the booth', group: 'Examples', build: browardFront },
  { key: 'marriott-wpb', name: 'WPB Marriott', description: '1–72 plus ramp R1–R4', group: 'Examples', build: marriottWpb },
];

export function instantiate(t: Template): LotMap {
  return { ...t.build(), id: uid(), updatedAt: Date.now() };
}
