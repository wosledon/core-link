import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TitleBar } from './components/TitleBar';
import { SettingsPanel } from './components/SettingsPanel';
import { RoutingCanvas } from './components/RoutingCanvas';
import { CustomSelect } from './components/CustomSelect';
import { useTheme } from './hooks/useTheme';
import { useSettings } from './hooks/useSettings';
import { useAudioRouter } from './hooks/useAudioRouter';
import { CORE_LINK_VIRTUAL_PREFIX, isCoreLinkVirtualId } from './types/audio';
import type { AudioConnection, AudioDevice, AudioProject, DeviceType } from './types/audio';
import './styles/theme.css';
import './App.css';

export interface LocalAudioOption {
  id: string;
  label: string;
}

interface BackendAudioDevice {
  id: string;
  name: string;
  channels: number;
  is_default: boolean;
}

interface BackendAudioSnapshot {
  inputs: BackendAudioDevice[];
  outputs: BackendAudioDevice[];
}

interface BackendVirtualDriverStatus {
  installed: boolean;
  installer_available: boolean;
  detected_inputs: string[];
  detected_outputs: string[];
}

interface StoredProject extends AudioProject {
  id: string;
  name: string;
}

interface ProjectListItem {
  id: string;
  name: string;
  updatedAt: string;
}

const PROJECTS_STORAGE_KEY = 'core-link-projects';
const LAST_PROJECT_ID_KEY = 'core-link-last-project-id';
const LEGACY_LAST_PROJECT_KEY = 'core-link-last-project';
const DEFAULT_PROJECT_NAME = '未命名工程';

const toTrimmed = (value: string | undefined) => (value || '').trim();
const extractCoreVirtualSuffix = (id?: string) => {
  if (!isCoreLinkVirtualId(id) || !id) return '';
  return id.slice(CORE_LINK_VIRTUAL_PREFIX.length);
};

const parseStoredProjects = (): StoredProject[] => {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is StoredProject =>
          item &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          Array.isArray(item.devices) &&
          Array.isArray(item.connections),
        );
      }
    }

    const legacyRaw = localStorage.getItem(LEGACY_LAST_PROJECT_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as AudioProject | { devices: AudioDevice[]; connections: AudioConnection[] };
      if (legacy && Array.isArray(legacy.devices) && Array.isArray(legacy.connections)) {
        const legacyVersion = 'version' in legacy && typeof legacy.version === 'string' ? legacy.version : '1.0.0';
        const legacyUpdatedAt = 'updatedAt' in legacy && typeof legacy.updatedAt === 'string' ? legacy.updatedAt : new Date().toISOString();
        const migrated: StoredProject = {
          id: `project-${Date.now()}`,
          name: '迁移工程',
          version: legacyVersion,
          devices: legacy.devices,
          connections: legacy.connections,
          updatedAt: legacyUpdatedAt,
        };
        persistStoredProjects([migrated]);
        localStorage.setItem(LAST_PROJECT_ID_KEY, migrated.id);
        localStorage.removeItem(LEGACY_LAST_PROJECT_KEY);
        return [migrated];
      }
    }

    return [];
  } catch {
    return [];
  }
};

const normalizeProjectName = (value: string) => {
  const trimmed = value.trim().replace(/\.ck$/i, '').trim();
  return trimmed || DEFAULT_PROJECT_NAME;
};

