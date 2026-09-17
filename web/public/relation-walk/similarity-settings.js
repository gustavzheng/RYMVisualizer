(function () {
  const STORAGE_KEY = 'rym-relation-similarity-v2';
  const tagDistance = key => (a, b) => {
    const left = new Set(a[key] || []), right = new Set(b[key] || []);
    if (!left.size && !right.size) return null;
    const intersection = [...left].filter(value => right.has(value)).length;
    return 1 - intersection / new Set([...left, ...right]).size;
  };
  const metrics = [
    { key: 'genres', group: 'music', label: '流派类型', weight: 4, hint: '核心维度；按流派标签的 Jaccard 重合度比较', albumDistance: tagDistance('genres') },
    { key: 'descriptors', group: 'music', label: '音乐描述', weight: 2.2, hint: '按情绪、质感与主题标签的 Jaccard 重合度比较', albumDistance: tagDistance('descriptors') },
    { key: 'year', group: 'music', label: '发行年份', weight: .25, hint: '辅助维度；相差 60 年视为最远', distance: (a, b) => Math.min(1, Math.abs(a - b) / 60) },
    { key: 'userRating', group: 'music', label: '个人评分', weight: .3, hint: '弱辅助维度；按 10 分制归一', distance: (a, b) => Math.min(1, Math.abs(a - b) / 10) },
    { key: 'communityRating', group: 'music', label: 'RYM 评分', weight: .15, hint: '弱辅助维度；按换算后的 10 分制归一', distance: (a, b) => Math.min(1, Math.abs(a - b) / 10) },
    { key: 'duration', group: 'music', label: '专辑时长', weight: .25, hint: '辅助维度；使用对数比例距离', distance: (a, b) => Math.min(1, Math.abs(Math.log2(a / b)) / 3) },
    { key: 'brightness', group: 'cover', label: '亮度', weight: 1.6, hint: '显著视觉维度；0–100 线性距离' },
    { key: 'contrast', group: 'cover', label: '对比度', weight: 1.1, hint: '较显著视觉维度；0–100 线性距离' },
    { key: 'saturation', group: 'cover', label: '饱和度', weight: 1.6, hint: '显著视觉维度；0–100 线性距离' },
    { key: 'detail', group: 'cover', label: '细节密度', weight: .2, defaultEnabled: false, hint: '感知较弱，默认不参与计算' },
    { key: 'entropy', group: 'cover', label: '视觉复杂度', weight: .55, hint: '弱辅助维度；只提供少量影响' },
    { key: 'warmth', group: 'cover', label: '色温', weight: 1.1, hint: '较显著冷暖连续轴' },
    { key: 'colorfulness', group: 'cover', label: '色彩丰富度', weight: 1.2, hint: '较显著视觉维度' },
    { key: 'symmetry', group: 'cover', label: '构图对称度', weight: .35, hint: '弱辅助维度' },
    { key: 'darkRatio', group: 'cover', label: '暗色占比', weight: .8, hint: '中等视觉维度；按面积比例比较' },
    { key: 'lightRatio', group: 'cover', label: '亮色占比', weight: .8, hint: '中等视觉维度；按面积比例比较' },
    { key: 'hue', group: 'cover', label: '主色相', weight: 1.8, hint: '显著视觉维度；环形距离使 0° 与 360° 相邻', distance: (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) / 180 },
    { key: 'hueDiversity', group: 'cover', label: '色相多样性', weight: .45, hint: '弱辅助维度；按离散等级归一', distance: (a, b) => Math.min(1, Math.abs(a - b) / 12) }
  ];
  const defaults = { balance: 50, enabled: Object.fromEntries(metrics.map(metric => [metric.key, metric.defaultEnabled !== false])) };
  let settings = defaults;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') settings = { balance: Number.isFinite(saved.balance) ? Math.max(0, Math.min(100, saved.balance)) : 50, enabled: { ...defaults.enabled, ...(saved.enabled || {}) } };
  } catch {}
  function metricDistance(metric, a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || metric.key === 'duration' && (a <= 0 || b <= 0)) return null;
    return metric.distance ? metric.distance(a, b) : Math.min(1, Math.abs(a - b) / 100);
  }
  function components(a, b) {
    return metrics.filter(metric => settings.enabled[metric.key]).map(metric => {
      const value = metric.albumDistance ? metric.albumDistance(a, b) : metricDistance(metric, a.scores?.[metric.key], b.scores?.[metric.key]);
      return value === null ? null : { ...metric, distance: value };
    }).filter(Boolean);
  }
  function distance(a, b) {
    const values = components(a, b), music = values.filter(item => item.group === 'music'), cover = values.filter(item => item.group === 'cover');
    if (!music.length && !cover.length) return Infinity;
    const meanSquare = items => items.reduce((sum, item) => sum + item.distance ** 2 * item.weight, 0) / items.reduce((sum, item) => sum + item.weight, 0);
    let coverWeight = settings.balance / 100, musicWeight = 1 - coverWeight;
    if (!music.length) { musicWeight = 0; coverWeight = 1; }
    if (!cover.length) { coverWeight = 0; musicWeight = 1; }
    const totalWeight = musicWeight + coverWeight;
    return Math.sqrt(((music.length ? meanSquare(music) * musicWeight : 0) + (cover.length ? meanSquare(cover) * coverWeight : 0)) / totalWeight) * 100;
  }
  function closest(a, b, limit = 2) {
    const values = components(a, b), hasMusic = values.some(item => item.group === 'music'), hasCover = values.some(item => item.group === 'cover');
    const eligible = values.filter(item => {
      if (!hasMusic) return item.group === 'cover';
      if (!hasCover) return item.group === 'music';
      return item.group === 'music' ? settings.balance < 100 : settings.balance > 0;
    });
    const groupWeight = item => item.group === 'music' ? (100 - settings.balance) / 100 : settings.balance / 100;
    return eligible.sort((x, y) => (1 - y.distance) * y.weight * groupWeight(y) - (1 - x.distance) * x.weight * groupWeight(x)).slice(0, limit);
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  function bind(onChange) {
    const actions = document.querySelector('.header-actions');
    if (!actions || document.querySelector('#similaritySettingsButton')) return;
    const button = document.createElement('button');
    button.id = 'similaritySettingsButton'; button.className = 'similarity-settings-button'; button.type = 'button'; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'similaritySettingsPanel'); button.textContent = '相似度'; actions.prepend(button);
    const panel = document.createElement('section');
    panel.id = 'similaritySettingsPanel'; panel.className = 'similarity-settings-panel'; panel.hidden = true;
    panel.innerHTML = `<div class="similarity-settings-head"><div><b>相似度计算</b><span>选择参与空间重排的维度</span></div><button type="button" data-close aria-label="关闭">×</button></div><div class="balance-control"><div><b>音乐属性</b><span data-balance-label></span><b>封面属性</b></div><input type="range" min="0" max="100" step="1" value="${settings.balance}" aria-label="音乐属性与封面属性权重"></div><div class="balance-presets"><button type="button" data-balance="15">偏音乐</button><button type="button" data-balance="50">均衡</button><button type="button" data-balance="85">偏封面</button></div><div class="metric-groups">${['music', 'cover'].map(group => `<fieldset><legend>${group === 'music' ? '音乐属性' : '封面属性'}</legend>${metrics.filter(metric => metric.group === group).map(metric => `<label title="${metric.hint}"><input type="checkbox" data-metric="${metric.key}" ${settings.enabled[metric.key] ? 'checked' : ''}><span><b>${metric.label}<i>权重 ${metric.weight}</i></b><small>${metric.hint}</small></span></label>`).join('')}</fieldset>`).join('')}</div>`;
    document.body.appendChild(panel);
    const range = panel.querySelector('input[type="range"]'), balanceLabel = panel.querySelector('[data-balance-label]');
    let changeTimer;
    const renderBalance = () => { balanceLabel.textContent = `${100 - settings.balance} : ${settings.balance}`; range.style.setProperty('--balance', `${settings.balance}%`); };
    const changed = () => { save(); clearTimeout(changeTimer); changeTimer = setTimeout(onChange, 90); };
    const setBalance = value => { settings.balance = Number(value); range.value = String(settings.balance); renderBalance(); changed(); };
    renderBalance();
    range.addEventListener('input', () => setBalance(range.value));
    panel.querySelectorAll('[data-balance]').forEach(preset => preset.addEventListener('click', () => setBalance(preset.dataset.balance)));
    panel.querySelectorAll('[data-metric]').forEach(input => input.addEventListener('change', () => {
      if (!panel.querySelectorAll('[data-metric]:checked').length) { input.checked = true; return; }
      settings.enabled[input.dataset.metric] = input.checked; changed();
    }));
    const setOpen = open => { panel.hidden = !open; button.setAttribute('aria-expanded', String(open)); };
    button.addEventListener('click', event => { event.stopPropagation(); setOpen(panel.hidden); });
    panel.querySelector('[data-close]').addEventListener('click', () => setOpen(false));
    document.addEventListener('click', event => { if (!panel.hidden && !panel.contains(event.target) && event.target !== button) setOpen(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { event.stopImmediatePropagation(); setOpen(false); } }, true);
  }
  window.RelationSimilarity = { metrics, distance, closest, bind };
})();
