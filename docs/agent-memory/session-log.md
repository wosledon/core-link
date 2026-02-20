# 会话日志（Session Log）

## [2026-02-20 00:00] 会话快照
- 任务：接入 `Voicemeeter8Setup.exe` 作为可安装目标
- 当前状态：Handoff
- 已完成：安装目标列表从仅 INF 扩展为 INF + Setup.exe；安装脚本支持按选中目标安装（若选 Setup.exe 则直接执行安装器）；设置页文案改为“安装包/安装目标包”
- 进行中：无
- 下一步（可直接执行）：在设置页“安装目标包”选择 `Voicemeeter8Setup.exe` 后点击“安装驱动”
- 阻塞项：安装器运行后是否要求重启取决于安装包本身
- 涉及文件：`src-tauri/src/lib.rs`、`drivers/windows/install-virtual-audio-driver.ps1`、`src/components/SettingsPanel.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：处理“安装成功但输入/输出仍未检测到”与错误窗口闪退问题
- 当前状态：Handoff
- 已完成：确认日志显示 `pnputil` 安装成功；脚本新增 VB-CABLE 包识别并优先调用官方 `VBCABLE_Setup_x64.exe` / `VBCABLE_Setup.exe`；安装完成后明确记录“建议重启后再检测”
- 进行中：无
- 下一步（可直接执行）：完成安装后重启系统，再在设置页点击“检测驱动”
- 阻塞项：未重启前系统音频端点可能不会被 CPAL 枚举到
- 涉及文件：`drivers/windows/install-virtual-audio-driver.ps1`

## [2026-02-20 00:00] 会话快照
- 任务：增强虚拟驱动安装流程（自动提权 + 多 INF 选择）
- 当前状态：Handoff
- 已完成：安装脚本支持自动提权重启；支持 `-InfName` 指定 INF；后端新增 `list_virtual_driver_inf_files` 与 `install_virtual_audio_driver(inf_name)`；设置页新增 INF 下拉选择后再安装
- 进行中：无
- 下一步（可直接执行）：把目标 INF 放入 `drivers/windows/`，在设置页选择 INF 后点“安装驱动”
- 阻塞项：驱动签名与发布链路仍取决于第三方驱动包
- 涉及文件：`drivers/windows/install-virtual-audio-driver.ps1`、`src-tauri/src/lib.rs`、`src/App.tsx`、`src/components/SettingsPanel.tsx`、`src/components/SettingsPanel.css`

## [2026-02-20 00:00] 会话快照
- 任务：修复虚拟驱动安装脚本 PowerShell 解析错误
- 当前状态：Handoff
- 已完成：重写安装脚本为纯 ASCII 字符串，消除字符串终止符异常；本地执行脚本已不再报 ParserError，当前返回“未找到 INF 文件”为预期运行时错误
- 进行中：无
- 下一步（可直接执行）：将虚拟声卡驱动 `.inf` 放到 `drivers/windows/` 后重试“安装驱动”
- 阻塞项：需要实际驱动 INF 文件
- 涉及文件：`drivers/windows/install-virtual-audio-driver.ps1`

## [2026-02-20 00:00] 会话快照
- 任务：继续推进“接入虚拟音频驱动”，补齐应用内检测与安装入口
- 当前状态：Handoff
- 已完成：后端新增 `check_virtual_audio_driver` 与 `install_virtual_audio_driver` 命令；设置页“虚拟端点”新增驱动检测/安装按钮与检测结果展示；新增 Windows 安装脚本模板 `drivers/windows/install-virtual-audio-driver.ps1`（通过 `pnputil` 安装同目录 INF）
- 进行中：无
- 下一步（可直接执行）：将虚拟声卡驱动 INF 放到 `drivers/windows/`，在设置页点击“安装驱动”并重新检测
- 阻塞项：当前不包含内核驱动源码与签名流程，仅提供安装接入链路
- 涉及文件：`src-tauri/src/lib.rs`、`src/App.tsx`、`src/components/SettingsPanel.tsx`、`src/components/SettingsPanel.css`、`drivers/windows/install-virtual-audio-driver.ps1`

## [2026-02-20 00:00] 会话快照
- 任务：接入虚拟音频驱动（已安装驱动优先绑定）
- 当前状态：Handoff
- 已完成：后端新增虚拟驱动设备名识别规则（VB-Audio/VoiceMeeter/Virtual Audio/BlackHole/Loopback 等）；在虚拟端点扩容与自动绑定时优先选择匹配的虚拟驱动设备，再回退普通设备，提升 `v-in-*` / `v-out-*` 与系统虚拟驱动联动成功率
- 进行中：无
- 下一步（可直接执行）：安装并启用虚拟驱动后，在设置中应用虚拟端点数量并验证默认绑定是否优先落到虚拟驱动设备
- 阻塞项：当前仍基于已安装驱动做接入，不包含内核驱动安装/注册流程
- 涉及文件：`src-tauri/src/lib.rs`

## [2026-02-20 00:00] 会话快照
- 任务：修复“虚拟端点创建没有效果”
- 当前状态：Handoff
- 已完成：后端虚拟端点创建/扩容时改为默认启用（`enabled=true`），确保端点会出现在设备列表；新增自动绑定逻辑，创建时会按索引优先绑定可用本机输入/输出设备（不足时回退第一个可用设备），避免“可见但不可路由”
- 进行中：无
- 下一步（可直接执行）：在设置中将虚拟输入/输出数量调到 2/2 后应用，回到画布新增输入/输出设备并将绑定切换到 `v-in-*` / `v-out-*` 验证可路由
- 阻塞项：无
- 涉及文件：`src-tauri/src/lib.rs`

## [2026-02-20 00:00] 会话快照
- 任务：在窗口中间新增可编辑工程名称，并统一使用 `.ck` 后缀展示
- 当前状态：Handoff
- 已完成：标题栏中部新增工程名展示区（点击进入编辑）；编辑态右侧固定显示 `.ck`；工程名已接入 `App` 状态并贯通新建/加载/保存；重命名会同步更新已激活工程记录
- 进行中：无
- 下一步（可直接执行）：运行应用点击中部工程名修改后保存，再到工程列表确认名称已更新且显示为 `<名称>.ck`
- 阻塞项：无
- 涉及文件：`src/components/TitleBar.tsx`、`src/components/TitleBar.css`、`src/App.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：将“工程列表”从设置页迁移到画布顶部菜单，并完成样式修复
- 当前状态：Handoff
- 已完成：顶部菜单新增工程列表下拉（展示名称/更新时间并支持直接加载）；`RoutingCanvas`/`App` 改为向顶部菜单透传工程数据与加载动作；设置页移除工程列表页与相关 props；修复 `CanvasMenuCard.css` 末尾多余 `}`
- 进行中：无
- 下一步（可直接执行）：运行应用手测顶部菜单“工程列表”展开与切换加载行为
- 阻塞项：无
- 涉及文件：`src/components/CanvasMenuCard.tsx`、`src/components/CanvasMenuCard.css`、`src/components/RoutingCanvas.tsx`、`src/App.tsx`、`src/components/SettingsPanel.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：移除画布虚拟创建菜单，改为设置页按 In/Out 数量管理虚拟端点
- 当前状态：Verify
- 已完成：画布左上工具栏移除虚拟输入/输出创建按钮；设置页新增“虚拟端点”页，可配置并应用虚拟输入/输出数量（创建/删除）；后端新增 `set_virtual_endpoint_counts`；端点命名固定为 `v-in-*(CoreLink)` / `v-out-*(CoreLink)`
- 进行中：无
- 下一步（可直接执行）：在设置页把虚拟输入/输出设为 2/2，返回画布新增普通输入/输出卡并在下拉中选择 `v-in-*` / `v-out-*`
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`、`src/components/SettingsPanel.tsx`、`src/components/SettingsPanel.css`、`src/App.tsx`、`src-tauri/src/lib.rs`

