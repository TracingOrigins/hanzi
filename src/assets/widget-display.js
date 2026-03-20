/* 可挂载的演示/练习组件（替代 iframe/整页嵌入） */
(function () {
  const root = (window.HanziWidgets = window.HanziWidgets || {});
  const api = (root.display = root.display || {});

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function normalizeText(text) {
    const raw = (text ?? '').toString();
    return Array.from(raw)
      .map((c) => c.trim())
      .filter(Boolean);
  }

  api.mount = function mount(container, opts = {}) {
    const { hz = '汉', mode = 'display' } = opts;
    if (!container) throw new Error('display widget: container is required');

    // 让组件拥有自己的 DOM 生命周期
    container.innerHTML = '';

    const rootEl = document.createElement('div');
    rootEl.className = 'multi-wrap';
    rootEl.classList.toggle('is-practice', mode === 'practice');

    const gridEl = document.createElement('div');
    gridEl.className = 'multi-grid';

    rootEl.appendChild(gridEl);

    // 练习模式才显示控制按钮
    const isPractice = mode === 'practice';
    let controlsEl = null;
    let btnPlayEl = null;
    let btnQuizEl = null;
    if (isPractice) {
      controlsEl = document.createElement('div');
      controlsEl.className = 'practice-controls';

      btnPlayEl = document.createElement('button');
      btnPlayEl.className = 'practice-button';
      btnPlayEl.id = 'btnPlay';
      btnPlayEl.type = 'button';
      btnPlayEl.textContent = '演示动画';

      btnQuizEl = document.createElement('button');
      btnQuizEl.className = 'practice-button';
      btnQuizEl.id = 'btnQuiz';
      btnQuizEl.type = 'button';
      btnQuizEl.textContent = '书写练习';

      controlsEl.appendChild(btnPlayEl);
      controlsEl.appendChild(btnQuizEl);
      rootEl.appendChild(controlsEl);
    }

    container.appendChild(rootEl);

    let writers = [];
    let sequenceToken = 0;

    function cancelAll() {
      writers.forEach((w) => {
        try {
          w.cancelQuiz();
        } catch (_) {}
        try {
          w.pauseAnimation();
        } catch (_) {}
      });
    }

    function clearWritingState(exceptWriter) {
      writers.forEach((w) => {
        if (exceptWriter && w === exceptWriter) return;
        try {
          w.hideCharacter();
        } catch (_) {}
      });
    }

    function clearGrid() {
      ++sequenceToken;
      cancelAll();
      writers = [];
      gridEl.innerHTML = '';
    }

    function buildWriter(targetId, ch) {
      const el = document.getElementById(targetId);
      const size = Math.round(el.offsetWidth);

      return HanziWriter.create(targetId, ch, {
        width: size,
        height: size,
        padding: Math.round(size * 0.14),
        showCharacter: false,
        showOutline: true,
        strokeColor: getCssVar('--writer-stroke'),
        outlineColor: getCssVar('--writer-outline'),
        highlightColor: getCssVar('--writer-highlight'),
        drawingColor: getCssVar('--writer-drawing'),
        charDataLoader: (char, onComplete) => {
          fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${char}.json`)
            .then((res) => {
              if (!res.ok) throw new Error(`load failed: ${res.status}`);
              return res.json();
            })
            .then(onComplete);
        }
      });
    }

    function createWriterTarget(ch, index) {
      const target = document.createElement('div');
      target.className = 'writer-target';
      const targetId = `target-${mode}-${index}-${Math.random().toString(16).slice(2)}`;
      target.id = targetId;
      gridEl.appendChild(target);

      const writer = buildWriter(targetId, ch);
      writers.push(writer);

      // 演示模式：点击单字重新播放该字动画
      if (!isPractice) {
        target.addEventListener('click', () => {
          ++sequenceToken;
          cancelAll();
          writers.forEach((w) => {
            if (w === writer) return;
            try {
              w.hideCharacter();
            } catch (_) {}
          });
          try {
            writer.cancelQuiz();
          } catch (_) {}
          try {
            writer.hideCharacter();
          } catch (_) {}
          try {
            writer.animateCharacter();
          } catch (_) {}
        });
      }
    }

    function renderText(text) {
      clearGrid();
      const chars = normalizeText(text);
      if (chars.length === 0) {
        gridEl.innerHTML = '<div class="err">请输入至少 1 个字符（建议汉字）。</div>';
        return;
      }

      // 与 preview 的布局策略保持一致：最多 7 列，列数只由字符数量决定。
      const cols = Math.min(7, chars.length);
      rootEl.style.setProperty('--multi-cols', String(cols));
      chars.forEach((ch, idx) => createWriterTarget(ch, idx));
    }

    async function playAllSequential() {
      const token = ++sequenceToken;
      cancelAll();
      clearWritingState();

      for (const w of writers) {
        if (token !== sequenceToken) return;
        w.cancelQuiz();
        try {
          w.hideCharacter();
        } catch (_) {}

        await new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };

          const timer = setInterval(() => {
            if (token !== sequenceToken) {
              clearInterval(timer);
              finish();
            }
          }, 50);

          try {
            w.animateCharacter({
              onComplete: () => {
                clearInterval(timer);
                finish();
              }
            });
          } catch (_) {
            clearInterval(timer);
            finish();
          }
        });

        if (token !== sequenceToken) return;
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    async function quizAllSequential() {
      const token = ++sequenceToken;
      cancelAll();
      clearWritingState();

      for (const w of writers) {
        if (token !== sequenceToken) return;
        try {
          w.hideCharacter();
        } catch (_) {}

        await new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };

          const timer = setInterval(() => {
            if (token !== sequenceToken) {
              clearInterval(timer);
              finish();
            }
          }, 50);

          try {
            w.quiz({
              onComplete: () => {
                clearInterval(timer);
                finish();
              }
            });
          } catch (_) {
            clearInterval(timer);
            finish();
          }
        });

        await new Promise((r) => setTimeout(r, 80));
      }
    }

    if (isPractice) {
      btnPlayEl.addEventListener('click', () => playAllSequential());
      btnQuizEl.addEventListener('click', () => quizAllSequential());
    }

    // 初次渲染 + 演示模式默认自动播放
    renderText(hz);
    (async () => {
      await playAllSequential();
    })();

    // 深色模式切换：重渲染并回到演示动画
    let mql = null;
    let onChange = null;
    try {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
      onChange = () => {
        renderText(hz);
        (async () => {
          await playAllSequential();
        })();
      };
      mql.addEventListener('change', onChange);
    } catch (_) {}

    // mount 返回 cleanup：切换 tab / 搜索框刷新时会调用
    return () => {
      ++sequenceToken;
      cancelAll();
      try {
        if (mql && onChange) mql.removeEventListener('change', onChange);
      } catch (_) {}
      container.innerHTML = '';
    };
  };
})();

