const THREE = require('three');
const constants = require('./renderer/modules/constants');
const dom = require('./renderer/modules/dom');
const sceneSetup = require('./renderer/modules/scene');
let gazeModulePromise = null;
function loadGazeModule() {
  if (!gazeModulePromise) {
    gazeModulePromise = import('./lib/gazeCalibration.mjs');
  }
  return gazeModulePromise;
}

const {
  ARENA_RADIUS,
  ROBOT_SPEED,
  MOVE_ACCEL,
  MOVE_DAMPING,
  ROTATE_SPEED,
  ROTATE_ACCEL,
  ROTATE_DAMPING,
  ROBOT_COLLISION_RADIUS,
  COLLISION_DISTANCE,
  ROUND_LIMIT,
  WIN_SCORE,
  GAME2_ARENA_RADIUS,
  TURRET_LIMIT,
  DRIVER_CAMERA_HEIGHT,
  DRIVER_CAMERA_DISTANCE,
  DRIVER_FOV,
  MAIN_CAMERA_MARGIN,
  ARENA_BOUNDARY_PADDING,
  RIM_HALF_WIDTH,
  FLOOR_TEXTURE_SIZE,
  GAME2_DRIVER_SPEED,
  GAME2_ROTATE_SPEED,
  GAME2_TURRET_SPEED,
  GAME2_FIRE_RATE,
  GAME2_ENEMY_SPEED,
  GAME2_SPAWN_MIN,
  GAME2_SPAWN_MAX,
  GAME2_SPAWN_RADIUS,
  GAME2_BULLET_LIMIT,
} = constants;

const {
  hitFlash,
  centerMessage,
  p1ScoreEl,
  p2ScoreEl,
  roundInfoEl,
  menuOverlay,
  menuPanels,
  allMenuButtons,
  aiToggleLabel,
  aiDifficultyLabel,
  aiDriverLabel,
  aiTurretLabel,
  aiIndicator,
  startMenu,
  startMenuButtons,
  gazePaddleButton,
  controlBlocks,
  gazePanel,
  gazeStatus,
  gazeCoords,
  gazePointer,
  gazePaddleCanvas,
  gazeRunnerButton,
  loadGazeCalibrationButton,
} = dom;
const gazePaddleCtx = gazePaddleCanvas ? gazePaddleCanvas.getContext('2d') : null;

const {
  renderer,
  scene,
  camera,
  turretCamera,
  cameraBasePosition,
  arenaSurface,
  glowingRim,
  shooterRim,
  floorMaterial,
  shooterGrid,
} = sceneSetup;

let menuButtons = Array.from(menuOverlay.querySelectorAll('.menu-panel-content.active button'));
let menuIndex = 0;
let menuMode = 'main';
let startMenuIndex = 0;
let startMenuVisible = true;
let currentGame = null;
const colorHelper = new THREE.Color();
const aiDiff = new THREE.Vector2();
const aiMoveTarget = new THREE.Vector2();
const aiMoveCommand = new THREE.Vector2();
const driverCameraForward = new THREE.Vector3();
const driverCameraOffset = new THREE.Vector3();
const driverCameraLookTarget = new THREE.Vector3();
const game2ForwardVec = new THREE.Vector2();
const game2RightVec = new THREE.Vector2();
const game2DesiredVelocity = new THREE.Vector2();
const game2TargetVelocity = new THREE.Vector2();
const AI_DIFFICULTIES = [
  {
    id: 'easy',
    label: 'EASY',
    moveSpeed: 0.55,
    rotateSpeedFactor: 0.65,
    angleThreshold: 0.38,
    retreatDistance: 3.6,
    chaseBoostDistance: 9,
    jitter: 0.35,
  },
  {
    id: 'normal',
    label: 'NORMAL',
    moveSpeed: 0.85,
    rotateSpeedFactor: 0.9,
    angleThreshold: 0.25,
    retreatDistance: 2.8,
    chaseBoostDistance: 10.5,
    jitter: 0.15,
  },
  {
    id: 'hard',
    label: 'HARD',
    moveSpeed: 1,
    rotateSpeedFactor: 1,
    angleThreshold: 0.12,
    retreatDistance: 2.4,
    chaseBoostDistance: 11.5,
    jitter: 0,
  },
];

const hitRings = [];
let menuOpen = false;
let aiEnabled = false;
let aiDifficultyIndex = 1;
const game2AIState = { driver: false, turret: false };
const gazeGameState = {
  active: false,
  initializing: false,
  calibrating: false,
  listenerAttached: false,
  sessionId: 0,
  readyForPaddle: false,
  readyForRunner: false,
  targetX: 0.5,
  useSavedCalibration: false,
};
const GAZE_CALIBRATION_ENABLED = false;
const gazePaddleState = {
  active: false,
  width: 640,
  height: 360,
  paddleX: 0.5,
  targetX: 0.5,
  paddleWidth: 180,
  basePaddleWidth: 180,
  paddleGrowthPerPoint: 6,
  maxPaddleWidth: 260,
  paddleHeight: 16,
  ballRadius: 14,
  ballX: 260,
  ballY: 150,
  ballVX: 90,
  ballVY: 120,
  baseSpeed: 100,
  score: 0,
  misses: 0,
  canvasVisible: false,
};
const laneRunnerState = {
  active: false,
  robot: null,
  track: null,
  laneLines: [],
  lanePositions: [],
  laneCount: 4,
  laneSpan: 60,
  laneWidth: 8,
  laneLeftEdge: -16,
  currentLaneIndex: 1,
  targetLaneIndex: 1,
  distance: 0,
  speed: 16,
  lives: 3,
  obstacles: [],
  spawnTimer: 1.2,
  startTimestamp: 0,
  endTimeout: null,
  laneSwitchTimer: 0,
  lastLaneCandidate: 0,
};
let webGazerInitialized = false;
let gazeInitPromise = null;
let gazeSessionCounter = 0;

function createRobot(colorHex, bumperHex) {
  const group = new THREE.Group();

  const color = new THREE.Color(colorHex);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3, 1.1, 3),
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.4,
      roughness: 0.35,
      emissive: color.clone().multiplyScalar(0.35),
      emissiveIntensity: 1,
    })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const bumper = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.4, 0.45),
    new THREE.MeshStandardMaterial({
      color: bumperHex,
      emissive: bumperHex,
      emissiveIntensity: 1,
    })
  );
  bumper.position.set(0, -0.2, 1.55);
  group.add(bumper);

  const frontArrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.8, 12),
    new THREE.MeshStandardMaterial({ color: bumperHex, emissive: bumperHex })
  );
  frontArrow.rotation.x = Math.PI / 2;
  frontArrow.position.set(0, 0.7, 1.95);
  group.add(frontArrow);
  group.userData.directionIndicator = frontArrow;

  return group;
}

const players = [
  {
    id: 'P1',
    color: 0x36f0ff,
    bumper: 0xf6ff92,
    controls: {
      up: 'w',
      down: 's',
      left: 'a',
      right: 'd',
      rotateLeft: 'q',
      rotateRight: 'e',
    },
    startPosition: new THREE.Vector3(-6, 0, 0),
    startRotation: Math.PI / 2,
    scoreEl: p1ScoreEl,
  },
  {
    id: 'P2',
    color: 0xff5ad8,
    bumper: 0xffc0ff,
    controls: {
      up: 'i',
      down: 'k',
      left: 'j',
      right: 'l',
      rotateLeft: 'u',
      rotateRight: 'o',
    },
    startPosition: new THREE.Vector3(6, 0, 0),
    startRotation: -Math.PI / 2,
    scoreEl: p2ScoreEl,
  },
];

players.forEach((player) => {
  const robot = createRobot(player.color, player.bumper);
  scene.add(robot);
  player.robot = robot;
  player.score = 0;
  player.velocity = new THREE.Vector2();
  player.angularVelocity = 0;
  player.isAI = false;
});

setAIEnabled(false);
updateGame2AIUI();

function clampToArena(group, radius = ARENA_RADIUS) {
  const pos = new THREE.Vector2(group.position.x, group.position.z);
  const limit = Math.max(radius - ARENA_BOUNDARY_PADDING, 0.1);
  if (pos.length() > limit) {
    pos.setLength(limit);
    group.position.x = pos.x;
    group.position.z = pos.y;
  }
}

const keys = {};

function refreshMenuButtons() {
  menuButtons = Array.from(menuOverlay.querySelectorAll('.menu-panel-content.active button'));
}

function clearMovementInputs() {
  Object.keys(keys).forEach((key) => {
    keys[key] = false;
  });
}

function applyMenuFocus() {
  if (!menuOpen) return;
  if (!menuButtons.length) return;
  allMenuButtons.forEach((btn) => btn.classList.remove('menu-focus'));
  const button = menuButtons[menuIndex];
  if (button && !button.disabled) {
    button.classList.add('menu-focus');
    button.focus();
  }
}

function getNextMenuIndex(startIndex, direction) {
  const total = menuButtons.length;
  if (total === 0) return -1;
  let idx = startIndex;
  for (let i = 0; i < total; i += 1) {
    idx = (idx + direction + total) % total;
    if (!menuButtons[idx].disabled) {
      return idx;
    }
  }
  return startIndex;
}

function ensureMenuIndexValid() {
  if (!menuButtons.length) return;
  if (!menuButtons[menuIndex] || menuButtons[menuIndex].disabled) {
    const next = getNextMenuIndex(menuIndex, 1);
    if (next !== -1) {
      menuIndex = next;
    }
  }
}

function moveMenuFocus(direction) {
  const next = getNextMenuIndex(menuIndex, direction);
  if (next !== -1) {
    menuIndex = next;
    applyMenuFocus();
  }
}