## [2026-02-20 00:00] 会话快照
- 任务：修复“看起来没有创建虚拟设备”问题
- 当前状态：Verify
- 已完成：虚拟输入/输出按钮改为先调用后端固定端点命令启用 `v-in-*`/`v-out-*` 并绑定真实设备，再创建绑定该端点ID的卡片；设备刷新后可在列表中看到对应虚拟端点
- 进行中：无
- 下一步（可直接执行）：点击虚拟输入/输出按钮后检查设备绑定是否为 `v-in-*`/`v-out-*`，并验证可参与系统路由
- 阻塞项：无
- 涉及文件：`src/App.tsx`、`src/hooks/useAudioRouter.ts`
## [2026-02-20 00:00] 会话快照
- 任务：支持虚拟设备ID后缀手动编辑与跟随名称切换
- 已完成：新增 `virtualSuffixCustomized` 状态；Core Link 虚拟设备在属性面板新增“虚拟后缀”输入与“跟随名称”按钮；默认后缀随名称变化，自定义后缀后会锁定，直到手动恢复跟随
- 进行中：无
- 下一步（可直接执行）：创建虚拟设备后改名/改后缀交替测试，确认锁定与跟随行为符合预期
- 阻塞项：无
- 涉及文件：`src/types/audio.ts`、`src/hooks/useAudioRouter.ts`、`src/App.tsx`、`src/App.css`

