const { app, BrowserWindow, Tray, Menu, ipcMain, screen } = require('electron');
const path = require('path');
const url = require('url');
const WebSocket = require('ws');
const Store = require('electron-store');

// 配置存储
const store = new Store();

// 全局变量
let mainWindow = null;
let floatingWindow = null;
let tray = null;
let wss = null;
let lastData = null;

// 应用准备就绪时
app.whenReady().then(() => {
  createMainWindow();
  createTray();
  startWebSocketServer();
  
  // 如果存储中有窗口位置和大小，则恢复
  const floatingWindowBounds = store.get('floatingWindowBounds');
  if (floatingWindowBounds) {
    createFloatingWindow(floatingWindowBounds);
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// 所有窗口关闭时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  if (wss) {
    wss.close();
  }
});

// 创建主窗口
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });
  
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // 开发环境打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 创建悬浮窗
function createFloatingWindow(bounds = null) {
  // 如果已经存在，则显示并返回
  if (floatingWindow) {
    floatingWindow.show();
    return;
  }
  
  // 获取屏幕尺寸
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  // 默认窗口配置
  const defaultBounds = {
    width: 300,
    height: 200,
    x: width - 350,
    y: 100
  };
  
  // 使用保存的位置或默认位置
  const windowBounds = bounds || defaultBounds;
  
  floatingWindow = new BrowserWindow({
    ...windowBounds,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  floatingWindow.loadFile(path.join(__dirname, 'floating.html'));
  
  // 窗口移动或调整大小时保存位置
  ['move', 'resize'].forEach(event => {
    floatingWindow.on(event, () => {
      if (!floatingWindow.isDestroyed()) {
        store.set('floatingWindowBounds', floatingWindow.getBounds());
      }
    });
  });
  
  floatingWindow.on('closed', () => {
    floatingWindow = null;
  });
  
  // 如果有最新数据，则发送到悬浮窗
  if (lastData) {
    floatingWindow.webContents.on('did-finish-load', () => {
      floatingWindow.webContents.send('update-data', lastData);
    });
  }
}

// 创建系统托盘
function createTray() {
  tray = new Tray(path.join(__dirname, 'assets/icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '显示主窗口', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createMainWindow();
        }
      }
    },
    { 
      label: '显示/隐藏悬浮窗', 
      click: () => {
        if (floatingWindow) {
          if (floatingWindow.isVisible()) {
            floatingWindow.hide();
          } else {
            floatingWindow.show();
          }
        } else {
          createFloatingWindow();
        }
      }
    },
    { type: 'separator' },
    { 
      label: '退出', 
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('桌面数据监控工具');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (floatingWindow) {
      if (floatingWindow.isVisible()) {
        floatingWindow.hide();
      } else {
        floatingWindow.show();
      }
    } else {
      createFloatingWindow();
    }
  });
}

// 启动WebSocket服务器
function startWebSocketServer() {
  const port = store.get('wsPort', 8080);
  
  wss = new WebSocket.Server({ port });
  
  console.log(`WebSocket server started on port ${port}`);
  
  wss.on('connection', (ws) => {
    console.log('Client connected');
    
    // 发送连接成功消息
    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected'
    }));
    
    // 接收消息
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log('Received data:', data);
        
        // 保存最新数据
        lastData = data;
        
        // 如果悬浮窗存在，则发送数据
        if (floatingWindow && !floatingWindow.isDestroyed()) {
          floatingWindow.webContents.send('update-data', data);
        }
        
        // 如果主窗口存在，也发送数据
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-data', data);
        }
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
  
  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });
}

// 监听IPC消息
ipcMain.on('toggle-floating-window', () => {
  if (floatingWindow) {
    floatingWindow.destroy();
    floatingWindow = null;
  } else {
    createFloatingWindow();
  }
});

ipcMain.on('set-floating-window-always-on-top', (event, flag) => {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.setAlwaysOnTop(flag);
    store.set('alwaysOnTop', flag);
  }
});

ipcMain.on('set-floating-window-opacity', (event, opacity) => {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.setOpacity(opacity);
    store.set('windowOpacity', opacity);
  }
});

ipcMain.on('lock-floating-window', (event, locked) => {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.setMovable(!locked);
    floatingWindow.setResizable(!locked);
    store.set('windowLocked', locked);
  }
});

ipcMain.on('change-ws-port', (event, port) => {
  // 保存新端口
  store.set('wsPort', port);
  
  // 重启WebSocket服务器
  if (wss) {
    wss.close(() => {
      startWebSocketServer();
    });
  } else {
    startWebSocketServer();
  }
});