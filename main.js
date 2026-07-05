const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.loadFile('src/index.html');
}

app.on('ready', createWindow);
