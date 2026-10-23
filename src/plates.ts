import { normalizePlate } from './ops';

/**
 * Words printed on plates that are never the plate number itself: state
 * names, slogans and frame text. A read that is only one of these is ignored.
 */
const PLATE_WORDS = new Set(
  (
    'ALABAMA ALASKA ARIZONA ARKANSAS CALIFORNIA COLORADO CONNECTICUT DELAWARE FLORIDA GEORGIA HAWAII IDAHO ILLINOIS ' +
    'INDIANA IOWA KANSAS KENTUCKY LOUISIANA MAINE MARYLAND MASSACHUSETTS MICHIGAN MINNESOTA MISSISSIPPI MISSOURI ' +
    'MONTANA NEBRASKA NEVADA NEWHAMPSHIRE NEWJERSEY NEWMEXICO NEWYORK NORTHCAROLINA NORTHDAKOTA OHIO OKLAHOMA OREGON ' +
    'PENNSYLVANIA RHODEISLAND SOUTHCAROLINA SOUTHDAKOTA TENNESSEE TEXAS UTAH VERMONT VIRGINIA WASHINGTON WESTVIRGINIA ' +
    'WISCONSIN WYOMING ONTARIO QUEBEC SUNSHINE STATE EMPIRE GARDEN LONE STAR DEALER COUNTY USA THE OF AND MYFLORIDA ' +
    'MIAMIDADE BROWARD PALMBEACH ORANGE GOLDEN GRAND CANYON LAND LINCOLN EXPLORE DISCOVER VISIT LIVE FREE DIE ' +
    'EXCELSIOR SHOW ME PEACH TAR HEEL FIRST IN FLIGHT'
  ).split(' '),
);

/** Characters OCR mixes up on plates, folded together for fuzzy matching. */
const LOOKALIKE: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };

/** A plate with lookalike characters folded together ("B0S" and "805" match). */
export function plateKey(s: string): string {
  return normalizePlate(s)
    .split('')
    .map((c) => LOOKALIKE[c] ?? c)
    .join('');
}

function score(c: string): number {
  if (c.length < 2 || c.length > 8 || PLATE_WORDS.has(c)) return -Infinity;
  const digits = /[0-9]/.test(c);
  const letters = /[A-Z]/.test(c);
  let s = c.length;
  if (digits) s += 3;
  if (digits && letters) s += 3;
  // a long run of letters only is far more likely a word than a plate
  if (!digits && c.length > 4) s -= 3;
  if (c.length >= 5 && c.length <= 7) s += 2;
  return s;
}

/**
 * The plate number in what OCR read off a photo. Plates print their number
 * large with a space or dash in it ("ABC 1234", "7-ABC-123") next to small
 * state names and slogans, so try each word and runs of neighbouring words
 * on a line, and keep the one that looks most like a plate number.
 */
export function pickPlate(text: string): string {
  let best = '';
  let bestScore = -Infinity;
  for (const line of text.toUpperCase().split(/\n+/)) {
    const words = line.split(/[^A-Z0-9]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      let joined = '';
      for (let j = i; j < Math.min(words.length, i + 3); j++) {
        joined += words[j];
        const s = score(joined);
        if (s > bestScore) {
          best = joined;
          bestScore = s;
        }
      }
    }
  }
  return bestScore > 3 ? best : '';
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/**
 * The parked car whose plate is the one scanned, allowing for a misread
 * lookalike character, or one character wrong on a longer plate.
 */
export function matchPlate<C extends { plate: string }>(cars: C[], scanned: string): C | undefined {
  const key = plateKey(scanned);
  if (key.length < 2) return undefined;
  const withPlate = cars.filter((c) => c.plate.trim());
  const exact = withPlate.find((c) => plateKey(c.plate) === key);
  if (exact || key.length < 5) return exact;
  const near = withPlate.filter((c) => editDistance(plateKey(c.plate), key) === 1);
  // two cars one character away is a guess, not a match
  return near.length === 1 ? near[0] : undefined;
}