## [2026-02-20 00:00] 会话快照
- 任务：卡片显示命名模式 + 优化自动命名标签样式 + 虚拟设备前缀与名称后缀绑定
- 当前状态：Verify
- 已完成：设备卡头部新增“自动/自定义”状态；属性面板命名标签改为轻量状态点样式；Core Link 虚拟设备 ID 改为 `core-link-vdev-<名称后缀>`，自定义改名时同步更新后缀；属性面板新增虚拟设备ID只读展示
- 进行中：无
- 下一步（可直接执行）：创建虚拟设备后改名，确认 `boundDeviceId` 前缀不变且后缀跟随新名称
- 阻塞项：无
- 涉及文件：`src/App.tsx`、`src/App.css`、`src/components/DeviceCard.tsx`、`src/components/DeviceCard.css`

## [2026-02-20 00:00] 会话快照
- 任务：在名称输入区域显示命名模式状态
- 当前状态：Verify
- 已完成：在设备属性“名称”输入框旁新增状态标签，实时显示“自动命名/自定义命名”
- 进行中：无
- 下一步（可直接执行）：手动改名并切换绑定设备，观察状态标签与命名行为联动
- 阻塞项：无
- 涉及文件：`src/App.tsx`、`src/App.css`

## [2026-02-20 00:00] 会话快照
- 任务：设备名称跟随/自定义锁定/重置规则实现
- 当前状态：Verify
- 已完成：新增 `nameCustomized` 状态；未自定义时绑定设备切换会自动同步名称；手动改名后进入自定义锁定模式；新增“重置名称”按钮，点击后恢复为当前绑定设备名称并退出锁定
- 进行中：无
- 下一步（可直接执行）：测试“改名->切换绑定不变名->重置->切换绑定跟随”完整流程
- 阻塞项：无
- 涉及文件：`src/types/audio.ts`、`src/hooks/useAudioRouter.ts`、`src/App.tsx`、`src/App.css`

