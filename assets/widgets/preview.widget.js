/* 预览 / 导出：可挂载组件 */
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
  // 预览格边长（与导出默认一致）
  const PREVIEW_DISPLAY_CELL_SINGLE = 256;
  const PREVIEW_DISPLAY_CELL_MULTI = 128;
  const GIF_FRAME_DELAY_MS = 80;
  const GIF_FINAL_DELAY_MS = 500;
  const IFRAME_LOAD_TIMEOUT_MS = 10000;
  const GIF_DONE_MAX_WAIT_MS = 30000;
  const GIF_DONE_SETTLE_MS = 800;
  const GIF_RENDER_TIMEOUT_MS = 60000;

  // 与 DOM 一致：HanziWriter padding = round(size * 0.14)，size 取 160
  const DOM_SIZE_PX = CELL_IMG_W;
  const DOM_PADDING_PX = Math.round(DOM_SIZE_PX * 0.14);
  const padViewBox = (DOM_PADDING_PX / DOM_SIZE_PX) * CELL_VIEWBOX;
  const domScale = (DOM_SIZE_PX - 2 * DOM_PADDING_PX) / DOM_SIZE_PX;

  // 笔画数据缓存，避免逐笔多帧重复请求
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
    wrapper.className = 'preview-page';
    if (mode === 'export') wrapper.classList.add('is-export');
    container.appendChild(wrapper);

    const contentEl = document.createElement('div');
    contentEl.className = 'preview-content';
    wrapper.appendChild(contentEl);

    const svgContainerEl = document.createElement('div');
    svgContainerEl.id = 'preview-container';
    contentEl.appendChild(svgContainerEl);

    const controlsEl = document.createElement('div');
    controlsEl.className = 'export-controls';
    contentEl.appendChild(controlsEl);

    const optionsRowEl = document.createElement('div');
    optionsRowEl.className = 'export-options';
    controlsEl.appendChild(optionsRowEl);

    const colorGroupEl = document.createElement('div');
    colorGroupEl.className = 'export-group';

    const colorLabel = document.createElement('span');
    colorLabel.style.marginLeft = '0px';
    colorLabel.style.opacity = '0.8';
    colorLabel.textContent = '颜色：';
    colorGroupEl.appendChild(colorLabel);

    const colorSelectEl = document.createElement('select');
    colorSelectEl.id = 'colorSelect';
    colorSelectEl.style.padding = '2px 6px';
    colorSelectEl.style.borderRadius = '6px';
    colorSelectEl.style.border = '1px solid var(--input-border)';
    colorSelectEl.style.background = 'var(--input-bg)';
    colorSelectEl.style.color = 'var(--button-text-color)';

    [
      { value: '#000000', label: '黑色' },
      { value: '#333333', label: '深灰' },
      { value: '#2383e2', label: '蓝色', selected: true },
      { value: '#d0302f', label: '红色' }
    ].forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      o.style.color = 'var(--button-text-color)';
      if (opt.selected) o.selected = true;
      colorSelectEl.appendChild(o);
    });
    colorGroupEl.appendChild(colorSelectEl);
    optionsRowEl.appendChild(colorGroupEl);

    const sizeGroupEl = document.createElement('div');
    sizeGroupEl.className = 'export-group';

    const sizeLabelEl = document.createElement('span');
    sizeLabelEl.style.marginLeft = '0px';
    sizeLabelEl.style.opacity = '0.8';
    sizeLabelEl.textContent = '大小：';
    sizeGroupEl.appendChild(sizeLabelEl);

    const sizeSelectEl = document.createElement('select');
    sizeSelectEl.id = 'sizeSelect';
    sizeSelectEl.style.padding = '2px 6px';
    sizeSelectEl.style.borderRadius = '6px';
    sizeSelectEl.style.border = '1px solid var(--input-border)';
    sizeSelectEl.style.background = 'var(--input-bg)';
    sizeSelectEl.style.color = 'var(--button-text-color)';
    // value 为像素边长，相对 CELL_IMG_W 算缩放
    ['16', '32', '48', '64', '128', '256', '512'].forEach((v) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      o.style.color = 'var(--button-text-color)';
      sizeSelectEl.appendChild(o);
    });
    {
      const ic = normalizeText(hz);
      sizeSelectEl.value =
        ic.length === 1 ? String(PREVIEW_DISPLAY_CELL_SINGLE) : String(PREVIEW_DISPLAY_CELL_MULTI);
    }
    sizeGroupEl.appendChild(sizeSelectEl);
    optionsRowEl.appendChild(sizeGroupEl);

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
    btnDownloadStepsEl.hidden = true;

    const btnDownloadGifEl = document.createElement('button');
    btnDownloadGifEl.className = 'practice-button';
    btnDownloadGifEl.id = 'btnDownloadGif';
    btnDownloadGifEl.type = 'button';
    btnDownloadGifEl.textContent = '导出逐笔GIF';
    btnDownloadGifEl.hidden = true;

    const btnDownloadGifTransparentEl = document.createElement('button');
    btnDownloadGifTransparentEl.className = 'practice-button';
    btnDownloadGifTransparentEl.id = 'btnDownloadGifTransparent';
    btnDownloadGifTransparentEl.type = 'button';
    btnDownloadGifTransparentEl.textContent = '导出透明逐笔GIF';
    btnDownloadGifTransparentEl.hidden = true;

    exportActionsEl.appendChild(btnDownloadEl);
    exportActionsEl.appendChild(btnDownloadStepsEl);
    exportActionsEl.appendChild(btnDownloadGifEl);
    exportActionsEl.appendChild(btnDownloadGifTransparentEl);
    controlsEl.appendChild(exportActionsEl);

    let currentObjectUrl = null;
    let currentSvgString = '';
    let currentSingleChar = null;
    // 导出：单字/多字切换时恢复默认边长（256 / 128）
    let prevExportIsSingle = undefined;
    const downloadUtils = window.HanziUtils && window.HanziUtils.download;
    const rasterizeUtils = window.HanziUtils && window.HanziUtils.svgRasterize;

    if (!downloadUtils || !rasterizeUtils) {
      throw new Error('preview widget: required utils are missing');
    }

    function getSizeScale() {
      if (mode !== 'export' || !sizeSelectEl || !sizeSelectEl.value) return 1;
      const px = Number(sizeSelectEl.value);
      if (Number.isNaN(px) || px <= 0) return 1;
      return px / CELL_IMG_W;
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
      downloadUtils.downloadTextAsFile(currentSvgString, `${name}.svg`, 'image/svg+xml;charset=utf-8');
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    let gifJsLoadingPromise = null;
    // 同源 URL，避免 Worker 跨域（如 localhost 与 CDN 混用）
    function resolveGifAssetUrl(filename) {
      return new URL(`./assets/${filename}`, window.location.href).href;
    }

    async function ensureGifJsOptimizedLoaded() {
      const workerUrl = resolveGifAssetUrl('vendors/gif.worker.js');
      const gifJsUrl = resolveGifAssetUrl('vendors/gif.js');
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

        const gap = Math.max(0, Math.round(pixelSize * 0.04));
        const stepsCols = Math.min(total, 7);
        const stepsRows = Math.ceil(total / stepsCols);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = stepsCols * pixelSize + (stepsCols - 1) * gap;
        outCanvas.height = stepsRows * pixelSize + (stepsRows - 1) * gap;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) throw new Error('PNG export failed: no canvas context');

        for (let step = 1; step <= total; step++) {
          const svgString = await generateCombinedSvg(chars, {
            includeCellBorders: false,
            strokeColorOverride: strokeColor,
            sizeScale,
            strokesLimit: step
          });

          const stepCanvas = await rasterizeUtils.renderSvgToCanvas(svgString, pixelSize, pixelSize);

          const idx = step - 1;
          const x = (idx % stepsCols) * (pixelSize + gap);
          const y = Math.floor(idx / stepsCols) * (pixelSize + gap);
          outCtx.drawImage(stepCanvas, x, y);
        }

        const pngBlob = await rasterizeUtils.canvasToPngBlob(outCanvas);
        if (!pngBlob) throw new Error('PNG export failed: empty blob');

        const filename = `${filenamePrefix}-steps.png`;
        downloadUtils.downloadBlob(pngBlob, filename);
      } catch (e) {
        console.error(e);
        window.alert('导出逐笔图片失败：' + (e && e.message ? e.message : String(e)));
      }
    }

    function buildGifCaptureIframeSrcdoc(pixelSize, runtimeScriptUrl, rasterizeUtilsUrl) {
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
    <script src="${rasterizeUtilsUrl}"></script>
    <script src="${runtimeScriptUrl}"></script>
  </head>
  <body>
    <div id="target"></div>
  </body>
</html>
      `.trim();
    }

    function waitForIframeDoneWithSettle(getDoneState) {
      return new Promise((resolve) => {
        const startedAt = Date.now();
        const check = setInterval(() => {
          const elapsed = Date.now() - startedAt;
          if (getDoneState() && elapsed > GIF_DONE_SETTLE_MS) {
            clearInterval(check);
            resolve();
          }
          if (elapsed > GIF_DONE_MAX_WAIT_MS) {
            clearInterval(check);
            resolve();
          }
        }, 50);
      });
    }

    function processTransparentGifCanvas(ctx, canvas) {
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
    }

    async function runStepsGifExport({
      buttonEl,
      fallbackBtnText,
      buildingBtnText,
      errorTitle,
      filenameSuffix,
      showOutline,
      gifTransparent,
      colors,
      prepareFrameCanvas
    }) {
      const prevBtnText = buttonEl ? buttonEl.textContent : fallbackBtnText;
      const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let iframe = null;
      let onMessage = null;
      try {
        if (!currentSingleChar) return;
        if (mode !== 'export') return;

        if (buttonEl) {
          buttonEl.disabled = true;
          buttonEl.textContent = buildingBtnText;
        }

        const sizeScale = getSizeScale();
        const pixelSize = CELL_IMG_W * sizeScale;
        const filename = `${currentSingleChar}${filenameSuffix}.gif`;
        const workerUrl = await ensureGifJsOptimizedLoaded();
        const runtimeScriptUrl = resolveGifAssetUrl('runtime/gif-capture-runtime.js');
        const rasterizeUtilsUrl = resolveGifAssetUrl('utils/svg-rasterize.js');

        const gif = new window.GIF({
          workers: 2,
          quality: 10,
          workerScript: workerUrl,
          repeat: 0,
          transparent: gifTransparent,
          width: Math.round(pixelSize),
          height: Math.round(pixelSize)
        });

        const frameDelayMs = GIF_FRAME_DELAY_MS;
        const finalDelayMs = GIF_FINAL_DELAY_MS;

        iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-99999px';
        iframe.style.top = '-99999px';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.border = '0';
        iframe.srcdoc = buildGifCaptureIframeSrcdoc(pixelSize, runtimeScriptUrl, rasterizeUtilsUrl);
        document.body.appendChild(iframe);

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('iframe load timeout')), IFRAME_LOAD_TIMEOUT_MS);
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
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
              });

              const canvas = document.createElement('canvas');
              canvas.width = Math.round(pixelSize);
              canvas.height = Math.round(pixelSize);
              const ctx = canvas.getContext('2d');
              prepareFrameCanvas(ctx, canvas, img);
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
          if (msg.type === 'done') doneReceived = true;
        };
        window.addEventListener('message', onMessage);

        const donePromise = waitForIframeDoneWithSettle(() => doneReceived);

        iframe.contentWindow.postMessage(
          {
            type: 'start',
            runId,
            hz: currentSingleChar,
            pixelSize,
            strokeColor: colors.strokeColor,
            outlineColor: colors.outlineColor,
            highlightColor: colors.highlightColor,
            drawingColor: colors.drawingColor,
            frameDelayMs,
            finalDelayMs,
            showOutline
          },
          '*'
        );

        await donePromise;
        await addChain;

        if (framesAddedCount === 0) {
          throw new Error(`未捕获到可用于编码的帧（framesReceived=${framesReceivedCount}）。`);
        }

        const gifBlob = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('gif render timeout')), GIF_RENDER_TIMEOUT_MS);
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

        downloadUtils.downloadBlob(gifBlob, filename);
      } catch (e) {
        console.error(e);
        window.alert(`${errorTitle}：` + (e && e.message ? e.message : String(e)));
      } finally {
        try {
          if (onMessage) window.removeEventListener('message', onMessage);
        } catch (_) {}
        try {
          if (iframe) iframe.remove();
        } catch (_) {}
        if (buttonEl) {
          buttonEl.disabled = false;
          buttonEl.textContent = prevBtnText;
        }
      }
    }

    async function downloadCurrentStepsGif() {
      const selectedStrokeColor = getStrokeColorForExport();
      const useSelectedColor = !!(colorSelectEl && colorSelectEl.value);
      const bgColor = getCssVar('--bg-color') || '#ffffff';
      const colors = {
        strokeColor: useSelectedColor ? selectedStrokeColor : getCssVar('--writer-stroke'),
        outlineColor: getCssVar('--writer-outline'),
        highlightColor: useSelectedColor ? selectedStrokeColor : getCssVar('--writer-highlight'),
        drawingColor: useSelectedColor ? selectedStrokeColor : getCssVar('--writer-drawing')
      };

      await runStepsGifExport({
        buttonEl: btnDownloadGifEl,
        fallbackBtnText: '导出逐笔GIF',
        buildingBtnText: '正在生成...',
        errorTitle: '导出逐笔GIF失败',
        filenameSuffix: '',
        showOutline: true,
        gifTransparent: null,
        colors,
        prepareFrameCanvas: (ctx, canvas, img) => {
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      });
    }

    async function downloadCurrentTransparentStepsGif() {
      const selectedStrokeColor = getStrokeColorForExport();
      const colors = {
        strokeColor: selectedStrokeColor,
        outlineColor: selectedStrokeColor,
        highlightColor: selectedStrokeColor,
        drawingColor: selectedStrokeColor
      };

      await runStepsGifExport({
        buttonEl: btnDownloadGifTransparentEl,
        fallbackBtnText: '导出透明逐笔GIF',
        buildingBtnText: '正在生成...',
        errorTitle: '导出透明逐笔GIF失败',
        filenameSuffix: '-transparent',
        showOutline: false,
        gifTransparent: 0x000000,
        colors,
        prepareFrameCanvas: (ctx, canvas, img) => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          processTransparentGifCanvas(ctx, canvas);
        }
      });
    }

    async function renderAll() {
      svgContainerEl.innerHTML = '';

      const chars = normalizeText(hz);
      if (chars.length === 0) {
        if (mode === 'export') prevExportIsSingle = undefined;
        svgContainerEl.innerHTML =
          '<p class="preview-inline-msg preview-inline-msg--muted">请输入至少 1 个字符（建议汉字）。</p>';
        return;
      }

      currentSingleChar = chars.length === 1 ? chars[0] : null;
      btnDownloadGifEl.hidden = !currentSingleChar;
      btnDownloadStepsEl.hidden = !currentSingleChar;
      btnDownloadGifTransparentEl.hidden = !currentSingleChar;

      if (mode === 'export') {
        const isSingle = chars.length === 1;
        if (prevExportIsSingle === undefined || prevExportIsSingle !== isSingle) {
          sizeSelectEl.value = isSingle
            ? String(PREVIEW_DISPLAY_CELL_SINGLE)
            : String(PREVIEW_DISPLAY_CELL_MULTI);
        }
        prevExportIsSingle = isSingle;
      }

      const cols = Math.min(DEFAULT_COLS, chars.length);
      const rows = Math.ceil(chars.length / cols);
      const sizeScale =
        mode === 'export'
          ? getSizeScale()
          : (chars.length === 1 ? PREVIEW_DISPLAY_CELL_SINGLE : PREVIEW_DISPLAY_CELL_MULTI) / CELL_IMG_W;

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
          const svgString = await generateCombinedSvg(chars, { includeCellBorders: true, sizeScale });
          currentSvgString = svgString;
          svgContainerEl.style.border = 'none';
          svgContainerEl.style.borderRadius = '0';
          svgContainerEl.innerHTML = svgString;
        }
      } catch (e) {
        svgContainerEl.innerHTML = '<p class="preview-inline-msg preview-inline-msg--danger">图片生成失败</p>';
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