function setMenuMode(mode, { resetIndex = false, focus = menuOpen } = {}) {
  menuMode = mode;
  menuPanels.forEach((panel) => {
    const isActive = panel.dataset.panel === mode;
    panel.classList.toggle('active', isActive);
  });
  refreshMenuButtons();
  if (resetIndex) {
    const firstEnabled = menuButtons.findIndex((btn) => !btn.disabled);
    menuIndex = firstEnabled === -1 ? 0 : firstEnabled;
  } else {
    ensureMenuIndexValid();
  }
  if (focus && menuOpen) {
    applyMenuFocus();
  }
}

const menuActions = {
  resume: () => closeMenu(),
  reset: () => {
    closeMenu();
    startRound({ resetScores: true });
  },
  'settings-open': () => {
    setMenuMode('settings', { resetIndex: true, focus: true });
  },
  'settings-back': () => {
    setMenuMode('main', { resetIndex: true, focus: true });
  },
  'toggle-ai': () => toggleAI(),
  'cycle-ai-difficulty': (direction = 1) => cycleAIDifficulty(direction || 1),
  'toggle-game2-ai-driver': () => toggleGame2AIDriver(),
  'toggle-game2-ai-turret': () => toggleGame2AITurret(),
  'game-select': () => showStartMenu(),
  exit: () => window.close(),
};

function runMenuAction(action, payload) {
  const handler = menuActions[action];
  if (handler) {
    handler(payload);
  }
}

function activateMenuSelection() {
  const button = menuButtons[menuIndex];
  if (button && !button.disabled) {
    runMenuAction(button.dataset.action);
  }
}

function openMenu() {
  if (menuOpen) return;
  menuOpen = true;
  setMenuMode('main', { resetIndex: true, focus: false });
  applyMenuFocus();
  menuOverlay.classList.add('visible');
  clearMovementInputs();
  refreshGazePaddleCanvas();
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  menuOverlay.classList.remove('visible');
  allMenuButtons.forEach((btn) => btn.classList.remove('menu-focus'));
  setMenuMode('main', { resetIndex: true, focus: false });
  clearMovementInputs();
  refreshGazePaddleCanvas();
}

function toggleMenu() {
  if (menuOpen) {
    closeMenu();
  } else {
    openMenu();
  }
}

function handleMenuNavigation(event) {
  const key = event.key.toLowerCase();
  if (key === 'arrowup' || key === 'w') {
    moveMenuFocus(-1);
    return true;
  }
  if (key === 'arrowdown' || key === 's') {
    moveMenuFocus(1);
    return true;
  }
  const focusedButton = menuButtons[menuIndex];
  if ((key === 'arrowleft' || key === 'arrowright') && focusedButton) {
    const direction = key === 'arrowleft' ? -1 : 1;
    const action = focusedButton.dataset.action;
    if (
      action === 'toggle-ai' ||
      action === 'toggle-game2-ai-driver' ||
      action === 'toggle-game2-ai-turret'
    ) {
      runMenuAction(action);
      return true;
    }
    if (action === 'cycle-ai-difficulty') {
      runMenuAction('cycle-ai-difficulty', direction);
      return true;
    }
  }
  if (key === 'enter' || key === ' ') {
    activateMenuSelection();
    return true;
  }
  return false;
}

allMenuButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const activeIndex = menuButtons.indexOf(button);
    if (activeIndex !== -1) {
      menuIndex = activeIndex;
      applyMenuFocus();
    }
    runMenuAction(button.dataset.action);
  });
});

startMenuButtons.forEach((button, index) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    startMenuIndex = index;
    selectGame(button.dataset.game);
  });
});

if (loadGazeCalibrationButton) {
  loadGazeCalibrationButton.addEventListener('click', (event) => {
    event.preventDefault();
    gazeGameState.useSavedCalibration = true;
    selectGame('gaze');
  });
}

window.addEventListener('keydown', (event) => {
  if (startMenuVisible) {
    if (handleStartMenuKeydown(event)) {
      return;
    }
    return;
  }

  if (event.key === 'Escape') {
    toggleMenu();
    event.preventDefault();
    return;
  }

  if (menuOpen) {
    if (handleMenuNavigation(event)) {
      event.preventDefault();
    }
    return;
  }

  const key = event.key.toLowerCase();
  if (currentGame === 'gaze' && key === 'r') {
    requestGazeRecalibration();
    event.preventDefault();
    return;
  }
  keys[key] = true;
  const p1Keys = Object.values(players[0].controls);
  const p2Keys = Object.values(players[1].controls);
  if (p1Keys.includes(key) || p2Keys.includes(key)) {
    event.preventDefault();
  }
});

window.addEventListener('keyup', (event) => {
  if (menuOpen || startMenuVisible) return;
  keys[event.key.toLowerCase()] = false;
});

function getCurrentAIDifficulty() {
  return AI_DIFFICULTIES[aiDifficultyIndex] || AI_DIFFICULTIES[0];
}

function updateAIUI() {
  const difficulty = getCurrentAIDifficulty();
  if (aiToggleLabel) {
    aiToggleLabel.textContent = aiEnabled ? 'ON' : 'OFF';
  }
  if (aiDifficultyLabel) {
    aiDifficultyLabel.textContent = difficulty.label;
  }
  if (aiIndicator) {
    if (currentGame === 'shooter') {
      aiIndicator.textContent = '';
      aiIndicator.classList.remove('active');
    } else if (currentGame === 'gaze') {
      let label = 'GAZE MODE — IDLE';
      if (gazeGameState.initializing) {
        label = 'GAZE MODE — INITIALIZING';
      } else if (gazeGameState.calibrating) {
        label = 'GAZE MODE — CALIBRATING';
      } else if (gazeGameState.active) {
        label = 'GAZE MODE — TRACKING';
      }
      aiIndicator.textContent = label;
      aiIndicator.classList.add('active');
    } else if (currentGame === 'gazePaddle') {
      aiIndicator.textContent = 'GAZE PADDLE TEST MODE';
      aiIndicator.classList.add('active');
    } else if (currentGame === 'gazeRunner') {
      aiIndicator.textContent = 'GAZE LANE RUNNER';
      aiIndicator.classList.add('active');
    } else {
      aiIndicator.textContent = aiEnabled
        ? `P2 MODE — AI BOT (${difficulty.label})`
        : 'P2 MODE — HUMAN';
      aiIndicator.classList.toggle('active', aiEnabled);
    }
  }
}

function setAIDifficultyIndex(index) {
  const length = AI_DIFFICULTIES.length;
  aiDifficultyIndex = ((index % length) + length) % length;
  updateAIUI();
}

function cycleAIDifficulty(direction = 1) {
  setAIDifficultyIndex(aiDifficultyIndex + direction);
}

function setAIEnabled(enabled) {
  aiEnabled = enabled;
  const aiPlayer = players[1];
  if (aiPlayer) {
    aiPlayer.isAI = enabled;
    aiPlayer.velocity.set(0, 0);
    aiPlayer.angularVelocity = 0;
  }
  updateAIUI();
}

function toggleAI() {
  setAIEnabled(!aiEnabled);
}

function updateGame2AIUI() {
  if (aiDriverLabel) {
    aiDriverLabel.textContent = game2AIState.driver ? 'ON' : 'OFF';
  }
  if (aiTurretLabel) {
    aiTurretLabel.textContent = game2AIState.turret ? 'ON' : 'OFF';
  }
}

function setGame2AIDriver(enabled) {
  game2AIState.driver = enabled;
  clearMovementInputs();
  updateGame2AIUI();
}

function setGame2AITurret(enabled) {
  game2AIState.turret = enabled;
  keys[game2GunnerControls.rotateLeft] = false;
  keys[game2GunnerControls.rotateRight] = false;
  keys[game2GunnerControls.fire] = false;
  updateGame2AIUI();
}

function toggleGame2AIDriver() {
  setGame2AIDriver(!game2AIState.driver);
}

function toggleGame2AITurret() {
  setGame2AITurret(!game2AIState.turret);
}

let currentRound = 1;
let roundActive = false;
let nextRoundTimeout = null;
let matchResetTimeout = null;
let shakeTime = 0;

function setScoreboardText(left, center, right) {
  p1ScoreEl.textContent = left;
  roundInfoEl.textContent = center;
  p2ScoreEl.textContent = right;
}

function updateGazePaddleButton() {
  if (!gazePaddleButton) return;
  const enabled = !!gazeGameState.readyForPaddle;
  gazePaddleButton.disabled = !enabled;
  gazePaddleButton.textContent = enabled ? 'Gaze Paddle Test' : 'Gaze Paddle Test (calibrate first)';
}

function updateGazeRunnerButton() {
  if (!gazeRunnerButton) return;
  const enabled = !!gazeGameState.readyForRunner;
  gazeRunnerButton.disabled = !enabled;
  gazeRunnerButton.textContent = enabled ? 'Gaze Lane Runner' : 'Gaze Lane Runner (calibrate first)';
}

function showGazePanel() {
  if (gazePanel) {
    gazePanel.classList.remove('hidden');
  }
}

function hideGazePanel() {
  if (gazePanel) {
    gazePanel.classList.add('hidden');
  }
}

function setGazeStatusText(text) {
  if (gazeStatus) {
    gazeStatus.textContent = text;
  }
}