## [2026-02-20 00:00] 会话快照
- 任务：虚拟设备支持自主创建，并用统一前缀识别是否为 Core Link 创建
- 当前状态：Verify
- 已完成：新增前缀 `core-link-vdev-`；虚拟输入/输出按钮改为直接创建自主虚拟节点；卡片与属性面板按前缀识别为“Core Link 虚拟设备”并采用只读绑定展示
- 进行中：无
- 下一步（可直接执行）：连续创建多个虚拟输入/输出，检查 `boundDeviceId` 前缀一致且显示标签正确
- 阻塞项：无
- 涉及文件：`src/types/audio.ts`、`src/App.tsx`、`src/components/DeviceCard.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：修复设备卡片名称与绑定设备不同步
- 当前状态：Verify
- 已完成：切换绑定设备时统一同步更新 `boundDeviceLabel` 与设备名称；保留原有 `#编号` 后缀，避免重命名破坏编号语义
- 进行中：无
- 下一步（可直接执行）：在卡片下拉与右侧属性下拉分别切换设备，确认名称同步变化
- 阻塞项：无
- 涉及文件：`src/App.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：修复虚拟输入/虚拟输出按钮不可点击
- 当前状态：Verify
- 已完成：虚拟按钮改为始终可点击；无虚拟声卡候选时自动回退创建虚拟节点，并通过 tooltip 提示当前为回退模式
- 进行中：无
- 下一步（可直接执行）：在无虚拟声卡环境点击虚拟按钮，确认仍可创建节点；在有虚拟声卡环境确认优先绑定真实虚拟端点
- 阻塞项：无
- 涉及文件：`src/App.tsx`、`src/components/RoutingCanvas.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：清理设备来源中的“虚拟设备”旧开关
- 当前状态：Verify
- 已完成：右侧设备属性面板移除“虚拟设备”复选框，避免与“虚拟声卡绑定”语义冲突；设备来源统一通过“绑定设备”选择表达
- 进行中：无
- 下一步（可直接执行）：在输入/输出设备属性中切换绑定设备，确认功能正常且无旧开关
- 阻塞项：无
- 涉及文件：`src/App.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：实现可用于播放器串流控制的虚拟输入/输出设备能力
- 当前状态：Verify
- 已完成：左上工具栏新增“虚拟输入/虚拟输出”创建按钮；自动识别系统中已安装虚拟声卡端点并创建绑定卡片；设备卡新增“虚拟声卡”来源标识
- 进行中：无
- 下一步（可直接执行）：将播放器输出切到虚拟声卡后，在画布添加虚拟输入卡并连接到目标输出，验证串流可控
- 阻塞项：无（前提是系统已安装虚拟声卡驱动）
- 涉及文件：`src/App.tsx`、`src/components/RoutingCanvas.tsx`、`src/components/RoutingCanvas.css`、`src/components/DeviceCard.tsx`、`src/components/DeviceCard.css`

## [2026-02-20 00:00] 会话快照
- 任务：继续完善画布为“真正无限”体验
- 当前状态：Verify
- 已完成：新增世界重定位机制（视图接近边界时自动平移设备世界坐标并反向补偿视图偏移），实现无感连续拖拽的无限画布体验
- 进行中：无
- 下一步（可直接执行）：持续向同一方向平移画布 30 秒，确认不会出现边界空白或卡住
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`、`src/App.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：自动排版改为画布居中，避免总是贴上方导致越界观感
- 当前状态：Verify
- 已完成：自动排版触发改为使用“当前可视区域中心”作为锚点；布局改为以锚点进行三列分布并按每列设备数量垂直居中
- 进行中：无
- 下一步（可直接执行）：拖动画布到任意位置后点击“自动排版”，确认新布局在当前视图中心附近生成
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`、`src/App.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：修正回采设备卡片颜色 + 创建设备入口并入画布左上纵向工具栏 + 创建设备落点居中 + 设备切换并入卡片
- 当前状态：Verify
- 已完成：移除左侧新增面板；在画布左上新增纵向工具栏（输入/回采/输出/效果器）并支持禁用态；工具栏新增卡片按当前视图中心创建；设备卡新增绑定下拉可直接切换；回采输入卡片独立配色（紫色）
- 进行中：无
- 下一步（可直接执行）：在运行态点击左上工具栏新增各类卡片，确认均落在当前可视区域中心；切换输入到回采设备，确认卡片配色立即变为回采色
- 阻塞项：无
- 涉及文件：`src/App.tsx`、`src/components/RoutingCanvas.tsx`、`src/components/RoutingCanvas.css`、`src/components/DeviceCard.tsx`、`src/components/DeviceCard.css`

## [2026-02-20 00:00] 会话快照
- 任务：回采设备分组着色 + 工程管理修复 + 设置新增工程列表页
- 当前状态：Verify
- 已完成：回采设备从输入设备中独立展示并使用新颜色；工程保存改为工程列表持久化并支持旧数据迁移；设置面板新增左侧导航与工程列表页（可加载工程）
- 进行中：无
- 下一步（可直接执行）：重启应用验证工程自动恢复；在设置-工程列表中切换加载不同工程
- 阻塞项：无
- 涉及文件：`src/App.tsx`、`src/App.css`、`src/components/SettingsPanel.tsx`、`src/components/SettingsPanel.css`、`src/hooks/useSettings.ts`

## [2026-02-20 00:00] 会话快照
- 任务：修复“软件监控不到扬声器”与“初始化需重加设备才可用”
- 当前状态：Verify
- 已完成：后端设备列表新增扬声器回采输入（loopback）；系统路由支持 `loop-out-*` 作为输入源；启动时自动把 `default-*` 绑定修正到当前真实设备；默认启用自动加载上次工程
- 进行中：无
- 下一步（可直接执行）：创建“扬声器回采”输入并连接到目标输出，验证监控与电平；重启应用确认无需重加设备
- 阻塞项：loopback 能力依赖系统/驱动对 WASAPI 回采支持
- 涉及文件：`src-tauri/src/lib.rs`、`src/hooks/useAudioRouter.ts`、`src/App.tsx`、`src/hooks/useSettings.ts`

## [2026-02-20 00:00] 会话快照
- 任务：修复“麦克风+扬声器不能合并到同一输出”与“扬声器有声无电平”
- 当前状态：Verify
- 已完成：移除目标端口单入线限制（支持多源合流）；输出/输入在后端电平缺失时回退本地分析器显示，避免有声但电平不动
- 进行中：无
- 下一步（可直接执行）：将麦克风与扬声器同时连到同一输出通道，确认可连且输出电平变化
- 阻塞项：无
- 涉及文件：`src/hooks/useAudioRouter.ts`、`src/components/RoutingCanvas.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：继续优化电平体验与输出链串流
- 当前状态：Verify
- 已完成：新增峰值保持与 dB 实时读数；电平响应进一步提速；系统路由候选改为“输出逆向追溯输入源”以覆盖 output->output 链路串流
- 进行中：无
- 下一步（可直接执行）：在 input->outputA->outputB 下确认 A/B 都可听且电平有峰值保持效果
- 阻塞项：当前输出链路是输入源扇出，不是系统回采输出
- 涉及文件：`src/components/DeviceCard.tsx`、`src/components/DeviceCard.css`、`src/hooks/useAudioRouter.ts`、`src-tauri/src/lib.rs`

