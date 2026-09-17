(function () {
  const nativeFetch = window.fetch.bind(window);
  function ensureInfoBlock() {
    const panel = document.querySelector('.focus-panel');
    if (!panel) return null;
    let info = panel.querySelector('.focus-info');
    if (info) return info;
    info = document.createElement('div');
    info.className = 'focus-info';
    const copy = panel.querySelector('.focus-copy');
    const trail = panel.querySelector('.trail-block');
    if (copy) panel.insertBefore(info, copy);
    else panel.appendChild(info);
    if (copy) info.appendChild(copy);
    if (trail) info.appendChild(trail);
    return info;
  }
  window.renderAlbumPalette = function (person) {
    const copy = document.querySelector('.focus-copy');
    const info = ensureInfoBlock();
    const panel = document.querySelector('.focus-panel');
    const theme = person?.themeColor || person?.palette?.find(color => color?.hex)?.hex || person?.detailBackground || '#f1efe8';
    panel?.style.setProperty('--album-theme', theme);
    if (!copy) return;
    panel?.querySelector('.focus-palette')?.remove();
    const colors = Array.isArray(person?.palette) ? person.palette.filter(color => color?.hex) : [];
    if (!colors.length) return;
    const strip = document.createElement('div');
    strip.className = 'focus-palette';
    strip.setAttribute('aria-label', '封面配色');
    const total = colors.reduce((sum, color) => sum + Math.max(0, Number(color.weight) || 0), 0) || colors.length;
    colors.forEach(color => {
      const swatch = document.createElement('i');
      swatch.style.background = color.hex;
      const weight = (Number(color.weight) || 1 / colors.length) / total;
      swatch.style.flexGrow = String(Math.log1p(24 * Math.max(0, weight)));
      swatch.style.flexBasis = '0';
      strip.appendChild(swatch);
    });
    if (info) info.prepend(strip);
    else copy.prepend(strip);
  };
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    if (!/docs\/people\.json(?:$|[?#])/.test(url)) return nativeFetch(input, init);
    const response = await nativeFetch('/data/albums.json', init);
    const albums = await response.json();
    const people = albums.map((album, index) => {
      const visual = album.visual || {}, scores = {};
      ['brightness', 'contrast', 'saturation', 'detail', 'entropy', 'warmth', 'colorfulness', 'symmetry', 'darkRatio', 'lightRatio', 'hueDiversity'].forEach(key => {
        if (Number.isFinite(visual[key])) scores[key] = visual[key];
      });
      if (Number.isFinite(visual.chromaticHue)) scores.hue = visual.chromaticHue;
      if (Number(album.year) > 0) scores.year = Number(album.year);
      if (Number(album.userRating) > 0) scores.userRating = Number(album.userRating);
      if (Number(album.communityRating) > 0) scores.communityRating = Number(album.communityRating) * 2;
      if (Number(album.durationSeconds) > 0) scores.duration = Number(album.durationSeconds);
      const accent = visual.accent || visual.dominant || {};
      return { id: Number(album.id) || index + 1, name: album.title, image: album.cover,
        images: [{ image: album.cover, hasTransparentPixels: false, detailBackground: accent.hex || '#181815' }], scores,
        bodyArchetype: album.genres?.[0] || album.releaseType || '专辑', bodySurfaceType: album.descriptors?.[0] || album.artist || '',
        artist: album.artist, year: album.year, durationSeconds: album.durationSeconds, userRating: album.userRating, communityRating: album.communityRating,
        genres: [...new Set(album.genres || [])], descriptors: [...new Set(album.descriptors || [])], palette: visual.palette || [], themeColor: accent.hex,
        url: album.url || '/', hasTransparentPixels: false, detailBackground: accent.hex || '#181815' };
    });
    return new Response(JSON.stringify({ people }), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  };
})();
document.write('<script src="similarity-settings.js"><\/script>');