function setGazeCoordsText(x, y) {
  if (!gazeCoords) return;
  if (typeof x !== 'number' || typeof y !== 'number') {
    gazeCoords.textContent = 'x: ---, y: ---';
    return;
  }
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const pctX = Math.min(100, Math.max(0, (x / width) * 100));
  const pctY = Math.min(100, Math.max(0, (y / height) * 100));
  gazeCoords.textContent = `x: ${Math.round(x)} (${pctX.toFixed(1)}%) · y: ${Math.round(y)} (${pctY.toFixed(1)}%)`;
}

function refreshGazePaddleCanvas() {
  if (!gazePaddleCanvas) return;
  const shouldShow =
    gazePaddleState.canvasVisible && gazePaddleState.active && !menuOpen && !startMenuVisible;
  gazePaddleCanvas.classList.toggle('active', shouldShow);
}

function showGazePaddleCanvas(visible) {
  gazePaddleState.canvasVisible = visible;
  refreshGazePaddleCanvas();
}

function updatePaddleWidthForScore() {
  const baseWidth = gazePaddleState.basePaddleWidth || gazePaddleState.paddleWidth;
  const growthPerPoint =
    gazePaddleState.paddleGrowthPerPoint != null ? gazePaddleState.paddleGrowthPerPoint : 0;
  const maxWidth =
    gazePaddleState.maxPaddleWidth || Math.max(baseWidth, gazePaddleState.paddleWidth);
  const score = Math.max(0, gazePaddleState.score || 0);
  const targetWidth = Math.min(maxWidth, baseWidth + score * growthPerPoint);
  gazePaddleState.paddleWidth = targetWidth;
}

function updateGazePaddleDimensions({ preserveState = false } = {}) {
  if (!gazePaddleCanvas) return;
  const previousWidth = gazePaddleState.width;
  const previousHeight = gazePaddleState.height;

  const aspect = 16 / 9;
  const maxWidth = Math.max(560, Math.min(window.innerWidth * 0.9, 1400));
  const maxHeight = Math.max(320, Math.min(window.innerHeight * 0.8, 900));
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  width = Math.round(width);
  height = Math.round(height);
  const widthRatio = previousWidth ? width / previousWidth : 1;
  const heightRatio = previousHeight ? height / previousHeight : 1;

  gazePaddleState.width = width;
  gazePaddleState.height = height;
  gazePaddleCanvas.width = width;
  gazePaddleCanvas.height = height;
  gazePaddleCanvas.style.width = `${width}px`;
  gazePaddleCanvas.style.height = `${height}px`;

  const newPaddleWidth = Math.round(width * 0.28);
  const newPaddleHeight = Math.round(height * 0.05);
  const newBallRadius = Math.max(12, Math.round(height * 0.035));
  gazePaddleState.basePaddleWidth = newPaddleWidth;
  gazePaddleState.paddleGrowthPerPoint = Math.max(1, Math.round(newPaddleWidth * 0.03));
  gazePaddleState.maxPaddleWidth = Math.round(width * 0.5);
  updatePaddleWidthForScore();
  gazePaddleState.paddleHeight = newPaddleHeight;
  gazePaddleState.ballRadius = newBallRadius;
  gazePaddleState.baseSpeed = Math.round(width * 0.18);

  if (preserveState && gazePaddleState.active && previousWidth && previousHeight) {
    gazePaddleState.ballX = Math.min(
      width - newBallRadius,
      Math.max(newBallRadius, gazePaddleState.ballX * widthRatio)
    );
    gazePaddleState.ballY = Math.min(
      height - newBallRadius,
      Math.max(newBallRadius, gazePaddleState.ballY * heightRatio)
    );
    gazePaddleState.ballVX *= widthRatio;
    gazePaddleState.ballVY *= heightRatio;
  }
}

function computeLaneRunnerLanes() {
  const span = laneRunnerState.laneSpan;
  const count = laneRunnerState.laneCount;
  laneRunnerState.laneWidth = span / count;
  laneRunnerState.laneLeftEdge = -span / 2;
  laneRunnerState.lanePositions.length = 0;
  for (let i = 0; i < count; i += 1) {
    laneRunnerState.lanePositions.push(
      laneRunnerState.laneLeftEdge + laneRunnerState.laneWidth * (i + 0.5)
    );
  }
}

function resetGazePaddleBall() {
  gazePaddleState.ballX = gazePaddleState.width / 2;
  gazePaddleState.ballY = gazePaddleState.height * 0.35;
  const angle = THREE.MathUtils.randFloat(-0.85, 0.85);
  const speed = gazePaddleState.baseSpeed + gazePaddleState.score * 12;
  gazePaddleState.ballVX = Math.sin(angle) * speed;
  gazePaddleState.ballVY = Math.abs(Math.cos(angle) * speed);
}

function cleanupGazePaddle() {
  gazePaddleState.active = false;
  gazeGameState.active = false;
  showGazePaddleCanvas(false);
  if (gazePaddleCtx) {
    gazePaddleCtx.clearRect(0, 0, gazePaddleState.width, gazePaddleState.height);
  }
}

function updateGazePointerPosition(x, y) {
  if (!gazePointer) return;
  if (typeof x !== 'number' || typeof y !== 'number') {
    gazePointer.style.opacity = '0';
    return;
  }
  const clampedX = Math.max(0, Math.min(window.innerWidth, x));
  const clampedY = Math.max(0, Math.min(window.innerHeight, y));
  gazePointer.style.left = `${clampedX}px`;
  gazePointer.style.top = `${clampedY}px`;
  gazePointer.style.opacity = '1';
}

function resetGazePanel() {
  setGazeStatusText('GAZE MODE — IDLE');
  setGazeCoordsText(null, null);
  hideGazePanel();
  updateGazePointerPosition(null, null);
}

function handleGazeError(message, error) {
  if (error) {
    console.error('[Gaze Game]', error);
  }
  gazeGameState.active = false;
  gazeGameState.calibrating = false;
  setScoreboardText('GAZE CALIBRATION', 'ERROR', '');
  setGazeStatusText('GAZE MODE — ERROR');
  showCenterMessage(message, 0);
  updateGazePointerPosition(null, null);
  updateAIUI();
}

function updateScoreboard() {
  if (currentGame !== 'joust') return;
  setScoreboardText(
    `PLAYER 1 — ${players[0].score}`,
    `ROUND ${currentRound} / ${ROUND_LIMIT}`,
    `PLAYER 2 — ${players[1].score}`
  );
}

function showCenterMessage(message, duration = 1200) {
  centerMessage.textContent = message;
  if (duration > 0) {
    setTimeout(() => {
      if (centerMessage.textContent === message) {
        centerMessage.textContent = '';
      }
    }, duration);
  }
}

function pulseScore(element) {
  if (!element) return;
  element.classList.add('scored');
  setTimeout(() => {
    element.classList.remove('scored');
  }, 600);
}

function highlightStartButton() {
  if (!startMenuButtons.length) return;
  startMenuButtons.forEach((button) => button.classList.remove('menu-focus'));
  const button = startMenuButtons[startMenuIndex];
  if (button) {
    button.classList.add('menu-focus');
    button.focus();
  }
}

function updateControlHints(mode) {
  if (!controlBlocks.length) return;
  if (mode === 'shooter') {
    controlBlocks[0].innerHTML = `<span>Driver</span>Move: W A S D · Rotate: Q / E`;
    controlBlocks[1].innerHTML = `<span>Gunner</span>Rotate turret: J / L · Fire: I`;
  } else if (mode === 'gaze') {
    controlBlocks[0].innerHTML = `<span>Gaze Calibration</span>Allow webcam access, follow the dots, tap Space / A`;
    controlBlocks[1].innerHTML = `<span>Prediction Output</span>Move your eyes to see live X/Y updates · Press R to recalibrate`;
  } else if (mode === 'gazePaddle') {
    controlBlocks[0].innerHTML = `<span>Gaze Paddle</span>Look left/right to move the paddle · keep the glowing ball in play`;
    controlBlocks[1].innerHTML = `<span>Tips</span>Stay relaxed · fix your head · press ESC to exit or R in calibration mode`;
  } else if (mode === 'gazeRunner') {
    controlBlocks[0].innerHTML = `<span>Gaze Lane Runner</span>Shift your gaze toward a lane to switch · avoid incoming robots`;
    controlBlocks[1].innerHTML = `<span>Tips</span>Keep your head still · use wide gaze motions · ESC to pause`;
  } else {
    controlBlocks[0].innerHTML = `<span>P1 (Neon Cyan)</span>Move: W A S D · Rotate: Q / E`;
    controlBlocks[1].innerHTML = `<span>P2 (Neon Magenta)</span>Move: I J K L · Rotate: U / O`;
  }
}

function handleStartMenuKeydown(event) {
  const key = event.key.toLowerCase();
  if (key === 'arrowup' || key === 'w') {
    startMenuIndex = (startMenuIndex - 1 + startMenuButtons.length) % startMenuButtons.length;
    highlightStartButton();
    event.preventDefault();
    return true;
  }
  if (key === 'arrowdown' || key === 's') {
    startMenuIndex = (startMenuIndex + 1) % startMenuButtons.length;
    highlightStartButton();
    event.preventDefault();
    return true;
  }
  if (key === 'enter' || key === ' ') {
    const button = startMenuButtons[startMenuIndex];
    if (button) {
      selectGame(button.dataset.game);
      event.preventDefault();
      return true;
    }
  }
  return false;
}

function applyVisualMode(gameKey) {
  const isShooter = gameKey === 'shooter';
  shooterGrid.visible = isShooter;
  floorMaterial.opacity = isShooter ? 0.25 : 0.65;
  arenaSurface.visible = !isShooter;
  glowingRim.visible = !isShooter;
  shooterRim.visible = isShooter;
}

