# 项目上下文（Project Context）

## 项目目标
- Core Link 是专业音频路由桌面应用，目标是以低学习成本完成路由配置。

## 当前范围（MVP）
- 节点管理（增删改启停）
- 路由连线（创建/删除/基础校验）
- 自动布线推荐
- 拓扑可视化（拖拽、缩放、高亮）
- 本地工程保存/加载（JSON）

## 技术栈
- 前端：React + TypeScript + Vite
- 桌面壳：Tauri
- 本地后端：Rust

## 稳定协作约束
- Plan 前必须先阅读 `DESIGN.md`。
- 单次任务仅修改与目标直接相关的代码。
- 关键接口行为变化必须写入交接摘要。
- 验证遵循“先最小、再扩大”。

## 常用命令
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run tauri dev`
