import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AudioConnection, AudioDevice, DeviceType } from '../types/audio';

interface SystemRoutePair {
  inputDeviceId: string;
  outputDeviceId: string;
}

interface SystemRouteStatus {
  running: boolean;
  input_device_id?: string;
  output_device_id?: string;
  route_count?: number;
}

interface BackendLevelSnapshot {
  input_levels: Record<string, number>;
  output_levels: Record<string, number>;
}

// 使用 crypto.randomUUID 如果可用，否则回退到 Math.random
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 11);
};
const dbToLinear = (gainDb: number) => Math.pow(10, gainDb / 20);
const isBackendInputId = (value?: string) => typeof value === 'string' && (/^in-\d+$/.test(value) || /^loop-out-\d+$/.test(value) || /^v-in-\d+$/.test(value));
const isBackendOutputId = (value?: string) => typeof value === 'string' && (/^out-\d+$/.test(value) || /^v-out-\d+$/.test(value));
const toDisplayLevel = (raw: number) => {
  const clamped = Math.max(0, Math.min(1, raw));
  return Math.max(0, Math.min(1, Math.pow(clamped, 0.72) * 0.9));
};

const createInitialDevices = (): AudioDevice[] => [
  {
    id: 'input-1',
    name: '麦克风',
    nameCustomized: false,
    virtualSuffixCustomized: false,
    type: 'input',
    channels: 2,
    enabled: true,
    position: { x: 50, y: 100 },
    groupId: undefined,
    isVirtual: false,
    boundDeviceId: 'default-input',
    boundDeviceLabel: '系统默认输入',
    levels: [0, 0],
    muted: false,
    gain: 0,
  },
  {
    id: 'output-1',
    name: '扬声器',
    nameCustomized: false,
    virtualSuffixCustomized: false,
    type: 'output',
    channels: 2,
    enabled: true,
    position: { x: 500, y: 100 },
    groupId: undefined,
    isVirtual: false,
    boundDeviceId: 'default-output',
    boundDeviceLabel: '系统默认输出',
    levels: [0, 0],
    muted: false,
    gain: 0,
  },
];