function ensureWebGazerReady({ useSavedCalibration = false } = {}) {
  if (webGazerInitialized) {
    return Promise.resolve();
  }
  if (gazeInitPromise) {
    return gazeInitPromise;
  }
  gazeGameState.initializing = true;
  updateAIUI();
  const resetModel = !useSavedCalibration;
  gazeInitPromise = loadGazeModule()
    .then(({ initWebGazer }) =>
      initWebGazer({
        regression: 'ridge',
        tracker: 'clmtrackr',
        applyKalmanFilter: true,
        saveDataAcrossSessions: true,
        showDebugDots: false,
        resetModel,
      })
    )
    .then(() => {
      webGazerInitialized = true;
    })
    .finally(() => {
      gazeGameState.initializing = false;
      gazeInitPromise = null;
    });
  return gazeInitPromise;
}

async function ensureGazeListener() {
  if (gazeGameState.listenerAttached) return;
  const { startGazeListener } = await loadGazeModule();
  startGazeListener((x, y) => {
    if (!gazeGameState.active) return;
    const width = Math.max(window.innerWidth, 1);
    const normalizedX = THREE.MathUtils.clamp(x / width, 0, 1);
    gazeGameState.targetX = normalizedX;
    if (currentGame === 'gaze') {
      setGazeCoordsText(x, y);
      updateGazePointerPosition(x, y);
    } else if (currentGame === 'gazePaddle') {
      gazePaddleState.targetX = normalizedX;
    }
  });
  gazeGameState.listenerAttached = true;
}

async function runGazeCalibrationStep({ sessionId, randomizeOffsets = false } = {}) {
  if (gazeGameState.sessionId !== sessionId) return false;
  gazeGameState.calibrating = true;
  const statusLabel = randomizeOffsets ? 'RECALIBRATING' : 'CALIBRATING';
  const centerLabel = randomizeOffsets
    ? 'Recalibration: follow shifted dots + tap Space / A'
    : 'Look at each dot + press Space / A';
  setGazeStatusText(`GAZE MODE — ${statusLabel}`);
  setScoreboardText('GAZE CALIBRATION', statusLabel, '');
  showCenterMessage(centerLabel, 0);
  setGazeCoordsText(null, null);
  updateGazePointerPosition(null, null);
  updateAIUI();
  try {
    const { runCalibration } = await loadGazeModule();
    await runCalibration({ randomizeOffsets });
  } catch (error) {
    if (gazeGameState.sessionId === sessionId && currentGame === 'gaze') {
      handleGazeError(
        randomizeOffsets ? 'Recalibration interrupted' : 'Calibration interrupted',
        error
      );
    }
    return false;
  } finally {
    gazeGameState.calibrating = false;
  }
  if (gazeGameState.sessionId !== sessionId || currentGame !== 'gaze') {
    return false;
  }
  return true;
}

function cleanupGazeGame() {
  gazeGameState.active = false;
  gazeGameState.calibrating = false;
  gazeGameState.initializing = false;
  gazeGameState.sessionId = null;
  resetGazePanel();
  updateAIUI();
}

async function initGazeGame() {
  cleanupGame1();
  cleanupGame2();
  const sessionId = ++gazeSessionCounter;
  gazeGameState.sessionId = sessionId;
  const useSavedCalibration = !!gazeGameState.useSavedCalibration;
  gazeGameState.useSavedCalibration = false;
  showGazePanel();
  const statusLabel = useSavedCalibration ? 'LOADING SAVED CALIBRATION' : 'INITIALIZING';
  setGazeStatusText(`GAZE MODE — ${statusLabel}`);
  setGazeCoordsText(null, null);
  resetMainCamera();
  setScoreboardText('GAZE CALIBRATION', statusLabel, '');
  const initMessage = useSavedCalibration
    ? 'Loading saved calibration profile for debug testing'
    : 'Allow webcam access to begin';
  showCenterMessage(initMessage, 0);
  gazeGameState.active = false;
  gazeGameState.calibrating = false;
  updateAIUI();

  try {
    await ensureWebGazerReady({ useSavedCalibration });
  } catch (error) {
    if (gazeGameState.sessionId === sessionId && currentGame === 'gaze') {
      handleGazeError('Camera access failed', error);
    }
    return;
  }

  if (gazeGameState.sessionId !== sessionId || currentGame !== 'gaze') return;

  if (GAZE_CALIBRATION_ENABLED) {
    const calibrationSuccess = await runGazeCalibrationStep({ sessionId, randomizeOffsets: false });
    if (!calibrationSuccess) return;
    if (gazeGameState.sessionId !== sessionId || currentGame !== 'gaze') return;
    gazeGameState.active = true;
    gazeGameState.readyForPaddle = true;
    gazeGameState.readyForRunner = true;
    updateGazePaddleButton();
    updateGazeRunnerButton();
    setGazeStatusText('GAZE MODE — TRACKING');
    setScoreboardText('GAZE CALIBRATION', 'TRACKING', '');
    showCenterMessage('Tracking active — press R to recalibrate', 0);
    setGazeCoordsText(null, null);
    await ensureGazeListener();
    updateAIUI();
    return;
  }

  // Calibration disabled for testing
  gazeGameState.active = true;
  gazeGameState.readyForPaddle = true;
  gazeGameState.readyForRunner = true;
  updateGazePaddleButton();
  updateGazeRunnerButton();
  setGazeStatusText('GAZE MODE — TESTING');
  setScoreboardText('GAZE CALIBRATION', 'TEST MODE', '');
  showCenterMessage('Calibration disabled — tracking running in test mode', 0);
  setGazeCoordsText(null, null);
  await ensureGazeListener();
  updateAIUI();
}

async function requestGazeRecalibration() {
  if (currentGame !== 'gaze') return;
  if (gazeGameState.calibrating) return;
  if (!gazeGameState.active) return;
  if (!GAZE_CALIBRATION_ENABLED) {
    showCenterMessage('Calibration is temporarily disabled for testing', 1600);
    return;
  }
  const sessionId = gazeGameState.sessionId;
  const success = await runGazeCalibrationStep({ sessionId, randomizeOffsets: true });
  if (!success || gazeGameState.sessionId !== sessionId || currentGame !== 'gaze') return;
  setGazeStatusText('GAZE MODE — TRACKING');
  setScoreboardText('GAZE CALIBRATION', 'TRACKING', '');
  showCenterMessage('Recalibration complete — tracking updated', 1600);
  setGazeCoordsText(null, null);
  updateAIUI();
}

function updateGazePaddleScoreboard() {
  setScoreboardText('GAZE PADDLE TEST', `SCORE ${gazePaddleState.score}`, `MISSES ${gazePaddleState.misses}`);
}

function initGazePaddleGame() {
  cleanupGame1();
  cleanupGame2();
  cleanupGazeGame();
  resetMainCamera();
  gazeGameState.active = true;
  gazeGameState.readyForPaddle = true;
  updateGazePaddleButton();
  gazePaddleState.active = true;
  gazePaddleState.score = 0;
  gazePaddleState.misses = 0;
  gazePaddleState.paddleX = 0.5;
  gazePaddleState.targetX = gazeGameState.targetX || 0.5;
  updateGazePaddleDimensions();
  resetGazePaddleBall();
  showGazePaddleCanvas(true);
  updateGazePaddleScoreboard();
  showCenterMessage('Move the paddle with your gaze. Keep the ball in play!', 2800);
  ensureGazeListener();
  updateControlHints('gazePaddle');
}

function updateGazePaddle(delta) {
  if (!gazePaddleState.active || menuOpen || startMenuVisible) return;
  const width = gazePaddleState.width;
  const height = gazePaddleState.height;
  const paddleHalf = gazePaddleState.paddleWidth / 2;
  const paddleY = height - gazePaddleState.paddleHeight - 6;
  const smoothing = Math.min(1, delta * 8);
  gazePaddleState.paddleX = THREE.MathUtils.lerp(
    gazePaddleState.paddleX,
    THREE.MathUtils.clamp(gazePaddleState.targetX, 0.05, 0.95),
    smoothing
  );
  const paddleCenter = gazePaddleState.paddleX * width;

  gazePaddleState.ballX += gazePaddleState.ballVX * delta;
  gazePaddleState.ballY += gazePaddleState.ballVY * delta;

  if (gazePaddleState.ballX <= gazePaddleState.ballRadius) {
    gazePaddleState.ballX = gazePaddleState.ballRadius;
    gazePaddleState.ballVX *= -1;
  } else if (gazePaddleState.ballX >= width - gazePaddleState.ballRadius) {
    gazePaddleState.ballX = width - gazePaddleState.ballRadius;
    gazePaddleState.ballVX *= -1;
  }
  if (gazePaddleState.ballY <= gazePaddleState.ballRadius) {
    gazePaddleState.ballY = gazePaddleState.ballRadius;
    gazePaddleState.ballVY = Math.abs(gazePaddleState.ballVY);
  }

  if (gazePaddleState.ballY + gazePaddleState.ballRadius >= paddleY) {
    if (
      gazePaddleState.ballX >= paddleCenter - paddleHalf &&
      gazePaddleState.ballX <= paddleCenter + paddleHalf &&
      gazePaddleState.ballVY > 0
    ) {
      const offset = (gazePaddleState.ballX - paddleCenter) / paddleHalf;
      gazePaddleState.ballVY *= -1;
      gazePaddleState.ballVX += offset * 60;
      gazePaddleState.score += 1;
      updatePaddleWidthForScore();
      updateGazePaddleScoreboard();
    } else if (gazePaddleState.ballY >= height - gazePaddleState.ballRadius) {
      gazePaddleState.misses += 1;
      resetGazePaddleBall();
      updateGazePaddleScoreboard();
    }
  }

  drawGazePaddleCanvas();
}

