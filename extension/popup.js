// 全局变量
let port = null;
let isMonitoring = false;
let websocket = null;
let selectedSelector = '';

// DOM元素
const selectElementBtn = document.getElementById('selectElement');
const selectedElementInfo = document.getElementById('selectedElementInfo');
const elementSelectorSpan = document.getElementById('elementSelector');
const elementPreviewSpan = document.getElementById('elementPreview');
const monitorIntervalInput = document.getElementById('monitorInterval');
const wsAddressInput = document.getElementById('wsAddress');
const connectWsBtn = document.getElementById('connectWs');
const downloadAppBtn = document.getElementById('downloadApp');
const startMonitoringBtn = document.getElementById('startMonitoring');
const stopMonitoringBtn = document.getElementById('stopMonitoring');
const connectionStatus = document.getElementById('connectionStatus');

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 从存储中加载设置
  const settings = await loadSettings();
  applySettings(settings);

  // 连接到background script
  connectToBackground();

  // 检查当前是否正在监控
  checkMonitoringStatus();
});

// 事件监听器
selectElementBtn.addEventListener('click', selectElement);
connectWsBtn.addEventListener('click', connectToDesktopApp);
downloadAppBtn.addEventListener('click', openDownloadPage);
startMonitoringBtn.addEventListener('click', startMonitoring);
stopMonitoringBtn.addEventListener('click', stopMonitoring);
monitorIntervalInput.addEventListener('change', saveSettings);
wsAddressInput.addEventListener('change', saveSettings);

// 打开下载页面
function openDownloadPage() {
  chrome.tabs.create({ url: 'https://github.com/whyuds/WebElementTracker/releases' });
}

// 连接到background script
function connectToBackground() {
  port = chrome.runtime.connect({ name: 'popup' });
  
  port.onMessage.addListener((message) => {
    console.log('Received message from background:', message);
    
    if (message.type === 'elementSelected') {
      handleElementSelected(message.selector, message.preview);
    } else if (message.type === 'monitoringStatus') {
      updateMonitoringStatus(message.isMonitoring);
    } else if (message.type === 'connectionStatus') {
      updateConnectionStatus(message.connected);
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('Disconnected from background script');
    port = null;
  });
}

// 选择元素
async function selectElement() {
  // 获取当前标签页
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // 向background发送消息，请求选择元素
  if (port) {
    port.postMessage({ type: 'selectElement', tabId: tab.id });
  }
  
  // 关闭弹出窗口，以便用户可以选择元素
  window.close();
}

// 处理元素选择结果
function handleElementSelected(selector, preview) {
  selectedSelector = selector;
  elementSelectorSpan.textContent = selector;
  elementPreviewSpan.textContent = preview;
  selectedElementInfo.classList.remove('hidden');
  
  // 如果已连接到桌面应用，则启用开始监控按钮
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    startMonitoringBtn.disabled = false;
  }
  
  saveSettings();
}

// 连接到桌面应用
function connectToDesktopApp() {
  const wsAddress = wsAddressInput.value.trim();
  
  if (port) {
    port.postMessage({ 
      type: 'connectWebSocket', 
      address: wsAddress 
    });
  }
}

// 开始监控
function startMonitoring() {
  if (!selectedSelector) {
    alert('Please select the element you want to monitor first');
    return;
  }
  
  const interval = parseInt(monitorIntervalInput.value, 10) || 5;
  
  if (port) {
    port.postMessage({ 
      type: 'startMonitoring', 
      selector: selectedSelector,
      interval: interval * 1000 // 转换为毫秒
    });
  }
}

// 停止监控
function stopMonitoring() {
  if (port) {
    port.postMessage({ type: 'stopMonitoring' });
  }
}

// 更新监控状态
function updateMonitoringStatus(monitoring) {
  isMonitoring = monitoring;
  startMonitoringBtn.disabled = monitoring || !selectedSelector || !(websocket && websocket.readyState === WebSocket.OPEN);
  stopMonitoringBtn.disabled = !monitoring;
}

// 更新连接状态
function updateConnectionStatus(connected) {
  if (connected) {
    connectionStatus.classList.add('connected');
    if (selectedSelector) {
      startMonitoringBtn.disabled = false;
    }
  } else {
    connectionStatus.classList.remove('connected');
    startMonitoringBtn.disabled = true;
  }
}

// 检查当前监控状态
function checkMonitoringStatus() {
  if (port) {
    port.postMessage({ type: 'getStatus' });
  }
}

// 加载设置
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['selector', 'interval', 'wsAddress'], (result) => {
      resolve({
        selector: result.selector || '',
        interval: result.interval || 5,
        wsAddress: result.wsAddress || 'ws://localhost:9555'
      });
    });
  });
}

// 应用设置
function applySettings(settings) {
  if (settings.selector) {
    selectedSelector = settings.selector;
    elementSelectorSpan.textContent = settings.selector;
    selectedElementInfo.classList.remove('hidden');
  }
  
  monitorIntervalInput.value = settings.interval;
  wsAddressInput.value = settings.wsAddress;
}

// 保存设置
function saveSettings() {
  const settings = {
    selector: selectedSelector,
    interval: parseInt(monitorIntervalInput.value, 10) || 5,
    wsAddress: wsAddressInput.value.trim()
  };
  
  chrome.storage.local.set(settings, () => {
    console.log('Settings saved:', settings);
  });
}