export function useAudioRouter() {
  const [devices, setDevices] = useState<AudioDevice[]>(createInitialDevices);
  const [connections, setConnections] = useState<AudioConnection[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [draggingDevice, setDraggingDevice] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ deviceId: string; channel: number; portType: 'output' } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // 同步 dragOffset 到 ref
  useEffect(() => {
    dragOffsetRef.current = dragOffset;
  }, [dragOffset]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const deviceGainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const deviceAnalyserNodesRef = useRef<Map<string, AnalyserNode>>(new Map());
  const inputSourceNodesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const inputSourceBindingRef = useRef<Map<string, string>>(new Map());
  const inputStreamCacheRef = useRef<Map<string, MediaStream>>(new Map());
  const inputStreamUsageRef = useRef<Map<string, Set<string>>>(new Map());
  const outputDestinationNodesRef = useRef<Map<string, MediaStreamAudioDestinationNode>>(new Map());
  const outputMonitorElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const outputSinkBindingRef = useRef<Map<string, string>>(new Map());
  const routeGainNodesRef = useRef<GainNode[]>([]);
  const meterTimerRef = useRef<number | null>(null);
  const activeSystemRouteSignatureRef = useRef<string>('');
  const devicesRef = useRef<AudioDevice[]>([]);
  const backendLevelsRef = useRef<BackendLevelSnapshot>({ input_levels: {}, output_levels: {} });
  const backendPollingBusyRef = useRef(false);
  const [systemRouteStatus, setSystemRouteStatus] = useState<SystemRouteStatus>({ running: false, route_count: 0 });

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  const canUseSystemAudioBridge = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const runtime = window as unknown as Record<string, unknown>;
    return typeof runtime.__TAURI_INTERNALS__ !== 'undefined';
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (audioContextRef.current) {
      return audioContextRef.current;
    }

    const context = new AudioContext();
    const masterGain = context.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(context.destination);

    audioContextRef.current = context;
    masterGainRef.current = masterGain;

    return context;
  }, []);

  const ensureDeviceNodes = useCallback((deviceId: string) => {
    const context = ensureAudioContext();

    let gainNode = deviceGainNodesRef.current.get(deviceId);
    let analyserNode = deviceAnalyserNodesRef.current.get(deviceId);

    if (!gainNode || !analyserNode) {
      gainNode = context.createGain();
      gainNode.gain.value = 1;

      analyserNode = context.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.85;

      gainNode.connect(analyserNode);

      deviceGainNodesRef.current.set(deviceId, gainNode);
      deviceAnalyserNodesRef.current.set(deviceId, analyserNode);
    }

    return { gainNode, analyserNode };
  }, [ensureAudioContext]);

  const readRms = useCallback((analyser: AnalyserNode | undefined) => {
    if (!analyser) {
      return 0;
    }

    const buffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buffer);

    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const normalized = (buffer[i] - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / buffer.length);
    return Math.max(0, Math.min(1, rms * 2.4));
  }, []);

  const getOrCreateInputStream = useCallback(async (deviceId: string, boundDeviceId?: string) => {
    const useDefaultBrowserInput = !boundDeviceId || boundDeviceId === 'default-input' || isBackendInputId(boundDeviceId);
    const cacheKey = useDefaultBrowserInput ? 'default-input' : boundDeviceId;

    // 记录当前设备使用这个缓存键
    const usageSet = inputStreamUsageRef.current.get(cacheKey) || new Set();
    usageSet.add(deviceId);
    inputStreamUsageRef.current.set(cacheKey, usageSet);

    const cached = inputStreamCacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: !useDefaultBrowserInput
          ? { deviceId: { exact: boundDeviceId } }
          : true,
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    inputStreamCacheRef.current.set(cacheKey, stream);
    return stream;
  }, []);

  const releaseInputStream = useCallback((deviceId: string, boundDeviceId?: string) => {
    const useDefaultBrowserInput = !boundDeviceId || boundDeviceId === 'default-input' || isBackendInputId(boundDeviceId);
    const cacheKey = useDefaultBrowserInput ? 'default-input' : boundDeviceId;

    const usageSet = inputStreamUsageRef.current.get(cacheKey);
    if (usageSet) {
      usageSet.delete(deviceId);
      // 如果没有设备再使用这个流，停止并删除它
      if (usageSet.size === 0) {
        const stream = inputStreamCacheRef.current.get(cacheKey);
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          inputStreamCacheRef.current.delete(cacheKey);
        }
        inputStreamUsageRef.current.delete(cacheKey);
      }
    }
  }, []);

  const ensureOutputMonitorElement = useCallback((
    deviceId: string,
    destination: MediaStreamAudioDestinationNode,
  ) => {
    let audioElement = outputMonitorElementsRef.current.get(deviceId);
    if (!audioElement) {
      audioElement = new Audio();
      audioElement.autoplay = true;
      outputMonitorElementsRef.current.set(deviceId, audioElement);
    }

    if (audioElement.srcObject !== destination.stream) {
      audioElement.srcObject = destination.stream;
    }

    return audioElement;
  }, []);

  const syncRealtimeGraph = useCallback(async (currentDevices: AudioDevice[], currentConnections: AudioConnection[]) => {
    const context = ensureAudioContext();
    const masterGain = masterGainRef.current;
    if (!masterGain) {
      return;
    }

    if (context.state === 'suspended') {
      void context.resume();
    }

    const activeIds = new Set(currentDevices.map(device => device.id));

    Array.from(deviceGainNodesRef.current.keys()).forEach(id => {
      if (!activeIds.has(id)) {
        deviceGainNodesRef.current.get(id)?.disconnect();
        deviceAnalyserNodesRef.current.get(id)?.disconnect();
        inputSourceNodesRef.current.get(id)?.disconnect();

        const monitorElement = outputMonitorElementsRef.current.get(id);
        if (monitorElement) {
          monitorElement.pause();
          monitorElement.srcObject = null;
        }

        // 释放输入流（如果没有其他设备在使用）
        const prevBindingKey = inputSourceBindingRef.current.get(id);
        if (prevBindingKey) {
          releaseInputStream(id, prevBindingKey === 'default-input' ? undefined : prevBindingKey);
        }

        deviceGainNodesRef.current.delete(id);
        deviceAnalyserNodesRef.current.delete(id);
        inputSourceNodesRef.current.delete(id);
        inputSourceBindingRef.current.delete(id);
        outputDestinationNodesRef.current.delete(id);
        outputMonitorElementsRef.current.delete(id);
        outputSinkBindingRef.current.delete(id);
      }
    });

    currentDevices.forEach(device => {
      const { gainNode } = ensureDeviceNodes(device.id);
      gainNode.gain.value = device.enabled && !device.muted ? dbToLinear(device.gain) : 0;
    });

    routeGainNodesRef.current.forEach(node => node.disconnect());
    routeGainNodesRef.current = [];

    currentDevices.forEach(device => {
      const analyser = deviceAnalyserNodesRef.current.get(device.id);
      if (analyser) {
        analyser.disconnect();
      }
    });

    for (const device of currentDevices) {
      if (device.type !== 'input' || device.isVirtual) {
        continue;
      }

      const bindingKey = device.boundDeviceId || 'default-input';
      const prevBindingKey = inputSourceBindingRef.current.get(device.id);
      if (prevBindingKey !== bindingKey) {
        // 断开旧节点的连接
        inputSourceNodesRef.current.get(device.id)?.disconnect();
        inputSourceNodesRef.current.delete(device.id);
        // 释放旧的输入流（如果没有其他设备在使用）
        releaseInputStream(device.id, prevBindingKey === 'default-input' ? undefined : prevBindingKey);
      }

      let sourceNode = inputSourceNodesRef.current.get(device.id);
      if (!sourceNode) {
        const stream = await getOrCreateInputStream(device.id, device.boundDeviceId);
        sourceNode = context.createMediaStreamSource(stream);
        inputSourceNodesRef.current.set(device.id, sourceNode);
      }

      const gainNode = deviceGainNodesRef.current.get(device.id);
      if (gainNode) {
        sourceNode.disconnect();
        sourceNode.connect(gainNode);
      }

      inputSourceBindingRef.current.set(device.id, bindingKey);
    }

    currentConnections.forEach(connection => {
      if (!connection.enabled) {
        return;
      }

      const fromAnalyser = deviceAnalyserNodesRef.current.get(connection.fromDeviceId);
      const toGain = deviceGainNodesRef.current.get(connection.toDeviceId);
      if (!fromAnalyser || !toGain) {
        return;
      }

      const routeGain = context.createGain();
      routeGain.gain.value = 1;
      fromAnalyser.connect(routeGain);
      routeGain.connect(toGain);
      routeGainNodesRef.current.push(routeGain);
    });

    for (const device of currentDevices) {
      if (device.type !== 'output') {
        continue;
      }

      const analyser = deviceAnalyserNodesRef.current.get(device.id);
      if (!analyser) {
        continue;
      }

      if (!device.enabled || device.muted || device.isVirtual) {
        continue;
      }

      const hasSetSinkId = typeof Audio !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
      if (!hasSetSinkId) {
        analyser.connect(masterGain);
        continue;
      }

      let destination = outputDestinationNodesRef.current.get(device.id);
      if (!destination) {
        destination = context.createMediaStreamDestination();
        outputDestinationNodesRef.current.set(device.id, destination);
      }

      analyser.connect(destination);

      const monitorElement = ensureOutputMonitorElement(device.id, destination);
      const sinkBinding = device.boundDeviceId || 'default-output';
      const previousSinkBinding = outputSinkBindingRef.current.get(device.id);

      if (sinkBinding !== previousSinkBinding) {
        const sinkElement = monitorElement as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
        if (sinkElement.setSinkId && !isBackendOutputId(sinkBinding)) {
          try {
            await sinkElement.setSinkId(sinkBinding === 'default-output' ? '' : sinkBinding);
          } catch (error) {
            console.warn('Failed to bind output sink, fallback to default:', error);
          }
        }

        outputSinkBindingRef.current.set(device.id, sinkBinding);
      }

      try {
        await monitorElement.play();
      } catch {
        analyser.connect(masterGain);
      }
    }
  }, [ensureAudioContext, ensureDeviceNodes, ensureOutputMonitorElement, getOrCreateInputStream, releaseInputStream]);

  const deviceGraphSignature = useMemo(() => JSON.stringify(
    devices.map(device => ({
      id: device.id,
      type: device.type,
      channels: device.channels,
      enabled: device.enabled,
      muted: device.muted,
      gain: device.gain,
      boundDeviceId: device.boundDeviceId,
      isVirtual: device.isVirtual,
    })),
  ), [devices]);

  const connectionGraphSignature = useMemo(() => JSON.stringify(
    connections.map(connection => ({
      id: connection.id,
      fromDeviceId: connection.fromDeviceId,
      fromChannel: connection.fromChannel,
      toDeviceId: connection.toDeviceId,
      toChannel: connection.toChannel,
      enabled: connection.enabled,
    })),
  ), [connections]);

  const systemRouteSignature = useMemo(() => JSON.stringify({
    devices: devices.map(device => ({
      id: device.id,
      type: device.type,
      enabled: device.enabled,
      muted: device.muted,
      isVirtual: device.isVirtual,
      boundDeviceId: device.boundDeviceId,
    })),
    connections: connections.map(connection => ({
      id: connection.id,
      fromDeviceId: connection.fromDeviceId,
      toDeviceId: connection.toDeviceId,
      enabled: connection.enabled,
    })),
  }), [connections, devices]);

  useEffect(() => {
    let disposed = false;

    const run = async () => {
      try {
        await syncRealtimeGraph(devices, connections);
      } catch (error) {
        if (!disposed) {
          console.error('Failed to sync realtime audio graph:', error);
        }
      }
    };

    void run();

    return () => {
      disposed = true;
    };
  }, [connectionGraphSignature, deviceGraphSignature, syncRealtimeGraph]);

  // 单独的 effect 处理增益、静音和启用状态的变化，避免重新连接所有音频节点
  useEffect(() => {
    const context = audioContextRef.current;
    if (!context) {
      return;
    }
    
    devices.forEach(device => {
      const gainNode = deviceGainNodesRef.current.get(device.id);
      if (gainNode) {
        const targetGain = device.enabled && !device.muted ? dbToLinear(device.gain) : 0;
        // 直接设置值，不使用平滑过渡，避免与 syncRealtimeGraph 冲突
        gainNode.gain.value = targetGain;
      }
    });
  }, [deviceGraphSignature]);

  useEffect(() => {
    if (!canUseSystemAudioBridge) {
      return;
    }

    const syncSystemRoute = async () => {
      const candidates: SystemRoutePair[] = [];
      const dedup = new Set<string>();

      const incomingByDeviceId = new Map<string, AudioConnection[]>();
      connections.forEach(connection => {
        if (!connection.enabled) {
          return;
        }
        const list = incomingByDeviceId.get(connection.toDeviceId) || [];
        list.push(connection);
        incomingByDeviceId.set(connection.toDeviceId, list);
      });

      const deviceById = new Map(devices.map(device => [device.id, device]));

      const collectInputSources = (targetDeviceId: string): string[] => {
        const stack = [targetDeviceId];
        const visited = new Set<string>();
        const inputs = new Set<string>();

        while (stack.length > 0) {
          const currentId = stack.pop() as string;
          if (visited.has(currentId)) {
            continue;
          }
          visited.add(currentId);

          const incoming = incomingByDeviceId.get(currentId) || [];
          incoming.forEach(connection => {
            const source = deviceById.get(connection.fromDeviceId);
            if (!source || source.isVirtual || !source.enabled || source.muted) {
              return;
            }

            if (source.type === 'input' && source.boundDeviceId) {
              inputs.add(source.boundDeviceId);
              return;
            }

            stack.push(source.id);
          });
        }

        return Array.from(inputs);
      };

      devices.forEach(device => {
        if (device.type !== 'output' || device.isVirtual || !device.enabled || device.muted || !device.boundDeviceId) {
          return;
        }

        const sourceInputs = collectInputSources(device.id);
        sourceInputs.forEach(inputDeviceId => {
          const route = {
            inputDeviceId,
            outputDeviceId: device.boundDeviceId as string,
          };

          const key = `${route.inputDeviceId}=>${route.outputDeviceId}`;
          if (!dedup.has(key)) {
            dedup.add(key);
            candidates.push(route);
          }
        });
      });

      const signature = JSON.stringify(candidates);

      if (candidates.length === 0) {
        if (activeSystemRouteSignatureRef.current) {
          try {
            await invoke('stop_audio_routes');
          } catch (error) {
            console.warn('Failed to stop system routes:', error);
          }
          activeSystemRouteSignatureRef.current = '';
          setSystemRouteStatus({ running: false, route_count: 0 });
        }
        return;
      }

      if (activeSystemRouteSignatureRef.current === signature) {
        return;
      }

      try {
        await invoke('start_audio_routes', {
          routes: candidates.map(route => ({
            input_device_id: route.inputDeviceId,
            output_device_id: route.outputDeviceId,
          })),
        });

        const latest = await invoke<SystemRouteStatus>('get_audio_route_status');
        setSystemRouteStatus(latest);
        activeSystemRouteSignatureRef.current = signature;
      } catch (error) {
        console.error('Failed to start system routes:', error);
      }
    };

    void syncSystemRoute();
  }, [canUseSystemAudioBridge, systemRouteSignature]);

  useEffect(() => {
    if (!canUseSystemAudioBridge) {
      return;
    }

    const timer = window.setInterval(async () => {
      if (backendPollingBusyRef.current) {
        return;
      }

      backendPollingBusyRef.current = true;
      try {
        const snapshot = await invoke<BackendLevelSnapshot>('get_audio_levels');
        backendLevelsRef.current = snapshot;
      } catch {
      } finally {
        backendPollingBusyRef.current = false;
      }
    }, 80);

    return () => {
      window.clearInterval(timer);
    };
  }, [canUseSystemAudioBridge]);

  // 缓存计算结果以提升性能
  const getDeviceLevel = useCallback((device: AudioDevice, analyserMap: Map<string, AnalyserNode>, backendLevels: BackendLevelSnapshot): number => {
    if (!device.enabled || device.muted) return 0;
    
    if (canUseSystemAudioBridge && !device.isVirtual && device.boundDeviceId) {
      const backendLevel = device.type === 'input' 
        ? backendLevels.input_levels[device.boundDeviceId]
        : backendLevels.output_levels[device.boundDeviceId];
      if (typeof backendLevel === 'number') {
        return toDisplayLevel(backendLevel);
      }
    }
    
    const analyser = analyserMap.get(device.id);
    return toDisplayLevel(readRms(analyser));
  }, [canUseSystemAudioBridge, readRms]);

  useEffect(() => {
    meterTimerRef.current = window.setInterval(() => {
      const analyserMap = deviceAnalyserNodesRef.current;
      const backendLevels = backendLevelsRef.current;

      setDevices(prevDevices => prevDevices.map(device => {
        const rms = getDeviceLevel(device, analyserMap, backendLevels);
        return {
          ...device,
          levels: Array(device.channels).fill(rms),
        };
      }));

      setConnections(prevConnections => prevConnections.map(connection => {
        const sourceDevice = devicesRef.current.find(device => device.id === connection.fromDeviceId);
        const level = sourceDevice && connection.enabled 
          ? getDeviceLevel(sourceDevice, analyserMap, backendLevels)
          : 0;

        return {
          ...connection,
          signalStrength: connection.signalStrength * 0.35 + level * 0.65,
        };
      }));
    }, 80);

    return () => {
      if (meterTimerRef.current !== null) {
        window.clearInterval(meterTimerRef.current);
      }

      routeGainNodesRef.current.forEach(node => node.disconnect());
      inputSourceNodesRef.current.forEach(node => node.disconnect());
      deviceAnalyserNodesRef.current.forEach(node => node.disconnect());
      deviceGainNodesRef.current.forEach(node => node.disconnect());
      outputDestinationNodesRef.current.forEach(node => node.disconnect());
      outputMonitorElementsRef.current.forEach(element => {
        element.pause();
        element.srcObject = null;
      });

      inputStreamCacheRef.current.forEach(stream => {
        stream.getTracks().forEach(track => track.stop());
      });

      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }

      if (canUseSystemAudioBridge) {
        void invoke('stop_audio_routes').catch(() => {});
      }
    };
  }, [canUseSystemAudioBridge, readRms]);

  const createDevice = useCallback((
    type: DeviceType,
    name: string,
    channels: number,
    position: { x: number; y: number },
    options?: { isVirtual?: boolean; boundDeviceId?: string; boundDeviceLabel?: string; nameCustomized?: boolean; virtualSuffixCustomized?: boolean },
  ) => {
    const newId = generateId();
    const isVirtual = options?.isVirtual ?? true;

    const newDevice: AudioDevice = {
      id: newId,
      name,
      nameCustomized: options?.nameCustomized ?? false,
      virtualSuffixCustomized: options?.virtualSuffixCustomized ?? false,
      type,
      channels,
      enabled: true,
      position,
      groupId: undefined,
      isVirtual,
      boundDeviceId: options?.boundDeviceId ?? (isVirtual ? `virtual-bus-${newId}` : undefined),
      boundDeviceLabel: options?.boundDeviceLabel ?? (isVirtual ? `虚拟总线 ${newId.slice(0, 4)}` : undefined),
      levels: Array(channels).fill(0),
      muted: false,
      gain: 0,
    };

    setDevices(prev => [...prev, newDevice]);
    return newDevice.id;
  }, []);

  const deleteDevice = useCallback((deviceId: string) => {
    setDevices(prev => prev.filter(device => device.id !== deviceId));
    setConnections(prev => prev.filter(connection => connection.fromDeviceId !== deviceId && connection.toDeviceId !== deviceId));
  }, []);

  const updateDevicePosition = useCallback((deviceId: string, position: { x: number; y: number }) => {
    // 使用 ref 获取最新的 dragOffset，避免闭包问题
    const currentOffset = dragOffsetRef.current;
    setDevices(prev => prev.map(device =>
      device.id === deviceId
        ? {
            ...device,
            position: {
              x: position.x - currentOffset.x,
              y: position.y - currentOffset.y,
            },
          }
        : device,
    ));
  }, []);

  const toggleMute = useCallback((deviceId: string) => {
    setDevices(prev => prev.map(device => device.id === deviceId ? { ...device, muted: !device.muted } : device));
  }, []);

  const updateDeviceConfig = useCallback((
    deviceId: string,
    patch: Partial<Pick<AudioDevice, 'name' | 'nameCustomized' | 'virtualSuffixCustomized' | 'gain' | 'enabled' | 'muted' | 'channels' | 'isVirtual' | 'boundDeviceId' | 'boundDeviceLabel'>>,
  ) => {
    setDevices(prev => prev.map(device => {
      if (device.id !== deviceId) {
        return device;
      }

      const nextChannels = typeof patch.channels === 'number' ? Math.max(1, Math.min(16, patch.channels)) : device.channels;
      const currentLevels = device.levels.slice(0, nextChannels);
      const paddedLevels = currentLevels.length < nextChannels
        ? [...currentLevels, ...Array(nextChannels - currentLevels.length).fill(0)]
        : currentLevels;

      return {
        ...device,
        ...patch,
        channels: nextChannels,
        levels: paddedLevels,
      };
    }));

    if (typeof patch.channels === 'number') {
      const nextChannels = Math.max(1, Math.min(16, patch.channels));
      setConnections(prev => prev.filter(connection => {
        if (connection.fromDeviceId === deviceId && connection.fromChannel >= nextChannels) {
          return false;
        }

        if (connection.toDeviceId === deviceId && connection.toChannel >= nextChannels) {
          return false;
        }

        return true;
      }));
    }
  }, []);

  const canConnectDevices = useCallback((fromDeviceId: string, toDeviceId: string) => {
    const fromDevice = devices.find(device => device.id === fromDeviceId);
    const toDevice = devices.find(device => device.id === toDeviceId);

    if (!fromDevice || !toDevice || fromDeviceId === toDeviceId) {
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

    const stack = [toDeviceId];
    const visited = new Set<string>();

    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (current === fromDeviceId) {
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

    return true;
  }, [connections, devices]);

  const createConnection = useCallback((fromDeviceId: string, fromChannel: number, toDeviceId: string, toChannel: number) => {
    if (!canConnectDevices(fromDeviceId, toDeviceId)) {
      return;
    }

    setConnections(prevConnections => {
      const exists = prevConnections.some(connection =>
        connection.fromDeviceId === fromDeviceId &&
        connection.fromChannel === fromChannel &&
        connection.toDeviceId === toDeviceId &&
        connection.toChannel === toChannel,
      );
      if (exists) {
        return prevConnections;
      }

      return [...prevConnections, {
        id: generateId(),
        fromDeviceId,
        fromChannel,
        toDeviceId,
        toChannel,
        enabled: true,
        signalStrength: 0,
      }];
    });
  }, [canConnectDevices]);

  const deleteConnection = useCallback((connectionId: string) => {
    setConnections(prev => prev.filter(connection => connection.id !== connectionId));
  }, []);

  const startDragDevice = useCallback((deviceId: string, event: React.MouseEvent, pointer: { x: number; y: number }) => {
    event.stopPropagation();
    const currentDevice = devices.find(device => device.id === deviceId);
    if (!currentDevice) {
      return;
    }

    setDragOffset({
      x: pointer.x - currentDevice.position.x,
      y: pointer.y - currentDevice.position.y,
    });
    setDraggingDevice(deviceId);
    setSelectedDevice(deviceId);
  }, [devices]);

  const startConnection = useCallback((deviceId: string, channel: number, portType: 'input' | 'output', event: React.MouseEvent) => {
    event.stopPropagation();
    if (portType !== 'output') {
      return;
    }

    setConnectingFrom({ deviceId, channel, portType: 'output' });
  }, []);

  const completeConnection = useCallback((toDeviceId: string, toChannel: number, targetPortType: 'input' | 'output') => {
    if (targetPortType !== 'input') {
      setConnectingFrom(null);
      return;
    }

    // 使用函数式更新确保即使多次调用也不会重复创建连接
    setConnectingFrom(prev => {
      if (prev && prev.deviceId !== toDeviceId) {
        createConnection(prev.deviceId, prev.channel, toDeviceId, toChannel);
      }
      return null;
    });
  }, [createConnection]);

  const cancelConnection = useCallback(() => {
    setConnectingFrom(null);
  }, []);

  return {
    devices,
    connections,
    selectedDevice,
    draggingDevice,
    connectingFrom,
    systemRouteStatus,
    mousePos,
    dragOffset,
    setMousePos,
    setDraggingDevice,
    setSelectedDevice,
    setDevices,
    setConnections,
    createDevice,
    deleteDevice,
    updateDevicePosition,
    updateDeviceConfig,
    toggleMute,
    createConnection,
    deleteConnection,
    startDragDevice,
    startConnection,
    completeConnection,
    cancelConnection,
  };
}
