const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const WORKER_CANDIDATES = [
  path.join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'),
  path.join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
];
const workerSrcPath = WORKER_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
const workerSrc = workerSrcPath ? pathToFileURL(workerSrcPath).href : null;

let pdfjsLibPromise = null;
function getPdfJsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs')
      .then((module) => {
        const lib = module && module.default ? module.default : module;
        if (lib?.GlobalWorkerOptions && workerSrc) {
          lib.GlobalWorkerOptions.workerSrc = workerSrc;
        }
        return lib;
      })
      .catch((error) => {
        console.error('Failed to load pdfjs-dist module:', error);
        pdfjsLibPromise = null;
        throw error;
      });
  }
  return pdfjsLibPromise;
}

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_PAGE_DURATION_MS = 12000;
const NOOP = () => {};

function safeParseInt(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function resolvePdfPath(relativePath) {
  if (!relativePath) return null;
  if (path.isAbsolute(relativePath)) return relativePath;
  return path.resolve(process.cwd(), relativePath);
}

function createScreensaver({
  overlay,
  canvas,
  debugButton,
  timeout = DEFAULT_TIMEOUT_MS,
  pageDurationMs = DEFAULT_PAGE_DURATION_MS,
  debugMode = false,
  transitionDurationMs = 700,
} = {}) {
  if (!overlay || !canvas) {
    return {
      start: NOOP,
      show: NOOP,
      hide: NOOP,
      reset: NOOP,
      handleActivity: NOOP,
    };
  }

  const overlayDataset = overlay.dataset || {};
  const canvasDataset = canvas.dataset || {};
  const pdfRelativeSrc =
    overlayDataset.baseSrc ||
    overlayDataset.pdfSrc ||
    canvasDataset.baseSrc ||
    canvasDataset.pdfSrc ||
    'screensaver.pdf';
  const pageDurationAttr = overlayDataset.pageDuration || canvasDataset.pageDuration;
  const pageCountOverride = safeParseInt(
    overlayDataset.pageCount || canvasDataset.pageCount,
    null
  );
  const basePageDuration = safeParseInt(pageDurationAttr, pageDurationMs);
  const effectivePageDuration = debugMode ? Math.floor(basePageDuration / 2) : basePageDuration;

  const state = {
    timerId: null,
    active: false,
    tracking: false,
    canvas,
    ctx: canvas.getContext('2d'),
    pdfAbsolutePath: resolvePdfPath(pdfRelativeSrc),
    pdfDocPromise: null,
    pdfDoc: null,
    currentPage: 1,
    pageCount: pageCountOverride || 1,
    pageDuration: Math.max(effectivePageDuration || pageDurationMs, 1000),
    renderQueue: Promise.resolve(),
    autoAdvanceTimeoutId: null,
    bufferCanvas: null,
    bufferCtx: null,
    pageCanvas: null,
    pageCtx: null,
    transitionDuration: transitionDurationMs,
    transitionFrameRequest: null,
    transitionResolve: null,
    transitionToken: 0,
  };

  function ensureBufferCanvas() {
    if (!state.bufferCanvas) {
      state.bufferCanvas = document.createElement('canvas');
      state.bufferCtx = state.bufferCanvas.getContext('2d');
    }
    return state.bufferCtx;
  }

  function ensurePageCanvas() {
    if (!state.pageCanvas) {
      state.pageCanvas = document.createElement('canvas');
      state.pageCtx = state.pageCanvas.getContext('2d');
    }
    return state.pageCtx;
  }

  function syncCanvasSize() {
    const overlayRect = overlay.getBoundingClientRect();
    const targetWidth = Math.max(1, Math.round(overlayRect.width || window.innerWidth || state.canvas.width || 1));
    const targetHeight = Math.max(
      1,
      Math.round(overlayRect.height || window.innerHeight || state.canvas.height || 1)
    );
    if (state.canvas.width !== targetWidth || state.canvas.height !== targetHeight) {
      state.canvas.width = targetWidth;
      state.canvas.height = targetHeight;
      state.canvas.style.width = `${targetWidth}px`;
      state.canvas.style.height = `${targetHeight}px`;
    }
    return { targetWidth, targetHeight };
  }

  function captureCurrentFrame() {
    if (!state.canvas || !state.canvas.width || !state.canvas.height) return null;
    const snapshot = document.createElement('canvas');
    snapshot.width = state.canvas.width;
    snapshot.height = state.canvas.height;
    const snapshotCtx = snapshot.getContext('2d');
    snapshotCtx.drawImage(state.canvas, 0, 0);
    return snapshot;
  }

  function snapshotCanvas(sourceCanvas) {
    if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return null;
    const snapshot = document.createElement('canvas');
    snapshot.width = sourceCanvas.width;
    snapshot.height = sourceCanvas.height;
    const snapshotCtx = snapshot.getContext('2d');
    snapshotCtx.drawImage(sourceCanvas, 0, 0);
    return snapshot;
  }

  function cancelTransitionAnimation() {
    state.transitionToken += 1;
    if (state.transitionFrameRequest) {
      cancelAnimationFrame(state.transitionFrameRequest);
      state.transitionFrameRequest = null;
    }
    if (state.transitionResolve) {
      state.transitionResolve();
      state.transitionResolve = null;
    }
  }

  function drawCompositeFrame(baseFrame, overlayFrame, overlayAlpha = 1) {
    state.ctx.save();
    state.ctx.fillStyle = '#000';
    state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
    if (baseFrame) {
      state.ctx.globalAlpha = 1;
      state.ctx.drawImage(baseFrame, 0, 0, state.canvas.width, state.canvas.height);
    }
    state.ctx.globalAlpha = overlayAlpha;
    state.ctx.drawImage(overlayFrame, 0, 0, state.canvas.width, state.canvas.height);
    state.ctx.restore();
  }

  function applyTransition(prevFrame, nextFrame) {
    cancelTransitionAnimation();
    return new Promise((resolve) => {
      if (!prevFrame || !state.transitionDuration) {
        drawCompositeFrame(null, nextFrame, 1);
        resolve();
        return;
      }
      const duration = state.transitionDuration;
      const transitionToken = state.transitionToken + 1;
      state.transitionToken = transitionToken;
      let startTime = null;
      state.transitionResolve = resolve;
      const step = (now) => {
        if (transitionToken !== state.transitionToken) return;
        if (startTime === null) {
          startTime = now;
        }
        const progress = Math.min((now - startTime) / duration, 1);
        drawCompositeFrame(prevFrame, nextFrame, progress);
        if (progress < 1 && state.active) {
          state.transitionFrameRequest = requestAnimationFrame(step);
        } else {
          state.transitionFrameRequest = null;
          if (state.transitionResolve) {
            state.transitionResolve();
            state.transitionResolve = null;
          }
        }
      };
      if (state.active && state.transitionResolve) {
        state.transitionFrameRequest = requestAnimationFrame(step);
      }
    });
  }

  function ensurePdfDocument() {
    if (!state.pdfAbsolutePath || !state.ctx) return Promise.resolve(null);
    if (!state.pdfDocPromise) {
      state.pdfDocPromise = (async () => {
        const pdfjsLib = await getPdfJsLib();
        if (!pdfjsLib) return null;
        const buffer = await fs.promises.readFile(state.pdfAbsolutePath);
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const doc = await loadingTask.promise;
        state.pdfDoc = doc;
        state.pageCount = doc?.numPages || state.pageCount || 1;
        return doc;
      })().catch((error) => {
        console.error('Failed to load screensaver PDF:', error);
        state.pdfDocPromise = null;
        return null;
      });
    }
    return state.pdfDocPromise;
  }

  function getScaledViewport(page, targetWidth, targetHeight) {
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(targetWidth / baseViewport.width, targetHeight / baseViewport.height) || 1;
    return page.getViewport({ scale });
  }

  async function performRender(pageNumber) {
    if (!state.ctx) return;
    const doc = await ensurePdfDocument();
    if (!doc) return;
    const clampedPage = Math.min(Math.max(pageNumber, 1), doc.numPages);
    const { targetWidth, targetHeight } = syncCanvasSize();
    const prevFrame =
      state.transitionDuration && state.canvas.width && state.canvas.height
        ? captureCurrentFrame()
        : null;
    const page = await doc.getPage(clampedPage);
    state.currentPage = clampedPage;
    const viewport = getScaledViewport(page, targetWidth, targetHeight);
    const pageCtx = ensurePageCanvas();
    const pageCanvas = state.pageCanvas;
    pageCanvas.width = viewport.width;
    pageCanvas.height = viewport.height;
    try {
      await page.render({ canvasContext: pageCtx, viewport }).promise;
    } catch (error) {
      console.error('Failed to render screensaver page:', error);
      return;
    }
    const bufferCtx = ensureBufferCanvas();
    const bufferCanvas = state.bufferCanvas;
    bufferCanvas.width = targetWidth;
    bufferCanvas.height = targetHeight;
    bufferCtx.fillStyle = '#000';
    bufferCtx.fillRect(0, 0, targetWidth, targetHeight);
    const drawX = Math.round((targetWidth - viewport.width) / 2);
    const drawY = Math.round((targetHeight - viewport.height) / 2);
    bufferCtx.drawImage(pageCanvas, drawX, drawY);
    const nextFrame = snapshotCanvas(bufferCanvas);
    await applyTransition(prevFrame, nextFrame || bufferCanvas);
  }

  function renderPage(pageNumber) {
    state.renderQueue = state.renderQueue.then(() => performRender(pageNumber));
    return state.renderQueue;
  }

  function scheduleNextPage() {
    clearTimeout(state.autoAdvanceTimeoutId);
    if (!state.active || !state.pageDuration || state.pageDuration <= 0) return;
    if (!state.pageCount || state.pageCount <= 1) return;
    state.autoAdvanceTimeoutId = setTimeout(() => {
      if (!state.active) return;
      const nextPage = (state.currentPage % state.pageCount) + 1;
      renderPage(nextPage).finally(() => scheduleNextPage());
    }, state.pageDuration);
  }

  function showScreensaver() {
    if (!overlay || state.active) return;
    state.active = true;
    clearTimeout(state.timerId);
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    state.currentPage = 1;
    renderPage(state.currentPage).finally(() => {
      scheduleNextPage();
    });
  }

  function hideScreensaver() {
    if (!overlay || !state.active) return;
    cancelTransitionAnimation();
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
    state.active = false;
    clearTimeout(state.autoAdvanceTimeoutId);
    state.autoAdvanceTimeoutId = null;
    resetTimer();
  }

  function resetTimer() {
    if (!overlay || !state.tracking) return;
    clearTimeout(state.timerId);
    if (state.active) return;
    state.timerId = setTimeout(() => {
      showScreensaver();
    }, timeout);
  }

  function handleScreensaverActivity() {
    if (!overlay || !state.tracking) return;
    if (state.active) {
      hideScreensaver();
      return;
    }
    resetTimer();
  }

  function handleResize() {
    if (!state.active) return;
    renderPage(state.currentPage);
  }

  function attachOverlayEvents() {
    overlay.addEventListener('click', () => {
      hideScreensaver();
    });
    if (debugButton) {
      debugButton.addEventListener('click', (event) => {
        event.preventDefault();
        showScreensaver();
      });
    }
  }

  function attachActivityListeners() {
    const passiveEvents = ['pointermove', 'pointerdown', 'wheel', 'touchstart', 'touchmove'];
    passiveEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleScreensaverActivity, { passive: true });
    });
    window.addEventListener('keydown', handleScreensaverActivity, true);
    window.addEventListener('gamepadconnected', handleScreensaverActivity);
    window.addEventListener('gamepaddisconnected', handleScreensaverActivity);
    window.addEventListener('resize', handleResize);
  }

  function startTracking() {
    if (state.tracking) return;
    state.tracking = true;
    attachOverlayEvents();
    attachActivityListeners();
    resetTimer();
  }

  return {
    start: startTracking,
    show: showScreensaver,
    hide: hideScreensaver,
    reset: resetTimer,
    handleActivity: handleScreensaverActivity,
  };
}

module.exports = createScreensaver;
