// gazeCalibration.js
// Minimal helper lib for WebGazer calibration + gaze input.

let isCalibrating = false;
let calibIndex = 0;
let gamepadPollHandle = null;

// Default calibration points (normalized 0–1 screen coords)
const DEFAULT_CALIB_POINTS = [
  { x: 0.05, y: 0.08 },
  { x: 0.5, y: 0.08 },
  { x: 0.95, y: 0.08 },
  { x: 0.95, y: 0.5 },
  { x: 0.95, y: 0.92 },
  { x: 0.5, y: 0.92 },
  { x: 0.08, y: 0.92 },
  { x: 0.08, y: 0.5 },
  { x: 0.08, y: 0.08 },
  { x: 0.32, y: 0.32 },
  { x: 0.72, y: 0.32 },
  { x: 0.72, y: 0.72 },
  { x: 0.32, y: 0.72 },
  { x: 0.32, y: 0.32 },
  { x: 0.5, y: 0.5 },
];

// --- DOM helpers ---------------------------------------------------------

function createOverlay() {
  let overlay = document.getElementById('gaze-calib-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'gaze-calib-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.6)',
    zIndex: '99999',
  });

  const instr = document.createElement('div');
  instr.id = 'gaze-calib-instructions';
  instr.textContent = 'Look at the dot and press A / Space';
  Object.assign(instr.style, {
    position: 'absolute',
    top: '10%',
    width: '100%',
    textAlign: 'center',
    color: 'white',
    fontFamily: 'sans-serif',
    fontSize: '20px',
  });

  const pathCanvas = document.createElement('canvas');
  pathCanvas.id = 'gaze-calib-path';
  Object.assign(pathCanvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  });

  const dot = document.createElement('div');
  dot.id = 'gaze-calib-dot';
  Object.assign(dot.style, {
    position: 'absolute',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'white',
    boxShadow: '0 0 10px rgba(255, 255, 255, 0.9)',
    transform: 'translate(-50%, -50%)',
  });

  overlay.appendChild(instr);
  overlay.appendChild(pathCanvas);
  overlay.appendChild(dot);
  document.body.appendChild(overlay);

  return overlay;
}

function getDotElement() {
  return document.getElementById('gaze-calib-dot');
}

function getPathCanvas() {
  return document.getElementById('gaze-calib-path');
}

function showOverlay() {
  const overlay = createOverlay();
  overlay.style.display = 'flex';
}

function hideOverlay() {
  const overlay = createOverlay();
  overlay.style.display = 'none';
  clearCalibrationPath();
}

// --- WebGazer init -------------------------------------------------------

export async function initWebGazer(options = {}) {
  const {
    regression = 'ridge',
    tracker = 'clmtrackr',
    applyKalmanFilter = true,
    saveDataAcrossSessions = true,
    showDebugDots = false,
    resetModel = true,
  } = options;

  await webgazer
    .setRegression(regression)
    .setTracker(tracker)
    .applyKalmanFilter(applyKalmanFilter)
    .saveDataAcrossSessions(saveDataAcrossSessions)
    .begin();

  webgazer
    .showVideoPreview(false)
    .showPredictionPoints(showDebugDots)
    .showFaceOverlay(false)
    .showFaceFeedbackBox(false);

  //webgazer.removeMouseEventListeners();
  if (resetModel) {
    await webgazer.clearData();
  }
}

// --- Calibration core ----------------------------------------------------

function setInstructionText(text) {
  const el = document.getElementById('gaze-calib-instructions');
  if (el) {
    el.textContent = text;
  }
}

function setDotPositionNormalized(x, y) {
  const dot = getDotElement();
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const px = Math.min(width * 0.98, Math.max(width * 0.02, x * width));
  const py = Math.min(height * 0.98, Math.max(height * 0.02, y * height));
  dot.style.left = `${px}px`;
  dot.style.top = `${py}px`;
  dot.dataset.x = String(px);
  dot.dataset.y = String(py);
  return { x: px, y: py };
}

