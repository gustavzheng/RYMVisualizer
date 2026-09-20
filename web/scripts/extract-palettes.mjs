import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseIndex = process.argv.indexOf('--database');
const dataPath = databaseIndex < 0 ? path.join(root, 'public', 'data', 'albums.json') : path.resolve(process.argv[databaseIndex+1]);
const SAMPLE_SIZE = 128;
const MAX_PALETTE_SIZE = 12;
const MIN_WEIGHT = 0.001;
// About three perceptual just-noticeable differences: collapse shading variants
// without treating a saturation/chroma change as the same color.
const MERGE_DISTANCE = 0.025;
const MERGE_CHROMA_DISTANCE = 0.06;

function srgbToLinear(value) {
  value /= 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function rgbToOklab(r, g, b) {
  r = srgbToLinear(r); g = srgbToLinear(g); b = srgbToLinear(b);
  const l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b;
  const m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b;
  const s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b;
  const l3 = Math.cbrt(l), m3 = Math.cbrt(m), s3 = Math.cbrt(s);
  return [
    0.2104542553*l3 + 0.793617785*m3 - 0.0040720468*s3,
    1.9779984951*l3 - 2.428592205*m3 + 0.4505937099*s3,
    0.0259040371*l3 + 0.7827717662*m3 - 0.808675766*s3,
  ];
}

function distance2(a, b) {
  const dl = a[0]-b[0], da = a[1]-b[1], db = a[2]-b[2];
  return dl*dl + da*da + db*db;
}

function chroma(lab) {
  return Math.hypot(lab[1], lab[2]);
}

function hueAngleDifference(a, b) {
  const angleA = Math.atan2(a[2], a[1]);
  const angleB = Math.atan2(b[2], b[1]);
  const difference = Math.abs(angleA-angleB);
  return Math.min(difference, Math.PI*2-difference);
}

function shouldMerge(a, b) {
  const distance = Math.sqrt(distance2(a, b));
  const chromaA = chroma(a), chromaB = chroma(b);
  const chromaDifference = Math.abs(chromaA-chromaB);
  const lightnessDifference = Math.abs(a[0]-b[0]);

  // Hue is unstable and visually unimportant near black or the neutral axis.
  const darkerLightness = Math.max(a[0], b[0]);
  const invisibleHueChroma = 0.015 + Math.max(0, 0.35-darkerLightness)*0.15;
  const hueIsImperceptible = chromaA < invisibleHueChroma && chromaB < invisibleHueChroma;
  if (hueIsImperceptible && distance < 0.16 && lightnessDifference < 0.18) return true;

  // Collapse lighting/shading variants within one perceptual color family.
  const sameColorFamily = chromaA >= 0.025 && chromaB >= 0.025 &&
    hueAngleDifference(a, b) < Math.PI/9 && chromaDifference < MERGE_CHROMA_DISTANCE;
  if (sameColorFamily && lightnessDifference < 0.22) return true;

  return distance < MERGE_DISTANCE && chromaDifference < MERGE_CHROMA_DISTANCE;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g-b)/d) % 6;
    else if (max === g) h = (b-r)/d + 2;
    else h = (r-g)/d + 4;
    h = (h*60 + 360) % 360;
  }
  const l = (max+min)/2;
  const s = d ? d/(1-Math.abs(2*l-1)) : 0;
  return {h: Math.round(h), s: Math.round(s*100), l: Math.round(l*100)};
}

function colorRecord(cluster, total) {
  const rgb = cluster.rgb.map(value => Math.max(0, Math.min(255, Math.round(value))));
  const hex = `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`;
  return {hex, weight: Math.round(cluster.count/total*1000)/1000, ...rgbToHsl(...rgb)};
}

