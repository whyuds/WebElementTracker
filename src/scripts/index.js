// DOM元素
const connectionStatus = document.getElementById('connectionStatus');
const wsPortInput = document.getElementById('wsPort');
const changePortBtn = document.getElementById('changePortBtn');
const toggleFloatingBtn = document.getElementById('toggleFloatingBtn');
const alwaysOnTopCheckbox = document.getElementById('alwaysOnTop');
const windowOpacitySlider = document.getElementById('windowOpacity');
const opacityValueSpan = document.getElementById('opacityValue');
const lockWindowCheckbox = document.getElementById('lockWindow');
const monitorDataContainer = document.getElementById('monitorDataContainer');

// 从主进程获取electron
const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const store = new Store();

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 加载保存的设置
  loadSettings();
  
  // 添加事件监听器
  changePortBtn.addEventListener('click', changePort);
  toggleFloatingBtn.addEventListener('click', toggleFloatingWindow);
  alwaysOnTopCheckbox.addEventListener('change', setAlwaysOnTop);
  windowOpacitySlider.addEventListener('input', updateOpacityValue);
  windowOpacitySlider.addEventListener('change', setWindowOpacity);
  lockWindowCheckbox.addEventListener('change', setWindowLock);
});

// 加载设置
function loadSettings() {
  // 加载WebSocket端口
  const port = store.get('wsPort', 9555);
  wsPortInput.value = port;
  
  // 加载窗口设置
  const alwaysOnTop = store.get('alwaysOnTop', true);
  alwaysOnTopCheckbox.checked = alwaysOnTop;
  
  const opacity = store.get('windowOpacity', 0.9);
  windowOpacitySlider.value = opacity;
  opacityValueSpan.textContent = opacity;
  
  const locked = store.get('windowLocked', false);
  lockWindowCheckbox.checked = locked;
}

// 更改WebSocket端口
function changePort() {
  const port = parseInt(wsPortInput.value, 10);
  
  if (isNaN(port) || port < 1024 || port > 65535) {
    alert('请输入有效的端口号（1024-65535）');
    return;
  }
  
  ipcRenderer.send('change-ws-port', port);
}

// 切换悬浮窗显示/隐藏
function toggleFloatingWindow() {
  ipcRenderer.send('toggle-floating-window');
}

// 设置悬浮窗始终置顶
function setAlwaysOnTop() {
  ipcRenderer.send('set-floating-window-always-on-top', alwaysOnTopCheckbox.checked);
}

// 更新透明度显示值
function updateOpacityValue() {
  opacityValueSpan.textContent = windowOpacitySlider.value;
}

// 设置悬浮窗透明度
function setWindowOpacity() {
  ipcRenderer.send('set-floating-window-opacity', parseFloat(windowOpacitySlider.value));
}

// 设置悬浮窗锁定
function setWindowLock() {
  ipcRenderer.send('lock-floating-window', lockWindowCheckbox.checked);
}

// 监听来自主进程的消息
ipcRenderer.on('update-data', (event, data) => {
  updateConnectionStatus(true);
  updateDataDisplay(data);
});

// 更新连接状态
function updateConnectionStatus(connected) {
  if (connected) {
    connectionStatus.classList.add('connected');
  } else {
    connectionStatus.classList.remove('connected');
  }
}

// 更新数据显示
function updateDataDisplay(data) {
  // 清空容器
  monitorDataContainer.innerHTML = '';
  
  // 创建数据显示元素
  const dataElement = document.createElement('div');
  
  // 添加数据内容
  if (data.text) {
    const textElement = document.createElement('p');
    textElement.textContent = `content: ${data.text}`;
    dataElement.appendChild(textElement);
  }
  
  // 添加来源URL
  if (data.url) {
    const urlElement = document.createElement('p');
    urlElement.innerHTML = `source: <a href="${data.url}" target="_blank">${data.url}</a>`;
    dataElement.appendChild(urlElement);
  }
  
  // 添加时间戳
  if (data.timestamp) {
    const timeElement = document.createElement('p');
    const date = new Date(data.timestamp);
    timeElement.textContent = `Updated: ${date.toLocaleString()}`;
    dataElement.appendChild(timeElement);
  }
  
  // 将数据元素添加到容器
  monitorDataContainer.appendChild(dataElement);
}