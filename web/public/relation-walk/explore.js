"use strict";
(() => {
  const $ = (selector) => document.querySelector(selector);
  const worldCenter = { x: 6e3, y: 4500 };
  const state = { people: [], byId: /* @__PURE__ */ new Map(), focusId: null, renderedFocusId: null, selectedId: null, hoverId: null, neighbors: [], trail: [], imageIndex: /* @__PURE__ */ new Map(), neighborOffset: 0, scale: 1, panX: 0, panY: 0, drag: null, nodeDrag: null, dragBoost: null, pointers: /* @__PURE__ */ new Map(), pinch: null, positions: /* @__PURE__ */ new Map(), nodeRadii: /* @__PURE__ */ new Map(), branchPathById: /* @__PURE__ */ new Map(), topBranchById: /* @__PURE__ */ new Map(), branchAngles: /* @__PURE__ */ new Map(), parentById: /* @__PURE__ */ new Map(), depthById: /* @__PURE__ */ new Map(), graphEdges: [], nodeElements: [], edgeElements: [], graphAnchor: { ...worldCenter }, cameraFrame: null, simulationFrame: null, layoutFrame: null, simulationEnergy: 0 };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const excludedRelationScores = /* @__PURE__ */ new Set();
  function imagesOf(person) {
    const images = Array.isArray(person.images) && person.images.length ? person.images : [{ image: person.image, crop: person.crop, hasTransparentPixels: person.hasTransparentPixels, detailBackground: person.detailBackground }];
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
  const savedPersonCrops = safeStorageObject("visual-atlas-crops");
  const savedImageCrops = safeStorageObject("visual-atlas-image-crops");
  function effectiveCrop(person, record) {
    const saved = record.image === person.image ? savedPersonCrops[person.id] : savedImageCrops[record.image];
    return saved && typeof saved === "object" ? saved : record.crop;
  }
  function cropPosition(person, record) {
    const crop = effectiveCrop(person, record), offset = crop?.offset || {}, x = clamp(50 + (Number(offset.x) || 0), 0, 100), y = crop?.align === "top" ? clamp(Number(offset.y) || 0, 0, 100) : clamp(50 + (Number(offset.y) || 0), 0, 100);
    return `${x}% ${y}%`;
  }
  function primary(person) {
    return imagesOf(person).find((item) => item.image === person.image) || imagesOf(person)[0];
  }
  function comparableDistance(a, b) {
    const pairs = Object.keys(a.scores || {}).filter((key) => !excludedRelationScores.has(key) && Number.isFinite(a.scores[key]) && Number.isFinite(b.scores?.[key]));
    if (!pairs.length) return Infinity;
    const squared = pairs.reduce((sum, key) => sum + (a.scores[key] - b.scores[key]) ** 2, 0) / pairs.length;
    return Math.sqrt(squared) * (1 + Math.max(0, 7 - pairs.length) * 0.05);
  }
  function rankedNeighbors(person) {
    return state.people.filter((candidate) => candidate.id !== person.id).map((candidate) => ({ person: candidate, distance: comparableDistance(person, candidate) })).sort((a, b) => a.distance - b.distance || a.person.id - b.person.id);
  }
  function relationReason(a, b) {
    const labels = { brightness: "\u5C01\u9762\u4EAE\u5EA6", contrast: "\u5C01\u9762\u5BF9\u6BD4\u5EA6", saturation: "\u5C01\u9762\u9971\u548C\u5EA6", detail: "\u7EC6\u8282\u5BC6\u5EA6", entropy: "\u89C6\u89C9\u590D\u6742\u5EA6", warmth: "\u8272\u6E29", colorfulness: "\u8272\u5F69\u4E30\u5BCC\u5EA6", symmetry: "\u6784\u56FE\u5BF9\u79F0\u5EA6", darkRatio: "\u6697\u8272\u5360\u6BD4", lightRatio: "\u4EAE\u8272\u5360\u6BD4", hue: "\u4E3B\u8272\u76F8", year: "\u53D1\u884C\u5E74\u4EFD", userRating: "\u4E2A\u4EBA\u8BC4\u5206", communityRating: "RYM \u8BC4\u5206" };
    const close = Object.keys(a.scores || {}).filter((key) => !excludedRelationScores.has(key) && Number.isFinite(a.scores[key]) && Number.isFinite(b.scores?.[key])).sort((x, y) => Math.abs(a.scores[x] - b.scores[x]) - Math.abs(a.scores[y] - b.scores[y])).slice(0, 2);
    return close.length ? close.map((key) => labels[key] || key).join("\u3001") : "\u540C\u5C5E\u5F53\u524D\u53EF\u63A2\u7D22\u4E13\u8F91\u5E93";
  }
  function nodeMarkup(person, role, position, caption = "", reason = "") {
    const image = primary(person);
    return `<button class="network-node ${role}" data-person-id="${person.id}" style="left:${position.x}px;top:${position.y}px" aria-label="${escapeHtml(person.name)}${reason ? `\uFF0C${escapeHtml(reason)}` : ""}"><span class="portrait" style="background:${image?.hasTransparentPixels ? image.detailBackground || "#181815" : "#2d2d29"}"><img src="${image?.image || ""}" alt="" draggable="false" style="object-position:${cropPosition(person, image)}"></span><b>${escapeHtml(person.name)}</b><small>${caption}</small></button>`;
  }
  function balancedSeedGroups(members, seeds) {
    const groups = seeds.map((seed) => ({ seed, members: [seed] }));
    const baseSize = Math.floor(members.length / groups.length), remainder = members.length % groups.length;
    const capacities = groups.map((_, index) => baseSize + (index < remainder ? 1 : 0));
    const pending = members.filter((person) => !seeds.includes(person));
    while (pending.length) {
      const choice = pending.map((person, pendingIndex) => {
        const options = groups.map((group, index) => ({ index, distance: comparableDistance(person, group.seed) })).filter((option) => groups[option.index].members.length < capacities[option.index]).sort((a, b) => a.distance - b.distance || a.index - b.index);
        return { person, pendingIndex, option: options[0], regret: (options[1]?.distance ?? Infinity) - options[0].distance };
      }).sort((a, b) => b.regret - a.regret || a.option.distance - b.option.distance || a.person.id - b.person.id)[0];
      groups[choice.option.index].members.push(choice.person);
      pending.splice(choice.pendingIndex, 1);
    }
    return groups;
  }
  function buildSimilarityTree(root) {
    const depth = /* @__PURE__ */ new Map([[root.id, 0]]), children = new Map(state.people.map((person) => [person.id, []])), edges = [];
    const split = (parent, memberIds, level) => {
      if (!memberIds.length) return;
      const branchCount = memberIds.length > 48 ? 7 : memberIds.length > 20 ? 6 : memberIds.length > 9 ? 5 : memberIds.length > 4 ? 3 : memberIds.length;
      const members = memberIds.map((id) => state.byId.get(id)), ranked = [...members].sort((a, b) => comparableDistance(parent, a) - comparableDistance(parent, b) || a.id - b.id), rootOffset = parent.id === root.id ? state.neighborOffset % Math.min(12, ranked.length) : 0, seeds = [ranked[rootOffset]];
      while (seeds.length < branchCount) {
        const candidate = members.filter((person) => !seeds.includes(person)).map((person) => ({ person, separation: Math.min(...seeds.map((seed) => comparableDistance(person, seed))) })).sort((a, b) => b.separation - a.separation || a.person.id - b.person.id)[0];
        if (!candidate) break;
        seeds.push(candidate.person);
      }
      const groups = balancedSeedGroups(members, seeds);
      groups.filter((group) => group.members.length).forEach((group) => {
        const representative = [...group.members].sort((a, b) => comparableDistance(parent, a) - comparableDistance(parent, b) || a.id - b.id)[0];
        children.get(parent.id).push(representative.id);
        depth.set(representative.id, level);
        edges.push({ source: parent.id, target: representative.id, primary: parent.id === root.id, distance: comparableDistance(parent, representative) });
        split(representative, group.members.filter((person) => person.id !== representative.id).map((person) => person.id), level + 1);
      });
    };
    split(root, state.people.filter((person) => person.id !== root.id).map((person) => person.id), 1);
    return { children, depth, edges };
  }
  function isCompactPortrait() {
    return innerWidth <= 800 && innerWidth <= innerHeight;
  }
  function graphSpacing() {
    return isCompactPortrait() ? 0.56 : 1;
  }
  function collisionSpacing() {
    return 1;
  }
  function layoutSimilarityTree(rootId, children, depth, anchor = worldCenter) {
    const positions = /* @__PURE__ */ new Map([[rootId, { ...anchor }]]), branchAngles = /* @__PURE__ */ new Map();
    const spacing = graphSpacing(), firstLevel = children.get(rootId) || [], outerRadius = 920 * spacing;
    firstLevel.forEach((branchId, branchIndex) => {
      const angle = -Math.PI / 2 + branchIndex / Math.max(1, firstLevel.length) * Math.PI * 2;
      branchAngles.set(branchId, angle);
      const cluster = { x: anchor.x + Math.cos(angle) * outerRadius, y: anchor.y + Math.sin(angle) * outerRadius };
      positions.set(branchId, cluster);
      const place = (id) => {
        const branch = children.get(id) || [], parent = positions.get(id), parentDepth = depth.get(id) || 1, radius = Math.max(145, 108 + branch.length * 18) * spacing;
        branch.forEach((child, index) => {
          const localAngle = angle + (index - (branch.length - 1) / 2) * Math.min(0.82, 2.2 / Math.max(1, branch.length)) + (parentDepth - 1) * 0.18;
          positions.set(child, { x: parent.x + Math.cos(localAngle) * radius, y: parent.y + Math.sin(localAngle) * radius });
          place(child);
        });
      };
      place(branchId);
    });
    return { positions, branchAngles };
  }
  function animateToSeedLayout(targets, done) {
    cancelAnimationFrame(state.simulationFrame);
    cancelAnimationFrame(state.layoutFrame);
    const starts = new Map([...state.positions].map(([id, point]) => [id, { x: point.x, y: point.y }])), started = performance.now(), duration = 2000;
    $("#networkWorld").classList.add("force-active");
    const animate = (now) => {
      const progress = clamp((now - started) / duration, 0, 1), eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      targets.forEach((target, id) => {
        const point = state.positions.get(id), start = starts.get(id) || target;
        if (!point) return;
        point.x = start.x + (target.x - start.x) * eased;
        point.y = start.y + (target.y - start.y) * eased;
        point.vx = point.vy = 0;
      });
      paintForceGraph();
      if (progress < 1) state.layoutFrame = requestAnimationFrame(animate);
      else {
        state.layoutFrame = null;
        done();
      }
    };
    state.layoutFrame = requestAnimationFrame(animate);
  }
  function renderNetwork() {
    cancelAnimationFrame(state.simulationFrame);
    cancelAnimationFrame(state.layoutFrame);
    const focus = state.byId.get(state.focusId);
    if (!focus) return;
    const changingCenter = state.renderedFocusId !== null && state.renderedFocusId !== focus.id;
    state.renderedFocusId = focus.id;
    const previousPositions = state.positions;
    const tree = buildSimilarityTree(focus);
    state.graphEdges = tree.edges;
    state.depthById = tree.depth;
    const firstLevel = tree.children.get(focus.id), localIds = /* @__PURE__ */ new Set([focus.id, ...firstLevel]);
    state.neighbors = firstLevel.map((id) => ({ person: state.byId.get(id), distance: comparableDistance(focus, state.byId.get(id)) }));
    state.branchPathById = /* @__PURE__ */ new Map([[focus.id, []]]);
    const assignBranchPath = (id, path) => {
      const nextPath = [...path, id];
      state.branchPathById.set(id, nextPath);
      (tree.children.get(id) || []).forEach((child) => assignBranchPath(child, nextPath));
    };
    firstLevel.forEach((id) => assignBranchPath(id, []));
    state.topBranchById = new Map([[focus.id, focus.id], ...[...state.branchPathById].map(([id, path]) => [id, path[0] ?? id])]);
    state.parentById = new Map(tree.edges.map((edge) => [edge.target, edge.source]));
    const existingFocus = previousPositions.get(focus.id);
    state.graphAnchor = existingFocus ? { x: existingFocus.x, y: existingFocus.y } : { ...worldCenter };
    const seededLayout = layoutSimilarityTree(focus.id, tree.children, tree.depth, state.graphAnchor), seededPositions = seededLayout.positions;
    state.branchAngles = seededLayout.branchAngles;
    state.positions = new Map(state.people.map((person) => {
      const previous = previousPositions.get(person.id), seed = seededPositions.get(person.id), point = previous || seed;
      return [person.id, { x: point.x, y: point.y, vx: previous?.vx || 0, vy: previous?.vy || 0, fixed: false }];
    }));
    const collisionScale = collisionSpacing();
    state.nodeRadii = new Map(state.people.map((person) => [person.id, (person.id === focus.id ? 128 : localIds.has(person.id) ? 112 : 108) * collisionScale]));
    $("#networkNodes").innerHTML = state.people.map((person) => {
      const role = person.id === focus.id ? "center" : localIds.has(person.id) ? "neighbor" : "secondary", distance = comparableDistance(focus, person), caption = role === "center" ? "\u5F53\u524D\u4E13\u8F91" : role === "neighbor" ? `\u76F8\u4F3C ${Math.round(distance)}` : "";
      return nodeMarkup(person, role, state.positions.get(person.id), caption, person.id === focus.id ? "" : relationReason(focus, person));
    }).join("");
    $("#networkEdges").setAttribute("viewBox", "0 0 12000 9000");
    $("#networkEdges").innerHTML = tree.edges.map((edge) => {
      const source = state.positions.get(edge.source), target = state.positions.get(edge.target);
      return `<line class="${edge.primary ? "primary" : "secondary"}" data-source="${edge.source}" data-target="${edge.target}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"/>`;
    }).join("");
    state.nodeElements = [...$("#networkNodes").querySelectorAll("[data-person-id]")].map((node) => [Number(node.dataset.personId), node]);
    state.edgeElements = [...$("#networkEdges").querySelectorAll("line[data-source]")].map((line) => [Number(line.dataset.source), Number(line.dataset.target), line]);
    bindForceNodes();
    if (changingCenter) animateToSeedLayout(seededPositions, () => startSimulation(1, 0.16, true));
    else startSimulation(1, 0.16, true);
    applyTransform();
  }
  function renderFocus() {
    const person = state.byId.get(state.selectedId), center = state.byId.get(state.focusId), images = imagesOf(person), index = clamp(state.imageIndex.get(person.id) || 0, 0, images.length - 1), image = images[index];
    state.imageIndex.set(person.id, index);
    $("#focusImage").src = image.image;
    $("#focusImage").alt = person.name;
    $("#focusImage").style.objectPosition = cropPosition(person, image);
    $("#focusImageButton").style.background = image.hasTransparentPixels ? image.detailBackground || "#181815" : "#181815";
    $("#imagePosition").textContent = `${index + 1} / ${images.length}`;
    $("#focusPosition").textContent = `专辑 ${person.id} · ${person.id === center.id ? "当前图中心" : "从中心展开的关联节点"}`;
    $("#focusName").textContent = person.name;
    window.renderAlbumPalette?.(person);
    $("#focusArtist").textContent = person.artist || "";
    $("#focusStats").innerHTML = `<div><dt>个人评分</dt><dd>${person.userRating ?? "—"} / 10</dd></div><div><dt>社区评分</dt><dd>${person.communityRating ?? "—"} / 5</dd></div><div><dt>年份</dt><dd>${person.year ?? "—"}</dd></div><div><dt>专辑时长</dt><dd>${person.durationSeconds ? `${Math.round(person.durationSeconds / 60)} 分钟` : "—"}</dd></div>`;
    $("#focusDescriptors").textContent = (person.descriptors || []).join(" · ");
    $("#focusTypes").innerHTML = (person.genres || []).map((genre) => `<span>${escapeHtml(genre)}</span>`).join("") || "<span>尚未分类</span>";
    renderRelationPath(person);
    $("#galleryLink").href = person.url || "/";
    $("#viewModeLink").href = `explore-3d.html?person=${center.id}`;
    $("#makeCenterButton").hidden = person.id === center.id;
    $("#trail").innerHTML = state.trail.map((id) => {
      const item = state.byId.get(id), image2 = primary(item);
      return `<button class="${id === person.id ? "current" : ""}" data-trail-id="${id}" title="${escapeHtml(item.name)}"><img src="${image2.image}" alt="${escapeHtml(item.name)}" style="object-position:${cropPosition(item, image2)}"></button>`;
    }).join("");
    $("#trail").querySelectorAll("[data-trail-id]").forEach((button) => button.onclick = () => selectPerson(Number(button.dataset.trailId), { record: false }));
    bindFocusHighlightInteractions();
  }
  function relationChain(id) {
    const chain = [id];
    while (chain[0] !== state.focusId && state.parentById.has(chain[0])) chain.unshift(state.parentById.get(chain[0]));
    return chain;
  }
  function renderRelationPath(person) {
    const container = $("#relationPath");
    if (person.id === state.focusId) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    const chain = relationChain(person.id);
    container.hidden = false;
    container.innerHTML = `<div class="relation-path-title">\u4ECE\u56FE\u4E2D\u5FC3\u5230\u5F53\u524D\u4E13\u8F91</div>${chain.map((id, index) => {
      const item = state.byId.get(id), previous = index ? state.byId.get(chain[index - 1]) : null;
      return `<div class="relation-step" data-relation-person="${id}"><i class="relation-dot"></i><span><b>${escapeHtml(item.name)}</b><small>${previous ? escapeHtml(relationReason(previous, item)) : "\u56FE\u4E2D\u5FC3"}</small></span></div>`;
    }).join("")}`;
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
  function applyHighlightSet(highlighted, active = true) {
    document.querySelectorAll("[data-person-id]").forEach((node) => {
      const included = highlighted.has(Number(node.dataset.personId));
      node.classList.toggle("subtree-highlight", active && included);
      node.classList.toggle("subtree-muted", active && !included);
    });
    document.querySelectorAll("line[data-source]").forEach((line) => {
      const included = highlighted.has(Number(line.dataset.source)) && highlighted.has(Number(line.dataset.target));
      line.classList.toggle("subtree-highlight", active && included);
      line.classList.toggle("subtree-muted", active && !included);
    });
  }
  function highlightSubtree(id, temporary = false) {
    applyHighlightSet(subtreeIds(id), temporary || id !== state.focusId);
  }
  function bindFocusHighlightInteractions() {
    $("#focusTypes").querySelectorAll("[data-highlight-type]").forEach((element) => {
      element.onmouseenter = () => applyHighlightSet(new Set(state.people.filter((person) => person[element.dataset.highlightKind] === element.dataset.highlightType).map((person) => person.id)));
      element.onmouseleave = () => highlightSubtree(state.selectedId);
    });
    $("#relationPath").querySelectorAll("[data-relation-person]").forEach((element) => {
      element.onmouseenter = () => highlightSubtree(Number(element.dataset.relationPerson), true);
      element.onmouseleave = () => highlightSubtree(state.selectedId);
    });
  }
  function selectPerson(id, { record = true } = {}) {
    if (!state.byId.has(id)) return;
    state.selectedId = id;
    if (record && state.trail.at(-1) !== id) {
      state.trail.push(id);
      if (state.trail.length > 18) state.trail.shift();
    }
    document.querySelectorAll(".network-node.selected").forEach((node) => node.classList.remove("selected"));
    document.querySelector(`[data-person-id="${id}"]`)?.classList.add("selected");
    highlightSubtree(id);
    $(".focus-panel").classList.remove("panel-hidden");
    renderFocus();
  }
  function focusPerson(id, { record = true } = {}) {
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
  function syncNodeImage(person, record) {
    document.querySelectorAll(`[data-person-id="${person.id}"] img`).forEach((image) => {
      image.src = record.image;
      image.style.objectPosition = cropPosition(person, record);
    });
  }
  function stepImage(delta) {
    const person = state.byId.get(state.selectedId), images = imagesOf(person), current = state.imageIndex.get(person.id) || 0, next = (current + delta + images.length) % images.length;
    state.imageIndex.set(person.id, next);
    syncNodeImage(person, images[next]);
    renderFocus();
  }
  function stepPerson(delta) {
    const order = [state.focusId, ...state.graphEdges.map((edge) => edge.target)], index = Math.max(0, order.indexOf(state.selectedId)), next = order[(index + delta + order.length) % order.length];
    selectPerson(next);
  }
  function surprise() {
    const focus = state.byId.get(state.focusId), ranked = rankedNeighbors(focus).filter((item) => Number.isFinite(item.distance)), pool = ranked.slice(Math.floor(ranked.length * 0.22), Math.max(1, Math.floor(ranked.length * 0.6)));
    const choice = pool[Math.floor(Math.random() * pool.length)] || ranked.at(-1);
    if (choice) selectPerson(choice.person.id);
  }
  function paintForceGraph() {
    state.nodeElements.forEach(([id, node]) => {
      const point = state.positions.get(id);
      if (point) {
        node.style.left = `${point.x}px`;
        node.style.top = `${point.y}px`;
      }
    });
    state.edgeElements.forEach(([sourceId, targetId, line]) => {
      const source = state.positions.get(sourceId), target = state.positions.get(targetId);
      if (!source || !target) return;
      line.setAttribute("x1", source.x);
      line.setAttribute("y1", source.y);
      line.setAttribute("x2", target.x);
      line.setAttribute("y2", target.y);
    });
  }
  function applyNodeRepulsion(points, timeScale = 1) {
    const branches = /* @__PURE__ */ new Map();
    points.forEach(([id, point]) => {
      if (id === state.focusId) return;
      const branchId = state.topBranchById.get(id) ?? id, branch = branches.get(branchId) || { id: branchId, x: 0, y: 0, points: [] };
      branch.x += point.x;
      branch.y += point.y;
      branch.points.push(point);
      branches.set(branchId, branch);
    });
    const groups = [...branches.values()];
    groups.forEach((branch) => {
      branch.x /= branch.points.length;
      branch.y /= branch.points.length;
    });
    const desired = 720 * graphSpacing();
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i], b = groups[j], dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy));
      if (distance >= desired) continue;
      const force = Math.min(1.5, (desired - distance) * 35e-4) * timeScale, fx = dx / distance * force, fy = dy / distance * force;
      const anchorA = state.positions.get(a.id), anchorB = state.positions.get(b.id);
      if (anchorA && !anchorA.fixed) { anchorA.vx -= fx; anchorA.vy -= fy; }
      if (anchorB && !anchorB.fixed) { anchorB.vx += fx; anchorB.vy += fy; }
    }
  }
  function applyBranchGravity(points, settleProgress = 1, timeScale = 1) {
    const pointById = new Map(points), spacing = graphSpacing(), radius = (920 - 530 * settleProgress) * spacing;
    state.branchAngles.forEach((angle, branchId) => {
      const point = pointById.get(branchId);
      if (!point || point.fixed || !Number.isFinite(angle)) return;
      const targetX = state.graphAnchor.x + Math.cos(angle) * radius, targetY = state.graphAnchor.y + Math.sin(angle) * radius;
      const strength = (0.004 + (1 - settleProgress) * 0.008) * timeScale;
      point.vx += clamp((targetX - point.x) * strength, -2.5, 2.5);
      point.vy += clamp((targetY - point.y) * strength, -2.5, 2.5);
    });
  }
  function applyEdgeSprings(boostAmount, timeScale = 1, hierarchyBoost = 0) {
    const spacing = graphSpacing();
    state.graphEdges.forEach((edge) => {
      const a = state.positions.get(edge.source), b = state.positions.get(edge.target), dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy)), childDepth = state.depthById.get(edge.target) || 1, visualMinimum = state.nodeRadii.get(edge.source) + state.nodeRadii.get(edge.target) + 16, desired = Math.max((edge.primary ? 390 : childDepth >= 3 ? 175 : 215) * spacing, visualMinimum), base = childDepth === 1 ? 8e-3 : childDepth === 2 ? 9e-3 : 72e-4, dragBoost = state.dragBoost?.factors.get(`${edge.source}:${edge.target}`) || 1, dragMultiplier = 1 + (dragBoost - 1) * boostAmount, depthMultiplier = 1 + hierarchyBoost * Math.min(24, childDepth * childDepth * 1.5), rawForce = (distance - desired) * base * dragMultiplier * depthMultiplier * timeScale, force = hierarchyBoost ? clamp(rawForce, -24, 24) : rawForce;
      if (!a.fixed) {
        a.vx += dx / distance * force;
        a.vy += dy / distance * force;
      }
      if (!b.fixed) {
        b.vx -= dx / distance * force;
        b.vy -= dy / distance * force;
      }
    });
  }
  function integratePositions(points, timeScale = 1) {
    let movement = 0;
    points.forEach(([id, point]) => {
      if (point.fixed) return;
      if (id === state.focusId) {
        const gravity = 0.035 * timeScale;
        point.vx += (state.graphAnchor.x - point.x) * gravity;
        point.vy += (state.graphAnchor.y - point.y) * gravity;
      }
      const damping = Math.pow(0.82, timeScale);
      point.vx *= damping;
      point.vy *= damping;
      point.x += point.vx * timeScale;
      point.y += point.vy * timeScale;
      movement += (Math.abs(point.vx) + Math.abs(point.vy)) * timeScale;
    });
    return movement;
  }
  function resolveNodeCollisions(points, timeScale = 1, passes = 1) {
    const cellSize = 270, neighborOffsets = [[0, 0], [1, -1], [1, 0], [1, 1], [0, 1]];
    for (let pass = 0; pass < passes; pass++) {
      const grid = /* @__PURE__ */ new Map();
      points.forEach((entry) => {
        const point = entry[1], x = Math.floor(point.x / cellSize), y = Math.floor(point.y / cellSize), key = `${x}:${y}`, cell = grid.get(key) || [];
        cell.push(entry);
        grid.set(key, cell);
      });
      const collide = ([idA, a], [idB, b]) => {
        const minimum = state.nodeRadii.get(idA) + state.nodeRadii.get(idB) + 10, dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 0.01;
        if (distance >= minimum) return;
        const overlap = (minimum - distance) * (pass === 0 ? 0.62 : 0.36) * timeScale, impulse = overlap > 0.5 ? Math.min(0.08, overlap * 25e-4) : 0, nx = distance > 0.02 ? dx / distance : ((idA * 17 + idB * 31) % 7 - 3) / 3, ny = distance > 0.02 ? dy / distance : ((idA * 29 + idB * 13) % 7 - 3) / 3, total = a.fixed || b.fixed ? 1 : 2;
        if (!a.fixed) {
          a.x -= nx * overlap / total;
          a.y -= ny * overlap / total;
          a.vx -= nx * impulse;
          a.vy -= ny * impulse;
        }
        if (!b.fixed) {
          b.x += nx * overlap / total;
          b.y += ny * overlap / total;
          b.vx += nx * impulse;
          b.vy += ny * impulse;
        }
      };
      for (const [key, cell] of grid) {
        const [cellX, cellY] = key.split(":").map(Number);
        for (let i = 0; i < cell.length; i++) for (let j = i + 1; j < cell.length; j++) collide(cell[i], cell[j]);
        neighborOffsets.slice(1).forEach(([offsetX, offsetY]) => {
          const other = grid.get(`${cellX + offsetX}:${cellY + offsetY}`);
          if (other) cell.forEach((a) => other.forEach((b) => collide(a, b)));
        });
      }
    }
  }
  function startSimulation(energy = 0.35, speed = 1, hierarchicalSettle = false) {
    let ticks = 0, stableFrames = 0;
    state.simulationEnergy = Math.max(state.simulationEnergy, energy);
    cancelAnimationFrame(state.simulationFrame);
    $("#networkWorld").classList.add("force-active");
    const tick = () => {
      ticks++;
      const warmupTicks = hierarchicalSettle ? 180 : 120, timeScale = speed < 1 ? speed + (1 - speed) * Math.min(1, ticks / warmupTicks) ** 2 : speed, points = [...state.positions.entries()];
      let boostAmount = 0;
      if (state.dragBoost) {
        boostAmount = state.dragBoost.releasedAt === null ? 1 : Math.max(0, 1 - (performance.now() - state.dragBoost.releasedAt) / 750);
        if (boostAmount === 0) state.dragBoost = null;
      }
      const hierarchyProgress = hierarchicalSettle ? Math.min(1, ticks / 900) : 1;
      const hierarchyBoost = 0.12 + (hierarchicalSettle ? (1 - hierarchyProgress) ** 3 * 0.88 : 0);
      applyNodeRepulsion(points, timeScale);
      applyBranchGravity(points, hierarchyProgress, timeScale);
      applyEdgeSprings(boostAmount, timeScale, hierarchyBoost);
      const movement = integratePositions(points, timeScale);
      resolveNodeCollisions(points, timeScale, ticks < 180 ? 2 : 1);
      paintForceGraph();
      state.simulationEnergy *= 0.985;
      const minimumTicks = hierarchicalSettle ? 420 : 210, maximumTicks = hierarchicalSettle ? 1100 : 720;
      stableFrames = movement < points.length * 0.012 && state.simulationEnergy < 8e-3 ? stableFrames + 1 : 0;
      if (state.nodeDrag || state.dragBoost || ticks < maximumTicks && (ticks < minimumTicks || stableFrames < 75)) state.simulationFrame = requestAnimationFrame(tick);
      else $("#networkWorld").classList.remove("force-active");
    };
    state.simulationFrame = requestAnimationFrame(tick);
  }
  function bindForceNodes() {
    $("#networkNodes").querySelectorAll("[data-person-id]").forEach((node) => {
      const id = Number(node.dataset.personId);
      node.onpointerdown = (event) => {
        event.stopPropagation();
        state.hoverId = id;
        highlightSubtree(id, true);
        const point = state.positions.get(id), queue = [id], factors = /* @__PURE__ */ new Map(), descendants = [];
        while (queue.length) {
          const parentId = queue.shift();
          state.graphEdges.filter((edge) => edge.source === parentId).forEach((edge) => {
            queue.push(edge.target);
            descendants.push(edge.target);
            factors.set(`${edge.source}:${edge.target}`, 8);
          });
        }
        state.dragBoost = { factors, releasedAt: null };
        point.fixed = true;
        descendants.forEach((descendantId) => {
          const descendant = state.positions.get(descendantId);
          descendant.fixed = true;
          descendant.vx = descendant.vy = 0;
        });
        state.nodeDrag = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, x: point.x, y: point.y, descendants, moved: false };
        node.setPointerCapture(event.pointerId);
        node.classList.add("dragging");
        startSimulation(0.5);
      };
      node.onmouseenter = () => {
        state.hoverId = id;
        if (!state.nodeDrag) highlightSubtree(id, true);
      };
      node.onmouseleave = () => {
        if (state.hoverId === id) state.hoverId = null;
        if (!state.nodeDrag) highlightSubtree(state.selectedId);
      };
      node.ondblclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        focusPerson(id);
        moveCameraToPerson(id);
      };
      node.onpointermove = (event) => {
        const drag = state.nodeDrag;
        if (state.pinch || !drag || drag.id !== id || drag.pointerId !== event.pointerId) return;
        const dx = (event.clientX - drag.startX) / state.scale, dy = (event.clientY - drag.startY) / state.scale, stepX = (event.clientX - drag.lastX) / state.scale, stepY = (event.clientY - drag.lastY) / state.scale;
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        if (Math.hypot(dx, dy) > 5) drag.moved = true;
        const point = state.positions.get(id);
        point.x = drag.x + dx;
        point.y = drag.y + dy;
        point.vx = point.vy = 0;
        drag.descendants.forEach((descendantId) => {
          const descendant = state.positions.get(descendantId);
          descendant.x += stepX;
          descendant.y += stepY;
          descendant.vx = descendant.vy = 0;
        });
        paintForceGraph();
      };
      const finish = (event) => {
        const drag = state.nodeDrag;
        if (!drag || drag.id !== id || drag.pointerId !== event.pointerId) return;
        state.positions.get(id).fixed = false;
        drag.descendants.forEach((descendantId) => {
          state.positions.get(descendantId).fixed = false;
        });
        if (state.dragBoost) state.dragBoost.releasedAt = performance.now();
        node.classList.remove("dragging");
        state.nodeDrag = null;
        if (!drag.moved) {
          state.dragBoost = null;
          selectPerson(id);
        } else {
          highlightSubtree(state.hoverId || state.selectedId, Boolean(state.hoverId));
          startSimulation(0.55);
        }
      };
      node.onpointerup = finish;
      node.onpointercancel = finish;
    });
  }
  function applyTransform() {
    const world = $("#networkWorld");
    world.style.transform = `translate(calc(-50% + ${state.panX}px),calc(-50% + ${state.panY}px)) scale(${state.scale})`;
  }
  function stopCameraAnimation() {
    cancelAnimationFrame(state.cameraFrame);
    state.cameraFrame = null;
  }
  function moveCameraToPerson(id) {
    stopCameraAnimation();
    const started = performance.now(), startX = state.panX, startY = state.panY, duration = 1800;
    const animate = (now) => {
      const point = state.positions.get(id);
      if (!point) return;
      const progress = clamp((now - started) / duration, 0, 1), eased = 1 - (1 - progress) ** 3, targetX = (worldCenter.x - point.x) * state.scale, targetY = (worldCenter.y - point.y) * state.scale;
      state.panX = startX + (targetX - startX) * eased;
      state.panY = startY + (targetY - startY) * eased;
      applyTransform();
      if (progress < 1) state.cameraFrame = requestAnimationFrame(animate);
      else state.cameraFrame = null;
    };
    state.cameraFrame = requestAnimationFrame(animate);
  }
  function zoomBy(amount, origin) {
    const previous = state.scale, next = clamp(previous * Math.exp(amount), 0.12, 1.75);
    if (origin) {
      const rect = $("#networkViewport").getBoundingClientRect(), x = origin.x - rect.left - rect.width / 2, y = origin.y - rect.top - rect.height / 2;
      state.panX -= x * (next / previous - 1);
      state.panY -= y * (next / previous - 1);
    }
    state.scale = next;
    applyTransform();
  }
  function fitNetwork() {
    const points = [...state.positions.values()];
    if (!points.length) return;
    const viewport = $("#networkViewport").getBoundingClientRect(), minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x)), minY = Math.min(...points.map((point) => point.y)), maxY = Math.max(...points.map((point) => point.y)), centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    state.scale = clamp(Math.min(viewport.width / (maxX - minX + 320), viewport.height / (maxY - minY + 320)), 0.12, 1);
    state.panX = (worldCenter.x - centerX) * state.scale;
    state.panY = (worldCenter.y - centerY) * state.scale;
    applyTransform();
  }
  function bindInteraction() {
    $(".back-link").onclick = (event) => {
      event.preventDefault();
      window.top.location.assign("/");
    };
    const viewport = $("#networkViewport");
    viewport.onwheel = (event) => {
      event.preventDefault();
      stopCameraAnimation();
      zoomBy(-event.deltaY * 1e-3, { x: event.clientX, y: event.clientY });
    };
    const touchPoint = (event) => ({ x: event.clientX, y: event.clientY });
    viewport.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      stopCameraAnimation();
      state.pointers.set(event.pointerId, touchPoint(event));
      if (state.pointers.size === 2) {
        const [a, b] = [...state.pointers.values()], center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        state.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), center };
        state.drag = null;
        viewport.classList.remove("dragging");
        if (state.nodeDrag) {
          state.nodeDrag.moved = true;
          const point = state.positions.get(state.nodeDrag.id);
          if (point) point.fixed = false;
        }
      }
    }, { capture: true });
    viewport.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "touch" || !state.pointers.has(event.pointerId)) return;
      state.pointers.set(event.pointerId, touchPoint(event));
      if (!state.pinch || state.pointers.size < 2) return;
      event.preventDefault();
      const [a, b] = [...state.pointers.values()], distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ratio = distance / state.pinch.distance;
      state.panX += center.x - state.pinch.center.x;
      state.panY += center.y - state.pinch.center.y;
      zoomBy(Math.log(ratio), center);
      state.pinch = { distance, center };
    }, { capture: true });
    const finishTouch = (event) => {
      if (event.pointerType !== "touch") return;
      state.pointers.delete(event.pointerId);
      if (state.pointers.size < 2) state.pinch = null;
    };
    viewport.addEventListener("pointerup", finishTouch, { capture: true });
    viewport.addEventListener("pointercancel", finishTouch, { capture: true });
    viewport.ondragstart = (event) => event.preventDefault();
    viewport.onselectstart = (event) => event.preventDefault();
    viewport.onclick = (event) => {
      if (event.target.closest(".network-node")) return;
      if (isCompactPortrait()) $(".focus-panel").classList.add("panel-hidden");
      else selectPerson(state.focusId, { record: false });
    };
    viewport.onpointerdown = (event) => {
      if (event.target.closest(".network-node")) return;
      stopCameraAnimation();
      state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("dragging");
    };
    viewport.onpointermove = (event) => {
      if (state.pinch || !state.drag || state.drag.id !== event.pointerId) return;
      state.panX = state.drag.panX + event.clientX - state.drag.x;
      state.panY = state.drag.panY + event.clientY - state.drag.y;
      applyTransform();
    };
    const end = () => {
      state.drag = null;
      viewport.classList.remove("dragging");
    };
    viewport.onpointerup = end;
    viewport.onpointercancel = end;
    document.querySelectorAll("[data-zoom]").forEach((button) => button.onclick = () => {
      stopCameraAnimation();
      zoomBy(Number(button.dataset.zoom) * 0.2);
    });
    const resetButton = $("[data-reset]");
    if (resetButton) resetButton.onclick = () => {
      stopCameraAnimation();
      fitNetwork();
    };
    $("#previousPerson").onclick = () => stepPerson(-1);
    $("#nextPerson").onclick = () => stepPerson(1);
    $("#surpriseButton").onclick = surprise;
    $("#makeCenterButton").onclick = () => {
      const nextCenter = state.selectedId;
      if (isCompactPortrait()) $(".focus-panel").classList.add("panel-hidden");
      focusPerson(nextCenter);
      moveCameraToPerson(nextCenter);
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
        window.top.location.href = "/";
        return;
      }
      if (event.target.matches("input")) return;
      if (event.key === "ArrowLeft") stepPerson(-1);
      if (event.key === "ArrowRight") stepPerson(1);
      if (event.key === "ArrowUp") stepImage(-1);
      if (event.key === "ArrowDown") stepImage(1);
    });
    let resizeTimer;
    addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderNetwork, 120);
    }, { passive: true });
  }
  function bindSearch() {
    const input = $("#searchInput"), results = $("#searchResults");
    input.oninput = () => {
      const query = input.value.trim().toLocaleLowerCase();
      if (!query) {
        results.hidden = true;
        return;
      }
      const matches = state.people.filter((person) => String(person.id).includes(query) || person.name.toLocaleLowerCase().includes(query)).slice(0, 8);
      results.innerHTML = matches.map((person) => {
        const image = primary(person);
        return `<button class="search-result" data-search-id="${person.id}"><img src="${image.image}" alt="" style="object-position:${cropPosition(person, image)}"><span>${escapeHtml(person.name)}<small>${person.year ?? "\u672A\u77E5"}</small></span></button>`;
      }).join("") || '<div class="search-result">\u6CA1\u6709\u5339\u914D\u4E13\u8F91</div>';
      results.hidden = false;
      results.querySelectorAll("[data-search-id]").forEach((button) => button.onclick = () => {
        selectPerson(Number(button.dataset.searchId));
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
      const response = await fetch("docs/people.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const document2 = await response.json();
      state.people = (document2.people || []).filter((person) => person && Number.isInteger(person.id) && person.image);
      state.byId = new Map(state.people.map((person) => [person.id, person]));
      if (!state.people.length) throw new Error("\u4E13\u8F91\u6863\u6848\u4E3A\u7A7A");
      bindInteraction();
      bindSearch();
      const requested = Number(new URLSearchParams(location.search).get("person")), initial = state.byId.has(requested) ? requested : state.people[Math.floor(Math.random() * state.people.length)].id;
      state.scale = 0.5;
      focusPerson(initial);
      $("#exploreApp").setAttribute("aria-busy", "false");
      $("#status").hidden = true;
    } catch (error) {
      $("#status").textContent = `\u65E0\u6CD5\u8F7D\u5165\u4E13\u8F91\u6863\u6848\uFF1A${error.message}`;
    }
  }
  init();
})();