function drawGazePaddleCanvas() {
  if (!gazePaddleCtx || !gazePaddleState.active) return;
  const ctx = gazePaddleCtx;
  const width = gazePaddleState.width;
  const height = gazePaddleState.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#05081d';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(83, 255, 210, 0.4)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, width - 8, height - 8);
  const paddleCenter = gazePaddleState.paddleX * width;
  ctx.fillStyle = '#53ffd2';
  ctx.fillRect(
    paddleCenter - gazePaddleState.paddleWidth / 2,
    height - gazePaddleState.paddleHeight - 6,
    gazePaddleState.paddleWidth,
    gazePaddleState.paddleHeight
  );
  ctx.fillStyle = '#f6ff92';
  ctx.beginPath();
  ctx.arc(gazePaddleState.ballX, gazePaddleState.ballY, gazePaddleState.ballRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(246, 255, 146, 0.35)';
  ctx.fillRect(
    THREE.MathUtils.clamp(gazeGameState.targetX, 0.02, 0.98) * width - 2,
    10,
    4,
    height - 20
  );
}

function cleanupLaneRunner() {
  if (laneRunnerState.robot) {
    scene.remove(laneRunnerState.robot);
    laneRunnerState.robot = null;
  }
  if (laneRunnerState.track) {
    scene.remove(laneRunnerState.track);
    laneRunnerState.track.geometry.dispose();
    laneRunnerState.track.material.dispose();
    laneRunnerState.track = null;
  }
  laneRunnerState.laneLines.forEach((line) => {
    scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  });
  laneRunnerState.laneLines.length = 0;
  laneRunnerState.obstacles.forEach((obstacle) => {
    if (obstacle.mesh) {
      scene.remove(obstacle.mesh);
      obstacle.mesh.geometry.dispose();
      obstacle.mesh.material.dispose();
    }
  });
  laneRunnerState.obstacles.length = 0;
  laneRunnerState.active = false;
  laneRunnerState.endTimeout = null;
  gazeGameState.active = false;
  refreshGazePaddleCanvas();
}

function initLaneRunnerGame() {
  cleanupGame1();
  cleanupGame2();
  cleanupGazePaddle();
  cleanupGazeGame();
  cleanupLaneRunner();
  laneRunnerState.active = true;
  laneRunnerState.distance = 0;
  laneRunnerState.lives = 3;
  laneRunnerState.currentLaneIndex = 1;
  laneRunnerState.targetLaneIndex = 1;
  laneRunnerState.spawnTimer = 1;
  laneRunnerState.speed = 18;
  computeLaneRunnerLanes();
  laneRunnerState.obstacles.length = 0;
  gazeGameState.active = true;
  gazeGameState.targetX = 0.5;
  const robot = createRobot(0x53ffd2, 0xf6ff92);
  robot.position.set(laneRunnerState.lanePositions[1], 0, 4);
  robot.rotation.y = Math.PI;
  scene.add(robot);
  laneRunnerState.robot = robot;
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(laneRunnerState.laneSpan + 4, 150),
    new THREE.MeshStandardMaterial({
      color: 0x05081d,
      emissive: 0x031229,
      emissiveIntensity: 0.6,
      roughness: 0.85,
    })
  );
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, -0.02, -40);
  scene.add(track);
  laneRunnerState.track = track;
  const laneLines = [];
  for (let i = 0; i <= laneRunnerState.laneCount; i += 1) {
    const isEdge = i === 0 || i === laneRunnerState.laneCount;
    const x = laneRunnerState.laneLeftEdge + laneRunnerState.laneWidth * i;
    const divider = new THREE.Mesh(
      new THREE.BoxGeometry(isEdge ? 1.2 : 0.35, 0.05, 150),
      new THREE.MeshBasicMaterial({
        color: isEdge ? 0xf6ff92 : 0x53ffd2,
        transparent: true,
        opacity: isEdge ? 0.85 : 0.65,
      })
    );
    divider.position.set(x, -0.01, -40);
    divider.rotation.x = -Math.PI / 2;
    scene.add(divider);
    laneLines.push(divider);
  }
  laneRunnerState.laneLines = laneLines;
  camera.fov = 56;
  camera.position.set(0, 30, 32);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, -40);
  camera.updateProjectionMatrix();
  setScoreboardText('GAZE LANE RUNNER', 'READY', 'LIVES 3');
  showCenterMessage('Look left/right to change lanes. Avoid the chargers!', 2800);
  updateControlHints('gazeRunner');
  updateAIUI();
  ensureGazeListener();
}