## [2026-02-20 00:00] 会话快照
- 任务：电平刻度优化 + 更灵敏 + 输出串流修复
- 当前状态：Verify
- 已完成：电平显示改为更小刻度（条高下调）；后端/前端电平平滑参数调快；系统路由从“仅直连 input->output”升级为“从每个输出逆向追溯上游输入”，支持输出链路串流
- 进行中：无
- 下一步（可直接执行）：在 A(input)->B(output)->C(output) 拓扑下验证 B/C 都有声音且电平同步变化
- 阻塞项：当前系统级串流仍基于“输入源扇出”模型，不是输出硬件回采（loopback）
- 涉及文件：`src/hooks/useAudioRouter.ts`、`src/components/DeviceCard.css`、`src-tauri/src/lib.rs`

## [2026-02-20 00:00] 会话快照
- 任务：修复“能听到声音但电平显示不正确”
- 当前状态：Verify
- 已完成：后端新增 `get_audio_levels`；音频线程输入/输出回调实时计算 RMS 并回传；前端改为在系统桥接模式下轮询后端电平驱动设备/连线电平显示
- 进行中：无
- 下一步（可直接执行）：在系统级路由运行时观察输入设备与输出设备电平是否同步变化
- 阻塞项：当前前端轮询周期为 120ms，视觉上会比本地分析器略“稳”而非极快跳动
- 涉及文件：`src-tauri/src/lib.rs`、`src/hooks/useAudioRouter.ts`

