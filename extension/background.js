// 全局变量
let websocket = null;
let isMonitoring = false;
let monitoringTabId = null;
let monitoringSelector = null;
let monitoringInterval = 5000; // 默认5秒
let monitoringIntervalId = null;
let popupPort = null;
let messageQueue = []; // 消息队列

// 监听来自popup的连接
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    console.log('Popup connected');
    popupPort = port;
    
    // 发送当前状态
    sendStatusToPopup();
    
    // 发送队列中的消息
    while (messageQueue.length > 0) {
      const message = messageQueue.shift();
      popupPort.postMessage(message);
    }
    
    // 监听来自popup的消息
    port.onMessage.addListener(handlePopupMessage);
    
    // 监听断开连接
    port.onDisconnect.addListener(() => {
      console.log('Popup disconnected');
      popupPort = null;
    });
  }
});

// 处理来自popup的消息
function handlePopupMessage(message) {
  console.log('Received message from popup:', message);
  
  switch (message.type) {
    case 'selectElement':
      injectElementSelector(message.tabId);
      break;
    case 'connectWebSocket':
      connectWebSocket(message.address);
      break;
    case 'startMonitoring':
      startMonitoring(message.selector, message.interval);
      break;
    case 'stopMonitoring':
      stopMonitoring();
      break;
    case 'getStatus':
      sendStatusToPopup();
      break;
  }
}

// 注入元素选择器脚本
async function injectElementSelector(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: setupElementSelector
    });
  } catch (error) {
    console.error('Failed to inject element selector:', error);
  }
}

// 元素选择器设置函数（在目标页面中执行）
function setupElementSelector() {
  // 如果已经存在选择器，则移除
  if (window._elementSelectorActive) {
    document.removeEventListener('click', window._elementSelectorClickHandler);
    document.removeEventListener('mouseover', window._elementSelectorMouseoverHandler);
    document.removeEventListener('mouseout', window._elementSelectorMouseoutHandler);
    if (window._elementSelectorHighlight) {
      document.body.removeChild(window._elementSelectorHighlight);
    }
    window._elementSelectorActive = false;
    return;
  }
  
  // 创建高亮元素
  const highlight = document.createElement('div');
  highlight.style.position = 'absolute';
  highlight.style.border = '2px solid #4285f4';
  highlight.style.backgroundColor = 'rgba(66, 133, 244, 0.1)';
  highlight.style.pointerEvents = 'none';
  highlight.style.zIndex = '10000';
  highlight.style.display = 'none';
  document.body.appendChild(highlight);
  window._elementSelectorHighlight = highlight;
  
  // 当前悬停的元素
  let currentElement = null;
  
  // 鼠标悬停处理
  window._elementSelectorMouseoverHandler = function(event) {
    event.stopPropagation();
    currentElement = event.target;
    const rect = currentElement.getBoundingClientRect();
    highlight.style.top = `${rect.top + window.scrollY}px`;
    highlight.style.left = `${rect.left + window.scrollX}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    highlight.style.display = 'block';
  };
  
  // 鼠标移出处理
  window._elementSelectorMouseoutHandler = function() {
    highlight.style.display = 'none';
  };
  
  // 点击处理
  window._elementSelectorClickHandler = function(event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (!currentElement) return;
    
    // 生成CSS选择器
    const selector = generateSelector(currentElement);
    const preview = currentElement.textContent.trim().substring(0, 50) + 
                   (currentElement.textContent.trim().length > 50 ? '...' : '');
    
    // 发送消息到background script
    chrome.runtime.sendMessage({
      type: 'elementSelected',
      selector: selector,
      preview: preview
    });
    
    // 清理
    document.removeEventListener('click', window._elementSelectorClickHandler);
    document.removeEventListener('mouseover', window._elementSelectorMouseoverHandler);
    document.removeEventListener('mouseout', window._elementSelectorMouseoutHandler);
    document.body.removeChild(highlight);
    window._elementSelectorActive = false;
  };
  
  // 生成CSS选择器
  function generateSelector(el) {
    if (el.id) {
      return `#${el.id}`;
    }
    
    if (el.className) {
      const classes = Array.from(el.classList).join('.');
      return `.${classes}`;
    }
    
    let selector = el.tagName.toLowerCase();
    let parent = el.parentElement;
    
    if (parent) {
      const siblings = Array.from(parent.children);
      if (siblings.length > 1) {
        const index = siblings.indexOf(el);
        selector += `:nth-child(${index + 1})`;
      }
    }
    
    return selector;
  }
  
  // 添加事件监听器
  document.addEventListener('mouseover', window._elementSelectorMouseoverHandler);
  document.addEventListener('mouseout', window._elementSelectorMouseoutHandler);
  document.addEventListener('click', window._elementSelectorClickHandler);
  window._elementSelectorActive = true;
  
  // 显示提示
  const toast = document.createElement('div');
  toast.textContent = 'Click on the element you want to monitor';
  toast.style.position = 'fixed';
  toast.style.top = '20px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.padding = '10px 20px';
  toast.style.backgroundColor = '#333';
  toast.style.color = '#fff';
  toast.style.borderRadius = '4px';
  toast.style.zIndex = '10001';
  document.body.appendChild(toast);
  
  setTimeout(() => {
    document.body.removeChild(toast);
  }, 3000);
}

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'elementSelected') {
    console.log('Element selected:', message);
    // 将选择的元素信息转发给popup或加入消息队列
    const popupMessage = {
      type: 'elementSelected',
      selector: message.selector,
      preview: message.preview
    };
    
    if (popupPort) {
      popupPort.postMessage(popupMessage);
    } else {
      console.log('Popup port not available, queueing message');
      messageQueue.push(popupMessage);
    }
    return true;
  }
  
  if (message.type === 'monitorData') {
    // 将监控数据发送到桌面应用
    sendDataToDesktopApp(message.data);
    return true;
  }
});

