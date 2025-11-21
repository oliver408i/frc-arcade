const appContainer = document.getElementById('app');
const hitFlash = document.getElementById('hitFlash');
const centerMessage = document.getElementById('centerMessage');
const p1ScoreEl = document.getElementById('p1Score');
const p2ScoreEl = document.getElementById('p2Score');
const roundInfoEl = document.getElementById('roundInfo');
const menuOverlay = document.getElementById('menuOverlay');
const menuPanels = Array.from(menuOverlay.querySelectorAll('.menu-panel-content'));
const allMenuButtons = Array.from(menuOverlay.querySelectorAll('button'));
const aiToggleLabel = document.getElementById('aiToggleLabel');
const aiDifficultyLabel = document.getElementById('aiDifficultyLabel');
const aiDriverLabel = document.getElementById('aiDriverLabel');
const aiTurretLabel = document.getElementById('aiTurretLabel');
const aiIndicator = document.getElementById('aiIndicator');
const startMenu = document.getElementById('startMenu');
const startMenuButtons = Array.from(startMenu.querySelectorAll('button[data-game]'));
const gazePaddleButton = startMenu.querySelector('button[data-game="gazePaddle"]');
const controlBlocks = Array.from(document.querySelectorAll('.controls > div'));
const gazePanel = document.getElementById('gazePanel');
const gazeStatus = document.getElementById('gazeStatus');
const gazeCoords = document.getElementById('gazeCoords');
const gazePointer = document.getElementById('gazePointer');
const gazePaddleCanvas = document.getElementById('gazePaddleCanvas');
const gazeRunnerButton = startMenu.querySelector('button[data-game="gazeRunner"]');
const loadGazeCalibrationButton = document.getElementById('loadGazeCalibrationButton');

module.exports = {
  appContainer,
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
  gazeRunnerButton,
  loadGazeCalibrationButton,
  controlBlocks,
  gazePanel,
  gazeStatus,
  gazeCoords,
  gazePointer,
  gazePaddleCanvas,
};
