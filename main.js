const { app, BrowserWindow, dialog } = require('electron');

const isDev = process.env.NODE_ENV === 'development';
const isUnsupportedPlatform = !isDev && process.platform !== 'linux';

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#02030f',
    title: 'FRC Arcade',
    fullscreen: !isDev,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile('index.html');

  if (isDev) {
    win.setFullScreen(false);
    win.center();
  }
};

app.whenReady().then(() => {
  if (isUnsupportedPlatform) {
    dialog.showErrorBox(
      'Unsupported Platform',
      'This production build is intended for Linux environments only.'
    );
    app.quit();
    return;
  }
  createWindow();
});

app.on('window-all-closed', () => app.quit());
