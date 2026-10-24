import { assetFor } from './assets';
import { uid } from './geometry';
import type { AreaKind, AssetKind, LotMap, MapItem } from './types';

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

type Drawing = Omit<LotMap, 'id' | 'updatedAt'>;

/** A starting point for one area. */
export interface Template {
  key: string;
  name: string;
  description: string;
  group: 'Start from' | 'Examples';
  areaKind: AreaKind;
  build: () => Drawing;
}

// ---------- generic starters ----------

function blank(): Drawing {
  return { name: 'New area', width: 1400, height: 900, surface: '#8a8e94', items: [] };
}

/**
 * An open lot along a street: five rows, two-way drive aisles, and a one-way
 * drop-off lane in front. Cars come in at the bottom left, stop at the drop-off,
 * and leave at the bottom right; inside, traffic loops up the right side and back
 * down the left.
 */
function surfaceLot(): Drawing {
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
    // traffic loops up the right end aisle and back down the left one
    at('arrow', 1260, 380, 26, 70, 0),
    at('arrow', 60, 380, 26, 70, 180),
    // island between the lot and the drop-off lane, with an info point
    box('island', 200, 812, 920, 48, { color: grass }),
    at('info', 660, 836, 40, 40),
    at('palm', 250, 836, 56, 56),
    at('palm', 1070, 836, 56, 56),
    at('bush', 420, 836, 44, 30),
    at('bush', 900, 836, 44, 30),
    // drop-off lane, one way left to right
    text(660, 905, 'DROP-OFF', 20),
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
  return { name: 'Parking lot', width: W, height: 1040, surface: '#5d6168', items };
}

/**
 * One level of a parking structure, drawn to scale (about 4.4 px per foot):
 * 9 ft × 18 ft stalls on 24 ft two-way aisles, a loop of aisles around three bays,
 * the entrance and exit at the bottom left, the ramp in its own walled bay, and the
 * stair and elevator core in the corner next to it. Nothing sits on a driving lane.
 */
