const { app, BrowserWindow } = require('electron');
const detectPort = require('detect-port');
const expressApp = require('./index');
const DEFAULT_PORT = 3000;
require('dotenv').config();
const apiKey = process.env.STEAM_API_KEY;


function createWindow(port) {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: false,
      enableRemoteModule: true,
      nodeIntegration: false
    }
  });

  // Load the local Express server in the Electron window
  mainWindow.loadURL(`http://localhost:${port}`);
  mainWindow.on('closed', () => {
    console.log('Main window closed');
  });
}

// Launch Express server and Electron app
app.whenReady().then(() => {
  detectPort(DEFAULT_PORT).then((port) => {
    if (port !== DEFAULT_PORT) {
      console.log(`Port ${DEFAULT_PORT} is in use. Switching to port ${port}`);
    }

    // Start the Express server on an available port
    expressApp.listen(port, () => {
      console.log(`Express server running on http://localhost:${port}`);
      
      // After the server starts, create the Electron window
      createWindow(port);
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