## [2026-02-20 00:00] 会话快照
- 任务：添加防回路检测
- 当前状态：Verify
- 已完成：在状态层与画布层都加入回路检测（新增连线若形成环则拒绝）；拖拽连线时非法目标实时高亮
- 进行中：无
- 下一步（可直接执行）：手测 A->B->C 后尝试 C->A，确认被阻止
- 阻塞项：当前为设备级回路检测，不区分通道级闭环
- 涉及文件：`src/hooks/useAudioRouter.ts`、`src/components/RoutingCanvas.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：修复运行时“失去响应”问题
- 当前状态：Verify
- 已完成：修复 `useAudioRouter` 副作用高频触发问题；将实时图同步与系统路由同步的依赖改为仅签名字段变化触发，避免每 80ms 电平刷新导致重同步
- 进行中：无
- 下一步（可直接执行）：运行 `npm run tauri dev` 持续拖拽/连线 2-3 分钟观察是否仍卡死
- 阻塞项：若仍偶发卡顿，需要追加路由命令节流与性能剖析
- 涉及文件：`src/hooks/useAudioRouter.ts`

## [2026-02-20 00:00] 会话快照
- 任务：采样率不一致时的重采样与缓冲延迟优化
- 当前状态：Verify
- 已完成：后端音频桥接新增线性重采样（按输入/输出采样率比值）；新增目标延迟缓冲与基于队列占用的微调纠偏；新增预填充阈值避免冷启动爆音
- 进行中：无
- 下一步（可直接执行）：在不同采样率设备组合下实测稳定性与延迟体感
- 阻塞项：当前重采样为线性插值，极端场景音质仍有提升空间
- 涉及文件：`src-tauri/src/lib.rs`

## [2026-02-20 00:00] 会话快照
- 任务：继续推进系统级能力（多路并发直通 + 状态可视）
- 当前状态：Verify
- 已完成：后端新增多路命令 `start_audio_routes` / `stop_audio_routes`；音频工作线程改为并发持有多条路由流；前端按所有合法本机 input->output 连线批量下发；右侧属性面板增加系统引擎运行路数状态
- 进行中：无
- 下一步（可直接执行）：创建 2 组输入/输出设备并分别连线，确认系统引擎显示“运行中 · 2 路”
- 阻塞项：当前仍是设备直通，不含系统虚拟声卡注册
- 涉及文件：`src-tauri/src/lib.rs`、`src/hooks/useAudioRouter.ts`、`src/App.tsx`、`src/App.css`

## [2026-02-20 00:00] 会话快照
- 任务：直接实现系统级音频执行层（Rust/Tauri）
- 当前状态：Verify
- 已完成：新增后端命令 `list_audio_hardware` / `start_audio_passthrough` / `stop_audio_passthrough` / `get_audio_route_status`；新增 CPAL 设备枚举与输入→输出直通引擎；前端改为优先读取后端设备并按连线自动驱动后端直通
- 进行中：无
- 下一步（可直接执行）：`npm run tauri dev` 后创建本机输入和本机输出并连线，验证系统级直通声音
- 阻塞项：当前是系统级设备直通，不是系统级虚拟声卡驱动
- 涉及文件：`src-tauri/src/lib.rs`、`src-tauri/Cargo.toml`、`src/hooks/useAudioRouter.ts`、`src/App.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：补齐核心可用性（真实输出绑定 + 工程保存/加载闭环）
- 当前状态：Verify
- 已完成：输出设备绑定接入（优先 `setSinkId`，失败回退默认输出）；新增保存工程按钮与 `Ctrl/Cmd+S`；支持按设置自动加载上次工程；构建通过
- 进行中：无
- 下一步（可直接执行）：启动应用后创建输入/输出并自动布线，对麦克风说话并监听输出电平与声音
- 阻塞项：部分运行环境不支持 `setSinkId` 时会回退默认输出
- 涉及文件：`src/hooks/useAudioRouter.ts`、`src/App.tsx`、`src/components/RoutingCanvas.tsx`、`src/components/CanvasMenuCard.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：接入真实电平与虚拟设备串流（重建音频核心 hook）
- 当前状态：Verify
- 已完成：重建 `useAudioRouter`；接入 WebAudio 实时图；真实麦克风采集；设备增益/静音/启用生效；连接驱动串流路径；恢复并通过构建
- 进行中：无
- 下一步（可直接执行）：手测权限授权后对输入设备说话，观察输入/连接/输出电平联动
- 阻塞项：浏览器/系统麦克风权限会影响实时输入采集
- 涉及文件：`src/hooks/useAudioRouter.ts`

## [2026-02-20 00:00] 会话快照
- 任务：实现核心部分（输入/输出设备控制）
- 当前状态：Verify
- 已完成：属性面板新增启用/禁用、静音、通道数、增益控制；增益接入电平模拟；通道变更自动清理无效连线
- 进行中：无
- 下一步（可直接执行）：在设备属性里分别测试输入与输出的通道切换和静音状态
- 阻塞项：无
- 涉及文件：`src/hooks/useAudioRouter.ts`、`src/App.tsx`、`src/App.css`

## [2026-02-20 00:00] 会话快照
- 任务：添加一键编组（Group）
- 当前状态：Verify
- 已完成：Ctrl+G 编组、Ctrl+Shift+G 取消编组；同组设备支持联动拖拽
- 进行中：无
- 下一步（可直接执行）：手测编组后单卡拖拽联动与取消编组行为
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`、`src/App.tsx`、`src/types/audio.ts`

