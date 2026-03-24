(function () {
  const root = (window.HanziUtils = window.HanziUtils || {});

  function normalizeSvgClipUrlsForBlobRasterize(svgText) {
    if (!svgText) return svgText;
    const coarse = svgText
      .replace(/url\(\s*"[^#"]*#([^"#)]+)"\s*\)/gi, 'url(#$1)')
      .replace(/url\(\s*'[^#']*#([^'#)]+)'\s*\)/gi, 'url(#$1)')
      .replace(/url\(\s*&quot;[^#&]*#([^&]+)&quot;\s*\)/gi, 'url(#$1)')
      .replace(/url\(\s*&apos;[^#&]*#([^&]+)&apos;\s*\)/gi, 'url(#$1)')
      .replace(/url\(\s*[^#\s)]+#([^)\s]+)\s*\)/gi, 'url(#$1)');

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(coarse, 'image/svg+xml');
      const idFromUrl = (raw) => {
        if (!raw) return null;
        const m = raw.match(/#([^)\"']+)/);
        return m ? m[1] : null;
      };

      const nodes = doc.querySelectorAll('*');
      nodes.forEach((el) => {
        const clipPath = el.getAttribute('clip-path');
        if (clipPath) {
          const id = idFromUrl(clipPath);
          if (id) el.setAttribute('clip-path', `url(#${id})`);
        }

        const style = el.getAttribute('style');
        if (style && /clip-path\s*:/i.test(style)) {
          const nextStyle = style.replace(/clip-path\s*:\s*url\(([^)]+)\)/gi, (_all, urlPart) => {
            const id = idFromUrl(urlPart);
            return id ? `clip-path:url(#${id})` : _all;
          });
          el.setAttribute('style', nextStyle);
        }
      });

      return new XMLSerializer().serializeToString(doc.documentElement);
    } catch (_) {
      return coarse;
    }
  }

  async function renderSvgToCanvas(svgString, width, height) {
    const safeSvg = normalizeSvgClipUrlsForBlobRasterize(svgString);
    const svgBlob = new Blob([safeSvg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.decoding = 'async';
    img.src = svgUrl;
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(svgUrl);
    return canvas;
  }

  async function canvasToPngBlob(canvas) {
    return await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
  }

  root.svgRasterize = {
    normalizeSvgClipUrlsForBlobRasterize,
    renderSvgToCanvas,
    canvasToPngBlob
  };
})();
