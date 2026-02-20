# Core Link

Core Link 是一款现代 UI 的专业音频路由软件（类似 ASIOLinkPro），支持动态创建输入/输出设备与可视化连接。

## 1. 设计目标（MVP）

- 提供低学习成本的音频路由配置体验。
- 支持动态创建设备节点（输入/输出/中间处理节点）。
- 通过连线画布直观展示信号流向与连接关系。
- 支持自动布线与智能推荐路由，降低复杂场景配置成本。
- 保证配置可保存、可恢复、可快速切换。

## 2. 功能范围

### 2.1 本期包含
- 设备节点管理：新增、重命名、删除、启用/禁用。
- 路由连线管理：创建连接、删除连接、基础冲突校验（如重复连接）。
- 自动布线与推荐：基于节点类型与通道规则生成候选连接方案。
- 拓扑可视化：节点拖拽、缩放、选中高亮。
- 工程配置：本地保存/读取（JSON）。

### 2.2 本期不包含
- 云同步与多人协作。
- 高级 DSP（EQ、压缩、混响等）。

## 3. 信息架构与交互

- 左侧：设备面板（输入/输出设备列表 + 快速创建）。
- 中央：路由画布（节点 + 连线）。
- 右侧：属性面板（当前选中节点/连线属性）。
- 顶部：工程操作（新建、保存、加载、撤销/重做）。

关键交互流：
1. 用户创建输入节点与输出节点。
2. 在画布中拖拽端口进行连线。
3. 在属性面板调整通道映射/增益（预留字段）。
4. 保存工程并可再次加载复原。

## 4. 技术方案（基于当前仓库）

- 前端：React + TypeScript + Vite（UI 与状态管理），使用 Material Design + 圆角卡片风格设计。
- 桌面壳：Tauri（系统能力与本地资源访问）。
- 后端（本地）：Rust（设备枚举、连接应用、配置持久化）。

建议分层：
- `UI Layer`：组件与交互。
- `State Layer`：节点、边、选择态、历史栈。
- `Bridge Layer`：前端与 Tauri 命令通信。
- `Engine Layer`（Rust）：设备与路由执行。

## 5. 核心数据模型（简化）

```ts
type NodeType = 'input' | 'output' | 'processor'

interface DeviceNode {
	id: string
	name: string
	type: NodeType
	channels: number
	enabled: boolean
	position: { x: number; y: number }
}

interface RouteEdge {
	id: string
	fromNodeId: string
	fromChannel: number
	toNodeId: string
	toChannel: number
	enabled: boolean
}

interface ProjectSnapshot {
	version: string
	nodes: DeviceNode[]
	edges: RouteEdge[]
	updatedAt: string
}
```

## 6. 非功能约束

- 稳定性：异常输入不崩溃，连接失败有明确错误提示。
- 可观测性：关键操作有日志（创建节点、连线、保存、加载）。
- 性能：在 100+ 节点、300+ 连线下保持基本可交互。

## 7. 里程碑（建议）

- M1：画布与节点 CRUD（可视化基础完成）。
- M2：连线、校验规则与自动布线推荐（可形成可用路由拓扑）。
- M3：本地保存/加载 + Tauri 命令打通。
- M4：稳定性与可用性打磨（错误处理、快捷操作、性能优化）。