## [2026-02-20 00:00] 会话快照
- 任务：添加 Ctrl+点击单设备多选
- 当前状态：Verify
- 已完成：Ctrl/Meta+点击支持单设备加入或移出多选集合
- 进行中：无
- 下一步（可直接执行）：手测 Ctrl+点击与 Shift+点击组合行为
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：继续补充多选快捷键
- 当前状态：Verify
- 已完成：Ctrl+A 全选设备；Esc 清空设备多选/连线选中/提示状态
- 进行中：无
- 下一步（可直接执行）：手测 Ctrl+A 后批量移动与 Esc 退出选择
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：增加 Shift 增量多选
- 当前状态：Verify
- 已完成：Shift+框选可增量追加选择；Shift+点击设备可切换多选状态
- 进行中：无
- 下一步（可直接执行）：手测 Ctrl 框选与 Shift 框选组合行为
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：实现 Ctrl+鼠标框选批量移动
- 当前状态：Verify
- 已完成：支持 Ctrl+左键框选；框选后拖动任一已选设备可整组移动；松手后写入历史
- 进行中：无
- 下一步（可直接执行）：手测不同缩放下框选命中和批量拖拽
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`、`src/components/RoutingCanvas.css`、`src/App.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：增加画布滚轮缩放
- 当前状态：Verify
- 已完成：支持滚轮缩放；以鼠标位置为锚点缩放并自动修正视图偏移
- 进行中：无
- 下一步（可直接执行）：手测不同缩放比例下滚轮连续缩放体验
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：继续升级连线提示（重名设备消歧）
- 当前状态：Verify
- 已完成：连线悬浮提示在同名设备场景下自动显示 `#序号`（如 麦克风#1 / 麦克风#2）
- 进行中：无
- 下一步（可直接执行）：手测 2 个同名输入设备的提示区分效果
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：连线提示升级为“设备名 + 通道号”
- 当前状态：Verify
- 已完成：悬浮提示由 `OUTx → INy` 升级为 `设备名 OUTx → 设备名 INy`
- 进行中：无
- 下一步（可直接执行）：手测多设备同名情况下的提示可读性
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：新增连线端口编号悬浮提示（OUTx → INy）
- 当前状态：Verify
- 已完成：连线 hover 显示通道映射提示并跟随鼠标；点击选中连线时保留提示一致性
- 进行中：交接同步
- 下一步（可直接执行）：手测多条连线快速切换悬浮提示
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`、`src/components/RoutingCanvas.css`

## [2026-02-20 00:00] 会话快照
- 任务：修复连线与端口不对齐（再次校准）
- 当前状态：Verify
- 已完成：补齐通道区域 `padding-top` 几何常量并同步到连线锚点与视图边界计算
- 进行中：交接同步
- 下一步（可直接执行）：在 UI 中验证 1/2 通道连线是否穿过端口中心
- 阻塞项：无
- 涉及文件：`src/types/audio.ts`、`src/components/RoutingCanvas.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：继续优化连线体验（端点吸附 + 对齐修复）
- 当前状态：Verify
- 已完成：连线端点自动吸附最近合法输入端口；空白处松开可自动完成连接；端口命中范围增大；连线锚点按卡片固定几何重算，修复不对齐
- 进行中：交接同步
- 下一步（可直接执行）：在不同缩放比例下手测 1/2/4 通道端口对齐
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.tsx`、`src/components/DeviceCard.css`、`src/types/audio.ts`

## [2026-02-20 00:00] 会话快照
- 任务：补充连线右键删除与连线对齐修复
- 当前状态：Verify
- 已完成：新增连线右键菜单删除；新增连线悬停高亮；设备卡关键高度固定化并统一锚点计算，连线与端口对齐
- 进行中：交接同步
- 下一步（可直接执行）：桌面端手测 1/2 通道连线端点对齐与右键删除
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.*`、`src/components/DeviceCard.css`、`src/types/audio.ts`