function spawnLaneRunnerObstacle() {
  const laneIndex = Math.floor(Math.random() * laneRunnerState.lanePositions.length);
  const geometry = new THREE.BoxGeometry(1.6, 1.4, 2.8);
  const material = new THREE.MeshStandardMaterial({
    color: 0xff5ad8,
    emissive: 0x330533,
    metalness: 0.1,
    roughness: 0.35,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(laneRunnerState.lanePositions[laneIndex], 0.7, -80);
  scene.add(mesh);
  laneRunnerState.obstacles.push({ mesh, laneIndex });
  laneRunnerState.spawnTimer = THREE.MathUtils.randFloat(0.65, 1.25);
}

function updateLaneRunnerHUD() {
  setScoreboardText(
    `DIST ${laneRunnerState.distance.toFixed(0)}M`,
    'GAZE LANE RUNNER',
    `LIVES ${laneRunnerState.lives}`
  );
}

function endLaneRunnerRun(message) {
  if (!laneRunnerState.active) return;
  laneRunnerState.active = false;
  showCenterMessage(message, 2200);
  setTimeout(() => {
    cleanupLaneRunner();
    showStartMenu();
  }, 2300);
}

function updateLaneRunner(delta) {
  if (!laneRunnerState.active || menuOpen || startMenuVisible) return;
  if (!laneRunnerState.robot) return;
  const laneCount = laneRunnerState.laneCount;
  const normalized = THREE.MathUtils.clamp(gazeGameState.targetX, 0, 0.9999);
  const candidateLane = Math.max(0, Math.min(laneCount - 1, Math.floor(normalized * laneCount)));
  if (candidateLane === laneRunnerState.lastLaneCandidate) {
    laneRunnerState.laneSwitchTimer += delta;
  } else {
    laneRunnerState.lastLaneCandidate = candidateLane;
    laneRunnerState.laneSwitchTimer = 0;
  }
  if (
    candidateLane !== laneRunnerState.targetLaneIndex &&
    laneRunnerState.laneSwitchTimer >= 0.18
  ) {
    laneRunnerState.targetLaneIndex = candidateLane;
  }
  laneRunnerState.currentLaneIndex = THREE.MathUtils.lerp(
    laneRunnerState.currentLaneIndex,
    laneRunnerState.targetLaneIndex,
    Math.min(1, delta * 5)
  );
  const laneCenterIndex = Math.max(
    0,
    Math.min(laneCount - 1, Math.round(laneRunnerState.currentLaneIndex))
  );
  const currentLaneCenter = laneRunnerState.lanePositions[laneCenterIndex];
  laneRunnerState.robot.position.x = THREE.MathUtils.lerp(
    laneRunnerState.robot.position.x,
    currentLaneCenter,
    Math.min(1, delta * 10)
  );
  laneRunnerState.distance += laneRunnerState.speed * delta * 1.6;
  laneRunnerState.spawnTimer -= delta;
  if (laneRunnerState.spawnTimer <= 0) {
    spawnLaneRunnerObstacle();
  }
  const targetLane = laneRunnerState.targetLaneIndex;
  for (let i = laneRunnerState.obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = laneRunnerState.obstacles[i];
    obstacle.mesh.position.z += laneRunnerState.speed * delta * 2.2;
    if (obstacle.mesh.position.z > 25) {
      scene.remove(obstacle.mesh);
      obstacle.mesh.geometry.dispose();
      obstacle.mesh.material.dispose();
      laneRunnerState.obstacles.splice(i, 1);
      continue;
    }
    const sameLane = obstacle.laneIndex === targetLane;
    if (
      sameLane &&
      obstacle.mesh.position.z > 2 &&
      obstacle.mesh.position.z < 6
    ) {
      laneRunnerState.lives -= 1;
      triggerHitFlash(0xff5ad8);
      spawnImpactRing(obstacle.mesh.position.clone(), 0xff5ad8);
      scene.remove(obstacle.mesh);
      obstacle.mesh.geometry.dispose();
      obstacle.mesh.material.dispose();
      laneRunnerState.obstacles.splice(i, 1);
      if (laneRunnerState.lives <= 0) {
        updateLaneRunnerHUD();
        endLaneRunnerRun('RUN TERMINATED');
        return;
      }
    }
  }
  updateLaneRunnerHUD();
}

function computeMainCameraHeight() {
  const radius = ARENA_RADIUS + 1.5;
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const aspect = width / height;
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const tanHalfFov = Math.tan(fovRad / 2);
  if (tanHalfFov <= 0) {
    return cameraBasePosition.y;
  }
  const verticalRequirement = radius / tanHalfFov;
  const horizontalRequirement = radius / (tanHalfFov * Math.max(aspect, 0.0001));
  return Math.max(verticalRequirement, horizontalRequirement) * MAIN_CAMERA_MARGIN;
}

function showStartMenu() {
  cleanupGame1();
  cleanupGame2();
  cleanupGazeGame();
  cleanupGazePaddle();
  cleanupLaneRunner();
  currentGame = null;
  gazeGameState.useSavedCalibration = false;
  resetMainCamera();
  updateRobotVisibility();
  applyVisualMode(null);
  startMenuVisible = true;
  startMenu.classList.remove('hidden');
  startMenuIndex = 0;
  highlightStartButton();
  setScoreboardText('CHOOSE GAME', 'SELECT A MODE', '');
  showCenterMessage('CHOOSE GAME', 0);
  updateControlHints('joust');
  closeMenu();
  updateAIUI();
  updateGazePaddleButton();
  updateGazeRunnerButton();
  refreshGazePaddleCanvas();
}

function hideStartMenu() {
  startMenuVisible = false;
  startMenu.classList.add('hidden');
  refreshGazePaddleCanvas();
}

function selectGame(gameKey) {
  if (!gameKey) return;
  if (gameKey === 'gazePaddle' && !gazeGameState.readyForPaddle) {
    showCenterMessage('Complete gaze calibration first', 1600);
    updateGazePaddleButton();
    return;
  }
  if (gameKey === 'gazeRunner' && !gazeGameState.readyForRunner) {
    showCenterMessage('Complete gaze calibration first', 1600);
    updateGazeRunnerButton();
    return;
  }
  hideStartMenu();
  currentGame = gameKey;
  if (gameKey !== 'gaze') {
    cleanupGazeGame();
  }
  if (gameKey !== 'gazePaddle') {
    cleanupGazePaddle();
  }
  if (gameKey !== 'gazeRunner') {
    cleanupLaneRunner();
  }
  updateRobotVisibility();
  applyVisualMode(gameKey);
  updateControlHints(gameKey);
  showCenterMessage('', 0);
  updateAIUI();
  if (gameKey === 'joust') {
    resetMainCamera();
    startRound({ resetScores: true });
  } else if (gameKey === 'shooter') {
    initGame2();
  } else if (gameKey === 'gaze') {
    initGazeGame();
  } else if (gameKey === 'gazePaddle') {
    initGazePaddleGame();
  } else if (gameKey === 'gazeRunner') {
    initLaneRunnerGame();
  }
}

function cleanupGame1() {
  roundActive = false;
  if (nextRoundTimeout) {
    clearTimeout(nextRoundTimeout);
    nextRoundTimeout = null;
  }
  if (matchResetTimeout) {
    clearTimeout(matchResetTimeout);
    matchResetTimeout = null;
  }
}

function updateRobotVisibility() {
  const showPlayers = currentGame === 'joust';
  if (players[0] && players[0].robot) {
    players[0].robot.visible = showPlayers;
  }
  if (players[1] && players[1].robot) {
    players[1].robot.visible = showPlayers;
  }
}

function resetMainCamera() {
  camera.fov = 45;
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  camera.aspect = width / height;
  const optimalHeight = computeMainCameraHeight();
  cameraBasePosition.set(0, optimalHeight, 0);
  camera.position.copy(cameraBasePosition);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
}

function colorHexToRGBA(hex, alpha = 1) {
  colorHelper.set(hex);
  const r = Math.round(colorHelper.r * 255);
  const g = Math.round(colorHelper.g * 255);
  const b = Math.round(colorHelper.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function triggerHitFlash(colorHex = 0xffffff) {
  const inner = colorHexToRGBA(colorHex, 0.9);
  const mid = colorHexToRGBA(colorHex, 0.3);
  hitFlash.style.background = `radial-gradient(circle, ${inner} 0%, ${mid} 40%, rgba(2, 3, 15, 0) 70%)`;
  hitFlash.style.opacity = '1';
  setTimeout(() => {
    hitFlash.style.opacity = '0';
  }, 120);
}

function spawnImpactRing(position, colorHex) {
  const geometry = new THREE.RingGeometry(0.8, 1.1, 48);
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(position);
  mesh.position.y = 0.05;
  scene.add(mesh);
  hitRings.push({ mesh, material, geometry, age: 0, duration: 0.6 });
}

function findClosestEnemy(position) {
  let closest = null;
  let bestDist = Infinity;
  game2State.enemies.forEach((enemy) => {
    const dist = enemy.position.distanceToSquared(position);
    if (dist < bestDist) {
      bestDist = dist;
      closest = enemy;
    }
  });
  return closest;
}

function clampTurretRotation() {
  if (!game2State.turretPivot) return;
  game2State.turretPivot.rotation.y = THREE.MathUtils.clamp(
    game2State.turretPivot.rotation.y,
    -TURRET_LIMIT,
    TURRET_LIMIT
  );
}

function computeGame2DriverAI(base) {
  const move = new THREE.Vector2(0, 0);
  let rotateInput = 0;
  const enemy = findClosestEnemy(base.position);
  const target = enemy ? enemy.position : new THREE.Vector3(0, 0, 0);
  const direction = target.clone().sub(base.position).setY(0);
  const dist = Math.max(direction.length(), 0.0001);
  const desiredAngle = Math.atan2(direction.x, direction.z);
  let angleDiff = desiredAngle - base.rotation.y;
  angleDiff = THREE.MathUtils.euclideanModulo(angleDiff + Math.PI, Math.PI * 2) - Math.PI;

  if (angleDiff > 0.25) {
    rotateInput = 1;
  } else if (angleDiff < -0.25) {
    rotateInput = -1;
  }

  if (dist > 16) {
    move.y -= 1;
  } else if (dist < 9) {
    move.y += 1;
  }

  return { moveVector: move, rotateInput };
}

function updateGame2TurretAI(delta) {
  if (!game2AIState.turret || !game2State.active || !game2State.base || !game2State.turretPivot) {
    return false;
  }
  const enemy = findClosestEnemy(game2State.base.position);
  if (!enemy) return false;

  const baseRotation = game2State.base.rotation.y;
  const desiredAngle = Math.atan2(
    enemy.position.x - game2State.base.position.x,
    enemy.position.z - game2State.base.position.z
  );
  let angleDiff = desiredAngle - baseRotation - game2State.turretPivot.rotation.y;
  angleDiff = THREE.MathUtils.euclideanModulo(angleDiff + Math.PI, Math.PI * 2) - Math.PI;

  if (angleDiff > 0.02) {
    game2State.turretPivot.rotation.y += GAME2_TURRET_SPEED * delta;
  } else if (angleDiff < -0.02) {
    game2State.turretPivot.rotation.y -= GAME2_TURRET_SPEED * delta;
  }
  clampTurretRotation();

  if (Math.abs(angleDiff) < 0.25 && game2State.fireCooldown <= 0) {
    spawnPlayerBullet();
  }
  return true;
}

function updateImpactRings(delta) {
  for (let i = hitRings.length - 1; i >= 0; i -= 1) {
    const ring = hitRings[i];
    ring.age += delta;
    const t = Math.min(1, ring.age / ring.duration);
    const scale = THREE.MathUtils.lerp(1, 6.5, t);
    ring.mesh.scale.set(scale, scale, scale);
    ring.material.opacity = THREE.MathUtils.lerp(0.8, 0, t);
    if (t >= 1) {
      scene.remove(ring.mesh);
      ring.geometry.dispose();
      ring.material.dispose();
      hitRings.splice(i, 1);
    }
  }
}

function updateDriverCameraForGame2() {
  if (!game2State.base) return;
  const target = game2State.base.position;
  camera.fov = DRIVER_FOV;
  camera.updateProjectionMatrix();
  driverCameraForward.set(Math.sin(game2State.base.rotation.y), 0, Math.cos(game2State.base.rotation.y));
  driverCameraOffset.copy(driverCameraForward).multiplyScalar(-DRIVER_CAMERA_DISTANCE);
  driverCameraOffset.y = DRIVER_CAMERA_HEIGHT;
  const lookAheadDistance = 10;
  driverCameraLookTarget
    .copy(target)
    .add(driverCameraForward.clone().multiplyScalar(lookAheadDistance));
  driverCameraLookTarget.y = target.y + 0.7;
  camera.position.copy(target).add(driverCameraOffset);
  camera.up.set(0, 1, 0);
  camera.lookAt(driverCameraLookTarget);
}

function updateTurretCamera() {
  if (!game2State.base || !game2State.turretPivot) return;
  const pivotWorldPos = new THREE.Vector3();
  game2State.turretPivot.getWorldPosition(pivotWorldPos);
  const orientation = game2State.base.rotation.y + game2State.turretPivot.rotation.y;

  const forward = new THREE.Vector3(Math.sin(orientation), 0, Math.cos(orientation));
  const up = new THREE.Vector3(0, 0.5, 0);
  const cameraOffset = forward.clone().multiplyScalar(0.6).add(up);

  turretCamera.position.copy(pivotWorldPos).add(cameraOffset);
  turretCamera.lookAt(pivotWorldPos.clone().add(forward.multiplyScalar(8)).add(new THREE.Vector3(0, 0.5, 0)));
}

function renderGame2Views() {
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  const halfWidth = Math.max(Math.floor(width / 2), 1);
  const secondWidth = Math.max(width - halfWidth, 1);
  camera.aspect = halfWidth / height;
  camera.updateProjectionMatrix();
  turretCamera.aspect = secondWidth / height;
  turretCamera.updateProjectionMatrix();
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, halfWidth, height);
  renderer.setScissor(0, 0, halfWidth, height);
  renderer.render(scene, camera);
  renderer.setViewport(halfWidth, 0, secondWidth, height);
  renderer.setScissor(halfWidth, 0, secondWidth, height);
  renderer.render(scene, turretCamera);
  renderer.setScissorTest(false);
}

function driveAI(player, opponent) {
  const difficulty = getCurrentAIDifficulty();
  aiDiff.set(
    opponent.robot.position.x - player.robot.position.x,
    opponent.robot.position.z - player.robot.position.z
  );
  const distance = aiDiff.length();
  let rotateInput = 0;

  if (distance > 0.0001) {
    const desiredAngle = Math.atan2(aiDiff.x, aiDiff.y);
    let angleDiff = desiredAngle - player.robot.rotation.y;
    angleDiff = THREE.MathUtils.euclideanModulo(angleDiff + Math.PI, Math.PI * 2) - Math.PI;
    if (angleDiff > difficulty.angleThreshold) {
      rotateInput = 1;
    } else if (angleDiff < -difficulty.angleThreshold) {
      rotateInput = -1;
    }

    aiMoveTarget.copy(aiDiff).normalize();
    if (distance < difficulty.retreatDistance) {
      aiMoveTarget.multiplyScalar(-0.6);
    } else if (distance > difficulty.chaseBoostDistance) {
      aiMoveTarget.multiplyScalar(1.25);
    }
    aiMoveCommand.copy(aiMoveTarget);
    if (difficulty.jitter > 0) {
      aiMoveCommand.x += (Math.random() - 0.5) * difficulty.jitter;
      aiMoveCommand.y += (Math.random() - 0.5) * difficulty.jitter;
    }
    const length = aiMoveCommand.length();
    if (length > 1) {
      aiMoveCommand.divideScalar(length);
    }
    aiMoveCommand.multiplyScalar(difficulty.moveSpeed);
  } else {
    aiMoveCommand.set(0, 0);
  }

  return {
    moveVector: aiMoveCommand,
    rotateInput,
    rotateSpeedFactor: difficulty.rotateSpeedFactor,
  };
}

const game2GunnerControls = { rotateLeft: 'j', rotateRight: 'l', fire: 'i' };

const game2State = {
  base: null,
  turretPivot: null,
  bullets: [],
  enemies: [],
  spawnTimer: 0,
  health: 4,
  score: 0,
  fireCooldown: 0,
  wave: 1,
  active: false,
  baseVelocity: new THREE.Vector2(),
  baseAngularVelocity: 0,
};

function cleanupGame2() {
  game2State.active = false;
  game2State.bullets.forEach((bullet) => {
    scene.remove(bullet);
  });
  game2State.enemies.forEach((enemy) => {
    scene.remove(enemy);
  });
  game2State.bullets.length = 0;
  game2State.enemies.length = 0;
  if (game2State.base) {
    scene.remove(game2State.base);
    game2State.base = null;
  }
  game2State.turretPivot = null;
  game2State.baseVelocity.set(0, 0);
  game2State.baseAngularVelocity = 0;
}

function resetGame2SpawnTimer() {
  game2State.spawnTimer = GAME2_SPAWN_MIN + Math.random() * (GAME2_SPAWN_MAX - GAME2_SPAWN_MIN);
}

function initGame2() {
  cleanupGame1();
  cleanupGame2();
  const base = createRobot(0x9cf7ff, 0xffcbff);
  base.position.set(0, 0, 0);
  base.rotation.y = Math.PI;
  const turretPivot = new THREE.Object3D();
  turretPivot.position.y = 0.8;
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.22, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xfff16f, emissive: 0xfff16f, emissiveIntensity: 1 })
  );
  barrel.position.set(0, 0.05, 0.9);
  turretPivot.add(barrel);
  base.add(turretPivot);
  scene.add(base);
  game2State.base = base;
  game2State.turretPivot = turretPivot;
  if (base.userData.directionIndicator) {
    base.userData.directionIndicator.visible = false;
  }
  game2State.health = 4;
  game2State.score = 0;
  game2State.fireCooldown = 0;
  game2State.wave = 1;
  game2State.baseVelocity.set(0, 0);
  game2State.baseAngularVelocity = 0;
  game2State.active = true;
  resetGame2SpawnTimer();
  updateGame2HUD();
}

