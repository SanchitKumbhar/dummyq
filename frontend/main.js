const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 768,
    title: "PrintFlow – Print Shop Management System",
    backgroundColor: '#0F172A',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Required for IPC in the renderer
      sandbox: false
    },
    titleBarStyle: 'default',
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  // 1. Fetch real OS printers
  ipcMain.handle('get-printers', async (event) => {
    return await mainWindow.webContents.getPrintersAsync();
  });

// 2. Handle the actual print job
  ipcMain.handle('print-job', async (event, { filePath, printerName, copies, duplex, color }) => {
    return new Promise((resolve, reject) => {
      
      let printWindow = new BrowserWindow({ 
        show: false,
        webPreferences: {
          plugins: true // CRITICAL: This enables the internal Chromium PDF Viewer
        }
      });
      
      printWindow.loadFile(filePath);
      
      // Wait for 'ready-to-show' instead of 'did-finish-load' 
      // This ensures the DOM and plugins are fully initialized
      printWindow.once('ready-to-show', () => {
        
        // Add a slight delay to allow the PDF renderer to actually "paint" the pages.
        // If it's a very large PDF, you might need to bump this to 1000ms.
        setTimeout(() => {
          printWindow.webContents.print({
            silent: true,
            deviceName: printerName,
            copies: copies,
            color: color === 'color',
            duplexMode: duplex === 'double' ? 'longEdge' : 'simplex'
          }, (success, errorType) => {
            if (!success) {
              reject(errorType);
            }
            printWindow.close();
            resolve(success);
          });
        }, 800); // 800ms buffer for rendering
        
      });
    });
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});