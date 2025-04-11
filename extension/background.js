// 全局变量
let websocket = null;
let isMonitoring = false;
let monitoringTabId = null;
let monitoringSelector = null;
let monitoringInterval = 5000; // 默认5秒
let monitoringIntervalId = null;
let popupPort = null;
let messageQueue = []; // 消息队列
let lastMonitorData = null; // 上次监控数据
let monitoringAlarmName = 'elementMonitorAlarm'; // 定时器名称
let retryCount = 0; // 重试计数器
let maxRetries = 3; // 最大重试次数

// 监听页面刷新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isMonitoring && tabId === monitoringTabId) {
    // 页面刷新完成且是之前监控的标签页
    console.log('Tab refreshed, reinjecting monitor script');
    chrome.scripting.executeScript({
      target: { tabId: monitoringTabId },
      function: injectMonitor,
      args: [monitoringSelector, monitoringInterval]
    }).catch(error => {
      console.error('Failed to reinject monitor script:', error);
    });
  }
});

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
    document.removeEventListener('click', window._elementSelectorClickHandler, true); // 移除捕获阶段的点击事件监听器
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
    // 在事件捕获阶段就阻止事件传播和默认行为
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation(); // 阻止其他事件监听器被调用
    
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
    document.removeEventListener('click', window._elementSelectorClickHandler, true); // 移除捕获阶段的点击事件监听器
    document.removeEventListener('mouseover', window._elementSelectorMouseoverHandler);
    document.removeEventListener('mouseout', window._elementSelectorMouseoutHandler);
    document.body.removeChild(highlight);
    window._elementSelectorActive = false;
    
    // 显示成功选择的提示
    const successToast = document.createElement('div');
    successToast.textContent = '元素已成功选择！请返回插件窗口继续操作';
    successToast.style.position = 'fixed';
    successToast.style.top = '20px';
    successToast.style.left = '50%';
    successToast.style.transform = 'translateX(-50%)';
    successToast.style.padding = '10px 20px';
    successToast.style.backgroundColor = '#4CAF50';
    successToast.style.color = '#fff';
    successToast.style.borderRadius = '4px';
    successToast.style.zIndex = '10001';
    successToast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    document.body.appendChild(successToast);
    
    // 尝试重新打开插件窗口
    try {
      chrome.runtime.sendMessage({
        type: 'reopenPopup'
      });
    } catch (error) {
      console.log('无法自动重新打开插件窗口', error);
    }
    
    setTimeout(() => {
      if (document.body.contains(successToast)) {
        document.body.removeChild(successToast);
      }
    }, 5000);
  };
  
  // 生成CSS选择器
  function generateSelector(el) {
    // If element has an ID, use it (most specific)
    if (el.id) {
      return `#${el.id}`;
    }
    
    // Start with the element's tag
    let selector = el.tagName.toLowerCase();
    
    // Add classes if available
    if (el.className) {
      const classes = Array.from(el.classList)
        .filter(cls => !cls.includes(' '))  // Filter out complex classes
        .join('.');
      
      if (classes) {
        selector += `.${classes}`;
      }
    }
    
    // Add attributes that can help identify the element
    ['name', 'type', 'role', 'data-testid'].forEach(attr => {
      if (el.hasAttribute(attr)) {
        selector += `[${attr}="${el.getAttribute(attr)}"]`;
      }
    });
    
    // Check if this selector is still not specific enough
    let matchCount = document.querySelectorAll(selector).length;
    
    // If the selector isn't specific enough, add structural information
    if (matchCount > 1) {
      // Try adding nth-child
      let parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(el);
        const nthChild = `:nth-child(${index + 1})`;
        
        const moreSpecificSelector = `${selector}${nthChild}`;
        if (document.querySelectorAll(moreSpecificSelector).length === 1) {
          return moreSpecificSelector;
        }
        
        // If still not specific enough, build a path with parent elements
        let path = selector;
        let currentElement = el;
        let depth = 0;
        const maxDepth = 3; // Limit the depth to avoid overly complex selectors
        
        while (matchCount > 1 && depth < maxDepth && currentElement.parentElement) {
          currentElement = currentElement.parentElement;
          let parentSelector = currentElement.tagName.toLowerCase();
          
          // Add parent's ID if available
          if (currentElement.id) {
            path = `#${currentElement.id} > ${path}`;
            break;
          }
          
          // Add parent's class if available
          if (currentElement.className) {
            const parentClasses = Array.from(currentElement.classList)
              .filter(cls => !cls.includes(' '))
              .join('.');
            
            if (parentClasses) {
              parentSelector += `.${parentClasses}`;
            }
          }
          
          path = `${parentSelector} > ${path}`;
          matchCount = document.querySelectorAll(path).length;
          depth++;
        }
        
        return path;
      }
    }
    
    return selector;
  }
  
  
  // 添加事件监听器，使用捕获阶段(第三个参数为true)来确保在元素自身的事件处理前拦截
  document.addEventListener('mouseover', window._elementSelectorMouseoverHandler);
  document.addEventListener('mouseout', window._elementSelectorMouseoutHandler);
  document.addEventListener('click', window._elementSelectorClickHandler, true); // 在捕获阶段处理点击事件
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
  
  if (message.type === 'reopenPopup') {
    console.log('Attempting to reopen popup');
    // 尝试重新打开popup窗口
    // 注意：由于Chrome扩展API的限制，这个功能可能不会在所有情况下都有效
    try {
      // Chrome MV3中尝试使用action API打开popup
      if (chrome.action && chrome.action.openPopup) {
        chrome.action.openPopup();
      }
    } catch (error) {
      console.error('Failed to reopen popup:', error);
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
    
    // 保存地址以便重连
    if (popupPort) {
      popupPort._lastAddress = address;
    }
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      updateConnectionStatus(true);
      
      // 如果有最后监控的数据，尝试重新发送
      if (lastMonitorData && isMonitoring) {
        sendDataToDesktopApp(lastMonitorData);
      }
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

// 更新扩展图标
function updateExtensionIcon(isMonitoring) {
  const iconPath = isMonitoring ? {
    16: 'images/icon_16_active.png',
    48: 'images/icon_48_active.png',
    128: 'images/icon_128_active.png'
  } : {
    16: 'images/icon_16.png',
    48: 'images/icon_48.png',
    128: 'images/icon_128.png'
  };

  chrome.action.setIcon({ path: iconPath });
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
    updateExtensionIcon(true);
    sendStatusToPopup();
    
    // 设置定时器，确保即使在后台也能继续监控
    // 先清除可能存在的旧定时器
    chrome.alarms.clear(monitoringAlarmName);
    
    // 创建新的定时器，间隔时间与监控间隔相同
    chrome.alarms.create(monitoringAlarmName, {
      periodInMinutes: monitoringInterval / (1000 * 60) // 转换为分钟
    });
    
    console.log(`Alarm created with interval: ${monitoringInterval / (1000 * 60)} minutes`);
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
  
  // 清除定时器
  chrome.alarms.clear(monitoringAlarmName);
  console.log('Monitoring alarm cleared');
  
  isMonitoring = false;
  monitoringTabId = null;
  monitoringSelector = null;
  retryCount = 0;
  updateExtensionIcon(false);
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
      lastMonitorData = data; // 保存最后一次成功发送的数据
      retryCount = 0; // 重置重试计数
    } catch (error) {
      console.error('Failed to send data to desktop app:', error);
      handleSendError();
    }
  } else if (websocket) {
    console.warn('WebSocket not open, attempting to reconnect...');
    handleSendError();
  }
}

