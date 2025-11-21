

## 1. Overall flow

1. Start WebGazer.
2. Show a fullscreen calibration overlay.
3. Step through a list of dot positions.
4. For each dot:

   * Draw it at a known screen position.
   * Wait for **keyboard/gamepad press**.
   * When pressed → call `webgazer.recordScreenPosition(x, y, 'click')` a few times.
5. When all dots are done → hide overlay → start game.

---

## 2. Calibration dot data

Use normalized positions (0–1) so it adapts to any resolution:

```js
const CALIB_POINTS = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.5, y: 0.5 },
  { x: 0.1, y: 0.9 },
  { x: 0.9, y: 0.9 },
];

let calibIndex = 0;
const SAMPLES_PER_POINT = 8;
let isCalibrating = false;
```

---

## 3. Init WebGazer

```js
async function initWebGazer() {
  await webgazer
    .setRegression('ridge')
    .setTracker('clmtrackr')
    .applyKalmanFilter(true)
    .saveDataAcrossSessions(false)
    .begin();

  // Optional: no prediction dot, we’ll make our own UI
  webgazer
    .showVideoPreview(false)
    .showPredictionPoints(false)
    .showFaceOverlay(false)
    .showFaceFeedbackBox(false);
}
```

---

## 4. Calibration overlay UI

HTML-ish idea:

```html
<div id="calib-overlay">
  <div id="calib-instructions">Look at the dot and press A / Space</div>
  <div id="calib-dot"></div>
</div>
```

CSS-ish:

```css
#calib-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: none;           /* shown only during calibration */
  align-items: center;
  justify-content: center;
}

#calib-dot {
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 0 10px rgba(255,255,255,0.8);
}
```

JS for showing current point:

```js
function showCalibOverlay() {
  document.getElementById('calib-overlay').style.display = 'flex';
}

function hideCalibOverlay() {
  document.getElementById('calib-overlay').style.display = 'none';
}

function showCurrentCalibDot() {
  const dot = document.getElementById('calib-dot');

  if (calibIndex >= CALIB_POINTS.length) {
    finishCalibration();
    return;
  }

  const p = CALIB_POINTS[calibIndex];
  const x = p.x * window.innerWidth;
  const y = p.y * window.innerHeight;

  dot.style.left = `${x}px`;
  dot.style.top = `${y}px`;

  // store pixel coords for sampling
  dot.dataset.x = x;
  dot.dataset.y = y;
}
```

---

## 5. Keyboard input → calibration sample

Listen for a key (e.g. `Space` or `Enter`) while `isCalibrating`:

```js
window.addEventListener('keydown', (e) => {
  if (!isCalibrating) return;

  if (e.code === 'Space' || e.code === 'Enter') {
    confirmCurrentCalibPoint();
  }
});
```

Confirm function:

```js
function confirmCurrentCalibPoint() {
  const dot = document.getElementById('calib-dot');
  const x = Number(dot.dataset.x);
  const y = Number(dot.dataset.y);

  // Take multiple samples to reduce noise
  for (let i = 0; i < SAMPLES_PER_POINT; i++) {
    setTimeout(() => {
      webgazer.recordScreenPosition(x, y, 'click');
    }, i * 40); // spread over ~300ms
  }

  calibIndex++;
  // small delay so user can see that their press was registered
  setTimeout(showCurrentCalibDot, 200);
}
```

---

## 6. Gamepad input → same confirm

Basic gamepad polling (simple version):

```js
function pollGamepads() {
  if (!isCalibrating) {
    requestAnimationFrame(pollGamepads);
    return;
  }

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad) continue;

    // Example: button 0 (A on Xbox)
    if (pad.buttons[0].pressed && !pollGamepads.lastPressed) {
      confirmCurrentCalibPoint();
      pollGamepads.lastPressed = true;
    } else if (!pad.buttons[0].pressed) {
      pollGamepads.lastPressed = false;
    }
  }

  requestAnimationFrame(pollGamepads);
}
```

Call `pollGamepads()` once on startup.

---

## 7. Start/finish calibration

```js
async function startCalibration() {
  calibIndex = 0;
  isCalibrating = true;
  await initWebGazer();
  showCalibOverlay();
  showCurrentCalibDot();
}

function finishCalibration() {
  isCalibrating = false;
  hideCalibOverlay();

  // optional: tiny delay, then start your game
  setTimeout(startGame, 200);
}
```

---

## 8. Using gaze in the game

After calibration, you grab gaze as usual:

```js
function startGame() {
  webgazer.setGazeListener((data, elapsedTime) => {
    if (!data) return;
    const x = data.x;
    const y = data.y;
    handleGazeInGame(x, y, elapsedTime);
  });
}
```

In `handleGazeInGame`, you can do your **dwell-to-grab / dwell-to-drop** logic like we discussed earlier.
