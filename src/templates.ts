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

/**
 * An open lot along a street: five rows, two-way drive aisles, and a one-way valet
 * drop-off lane in front. Cars come in at the bottom left, stop at the stand, and
 * leave at the bottom right; valets loop up the right side and back down the left.
 */
function surfaceLot(): Omit<LotMap, 'id' | 'updatedAt'> {
  const W = 1320;
  const grass = '#5f8f4e';
  const items: MapItem[] = [
    // landscaping along the back edge
    box('island', 0, 0, W, 50, { color: grass }),
    // rows: 30 spaces each between two 120-wide end aisles
    row(120, 60, 1080, 80, 'A', 1, 30),
    row(120, 260, 1080, 80, 'B', 1, 30),
    row(120, 340, 1080, 80, 'C', 1, 30),
    row(120, 540, 1080, 80, 'D', 1, 30),
    row(120, 620, 1080, 80, 'E', 1, 30),
    // valets loop up the right end aisle and back down the left one
    at('arrow', 1260, 380, 26, 70, 0),
    at('arrow', 60, 380, 26, 70, 180),
    // island between the lot and the drop-off lane, with the valet stand
    box('island', 200, 812, 920, 48, { color: grass }),
    at('booth', 660, 836, 44, 44),
    at('palm', 250, 836, 56, 56),
    at('palm', 1070, 836, 56, 56),
    at('bush', 420, 836, 44, 30),
    at('bush', 900, 836, 44, 30),
    // drop-off lane, one way left to right
    text(660, 905, 'VALET DROP-OFF', 20),
    at('arrow', 420, 912, 22, 60, 90),
    at('arrow', 900, 912, 22, 60, 90),
    // sidewalk along the street, with the entrance and exit cut in
    box('island', 180, 960, 960, 18, { color: '#a9adb3' }),
    box('wall', 0, 982, W, 58, { color: '#3d4148' }),
    at('arrow', 60, 912, 26, 70, 0),
    text(60, 1011, 'ENTER', 18),
    at('arrow', 1260, 912, 26, 70, 180),
    text(1260, 1011, 'EXIT', 18),
    text(660, 1011, 'STREET', 16, '#c9ccd1'),
    at('tree', 70, 25, 46, 46),
    at('tree', 660, 25, 46, 46),
    at('tree', 1250, 25, 46, 46),
  ];
  return { name: 'Surface lot', width: W, height: 1040, surface: '#5d6168', items };
}

/**
 * One level of a parking structure, drawn to scale (about 4.4 px per foot):
 * 9 ft × 18 ft stalls on 24 ft two-way aisles, a loop of aisles around three bays,
 * the entrance and exit at the bottom left, the ramp in its own walled bay, and the
 * stair and elevator core in the corner next to it. Nothing sits on a driving lane.
 */
