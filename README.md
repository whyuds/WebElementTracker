# WebElementTracker

一个强大的桌面工具，可以实时监控特定的网页元素，并将其变化直接显示在您的屏幕上。这个不显眼的小部件会固定在您的工作区顶部，为您提供对最重要数据的即时可见性。

## 功能

- 实时监控网页元素的变化
- 桌面悬浮窗口显示关键数据
- 支持Windows和macOS平台
- Chrome扩展配合桌面应用使用

## 开发

### 环境要求

- Node.js 14或更高版本
- npm 6或更高版本

### 安装依赖

```bash
npm install
```

### 运行开发环境

```bash
npm start
```

## 构建

本项目使用GitHub Actions自动构建Windows和macOS版本的桌面应用。每次推送到main分支或创建新的版本标签时，都会触发自动构建流程。

### 本地构建

#### 构建所有平台
```bash
npm run build
```

#### 仅构建Windows版本
```bash
npm run build:win
```

#### 仅构建macOS版本
```bash
npm run build:mac
```

构建后的文件将保存在`dist`目录中。

### 自动化构建

项目配置了GitHub Actions工作流程，自动完成以下任务：

1. 在每次推送到main分支或创建新的版本标签时触发构建
2. 在Windows和macOS环境下分别编译应用
3. 打包Chrome扩展为zip文件
4. 上传构建产物作为工作流程的制品
5. 当创建版本标签（格式为`v*`）时，自动创建GitHub Release并上传构建好的安装包和Chrome扩展

## 发布新版本

1. 更新`package.json`中的版本号
2. 提交更改并推送到GitHub
3. 创建新的版本标签（例如`v1.0.1`）并推送到GitHub
4. GitHub Actions将自动构建应用并创建新的Release

## 扩展开发

项目包含一个Chrome扩展，位于`extension`目录中。扩展通过WebSocket与桌面应用通信，实现网页元素的监控功能。

## 许可证

MIT