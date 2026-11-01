// Level generation.
//
// A level is a set of cubes on an integer grid. Each cube has an arrow
// pointing along one of the six axis directions. Tapping a cube sends it
// flying in that direction, but only if no other cube is in its path.
//
// Levels are built by "solving backwards": we repeatedly pick a cube that
// could leave right now, give it a free direction, and take it out. The
// order we take them out in is a valid solution, so every level is
// guaranteed to be solvable. Levels are seeded by number, so level 12 is
// always the same level 12.

export const DIRS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

export function key(x, y, z) {
  return x + ',' + y + ',' + z;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// ---------- shapes ----------
// Each shape returns an array of [x, y, z] cells inside an X*Y*Z box.

function box(X, Y, Z) {
  const cells = [];
  for (let x = 0; x < X; x++)
    for (let y = 0; y < Y; y++)
      for (let z = 0; z < Z; z++) cells.push([x, y, z]);
  return cells;
}

function pyramid(X, Y, Z) {
  const layers = Math.ceil(Math.min(X, Z) / 2);
  return box(X, layers, Z).filter(([x, y, z]) =>
    x >= y && x <= X - 1 - y && z >= y && z <= Z - 1 - y);
}

function ball(X, Y, Z) {
  const cx = (X - 1) / 2, cy = (Y - 1) / 2, cz = (Z - 1) / 2;
  const rx = X / 2, ry = Y / 2, rz = Z / 2;
  return box(X, Y, Z).filter(([x, y, z]) => {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
    return d <= 1.0;
  });
}

function plus(X, Y, Z) {
  const cx = Math.floor(X / 2), cy = Math.floor(Y / 2), cz = Math.floor(Z / 2);
  return box(X, Y, Z).filter(([x, y, z]) =>
    (x === cx && y === cy) || (x === cx && z === cz) || (y === cy && z === cz) ||
    (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1 && Math.abs(z - cz) <= 1));
}

function stairs(X, Y, Z) {
  return box(X, Y, Z).filter(([x, y]) => y <= Math.floor((x / Math.max(1, X - 1)) * (Y - 1)));
}

function donut(X, Y, Z) {
  const cx = (X - 1) / 2, cz = (Z - 1) / 2;
  return box(X, Y, Z).filter(([x, , z]) => !(Math.abs(x - cx) < 1 && Math.abs(z - cz) < 1));
}

function frame(X, Y, Z) {
  return box(X, Y, Z).filter(([x, y, z]) => {
    const edges = (x === 0 || x === X - 1) + (y === 0 || y === Y - 1) + (z === 0 || z === Z - 1);
    return edges >= 2;
  });
}

function tower(X, Y, Z) {
  return box(X, Y, Z).filter(([x, y, z]) => {
    const w = Math.max(0, Math.floor(y / 2));
    return x >= Math.min(w, Math.floor((X - 1) / 2)) && x <= Math.max(X - 1 - w, Math.floor(X / 2)) &&
      z >= Math.min(w, Math.floor((Z - 1) / 2)) && z <= Math.max(Z - 1 - w, Math.floor(Z / 2));
  });
}

function holey(rng) {
  return (X, Y, Z) => box(X, Y, Z).filter(() => rng() > 0.18);
}

// ---------- hand-made first levels, to teach the game ----------

const TUTORIAL = [
  // 1: three cubes in a row, all can leave
  { cells: [[0, 0, 0, 2], [1, 0, 0, 2], [2, 0, 0, 2]] },
  // 2: a row that must be cleared from the front
  { cells: [[0, 0, 0, 0], [1, 0, 0, 0], [2, 0, 0, 0], [1, 1, 0, 2]] },
  // 3: a small square with a blocker
  { cells: [[0, 0, 0, 0], [1, 0, 0, 3], [0, 1, 0, 2], [1, 1, 0, 4]] },
];

// ---------- direction assignment ----------

function assignDirections(cells, rng, tangle) {
  const present = new Map();
  for (const c of cells) present.set(key(c[0], c[1], c[2]), c);
  const full = new Set(present.keys());

  let minC = [Infinity, Infinity, Infinity], maxC = [-Infinity, -Infinity, -Infinity];
  for (const c of cells) for (let i = 0; i < 3; i++) {
    minC[i] = Math.min(minC[i], c[i]);
    maxC[i] = Math.max(maxC[i], c[i]);
  }

  // How many cubes lie along a direction (within the shape's bounds).
  function countInPath(set, c, d) {
    let n = 0;
    let x = c[0] + d[0], y = c[1] + d[1], z = c[2] + d[2];
    while (x >= minC[0] && x <= maxC[0] && y >= minC[1] && y <= maxC[1] && z >= minC[2] && z <= maxC[2]) {
      if (set.has(key(x, y, z))) n++;
      x += d[0]; y += d[1]; z += d[2];
    }
    return n;
  }

  const result = [];
  while (present.size > 0) {
    // Collect every cube that could leave right now, with its free directions.
    const options = [];
    for (const [k, c] of present) {
      const free = [];
      for (let i = 0; i < 6; i++) if (countInPath(present, c, DIRS[i]) === 0) free.push(i);
      if (free.length) options.push({ k, c, free });
    }
    const pick = options[Math.floor(rng() * options.length)];
    // Prefer directions that are blocked at the start of the level, so cubes
    // depend on each other. `tangle` (0..1) controls how strongly.
    let best = pick.free[0], bestScore = -Infinity;
    for (const i of pick.free) {
      const score = countInPath(full, pick.c, DIRS[i]) * tangle * 3 + rng() * 2;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    present.delete(pick.k);
    const cube = [pick.c[0], pick.c[1], pick.c[2], best];
    if (pick.c[3] !== undefined) cube.push(pick.c[3]); // fixed colour (picture levels)
    result.push(cube);
  }
  // Present cubes in a random order so the solve order isn't leaked.
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---------- picture levels ----------
// Pixel art, extruded two cubes deep. Each letter is a colour.

const COLORS = {
  R: '#ff6b6b', P: '#ffafcc', Y: '#ffd166', O: '#f4a261', G: '#80ed99', D: '#3fb87f',
  B: '#7cc6fe', N: '#4d8fd6', W: '#f4f4f8', K: '#a9744f', L: '#cdb4db', S: '#adb5bd',
};

const PICTURES = [
  { name: 'Heart', art: [
    '.RR.RR.',
    'RRRRRRR',
    'RRRRRRR',
    '.RRRRR.',
    '..RRR..',
    '...R...'] },
  { name: 'House', art: [
    '...R...',
    '..RRR..',
    '.RRRRR.',
    'RRRRRRR',
    '.YYYYY.',
    '.YBYKY.',
    '.YYYKY.'] },
  { name: 'Tree', art: [
    '...D...',
    '..DGD..',
    '.GDGGD.',
    'DGGDGGD',
    '.GGGGG.',
    '...K...',
    '...K...'] },
  { name: 'Cat', art: [
    'O.....O',
    'OO...OO',
    'OOOOOOO',
    'ONOOONO',
    'OOOPOOO',
    '.OOOOO.'] },
  { name: 'Star', art: [
    '....Y....',
    '...YYY...',
    'YYYYYYYYY',
    '.YYYYYYY.',
    '..YYYYY..',
    '.YYY.YYY.',
    'YY.....YY'] },
  { name: 'Flower', art: [
    '..P.P..',
    '.PPPPP.',
    'PPPYPPP',
    '.PPPPP.',
    '..PDP..',
    '.DDD...',
    '...D...'] },
  { name: 'Fish', art: [
    '...BB....',
    '.BBBBB..B',
    'BBNBBBBBB',
    'BBBBBBBBB',
    '.BBBBB..B',
    '...BB....'] },
  { name: 'Mushroom', art: [
    '..RRRRR..',
    '.RRWRRWR.',
    'RRRRRRRRR',
    'RWRRRWRRR',
    '...WWW...',
    '...WWW...',
    '...WWW...'] },
  { name: 'Sun', art: [
    '..YYYYY..',
    '.YYYYYYY.',
    'YYKYYYKYY',
    'YYYYYYYYY',
    'YKYYYYYKY',
    '.YKKKKKY.',
    '..YYYYY..'] },
  { name: 'Apple', art: [
    '....K..',
    '...KG..',
    '.RRRRR.',
    'RRRRRRR',
    'RRRRRRR',
    'RRRRRRR',
    '.RRRRR.',
    '..R.R..'] },
  { name: 'Ice cream', art: [
    '.PPP.',
    'PPPPP',
    'PWPPP',
    '.KKK.',
    '.KKK.',
    '..K..'] },
  { name: 'Umbrella', art: [
    '...L...',
    '.LLLLL.',
    'LLLLLLL',
    'L.L.L.L',
    '...S...',
    '...S...',
    '.S.S...',
    '..S....'] },
];

export const PICTURE_COUNT = PICTURES.length;

function pictureCells(picture, depth) {
  const cells = [];
  const rows = picture.art.length;
  picture.art.forEach((row, r) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      for (let z = 0; z < depth; z++) cells.push([x, rows - 1 - r, z, COLORS[ch]]);
    });
  });
  return cells;
}