function clusterPixels(pixels) {
  const bins = new Map();
  for (const pixel of pixels) {
    // Fixed perceptual cells do not drift toward large background regions.
    const key = `${Math.floor(pixel.lab[0]/0.08)}:${Math.floor(pixel.lab[1]/0.04)}:${Math.floor(pixel.lab[2]/0.04)}`;
    const cluster = bins.get(key) ?? {lab:[0,0,0], rgb:[0,0,0], count:0};
    cluster.count++;
    for (let i=0; i<3; i++) { cluster.lab[i] += pixel.lab[i]; cluster.rgb[i] += pixel.rgb[i]; }
    bins.set(key, cluster);
  }
  const clusters = [...bins.values()];
  clusters.forEach(cluster => {
    cluster.lab = cluster.lab.map(value => value/cluster.count);
    cluster.rgb = cluster.rgb.map(value => value/cluster.count);
  });

  // Merge only genuinely near-identical perceptual colors. Chroma differences remain separate.
  clusters.sort((a,b) => b.count-a.count);
  const merged = [];
  for (const cluster of clusters) {
    const target = merged.find(item => shouldMerge(item.lab, cluster.lab));
    if (!target) { merged.push({...cluster, rgb: cluster.rgb.slice(), lab: cluster.lab.slice()}); continue; }
    const count = target.count + cluster.count;
    target.rgb = target.rgb.map((value,i) => (value*target.count + cluster.rgb[i]*cluster.count)/count);
    target.lab = target.lab.map((value,i) => (value*target.count + cluster.lab[i]*cluster.count)/count);
    target.count = count;
  }
  return merged.sort((a,b) => b.count-a.count);
}

