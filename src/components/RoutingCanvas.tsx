import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import type { AudioDevice, AudioConnection } from '../types/audio';
import { AUDIO_DEVICE_CARD_LAYOUT } from '../types/audio';
import { DeviceCard } from './DeviceCard';
import { CanvasMenuCard } from './CanvasMenuCard';
import './RoutingCanvas.css';

interface AudioOption {
  id: string;
  label: string;
}

interface ProjectListItem {
  id: string;
  name: string;
  updatedAt: string;
}

// 连接线方向箭头组件
interface ConnectionArrowProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

function ConnectionArrow({ from, to }: ConnectionArrowProps) {
  // 计算箭头位置（在连线中间）
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  
  // 计算角度
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  return (
    <g transform={`translate(${midX}, ${midY}) rotate(${angle})`}>
      <polygon
        points="0,-4 8,0 0,4"
        fill="var(--success-color)"
        opacity={0.9}
      />
    </g>
  );
}

interface RoutingCanvasProps {
  devices: AudioDevice[];
  connections: AudioConnection[];
  localInputs: AudioOption[];
  loopbackInputs: AudioOption[];
  localOutputs: AudioOption[];
  selectedDevice: string | null;
  draggingDevice: string | null;
  connectingFrom: { deviceId: string; channel: number; portType: 'output' } | null;
  mousePos: { x: number; y: number };
  zoom: number;
  isLocked: boolean;
  onMouseMove: (pos: { x: number; y: number }) => void;
  onMouseUp: () => void;
  onDeviceMouseDown: (deviceId: string, e: React.MouseEvent, pointer: { x: number; y: number }) => void;
  onPortMouseDown: (deviceId: string, channel: number, portType: 'input' | 'output', e: React.MouseEvent) => void;
  onPortMouseUp: (deviceId: string, channel: number, portType: 'input' | 'output', e: React.MouseEvent) => void;
  onToggleMute: (deviceId: string) => void;
  onDeleteDevice: (deviceId: string) => void;
  onDeleteConnection: (connectionId: string) => void;
  onMoveDevicesByDelta: (deviceIds: string[], delta: { x: number; y: number }) => void;
  onRecenterWorld: (delta: { x: number; y: number }) => void;
  onBatchMoveEnd: () => void;
  onGroupDevices: (deviceIds: string[]) => void;
  onUngroupDevices: (deviceIds: string[]) => void;
  onSelectDevice: (deviceId: string | null) => void;
  onCanvasDrop: (pos: { x: number; y: number }) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleLock: () => void;
  onFitToView: (zoom: number) => void;
  onNewProject: () => void;
  onSaveProject: () => void;
  projects: ProjectListItem[];
  activeProjectId: string | null;
  onLoadProject: (projectId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAutoRoute: () => void;
  onAutoLayout: (anchor: { x: number; y: number }) => void;
  onCreateToolbarDevice: (kind: 'input' | 'loopback' | 'output' | 'processor', position: { x: number; y: number }) => void;
  onChangeDeviceBinding: (deviceId: string, boundDeviceId: string) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function RoutingCanvas({
  devices,
  connections,
  localInputs,
  loopbackInputs,
  localOutputs,
  selectedDevice,
  draggingDevice,
  connectingFrom,
  mousePos,
  zoom,
  isLocked,
  onMouseMove,
  onMouseUp,
  onDeviceMouseDown,
  onPortMouseDown,
  onPortMouseUp,
  onToggleMute,
  onDeleteDevice,
  onDeleteConnection,
  onMoveDevicesByDelta,
  onRecenterWorld,
  onBatchMoveEnd,
  onGroupDevices,
  onUngroupDevices,
  onSelectDevice,
  onCanvasDrop,
  onZoomIn,
  onZoomOut,
  onToggleLock,
  onFitToView,
  onNewProject,
  onSaveProject,
  projects,
  activeProjectId,
  onLoadProject,
  onUndo,
  onRedo,
  onAutoRoute,
  onAutoLayout,
  onCreateToolbarDevice,
  onChangeDeviceBinding,
  canUndo,
  canRedo,
}: RoutingCanvasProps) {
  type SnapTarget = { deviceId: string; channel: number; distance: number };

  const worldSize = 12000;
  const snapThreshold = 30;
  const { width: deviceCardWidth, topBarHeight, headerHeight, channelsPaddingTop, bindingHeight, channelHeight } = AUDIO_DEVICE_CARD_LAYOUT;

  const canvasRef = useRef<HTMLDivElement>(null);
  const skipNextCanvasClickRef = useRef(false);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; deviceId: string } | null>(null);
  const [connectionContextMenu, setConnectionContextMenu] = useState<{ x: number; y: number; connectionId: string } | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  const [connectionTooltip, setConnectionTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [hoverPort, setHoverPort] = useState<{ deviceId: string; channel: number; portType: 'input' | 'output' } | null>(null);
  const [boxSelection, setBoxSelection] = useState<{ start: { x: number; y: number }; end: { x: number; y: number }; additive: boolean } | null>(null);
  const [multiSelectedDeviceIds, setMultiSelectedDeviceIds] = useState<string[]>([]);
  const [groupDragging, setGroupDragging] = useState<{ deviceIds: string[]; lastPointer: { x: number; y: number } } | null>(null);

  const [viewOffset, setViewOffset] = useState({ x: 1200, y: 800 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewOffset.x) / zoom,
      y: (clientY - rect.top - viewOffset.y) / zoom,
    };
  }, [viewOffset.x, viewOffset.y, zoom]);

