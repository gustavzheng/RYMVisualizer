export type ForcePoint = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  fixed?: boolean;
};

export type ForceEdge = {source: string; target: string; primary: boolean};

export type ForceTree = {
  children: Map<string, string[]>;
  depth: Map<string, number>;
  edges: ForceEdge[];
};

export type DragBoost = {factors: Set<string>; releasedAt: number | null};

export const WORLD_CENTER = {x: 6000, y: 4500};

export function seedPositions(root: string, tree: ForceTree, hash: (value: string, salt?: number) => number, spacing = 1) {
  const positions = new Map<string, ForcePoint>([
    [root, {...WORLD_CENTER, z: 0, vx: 0, vy: 0}],
  ]);
  const place = (id: string) => {
    const children = tree.children.get(id) || [];
    const parent = positions.get(id)!;
    const parentDepth = tree.depth.get(id) || 0;
    const radius = (parentDepth === 0 ? 520 : Math.max(280, 210 + children.length * 30)) * spacing;
    const phase = hash(id, 5) * Math.PI * 2 - Math.PI / 2;
    children.forEach((child, index) => {
      const angle = phase + index / Math.max(1, children.length) * Math.PI * 2;
      positions.set(child, {
        x: parent.x + Math.cos(angle) * radius,
        y: parent.y + Math.sin(angle) * radius,
        z: (hash(child, 9) - .5) * (parentDepth + 1) * 175,
        vx: 0,
        vy: 0,
      });
      place(child);
    });
  };
  place(root);
  return positions;
}

export function makeBranchPaths(root: string, tree: ForceTree) {
  const paths = new Map<string, string[]>([[root, []]]);
  const assign = (id: string, path: string[]) => {
    const next = [...path, id];
    paths.set(id, next);
    (tree.children.get(id) || []).forEach(child => assign(child, next));
  };
  (tree.children.get(root) || []).forEach(id => assign(id, []));
  return paths;
}

export function descendantIds(root: string, tree: ForceTree) {
  const result: string[] = [];
  const queue = [root];
  while (queue.length) {
    const parent = queue.shift()!;
    for (const child of tree.children.get(parent) || []) {
      result.push(child);
      queue.push(child);
    }
  }
  return result;
}

function branchRepulsion(root: string, paths: Map<string, string[]>, idA: string, idB: string, spacing: number) {
  const scale = spacing ** 2;
  if (idA === root || idB === root) return {range2: 90000 * scale, multiplier: 1};
  const pathA = paths.get(idA) || [];
  const pathB = paths.get(idB) || [];
  let sharedDepth = 0;
  while (sharedDepth < pathA.length && sharedDepth < pathB.length && pathA[sharedDepth] === pathB[sharedDepth]) sharedDepth++;
  if (sharedDepth === Math.min(pathA.length, pathB.length)) return {range2: 90000 * scale, multiplier: 1};
  if (sharedDepth === 0) return {range2: 250000 * scale, multiplier: 4};
  if (sharedDepth === 1) return {range2: 160000 * scale, multiplier: 2.6};
  return {range2: 115600 * scale, multiplier: 1.7};
}

export function simulationStep(args: {
  root: string;
  tree: ForceTree;
  positions: Map<string, ForcePoint>;
  paths: Map<string, string[]>;
  firstLevel: Set<string>;
  anchor: {x: number; y: number};
  timeScale: number;
  boost: DragBoost | null;
  boostAmount: number;
  graphSpacing: number;
  collisionSpacing: number;
  hash: (value: string, salt?: number) => number;
}) {
  const {root, tree, positions, paths, firstLevel, anchor, timeScale, boost, boostAmount, graphSpacing, collisionSpacing, hash} = args;
  const points = [...positions.entries()];

  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const [idA, a] = points[i], [idB, b] = points[j];
    const dx = b.x - a.x, dy = b.y - a.y;
    const distance2 = Math.max(900, dx * dx + dy * dy);
    const repulsion = branchRepulsion(root, paths, idA, idB, graphSpacing);
    if (distance2 > repulsion.range2) continue;
    const distance = Math.sqrt(distance2);
    const force = 1500 * repulsion.multiplier / distance2 * timeScale;
    if (!a.fixed) { a.vx -= dx / distance * force; a.vy -= dy / distance * force; }
    if (!b.fixed) { b.vx += dx / distance * force; b.vy += dy / distance * force; }
  }

  for (const edge of tree.edges) {
    const a = positions.get(edge.source)!, b = positions.get(edge.target)!;
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy));
    const childDepth = tree.depth.get(edge.target) || 1;
    const desired = (edge.primary ? 520 : childDepth >= 3 ? 320 : 360) * graphSpacing;
    const base = edge.primary ? .004 : childDepth >= 3 ? .0042 : .0032;
    const edgeBoost = boost?.factors.has(`${edge.source}:${edge.target}`) ? 8 : 1;
    const force = (distance - desired) * base * (1 + (edgeBoost - 1) * boostAmount) * timeScale;
    if (!a.fixed) { a.vx += dx / distance * force; a.vy += dy / distance * force; }
    if (!b.fixed) { b.vx -= dx / distance * force; b.vy -= dy / distance * force; }
  }

  let movement = 0;
  const damping = Math.pow(.82, timeScale);
  for (const [id, point] of points) {
    if (point.fixed) continue;
    const gravity = (id === root ? .035 : .00035) * timeScale;
    point.vx += (anchor.x - point.x) * gravity;
    point.vy += (anchor.y - point.y) * gravity;
    point.vx *= damping;
    point.vy *= damping;
    point.x += point.vx * timeScale;
    point.y += point.vy * timeScale;
    movement += (Math.abs(point.vx) + Math.abs(point.vy)) * timeScale;
  }

  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const [idA, a] = points[i], [idB, b] = points[j];
    const radiusA = (idA === root ? 138 : firstLevel.has(idA) ? 100 : 86) * collisionSpacing;
    const radiusB = (idB === root ? 138 : firstLevel.has(idB) ? 100 : 86) * collisionSpacing;
    const minimum = radiusA + radiusB + 10;
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || .01;
    if (distance >= minimum) continue;
    const overlap = (minimum - distance) * (pass === 0 ? .62 : .36) * timeScale;
    const nx = distance > .02 ? dx / distance : (hash(idA + idB, pass) - .5) * 2;
    const ny = distance > .02 ? dy / distance : (hash(idB + idA, pass + 7) - .5) * 2;
    const total = a.fixed || b.fixed ? 1 : 2;
    if (!a.fixed) { a.x -= nx * overlap / total; a.y -= ny * overlap / total; a.vx -= nx * .08; a.vy -= ny * .08; }
    if (!b.fixed) { b.x += nx * overlap / total; b.y += ny * overlap / total; b.vx += nx * .08; b.vy += ny * .08; }
  }
  return movement;
}