function garageLevel(): Omit<LotMap, 'id' | 'updatedAt'> {
  const W = 1212;
  const H = 1010;
  const T = 16; // wall thickness
  const L = 20; // outside edge
  const R = W - L; // 1192
  const B = 902; // bottom of the deck
  const STALL = 80; // 18 ft
  const AISLE = 110; // 24 ft
  const rowsX = 146; // left end aisle is 36–146
  const rowsW = 800; // 20 stalls × 40 (9 ft)
  const rampBay = rowsX + rowsW + AISLE; // 1056, right end aisle is 946–1056
  // rows from the top wall down: single, aisle, double, aisle, double, aisle, single
  const y1 = L + T; // 36
  const aA = y1 + STALL; // 116
  const y2 = aA + AISLE; // 226
  const gap = 20; // column line between back-to-back stalls
  const y3 = y2 + STALL + gap; // 326
  const aB = y3 + STALL; // 406
  const y4 = aB + AISLE; // 516
  const y5 = y4 + STALL + gap; // 616
  const aC = y5 + STALL; // 696
  const y6 = aC + AISLE; // 806
  const colors = ['#e6b800', '#2e9e44', '#2f6fdb', '#8a3fc7', '#d93636', '#f08a24'];
  const rampTop = 300;
  const rampFoot = 700;

  const items: MapItem[] = [
    // the street outside
    box('wall', 0, B, W, H - B, { color: '#5d6168' }),
    // outer walls, with the driveway cut into the bottom left
    box('wall', L, L, R - L, T),
    box('wall', L, L, T, B - L),
    box('wall', R - T, L, T, B - L),
    box('wall', rowsX, B - T, R - rowsX, T),
    // stalls, numbered 1–120 from the top
    ...[y1, y2, y3, y4, y5, y6].map((y, i) => row(rowsX, y, rowsW, STALL, '', 1 + i * 20, 20, { color: colors[i] })),
    // stair and elevator core in the top right corner, door onto the end aisle
    box('wall', rampBay, y1, 8, rampFoot - y1),
    box('wall', rampBay + 8, y1, R - T - rampBay - 8, rampTop - 20 - y1, { color: '#3a3e45' }),
    box('stairs', rampBay + 24, y1 + 14, 80, 96),
    box('elevator', rampBay + 24, y1 + 126, 80, 84),
    at('crosswalk', rowsX + rowsW + AISLE / 2, y1 + 40, AISLE - 8, 44),
    // ramp up, in its own bay; cars swing in from the bottom of the right end aisle
    box('ramp', rampBay + 14, rampTop, R - T - rampBay - 20, rampFoot - rampTop, { label: 'RAMP UP' }),
    // two-way aisles: keep right
    ...[aA, aB, aC].flatMap((a) => [
      at('arrow', 330, a + 28, 20, 56, -90),
      at('arrow', 760, a + 28, 20, 56, -90),
      at('arrow', 330, a + AISLE - 28, 20, 56, 90),
      at('arrow', 760, a + AISLE - 28, 20, 56, 90),
    ]),
    ...[36, rowsX + rowsW].flatMap((x) => [
      at('arrow', x + 28, 460, 20, 56, 180),
      at('arrow', x + AISLE - 28, 460, 20, 56, 0),
    ]),
    // driveway out to the street
    at('laneLine', 91, 956, 108, 8, 90),
    at('arrow', 118, 950, 22, 60, 0),
    at('arrow', 64, 950, 22, 60, 180),
    text(250, 956, 'ENTRANCE / EXIT', 20),
    text(940, 956, 'GARAGE · LEVEL 1', 24),
  ];
  // structural columns every four stalls (35 ft) along the column lines and walls
  for (let x = rowsX; x <= rowsX + rowsW; x += 160) {
    items.push(at('pole', x, y2 + STALL + gap / 2, 18, 18), at('pole', x, y4 + STALL + gap / 2, 18, 18));
    items.push(at('pole', x, L + T / 2, T, T), at('pole', x, B - T / 2, T, T));
  }
  return { name: 'Garage level 1', width: W, height: H, surface: '#b8bbc0', items };
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
    at('building', 410, 225, 160, 110, 35, { label: "Marti's Bistro", color: '#c9b79c' }),
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
    text(250, 60, 'Broward Center · Front', 30),
    text(250, 100, 'R = Ramp (yellow tickets / Preferred Parking)', 16),
    text(250, 126, 'V = Valet booth', 16),
  ];
  return { name: 'Broward Center – Front ramp', width: 1300, height: 1090, surface: '#6f7378', items };
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
    at('spaceRow', 575, 575, 210, 30, -32, { prefix: 'R', start: 1, count: 4, color: '#f2c94c' }),
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
    at('arrow', 551, 537, 14, 80, 58, { color: '#3fae5a' }),
    at('tree', 620, 60, 120, 120),
    at('tree', 640, 190, 130, 130),
    at('tree', 614, 330, 100, 100),
    at('tree', 30, 30, 60, 60),
    at('palm', 160, 112, 52, 52),
    at('palm', 215, 112, 52, 52),
    at('palm', 336, 116, 52, 52),
    at('palm', 412, 116, 52, 52),
    at('palm', 215, 446, 46, 46),
    at('palm', 300, 446, 46, 46),
    at('palm', 415, 446, 46, 46),
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
  { key: 'surface', name: 'Surface lot', description: '150 spaces, drop-off lane and valet stand', group: 'Start from', build: surfaceLot },
  { key: 'garage', name: 'Garage level', description: '120 spaces, two-way aisles, ramp, stairs, elevator', group: 'Start from', build: garageLevel },
  { key: 'broward-back', name: 'Broward Center – Back lot', description: 'Rows A–J and the back lot', group: 'Examples', build: browardBackLot },
  { key: 'broward-front', name: 'Broward Center – Front ramp', description: 'Ramp spots R1, R, R2 and the booth', group: 'Examples', build: browardFront },
  { key: 'marriott-wpb', name: 'WPB Marriott', description: '1–72 plus ramp R1–R4', group: 'Examples', build: marriottWpb },
];

export function instantiate(t: Template): LotMap {
  return { ...t.build(), id: uid(), updatedAt: Date.now() };
}
