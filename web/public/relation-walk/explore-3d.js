import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
const $ = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const compactRenderer = matchMedia("(max-width: 800px), (pointer: coarse)").matches;
const simulationTickLimit = compactRenderer ? 720 : 1100;
const state = { albums: [], byId: /* @__PURE__ */ new Map(), focusId: null, selectedId: null, neighbors: [], trail: [], imageIndex: /* @__PURE__ */ new Map(), neighborOffset: 0, positions: /* @__PURE__ */ new Map(), depthById: /* @__PURE__ */ new Map(), parentById: /* @__PURE__ */ new Map(), graphEdges: [], hoverHighlightIds: null, liveCropByImage: /* @__PURE__ */ new Map(), simulationEnergy: 0, simulationFrame: null, cameraFollowCenter: false };
const view = { scene: null, camera: null, renderer: null, controls: null, nodeGroup: null, outlineGroup: null, edgeGroup: null, sprites: /* @__PURE__ */ new Map(), outlines: /* @__PURE__ */ new Map(), outlineTexture: null, raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2(), hoverId: null, pendingNodeDrag: null, nodeDrag: null, sceneDrag: null, suppressClickUntil: 0, resizeObserver: null };
function imagesOf(album) {
  const images = Array.isArray(album.images) && album.images.length ? album.images : [{ image: album.image, crop: album.crop, hasTransparentPixels: album.hasTransparentPixels, detailBackground: album.detailBackground }];
  return images.filter((item) => item && typeof item.image === "string");
}
function safeStorageObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
const savedAlbumCrops = safeStorageObject("visual-atlas-crops"), savedImageCrops = safeStorageObject("visual-atlas-image-crops");
function effectiveCrop(album, record) {
  const live = state.liveCropByImage.get(record.image);
  if (live) return live;
  const saved = record.image === album.image ? savedAlbumCrops[album.id] : savedImageCrops[record.image];
  return saved && typeof saved === "object" ? saved : record.crop;
}
function cropCoordinates(album, record) {
  const crop = effectiveCrop(album, record), offset = crop?.offset || {};
  return { x: clamp(50 + (Number(offset.x) || 0), 0, 100), y: crop?.align === "top" ? clamp(Number(offset.y) || 0, 0, 100) : clamp(50 + (Number(offset.y) || 0), 0, 100) };
}
function cropPosition(album, record) {
  const crop = cropCoordinates(album, record);
  return `${crop.x}% ${crop.y}%`;
}
function primary(album) {
  return imagesOf(album).find((item) => item.image === album.image) || imagesOf(album)[0];
}
function comparableDistance(a, b) {
  return window.RelationSimilarity?.distance(a, b) ?? Infinity;
}
function rankedNeighbors(album) {
  return state.albums.filter((candidate) => candidate.id !== album.id).map((candidate) => ({ album: candidate, distance: comparableDistance(album, candidate) })).sort((a, b) => a.distance - b.distance || a.album.id - b.album.id);
}
function relationReason(a, b) {
  const labels = { brightness: "\u5C01\u9762\u4EAE\u5EA6", contrast: "\u5C01\u9762\u5BF9\u6BD4\u5EA6", saturation: "\u5C01\u9762\u9971\u548C\u5EA6", detail: "\u7EC6\u8282\u5BC6\u5EA6", entropy: "\u89C6\u89C9\u590D\u6742\u5EA6", warmth: "\u8272\u6E29", colorfulness: "\u8272\u5F69\u4E30\u5BCC\u5EA6", symmetry: "\u6784\u56FE\u5BF9\u79F0\u5EA6", darkRatio: "\u6697\u8272\u5360\u6BD4", lightRatio: "\u4EAE\u8272\u5360\u6BD4", hue: "\u4E3B\u8272\u76F8", year: "\u53D1\u884C\u5E74\u4EFD", userRating: "\u4E2A\u4EBA\u8BC4\u5206", communityRating: "RYM \u8BC4\u5206" };
  const close = window.RelationSimilarity?.closest(a, b, 2) || [];
  return close.length ? close.map((item) => item.label || labels[item.key] || item.key).join("\u3001") : "\u540C\u5C5E\u5F53\u524D\u53EF\u63A2\u7D22\u4E13\u8F91\u5E93";
}
function balancedSeedGroups(members, seeds) {
  const groups = seeds.map((seed) => ({ seed, members: [seed] })), baseSize = Math.floor(members.length / groups.length), remainder = members.length % groups.length, capacities = groups.map((_, index) => baseSize + (index < remainder ? 1 : 0)), pending = members.filter((album) => !seeds.includes(album));
  while (pending.length) {
    const choice = pending.map((album, pendingIndex) => {
      const options = groups.map((group, index) => ({ index, distance: comparableDistance(album, group.seed) })).filter((option) => groups[option.index].members.length < capacities[option.index]).sort((a, b) => a.distance - b.distance || a.index - b.index);
      return { album, pendingIndex, option: options[0], regret: (options[1]?.distance ?? Infinity) - options[0].distance };
    }).sort((a, b) => b.regret - a.regret || a.option.distance - b.option.distance || a.album.id - b.album.id)[0];
    groups[choice.option.index].members.push(choice.album);
    pending.splice(choice.pendingIndex, 1);
  }
  return groups;
}
function buildSimilarityTree(root) {
  const depth = /* @__PURE__ */ new Map([[root.id, 0]]), children = new Map(state.albums.map((album) => [album.id, []])), edges = [];
  const split = (parent, memberIds, level) => {
    if (!memberIds.length) return;
    const branchCount = memberIds.length > 48 ? 7 : memberIds.length > 20 ? 6 : memberIds.length > 9 ? 5 : memberIds.length > 4 ? 3 : memberIds.length, members = memberIds.map((id) => state.byId.get(id)), ranked = [...members].sort((a, b) => comparableDistance(parent, a) - comparableDistance(parent, b) || a.id - b.id), rootOffset = parent.id === root.id ? state.neighborOffset % Math.min(12, ranked.length) : 0, seeds = [ranked[rootOffset]];
    while (seeds.length < branchCount) {
      const candidate = members.filter((album) => !seeds.includes(album)).map((album) => ({ album, separation: Math.min(...seeds.map((seed) => comparableDistance(album, seed))) })).sort((a, b) => b.separation - a.separation || a.album.id - b.album.id)[0];
      if (!candidate) break;
      seeds.push(candidate.album);
    }
    balancedSeedGroups(members, seeds).forEach((group) => {
      const representative = [...group.members].sort((a, b) => comparableDistance(parent, a) - comparableDistance(parent, b) || a.id - b.id)[0];
      children.get(parent.id).push(representative.id);
      depth.set(representative.id, level);
      edges.push({ source: parent.id, target: representative.id, primary: parent.id === root.id });
      split(representative, group.members.filter((album) => album.id !== representative.id).map((album) => album.id), level + 1);
    });
  };
  split(root, state.albums.filter((album) => album.id !== root.id).map((album) => album.id), 1);
  return { children, depth, edges };
}
function seedPositions(rootId, children) {
  const positions = /* @__PURE__ */ new Map([[rootId, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fixed: false }]]), place = (id) => {
    const branch = children.get(id) || [], parent = positions.get(id), level = state.depthById.get(id) || 0, radius = level === 0 ? 2.1 : Math.max(0.95, 0.82 + branch.length * 0.075), phase = id * 2.399963;
    branch.forEach((child, index) => {
      const y = 1 - 2 * (index + 0.5) / branch.length, ring = Math.sqrt(Math.max(0, 1 - y * y)), angle = phase + index * 2.399963;
      positions.set(child, { x: parent.x + Math.cos(angle) * ring * radius, y: parent.y + y * radius, z: parent.z + Math.sin(angle) * ring * radius, vx: 0, vy: 0, vz: 0, fixed: false });
      place(child);
    });
  };
  place(rootId);
  return positions;
}
const portraitLoadQueue = [];
let activePortraitLoads = 0, portraitPumpScheduled = false;
const maxPortraitLoads = compactRenderer ? 2 : 6;
function pumpPortraitLoads() {
  portraitPumpScheduled = false;
  portraitLoadQueue.sort((a, b) => b.priority - a.priority);
  while (activePortraitLoads < maxPortraitLoads && portraitLoadQueue.length) {
    const task = portraitLoadQueue.shift();
    if (task.texture.userData.disposed) continue;
    activePortraitLoads++;
    task.start(() => {
      activePortraitLoads--;
      pumpPortraitLoads();
    });
  }
}
function queuePortraitLoad(task) {
  portraitLoadQueue.push(task);
  if (portraitPumpScheduled) return;
  portraitPumpScheduled = true;
  queueMicrotask(pumpPortraitLoads);
}
function createPortraitTexture(album, priority = 0) {
  const record = primary(album), canvas = document.createElement("canvas"), context = canvas.getContext("2d"), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, view.renderer.capabilities.getMaxAnisotropy());
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const image = new Image();
  const redraw = (level = texture.userData.level || 256) => {
    const resolved = level === "original" ? Math.min(4096, Math.max(1024, image.naturalHeight || 1024)) : level, width = resolved, height = resolved, sizeChanged = canvas.width !== width || canvas.height !== height;
    if (sizeChanged) {
      canvas.width = width;
      canvas.height = height;
    }
    context.clearRect(0, 0, width, height);
    context.save();
    context.fillStyle = record.hasTransparentPixels ? record.detailBackground || "#181815" : "#2d2d29";
    context.fillRect(0, 0, width, height);
    if (image.naturalWidth) {
      const target = width / height, source = image.naturalWidth / image.naturalHeight, crop = cropCoordinates(album, record);
      let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;
      if (source > target) {
        sw = image.naturalHeight * target;
        sx = (image.naturalWidth - sw) * crop.x / 100;
      } else {
        sh = image.naturalWidth / target;
        sy = (image.naturalHeight - sh) * crop.y / 100;
      }
      context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
    }
    context.restore();
    texture.userData.level = level;
    if (sizeChanged && texture.userData.uploaded) texture.dispose();
    texture.userData.uploaded = true;
    texture.needsUpdate = true;
  };
  texture.userData = { canvas, context, image, albumId: album.id, imagePath: record.image, level: 256, emphasis: 0, loadState: "queued", disposed: false, uploaded: false, redraw };
  const enqueue = (attempt) => queuePortraitLoad({ texture, priority: priority - attempt, start: (done) => {
    let settled = false;
    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      image.onload = image.onerror = null;
      if (texture.userData.disposed) {
        done();
        return;
      }
      if (loaded) {
        texture.userData.loadState = "loaded";
        redraw(texture.userData.level);
      } else if (attempt < 2) {
        texture.userData.loadState = "retrying";
        setTimeout(() => enqueue(attempt + 1), 180 * 2 ** attempt);
      } else {
        texture.userData.loadState = "failed";
        console.warn(`\u4E09\u7EF4\u5C01\u9762\u7EB9\u7406\u8F7D\u5165\u5931\u8D25\uFF1A${record.image}`);
      }
      done();
    };
    const timeout = setTimeout(() => {
      image.src = "";
      finish(false);
    }, 12e3);
    texture.userData.loadState = "loading";
    image.decoding = "async";
    image.fetchPriority = priority > 0 ? "high" : "auto";
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = attempt ? `${record.image}?textureRetry=${attempt}` : record.image;
  } });
  enqueue(0);
  redraw();
  return texture;
}
function createOutlineTexture() {
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d"), width = 256, height = 256;
  canvas.width = width;
  canvas.height = height;
  context.strokeStyle = "#d8ff3e";
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(3, 3, width - 6, height - 6, 18);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
function disposeEdges() {
  view.edgeGroup?.traverse((object) => {
    object.material?.dispose();
    object.geometry?.dispose();
  });
  view.edgeGroup?.removeFromParent();
}
function rebuildScene() {
  disposeEdges();
  if (!view.nodeGroup) {
    view.nodeGroup = new THREE.Group();
    view.outlineGroup = new THREE.Group();
    view.outlineTexture = createOutlineTexture();
    view.scene.add(view.nodeGroup, view.outlineGroup);
  }
  view.edgeGroup = new THREE.Group();
  view.scene.add(view.edgeGroup);
  const firstLevel = new Set(state.neighbors.map((item) => item.album.id));
  state.albums.forEach((album) => {
    const role = album.id === state.focusId ? "center" : firstLevel.has(album.id) ? "neighbor" : "secondary", scale = role === "center" ? 3.5 : role === "neighbor" ? 2.35 : 1.55;
    let sprite = view.sprites.get(album.id), outline = view.outlines.get(album.id);
    if (!sprite) {
      const priority = role === "center" ? 2 : role === "neighbor" ? 1 : 0, material = new THREE.SpriteMaterial({ map: createPortraitTexture(album, priority), color: 16777215, transparent: true, alphaTest: 0.01, depthTest: true, depthWrite: true });
      sprite = new THREE.Sprite(material);
      view.nodeGroup.add(sprite);
      view.sprites.set(album.id, sprite);
      outline = new THREE.Sprite(new THREE.SpriteMaterial({ map: view.outlineTexture, transparent: true, depthTest: true, depthWrite: false }));
      outline.visible = false;
      outline.renderOrder = 6;
      view.outlineGroup.add(outline);
      view.outlines.set(album.id, outline);
    }
    sprite.scale.set(scale, scale, 1);
    sprite.userData = { id: album.id, role };
  });
  state.graphEdges.forEach((edge) => {
    const geometry = new THREE.BufferGeometry(), positions = new Float32Array(6);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: edge.primary ? 14221118 : 16777215, transparent: true, opacity: edge.primary ? 0.68 : 0.13 });
    const line = new THREE.Line(geometry, material);
    line.userData = edge;
    view.edgeGroup.add(line);
  });
  paintGraph();
}
function focusNeighborhood() {
  const ids = new Set([state.focusId]);
  state.graphEdges.forEach((edge) => {
    if (edge.source === state.focusId) ids.add(edge.target);
  });
  return ids;
}
function paintGraph() {
  const highlighted = state.hoverHighlightIds || (state.selectedId === state.focusId ? focusNeighborhood() : subtreeIds(state.selectedId));
  view.sprites.forEach((sprite, id) => {
    const point = state.positions.get(id), outline = view.outlines.get(id), active = highlighted.has(id);
    sprite.position.set(point.x, point.y, point.z);
    sprite.material.opacity = active ? 1 : compactRenderer ? 0.68 : 0.52;
    sprite.material.color.setHex(active ? 16777215 : 13421772);
    sprite.material.fog = !active;
    sprite.material.needsUpdate = true;
    sprite.renderOrder = active ? 4 : 2;
    if (outline) {
      outline.position.copy(sprite.position);
      outline.scale.copy(sprite.scale).multiplyScalar(id === state.selectedId ? 1.045 : 1.035);
      outline.visible = false;
    }
  });
  view.edgeGroup.children.forEach((line) => {
    const source = state.positions.get(line.userData.source), target = state.positions.get(line.userData.target), array = line.geometry.attributes.position.array;
    array.set([source.x, source.y, source.z, target.x, target.y, target.z]);
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    const active = highlighted.has(line.userData.source) && highlighted.has(line.userData.target);
    line.material.color.setHex(active ? 14221118 : 16777215);
    line.material.opacity = active ? 0.9 : compactRenderer ? 0.15 : 0.075;
    line.material.fog = !active;
    line.material.needsUpdate = true;
  });
}
function subtreeIds(rootId) {
  const ids = /* @__PURE__ */ new Set([rootId]), queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    state.graphEdges.forEach((edge) => {
      if (edge.source === id && !ids.has(edge.target)) {
        ids.add(edge.target);
        queue.push(edge.target);
      }
    });
  }
  let ancestor = rootId;
  while (state.parentById.has(ancestor)) {
    ancestor = state.parentById.get(ancestor);
    ids.add(ancestor);
  }
  return ids;
}
function setTemporaryHighlight(ids) {
  state.hoverHighlightIds = ids;
  paintGraph();
}
function restoreSelectedHighlight() {
  state.hoverHighlightIds = null;
  paintGraph();
}
function bindFocusHighlightInteractions() {
  $("#focusTypes").querySelectorAll("[data-highlight-type]").forEach((element) => {
    element.onmouseenter = () => setTemporaryHighlight(new Set(state.albums.filter((album) => album[element.dataset.highlightKind] === element.dataset.highlightType).map((album) => album.id)));
    element.onmouseleave = restoreSelectedHighlight;
  });
  $("#relationPath").querySelectorAll("[data-relation-album]").forEach((element) => {
    element.onmouseenter = () => setTemporaryHighlight(subtreeIds(Number(element.dataset.relationAlbum)));
    element.onmouseleave = restoreSelectedHighlight;
  });
}
function refreshSpriteTexture(id, record = null) {
  const sprite = view.sprites.get(id);
  if (!sprite) return;
  const texture = sprite.material.map, album = state.byId.get(id);
  texture.userData.imagePath ??= primary(album).image;
  if (record && texture.userData.imagePath !== record.image) {
    const previous = texture, viewAlbum = { ...album, images: [record] }, next = createPortraitTexture(viewAlbum, 2);
    next.userData.imagePath = record.image;
    sprite.material.map = next;
    sprite.material.needsUpdate = true;
    previous.userData.disposed = true;
    previous.dispose();
    paintGraph();
    return;
  }
  texture.userData.previewUntil = performance.now() + 220;
  texture.userData.redraw?.(texture.userData.level === "original" ? 1024 : Math.min(1024, texture.userData.level));
}
function startSimulation(energy = 1, speed = 1) {
  cancelAnimationFrame(state.simulationFrame);
  state.simulationEnergy = Math.max(state.simulationEnergy, energy);
  let ticks = 0;
  const tick = () => {
    ticks++;
    const timeScale = speed < 1 ? speed + (1 - speed) * Math.min(1, ticks / 180) ** 2 : speed, points = [...state.positions.entries()];
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      const a = points[i][1], b = points[j][1], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d2 = Math.max(0.24, dx * dx + dy * dy + dz * dz), distance = Math.sqrt(d2), force = Math.min(0.018, 0.11 / d2) * timeScale;
      if (!a.fixed) {
        a.vx -= dx / distance * force;
        a.vy -= dy / distance * force;
        a.vz -= dz / distance * force;
      }
      if (!b.fixed) {
        b.vx += dx / distance * force;
        b.vy += dy / distance * force;
        b.vz += dz / distance * force;
      }
    }
    state.graphEdges.forEach((edge) => {
      const a = state.positions.get(edge.source), b = state.positions.get(edge.target), dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, distance = Math.max(0.01, Math.hypot(dx, dy, dz)), desired = edge.primary ? 2.1 : state.depthById.get(edge.target) >= 3 ? 0.85 : 1.15, force = (distance - desired) * 0.016 * timeScale;
      if (!a.fixed) {
        a.vx += dx / distance * force;
        a.vy += dy / distance * force;
        a.vz += dz / distance * force;
      }
      if (!b.fixed) {
        b.vx -= dx / distance * force;
        b.vy -= dy / distance * force;
        b.vz -= dz / distance * force;
      }
    });
    let movement = 0;
    points.forEach(([id, point]) => {
      if (point.fixed) return;
      const gravity = (id === state.focusId ? 0.028 : 2e-3) * timeScale;
      point.vx -= point.x * gravity;
      point.vy -= point.y * gravity;
      point.vz -= point.z * gravity;
      point.vx *= 0.82;
      point.vy *= 0.82;
      point.vz *= 0.82;
      point.x += point.vx;
      point.y += point.vy;
      point.z += point.vz;
      movement += Math.abs(point.vx) + Math.abs(point.vy) + Math.abs(point.vz);
    });
    paintGraph();
    state.simulationEnergy *= 0.995;
    if (view.nodeDrag || ticks < simulationTickLimit && (movement > 2e-3 || state.simulationEnergy > 8e-3)) state.simulationFrame = requestAnimationFrame(tick);
  };
  state.simulationFrame = requestAnimationFrame(tick);
}
function renderNetwork(reinitializeFan = false) {
  const focus = state.byId.get(state.focusId);
  if (!focus) return;
  const previousPositions = state.positions, tree = buildSimilarityTree(focus);
  state.depthById = tree.depth;
  state.graphEdges = tree.edges;
  state.parentById = new Map(tree.edges.map((edge) => [edge.target, edge.source]));
  const firstLevel = tree.children.get(focus.id) || [];
  state.neighbors = firstLevel.map((id) => ({ album: state.byId.get(id), distance: comparableDistance(focus, state.byId.get(id)) }));
  if (reinitializeFan) {
    const targets = seedPositions(focus.id, tree.children), root = targets.get(focus.id);
    state.positions = new Map([...targets].map(([id, point]) => [id, id === focus.id ? point : { ...point, x: root.x + (point.x - root.x) * 0.06, y: root.y + (point.y - root.y) * 0.06, z: root.z + (point.z - root.z) * 0.06 }]));
  } else if (previousPositions.size) {
    state.positions = new Map(state.albums.map((album) => {
      const point = previousPositions.get(album.id);
      return [album.id, { x: point.x, y: point.y, z: point.z, vx: 0, vy: 0, vz: 0, fixed: false }];
    }));
  } else state.positions = seedPositions(focus.id, tree.children);
  rebuildScene();
  state.cameraFollowCenter = previousPositions.size > 0;
  startSimulation(1, reinitializeFan ? 1 : previousPositions.size ? 0.08 : 1);
  if (!previousPositions.size) resetCamera();
}
function renderFocus() {
  const album = state.byId.get(state.selectedId), center = state.byId.get(state.focusId), images = imagesOf(album), index = clamp(state.imageIndex.get(album.id) || 0, 0, images.length - 1), image = images[index];
  state.imageIndex.set(album.id, index);
  $("#focusImage").src = image.image;
  $("#focusImage").alt = album.name;
  $("#focusImageButton").style.background = image.hasTransparentPixels ? image.detailBackground || "#181815" : "#181815";
  $("#imagePosition").textContent = `${index + 1} / ${images.length}`;
  $("#focusPosition").textContent = `\u4E13\u8F91 ${album.id} \xB7 ${album.id === center.id ? "\u5F53\u524D\u56FE\u4E2D\u5FC3" : "\u4E09\u7EF4\u5173\u8054\u8282\u70B9"}`;
  $("#focusName").textContent = album.name;
  window.renderAlbumPalette?.(album);
  $("#focusArtist").textContent = album.artist || "";
  $("#focusStats").innerHTML = `<div><dt>个人评分</dt><dd>${album.userRating ?? "—"} / 10</dd></div><div><dt>社区评分</dt><dd>${album.communityRating ?? "—"} / 5</dd></div><div><dt>年份</dt><dd>${album.year ?? "—"}</dd></div><div><dt>专辑时长</dt><dd>${album.durationSeconds ? `${Math.round(album.durationSeconds / 60)} 分钟` : "—"}</dd></div>`;
  $("#focusDescriptors").textContent = (album.descriptors || []).join(" · ");
  $("#focusTypes").innerHTML = (album.genres || []).map((genre) => `<span>${escapeHtml(genre)}</span>`).join("") || "<span>尚未分类</span>";
  renderRelationPath(album);
  $("#galleryLink").href = album.url || "/";
  $("#viewModeLink").href = `explore.html?album=${center.id}`;
  $("#makeCenterButton").hidden = album.id === center.id;
  $("#trail").innerHTML = state.trail.map((id) => {
    const item = state.byId.get(id), record = primary(item);
    return `<button class="${id === album.id ? "current" : ""}" data-trail-id="${id}" title="${escapeHtml(item.name)}"><img src="${record.image}" alt="${escapeHtml(item.name)}" style="object-position:${cropPosition(item, record)}"></button>`;
  }).join("");
  $("#trail").querySelectorAll("[data-trail-id]").forEach((button) => button.onclick = () => selectAlbum(Number(button.dataset.trailId), { record: false }));
  bindFocusHighlightInteractions();
}
function relationChain(id) {
  const chain = [id];
  while (chain[0] !== state.focusId && state.parentById.has(chain[0])) chain.unshift(state.parentById.get(chain[0]));
  return chain;
}
function renderRelationPath(album) {
  const container = $("#relationPath");
  if (album.id === state.focusId) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  const chain = relationChain(album.id);
  container.hidden = false;
  container.innerHTML = `<div class="relation-path-title">\u4ECE\u56FE\u4E2D\u5FC3\u5230\u5F53\u524D\u4E13\u8F91</div>${chain.map((id, index) => {
    const item = state.byId.get(id), previous = index ? state.byId.get(chain[index - 1]) : null;
    return `<div class="relation-step" data-relation-album="${id}"><i class="relation-dot"></i><span><b>${escapeHtml(item.name)}</b><small>${previous ? escapeHtml(relationReason(previous, item)) : "\u56FE\u4E2D\u5FC3"}</small></span></div>`;
  }).join("")}`;
}
function selectAlbum(id, { record = true } = {}) {
  if (!state.byId.has(id)) return;
  state.selectedId = id;
  if (record && state.trail.at(-1) !== id) {
    state.trail.push(id);
    if (state.trail.length > 18) state.trail.shift();
  }
  $(".focus-panel").classList.remove("panel-hidden");
  paintGraph();
  renderFocus();
}
function focusAlbum(id, { record = true } = {}) {
  if (!state.byId.has(id)) return;
  state.focusId = id;
  state.selectedId = id;
  state.neighborOffset = 0;
  if (record && state.trail.at(-1) !== id) {
    state.trail.push(id);
    if (state.trail.length > 18) state.trail.shift();
  }
  renderNetwork();
  renderFocus();
}
function stepImage(delta) {
  const album = state.byId.get(state.selectedId), images = imagesOf(album), current = state.imageIndex.get(album.id) || 0, next = (current + delta + images.length) % images.length;
  state.imageIndex.set(album.id, next);
  refreshSpriteTexture(album.id, images[next]);
  renderFocus();
}
function stepAlbum(delta) {
  const order = [state.focusId, ...state.graphEdges.map((edge) => edge.target)], index = Math.max(0, order.indexOf(state.selectedId)), next = order[(index + delta + order.length) % order.length];
  selectAlbum(next);
}
function surprise() {
  const focus = state.byId.get(state.focusId), ranked = rankedNeighbors(focus).filter((item) => Number.isFinite(item.distance)), pool = ranked.slice(Math.floor(ranked.length * 0.22), Math.max(1, Math.floor(ranked.length * 0.6))), choice = pool[Math.floor(Math.random() * pool.length)] || ranked.at(-1);
  if (choice) selectAlbum(choice.album.id);
}
function resetCamera() {
  const landscapePosition = [14, 11, 17];
  const position = innerWidth <= 800 && innerWidth <= innerHeight ? landscapePosition.map((value) => value * 1.8) : landscapePosition;
  view.camera.position.set(...position);
  view.controls.target.set(0, 0, 0);
  view.controls.update();
}
function updateTextureLod() {
  const viewportHeight = view.renderer.domElement.clientHeight, pixelRatio = Math.min(2, devicePixelRatio || 1), tangent = Math.tan(THREE.MathUtils.degToRad(view.camera.fov * 0.5));
  view.sprites.forEach((sprite) => {
    const distance = Math.max(0.1, view.camera.position.distanceTo(sprite.position)), pixels = sprite.scale.y * viewportHeight * pixelRatio / (2 * tangent * distance), wanted = pixels > 240 ? "original" : pixels > 120 ? 1024 : pixels > 48 ? 512 : 256, texture = sprite.material.map, level = texture.userData.previewUntil > performance.now() && wanted === "original" ? 1024 : wanted;
    if (texture.userData.level !== level) texture.userData.redraw(level);
  });
}
function hitAt(event) {
  const rect = view.renderer.domElement.getBoundingClientRect();
  view.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  view.raycaster.setFromCamera(view.pointer, view.camera);
  return view.raycaster.intersectObjects([...view.sprites.values()])[0]?.object || null;
}
function bindCanvasInteraction() {
  const canvas = view.renderer.domElement, tooltip = $("#nodeTooltip"), dragPlane = new THREE.Plane(), intersection = new THREE.Vector3(), cameraDirection = new THREE.Vector3(), touchPointers = /* @__PURE__ */ new Set();
  const touchDragThreshold = 6;
  const beginNodeDrag = (event, hit) => {
    const id = hit.userData.id, point = state.positions.get(id);
    view.camera.getWorldDirection(cameraDirection);
    dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, hit.position);
    const descendants = [...subtreeIds(id)].filter((descendantId) => descendantId !== id && !relationChain(id).includes(descendantId));
    view.nodeDrag = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: event.pointerType === "touch", plane: dragPlane.clone(), origin: { x: point.x, y: point.y, z: point.z }, last: { x: point.x, y: point.y, z: point.z }, descendants };
    view.pendingNodeDrag = null;
    point.fixed = true;
    point.vx = point.vy = point.vz = 0;
    descendants.forEach((descendantId) => {
      const descendant = state.positions.get(descendantId);
      descendant.fixed = true;
      descendant.vx = descendant.vy = descendant.vz = 0;
    });
    view.controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
    startSimulation(0.55);
  };
  const cancelNodeDragForCamera = () => {
    view.pendingNodeDrag = null;
    const drag = view.nodeDrag;
    if (!drag) return;
    const point = state.positions.get(drag.id);
    point.x = drag.origin.x;
    point.y = drag.origin.y;
    point.z = drag.origin.z;
    point.fixed = false;
    point.vx = point.vy = point.vz = 0;
    drag.descendants.forEach((descendantId) => {
      state.positions.get(descendantId).fixed = false;
    });
    view.nodeDrag = null;
    view.controls.enabled = true;
    canvas.style.cursor = "grab";
    view.suppressClickUntil = performance.now() + 180;
    paintGraph();
  };
  canvas.addEventListener("pointerdown", (event) => {
    state.cameraFollowCenter = false;
    if (event.pointerType === "touch") {
      touchPointers.add(event.pointerId);
      if (touchPointers.size > 1) {
        cancelNodeDragForCamera();
        view.sceneDrag = null;
        tooltip.hidden = true;
        return;
      }
    }
    const hit = hitAt(event);
    if (!hit) {
      view.sceneDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      view.hoverId = null;
      restoreSelectedHighlight();
      return;
    }
    const id = hit.userData.id;
    view.hoverId = id;
    setTemporaryHighlight(subtreeIds(id));
    if (event.pointerType === "touch") {
      view.pendingNodeDrag = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, hit };
      tooltip.hidden = true;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    beginNodeDrag(event, hit);
  }, true);
  canvas.addEventListener("pointermove", (event) => {
    const pending = view.pendingNodeDrag;
    if (pending && pending.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < touchDragThreshold || touchPointers.size > 1) {
        tooltip.hidden = true;
        return;
      }
      beginNodeDrag(event, pending.hit);
    }
    const sceneDrag = view.sceneDrag;
    if (sceneDrag && sceneDrag.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - sceneDrag.x, event.clientY - sceneDrag.y) > 4) sceneDrag.moved = true;
      tooltip.hidden = true;
      return;
    }
    const drag = view.nodeDrag;
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopPropagation();
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
      hitAt(event);
      if (view.raycaster.ray.intersectPlane(drag.plane, intersection)) {
        const point = state.positions.get(drag.id);
        const dx = intersection.x - drag.last.x, dy = intersection.y - drag.last.y, dz = intersection.z - drag.last.z;
        point.x = intersection.x;
        point.y = intersection.y;
        point.z = intersection.z;
        point.vx = point.vy = point.vz = 0;
        drag.last = { x: point.x, y: point.y, z: point.z };
        drag.descendants.forEach((descendantId) => {
          const descendant = state.positions.get(descendantId);
          descendant.x += dx;
          descendant.y += dy;
          descendant.z += dz;
          descendant.vx = descendant.vy = descendant.vz = 0;
        });
        paintGraph();
      }
      tooltip.hidden = true;
      return;
    }
    if (event.pointerType === "touch") return;
    const hit = hitAt(event), id = hit?.userData.id || null;
    if (view.hoverId !== id) {
      view.hoverId = id;
      if (id) setTemporaryHighlight(subtreeIds(id));
      else restoreSelectedHighlight();
    }
    canvas.style.cursor = id ? "pointer" : "grab";
    if (!id) {
      tooltip.hidden = true;
      return;
    }
    const album = state.byId.get(id), focus = state.byId.get(state.focusId);
    tooltip.innerHTML = `<b>${escapeHtml(album.name)}</b><br>${id === state.focusId ? "\u5F53\u524D\u4E2D\u5FC3" : escapeHtml(relationReason(focus, album))}`;
    tooltip.style.left = `${event.offsetX}px`;
    tooltip.style.top = `${event.offsetY}px`;
    tooltip.hidden = false;
  }, true);
  const finishDrag = (event) => {
    const pending = view.pendingNodeDrag;
    if (pending && pending.pointerId === event.pointerId) {
      view.pendingNodeDrag = null;
      if (event.type === "pointerup" && touchPointers.size === 1) selectAlbum(pending.id);
    }
    const drag = view.nodeDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    state.positions.get(drag.id).fixed = false;
    drag.descendants.forEach((descendantId) => {
      state.positions.get(descendantId).fixed = false;
    });
    view.nodeDrag = null;
    view.controls.enabled = true;
    canvas.style.cursor = "pointer";
    if (drag.moved) view.suppressClickUntil = performance.now() + 180;
    else selectAlbum(drag.id);
    paintGraph();
    startSimulation(0.4);
  };
  const finishSceneDrag = (event) => {
    const drag = view.sceneDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) view.suppressClickUntil = performance.now() + 180;
    view.sceneDrag = null;
    restoreSelectedHighlight();
  };
  const finishPointer = (event) => {
    finishSceneDrag(event);
    finishDrag(event);
    if (event.pointerType === "touch") touchPointers.delete(event.pointerId);
  };
  canvas.addEventListener("pointerup", finishPointer, true);
  canvas.addEventListener("pointercancel", finishPointer, true);
  canvas.addEventListener("pointerleave", () => {
    tooltip.hidden = true;
    if (!view.nodeDrag && !view.sceneDrag && !view.pendingNodeDrag) {
      view.hoverId = null;
      restoreSelectedHighlight();
    }
  });
  canvas.addEventListener("click", (event) => {
    if (performance.now() < view.suppressClickUntil) return;
    if (hitAt(event)) return;
    if (innerWidth <= 800 && innerWidth <= innerHeight) {
      $(".focus-panel").classList.add("panel-hidden");
      return;
    }
    selectAlbum(state.focusId, { record: false });
  });
  canvas.addEventListener("dblclick", (event) => {
    const hit = hitAt(event);
    if (hit) focusAlbum(hit.userData.id);
  });
}
function initThree() {
  const host = $("#threeViewport");
  view.scene = new THREE.Scene();
  view.scene.fog = new THREE.FogExp2(592136, 0.018);
  view.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 180);
  view.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  view.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  view.renderer.outputColorSpace = THREE.SRGBColorSpace;
  view.renderer.setClearColor(592136, 0);
  host.appendChild(view.renderer.domElement);
  view.controls = new OrbitControls(view.camera, view.renderer.domElement);
  view.controls.enableDamping = true;
  view.controls.dampingFactor = 0.08;
  view.controls.minDistance = 7;
  view.controls.maxDistance = 75;
  view.controls.zoomToCursor = true;
  view.controls.addEventListener("start", () => {
    state.cameraFollowCenter = false;
  });
  view.scene.add(new THREE.AmbientLight(16777215, 1));
  const resize = () => {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    view.renderer.setSize(width, height, false);
    view.camera.aspect = width / height;
    view.camera.updateProjectionMatrix();
  };
  view.resizeObserver = new ResizeObserver(resize);
  view.resizeObserver.observe(host);
  resize();
  bindCanvasInteraction();
  let frames = 0;
  const animate = () => {
    if (state.cameraFollowCenter) {
      const focus = view.sprites.get(state.focusId);
      if (focus) view.controls.target.lerp(focus.position, 0.018);
    }
    view.controls.update();
    if (++frames % 18 === 0) updateTextureLod();
    view.renderer.render(view.scene, view.camera);
    requestAnimationFrame(animate);
  };
  animate();
}
function bindInteraction() {
  document.querySelectorAll("[data-zoom]").forEach((button) => button.onclick = () => view.camera.position.multiplyScalar(Number(button.dataset.zoom) > 0 ? 0.82 : 1.22));
  const resetButton = $("[data-reset]");
  if (resetButton) resetButton.onclick = resetCamera;
  $("#previousAlbum").onclick = () => stepAlbum(-1);
  $("#nextAlbum").onclick = () => stepAlbum(1);
  $("#surpriseButton").onclick = surprise;
  $("#makeCenterButton").onclick = () => {
    const id = state.selectedId;
    if (innerWidth <= 800) $(".focus-panel").classList.add("panel-hidden");
    focusAlbum(id);
  };
  $("#closeFocusPanel").onclick = () => $(".focus-panel").classList.add("panel-hidden");
  $("#similarButton").onclick = () => {
    state.neighborOffset++;
    renderNetwork();
    renderFocus();
  };
  $("#clearTrail").onclick = () => {
    state.trail = [state.selectedId];
    renderFocus();
  };
  addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      location.href = "explore.html";
      return;
    }
    if (event.target.matches("input")) return;
    if (event.key === "ArrowLeft") stepAlbum(-1);
    if (event.key === "ArrowRight") stepAlbum(1);
    if (event.key === "ArrowUp") stepImage(-1);
    if (event.key === "ArrowDown") stepImage(1);
  });
}
function bindSearch() {
  const input = $("#searchInput"), results = $("#searchResults");
  input.oninput = () => {
    const query = input.value.trim().toLocaleLowerCase();
    if (!query) {
      results.hidden = true;
      return;
    }
    const matches = state.albums.filter((album) => String(album.id).includes(query) || album.name.toLocaleLowerCase().includes(query)).slice(0, 8);
    results.innerHTML = matches.map((album) => {
      const image = primary(album);
      return `<button class="search-result" data-search-id="${album.id}"><img src="${image.image}" alt="" style="object-position:${cropPosition(album, image)}"><span>${escapeHtml(album.name)}<small>${album.year ?? "\u672A\u77E5"}</small></span></button>`;
    }).join("") || '<div class="search-result">\u6CA1\u6709\u5339\u914D\u4E13\u8F91</div>';
    results.hidden = false;
    results.querySelectorAll("[data-search-id]").forEach((button) => button.onclick = () => {
      selectAlbum(Number(button.dataset.searchId));
      input.value = "";
      results.hidden = true;
    });
  };
  input.onkeydown = (event) => {
    if (event.key === "Escape") {
      input.value = "";
      results.hidden = true;
    }
  };
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search") && !event.target.closest("#searchResults")) results.hidden = true;
  });
}
async function init() {
  try {
    const response = await fetch("docs/albums.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const document2 = await response.json();
    state.albums = (document2.albums || []).filter((album) => album && Number.isInteger(album.id) && album.image);
    state.byId = new Map(state.albums.map((album) => [album.id, album]));
    if (!state.albums.length) throw new Error("\u4E13\u8F91\u6863\u6848\u4E3A\u7A7A");
    initThree();
    bindInteraction();
    bindSearch();
    window.RelationSimilarity?.bind(() => { state.neighborOffset = 0; renderNetwork(true); renderFocus(); });
    const requested = Number(new URLSearchParams(location.search).get("album")), initial = state.byId.has(requested) ? requested : state.albums[Math.floor(Math.random() * state.albums.length)].id;
    focusAlbum(initial);
    $(".focus-panel").classList.add("panel-hidden");
    $("#exploreApp").setAttribute("aria-busy", "false");
    $("#status").hidden = true;
  } catch (error) {
    $("#status").textContent = `\u65E0\u6CD5\u8F7D\u5165\u4E13\u8F91\u6863\u6848\uFF1A${error.message}`;
    console.error(error);
  }
}
init();
