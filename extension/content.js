// 这个文件主要用于接收来自background.js的消息，并与页面DOM交互
// 大部分功能已经在background.js中通过executeScript实现，这里作为补充

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'checkElement') {
    const element = document.querySelector(message.selector);
    sendResponse({ exists: !!element });
    return true;
  }
  
  if (message.type === 'getElementContent') {
    const element = document.querySelector(message.selector);
    if (element) {
      sendResponse({
        text: element.textContent.trim(),
        html: element.innerHTML
      });
    } else {
      sendResponse({ error: 'Element not found' });
    }
    return true;
  }
});

// 检查页面加载完成后是否需要恢复监控
document.addEventListener('DOMContentLoaded', () => {
  // 通知background脚本页面已加载
  chrome.runtime.sendMessage({ type: 'pageLoaded', url: window.location.href });
});