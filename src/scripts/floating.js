// DOM元素
const dragHandle = document.getElementById('dragHandle');
const minimizeBtn = document.getElementById('minimizeBtn');
const closeBtn = document.getElementById('closeBtn');
const dataContainer = document.getElementById('dataContainer');
const dataSource = document.getElementById('dataSource');
const updateTime = document.getElementById('updateTime');

// 从主进程获取electron
const { ipcRenderer } = require('electron');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 添加事件监听器
  minimizeBtn.addEventListener('click', minimizeWindow);
  closeBtn.addEventListener('click', closeWindow);
  
  // 设置拖拽区域
  dragHandle.addEventListener('mousedown', handleDragStart);
});

// 最小化窗口
function minimizeWindow() {
  ipcRenderer.send('minimize-floating-window');
}

// 关闭窗口
function closeWindow() {
  ipcRenderer.send('close-floating-window');
}

// 处理拖拽开始
function handleDragStart(e) {
  // 确保不是在控制按钮上点击
  if (e.target.closest('.control-btn')) {
    return;
  }
  
  // 发送拖拽事件到主进程
  ipcRenderer.send('floating-window-drag-start');
}

// 监听来自主进程的数据更新消息
ipcRenderer.on('update-data', (event, data) => {
  updateDataDisplay(data);
});

// 更新数据显示
function updateDataDisplay(data) {
  // 清空容器
  dataContainer.innerHTML = '';
  
  // 显示文本内容
  if (data.text) {
    const textElement = document.createElement('div');
    textElement.className = 'data-text';
    textElement.textContent = data.text;
    dataContainer.appendChild(textElement);
  } else if (data.html) {
    // 如果没有纯文本但有HTML，则显示HTML内容
    // 注意：这里需要小心XSS风险，实际应用中应该进行更严格的过滤
    const htmlContainer = document.createElement('div');
    htmlContainer.className = 'data-html';
    htmlContainer.innerHTML = data.html;
    dataContainer.appendChild(htmlContainer);
  } else {
    // 没有内容
    const noDataElement = document.createElement('p');
    noDataElement.className = 'waiting';
    noDataElement.textContent = '无数据';
    dataContainer.appendChild(noDataElement);
  }
  
  // 更新来源信息
  if (data.url) {
    dataSource.textContent = `来源: ${new URL(data.url).hostname}`;
    dataSource.title = data.url; // 完整URL作为提示
  } else {
    dataSource.textContent = '来源: 未知';
  }
  
  // 更新时间戳
  if (data.timestamp) {
    const date = new Date(data.timestamp);
    updateTime.textContent = `更新时间: ${date.toLocaleTimeString()}`;
  } else {
    updateTime.textContent = '更新时间: --';
  }
}

// 处理窗口大小调整
let resizing = false;
let originalWidth, originalHeight, startX, startY;

// 在窗口边缘添加调整大小的功能
document.addEventListener('mousemove', (e) => {
  if (resizing) {
    const newWidth = originalWidth + (e.clientX - startX);
    const newHeight = originalHeight + (e.clientY - startY);
    
    if (newWidth > 200 && newHeight > 100) {
      ipcRenderer.send('resize-floating-window', { width: newWidth, height: newHeight });
    }
  } else {
    // 检测鼠标是否在窗口边缘
    const edgeSize = 5;
    const isOnRightEdge = window.innerWidth - e.clientX < edgeSize;
    const isOnBottomEdge = window.innerHeight - e.clientY < edgeSize;
    
    if (isOnRightEdge && isOnBottomEdge) {
      document.body.style.cursor = 'nwse-resize';
    } else if (isOnRightEdge) {
      document.body.style.cursor = 'ew-resize';
    } else if (isOnBottomEdge) {
      document.body.style.cursor = 'ns-resize';
    } else {
      document.body.style.cursor = 'default';
    }
  }
});

document.addEventListener('mousedown', (e) => {
  const edgeSize = 5;
  const isOnRightEdge = window.innerWidth - e.clientX < edgeSize;
  const isOnBottomEdge = window.innerHeight - e.clientY < edgeSize;
  
  if (isOnRightEdge || isOnBottomEdge) {
    resizing = true;
    originalWidth = window.innerWidth;
    originalHeight = window.innerHeight;
    startX = e.clientX;
    startY = e.clientY;
  }
});

document.addEventListener('mouseup', () => {
  resizing = false;
});

// 添加键盘快捷键
document.addEventListener('keydown', (e) => {
  // Esc键关闭窗口
  if (e.key === 'Escape') {
    closeWindow();
  }
});