// 处理发送错误
function handleSendError() {
  if (retryCount < maxRetries) {
    retryCount++;
    console.log(`Retry attempt ${retryCount} of ${maxRetries}`);
    // 尝试重新连接WebSocket
    if (popupPort) {
      const lastAddress = popupPort._lastAddress || 'ws://localhost:9555';
      connectWebSocket(lastAddress);
    }
  } else {
    console.error('Max retries reached, giving up');
    retryCount = 0;
  }
}

// 监听alarm事件
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === monitoringAlarmName && isMonitoring) {
    console.log('Alarm triggered, performing monitoring task');
    performMonitoring();
  }
});

// 执行监控任务
async function performMonitoring() {
  if (!isMonitoring || !monitoringTabId) return;
  
  try {
    // 检查标签页是否仍然存在
    const tab = await chrome.tabs.get(monitoringTabId).catch(() => null);
    if (!tab) {
      console.warn('Monitored tab no longer exists');
      stopMonitoring();
      return;
    }
    
    // 执行监控脚本
    const results = await chrome.scripting.executeScript({
      target: { tabId: monitoringTabId },
      function: () => {
        // 检查元素是否存在
        if (!window._monitorInfo) return null;
        
        const selector = window._monitorInfo.selector;
        const element = document.querySelector(selector);
        
        if (element) {
          return {
            text: element.textContent.trim(),
            html: element.innerHTML,
            url: window.location.href,
            timestamp: new Date().toISOString()
          };
        } else {
          console.warn(`Element not found: ${selector}`);
          return null;
        }
      }
    });
    
    // 处理结果
    if (results && results[0] && results[0].result) {
      sendDataToDesktopApp(results[0].result);
    }
  } catch (error) {
    console.error('Error during background monitoring:', error);
  }
}