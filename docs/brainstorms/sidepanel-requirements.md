# 浏览器侧边栏（Side Panel）功能需求

**日期**: 2026-04-12
**状态**: 待实施

## 背景

当前插件的主界面（历史记录、收藏夹、AI搜索等）以独立标签页形式打开（`my-history.html`），用户无法在浏览其他网页时同时使用插件功能。需要利用浏览器原生 Side Panel API 实现侧边栏，让用户可以在浏览任意网页时随时使用插件。

## 目标

- 新增浏览器原生侧边栏入口，复用现有 my-history 应用
- 侧边栏模式下自适应布局（隐藏 160px 左侧导航栏，改用紧凑导航）
- 不影响现有功能：标签页模式、Popup、后台同步等全部保持不变

## Popup 变更

在 `entrypoints/popup/App.tsx` 的「打开历史记录页面」按钮下方，新增一个「在侧边栏中打开」按钮，调用 `chrome.sidePanel.open()` 打开侧边栏。除此之外 Popup 的其他功能保持不变。

## 非目标

- 不修改 Popup 弹窗的其他功能（同步按钮、全量同步等）
- 不精简功能页面（侧边栏包含所有页面，只是导航方式不同）
- 不支持 Firefox sidebar_action（可后续扩展，本次仅 Chrome/Edge side_panel）

## 方案

### 1. 新增 WXT sidepanel 入口

在 `entrypoints/` 下新建 `sidepanel/` 目录，作为 WXT 的 sidepanel 类型入口：

```
entrypoints/sidepanel/
  index.html
  main.tsx
  style.css
```

`index.html` 中通过 `<title>` 设置侧边栏标题。

### 2. 自适应布局

在 `my-history/App.tsx` 的 `MainLayout` 中检测当前是否运行在侧边栏环境：

- 检测方式：通过 URL 判断（sidepanel.html vs my-history.html），或通过 React Context 传入模式标识
- 侧边栏模式下：隐藏左侧 `<Sidebar />` 组件，改为顶部紧凑导航栏（汉堡菜单或水平标签栏）
- 标签页模式下：保持现有 160px 左侧导航不变

### 3. 共享代码

sidepanel 入口的 `App.tsx` 直接复用 `my-history/App.tsx` 的路由和页面组件，仅传入一个 `isSidepanel` 标识来切换布局模式。避免代码重复。

### 4. manifest 权限

在 `wxt.config.ts` 的 `manifest.permissions` 中添加 `"sidePanel"`。

## 验收标准

1. 安装插件后，浏览器侧边栏列表中出现「Bilibili 无限历史记录」
2. 打开侧边栏后，显示紧凑布局的完整应用（历史记录、收藏夹、AI搜索等所有页面可达）
3. 侧边栏可在浏览任意网页时保持打开
4. 原有标签页模式（通过 Popup 的「打开历史记录页面」按钮）功能不受影响
5. Popup 弹窗行为不变
6. 后台同步功能不受影响