## [2026-02-20 00:00] 会话快照
- 任务：补充连线可选中删除与非法目标高亮
- 当前状态：Verify
- 已完成：连线可点击选中；Delete/Backspace 删除选中连线；连线时输入端口合法/非法高亮；右上角实时连接状态提示
- 进行中：交接同步
- 下一步（可直接执行）：`npm run tauri dev` 下手测连线删除与非法目标提示
- 阻塞项：无
- 涉及文件：`src/components/RoutingCanvas.*`、`src/components/DeviceCard.*`、`src/App.tsx`

## [2026-02-20 00:00] 会话快照
- 任务：连线交互与画布/设备卡体验优化
- 当前状态：Verify
- 已完成：修复连线端口错位与信号闪烁；改造空白区拖动画布与设备拖拽优先；适应视图支持自动定位并新增定位按钮；重做设备卡纵向布局；优化属性面板视觉；修复自动布线策略
- 进行中：交接同步
- 下一步（可直接执行）：`npm run tauri dev` 下进行鼠标交互手测
- 阻塞项：无
- 涉及文件：`src/hooks/useAudioRouter.ts`、`src/components/RoutingCanvas.tsx`、`src/components/DeviceCard.*`、`src/App.tsx`、`src/App.css`

## [2026-02-20 00:00] 会话快照
- 任务：重做设备创建与画布交互（本机设备选择、虚拟设备、无限画布、连线与拖拽）
- 当前状态：Verify
- 已完成：左侧改为输入/输出/效果器三类创建卡；支持本机设备枚举与绑定；支持虚拟设备创建；设备卡放大重做；修复拖拽偏移与端口方向连线；实现可平移的大画布
- 进行中：交接整理
- 下一步（可直接执行）：运行 `npm run tauri dev` 验证桌面端设备枚举与画布拖动体验
- 阻塞项：浏览器/系统权限可能影响本机设备标签显示
- 涉及文件：`src/App.tsx`、`src/hooks/useAudioRouter.ts`、`src/components/DeviceCard.tsx`、`src/components/RoutingCanvas.tsx`、`src/App.css`

## [2026-02-20 00:00] 会话快照
- 任务：统一 Material Design + 圆角卡片风格，并修复当前功能偏差
- 当前状态：Verify
- 已完成：主题 token 重构、标题栏/设置/画布/设备卡样式统一；修复主题双源状态、设备选中、自动布线、自动排版、拖拽落点与设置项国际化
- 进行中：交接摘要整理
- 下一步（可直接执行）：运行 `npm run tauri dev` 做桌面壳联调验证
- 阻塞项：无
- 涉及文件：`src/App.tsx`、`src/styles/theme.css`、`src/components/*`、`src/i18n/locales/*`

## [2026-02-20 00:00] 会话快照
- 任务：创建一套目录与工作约定
- 当前状态：Implement
- 已完成：梳理 `AGENTS.md` 与 `DESIGN.md`，确认需落地 `docs/agent-memory` 工件
- 进行中：创建记忆目录与模板文件
- 下一步（可直接执行）：补充交接摘要并在 `AGENTS.md` 标记已落地目录
- 阻塞项：无
- 涉及文件：`AGENTS.md`、`docs/agent-memory/*`

## 模板

```md
## [YYYY-MM-DD HH:mm] 会话快照
- 任务：
- 当前状态：Intake | Plan | Implement | Verify | Handoff
- 已完成：
- 进行中：
- 下一步（可直接执行）：
- 阻塞项：
- 涉及文件：
```
