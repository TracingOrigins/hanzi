/* 可挂载的预览/导出组件（替代 iframe/整页嵌入） */
(function () {
  const root = (window.HanziWidgets = window.HanziWidgets || {});
  const api = (root.preview = root.preview || {});

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function normalizeText(text) {
    const raw = (text ?? '').toString();
    return Array.from(raw)
      .map((c) => c.trim())
      .filter(Boolean);
  }

  const DEFAULT_COLS = 7;
  const CELL_VIEWBOX = 1024;
  const CELL_IMG_W = 160;
  const CELL_IMG_H = 160;
  const CELL_GAP_PX = 8;

  // 与 DOM 渲染保持一致的“padding->缩放/平移”映射：
  // DOM 里 HanziWriter 使用 padding = Math.round(size * 0.14)，且 size=160。
  const DOM_SIZE_PX = CELL_IMG_W;
  const DOM_PADDING_PX = Math.round(DOM_SIZE_PX * 0.14);
  const padViewBox = (DOM_PADDING_PX / DOM_SIZE_PX) * CELL_VIEWBOX;
  const domScale = (DOM_SIZE_PX - 2 * DOM_PADDING_PX) / DOM_SIZE_PX;

  // 缓存字符笔画数据，避免生成“逐笔多帧”时重复拉取同一个字的数据。
  const charDataCache = new Map();
  async function loadCharacterDataCached(ch) {
    if (!ch) throw new Error('loadCharacterDataCached: char is required');
    if (charDataCache.has(ch)) return charDataCache.get(ch);
    const p = HanziWriter.loadCharacterData(ch);
    charDataCache.set(ch, p);
    try {
      await p;
    } catch (e) {
      charDataCache.delete(ch);
      throw e;
    }
    return p;
  }

  async function generateCombinedSvg(chars, opts = {}) {
    const { includeCellBorders = false, strokeColorOverride = null, sizeScale = 1, strokesLimit = null } = opts;
    const cols = Math.min(DEFAULT_COLS, chars.length);
    const rows = Math.ceil(chars.length / cols);

    const gapViewBoxX = (CELL_GAP_PX * CELL_VIEWBOX) / CELL_IMG_W;
    const gapViewBoxY = (CELL_GAP_PX * CELL_VIEWBOX) / CELL_IMG_H;

    const viewBoxW = cols * CELL_VIEWBOX + (cols - 1) * gapViewBoxX;
    const viewBoxH = rows * CELL_VIEWBOX + (rows - 1) * gapViewBoxY;
    const baseImgW = cols * CELL_IMG_W + (cols - 1) * CELL_GAP_PX;
    const baseImgH = rows * CELL_IMG_H + (rows - 1) * CELL_GAP_PX;
    const imgW = baseImgW * sizeScale;
    const imgH = baseImgH * sizeScale;

    let strokeColor = getCssVar('--writer-stroke');
    if (strokeColorOverride) strokeColor = strokeColorOverride;

    const borderColor = getCssVar('--border-color');
    const borderRadiusPx = 8;
    const borderStrokeWidthPx = 1;
    const rx = (borderRadiusPx * CELL_VIEWBOX) / CELL_IMG_W;
    const ry = (borderRadiusPx * CELL_VIEWBOX) / CELL_IMG_H;

    let svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxW} ${viewBoxH}" width="${imgW}" height="${imgH}">`;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = col * (CELL_VIEWBOX + gapViewBoxX);
      const cellY = row * (CELL_VIEWBOX + gapViewBoxY);

      const data = await loadCharacterDataCached(ch);

      if (includeCellBorders) {
        svgString += `<rect x="${cellX}" y="${cellY}" width="${CELL_VIEWBOX}" height="${CELL_VIEWBOX}" fill="none" stroke="${borderColor}" stroke-width="${borderStrokeWidthPx}" vector-effect="non-scaling-stroke" rx="${rx}" ry="${ry}" />`;
      }

      svgString += `<g transform="translate(${cellX}, ${cellY}) translate(${padViewBox}, ${padViewBox}) scale(${domScale}, -${domScale}) translate(0, -900)">`;
      const effectiveLimit = strokesLimit == null ? data.strokes.length : Math.min(data.strokes.length, strokesLimit);
      for (let s = 0; s < effectiveLimit; s++) {
        svgString += `<path d="${data.strokes[s]}" fill="${strokeColor}" />`;
      }
      svgString += `</g>`;
    }

    svgString += `</svg>`;
    return svgString;
  }

  api.mount = function mount(container, opts = {}) {
    const { hz = '汉', mode = 'preview' } = opts;
    if (!container) throw new Error('preview widget: container is required');

    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'svg-page';
    if (mode === 'export') wrapper.classList.add('is-export');
    container.appendChild(wrapper);

    const svgContainerEl = document.createElement('div');
    svgContainerEl.id = 'svg-container';
    wrapper.appendChild(svgContainerEl);

    const infoEl = document.createElement('div');
    infoEl.className = 'export-controls';
    wrapper.appendChild(infoEl);

    const optionsRowEl = document.createElement('div');
    optionsRowEl.className = 'export-options';
    infoEl.appendChild(optionsRowEl);

    const sizeGroupEl = document.createElement('div');
    sizeGroupEl.className = 'export-group';

    const sizeLabel1 = document.createElement('span');
    sizeLabel1.style.marginLeft = '0px';
    sizeLabel1.style.fontSize = '12px';
    sizeLabel1.style.opacity = '0.8';
    sizeLabel1.textContent = '尺寸：';
    sizeGroupEl.appendChild(sizeLabel1);

    const sizeSelectEl = document.createElement('select');
    sizeSelectEl.id = 'sizeSelect';
    sizeSelectEl.style.fontSize = '12px';
    sizeSelectEl.style.padding = '2px 6px';
    sizeSelectEl.style.borderRadius = '6px';
    sizeSelectEl.style.border = '1px solid var(--input-border)';
    sizeSelectEl.style.background = 'var(--input-bg)';
    sizeSelectEl.style.color = 'var(--text-color)';
    [
      { value: '512', label: '512px' },
      { value: '1024', label: '1024px', selected: true },
      { value: '2048', label: '2048px' }
    ].forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.selected) o.selected = true;
      sizeSelectEl.appendChild(o);
    });
    sizeGroupEl.appendChild(sizeSelectEl);
    optionsRowEl.appendChild(sizeGroupEl);

    const colorGroupEl = document.createElement('div');
    colorGroupEl.className = 'export-group';

    const colorLabel = document.createElement('span');
    colorLabel.style.marginLeft = '0px';
    colorLabel.style.fontSize = '12px';
    colorLabel.style.opacity = '0.8';
    colorLabel.textContent = '颜色：';
    colorGroupEl.appendChild(colorLabel);

    const colorSelectEl = document.createElement('select');
    colorSelectEl.id = 'colorSelect';
    colorSelectEl.style.fontSize = '12px';
    colorSelectEl.style.padding = '2px 6px';
    colorSelectEl.style.borderRadius = '6px';
    colorSelectEl.style.border = '1px solid var(--input-border)';
    colorSelectEl.style.background = 'var(--input-bg)';
    colorSelectEl.style.color = 'var(--text-color)';

    [
      { value: '#000000', label: '黑色' },
      { value: '#333333', label: '深灰' },
      { value: '#2383e2', label: '蓝色', selected: true },
      { value: '#d0302f', label: '红色' }
    ].forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.selected) o.selected = true;
      colorSelectEl.appendChild(o);
    });
    colorGroupEl.appendChild(colorSelectEl);
    optionsRowEl.appendChild(colorGroupEl);

    // 操作按钮：导出为图片 + 导出逐笔图片/GIF（仅单字显示）
    const exportActionsEl = document.createElement('div');
    exportActionsEl.className = 'export-actions';

    const btnDownloadEl = document.createElement('button');
    btnDownloadEl.className = 'practice-button';
    btnDownloadEl.id = 'btnDownload';
    btnDownloadEl.type = 'button';
    btnDownloadEl.textContent = '导出为图片';

    const btnDownloadStepsEl = document.createElement('button');
    btnDownloadStepsEl.className = 'practice-button';
    btnDownloadStepsEl.id = 'btnDownloadSteps';
    btnDownloadStepsEl.type = 'button';
    btnDownloadStepsEl.textContent = '导出逐笔图片';
    btnDownloadStepsEl.hidden = true; // renderAll 后根据字符数量决定是否显示

    const btnDownloadGifEl = document.createElement('button');
    btnDownloadGifEl.className = 'practice-button';
    btnDownloadGifEl.id = 'btnDownloadGif';
    btnDownloadGifEl.type = 'button';
    btnDownloadGifEl.textContent = '导出逐笔GIF';
    btnDownloadGifEl.hidden = true; // renderAll 后根据字符数量决定是否显示

    const btnDownloadGifTransparentEl = document.createElement('button');
    btnDownloadGifTransparentEl.className = 'practice-button';
    btnDownloadGifTransparentEl.id = 'btnDownloadGifTransparent';
    btnDownloadGifTransparentEl.type = 'button';
    btnDownloadGifTransparentEl.textContent = '导出透明逐笔GIF';
    btnDownloadGifTransparentEl.hidden = true; // renderAll 后根据字符数量决定是否显示

    exportActionsEl.appendChild(btnDownloadEl);
    exportActionsEl.appendChild(btnDownloadStepsEl);
    exportActionsEl.appendChild(btnDownloadGifEl);
    exportActionsEl.appendChild(btnDownloadGifTransparentEl);
    infoEl.appendChild(exportActionsEl);

    let currentObjectUrl = null;
    let currentSvgString = '';
    let currentSingleChar = null;

    function getSizeScale() {
      if (mode !== 'export' || !sizeSelectEl || !sizeSelectEl.value) return 1;
      const v = Number(sizeSelectEl.value);
      if (Number.isNaN(v) || v <= 0) return 1;
      return v / 1024;
    }

    function getStrokeColorForExport() {
      if (mode === 'export' && colorSelectEl && colorSelectEl.value) {
        return colorSelectEl.value;
      }
      return '#2383e2';
    }

    function downloadCurrentSvg() {
      if (!currentSvgString) return;
      const name = (hz || 'hanzi').trim() || 'hanzi';
      const a = document.createElement('a');
      const blob = new Blob([currentSvgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `${name}.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    /**
     * HanziWriter 动画笔画用「粗线 + clip-path」实现：clip-path 形如 url("http://当前页#mask-xxx")。
     * 序列化成 Blob 再作为 <img> 绘制到 canvas 时，这种绝对地址无法解析，裁剪失效，就会只剩圆头粗线（与演示不一致）。
     * 改为 url(#mask-xxx) 后，引用落在同一份 SVG 内，栅格化才能与页面一致。
     */
    function normalizeSvgClipUrlsForBlobRasterize(svgText) {
      if (!svgText) return svgText;
      // 先做一次宽松字符串归一，覆盖最常见形式
      const coarse = svgText
        .replace(/url\(\s*"[^#"]*#([^"#)]+)"\s*\)/gi, 'url(#$1)')
        .replace(/url\(\s*'[^#']*#([^'#)]+)'\s*\)/gi, 'url(#$1)')
        .replace(/url\(\s*&quot;[^#&]*#([^&]+)&quot;\s*\)/gi, 'url(#$1)')
        .replace(/url\(\s*&apos;[^#&]*#([^&]+)&apos;\s*\)/gi, 'url(#$1)')
        .replace(/url\(\s*[^#\s)]+#([^)\s]+)\s*\)/gi, 'url(#$1)');

      // 再做 DOM 级修复：比纯正则更稳，避免漏掉 style/属性里的变体写法
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
            const nextStyle = style.replace(
              /clip-path\s*:\s*url\(([^)]+)\)/gi,
              (_all, urlPart) => {
                const id = idFromUrl(urlPart);
                return id ? `clip-path:url(#${id})` : _all;
              }
            );
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

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    let gifJsLoadingPromise = null;
    /** 与当前页面同源，避免 Worker 无法加载跨域 worker 脚本（如 localhost vs cdn） */
    function resolveGifAssetUrl(filename) {
      return new URL(`./assets/${filename}`, window.location.href).href;
    }

    async function ensureGifJsOptimizedLoaded() {
      const workerUrl = resolveGifAssetUrl('gif.worker.js');
      const gifJsUrl = resolveGifAssetUrl('gif.js');
      if (window.GIF) return workerUrl;
      if (gifJsLoadingPromise) return gifJsLoadingPromise;

      gifJsLoadingPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = gifJsUrl;
        s.async = true;
        s.onload = () => resolve(workerUrl);
        s.onerror = () => reject(new Error(`Failed to load ${gifJsUrl}`));
        document.head.appendChild(s);
      });

      return await gifJsLoadingPromise;
    }

    async function downloadCurrentStepsPngs() {
      try {
        if (!currentSingleChar) return;
        if (mode !== 'export') return;

        const chars = [currentSingleChar];
        const strokeColor = getStrokeColorForExport();
        const sizeScale = getSizeScale();

        const data = await loadCharacterDataCached(currentSingleChar);
        const total = data.strokes.length;
        if (!total) return;

        const pixelSize = CELL_IMG_W * sizeScale;
        const filenamePrefix = currentSingleChar;

        // 把逐笔过程拼成“一张图”导出，避免下载 N 张 PNG
        const gap = Math.max(0, Math.round(pixelSize * 0.04));
        const stepsCols = Math.min(total, 7);
        const stepsRows = Math.ceil(total / stepsCols);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = stepsCols * pixelSize + (stepsCols - 1) * gap;
        outCanvas.height = stepsRows * pixelSize + (stepsRows - 1) * gap;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) throw new Error('PNG export failed: no canvas context');

        // 逐笔叠加：第 1 笔、第 2 笔...直到全部笔画
        for (let step = 1; step <= total; step++) {
          const svgString = await generateCombinedSvg(chars, {
            includeCellBorders: false,
            strokeColorOverride: strokeColor,
            sizeScale,
            strokesLimit: step
          });

          const stepCanvas = await renderSvgToCanvas(svgString, pixelSize, pixelSize);

          const idx = step - 1;
          const x = (idx % stepsCols) * (pixelSize + gap);
          const y = Math.floor(idx / stepsCols) * (pixelSize + gap);
          outCtx.drawImage(stepCanvas, x, y);
        }

        const pngBlob = await canvasToPngBlob(outCanvas);
        if (!pngBlob) throw new Error('PNG export failed: empty blob');

        const filename = `${filenamePrefix}-steps.png`;
        downloadBlob(pngBlob, filename);
      } catch (e) {
        console.error(e);
        window.alert('导出逐笔图片失败：' + (e && e.message ? e.message : String(e)));
      }
    }

    function buildGifCaptureIframeSrcdoc(pixelSize, showOutline) {
      return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      #target { width: ${pixelSize}px; height: ${pixelSize}px; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js"></script>
  </head>
  <body>
    <div id="target"></div>
    <script>
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));

      function normalizeSvgClipUrls(svgText) {
        if (!svgText) return svgText;
        const coarse = svgText
          .replace(/url\\(\\s*\"[^#\"]*#([^\"#)]+)\"\\s*\\)/gi, 'url(#$1)')
          .replace(/url\\(\\s*'[^#']*#([^'#)]+)'\\s*\\)/gi, 'url(#$1)')
          .replace(/url\\(\\s*&quot;[^#&]*#([^&]+)&quot;\\s*\\)/gi, 'url(#$1)')
          .replace(/url\\(\\s*&apos;[^#&]*#([^&]+)&apos;\\s*\\)/gi, 'url(#$1)')
          .replace(/url\\(\\s*[^#\\s)]+#([^\\)\\s]+)\\s*\\)/gi, 'url(#$1)');

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
              if (id) el.setAttribute('clip-path', 'url(#' + id + ')');
            }

            const style = el.getAttribute('style');
            if (style && /clip-path\\s*:/i.test(style)) {
              const nextStyle = style.replace(
                /clip-path\\s*:\\s*url\\(([^)]+)\\)/gi,
                (_all, urlPart) => {
                  const id = idFromUrl(urlPart);
                  return id ? ('clip-path:url(#' + id + ')') : _all;
                }
              );
              el.setAttribute('style', nextStyle);
            }
          });

          return new XMLSerializer().serializeToString(doc.documentElement);
        } catch (_) {
          return coarse;
        }
      }

      async function renderSvgToCanvasInIframe(svgString, width, height) {
        const safeSvg = normalizeSvgClipUrls(svgString);
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

      function canvasToPngBlob(canvas) {
        return new Promise((resolve) => {
          canvas.toBlob((b) => {
            if (b) return resolve(b);
            const dataUrl = canvas.toDataURL('image/png');
            fetch(dataUrl).then(r => r.blob()).then(resolve);
          }, 'image/png');
        });
      }

      window.addEventListener('message', async (ev) => {
        const msg = ev.data || {};
        if (msg.type !== 'start') return;
        const runId = msg.runId;
        if (!runId) return;

        const { hz, pixelSize, strokeColor, outlineColor, highlightColor, drawingColor, frameDelayMs, finalDelayMs } = msg;
        const targetEl = document.getElementById('target');

        targetEl.innerHTML = '';
        const writer = HanziWriter.create('target', hz, {
          width: pixelSize,
          height: pixelSize,
          padding: Math.round(pixelSize * 0.14),
          showCharacter: false,
          showOutline: ${showOutline ? 'true' : 'false'},
          strokeColor,
          outlineColor,
          highlightColor,
          drawingColor,
          charDataLoader: (char, onComplete) => {
            fetch('https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/' + char + '.json')
              .then(res => { if (!res.ok) throw new Error('load failed'); return res.json(); })
              .then(onComplete);
          }
        });

        const captureFrame = async (index, isFinal) => {
          const svgEl = targetEl.querySelector('svg');
          let canvas = null;
          if (!svgEl) {
            canvas = document.createElement('canvas');
            canvas.width = pixelSize;
            canvas.height = pixelSize;
          } else {
            const svgText = new XMLSerializer().serializeToString(svgEl);
            canvas = await renderSvgToCanvasInIframe(svgText, pixelSize, pixelSize);
          }
          const pngBlob = await canvasToPngBlob(canvas);
          if (!pngBlob) return;
          parent.postMessage({ type: 'frame', runId, index, isFinal, pngBlob }, '*');
        };

        await sleep(80);
        let idx = 0;

        const interval = setInterval(() => {
          captureFrame(idx++, false);
        }, frameDelayMs);

        writer.animateCharacter({
          onComplete: async () => {
            clearInterval(interval);
            await sleep(finalDelayMs > 0 ? 20 : 0);
            await captureFrame(idx, true);
            parent.postMessage({ type: 'done', runId, lastIndex: idx }, '*');
          }
        });
      });
    </script>
  </body>
</html>
      `.trim();
    }

    async function downloadCurrentStepsGif() {
      const prevBtnText = btnDownloadGifEl ? btnDownloadGifEl.textContent : '导出逐笔GIF';
      const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let iframe = null;
      let onMessage = null;
      try {
        if (!currentSingleChar) return;
        if (mode !== 'export') return;

        if (btnDownloadGifEl) {
          btnDownloadGifEl.disabled = true;
          btnDownloadGifEl.textContent = '正在生成...';
        }

        const sizeScale = getSizeScale();
        const pixelSize = CELL_IMG_W * sizeScale;
        const filename = `${currentSingleChar}.gif`;
        const workerUrl = await ensureGifJsOptimizedLoaded();
        const bgColor = getCssVar('--bg-color') || '#ffffff';

        const gif = new window.GIF({
          workers: 2,
          quality: 10,
          workerScript: workerUrl,
          repeat: 0,
          // 不要把画面中的透明像素编码成 GIF 透明背景
          transparent: null,
          // gif.js 在 render 时要求全局 width/height 存在
          width: Math.round(pixelSize),
          height: Math.round(pixelSize)
        });

        const frameDelayMs = 80;
        const finalDelayMs = 500;

        const selectedStrokeColor = getStrokeColorForExport();
        const useSelectedColor = !!(colorSelectEl && colorSelectEl.value);

        // strokeColor 只用于基础描边/未书写状态，保持主题默认，避免用户选色后“未书写部分”也变色
        const strokeColor = useSelectedColor ? selectedStrokeColor : getCssVar('--writer-stroke');
        // outline/highlight 使用默认主题颜色，避免用户选色后“轮廓”直接变成最终填充效果
        const outlineColor = getCssVar('--writer-outline');
        // 正在书写的“高亮/当前笔画”需要跟随用户选择
        const highlightColor = useSelectedColor ? selectedStrokeColor : getCssVar('--writer-highlight');
        // 仅“书写笔画”使用用户选的颜色（非 default 时）
        const drawingColor = useSelectedColor ? selectedStrokeColor : getCssVar('--writer-drawing');

        iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-99999px';
        iframe.style.top = '-99999px';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.border = '0';

        // 注意：使用 srcdoc + 同域渲染，避免 clip-path 在父文档 Blob/rasterize 场景失效
        iframe.srcdoc = buildGifCaptureIframeSrcdoc(pixelSize, true);

        document.body.appendChild(iframe);

        // 等 iframe DOM & 事件监听器 ready，再发送 start，避免 message 丢失
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('iframe load timeout')), 10000);
          iframe.onload = () => {
            clearTimeout(timeout);
            resolve();
          };
          // srcdoc 有时 onload 可能不触发：兜底等待一小段时间再 resolve
          setTimeout(() => {
            clearTimeout(timeout);
            resolve();
          }, 300);
        });

        const pending = new Map();
        let expectedIndex = 0;
        let addChain = Promise.resolve();
        let doneReceived = false;
        let lastIndexReceived = null;
        let framesReceivedCount = 0;
        let framesAddedCount = 0;

        function tryFlush() {
          while (pending.has(expectedIndex)) {
            const frame = pending.get(expectedIndex);
            pending.delete(expectedIndex);
            const { pngBlob, isFinal } = frame;

            addChain = addChain.then(async () => {
              const url = URL.createObjectURL(pngBlob);
              const img = new Image();
              const w = pixelSize;
              const h = pixelSize;
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
              });
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(w);
              canvas.height = Math.round(h);
              const ctx = canvas.getContext('2d');
              // 先铺底色，确保导出 GIF 背景为不透明
              ctx.fillStyle = bgColor;
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(url);

              framesAddedCount++;
              gif.addFrame(canvas, { delay: isFinal ? finalDelayMs : frameDelayMs, copy: true });
            });

            expectedIndex++;
          }
        }

        onMessage = (ev) => {
          if (!iframe || !iframe.contentWindow || ev.source !== iframe.contentWindow) return;
          const msg = ev.data || {};
          if (msg.runId !== runId) return;
          if (msg.type === 'frame') {
            framesReceivedCount++;
            pending.set(msg.index, { pngBlob: msg.pngBlob, isFinal: msg.isFinal });
            tryFlush();
          }
          if (msg.type === 'done') {
            doneReceived = true;
            lastIndexReceived = typeof msg.lastIndex === 'number' ? msg.lastIndex : null;
            // done 后等待 addChain 里最后的帧 flush 完成
            // gif.render 我们放到外面等待 done+addChain
          }
        };

        window.addEventListener('message', onMessage);

        // 等待 iframe 结束后编码
        // done 后等待一小段时间，确保最后一帧也入队/编码完毕（避免由于丢帧导致永远等待）
        const donePromise = new Promise((resolve) => {
          const startedAt = Date.now();
          const check = setInterval(() => {
            if (doneReceived && Date.now() - startedAt > 800) {
              clearInterval(check);
              resolve();
            }
            if (Date.now() - startedAt > 30000) {
              clearInterval(check);
              resolve();
            }
          }, 50);
        });

        iframe.contentWindow.postMessage(
          {
            type: 'start',
            runId,
            hz: currentSingleChar,
            pixelSize,
            strokeColor,
            outlineColor,
            highlightColor,
            drawingColor,
            frameDelayMs,
            finalDelayMs
          },
          '*'
        );

        await donePromise;
        // 等待所有帧加入 gif 完成
        await addChain;

        if (framesAddedCount === 0) {
          throw new Error(`未捕获到可用于编码的帧（framesReceived=${framesReceivedCount}）。`);
        }

        const gifBlob = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('gif render timeout')), 60000);
          gif.on('finished', (blob) => {
            clearTimeout(timeout);
            resolve(blob);
          });
          gif.on('abort', (e) => {
            clearTimeout(timeout);
            reject(e || new Error('gif render aborted'));
          });
          gif.render();
        });

        downloadBlob(gifBlob, filename);
      } catch (e) {
        console.error(e);
        window.alert('导出逐笔GIF失败：' + (e && e.message ? e.message : String(e)));
      } finally {
        try {
          if (onMessage) window.removeEventListener('message', onMessage);
        } catch (_) {}
        try {
          if (iframe) iframe.remove();
        } catch (_) {}
        if (btnDownloadGifEl) {
          btnDownloadGifEl.disabled = false;
          btnDownloadGifEl.textContent = prevBtnText;
        }
      }
    }

    async function downloadCurrentTransparentStepsGif() {
      const prevBtnText = btnDownloadGifTransparentEl
        ? btnDownloadGifTransparentEl.textContent
        : '导出透明逐笔GIF';
      const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let iframe = null;
      let onMessage = null;
      try {
        if (!currentSingleChar) return;
        if (mode !== 'export') return;

        if (btnDownloadGifTransparentEl) {
          btnDownloadGifTransparentEl.disabled = true;
          btnDownloadGifTransparentEl.textContent = '正在生成...';
        }

        const sizeScale = getSizeScale();
        const pixelSize = CELL_IMG_W * sizeScale;
        const filename = `${currentSingleChar}-transparent.gif`;
        const workerUrl = await ensureGifJsOptimizedLoaded();

        const gif = new window.GIF({
          workers: 2,
          quality: 10,
          workerScript: workerUrl,
          repeat: 0,
          // 不使用键色铺底，直接保留透明通道并指定透明索引色
          transparent: 0x000000,
          width: Math.round(pixelSize),
          height: Math.round(pixelSize)
        });

        const frameDelayMs = 80;
        const finalDelayMs = 500;

        const selectedStrokeColor = getStrokeColorForExport();
        const strokeColor = selectedStrokeColor;
        const outlineColor = selectedStrokeColor;
        const highlightColor = selectedStrokeColor;
        const drawingColor = selectedStrokeColor;

        iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-99999px';
        iframe.style.top = '-99999px';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.border = '0';

        iframe.srcdoc = buildGifCaptureIframeSrcdoc(pixelSize, false);

        document.body.appendChild(iframe);

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('iframe load timeout')), 10000);
          iframe.onload = () => {
            clearTimeout(timeout);
            resolve();
          };
          setTimeout(() => {
            clearTimeout(timeout);
            resolve();
          }, 300);
        });

        const pending = new Map();
        let expectedIndex = 0;
        let addChain = Promise.resolve();
        let doneReceived = false;
        let framesReceivedCount = 0;
        let framesAddedCount = 0;

        function tryFlush() {
          while (pending.has(expectedIndex)) {
            const frame = pending.get(expectedIndex);
            pending.delete(expectedIndex);
            const { pngBlob, isFinal } = frame;

            addChain = addChain.then(async () => {
              const url = URL.createObjectURL(pngBlob);
              const img = new Image();
              const w = pixelSize;
              const h = pixelSize;
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
              });
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(w);
              canvas.height = Math.round(h);
              const ctx = canvas.getContext('2d');
              // 保持透明底，避免键色污染；同时把半透明边缘二值化，减少暗边/彩边
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const px = imageData.data;
              for (let i = 0; i < px.length; i += 4) {
                const a = px[i + 3];
                if (a < 80) {
                  px[i] = 0;
                  px[i + 1] = 0;
                  px[i + 2] = 0;
                  px[i + 3] = 0;
                } else {
                  px[i + 3] = 255;
                }
              }
              ctx.putImageData(imageData, 0, 0);
              URL.revokeObjectURL(url);

              framesAddedCount++;
              gif.addFrame(canvas, { delay: isFinal ? finalDelayMs : frameDelayMs, copy: true });
            });

            expectedIndex++;
          }
        }

        onMessage = (ev) => {
          if (!iframe || !iframe.contentWindow || ev.source !== iframe.contentWindow) return;
          const msg = ev.data || {};
          if (msg.runId !== runId) return;
          if (msg.type === 'frame') {
            framesReceivedCount++;
            pending.set(msg.index, { pngBlob: msg.pngBlob, isFinal: msg.isFinal });
            tryFlush();
          }
          if (msg.type === 'done') {
            doneReceived = true;
          }
        };

        window.addEventListener('message', onMessage);

        const donePromise = new Promise((resolve) => {
          const startedAt = Date.now();
          const check = setInterval(() => {
            if (doneReceived && Date.now() - startedAt > 800) {
              clearInterval(check);
              resolve();
            }
            if (Date.now() - startedAt > 30000) {
              clearInterval(check);
              resolve();
            }
          }, 50);
        });

        iframe.contentWindow.postMessage(
          {
            type: 'start',
            runId,
            hz: currentSingleChar,
            pixelSize,
            strokeColor,
            outlineColor,
            highlightColor,
            drawingColor,
            frameDelayMs,
            finalDelayMs
          },
          '*'
        );

        await donePromise;
        await addChain;

        if (framesAddedCount === 0) {
          throw new Error(`未捕获到可用于编码的帧（framesReceived=${framesReceivedCount}）。`);
        }

        const gifBlob = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('gif render timeout')), 60000);
          gif.on('finished', (blob) => {
            clearTimeout(timeout);
            resolve(blob);
          });
          gif.on('abort', (e) => {
            clearTimeout(timeout);
            reject(e || new Error('gif render aborted'));
          });
          gif.render();
        });

        downloadBlob(gifBlob, filename);
      } catch (e) {
        console.error(e);
        window.alert('导出透明逐笔GIF失败：' + (e && e.message ? e.message : String(e)));
      } finally {
        try {
          if (onMessage) window.removeEventListener('message', onMessage);
        } catch (_) {}
        try {
          if (iframe) iframe.remove();
        } catch (_) {}
        if (btnDownloadGifTransparentEl) {
          btnDownloadGifTransparentEl.disabled = false;
          btnDownloadGifTransparentEl.textContent = prevBtnText;
        }
      }
    }

    async function renderAll() {
      svgContainerEl.innerHTML = '';

      const chars = normalizeText(hz);
      if (chars.length === 0) {
        svgContainerEl.innerHTML = '<p style="color:var(--fg-subtle)">请输入至少 1 个字符（建议汉字）。</p>';
        return;
      }

      currentSingleChar = chars.length === 1 ? chars[0] : null;
      btnDownloadGifEl.hidden = !currentSingleChar;
      btnDownloadStepsEl.hidden = !currentSingleChar;
      btnDownloadGifTransparentEl.hidden = !currentSingleChar;

      const cols = Math.min(DEFAULT_COLS, chars.length);
      const rows = Math.ceil(chars.length / cols);
      const sizeScale = getSizeScale();

      const baseWidth = cols * CELL_IMG_W + (cols - 1) * CELL_GAP_PX;
      const baseHeight = rows * CELL_IMG_H + (rows - 1) * CELL_GAP_PX;
      const pixelWidth = baseWidth * sizeScale;
      const pixelHeight = baseHeight * sizeScale;

      svgContainerEl.style.width = `${pixelWidth}px`;
      svgContainerEl.style.height = `${pixelHeight}px`;

      try {
        if (mode === 'export') {
          const strokeColor = getStrokeColorForExport();
          const svgString = await generateCombinedSvg(chars, {
            includeCellBorders: false,
            strokeColorOverride: strokeColor,
            sizeScale
          });

          currentSvgString = svgString;

          if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
          const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          currentObjectUrl = URL.createObjectURL(blob);

          svgContainerEl.style.border = 'none';
          svgContainerEl.style.borderRadius = '0';

          svgContainerEl.style.setProperty('--preview-cols', String(cols));
          svgContainerEl.style.setProperty('--preview-rows', String(rows));
          svgContainerEl.style.setProperty('--preview-cell', `${CELL_IMG_W * sizeScale}px`);
          svgContainerEl.style.setProperty('--preview-gap', `${CELL_GAP_PX * sizeScale}px`);

          const img = document.createElement('img');
          img.src = currentObjectUrl;
          img.alt = hz;
          svgContainerEl.appendChild(img);

          const overlay = document.createElement('div');
          overlay.className = 'preview-grid-overlay';
          overlay.setAttribute('aria-hidden', 'true');
          for (let i = 0; i < cols * rows; i++) {
            overlay.appendChild(document.createElement('div'));
          }
          svgContainerEl.appendChild(overlay);
        } else {
          const svgString = await generateCombinedSvg(chars, { includeCellBorders: true });
          currentSvgString = svgString;
          svgContainerEl.style.border = 'none';
          svgContainerEl.style.borderRadius = '0';
          svgContainerEl.innerHTML = svgString;
        }
      } catch (e) {
        svgContainerEl.innerHTML = '<p style="color:red">图片生成失败</p>';
        console.error(e);
      }
    }

    const onSizeChange = () => {
      currentSvgString = '';
      renderAll();
    };
    const onColorChange = () => {
      currentSvgString = '';
      renderAll();
    };
    const onDownloadClick = () => downloadCurrentSvg();
    const onDownloadStepsClick = () => downloadCurrentStepsPngs();
    const onDownloadGifClick = () => downloadCurrentStepsGif();
    const onDownloadGifTransparentClick = () => downloadCurrentTransparentStepsGif();

    sizeSelectEl.addEventListener('change', onSizeChange);
    colorSelectEl.addEventListener('change', onColorChange);
    btnDownloadEl.addEventListener('click', onDownloadClick);
    btnDownloadStepsEl.addEventListener('click', onDownloadStepsClick);
    btnDownloadGifEl.addEventListener('click', onDownloadGifClick);
    btnDownloadGifTransparentEl.addEventListener('click', onDownloadGifTransparentClick);

    let mql = null;
    let onMqlChange = null;
    try {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
      onMqlChange = () => {
        currentSvgString = '';
        renderAll();
      };
      mql.addEventListener('change', onMqlChange);
    } catch (_) {}

    renderAll();

    return () => {
      try {
        if (mql && onMqlChange) mql.removeEventListener('change', onMqlChange);
      } catch (_) {}
      try {
        if (btnDownloadEl) btnDownloadEl.removeEventListener('click', onDownloadClick);
        if (btnDownloadStepsEl) btnDownloadStepsEl.removeEventListener('click', onDownloadStepsClick);
        if (btnDownloadGifEl) btnDownloadGifEl.removeEventListener('click', onDownloadGifClick);
        if (btnDownloadGifTransparentEl)
          btnDownloadGifTransparentEl.removeEventListener('click', onDownloadGifTransparentClick);
        if (sizeSelectEl) sizeSelectEl.removeEventListener('change', onSizeChange);
        if (colorSelectEl) colorSelectEl.removeEventListener('change', onColorChange);
      } catch (_) {}
      try {
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      } catch (_) {}
      container.innerHTML = '';
    };
  };
})();