function spawnPlayerBullet() {
  if (!game2State.base || !game2State.turretPivot) return;
  const turretAngle = game2State.base.rotation.y + game2State.turretPivot.rotation.y;
  const direction = new THREE.Vector3(Math.sin(turretAngle), 0, Math.cos(turretAngle));
  const spawnPos = game2State.base.position
    .clone()
    .add(new THREE.Vector3(0, 0.8, 0))
    .add(direction.clone().multiplyScalar(1.8));
  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xfffc92, emissive: 0xfffc92, emissiveIntensity: 1 })
  );
  bullet.position.copy(spawnPos);
  bullet.userData = {
    velocity: direction.multiplyScalar(38),
    life: 0,
  };
  scene.add(bullet);
  game2State.bullets.push(bullet);
  game2State.fireCooldown = GAME2_FIRE_RATE;
}

function spawnEnemy() {
  if (!game2State.active) return;
  const angle = Math.random() * Math.PI * 2;
  const radius = GAME2_SPAWN_RADIUS;
  const enemy = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff6f91, emissive: 0xff2a6a, emissiveIntensity: 0.7 })
  );
  enemy.position.set(Math.sin(angle) * radius, 0.4, Math.cos(angle) * radius);
  const speedBoost = Math.min(2, game2State.wave * 0.35);
  enemy.userData = { speed: GAME2_ENEMY_SPEED + speedBoost };
  scene.add(enemy);
  game2State.enemies.push(enemy);
  resetGame2SpawnTimer();
}

function updateGame2HUD() {
  if (!game2State.active) return;
  const wave = Math.floor(game2State.score / 5) + 1;
  game2State.wave = wave;
  setScoreboardText(
    `SCORE — ${game2State.score}`,
    `WAVE ${wave}`,
    `HEALTH — ${Math.max(game2State.health, 0)}`
  );
}

function endGame2() {
  game2State.active = false;
  showCenterMessage('ROBOT DESTROYED', 0);
  setTimeout(() => {
    showStartMenu();
  }, 2200);
}

function updateGame2(delta) {
  if (!game2State.active || menuOpen) return;
  const base = game2State.base;
  const turretPivot = game2State.turretPivot;
  if (!base || !turretPivot) return;

  const driverInput = new THREE.Vector2(0, 0);
  let rotateInput = 0;
  if (game2AIState.driver) {
    const aiDriver = computeGame2DriverAI(base);
    driverInput.copy(aiDriver.moveVector);
    rotateInput = aiDriver.rotateInput;
  } else {
    if (keys[players[0].controls.up]) driverInput.y += 1;
    if (keys[players[0].controls.down]) driverInput.y -= 1;
    if (keys[players[0].controls.left]) driverInput.x += 1;
    if (keys[players[0].controls.right]) driverInput.x -= 1;
    if (keys[players[0].controls.rotateLeft]) {
      rotateInput = 1;
    } else if (keys[players[0].controls.rotateRight]) {
      rotateInput = -1;
    }
  }

  const baseVelocity = game2State.baseVelocity;
  const forwardVec = game2ForwardVec.set(Math.sin(base.rotation.y), Math.cos(base.rotation.y));
  const rightVec = game2RightVec.set(
    Math.sin(base.rotation.y + Math.PI / 2),
    Math.cos(base.rotation.y + Math.PI / 2)
  );
  game2DesiredVelocity.copy(forwardVec).multiplyScalar(driverInput.y);
  game2DesiredVelocity.addScaledVector(rightVec, driverInput.x);
  const desiredLenSq = game2DesiredVelocity.lengthSq();
  if (desiredLenSq > 0) {
    const desiredLen = Math.sqrt(desiredLenSq);
    const magnitude = Math.min(1, desiredLen);
    game2TargetVelocity.copy(game2DesiredVelocity).normalize().multiplyScalar(GAME2_DRIVER_SPEED * magnitude);
    const mix = Math.min(1, MOVE_ACCEL * delta);
    baseVelocity.lerp(game2TargetVelocity, mix);
  } else {
    const damping = Math.max(0, 1 - MOVE_DAMPING * delta);
    baseVelocity.multiplyScalar(damping);
  }
  base.position.x += baseVelocity.x * delta;
  base.position.z += baseVelocity.y * delta;

  if (rotateInput !== 0) {
    const targetAngular = rotateInput * GAME2_ROTATE_SPEED;
    const mix = Math.min(1, ROTATE_ACCEL * delta);
    game2State.baseAngularVelocity = THREE.MathUtils.lerp(
      game2State.baseAngularVelocity,
      targetAngular,
      mix
    );
  } else {
    const damping = Math.max(0, 1 - ROTATE_DAMPING * delta);
    game2State.baseAngularVelocity *= damping;
  }
  base.rotation.y += game2State.baseAngularVelocity * delta;

  game2State.fireCooldown = Math.max(0, game2State.fireCooldown - delta);

  const turretAIHandled = updateGame2TurretAI(delta);
  if (!turretAIHandled) {
    if (keys[game2GunnerControls.rotateLeft]) {
      turretPivot.rotation.y += GAME2_TURRET_SPEED * delta;
    }
    if (keys[game2GunnerControls.rotateRight]) {
      turretPivot.rotation.y -= GAME2_TURRET_SPEED * delta;
    }
    if (keys[game2GunnerControls.fire] && game2State.fireCooldown <= 0) {
      spawnPlayerBullet();
    }
  }
  clampTurretRotation();

  for (let i = game2State.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = game2State.bullets[i];
    bullet.position.addScaledVector(bullet.userData.velocity, delta);
    bullet.userData.life += delta;
    if (bullet.userData.life > 2 || bullet.position.length() > GAME2_BULLET_LIMIT) {
      scene.remove(bullet);
      game2State.bullets.splice(i, 1);
      continue;
    }
    for (let j = game2State.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = game2State.enemies[j];
      if (!enemy) continue;
      if (bullet.position.distanceToSquared(enemy.position) < 0.9) {
        scene.remove(enemy);
        scene.remove(bullet);
        game2State.enemies.splice(j, 1);
        game2State.bullets.splice(i, 1);
        game2State.score += 1;
        spawnImpactRing(enemy.position, 0xff6f91);
        updateGame2HUD();
        break;
      }
    }
  }

  const enemyToBase = new THREE.Vector3();
  for (let i = game2State.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = game2State.enemies[i];
    const toBase = enemyToBase
      .subVectors(game2State.base.position, enemy.position)
      .setY(0);
    const distanceToBaseSq = toBase.lengthSq();
    if (distanceToBaseSq > 0.0001) {
      toBase.normalize();
      enemy.position.addScaledVector(toBase, enemy.userData.speed * delta);
    }
    const collisionThreshold = 2.6;
    if (distanceToBaseSq < collisionThreshold * collisionThreshold) {
      scene.remove(enemy);
      game2State.enemies.splice(i, 1);
      game2State.health -= 1;
      triggerHitFlash(0xff4f8f);
      shakeTime = 0.25;
      showCenterMessage('ROBOT DAMAGED', 800);
      updateGame2HUD();
      if (game2State.health <= 0) {
        endGame2();
        return;
      }
    }
  }

  game2State.spawnTimer -= delta;
  if (game2State.spawnTimer <= 0) {
    spawnEnemy();
  }

  clampToArena(base, GAME2_ARENA_RADIUS);
  updateDriverCameraForGame2();
  updateTurretCamera();
  updateGame2HUD();
}