  // 直接计算端口位置，不使用 useCallback 以确保总是使用最新的 device 位置
  // 注意：这里的计算需要与 DeviceCard 的实际布局保持一致
  const getPortPosition = (deviceId: string, channel: number, isInput: boolean): { x: number; y: number } => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) {
      return { x: 0, y: 0 };
    }

    // 根据 DeviceCard.css 计算端口位置：
    // .device-channels { padding: 8px 12px 12px; }
    // .channel-port { width: 14px; height: 14px; }
    // 端口中心偏移量 = 14px / 2 = 7px
    const channelsPaddingLeft = 12; // .device-channels 左padding
    const channelsPaddingRight = 12; // .device-channels 右padding
    const portWidth = 14;
    const portCenterOffset = portWidth / 2; // 7px
    
    // 输入端口在左侧：device.position.x + 左padding + 端口中心
    // 输出端口在右侧：device.position.x + 卡片宽度 - 右padding - 端口中心
    const portX = isInput 
      ? device.position.x + channelsPaddingLeft + portCenterOffset
      : device.position.x + deviceCardWidth - channelsPaddingRight - portCenterOffset;
    
    // 计算 Y 位置：
    // - topBarHeight (5px) - .device-type-bar
    // - headerHeight (90px) - .device-header
    // - channelsPaddingTop (8px) - .device-channels padding-top
    // - binding 区域高度：
    //   - 虚拟设备/processor: .device-binding 高度 24px
    //   - 其他: .device-binding-select 高度 32px + margin-bottom 8px = 40px
    // - 通道行高度累加
    const actualBindingHeight = (device.type === 'processor' || device.isVirtual) ? 24 : 40;
    const channelStartY = topBarHeight + headerHeight + channelsPaddingTop + actualBindingHeight;
    
    return {
      x: portX,
      y: device.position.y + channelStartY + channel * channelHeight + channelHeight / 2,
    };
  };

  const isValidConnectionTarget = useCallback((targetDeviceId: string, targetChannel: number, targetPortType: 'input' | 'output') => {
    if (!connectingFrom) {
      return false;
    }

    if (targetPortType !== 'input') {
      return false;
    }

    if (connectingFrom.deviceId === targetDeviceId) {
      return false;
    }

    const fromDevice = devices.find(device => device.id === connectingFrom.deviceId);
    const toDevice = devices.find(device => device.id === targetDeviceId);
    if (!fromDevice || !toDevice) {
      return false;
    }

    const fromHasOutput = fromDevice.type === 'input' || fromDevice.type === 'processor' || fromDevice.type === 'output';
    const toHasInput = toDevice.type === 'output' || toDevice.type === 'processor';
    if (!fromHasOutput || !toHasInput) {
      return false;
    }

    const adjacency = new Map<string, string[]>();
    connections.forEach(connection => {
      if (!connection.enabled) {
        return;
      }

      const list = adjacency.get(connection.fromDeviceId) || [];
      list.push(connection.toDeviceId);
      adjacency.set(connection.fromDeviceId, list);
    });

    const stack = [targetDeviceId];
    const visited = new Set<string>();

    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (current === connectingFrom.deviceId) {
        return false;
      }

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const next = adjacency.get(current) || [];
      next.forEach(nodeId => {
        if (!visited.has(nodeId)) {
          stack.push(nodeId);
        }
      });
    }

    const exists = connections.some(connection =>
      connection.fromDeviceId === connectingFrom.deviceId &&
      connection.fromChannel === connectingFrom.channel &&
      connection.toDeviceId === targetDeviceId &&
      connection.toChannel === targetChannel,
    );

    return !exists;
  }, [connectingFrom, connections, devices]);

  const snappedTarget = useMemo<SnapTarget | null>(() => {
    if (!connectingFrom) {
      return null;
    }

    let bestTarget: SnapTarget | null = null;

    devices.forEach(device => {
      const hasInputPorts = device.type === 'output' || device.type === 'processor';
      if (!hasInputPorts || device.id === connectingFrom.deviceId) {
        return;
      }

      for (let channel = 0; channel < device.channels; channel += 1) {
        const portPos = getPortPosition(device.id, channel, true);
        const dx = mousePos.x - portPos.x;
        const dy = mousePos.y - portPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > snapThreshold) {
          continue;
        }

        if (!isValidConnectionTarget(device.id, channel, 'input')) {
          continue;
        }

        if (!bestTarget || distance < bestTarget.distance) {
          bestTarget = { deviceId: device.id, channel, distance };
        }
      }
    });

    return bestTarget;
  }, [connectingFrom, devices, isValidConnectionTarget, mousePos.x, mousePos.y]);

  const getConnectionPath = useCallback((from: { x: number; y: number }, to: { x: number; y: number }): string => {
    const dx = to.x - from.x;
    const controlPointOffset = Math.abs(dx) * 0.5;
    return `M ${from.x} ${from.y} C ${from.x + controlPointOffset} ${from.y}, ${to.x - controlPointOffset} ${to.y}, ${to.x} ${to.y}`;
  }, []);

  const tooltipDeviceNameById = useMemo(() => {
    const groupedByName = new Map<string, AudioDevice[]>();
    devices.forEach(device => {
      const list = groupedByName.get(device.name) || [];
      list.push(device);
      groupedByName.set(device.name, list);
    });

    const displayNameMap = new Map<string, string>();
    groupedByName.forEach((group, name) => {
      if (group.length === 1) {
        displayNameMap.set(group[0].id, name);
        return;
      }

      group.forEach((device, index) => {
        displayNameMap.set(device.id, `${name}#${index + 1}`);
      });
    });

    return displayNameMap;
  }, [devices]);

  const getConnectionTooltipText = useCallback((connection: AudioConnection) => {
    const fromDeviceName = tooltipDeviceNameById.get(connection.fromDeviceId) || 'Unknown';
    const toDeviceName = tooltipDeviceNameById.get(connection.toDeviceId) || 'Unknown';
    return `${fromDeviceName} OUT${connection.fromChannel + 1} → ${toDeviceName} IN${connection.toChannel + 1}`;
  }, [tooltipDeviceNameById]);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    const pointerWorld = clientToWorld(event.clientX, event.clientY);

    if (groupDragging) {
      const deltaX = pointerWorld.x - groupDragging.lastPointer.x;
      const deltaY = pointerWorld.y - groupDragging.lastPointer.y;

      if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
        onMoveDevicesByDelta(groupDragging.deviceIds, { x: deltaX, y: deltaY });
        setGroupDragging(prev => prev ? { ...prev, lastPointer: pointerWorld } : prev);
      }
      return;
    }

    if (boxSelection) {
      setBoxSelection(prev => prev ? { ...prev, end: pointerWorld } : prev);
      return;
    }

    if (isPanning) {
      setViewOffset({
        x: panStart.x + event.clientX,
        y: panStart.y + event.clientY,
      });
      return;
    }

    onMouseMove(pointerWorld);
  }, [boxSelection, clientToWorld, groupDragging, isPanning, onMouseMove, onMoveDevicesByDelta, panStart.x, panStart.y]);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (isLocked) {
      return;
    }

    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('.device-card, .channel-port, .context-menu, .canvas-menu-card, .canvas-controls-left, .canvas-add-toolbar, .canvas-minimap')) {
      return;
    }

    if (event.button === 0 && (event.ctrlKey || event.shiftKey)) {
      const start = clientToWorld(event.clientX, event.clientY);
      setBoxSelection({ start, end: start, additive: event.shiftKey });
      return;
    }

    setIsPanning(true);
    setPanStart({
      x: viewOffset.x - event.clientX,
      y: viewOffset.y - event.clientY,
    });
  }, [clientToWorld, isLocked, viewOffset.x, viewOffset.y]);

  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();

    if (!canvasRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    const worldX = (pointerX - viewOffset.x) / zoom;
    const worldY = (pointerY - viewOffset.y) / zoom;

    const zoomDelta = event.deltaY < 0 ? 1.08 : 0.92;
    const nextZoom = Math.max(0.35, Math.min(2.6, zoom * zoomDelta));

    if (Math.abs(nextZoom - zoom) < 0.0001) {
      return;
    }

    onFitToView(nextZoom);

    setViewOffset({
      x: pointerX - worldX * nextZoom,
      y: pointerY - worldY * nextZoom,
    });
  }, [onFitToView, viewOffset.x, viewOffset.y, zoom]);

  const handleMouseUp = useCallback(() => {
    if (groupDragging) {
      setGroupDragging(null);
      onBatchMoveEnd();
      return;
    }

    if (boxSelection) {
      const left = Math.min(boxSelection.start.x, boxSelection.end.x);
      const right = Math.max(boxSelection.start.x, boxSelection.end.x);
      const top = Math.min(boxSelection.start.y, boxSelection.end.y);
      const bottom = Math.max(boxSelection.start.y, boxSelection.end.y);

      const selected = devices
        .filter(device => {
          const deviceTop = device.position.y;
          const deviceBottom = device.position.y + topBarHeight + headerHeight + channelsPaddingTop + bindingHeight + device.channels * channelHeight;
          const deviceLeft = device.position.x;
          const deviceRight = device.position.x + deviceCardWidth;

          return !(deviceRight < left || deviceLeft > right || deviceBottom < top || deviceTop > bottom);
        })
        .map(device => device.id);

      setMultiSelectedDeviceIds(prev => {
        if (!boxSelection.additive) {
          return selected;
        }

        const merged = new Set([...prev, ...selected]);
        return Array.from(merged);
      });
      setBoxSelection(null);
      return;
    }

    if (isPanning) {
      setIsPanning(false);
      skipNextCanvasClickRef.current = true;
      return;
    }

    // 注意：连接完成由 DeviceCard 的 onPortMouseUp 处理，这里不重复调用
    // 只有在没有吸附目标时才调用 onMouseUp 来取消连接
    if (!connectingFrom || !snappedTarget) {
      onMouseUp();
    }
  }, [bindingHeight, boxSelection, channelHeight, channelsPaddingTop, connectingFrom, deviceCardWidth, devices, groupDragging, headerHeight, isPanning, onBatchMoveEnd, onMouseUp, onPortMouseUp, snappedTarget, topBarHeight]);

  const handleCanvasClick = useCallback(() => {
    if (skipNextCanvasClickRef.current) {
      skipNextCanvasClickRef.current = false;
      return;
    }

    setContextMenu(null);
    setConnectionContextMenu(null);
    setSelectedConnectionId(null);
    setConnectionTooltip(null);
    setMultiSelectedDeviceIds([]);
    onSelectDevice(null);
  }, [onSelectDevice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const selectedIds = multiSelectedDeviceIds.length > 0
        ? multiSelectedDeviceIds
        : selectedDevice
          ? [selectedDevice]
          : [];

      // 删除选中设备（Delete / Backspace）
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0 && !selectedConnectionId) {
        event.preventDefault();
        selectedIds.forEach(id => onDeleteDevice(id));
        setMultiSelectedDeviceIds([]);
        onSelectDevice(null);
        return;
      }

      const isGroupShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'g';
      if (isGroupShortcut) {
        if (selectedIds.length >= 2) {
          event.preventDefault();
          onGroupDevices(selectedIds);
        }
        return;
      }

      const isUngroupShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'g';
      if (isUngroupShortcut) {
        if (selectedIds.length > 0) {
          event.preventDefault();
          onUngroupDevices(selectedIds);
        }
        return;
      }

      const isSelectAll = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a';
      if (isSelectAll) {
        event.preventDefault();
        setMultiSelectedDeviceIds(devices.map(device => device.id));
        if (devices.length > 0) {
          onSelectDevice(devices[0].id);
        }
        return;
      }

      const isSaveProject = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
      if (isSaveProject) {
        event.preventDefault();
        onSaveProject();
        return;
      }

      if (event.key === 'Escape') {
        setMultiSelectedDeviceIds([]);
        setSelectedConnectionId(null);
        setConnectionTooltip(null);
        onSelectDevice(null);
        return;
      }

      // 删除选中的连接线
      if (selectedConnectionId && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        onDeleteConnection(selectedConnectionId);
        setSelectedConnectionId(null);
        setConnectionTooltip(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [devices, multiSelectedDeviceIds, onDeleteConnection, onDeleteDevice, onGroupDevices, onSaveProject, onSelectDevice, onUngroupDevices, selectedConnectionId, selectedDevice]);

  const getPortStatus = useCallback((deviceId: string, channel: number, portType: 'input' | 'output'): 'idle' | 'valid' | 'invalid' => {
    if (!connectingFrom) {
      return 'idle';
    }

    if (portType === 'output') {
      return 'invalid';
    }

    if (snappedTarget && snappedTarget.deviceId === deviceId && snappedTarget.channel === channel) {
      return 'valid';
    }

    return isValidConnectionTarget(deviceId, channel, portType) ? 'valid' : 'invalid';
  }, [connectingFrom, isValidConnectionTarget, snappedTarget]);

  const centerToWorldPoint = useCallback((worldX: number, worldY: number, targetZoom: number) => {
    if (!canvasRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    setViewOffset({
      x: rect.width / 2 - worldX * targetZoom,
      y: rect.height / 2 - worldY * targetZoom,
    });
  }, []);

  const handleFitAndCenter = useCallback(() => {
    if (!canvasRef.current || devices.length === 0) {
      onFitToView(1);
      setViewOffset({ x: 1200, y: 800 });
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const padding = 180;
    const minX = Math.min(...devices.map(device => device.position.x));
    const minY = Math.min(...devices.map(device => device.position.y));
    const maxX = Math.max(...devices.map(device => device.position.x + deviceCardWidth));
    const maxY = Math.max(...devices.map(device => device.position.y + topBarHeight + headerHeight + channelsPaddingTop + bindingHeight + device.channels * channelHeight + 30));

    const contentWidth = Math.max(300, maxX - minX + padding);
    const contentHeight = Math.max(220, maxY - minY + padding);
    const fitZoom = Math.min(2.6, Math.max(0.35, Math.min(rect.width / contentWidth, rect.height / contentHeight)));

    onFitToView(fitZoom);
    centerToWorldPoint((minX + maxX) / 2, (minY + maxY) / 2, fitZoom);
  }, [bindingHeight, centerToWorldPoint, channelHeight, channelsPaddingTop, deviceCardWidth, devices, headerHeight, onFitToView, topBarHeight]);

  const handleLocateSelection = useCallback(() => {
    const anchor = devices.find(device => device.id === selectedDevice) ?? devices[0];
    if (!anchor) {
      return;
    }

    centerToWorldPoint(anchor.position.x + deviceCardWidth / 2, anchor.position.y + 80, zoom);
  }, [centerToWorldPoint, deviceCardWidth, devices, selectedDevice, zoom]);

  const handleContextMenu = useCallback((event: React.MouseEvent, deviceId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setConnectionContextMenu(null);
    setContextMenu({ x: event.clientX, y: event.clientY, deviceId });
  }, []);

  const handleConnectionContextMenu = useCallback((event: React.MouseEvent, connectionId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setSelectedConnectionId(connectionId);
    setConnectionContextMenu({ x: event.clientX, y: event.clientY, connectionId });
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    onCanvasDrop(clientToWorld(event.clientX, event.clientY));
  }, [clientToWorld, onCanvasDrop]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  const getViewportCenterWorld = useCallback(() => {
    if (!canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (rect.width / 2 - viewOffset.x) / zoom,
      y: (rect.height / 2 - viewOffset.y) / zoom,
    };
  }, [viewOffset.x, viewOffset.y, zoom]);

  const handleCreateFromToolbar = useCallback((kind: 'input' | 'loopback' | 'output' | 'processor') => {
    onCreateToolbarDevice(kind, getViewportCenterWorld());
  }, [getViewportCenterWorld, onCreateToolbarDevice]);

  const getThumbnailViewBox = useCallback(() => {
    if (devices.length === 0) {
      return '0 0 100 100';
    }

    const padding = 50;
    const xs = devices.map(device => device.position.x);
    const ys = devices.map(device => device.position.y);
    const minX = Math.min(...xs) - padding;
    const minY = Math.min(...ys) - padding;
    const maxX = Math.max(...xs) + deviceCardWidth + 24 + padding;
    const maxY = Math.max(...ys) + 100 + padding;

    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [deviceCardWidth, devices]);

  useEffect(() => {
    if (devices.length === 0) {
      return;
    }

    const safeMargin = 1800;
    const targetCenter = worldSize / 2;
    const viewportCenter = getViewportCenterWorld();

    let shiftX = 0;
    let shiftY = 0;

    if (viewportCenter.x < safeMargin || viewportCenter.x > worldSize - safeMargin) {
      shiftX = targetCenter - viewportCenter.x;
    }

    if (viewportCenter.y < safeMargin || viewportCenter.y > worldSize - safeMargin) {
      shiftY = targetCenter - viewportCenter.y;
    }

    if (Math.abs(shiftX) < 1 && Math.abs(shiftY) < 1) {
      return;
    }

    onRecenterWorld({ x: shiftX, y: shiftY });
    setViewOffset(prev => ({
      x: prev.x - shiftX * zoom,
      y: prev.y - shiftY * zoom,
    }));
  }, [devices.length, getViewportCenterWorld, onRecenterWorld, worldSize, zoom]);

  return (
    <div className="routing-canvas-wrapper">
      <div className="routing-canvas-card">
        <CanvasMenuCard
          onNewProject={onNewProject}
          onSaveProject={onSaveProject}
          projects={projects}
          activeProjectId={activeProjectId}
          onLoadProject={onLoadProject}
          onUndo={onUndo}
          onRedo={onRedo}
          onAutoRoute={onAutoRoute}
          onAutoLayout={() => onAutoLayout(getViewportCenterWorld())}
          canUndo={canUndo}
          canRedo={canRedo}
        />

        <div
          ref={canvasRef}
          className={`routing-canvas ${isLocked ? 'locked' : ''} ${isPanning ? 'panning' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onClick={handleCanvasClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <div
            className="routing-canvas-world"
            style={{
              width: worldSize,
              height: worldSize,
              transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            <div className="canvas-grid" />

            <svg className="connections-layer">
              {connections.map(connection => {
                const from = getPortPosition(connection.fromDeviceId, connection.fromChannel, false);
                const to = getPortPosition(connection.toDeviceId, connection.toChannel, true);
                const isSelected = selectedConnectionId === connection.id;
                const isHovered = hoveredConnectionId === connection.id;
                const isActive = connection.enabled && connection.signalStrength > 0.05;

                return (
                  <g key={connection.id}>
                    {/* 可见的连接线 - 事件直接绑定在这里 */}
                    <path
                      className={`connection-line ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
                      d={getConnectionPath(from, to)}
                      style={{ 
                        opacity: connection.signalStrength > 0 ? 0.6 + connection.signalStrength * 0.4 : 0.3,
                      }}
                      strokeLinecap="round"
                      onMouseEnter={(event) => {
                        setHoveredConnectionId(connection.id);
                        setConnectionTooltip({
                          x: event.clientX,
                          y: event.clientY,
                          text: getConnectionTooltipText(connection),
                        });
                      }}
                      onMouseMove={(event) => {
                        setConnectionTooltip(prev => prev ? {
                          ...prev,
                          x: event.clientX,
                          y: event.clientY,
                        } : {
                          x: event.clientX,
                          y: event.clientY,
                          text: getConnectionTooltipText(connection),
                        });
                      }}
                      onMouseLeave={() => {
                        setHoveredConnectionId(null);
                        setConnectionTooltip(null);
                      }}
                      onContextMenu={(event) => handleConnectionContextMenu(event, connection.id)}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        setConnectionContextMenu(null);
                        setSelectedConnectionId(connection.id);
                        setConnectionTooltip({
                          x: event.clientX,
                          y: event.clientY,
                          text: getConnectionTooltipText(connection),
                        });
                        onSelectDevice(null);
                      }}
                    />
                    {/* 方向箭头（仅在选中或悬停时显示） */}
                    {(isSelected || isHovered) && (
                      <ConnectionArrow from={from} to={to} />
                    )}
                  </g>
                );
              })}

              {connectingFrom && (
                <path
                  className="temp-connection"
                  d={getConnectionPath(
                    getPortPosition(connectingFrom.deviceId, connectingFrom.channel, false),
                    snappedTarget ? getPortPosition(snappedTarget.deviceId, snappedTarget.channel, true) : mousePos,
                  )}
                />
              )}
            </svg>

            <div className="devices-layer">
              {devices.map(device => (
                <div
                  key={device.id}
                  onContextMenu={(event) => handleContextMenu(event, device.id)}
                  onClick={(event) => {
                    event.stopPropagation();
                    setConnectionContextMenu(null);

                    if (event.shiftKey || event.ctrlKey || event.metaKey) {
                      setMultiSelectedDeviceIds(prev => {
                        if (prev.includes(device.id)) {
                          return prev.filter(id => id !== device.id);
                        }
                        return [...prev, device.id];
                      });

                      if ((event.ctrlKey || event.metaKey) && multiSelectedDeviceIds.includes(device.id) && selectedDevice === device.id) {
                        onSelectDevice(null);
                        return;
                      }

                      onSelectDevice(device.id);
                      return;
                    }

                    setMultiSelectedDeviceIds([]);
                    onSelectDevice(device.id);
                  }}
                >
                  <DeviceCard
                    device={device}
                    isSelected={selectedDevice === device.id || multiSelectedDeviceIds.includes(device.id)}
                    isDragging={draggingDevice === device.id}
                    bindingOptions={device.type === 'input' ? [...localInputs, ...loopbackInputs] : device.type === 'output' ? localOutputs : []}
                    onChangeBinding={(boundDeviceId) => onChangeDeviceBinding(device.id, boundDeviceId)}
                    onMouseDown={(event) => {
                      if (isLocked) {
                        return;
                      }

                      const pointerWorld = clientToWorld(event.clientX, event.clientY);
                      if (multiSelectedDeviceIds.length > 1 && multiSelectedDeviceIds.includes(device.id)) {
                        setGroupDragging({ deviceIds: multiSelectedDeviceIds, lastPointer: pointerWorld });
                        return;
                      }

                      if (!multiSelectedDeviceIds.length && device.groupId) {
                        const groupedIds = devices.filter(candidate => candidate.groupId === device.groupId).map(candidate => candidate.id);
                        if (groupedIds.length > 1) {
                          setMultiSelectedDeviceIds(groupedIds);
                          setGroupDragging({ deviceIds: groupedIds, lastPointer: pointerWorld });
                          return;
                        }
                      }

                      onDeviceMouseDown(device.id, event, pointerWorld);
                    }}
                    onPortMouseDown={(channel, portType, event) => !isLocked && onPortMouseDown(device.id, channel, portType, event)}
                    onPortMouseUp={(channel, portType, event) => onPortMouseUp(device.id, channel, portType, event)}
                    onPortMouseEnter={(channel, portType) => setHoverPort({ deviceId: device.id, channel, portType })}
                    onPortMouseLeave={() => setHoverPort(null)}
                    getPortStatus={(channel, portType) => getPortStatus(device.id, channel, portType)}
                    onToggleMute={() => onToggleMute(device.id)}
                  />
                </div>
              ))}
            </div>

            {boxSelection && (
              <div
                className="selection-box"
                style={{
                  left: Math.min(boxSelection.start.x, boxSelection.end.x),
                  top: Math.min(boxSelection.start.y, boxSelection.end.y),
                  width: Math.abs(boxSelection.end.x - boxSelection.start.x),
                  height: Math.abs(boxSelection.end.y - boxSelection.start.y),
                }}
              />
            )}
          </div>

          {connectingFrom && hoverPort && (
            <div className={`connect-status ${isValidConnectionTarget(hoverPort.deviceId, hoverPort.channel, hoverPort.portType) ? 'valid' : 'invalid'}`}>
              {isValidConnectionTarget(hoverPort.deviceId, hoverPort.channel, hoverPort.portType) ? '可连接' : '目标不可连接'}
            </div>
          )}

          {connectingFrom && snappedTarget && (
            <div className="connect-status valid snap-status">已吸附到最近端口</div>
          )}

          {devices.length === 0 && (
            <div className="canvas-empty-state">
              <svg viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
              <p>拖拽创建设备</p>
              <span>从左上工具栏添加设备卡片</span>
            </div>
          )}

          {contextMenu && (
            <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
              <div
                className="context-menu-item"
                onClick={() => {
                  onSelectDevice(contextMenu.deviceId);
                  setContextMenu(null);
                }}
              >
                查看属性
              </div>
              <div className="context-menu-divider" />
              <div
                className="context-menu-item danger"
                onClick={() => {
                  onDeleteDevice(contextMenu.deviceId);
                  setContextMenu(null);
                }}
              >
                删除设备
              </div>
            </div>
          )}

          {connectionContextMenu && (
            <div className="context-menu" style={{ left: connectionContextMenu.x, top: connectionContextMenu.y }}>
              <div
                className="context-menu-item danger"
                onClick={() => {
                  onDeleteConnection(connectionContextMenu.connectionId);
                  setSelectedConnectionId(null);
                  setConnectionContextMenu(null);
                }}
              >
                删除连线
              </div>
            </div>
          )}

          {connectionTooltip && (
            <div
              className="connection-tooltip"
              style={{
                left: connectionTooltip.x + 14,
                top: connectionTooltip.y + 14,
              }}
            >
              {connectionTooltip.text}
            </div>
          )}
        </div>

        <div className="canvas-add-toolbar">
          <button className="canvas-control-btn" onClick={() => handleCreateFromToolbar('input')} title="添加输入设备" disabled={localInputs.length + loopbackInputs.length === 0}>
            <svg viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </button>
          <button className="canvas-control-btn loopback" onClick={() => handleCreateFromToolbar('loopback')} title="添加回采设备" disabled={loopbackInputs.length === 0}>
            <svg viewBox="0 0 24 24">
              <path d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2z"/>
              <path d="M12 7l4 4h-3v5h-2v-5H8z"/>
            </svg>
          </button>
          <button className="canvas-control-btn" onClick={() => handleCreateFromToolbar('output')} title="添加输出设备" disabled={localOutputs.length === 0}>
            <svg viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          </button>
          <button className="canvas-control-btn" onClick={() => handleCreateFromToolbar('processor')} title="添加效果器">
            <svg viewBox="0 0 24 24">
              <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
            </svg>
          </button>
        </div>

        <div className="canvas-controls-left">
          <button className="canvas-control-btn" onClick={onZoomOut} title="缩小">
            <svg viewBox="0 0 24 24">
              <path d="M19 13H5v-2h14v2z"/>
            </svg>
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button className="canvas-control-btn" onClick={onZoomIn} title="放大">
            <svg viewBox="0 0 24 24">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
          <div className="control-divider" />
          <button
            className={`canvas-control-btn ${isLocked ? 'active' : ''}`}
            onClick={onToggleLock}
            title={isLocked ? '解锁画布' : '锁定画布'}
          >
            <svg viewBox="0 0 24 24">
              {isLocked
                ? <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                : <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/>
              }
            </svg>
          </button>
          <button className="canvas-control-btn" onClick={handleFitAndCenter} title="适应视图并定位">
            <svg viewBox="0 0 24 24">
              <path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6z"/>
            </svg>
          </button>
          <button className="canvas-control-btn" onClick={handleLocateSelection} title="定位到选中设备">
            <svg viewBox="0 0 24 24">
              <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2.07A7.002 7.002 0 0 0 13 5.07V3h-2v2.07A7.002 7.002 0 0 0 5.07 11H3v2h2.07A7.002 7.002 0 0 0 11 18.93V21h2v-2.07A7.002 7.002 0 0 0 18.93 13H21v-2z"/>
            </svg>
          </button>
          <div className="control-divider" />
          <span className="pan-hint">空白处拖拽平移</span>
        </div>

        <div className="canvas-minimap">
          <svg viewBox={getThumbnailViewBox()} className="minimap-svg">
            <rect
              x={getThumbnailViewBox().split(' ')[0]}
              y={getThumbnailViewBox().split(' ')[1]}
              width={getThumbnailViewBox().split(' ')[2]}
              height={getThumbnailViewBox().split(' ')[3]}
              fill="var(--bg-tertiary)"
            />
            {devices.map(device => (
              <rect
                key={device.id}
                x={device.position.x}
                y={device.position.y}
                width={String(deviceCardWidth)}
                height="60"
                rx="4"
                className={`minimap-device ${device.type}`}
              />
            ))}
            {connections.map(connection => {
              const fromDevice = devices.find(d => d.id === connection.fromDeviceId);
              const toDevice = devices.find(d => d.id === connection.toDeviceId);
              if (!fromDevice || !toDevice) {
                return null;
              }

              return (
                <line
                  key={connection.id}
                  x1={fromDevice.position.x + deviceCardWidth}
                  y1={fromDevice.position.y + 30}
                  x2={toDevice.position.x}
                  y2={toDevice.position.y + 30}
                  className="minimap-connection"
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