function selectDistinctClusters(clusters, total) {
  const eligible = clusters.filter(cluster => cluster.count/total >= MIN_WEIGHT);
  const fragments = clusters.filter(cluster => cluster.count/total < MIN_WEIGHT);
  for (const cluster of fragments) {
    const target = eligible.reduce((best, item) =>
      distance2(cluster.lab, item.lab) < distance2(cluster.lab, best.lab) ? item : best
    );
    target.count += cluster.count;
  }
  if (eligible.length <= MAX_PALETTE_SIZE) return eligible;

  const selected = [eligible[0]];
  const remaining = eligible.slice(1);
  while (selected.length < MAX_PALETTE_SIZE && remaining.length) {
    let bestIndex = 0, bestScore = -1;
    remaining.forEach((cluster, index) => {
      const separation = Math.sqrt(Math.min(...selected.map(item => distance2(cluster.lab, item.lab))));
      // Area matters, but sublinearly: a small distinct color can outrank another
      // shading variant of a large background.
      const score = separation * (cluster.count/total) ** 0.25;
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  // Quantization weights cover every eligible cluster, while representatives stay vivid.
  for (const cluster of remaining) {
    const target = selected.reduce((best, item) =>
      distance2(cluster.lab, item.lab) < distance2(cluster.lab, best.lab) ? item : best
    );
    target.count += cluster.count;
  }
  return selected.sort((a,b) => b.count-a.count);
}

function chooseAccent(palette) {
  const candidates = palette.filter(color => color.l >= 12 && color.l <= 96 && color.weight >= MIN_WEIGHT);
  return candidates.reduce((best, color) => {
    const score = (color.s/100) * Math.sqrt(color.weight) * (1-Math.abs(color.l-50)/90);
    return !best || score > best.score ? {color, score} : best;
  }, null)?.color ?? palette[0];
}

function hueDiversity(palette, clusters) {
  const hues = palette
    .map((color, index) => ({color, lab: clusters[index].lab, chroma: chroma(clusters[index].lab)}))
    .filter(({color, lab, chroma: value}) => value >= 0.018 && lab[0] >= 0.15 && lab[0] <= 0.98 && color.weight >= 0.007)
    .sort((a,b) => b.chroma-a.chroma)
    .map(({lab}) => (Math.atan2(lab[2], lab[1])*180/Math.PI+360)%360);
  const groups = [];
  for (const hue of hues) {
    if (!groups.some(existing => Math.min(Math.abs(existing-hue), 360-Math.abs(existing-hue)) < 30)) groups.push(hue);
  }
  return groups.length;
}

async function extract(cover) {
  const source = path.join(root, 'public', cover.replace(/^\//, ''));
  const {data, info} = await sharp(source).resize(SAMPLE_SIZE, SAMPLE_SIZE, {fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const pixels = [];
  for (let i=0; i<data.length; i+=info.channels) {
    const rgb = [data[i], data[i+1], data[i+2]];
    pixels.push({rgb, lab: rgbToOklab(...rgb)});
  }
  const clusters = clusterPixels(pixels);
  const kept = selectDistinctClusters(clusters, pixels.length);
  kept.forEach(cluster => { cluster.count = 0; });
  for (const pixel of pixels) {
    const target = kept.reduce((best, cluster) =>
      distance2(pixel.lab, cluster.lab) < distance2(pixel.lab, best.lab) ? cluster : best
    );
    target.count++;
  }
  kept.sort((a,b) => b.count-a.count);
  const palette = kept.map(cluster => colorRecord(cluster, pixels.length));
  // Keep displayed weights normalized after tiny noise clusters are removed.
  const weightTotal = palette.reduce((sum, color) => sum+color.weight, 0);
  palette.forEach(color => { color.weight = Math.round(color.weight/weightTotal*1000)/1000; });
  const accent = chooseAccent(palette);
  return {dominant: palette[0], accent, palette, chromaticHue: accent.h, hueDiversity: hueDiversity(palette, kept)};
}

async function visualMetrics(cover) {
  const source = path.join(root, 'public', cover.replace(/^\//, ''));
  const {data, info} = await sharp(source).resize(SAMPLE_SIZE, SAMPLE_SIZE, {fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const count = info.width * info.height;
  const light = new Float64Array(count);
  let sum = 0, sum2 = 0, saturation = 0, warmth = 0, dark = 0, bright = 0;
  const bins = new Uint32Array(32);
  for (let i = 0; i < count; i++) {
    const r = data[i * info.channels], g = data[i * info.channels + 1], b = data[i * info.channels + 2];
    const value = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
    light[i] = value;
    sum += value; sum2 += value * value;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    saturation += max ? (max-min)/max : 0;
    warmth += (r-b+255)/510;
    dark += value < .2 ? 1 : 0;
    bright += value > .8 ? 1 : 0;
    bins[Math.min(31, Math.floor(value * 32))]++;
  }
  let edges = 0, differences = 0, pairs = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = y * info.width + x;
    differences += Math.abs(light[i] - light[y * info.width + info.width - 1 - x]);
    if (x + 1 < info.width) { edges += Math.abs(light[i] - light[i+1]); pairs++; }
    if (y + 1 < info.height) { edges += Math.abs(light[i] - light[i+info.width]); pairs++; }
  }
  const entropy = -Array.from(bins).reduce((total, n) => n ? total + (n/count)*Math.log2(n/count) : total, 0);
  const round = n => Math.round(Math.max(0, Math.min(100, n))*10)/10;
  return {
    brightness: round(sum/count*100),
    contrast: round(Math.sqrt(Math.max(0, sum2/count-(sum/count)**2))*300),
    saturation: round(saturation/count*100),
    warmth: round(warmth/count*100),
    colorfulness: round(saturation/count*100),
    entropy: round(entropy/5*100),
    detail: round(edges/pairs*100),
    symmetry: round((1-differences/count)*100),
    darkRatio: round(dark/count*100),
    lightRatio: round(bright/count*100),
  };
}

const albums = JSON.parse(await fs.readFile(dataPath, 'utf8'));
const idsIndex = process.argv.indexOf('--ids');
const selectedIds = idsIndex < 0 ? null : new Set(process.argv.slice(idsIndex+1).filter(value => value !== '--database' && value !== process.argv[databaseIndex+1]));
for (const [index, album] of albums.entries()) {
  if (selectedIds && !selectedIds.has(String(album.id))) continue;
  if (!album.cover) continue;
  album.visual ??= {};
  Object.assign(album.visual, await extract(album.cover));
  if (selectedIds) Object.assign(album.visual, await visualMetrics(album.cover));
  if (!selectedIds && (index+1)%50 === 0) process.stdout.write(`Processed ${index+1}/${albums.length}\n`);
}
await fs.writeFile(dataPath, `${JSON.stringify(albums)}\n`);
process.stdout.write(`Updated ${albums.length} palettes in ${path.relative(root, dataPath)}\n`);
