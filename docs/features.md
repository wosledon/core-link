# Core Link - 功能实现说明

## 已实现功能

### 1. 自定义窗体 (无边框窗体)
- **配置**: `tauri.conf.json` 中设置 `decorations: false`
- **实现**: 
  - 完全隐藏原生 Windows 标题栏和边框
  - 启用透明背景 (`transparent: true`)
  - 保留窗口阴影 (`shadow: true`)
  - 自定义标题栏组件 (`src/components/TitleBar.tsx`)

### 2. 自定义标题栏
- **位置**: `src/components/TitleBar.tsx`
- **功能**:
  - 应用图标和名称显示
  - 菜单按钮（设置、退出）
  - 窗口控制按钮（最小化、最大化、关闭）
  - 支持拖拽移动窗口
  - 双击标题栏最大化/还原

### 3. 系统托盘
- **后端**: `src-tauri/src/lib.rs`
- **功能**:
  - 托盘图标显示
  - 右键菜单（显示、隐藏、退出）
  - 左键点击切换窗口显示/隐藏
  - 关闭窗口时最小化到托盘（而非退出）

### 4. 开机自启动
- **插件**: `tauri-plugin-autostart`
- **配置**: 
  - 设置面板可开关
  - 支持 `--hidden` 参数静默启动
  - 状态同步到后端

### 5. 单实例应用
- **插件**: `tauri-plugin-single-instance`
  - 防止多开
  - 重复启动时激活已有窗口

### 6. 管理员权限
- **说明**: Windows 管理员权限需要在安装时配置
- **方法**: 
  - 安装程序 (NSIS) 使用 `installMode: perMachine` 安装到系统目录
  - 可在安装后手动设置兼容性选项
  - 或使用 `core-link.exe.manifest` 文件（需要额外配置）

### 7. 多语言支持 (i18n)
- **库**: `i18next` + `react-i18next`
- **位置**: `src/i18n/`
- **支持语言**:
  - 简体中文 (zh-CN)
  - English (en)
- **功能**:
  - 自动检测系统语言
  - 本地存储语言偏好
  - 设置面板切换

### 8. 明暗主题切换
- **位置**: `src/hooks/useTheme.ts`
- **主题选项**:
  - 浅色 (Light)
  - 深色 (Dark)
  - 跟随系统 (System)
- **实现**:
  - CSS 变量定义主题色
  - `dark` 类切换主题
  - 本地存储主题偏好
  - 监听系统主题变化

## 项目结构

```
src/
├── components/          # React 组件
│   ├── TitleBar.tsx    # 自定义标题栏
│   ├── TitleBar.css    # 标题栏样式
│   ├── SettingsPanel.tsx # 设置面板
│   └── SettingsPanel.css # 设置面板样式
├── hooks/              # 自定义 Hooks
│   ├── useTheme.ts     # 主题管理
│   └── useSettings.ts  # 设置管理
├── i18n/               # 国际化
│   ├── index.ts        # i18n 配置
│   └── locales/        # 语言文件
│       ├── zh-CN.json
│       └── en.json
├── styles/             # 全局样式
│   └── theme.css       # 主题变量
├── types/              # TypeScript 类型
│   └── index.ts
├── App.tsx             # 主应用组件
└── main.tsx            # 入口文件

src-tauri/
├── src/
│   ├── lib.rs          # Tauri 后端逻辑
│   └── main.rs         # 入口
├── Cargo.toml          # Rust 依赖
├── tauri.conf.json     # Tauri 配置
└── core-link.exe.manifest  # Windows 清单（管理员权限）
```

## 构建输出

构建成功后，安装包位于：
- MSI: `src-tauri/target/release/bundle/msi/Core Link_0.1.0_x64_en-US.msi`
- NSIS: `src-tauri/target/release/bundle/nsis/Core Link_0.1.0_x64-setup.exe`

## 开发命令

```bash
# 开发模式
npm run tauri dev

# 构建
npm run tauri build

# 仅构建前端
npm run build
```

## 注意事项

1. **管理员权限**: 如需强制管理员权限运行，需要额外配置 Windows 清单文件或使用外部工具
2. **系统托盘**: 关闭窗口会最小化到托盘，完全退出需通过托盘菜单
3. **自启动**: 需要管理员权限才能修改自启动设置
4. **单实例**: 应用启动时会检查是否已有实例运行