// ---------- challenge levels ----------
// From level 5, every 5th level is a challenge, rotating through these.

const CHALLENGES = ['picture', 'perfect', 'speed', 'taps'];

export function challengeType(n) {
  if (n < 5 || n % 5 !== 0) return null;
  return CHALLENGES[(n / 5 - 1) % CHALLENGES.length];
}

// ---------- public API ----------

const PALETTES = [
  ['#7cc6fe', '#5aa9e6', '#a0d8ff'],
  ['#ffb4a2', '#e5989b', '#ffcdb2'],
  ['#b5e48c', '#99d98c', '#d9ed92'],
  ['#cdb4db', '#bde0fe', '#ffc8dd'],
  ['#ffd166', '#f4a261', '#ffe5a0'],
  ['#80ed99', '#57cc99', '#c7f9cc'],
  ['#a2d2ff', '#cdb4db', '#ffafcc'],
  ['#f7a072', '#eddea4', '#9bc1bc'],
];

export function getLevel(n) {
  const rng = mulberry32(n * 7919 + 12345);
  const palette = PALETTES[(n - 1) % PALETTES.length];

  if (n <= TUTORIAL.length) {
    return { number: n, palette, cubes: TUTORIAL[n - 1].cells.map((c) => c.slice()) };
  }

  const challenge = challengeType(n);
  if (challenge === 'picture') {
    const index = (n / 5 - 1) / CHALLENGES.length;
    const picture = PICTURES[index % PICTURES.length];
    const depth = n < 25 ? 1 : 2; // flat pictures while the game is still easy
    return {
      number: n, palette, challenge, picture: picture.name, front: true,
      cubes: assignDirections(pictureCells(picture, depth), rng, Math.min(0.8, 0.35 + n * 0.02)),
    };
  }

  // Size grows slowly with level: about 2 -> 7 cubes per side. Timed, tap
  // limited and no-bump challenges are capped at medium size so they're fair.
  const s = Math.min(6, 2 + Math.floor(n / 10));
  const dim = () => {
    const d = Math.max(2, Math.min(7, s + randInt(rng, -1, 1)));
    return challenge ? Math.max(3, Math.min(5, d)) : d;
  };
  let X = dim(), Y = dim(), Z = dim();

  const shapes = [box, box];
  if (n >= 8) shapes.push(pyramid, stairs);
  if (n >= 12) shapes.push(ball, holey(rng));
  if (n >= 16) shapes.push(plus, donut, tower);
  if (n >= 25) shapes.push(frame);

  let cells = [];
  for (let tries = 0; tries < 10 && cells.length < 6; tries++) {
    const shape = shapes[Math.floor(rng() * shapes.length)];
    if (shape === pyramid) Y = Math.ceil(Math.min(X, Z) / 2);
    if (shape === ball || shape === plus || shape === frame) { X = Math.max(X, 3); Y = Math.max(Y, 3); Z = Math.max(Z, 3); }
    cells = shape(X, Y, Z);
  }
  if (cells.length < 4) cells = box(2, 2, 2);

  const tangle = Math.min(1, 0.35 + n * 0.02);
  const level = { number: n, palette, cubes: assignDirections(cells, rng, tangle) };
  if (challenge) level.challenge = challenge;
  const count = level.cubes.length;
  // Seconds to beat: time to spot and tap each cube, plus a little slack.
  if (challenge === 'speed') level.targetSeconds = Math.round((10 + count * 1.6) / 5) * 5;
  // Taps allowed: one per cube plus a few spare for bumps.
  if (challenge === 'taps') level.tapLimit = count + Math.max(2, Math.round(count * 0.08));
  return level;
}

// Returns the distance (in cells) to the first cube in the way, or 0 if the
// path is clear. `occupied` is a Map/Set keyed by key(x, y, z).
export function blockerDistance(occupied, cube, bounds) {
  const d = DIRS[cube[3]];
  let x = cube[0], y = cube[1], z = cube[2];
  for (let step = 1; ; step++) {
    x += d[0]; y += d[1]; z += d[2];
    if (x < bounds.min[0] || x > bounds.max[0] || y < bounds.min[1] || y > bounds.max[1] ||
      z < bounds.min[2] || z > bounds.max[2]) return 0;
    if (occupied.has(key(x, y, z))) return step;
  }
}

export function boundsOf(cubes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const c of cubes) for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i], c[i]);
    max[i] = Math.max(max[i], c[i]);
  }
  return { min, max };
}