function garageLevel(): Drawing {
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
function browardBackLot(): Drawing {
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
  return { name: 'Back lot', width: 2460, height: 1040, surface: '#5d6168', items };
}

/** Broward Center for the Performing Arts, front ramp and valet booth. */
function browardFront(): Drawing {
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
  return { name: 'Front ramp', width: 1300, height: 1090, surface: '#6f7378', items };
}

/** West Palm Beach Marriott, 1001 Okeechobee Blvd. */
function marriottWpb(): Drawing {
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
  return { name: 'Main lot', width: 960, height: 720, surface: '#9a9c9e', items };
}

// ---------- site areas: overviews, outdoor areas, floors ----------

const GRASS = '#6a9a58';
const PATH = '#c9c3b3';
const ROAD = '#4a4e55';

/**
 * Festival or fair grounds, about 4.4 px per foot (450 × 290 ft inside the fence):
 * the street along the bottom, a fenced site with a public gate and a separate
 * service gate, the main lawn with the stage at the far end, a vendor row, first
 * aid by the gate, and the assembly point outside the fence.
 */
function eventOverview(): Drawing {
  const W = 2100;
  const H = 1420;
  const F = 60; // fence line
  const B = 1230; // bottom fence
  const items: MapItem[] = [
    // street
    box('wall', 0, H - 130, W, 130, { color: ROAD }),
    at('laneLine', W / 2, H - 65, W - 40, 8),
    text(W / 2, H - 30, 'STREET', 18, '#c9ccd1'),
    // sidewalk between the fence and the street
    box('island', 0, B + 12, W, H - 130 - B - 12, { color: PATH }),
    // fence with the public gate (left) and service gate (right) cut in
    at('fence', W / 2, F, W - 2 * F, 12),
    at('fence', F, (F + B) / 2, B - F, 12, 90),
    at('fence', W - F, (F + B) / 2, B - F, 12, 90),
    at('fence', (F + 380) / 2, B, 380 - F, 12),
    at('fence', (560 + 1640) / 2, B, 1640 - 560, 12),
    at('fence', (1760 + W - F) / 2, B, W - F - 1760, 12),
    at('gate', 470, B, 180, 30, 0, { label: 'Gate 1' }),
    at('gate', 1700, B, 120, 30, 0, { label: 'Service gate' }),
    at('entrance', 470, B + 70, 150, 44, 0, { label: 'ENTRANCE' }),
    // the main lawn, stage at the far end facing the crowd
    box('zone', 120, 120, 1180, 760, { label: 'Main lawn', color: '#39d353' }),
    at('stage', 710, 230, 360, 170, 0, { label: 'Main stage' }),
    // sound desk in the middle of the lawn
    at('tent', 710, 640, 70, 70, 0, { label: 'Sound' }),
    // vendor row along the right
    box('zone', 1400, 120, 580, 760, { label: '', color: '#f2994a' }),
    text(1690, 150, 'VENDOR ROW', 22),
    ...[0, 1, 2, 3, 4].flatMap((i) => [
      at('tent', 1500, 240 + i * 125, 88, 88, 0, { label: `Food ${i + 1}` }),
      at('tent', 1880, 240 + i * 125, 88, 88, 0, { label: `Shop ${i + 1}` }),
    ]),
    // services between the lawn and the gate
    at('firstAid', 700, 1000, 64, 64),
    text(700, 1052, 'First aid', 16),
    at('info', 560, 1000, 56, 56),
    text(560, 1052, 'Info', 16),
    at('toilets', 1000, 1000, 64, 64),
    text(1000, 1052, 'Toilets', 16),
    at('toilets', 1250, 1000, 64, 64),
    text(1250, 1052, 'Toilets', 16),
    at('extinguisher', 900, 230, 40, 40),
    // backstage behind the service gate
    box('zone', 1400, 920, 580, 260, { label: 'Backstage', color: '#9b51e0' }),
    // assembly point outside the fence, on the sidewalk
    at('assembly', 1200, B + 65, 64, 64),
    text(1320, B + 65, 'Assembly point', 16),
    at('north', W - 80, H - 230, 56, 80),
    at('tree', 220, 1000, 80, 80),
    at('tree', 1330, 1150, 70, 70),
    at('tree', 90, B + 70, 60, 60),
  ];
  return { name: 'Whole site', width: W, height: H, surface: GRASS, items };
}

/**
 * The lawn of an outdoor event up close: a stage with a fenced pit in front of it,
 * a mixing tent, bars and toilets along the sides, and two exits.
 */
function eventLawn(): Drawing {
  const W = 1600;
  const H = 1100;
  const items: MapItem[] = [
    at('fence', W / 2, 24, W - 48, 12),
    at('fence', 24, H / 2, H - 48, 12, 90),
    at('fence', W - 24, H / 2, H - 48, 12, 90),
    // bottom fence: exit gates near the corners, the main gate in the middle
    ...[[24, 180], [300, 730], [870, 1300], [1420, W - 24]].map(([a, b]) => at('fence', (a + b) / 2, H - 24, b - a, 12)),
    at('gate', 240, H - 24, 120, 30, 0, { label: '' }),
    at('gate', 1360, H - 24, 120, 30, 0, { label: '' }),
    at('stage', W / 2, 160, 420, 200, 0, { label: 'Main stage' }),
    // barrier in front of the stage, with the pit behind it
    at('curb', W / 2, 300, 520, 10, 0, { color: '#cfd3d8' }),
    text(W / 2, 282, 'PIT', 14, '#e8eaed'),
    at('tent', W / 2, 700, 110, 90, 0, { label: 'Sound desk' }),
    box('zone', 180, 340, W - 360, 300, { label: 'Crowd', color: '#f2c94c' }),
    at('tent', 110, 400, 110, 110, 0, { label: 'Bar 1' }),
    at('tent', W - 110, 400, 110, 110, 0, { label: 'Bar 2' }),
    at('toilets', 100, 800, 64, 64),
    at('toilets', W - 100, 800, 64, 64),
    at('firstAid', 420, 960, 64, 64),
    at('info', 1180, 960, 56, 56),
    at('extinguisher', 520, 150, 40, 40),
    at('extinguisher', 1080, 150, 40, 40),
    at('gate', W / 2, H - 24, 140, 30, 0, { label: 'Main gate' }),
    at('exit', 240, 1010, 110, 44, 0, { label: 'EXIT' }),
    at('exit', 1360, 1010, 110, 44, 180, { label: 'EXIT' }),
  ];
  return { name: 'Main lawn', width: W, height: H, surface: GRASS, items };
}

/**
 * A venue or hotel from the street: the building, a one-way drop-off loop at the
 * front door, the parking lot and garage beside it, deliveries round the back.
 */
function venueOverview(): Drawing {
  const W = 2000;
  const H = 1400;
  const items: MapItem[] = [
    box('wall', 0, H - 140, W, 140, { color: ROAD }),
    at('laneLine', W / 2, H - 70, W - 40, 8),
    text(W / 2, H - 30, 'MAIN STREET', 18, '#c9ccd1'),
    // sidewalk, cut for the two driveways
    box('island', 0, H - 180, 340, 40, { color: PATH }),
    box('island', 500, H - 180, 500, 40, { color: PATH }),
    box('island', 1160, H - 180, W - 1160, 40, { color: PATH }),
    // building
    box('building', 300, 140, 900, 560, { label: 'Main building', color: '#e7dfc9' }),
    // drop-off loop in front of the door: in on the left, out on the right
    box('island', 520, 860, 460, 100, { color: GRASS }),
    at('arrow', 420, 1060, 26, 80, 0),
    at('arrow', 750, 790, 26, 80, 90),
    at('arrow', 1080, 1060, 26, 80, 180),
    text(750, 900, 'DROP-OFF', 22, '#ffffff'),
    at('crosswalk', 750, 730, 140, 40),
    at('entrance', 250, H - 230, 150, 44),
    at('exit', 1250, H - 230, 110, 44, 180),
    // parking lot and garage next door (each is its own area)
    box('zone', 1350, 140, 560, 460, { label: 'Parking lot', color: '#2f80ed' }),
    box('zone', 1350, 700, 560, 380, { label: 'Garage', color: '#9b51e0' }),
    // deliveries at the back
    at('loadingDock', 750, 80, 200, 80),
    at('arrow', 240, 360, 26, 80, 0),
    text(160, 120, 'SERVICE DRIVE', 16),
    at('info', 1250, 760, 52, 52),
    at('assembly', 160, 1080, 64, 64),
    text(160, 1135, 'Assembly point', 16),
    at('north', W - 70, 90, 56, 80),
    at('tree', 560, 910, 60, 60),
    at('tree', 940, 910, 60, 60),
    at('palm', 1250, 960, 64, 64),
  ];
  return { name: 'Whole site', width: W, height: H, surface: '#8a8e94', items };
}

/**
 * A campus or facility: several buildings on a one-way loop road, two parking
 * lots, a loading dock for the warehouse and an assembly point on the lawn.
 */
function campusOverview(): Drawing {
  const W = 2200;
  const H = 1500;
  const R = 70; // road width
  const items: MapItem[] = [
    // loop road
    box('wall', 140, 140, W - 280, R, { color: ROAD }),
    box('wall', 140, H - 210 - R, W - 280, R, { color: ROAD }),
    box('wall', 140, 140, R, H - 350, { color: ROAD }),
    box('wall', W - 140 - R, 140, R, H - 350, { color: ROAD }),
    box('wall', W / 2 - R / 2, H - 210, R, 210, { color: ROAD }),
    at('arrow', 700, 175, 24, 60, 90),
    at('arrow', 1500, 175, 24, 60, 90),
    at('arrow', W - 175, 700, 24, 60, 180),
    at('arrow', 1500, H - 245, 24, 60, -90),
    at('arrow', 700, H - 245, 24, 60, -90),
    at('arrow', 175, 700, 24, 60, 0),
    at('gate', W / 2, H - 40, 120, 30, 0, { label: 'Main gate' }),
    // buildings inside the loop
    box('building', 300, 300, 520, 360, { label: 'Main office', color: '#e7dfc9' }),
    box('building', 960, 300, 420, 300, { label: 'Building B', color: '#e7dfc9' }),
    box('building', 1500, 300, 480, 560, { label: 'Warehouse', color: '#d8d2c4' }),
    at('loadingDock', 1740, 900, 200, 80),
    box('wall', 1690, 940, 100, H - 210 - R - 940, { color: ROAD }),
    box('zone', 300, 760, 520, 340, { label: 'Lot A', color: '#2f80ed' }),
    box('zone', 960, 720, 360, 380, { label: 'Lot B', color: '#2f80ed' }),
    at('assembly', 1150, 650, 64, 64),
    text(1150, 700, 'Assembly point', 15),
    at('firstAid', 870, 330, 56, 56),
    at('info', 870, 420, 52, 52),
    at('extinguisher', 1460, 330, 36, 36),
    at('north', W - 70, 70, 56, 80),
    at('tree', 70, 70, 70, 70),
    at('tree', 70, H - 120, 70, 70),
    at('tree', W - 70, H - 120, 70, 70),
  ];
  return { name: 'Whole site', width: W, height: H, surface: GRASS, items };
}

/**
 * One floor of a building: outside walls, a corridor down the middle with rooms
 * on both sides, stairs at both ends, the elevator, toilets, and exits.
 */
function buildingFloor(): Drawing {
  const W = 1500;
  const H = 860;
  const T = 14;
  const C1 = 360; // corridor
  const C2 = 480;
  const room = (x: number, y: number, w: number, h: number, label: string) => box('zone', x + 6, y + 6, w - 12, h - 12, { label, color: '#2f80ed' });
  const items: MapItem[] = [
    box('wall', 40, 40, W - 80, T),
    box('wall', 40, H - 40 - T, W - 80, T),
    // outside walls, with an exit door at each end of the hallway
    box('wall', 40, 40, T, 380 - 40),
    box('wall', 40, 460, T, H - 40 - 460),
    box('wall', W - 40 - T, 40, T, 380 - 40),
    box('wall', W - 40 - T, 460, T, H - 40 - 460),
    // corridor walls, with doors left open
    ...[160, 420, 680, 940, 1200].map((x) => box('wall', x, C1 - T, 200, T)),
    ...[160, 420, 680, 940, 1200].map((x) => box('wall', x, C2, 200, T)),
    ...[400, 660, 920, 1180].flatMap((x) => [box('wall', x, 54, T, C1 - 54 - T), box('wall', x, C2 + T, T, H - 54 - C2 - T)]),
    room(54, 54, 346, C1 - 68, 'Office'),
    room(414, 54, 246, C1 - 68, 'Meeting'),
    room(674, 54, 246, C1 - 68, 'Office'),
    room(934, 54, 246, C1 - 68, 'Storage'),
    room(414, C2 + T, 246, H - 68 - C2 - T, 'Break room'),
    room(674, C2 + T, 246, H - 68 - C2 - T, 'Office'),
    room(934, C2 + T, 246, H - 68 - C2 - T, 'Office'),
    text(W / 2, (C1 + C2) / 2, 'HALLWAY', 18, '#ffffff'),
    box('stairs', 80, C2 + 40, 90, 110),
    box('elevator', 200, C2 + 40, 90, 90),
    at('toilets', 330, C2 + 100, 60, 60),
    box('stairs', 1220, 100, 90, 110),
    at('toilets', 1360, 160, 60, 60),
    at('extinguisher', 600, (C1 + C2) / 2, 34, 34),
    at('extinguisher', 1100, (C1 + C2) / 2, 34, 34),
    at('firstAid', 1330, C2 + 100, 56, 56),
    at('exit', 120, (C1 + C2) / 2, 100, 40, 0),
    at('exit', W - 120, (C1 + C2) / 2, 100, 40, 180),
  ];
  return { name: 'Floor 1', width: W, height: H, surface: '#d9d6cf', items };
}

export const TEMPLATES: Template[] = [
  { key: 'blank', name: 'Blank area', description: 'Start from nothing', group: 'Start from', areaKind: 'outdoor', build: blank },
  { key: 'surface', name: 'Parking lot', description: '150 spaces, drop-off lane, entrance and exit', group: 'Start from', areaKind: 'lot', build: surfaceLot },
  { key: 'garage', name: 'Garage level', description: '120 spaces, two-way aisles, ramp, stairs, elevator', group: 'Start from', areaKind: 'garage', build: garageLevel },
  { key: 'event-overview', name: 'Event grounds', description: 'Fence, gates, stage, vendor row, first aid', group: 'Start from', areaKind: 'overview', build: eventOverview },
  { key: 'event-lawn', name: 'Event lawn', description: 'Stage, crowd area, bars, toilets, exits', group: 'Start from', areaKind: 'outdoor', build: eventLawn },
  { key: 'venue-overview', name: 'Venue or hotel', description: 'Building, drop-off loop, lots, loading dock', group: 'Start from', areaKind: 'overview', build: venueOverview },
  { key: 'campus-overview', name: 'Campus or facility', description: 'Buildings on a loop road, lots, loading dock', group: 'Start from', areaKind: 'overview', build: campusOverview },
  { key: 'floor', name: 'Building floor', description: 'Rooms, hallway, stairs, exits', group: 'Start from', areaKind: 'floor', build: buildingFloor },
  { key: 'broward-back', name: 'Broward Center – Back lot', description: 'Rows A–J and the back lot', group: 'Examples', areaKind: 'lot', build: browardBackLot },
  { key: 'broward-front', name: 'Broward Center – Front ramp', description: 'Ramp spots R1, R, R2 and the booth', group: 'Examples', areaKind: 'lot', build: browardFront },
  { key: 'marriott-wpb', name: 'WPB Marriott', description: '1–72 plus ramp R1–R4', group: 'Examples', areaKind: 'lot', build: marriottWpb },
];

const T = (key: string) => TEMPLATES.find((t) => t.key === key)!;

/** A starting point for a whole site: its name and the areas it starts with. */
export interface SiteTemplate {
  key: string;
  name: string;
  description: string;
  icon: string;
  group: 'Start from' | 'Examples';
  areas: { template: Template; name?: string }[];
}

export const SITE_TEMPLATES: SiteTemplate[] = [
  { key: 'event', name: 'Event grounds', description: 'Whole site, main lawn and parking', icon: '🎪', group: 'Start from', areas: [{ template: T('event-overview') }, { template: T('event-lawn') }, { template: T('surface') }] },
  { key: 'venue', name: 'Venue or hotel', description: 'Whole site, parking lot and garage', icon: '🏨', group: 'Start from', areas: [{ template: T('venue-overview') }, { template: T('surface') }, { template: T('garage') }] },
  { key: 'campus', name: 'Campus or facility', description: 'Whole site, a building floor and parking', icon: '🏭', group: 'Start from', areas: [{ template: T('campus-overview') }, { template: T('floor') }, { template: T('surface') }] },
  { key: 'garage', name: 'Parking garage', description: 'Two garage levels', icon: '🅿️', group: 'Start from', areas: [{ template: T('garage') }, { template: T('garage'), name: 'Garage level 2' }] },
  { key: 'blank', name: 'Blank site', description: 'One empty area to draw on', icon: '✏️', group: 'Start from', areas: [{ template: T('blank'), name: 'Whole site' }] },
  { key: 'broward', name: 'Broward Center', description: 'Front ramp and back lot (rows A–J)', icon: '🎭', group: 'Examples', areas: [{ template: T('broward-front') }, { template: T('broward-back') }] },
  { key: 'marriott', name: 'WPB Marriott', description: '1001 Okeechobee Blvd, spots 1–72', icon: '🏨', group: 'Examples', areas: [{ template: T('marriott-wpb') }] },
];

export function instantiate(t: Template, extra: Partial<LotMap> = {}): LotMap {
  return { ...t.build(), areaKind: t.areaKind, id: uid(), updatedAt: Date.now(), ...extra };
}

/** A new site and its starting areas, ready to save. */
export function instantiateSite(t: SiteTemplate, siteId: string): LotMap[] {
  return t.areas.map((a, i) => instantiate(a.template, { siteId, position: i, ...(a.name && { name: a.name }) }));
}