const persistStoredProjects = (projects: StoredProject[]) => {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
};

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { setTheme, isDark } = useTheme();
  const {
    settings,
    isLoading,
    setLanguage,
    setTheme: setSettingsTheme,
    setAutoStart,
    setMinimizeToTray,
    setAutoLoadLastProject,
  } = useSettings();

  const [zoom, setZoom] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [history, setHistory] = useState<{ devices: AudioDevice[]; connections: any[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [localInputs, setLocalInputs] = useState<LocalAudioOption[]>([]);
  const [loopbackInputs, setLoopbackInputs] = useState<LocalAudioOption[]>([]);
  const [localOutputs, setLocalOutputs] = useState<LocalAudioOption[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>('');
  const [selectedLoopbackId, setSelectedLoopbackId] = useState<string>('');
  const [selectedOutputId, setSelectedOutputId] = useState<string>('');
  const [projectBootstrapped, setProjectBootstrapped] = useState(false);
  const bindingsBootstrappedRef = useRef(false);
  const [projectList, setProjectList] = useState<ProjectListItem[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState(DEFAULT_PROJECT_NAME);
  
  const [virtualDriverStatus, setVirtualDriverStatus] = useState<BackendVirtualDriverStatus>({
    installed: false,
    installer_available: false,
    detected_inputs: [],
    detected_outputs: [],
  });
  const [virtualDriverBusy, setVirtualDriverBusy] = useState(false);
  const [virtualDriverMessage, setVirtualDriverMessage] = useState('');
  const [virtualDriverInfFiles, setVirtualDriverInfFiles] = useState<string[]>([]);
  const [selectedVirtualDriverInf, setSelectedVirtualDriverInf] = useState('');

  const {
    devices,
    connections,
    selectedDevice,
    systemRouteStatus,
    draggingDevice,
    connectingFrom,
    mousePos,
    setMousePos,
    setDraggingDevice,
    setSelectedDevice,
    createDevice,
    deleteDevice,
    deleteConnection,
    updateDevicePosition,
    updateDeviceConfig,
    toggleMute,
    startDragDevice,
    startConnection,
    completeConnection,
    cancelConnection,
    setDevices,
    setConnections,
  } = useAudioRouter();

  // virtual endpoint pool removed

  const checkVirtualDriverStatus = useCallback(async () => {
    try {
      const status = await invoke<BackendVirtualDriverStatus>('check_virtual_audio_driver');
      setVirtualDriverStatus(status);
      setVirtualDriverMessage(status.installed ? '已检测到系统虚拟音频驱动' : '未检测到系统虚拟音频驱动');
    } catch (error) {
      setVirtualDriverMessage('虚拟驱动检测失败');
      console.error('Failed to check virtual audio driver:', error);
    }
  }, []);

  const refreshVirtualDriverInfFiles = useCallback(async () => {
    try {
      const files = await invoke<string[]>('list_virtual_driver_inf_files');
      setVirtualDriverInfFiles(files);
      setSelectedVirtualDriverInf(prev => {
        if (files.length === 0) {
          return '';
        }
        if (prev && files.includes(prev)) {
          return prev;
        }
        return files[0];
      });
    } catch (error) {
      console.error('Failed to list virtual driver inf files:', error);
    }
  }, []);

  const refreshLocalAudioDevices = useCallback(async () => {
    try {
      const backend = await invoke<BackendAudioSnapshot>('list_audio_hardware');
      const allInputs = backend.inputs.map(device => ({
        id: device.id,
        label: device.is_default ? `${device.name} (默认)` : device.name,
      }));
      const inputs = allInputs.filter(device => !device.id.startsWith('loop-out-'));
      const loops = allInputs.filter(device => device.id.startsWith('loop-out-'));
      const outputs = backend.outputs.map(device => ({
        id: device.id,
        label: device.is_default ? `${device.name} (默认)` : device.name,
      }));

      setLocalInputs(inputs);
      setLoopbackInputs(loops);
      setLocalOutputs(outputs);

      if (!selectedInputId && inputs.length > 0) {
        setSelectedInputId(inputs[0].id);
      }

      if (!selectedOutputId && outputs.length > 0) {
        setSelectedOutputId(outputs[0].id);
      }

      if (!selectedLoopbackId && loops.length > 0) {
        setSelectedLoopbackId(loops[0].id);
      }
      return;
    } catch {
    }

    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch {
    }

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const inputs = allDevices
        .filter(device => device.kind === 'audioinput')
        .map((device, index) => ({
          id: device.deviceId || `input-${index}`,
          label: device.label || `输入设备 ${index + 1}`,
        }));

      const outputs = allDevices
        .filter(device => device.kind === 'audiooutput')
        .map((device, index) => ({
          id: device.deviceId || `output-${index}`,
          label: device.label || `输出设备 ${index + 1}`,
        }));

      setLocalInputs(inputs);
      setLoopbackInputs([]);
      setLocalOutputs(outputs);

      if (!selectedInputId && inputs.length > 0) {
        setSelectedInputId(inputs[0].id);
      }

      if (!selectedOutputId && outputs.length > 0) {
        setSelectedOutputId(outputs[0].id);
      }
    } catch (error) {
      console.error('Failed to enumerate local audio devices:', error);
    }
  }, [selectedInputId, selectedLoopbackId, selectedOutputId]);

  const handleInstallVirtualDriver = useCallback(async () => {
    setVirtualDriverBusy(true);
    setVirtualDriverMessage('正在安装虚拟音频驱动...');
    try {
      const output = await invoke<string>('install_virtual_audio_driver', {
        infName: selectedVirtualDriverInf || null,
      });
      setVirtualDriverMessage(output || '驱动安装命令已执行');
      await refreshLocalAudioDevices();
      await checkVirtualDriverStatus();
      await refreshVirtualDriverInfFiles();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVirtualDriverMessage(`驱动安装失败：${message}\n日志：drivers/windows/install-virtual-audio-driver.last.log`);
      console.error('Failed to install virtual audio driver:', error);
    } finally {
      setVirtualDriverBusy(false);
    }
  }, [checkVirtualDriverStatus, refreshLocalAudioDevices, refreshVirtualDriverInfFiles, selectedVirtualDriverInf]);

  useEffect(() => {
    setTheme(settings.theme);
  }, [settings.theme, setTheme]);

  const saveHistory = useCallback(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ devices: [...devices], connections: [...connections] });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [devices, connections, history, historyIndex]);

  const updateProjectListState = useCallback((projects: StoredProject[], nextActiveProjectId?: string | null) => {
    const sorted = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setProjectList(sorted.map(project => ({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
    })));

    if (typeof nextActiveProjectId !== 'undefined') {
      setActiveProjectId(nextActiveProjectId);
    }
  }, []);

  useEffect(() => {
    refreshLocalAudioDevices();
    checkVirtualDriverStatus();
    refreshVirtualDriverInfFiles();
    navigator.mediaDevices?.addEventListener('devicechange', refreshLocalAudioDevices);

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', refreshLocalAudioDevices);
    };
  }, [checkVirtualDriverStatus, refreshLocalAudioDevices, refreshVirtualDriverInfFiles]);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    checkVirtualDriverStatus();
    refreshVirtualDriverInfFiles();
  }, [checkVirtualDriverStatus, refreshVirtualDriverInfFiles, settingsOpen]);

  useEffect(() => {
    if (bindingsBootstrappedRef.current) {
      return;
    }

    if (localInputs.length === 0 && localOutputs.length === 0 && loopbackInputs.length === 0) {
      return;
    }

    bindingsBootstrappedRef.current = true;

    setDevices(prev => prev.map(device => {
      if (device.isVirtual) {
        return device;
      }

      if (device.type === 'input') {
        const allInputCandidates = [...localInputs, ...loopbackInputs];
        const fallback = allInputCandidates.find(option => option.id === selectedInputId || option.id === selectedLoopbackId) ?? allInputCandidates[0];
        if (!fallback) {
          return device;
        }

        const isUnknownBinding = !device.boundDeviceId || device.boundDeviceId === 'default-input' || !allInputCandidates.some(option => option.id === device.boundDeviceId);
        if (!isUnknownBinding) {
          return device;
        }

        return {
          ...device,
          boundDeviceId: fallback.id,
          boundDeviceLabel: fallback.label,
        };
      }

      if (device.type === 'output') {
        const fallback = localOutputs.find(option => option.id === selectedOutputId) ?? localOutputs[0];
        if (!fallback) {
          return device;
        }

        const isUnknownBinding = !device.boundDeviceId || device.boundDeviceId === 'default-output' || !localOutputs.some(option => option.id === device.boundDeviceId);
        if (!isUnknownBinding) {
          return device;
        }

        return {
          ...device,
          boundDeviceId: fallback.id,
          boundDeviceLabel: fallback.label,
        };
      }

      return device;
    }));
  }, [localInputs, localOutputs, loopbackInputs, selectedInputId, selectedLoopbackId, selectedOutputId, setDevices]);

  // 历史记录导航的通用函数
  const navigateHistory = useCallback((direction: 'undo' | 'redo') => {
    const targetIndex = direction === 'undo' ? historyIndex - 1 : historyIndex + 1;
    const isValid = direction === 'undo' ? historyIndex > 0 : historyIndex < history.length - 1;
    
    if (!isValid) return;
    
    const targetState = history[targetIndex];
    if (targetState) {
      setDevices(targetState.devices);
      setConnections(targetState.connections);
      setHistoryIndex(targetIndex);
    }
  }, [history, historyIndex, setDevices, setConnections]);

  const handleUndo = useCallback(() => navigateHistory('undo'), [navigateHistory]);
  const handleRedo = useCallback(() => navigateHistory('redo'), [navigateHistory]);

  const handleNewProject = useCallback(() => {
    saveHistory();
    setDevices([]);
    setConnections([]);
    setSelectedDevice(null);
    setActiveProjectId(null);
    setCurrentProjectName(DEFAULT_PROJECT_NAME);
    localStorage.removeItem(LAST_PROJECT_ID_KEY);
  }, [saveHistory, setDevices, setConnections, setSelectedDevice]);

  const handleLoadProjectById = useCallback((projectId: string) => {
    const projects = parseStoredProjects();
    const project = projects.find(item => item.id === projectId);
    if (!project) {
      return;
    }

    saveHistory();
    setDevices(project.devices);
    setConnections(project.connections);
    setSelectedDevice(null);
    setActiveProjectId(projectId);
    setCurrentProjectName(project.name || DEFAULT_PROJECT_NAME);
    localStorage.setItem(LAST_PROJECT_ID_KEY, projectId);
  }, [saveHistory, setConnections, setDevices, setSelectedDevice]);

  const handleOpenProject = useCallback(() => {
    const projects = parseStoredProjects();
    if (projects.length === 0) {
      return;
    }

    const lastId = localStorage.getItem(LAST_PROJECT_ID_KEY);
    const target = (lastId && projects.find(project => project.id === lastId)) || [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!target) {
      return;
    }

    handleLoadProjectById(target.id);
  }, [handleLoadProjectById]);

  const handleSaveProject = useCallback(() => {
    const now = new Date().toISOString();
    const projects = parseStoredProjects();
    const existing = activeProjectId ? projects.find(project => project.id === activeProjectId) : undefined;
    const resolvedName = normalizeProjectName(currentProjectName);

    const snapshot: StoredProject = {
      id: existing?.id || `project-${Date.now()}`,
      name: resolvedName,
      version: '1.0.0',
      devices,
      connections,
      updatedAt: now,
    };

    try {
      const nextProjects = [snapshot, ...projects.filter(project => project.id !== snapshot.id)];
      persistStoredProjects(nextProjects);
      localStorage.setItem(LAST_PROJECT_ID_KEY, snapshot.id);
      updateProjectListState(nextProjects, snapshot.id);
      setCurrentProjectName(snapshot.name);
    } catch (error) {
      console.error('Failed to save project:', error);
    }
  }, [activeProjectId, connections, currentProjectName, devices, updateProjectListState]);

  const handleProjectNameChange = useCallback((nextName: string) => {
    const resolvedName = normalizeProjectName(nextName);
    setCurrentProjectName(resolvedName);

    if (!activeProjectId) {
      return;
    }

    const projects = parseStoredProjects();
    const nextProjects = projects.map(project => (
      project.id === activeProjectId
        ? { ...project, name: resolvedName, updatedAt: new Date().toISOString() }
        : project
    ));

    persistStoredProjects(nextProjects);
    updateProjectListState(nextProjects, activeProjectId);
  }, [activeProjectId, updateProjectListState]);

  useEffect(() => {
    if (projectBootstrapped || isLoading) {
      return;
    }

    const projects = parseStoredProjects();
    const lastId = localStorage.getItem(LAST_PROJECT_ID_KEY);
    updateProjectListState(projects, lastId);
    const targetProject = lastId ? projects.find(project => project.id === lastId) : undefined;
    setCurrentProjectName(targetProject?.name || DEFAULT_PROJECT_NAME);

    if (settings.autoLoadLastProject) {
      handleOpenProject();
    }

    setProjectBootstrapped(true);
  }, [handleOpenProject, isLoading, projectBootstrapped, settings.autoLoadLastProject, updateProjectListState]);

  const handleAutoRoute = useCallback(() => {
    const inputDevices = devices.filter(device => device.type === 'input');
    const processorDevices = devices.filter(device => device.type === 'processor');
    const outputDevices = devices.filter(device => device.type === 'output');

    if (inputDevices.length === 0 || outputDevices.length === 0) {
      return;
    }

    saveHistory();

    const routeConnections: AudioConnection[] = [];
    const usedInputs = new Set<string>(); // 记录已使用的输入端口
    const usedOutputs = new Set<string>(); // 记录已使用的输出端口

    const getPortKey = (deviceId: string, channel: number) => `${deviceId}-${channel}`;

    const pushConnection = (fromDeviceId: string, fromChannel: number, toDeviceId: string, toChannel: number) => {
      const outputKey = getPortKey(fromDeviceId, fromChannel);
      const inputKey = getPortKey(toDeviceId, toChannel);

      // 检查是否已存在相同的连接
      const hasDuplicate = routeConnections.some(connection =>
        connection.fromDeviceId === fromDeviceId &&
        connection.fromChannel === fromChannel &&
        connection.toDeviceId === toDeviceId &&
        connection.toChannel === toChannel,
      );
      if (hasDuplicate) return;

      // 检查输入端口是否已被占用
      if (usedInputs.has(inputKey)) return;

      // 检查输出端口是否已被占用（一个输出可以连接到多个输入，但这里我们限制一对一以获得更清晰的布线）
      // 如果需要一对多，可以注释掉下面这行
      // if (usedOutputs.has(outputKey)) return;

      usedInputs.add(inputKey);
      usedOutputs.add(outputKey);

      routeConnections.push({
        id: `${fromDeviceId}-${fromChannel}-${toDeviceId}-${toChannel}-${Date.now()}`,
        fromDeviceId,
        fromChannel,
        toDeviceId,
        toChannel,
        enabled: true,
        signalStrength: 0.2,
      });
    };

    // 智能路由策略：
    // 1. 如果有处理器，优先将输入连接到处理器，再将处理器连接到输出
    // 2. 根据通道数智能匹配，避免通道浪费
    // 3. 支持多对多连接

    if (processorDevices.length > 0) {
      // 第一阶段：输入设备 -> 处理器
      inputDevices.forEach((inputDevice, inputIndex) => {
        // 为每个输入设备找到最佳的处理器（轮询分配）
        const targetProcessor = processorDevices[inputIndex % processorDevices.length];
        
        // 匹配通道数，建立连接
        const channels = Math.min(inputDevice.channels, targetProcessor.channels);
        for (let ch = 0; ch < channels; ch++) {
          pushConnection(inputDevice.id, ch, targetProcessor.id, ch);
        }
      });

      // 第二阶段：处理器 -> 输出设备
      processorDevices.forEach((processor, procIndex) => {
        // 为每个处理器找到最佳的输出设备（轮询分配）
        const targetOutput = outputDevices[procIndex % outputDevices.length];
        
        // 匹配通道数，建立连接
        const channels = Math.min(processor.channels, targetOutput.channels);
        for (let ch = 0; ch < channels; ch++) {
          pushConnection(processor.id, ch, targetOutput.id, ch);
        }
      });
    } else {
      // 没有处理器时：输入设备直接连接到输出设备
      // 使用轮询策略确保每个输入都能连接到输出
      inputDevices.forEach((inputDevice, inputIndex) => {
        // 为当前输入设备找到对应的输出设备
        const targetOutput = outputDevices[inputIndex % outputDevices.length];
        
        // 匹配通道数
        const channels = Math.min(inputDevice.channels, targetOutput.channels);
        for (let ch = 0; ch < channels; ch++) {
          pushConnection(inputDevice.id, ch, targetOutput.id, ch);
        }
      });
    }

    setConnections(routeConnections);
  }, [devices, saveHistory, setConnections]);

  const handleAutoLayout = useCallback((anchor: { x: number; y: number }) => {
    if (devices.length === 0) {
      return;
    }

    saveHistory();

    // 布局参数
    const columnGap = 600;  // 列间距
    const rowGap = 180;     // 行间距

    // 按类型分组
    const groupedByType: Record<DeviceType, AudioDevice[]> = {
      input: [],
      processor: [],
      output: [],
    };

    devices.forEach(device => {
      groupedByType[device.type].push(device);
    });

    // 按名称排序
    (Object.keys(groupedByType) as DeviceType[]).forEach(type => {
      groupedByType[type].sort((a, b) => a.name.localeCompare(b.name));
    });

    // 计算每列的X坐标
    const hasProcessors = groupedByType.processor.length > 0;
    const columns: Record<DeviceType, number> = {
      input: hasProcessors ? anchor.x - columnGap : anchor.x - columnGap / 2,
      processor: anchor.x,
      output: hasProcessors ? anchor.x + columnGap : anchor.x + columnGap / 2,
    };

    const layoutMap = new Map<string, { x: number; y: number }>();

    // 计算每列的最大高度，用于垂直居中
    (Object.keys(groupedByType) as DeviceType[]).forEach(type => {
      const list = groupedByType[type];
      if (list.length === 0) return;

      // 计算该列的总高度
      const totalHeight = (list.length - 1) * rowGap;
      
      // 计算起始Y坐标（垂直居中）
      const startY = anchor.y - totalHeight / 2;

      list.forEach((device, index) => {
        layoutMap.set(device.id, {
          x: columns[type],
          y: startY + index * rowGap,
        });
      });
    });

    setDevices(prev => prev.map(device => ({
      ...device,
      position: layoutMap.get(device.id) ?? device.position,
    })));
  }, [devices, saveHistory, setDevices]);

  // 缩放控制
  const handleZoomIn = useCallback(() => setZoom(prev => Math.min(prev * 1.15, 2.6)), []);
  const handleZoomOut = useCallback(() => setZoom(prev => Math.max(prev / 1.15, 0.35)), []);
  const handleFitToView = useCallback((targetZoom: number) => setZoom(targetZoom), []);
  
  // 锁定切换
  const handleToggleLock = useCallback(() => setIsLocked(prev => !prev), []);

  const handleCanvasMouseMove = useCallback((pos: { x: number; y: number }) => {
    setMousePos(pos);

    if (draggingDevice) {
      updateDevicePosition(draggingDevice, pos);
    }
  }, [draggingDevice, setMousePos, updateDevicePosition]);

  const handleCanvasMouseUp = useCallback(() => {
    if (draggingDevice) {
      setDraggingDevice(null);
      saveHistory();
    }

    if (connectingFrom) {
      cancelConnection();
    }
  }, [draggingDevice, connectingFrom, setDraggingDevice, cancelConnection, saveHistory]);

  const handlePortMouseUp = useCallback((deviceId: string, channel: number, portType: 'input' | 'output') => {
    if (!connectingFrom) {
      return;
    }

    completeConnection(deviceId, channel, portType);
    saveHistory();
  }, [completeConnection, connectingFrom, saveHistory]);

  // 阻止连接完成时的事件冒泡，避免触发 cancelConnection
  const handlePortMouseUpWithStopPropagation = useCallback((deviceId: string, channel: number, portType: 'input' | 'output', event: React.MouseEvent) => {
    event.stopPropagation();
    handlePortMouseUp(deviceId, channel, portType);
  }, [handlePortMouseUp]);

  const handleThemeChange = useCallback((nextTheme: 'light' | 'dark' | 'system') => {
    setTheme(nextTheme);
    setSettingsTheme(nextTheme);
  }, [setTheme, setSettingsTheme]);

  const handleDeleteDevice = useCallback((deviceId: string) => {
    saveHistory();
    deleteDevice(deviceId);
  }, [saveHistory, deleteDevice]);

  const handleDeleteConnection = useCallback((connectionId: string) => {
    saveHistory();
    deleteConnection(connectionId);
  }, [saveHistory, deleteConnection]);

  const handleToggleMute = useCallback((deviceId: string) => {
    toggleMute(deviceId);
  }, [toggleMute]);

  const handleMoveDevicesByDelta = useCallback((deviceIds: string[], delta: { x: number; y: number }) => {
    const idSet = new Set(deviceIds);
    setDevices(prev => prev.map(device => {
      if (!idSet.has(device.id)) {
        return device;
      }

      return {
        ...device,
        position: {
          x: device.position.x + delta.x,
          y: device.position.y + delta.y,
        },
      };
    }));
  }, [setDevices]);

  const handleBatchMoveEnd = useCallback(() => {
    saveHistory();
  }, [saveHistory]);

  const handleRecenterWorld = useCallback((delta: { x: number; y: number }) => {
    if (Math.abs(delta.x) < 1 && Math.abs(delta.y) < 1) {
      return;
    }

    setDevices(prev => prev.map(device => ({
      ...device,
      position: {
        x: device.position.x + delta.x,
        y: device.position.y + delta.y,
      },
    })));
  }, [setDevices]);

  const handleGroupDevices = useCallback((deviceIds: string[]) => {
    if (deviceIds.length < 2) {
      return;
    }

    saveHistory();
    const nextGroupId = `group-${Date.now()}`;
    const idSet = new Set(deviceIds);

    setDevices(prev => prev.map(device => {
      if (!idSet.has(device.id)) {
        return device;
      }

      return {
        ...device,
        groupId: nextGroupId,
      };
    }));
  }, [saveHistory, setDevices]);

  const handleUngroupDevices = useCallback((deviceIds: string[]) => {
    if (deviceIds.length === 0) {
      return;
    }

    saveHistory();
    const idSet = new Set(deviceIds);
    const groupIdsToClear = new Set(
      devices
        .filter(device => idSet.has(device.id) && device.groupId)
        .map(device => device.groupId as string),
    );

    setDevices(prev => prev.map(device => {
      if (!device.groupId || !groupIdsToClear.has(device.groupId)) {
        return device;
      }

      return {
        ...device,
        groupId: undefined,
      };
    }));
  }, [devices, saveHistory, setDevices]);

  const handleCreateDevice = useCallback((
    type: DeviceType,
    source: 'local' | 'virtual',
    preferredDeviceId?: string,
    preferredPosition?: { x: number; y: number },
  ) => {
    const typeCount = devices.filter(device => device.type === type).length + 1;
    const fallbackPositionX = type === 'input' ? 200 : type === 'processor' ? 760 : 1320;
    const fallbackPositionY = 120 + (typeCount - 1) * 200;

    const defaultNameMap: Record<DeviceType, string> = {
      input: '输入设备',
      output: '输出设备',
      processor: '效果器',
    };

    const channelsMap: Record<DeviceType, number> = {
      input: 2,
      output: 2,
      processor: 4,
    };

    let boundDeviceId: string | undefined;
    let boundDeviceLabel: string | undefined;

    // no in-app virtual binding; treat all creations as local-bound by default

    if (!boundDeviceId && source === 'local' && type === 'input') {
      const allInputCandidates = [...localInputs, ...loopbackInputs];
      const current = allInputCandidates.find(item => item.id === preferredDeviceId)
        ?? allInputCandidates.find(item => item.id === selectedInputId)
        ?? allInputCandidates.find(item => item.id === selectedLoopbackId)
        ?? allInputCandidates[0];
      boundDeviceId = current?.id;
      boundDeviceLabel = current?.label || '系统输入';
    }

    if (!boundDeviceId && source === 'local' && type === 'output') {
      const current = localOutputs.find(item => item.id === selectedOutputId) ?? localOutputs[0];
      boundDeviceId = current?.id;
      boundDeviceLabel = current?.label || '系统输出';
    }

    if (type === 'processor') {
      boundDeviceLabel = source === 'virtual' ? '虚拟效果器链路' : '本机效果器链路';
    }

    const displayName = `${boundDeviceLabel || defaultNameMap[type]} #${typeCount}`;

    saveHistory();

    createDevice(
      type,
      displayName,
      channelsMap[type],
      preferredPosition ?? { x: fallbackPositionX, y: fallbackPositionY },
      {
        isVirtual: false,
        boundDeviceId,
        boundDeviceLabel: boundDeviceLabel || displayName,
        nameCustomized: false,
      },
    );
  }, [createDevice, devices, localInputs, localOutputs, loopbackInputs, saveHistory, selectedInputId, selectedLoopbackId, selectedOutputId]);

  const handleCreateToolbarDevice = useCallback((kind: 'input' | 'loopback' | 'output' | 'processor', position: { x: number; y: number }) => {
    if (kind === 'input') {
      const inputId = selectedInputId || localInputs[0]?.id;
      handleCreateDevice('input', 'local', inputId || undefined, position);
      return;
    }

    if (kind === 'loopback') {
      const loopbackId = selectedLoopbackId || loopbackInputs[0]?.id;
      if (!loopbackId) {
        return;
      }
      handleCreateDevice('input', 'local', loopbackId, position);
      return;
    }

    if (kind === 'output') {
      const outputId = selectedOutputId || localOutputs[0]?.id;
      handleCreateDevice('output', 'local', outputId || undefined, position);
      return;
    }

    handleCreateDevice('processor', 'local', undefined, position);
  }, [handleCreateDevice, localInputs, localOutputs, selectedInputId, selectedLoopbackId, selectedOutputId]);

  // virtual endpoint controls removed

  const handleChangeDeviceBinding = useCallback((deviceId: string, boundDeviceId: string) => {
    const targetDevice = devices.find(device => device.id === deviceId);
    if (!targetDevice) {
      return;
    }

    const options = targetDevice.type === 'input' ? [...localInputs, ...loopbackInputs] : targetDevice.type === 'output' ? localOutputs : [];
    const targetOption = options.find(option => option.id === boundDeviceId);
    if (!targetOption) {
      return;
    }

    updateDeviceConfig(deviceId, {
      boundDeviceId: targetOption.id,
      boundDeviceLabel: targetOption.label,
      isVirtual: false,
      name: targetDevice.nameCustomized ? targetDevice.name : targetOption.label,
      nameCustomized: targetDevice.nameCustomized ?? false,
    });
  }, [devices, localInputs, localOutputs, loopbackInputs, updateDeviceConfig]);

  const handleDevicePropertiesUpdate = useCallback((
    deviceId: string,
    patch: Partial<Pick<AudioDevice, 'name' | 'nameCustomized' | 'gain' | 'enabled' | 'muted' | 'channels' | 'isVirtual' | 'boundDeviceId' | 'boundDeviceLabel'>>,
  ) => {
    const targetDevice = devices.find(device => device.id === deviceId);
    if (!targetDevice) {
      return;
    }

    if (typeof patch.name === 'string') {
      const nextName = patch.name;
      const currentBindingLabel = toTrimmed(targetDevice.boundDeviceLabel);
      const customized = toTrimmed(nextName) !== '' && toTrimmed(nextName) !== currentBindingLabel;
      const nextPatch: Partial<Pick<AudioDevice, 'name' | 'nameCustomized' | 'boundDeviceId' | 'boundDeviceLabel'>> = {
        ...patch,
        name: nextName,
        nameCustomized: customized,
      };

      updateDeviceConfig(deviceId, nextPatch);
      return;
    }

    if (typeof patch.boundDeviceId === 'string' || typeof patch.boundDeviceLabel === 'string') {
      const nextLabel = patch.boundDeviceLabel ?? targetDevice.boundDeviceLabel ?? targetDevice.name;
      updateDeviceConfig(deviceId, {
        ...patch,
        isVirtual: false,
        name: targetDevice.nameCustomized ? targetDevice.name : nextLabel,
        nameCustomized: targetDevice.nameCustomized ?? false,
      });
      return;
    }

    updateDeviceConfig(deviceId, patch);
  }, [devices, updateDeviceConfig]);

  const handleResetDeviceName = useCallback((deviceId: string) => {
    const targetDevice = devices.find(device => device.id === deviceId);
    if (!targetDevice) {
      return;
    }

    const nextName = targetDevice.boundDeviceLabel || targetDevice.name;
    updateDeviceConfig(deviceId, {
      name: nextName,
      nameCustomized: false,
    });
  }, [devices, updateDeviceConfig]);

  const selectedDeviceData = devices.find(device => device.id === selectedDevice);

  if (isLoading) {
    return (
      <div className="app-container">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${isDark ? 'dark' : ''}`}>
      <TitleBar
        onOpenSettings={() => setSettingsOpen(true)}
        projectName={currentProjectName}
        onProjectNameChange={handleProjectNameChange}
        minimizeToTray={settings.minimizeToTray}
      />

      <main className="app-main">
        <section className="canvas-area">
          {/* 系统引擎状态卡片 */}
          <div className={`engine-status-card ${systemRouteStatus.running ? 'running' : ''}`}>
            <div className="engine-status-indicator" />
            <span className="engine-status-text">
              {systemRouteStatus.running ? `系统引擎运行中 · ${systemRouteStatus.route_count || 0} 路` : '系统引擎未运行'}
            </span>
          </div>
          <RoutingCanvas
            devices={devices}
            connections={connections}
            localInputs={localInputs}
            loopbackInputs={loopbackInputs}
            localOutputs={localOutputs}
            selectedDevice={selectedDevice}
            draggingDevice={draggingDevice}
            connectingFrom={connectingFrom}
            mousePos={mousePos}
            zoom={zoom}
            isLocked={isLocked}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onDeviceMouseDown={startDragDevice}
            onPortMouseDown={startConnection}
            onPortMouseUp={handlePortMouseUpWithStopPropagation}
            onToggleMute={handleToggleMute}
            onDeleteDevice={handleDeleteDevice}
            onDeleteConnection={handleDeleteConnection}
            onMoveDevicesByDelta={handleMoveDevicesByDelta}
            onRecenterWorld={handleRecenterWorld}
            onBatchMoveEnd={handleBatchMoveEnd}
            onGroupDevices={handleGroupDevices}
            onUngroupDevices={handleUngroupDevices}
            onSelectDevice={setSelectedDevice}
            onCanvasDrop={() => {}}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onToggleLock={handleToggleLock}
            onFitToView={handleFitToView}
            onNewProject={handleNewProject}
            onSaveProject={handleSaveProject}
            projects={projectList}
            activeProjectId={activeProjectId}
            onLoadProject={handleLoadProjectById}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onAutoRoute={handleAutoRoute}
            onAutoLayout={handleAutoLayout}
            onCreateToolbarDevice={handleCreateToolbarDevice}
            onChangeDeviceBinding={handleChangeDeviceBinding}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
          />
        </section>

        <aside className="sidebar sidebar-right">
          <div className="panel-header">
            <h3>设备属性</h3>
          </div>
          <div className="panel-content">
            {selectedDeviceData ? (
              <DeviceProperties
                device={selectedDeviceData}
                localInputs={localInputs}
                loopbackInputs={loopbackInputs}
                localOutputs={localOutputs}
                onUpdate={(patch) => handleDevicePropertiesUpdate(selectedDeviceData.id, patch)}
                onResetName={() => handleResetDeviceName(selectedDeviceData.id)}
                onUpdateVirtualSuffix={() => {}}
                onFollowNameForVirtualSuffix={() => {}}
              />
            ) : (
              <div className="empty-state">
                <span>在画布中点击设备后编辑属性</span>
              </div>
            )}
          </div>
        </aside>
      </main>

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        language={settings.language}
        theme={settings.theme}
        autoStart={settings.autoStart}
        minimizeToTray={settings.minimizeToTray}
        autoLoadLastProject={settings.autoLoadLastProject}
        onLanguageChange={setLanguage}
        onThemeChange={handleThemeChange}
        onAutoStartChange={setAutoStart}
        onMinimizeToTrayChange={setMinimizeToTray}
        onAutoLoadLastProjectChange={setAutoLoadLastProject}
        virtualDriverStatus={virtualDriverStatus}
        virtualDriverBusy={virtualDriverBusy}
        virtualDriverMessage={virtualDriverMessage}
        virtualDriverInfFiles={virtualDriverInfFiles}
        selectedVirtualDriverInf={selectedVirtualDriverInf}
        onCheckVirtualDriver={checkVirtualDriverStatus}
        onInstallVirtualDriver={handleInstallVirtualDriver}
        onSelectVirtualDriverInf={setSelectedVirtualDriverInf}
      />
    </div>
  );
}

interface DevicePropertiesProps {
  device: AudioDevice;
  localInputs: LocalAudioOption[];
  loopbackInputs: LocalAudioOption[];
  localOutputs: LocalAudioOption[];
  onUpdate: (patch: Partial<Pick<AudioDevice, 'name' | 'nameCustomized' | 'virtualSuffixCustomized' | 'gain' | 'enabled' | 'muted' | 'channels' | 'isVirtual' | 'boundDeviceId' | 'boundDeviceLabel'>>) => void;
  onResetName: () => void;
  onUpdateVirtualSuffix: (suffix: string) => void;
  onFollowNameForVirtualSuffix: () => void;
}

function DeviceProperties({ device, localInputs, loopbackInputs, localOutputs, onUpdate, onResetName, onUpdateVirtualSuffix, onFollowNameForVirtualSuffix }: DevicePropertiesProps) {
  const localOptions = device.type === 'input' ? [...localInputs, ...loopbackInputs] : device.type === 'output' ? localOutputs : [];
  const availableChannelOptions = [1, 2, 4, 6, 8, 12, 16];
  const isCoreLinkVirtual = isCoreLinkVirtualId(device.boundDeviceId);

  // 计算增益滑块填充高度百分比 (-60 ~ +24)
  const gainPercent = ((device.gain + 60) / 84) * 100;

  return (
    <div className="device-properties">
      <div className="prop-main-content">
        <div className="prop-card">
          <div className="prop-card-title">基础信息</div>
          <div className="prop-group">
            <div className="name-label-row">
              <label>名称</label>
              <span className={`name-mode-chip ${device.nameCustomized ? 'custom' : 'auto'}`}>
                {device.nameCustomized ? '自定义' : '自动'}
              </span>
            </div>
            <div className="name-input-row">
              <input
                type="text"
                value={device.name}
                onChange={(event) => onUpdate({ name: event.target.value })}
              />
            </div>
            <button className="name-reset-btn" type="button" onClick={onResetName}>
              重置名称
            </button>
          </div>
          <div className="prop-group">
            <label>类型</label>
            <input type="text" value={device.type} readOnly />
          </div>
        </div>

        <div className="prop-card">
          <div className="prop-card-title">设备来源</div>
          <div className="prop-group">
            <label>绑定设备</label>
            {device.type === 'processor' || device.isVirtual || isCoreLinkVirtual ? (
              <input type="text" value={device.boundDeviceLabel || '虚拟效果器链路'} readOnly />
            ) : (
              <CustomSelect
                value={device.boundDeviceId || ''}
                options={localOptions.map(option => ({ value: option.id, label: option.label }))}
                onChange={(value) => {
                  const selected = localOptions.find(option => option.id === value);
                  onUpdate({
                    boundDeviceId: selected?.id,
                    boundDeviceLabel: selected?.label,
                    isVirtual: false,
                  });
                }}
                searchable
                minDropdownWidth={200}
              />
            )}
          </div>
          {(isCoreLinkVirtual || device.isVirtual) && (
            <div className="prop-group">
              <label>虚拟设备 ID</label>
              <input type="text" value={device.boundDeviceId || ''} readOnly />
            </div>
          )}
          {isCoreLinkVirtual && (
            <div className="prop-group">
              <label>虚拟后缀</label>
              <div className="virtual-suffix-row">
                <input
                  type="text"
                  value={extractCoreVirtualSuffix(device.boundDeviceId)}
                  onChange={(event) => onUpdateVirtualSuffix(event.target.value)}
                />
                <button className="name-reset-btn" type="button" onClick={onFollowNameForVirtualSuffix}>
                  跟随名称
                </button>
              </div>
              <span className="virtual-suffix-hint">
                {device.virtualSuffixCustomized ? '已锁定自定义后缀' : '当前后缀自动跟随名称'}
              </span>
            </div>
          )}
        </div>

        <div className="prop-card">
          <div className="prop-card-title">音频状态</div>
          <div className="audio-status-grid">
            <div className="status-item">
              <span className="status-label">设备状态</span>
              <button
                className={`status-toggle ${device.enabled ? 'active' : ''}`}
                onClick={() => onUpdate({ enabled: !device.enabled })}
                type="button"
              >
                <span className="toggle-indicator" />
                <span className="toggle-label">{device.enabled ? '已启用' : '已禁用'}</span>
              </button>
            </div>
            <div className="status-item">
              <span className="status-label">静音</span>
              <button
                className={`status-toggle ${device.muted ? 'muted' : ''}`}
                onClick={() => onUpdate({ muted: !device.muted })}
                type="button"
              >
                <span className="toggle-indicator" />
                <span className="toggle-label">{device.muted ? '已静音' : '正常'}</span>
              </button>
            </div>
          </div>
          <div className="prop-group">
            <label>通道数</label>
            <CustomSelect
              value={String(device.channels)}
              options={availableChannelOptions.map(ch => ({ value: String(ch), label: `${ch} 通道` }))}
              onChange={(value) => onUpdate({ channels: Number(value) })}
              searchable
              minDropdownWidth={200}
            />
          </div>
        </div>
      </div>

      {/* 纵向增益控制区域 */}
      <div className="prop-gain-section">
        <button
          className="gain-reset-btn-top"
          onClick={() => onUpdate({ gain: 0 })}
          type="button"
          title="重置增益"
        >
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
          </svg>
        </button>
        <div className="gain-fader-container">
          <div className="gain-fader-scale">
            <span>+24</span>
            <span>+12</span>
            <span>0</span>
            <span>-12</span>
            <span>-24</span>
            <span>-36</span>
            <span>-48</span>
            <span>-60</span>
          </div>
          <div className="gain-fader-track" style={{ '--gain-percent': gainPercent } as React.CSSProperties}>
            <div 
              className="gain-fader-fill"
              style={{ height: `${gainPercent}%` }}
            />
            <div 
              className="gain-fader-thumb"
              style={{ bottom: `calc(${gainPercent}% - 10px)` }}
            />
            <input
              type="range"
              min="-60"
              max="24"
              step="0.5"
              value={device.gain}
              onChange={(event) => onUpdate({ gain: Number(event.target.value) })}
              className="gain-fader"
            />
          </div>
        </div>
        <div className="gain-fader-value">
          <span className="gain-fader-label">GAIN</span>
          <span className="gain-fader-db">{device.gain > 0 ? '+' : ''}{Number(device.gain).toFixed(1)} dB</span>
        </div>
      </div>
    </div>
  );
}

export default App;
