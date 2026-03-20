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

  async function generateCombinedSvg(chars, opts = {}) {
    const { includeCellBorders = false, strokeColorOverride = null, sizeScale = 1 } = opts;
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

      const data = await HanziWriter.loadCharacterData(ch);

      if (includeCellBorders) {
        svgString += `<rect x="${cellX}" y="${cellY}" width="${CELL_VIEWBOX}" height="${CELL_VIEWBOX}" fill="none" stroke="${borderColor}" stroke-width="${borderStrokeWidthPx}" vector-effect="non-scaling-stroke" rx="${rx}" ry="${ry}" />`;
      }

      svgString += `<g transform="translate(${cellX}, ${cellY}) translate(${padViewBox}, ${padViewBox}) scale(${domScale}, -${domScale}) translate(0, -900)">`;
      data.strokes.forEach((path) => {
        svgString += `<path d="${path}" fill="${strokeColor}" />`;
      });
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
      { value: 'default', label: '跟随主题', selected: true },
      { value: '#000000', label: '黑色' },
      { value: '#333333', label: '深灰' },
      { value: '#2383e2', label: '蓝色' },
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

    // 下载按钮放在尺寸和颜色选择之后
    const btnDownloadEl = document.createElement('button');
    btnDownloadEl.className = 'practice-button';
    btnDownloadEl.id = 'btnDownload';
    btnDownloadEl.type = 'button';
    btnDownloadEl.textContent = '导出为图片';
    infoEl.appendChild(btnDownloadEl);

    let currentObjectUrl = null;
    let currentSvgString = '';

    function getSizeScale() {
      if (mode !== 'export' || !sizeSelectEl || !sizeSelectEl.value) return 1;
      const v = Number(sizeSelectEl.value);
      if (Number.isNaN(v) || v <= 0) return 1;
      return v / 1024;
    }

    function getStrokeColorForExport() {
      let strokeColor = getCssVar('--writer-stroke');
      if (
        mode === 'export' &&
        colorSelectEl &&
        colorSelectEl.value &&
        colorSelectEl.value !== 'default'
      ) {
        strokeColor = colorSelectEl.value;
      }
      return strokeColor;
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

    async function renderAll() {
      svgContainerEl.innerHTML = '';

      const chars = normalizeText(hz);
      if (chars.length === 0) {
        svgContainerEl.innerHTML = '<p style="color:var(--fg-subtle)">请输入至少 1 个字符（建议汉字）。</p>';
        return;
      }

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

    sizeSelectEl.addEventListener('change', onSizeChange);
    colorSelectEl.addEventListener('change', onColorChange);
    btnDownloadEl.addEventListener('click', onDownloadClick);

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