function drawCalibrationPath(points) {
  const canvas = getPathCanvas();
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  if (!points || points.length < 2) {
    ctx.restore();
    return;
  }
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([12, 14]);
  ctx.strokeStyle = 'rgba(83, 255, 210, 0.35)';
  ctx.beginPath();
  const clamp = (value, maxVal) => Math.min(maxVal * 0.98, Math.max(maxVal * 0.02, value));
  const first = points[0];
  ctx.moveTo(clamp(first.x * width, width), clamp(first.y * height, height));
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    ctx.lineTo(clamp(p.x * width, width), clamp(p.y * height, height));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(246, 255, 146, 0.5)';
  ctx.beginPath();
  ctx.arc(clamp(first.x * width, width), clamp(first.y * height, height), 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function clearCalibrationPath() {
  const canvas = getPathCanvas();
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// --- Keyboard + gamepad input -------------------------------------------

function startGamepadPolling(startCallback) {
  let lastPressed = false;

  function loop() {
    if (!isCalibrating) {
      gamepadPollHandle = null;
      return;
    }

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let anyPressed = false;

    for (const pad of pads) {
      if (!pad) continue;
      if (pad.buttons[0]?.pressed) {
        anyPressed = true;
        break;
      }
    }

    if (anyPressed && !lastPressed) {
      startCallback();
    }
    lastPressed = anyPressed;

    gamepadPollHandle = requestAnimationFrame(loop);
  }

  gamepadPollHandle = requestAnimationFrame(loop);
}

function stopGamepadPolling() {
  if (gamepadPollHandle != null) {
    cancelAnimationFrame(gamepadPollHandle);
    gamepadPollHandle = null;
  }
}

// --- Public: runCalibration ---------------------------------------------

/**
 * Runs a continuous, slow-moving dot calibration pass. The user presses
 * Space/A once to begin, then follows the dot as it sweeps across the screen.
 *
 * @param {Object} options
 * @param {Array<{x:number,y:number}>} [options.points]
 * @param {number} [options.segmentDuration]
 * @param {number} [options.sampleInterval]
 * @param {boolean} [options.randomizeOffsets]
 * @returns {Promise<void>}  Resolves when calibration is complete
 */
export function runCalibration(options = {}) {
  const {
    points = DEFAULT_CALIB_POINTS,
    segmentDuration = 100,
    sampleInterval = 1,
    randomizeOffsets = false,
    jitterAmount = 0.05,
  } = options;
  const basePath = randomizeOffsets ? jitterPoints(points, jitterAmount) : points;
  const pathPoints = buildSmoothPath(basePath, 24);

  return new Promise((resolve) => {
    if (!pathPoints || pathPoints.length < 2) {
      resolve();
      return;
    }

    isCalibrating = true;
    calibIndex = 0;
    showOverlay();
    drawCalibrationPath(pathPoints);
    const first = pathPoints[0];
    setDotPositionNormalized(first.x, first.y);
    setInstructionText('Dot starts near the top-left. Press Space / A to begin and follow it.');

    let movementStarted = false;
    let animationHandle = null;
    let currentSegment = 0;
    let segmentStartTime = 0;
    let lastSampleTime = 0;

    function cleanup() {
      window.removeEventListener('keydown', keyHandler);
      stopGamepadPolling();
      if (animationHandle) {
        cancelAnimationFrame(animationHandle);
        animationHandle = null;
      }
    }

    function finishFlow() {
      isCalibrating = false;
      cleanup();
      hideOverlay();
      resolve();
    }

    function animationStep(timestamp) {
      if (!isCalibrating) {
        finishFlow();
        return;
      }
      if (currentSegment >= pathPoints.length - 1) {
        finishFlow();
        return;
      }

      if (!segmentStartTime) {
        segmentStartTime = timestamp;
        lastSampleTime = timestamp;
      }

      const start = pathPoints[currentSegment];
      const end = pathPoints[currentSegment + 1];
      const progress = Math.min((timestamp - segmentStartTime) / segmentDuration, 1);
      const x = start.x + (end.x - start.x) * progress;
      const y = start.y + (end.y - start.y) * progress;
      const { x: px, y: py } = setDotPositionNormalized(x, y);

      if (timestamp - lastSampleTime >= sampleInterval) {
        webgazer.recordScreenPosition(px, py, 'click');
        lastSampleTime = timestamp;
      }

      if (progress >= 1) {
        currentSegment += 1;
        segmentStartTime = timestamp;
        if (currentSegment >= pathPoints.length - 1) {
          webgazer.recordScreenPosition(px, py, 'click');
          finishFlow();
          return;
        }
      }

      animationHandle = requestAnimationFrame(animationStep);
    }

    function beginMovement() {
      if (movementStarted || !isCalibrating) return;
      movementStarted = true;
      setInstructionText('Keep following the moving dot along the highlighted path.');
      segmentStartTime = 0;
      animationHandle = requestAnimationFrame(animationStep);
    }

    function keyHandler(event) {
      if (!isCalibrating) return;
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        beginMovement();
      }
    }

    window.addEventListener('keydown', keyHandler);
    startGamepadPolling(beginMovement);
  });
}

// --- Public: start gaze listener ----------------------------------------

/**
 * Starts a simple gaze listener.
 *
 * @param {(x:number, y:number, elapsedMs:number) => void} callback
 */
export function startGazeListener(callback) {
  webgazer.setGazeListener((data, elapsedTime) => {
    if (!data) return;
    callback(data.x, data.y, elapsedTime);
  });
}

/**
 * Optional helper to clear WebGazer data (e.g. between players).
 */
export function resetGazeModel() {
  webgazer.clearData();
}
function jitterPoints(points, jitterAmount = 0.04) {
  const clamp = (value) => Math.min(0.98, Math.max(0.02, value));
  return points.map((point) => {
    const offsetX = (Math.random() * 2 - 1) * jitterAmount;
    const offsetY = (Math.random() * 2 - 1) * jitterAmount;
    return {
      x: clamp(point.x + offsetX),
      y: clamp(point.y + offsetY),
    };
  });
}

function catmullRomInterpolate(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function buildSmoothPath(points, subdivisions = 24) {
  if (!points || points.length < 2) return points || [];
  const smooth = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    for (let step = 0; step < subdivisions; step += 1) {
      const t = step / subdivisions;
      smooth.push(catmullRomInterpolate(p0, p1, p2, p3, t));
    }
  }
  smooth.push(points[points.length - 1]);
  return smooth;
}