function resetRobots() {
  players.forEach((player) => {
    player.robot.position.copy(player.startPosition);
    player.robot.rotation.y = player.startRotation;
    player.velocity.set(0, 0);
    player.angularVelocity = 0;
  });
}

function startRound({ resetScores = false } = {}) {
  if (currentGame !== 'joust') return;
  if (nextRoundTimeout) {
    clearTimeout(nextRoundTimeout);
    nextRoundTimeout = null;
  }
  if (matchResetTimeout) {
    clearTimeout(matchResetTimeout);
    matchResetTimeout = null;
  }
  if (resetScores) {
    players.forEach((p) => (p.score = 0));
    currentRound = 1;
  }

  resetRobots();
  roundActive = false;
  updateScoreboard();
  showCenterMessage(`ROUND ${currentRound}`, 900);

  nextRoundTimeout = setTimeout(() => {
    roundActive = true;
    showCenterMessage('');
  }, 900);
}

function startNextRound() {
  if (currentGame !== 'joust') return;
  if (currentRound < ROUND_LIMIT) {
    currentRound += 1;
  }
  updateScoreboard();
  startRound();
}

function endMatch(winner) {
  if (currentGame !== 'joust') return;
  roundActive = false;
  showCenterMessage(`${winner.id} WINS`, 0);
  matchResetTimeout = setTimeout(() => {
    showCenterMessage('NEW MATCH', 1200);
    startRound({ resetScores: true });
  }, 2200);
}

function handleHit(attacker, defender) {
  roundActive = false;
  attacker.score += 1;
  pulseScore(attacker.scoreEl);
  const impactPosition = new THREE.Vector3()
    .addVectors(attacker.robot.position, defender.robot.position)
    .multiplyScalar(0.5);
  spawnImpactRing(impactPosition, attacker.bumper);
  triggerHitFlash(attacker.bumper);
  shakeTime = 0.35;
  updateScoreboard();
  showCenterMessage(`${attacker.id} HIT!`, 1000);

  if (attacker.score >= WIN_SCORE) {
    endMatch(attacker);
    return;
  }

  startNextRound();
}

function resolveBump(p1, p2, diff3, distance) {
  const collisionDistance = COLLISION_DISTANCE;
  let currentDistance = distance;
  const separation = diff3.clone();

  if (currentDistance <= 0) {
    separation.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    currentDistance = separation.length();
  }

  const overlap = collisionDistance - currentDistance;
  if (overlap <= 0) return;

  const pushDir = separation.setY(0).normalize();
  const pushVector = pushDir.multiplyScalar(overlap / 2);

  p1.robot.position.add(pushVector.clone().multiplyScalar(-1));
  p2.robot.position.add(pushVector);
}

function checkCollisions() {
  if (!roundActive || menuOpen) return;

  const posA = players[0].robot.position;
  const posB = players[1].robot.position;
  const diff3 = new THREE.Vector3().subVectors(posB, posA);
  const diff2 = new THREE.Vector2(diff3.x, diff3.z);
  const distance = diff2.length();
  const collisionDistance = COLLISION_DISTANCE;

  if (distance > collisionDistance) {
    return;
  }

  const dir = diff2.clone().normalize();
  const dirOpposite = dir.clone().multiplyScalar(-1);

  const p1Front = new THREE.Vector2(
    Math.sin(players[0].robot.rotation.y),
    Math.cos(players[0].robot.rotation.y)
  );
  const p2Front = new THREE.Vector2(
    Math.sin(players[1].robot.rotation.y),
    Math.cos(players[1].robot.rotation.y)
  );

  const p1Angle = p1Front.dot(dir);
  const p2Angle = p2Front.dot(dirOpposite);

  if (p1Angle > 0.6 && p2Angle < 0.35) {
    handleHit(players[0], players[1]);
  } else if (p2Angle > 0.6 && p1Angle < 0.35) {
    handleHit(players[1], players[0]);
  } else {
    resolveBump(players[0], players[1], diff3, distance);
  }
}

const clock = new THREE.Clock();

function updatePlayer(player, delta) {
  if (!roundActive || menuOpen) return;

  const moveInput = new THREE.Vector2(0, 0);
  let rotateInput = 0;
  let rotateSpeedFactor = 1;

  if (player.isAI) {
    const opponent = player === players[0] ? players[1] : players[0];
    const aiCommand = driveAI(player, opponent);
    moveInput.copy(aiCommand.moveVector);
    rotateInput = aiCommand.rotateInput;
    rotateSpeedFactor = aiCommand.rotateSpeedFactor;
  } else {
    if (keys[player.controls.up]) moveInput.y -= 1;
    if (keys[player.controls.down]) moveInput.y += 1;
    if (keys[player.controls.left]) moveInput.x -= 1;
    if (keys[player.controls.right]) moveInput.x += 1;
    rotateInput = (keys[player.controls.rotateLeft] ? 1 : 0) - (keys[player.controls.rotateRight] ? 1 : 0);
  }

  if (moveInput.lengthSq() > 0) {
    const magnitude = Math.min(1, moveInput.length());
    const targetVelocity = moveInput.normalize().multiplyScalar(ROBOT_SPEED * magnitude);
    const mix = Math.min(1, MOVE_ACCEL * delta);
    player.velocity.lerp(targetVelocity, mix);
  } else {
    const damping = Math.max(0, 1 - MOVE_DAMPING * delta);
    player.velocity.multiplyScalar(damping);
  }

  if (rotateInput !== 0) {
    const targetAngular = rotateInput * ROTATE_SPEED * rotateSpeedFactor;
    const mix = Math.min(1, ROTATE_ACCEL * delta);
    player.angularVelocity = THREE.MathUtils.lerp(player.angularVelocity, targetAngular, mix);
  } else {
    const damping = Math.max(0, 1 - ROTATE_DAMPING * delta);
    player.angularVelocity *= damping;
  }

  player.robot.position.x += player.velocity.x * delta;
  player.robot.position.z += player.velocity.y * delta;
  player.robot.rotation.y += player.angularVelocity * delta;

  clampToArena(player.robot);
}

function applyCameraShake(delta) {
  if (shakeTime <= 0) {
    if (currentGame === 'joust') {
      camera.position.copy(cameraBasePosition);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, 0, 0);
    }
    return;
  }
  shakeTime -= delta;
  const intensity = Math.max(shakeTime, 0) / 0.35;
  const time = performance.now() * 0.01;
  if (currentGame === 'joust') {
    camera.position.set(
      cameraBasePosition.x + Math.sin(time * 3) * 0.6 * intensity,
      cameraBasePosition.y,
      cameraBasePosition.z + Math.cos(time * 2) * 0.6 * intensity
    );
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (currentGame === 'joust') {
    players.forEach((player) => updatePlayer(player, delta));
    checkCollisions();
  }
  if (currentGame === 'shooter') {
    updateGame2(delta);
    updateDriverCameraForGame2();
    updateTurretCamera();
  }
  if (currentGame === 'gazePaddle') {
    updateGazePaddle(delta);
  }
  if (currentGame === 'gazeRunner') {
    updateLaneRunner(delta);
  }
  updateImpactRings(delta);
  applyCameraShake(delta);

  if (currentGame === 'shooter') {
    renderGame2Views();
  } else {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, Math.max(window.innerHeight, 1));
    renderer.render(scene, camera);
  }
}

function onResize() {
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);
  if (currentGame === 'shooter') {
    const halfWidth = Math.floor(width / 2);
    camera.aspect = halfWidth / height;
    turretCamera.aspect = (width - halfWidth) / height;
    camera.updateProjectionMatrix();
    turretCamera.updateProjectionMatrix();
  } else {
    resetMainCamera();
    turretCamera.aspect = width / height;
    turretCamera.updateProjectionMatrix();
  }
  renderer.setSize(width, height);
  updateGazePaddleDimensions({ preserveState: true });
}

window.addEventListener('resize', onResize);
window.addEventListener('blur', () => {
  Object.keys(keys).forEach((key) => {
    keys[key] = false;
  });
});

updateGazePaddleDimensions();
showStartMenu();
animate();