// 连接WebSocket
function connectWebSocket(address) {
  // 如果已经连接，先关闭
  if (websocket) {
    websocket.close();
  }
  
  try {
    websocket = new WebSocket(address);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      updateConnectionStatus(true);
    };
    
    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      updateConnectionStatus(false);
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      updateConnectionStatus(false);
    };
    
    websocket.onmessage = (event) => {
      console.log('Received message from desktop app:', event.data);
      // 处理来自桌面应用的消息
    };
  } catch (error) {
    console.error('Failed to connect WebSocket:', error);
    updateConnectionStatus(false);
  }
}

// 更新连接状态
function updateConnectionStatus(connected) {
  if (popupPort) {
    popupPort.postMessage({ 
      type: 'connectionStatus', 
      connected: connected 
    });
  }
  
  // 如果断开连接，停止监控
  if (!connected && isMonitoring) {
    stopMonitoring();
  }
}

// 开始监控
async function startMonitoring(selector, interval) {
  // 获取当前活动标签页
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab) {
    console.error('No active tab found');
    return;
  }
  
  monitoringTabId = tab.id;
  monitoringSelector = selector;
  monitoringInterval = interval || 5000;
  
  // 注入监控脚本
  try {
    await chrome.scripting.executeScript({
      target: { tabId: monitoringTabId },
      function: injectMonitor,
      args: [monitoringSelector, monitoringInterval]
    });
    
    isMonitoring = true;
    sendStatusToPopup();
  } catch (error) {
    console.error('Failed to inject monitor script:', error);
  }
}

// 注入监控脚本（在目标页面中执行）
function injectMonitor(selector, interval) {
  // 如果已经在监控，先停止
  if (window._monitorIntervalId) {
    clearInterval(window._monitorIntervalId);
    window._monitorIntervalId = null;
  }
  
  // 监控函数
  function monitor() {
    const element = document.querySelector(selector);
    
    if (element) {
      const data = {
        text: element.textContent.trim(),
        html: element.innerHTML,
        url: window.location.href,
        timestamp: new Date().toISOString()
      };
      
      // 发送数据到background script
      chrome.runtime.sendMessage({
        type: 'monitorData',
        data: data
      });
    } else {
      console.warn(`Element not found: ${selector}`);
    }
  }
  
  // 立即执行一次
  monitor();
  
  // 设置定时器
  window._monitorIntervalId = setInterval(monitor, interval);
  
  // 存储监控信息
  window._monitorInfo = {
    selector: selector,
    interval: interval
  };
}

// 停止监控
async function stopMonitoring() {
  if (!monitoringTabId) return;
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId: monitoringTabId },
      function: () => {
        if (window._monitorIntervalId) {
          clearInterval(window._monitorIntervalId);
          window._monitorIntervalId = null;
          window._monitorInfo = null;
        }
      }
    });
  } catch (error) {
    console.error('Failed to stop monitoring:', error);
  }
  
  isMonitoring = false;
  monitoringTabId = null;
  monitoringSelector = null;
  sendStatusToPopup();
}

// 发送状态到popup
function sendStatusToPopup() {
  if (popupPort) {
    popupPort.postMessage({ 
      type: 'monitoringStatus', 
      isMonitoring: isMonitoring 
    });
    
    popupPort.postMessage({ 
      type: 'connectionStatus', 
      connected: websocket && websocket.readyState === WebSocket.OPEN 
    });
  }
}

// 发送数据到桌面应用
function sendDataToDesktopApp(data) {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    try {
      websocket.send(JSON.stringify(data));
    } catch (error) {
      console.error('Failed to send data to desktop app:', error);
    }
  }
}