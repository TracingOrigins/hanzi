(function () {
  const rasterizeUtils = window.HanziUtils && window.HanziUtils.svgRasterize;
  if (!rasterizeUtils) {
    throw new Error('gif capture runtime: svg rasterize utils missing');
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  window.addEventListener('message', async (ev) => {
    const msg = ev.data || {};
    if (msg.type !== 'start') return;
    const runId = msg.runId;
    if (!runId) return;

    const {
      hz,
      pixelSize,
      strokeColor,
      outlineColor,
      highlightColor,
      drawingColor,
      frameDelayMs,
      finalDelayMs,
      showOutline
    } = msg;
    const targetEl = document.getElementById('target');

    targetEl.innerHTML = '';
    const writer = HanziWriter.create('target', hz, {
      width: pixelSize,
      height: pixelSize,
      padding: Math.round(pixelSize * 0.14),
      showCharacter: false,
      showOutline: !!showOutline,
      strokeColor,
      outlineColor,
      highlightColor,
      drawingColor,
      charDataLoader: (char, onComplete) => {
        fetch('https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/' + char + '.json')
          .then((res) => {
            if (!res.ok) throw new Error('load failed');
            return res.json();
          })
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
        canvas = await rasterizeUtils.renderSvgToCanvas(svgText, pixelSize, pixelSize);
      }
      const pngBlob = await rasterizeUtils.canvasToPngBlob(canvas);
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
})();
