export type DeviceType = 'input' | 'output' | 'processor';

export const CORE_LINK_VIRTUAL_PREFIX = 'core-link-vdev-';
export const isCoreLinkVirtualId = (value?: string) => typeof value === 'string' && value.startsWith(CORE_LINK_VIRTUAL_PREFIX);

export interface AudioDevice {
  id: string;
  name: string;
  nameCustomized?: boolean;
  virtualSuffixCustomized?: boolean;
  type: DeviceType;
  channels: number;
  enabled: boolean;
  position: { x: number; y: number };
  groupId?: string;
  isVirtual: boolean;
  boundDeviceId?: string;
  boundDeviceLabel?: string;
  // 音频电平 (0-1)
  levels: number[];
  // 是否静音
  muted: boolean;
  // 增益 (dB)
  gain: number;
}

export interface AudioConnection {
  id: string;
  fromDeviceId: string;
  fromChannel: number;
  toDeviceId: string;
  toChannel: number;
  enabled: boolean;
  // 信号强度
  signalStrength: number;
}

export interface AudioProject {
  version: string;
  devices: AudioDevice[];
  connections: AudioConnection[];
  updatedAt: string;
}

export const AUDIO_DEVICE_CARD_LAYOUT = {
  width: 296,
  topBarHeight: 5,
  headerHeight: 90,
  channelsPaddingTop: 8,
  bindingHeight: 24,
  channelHeight: 26,
  channelTopOffset: 0,
} as const;

// 设备模板
export interface DeviceTemplate {
  name: string;
  type: DeviceType;
  channels: number;
  icon: string;
}

export const DEVICE_TEMPLATES: DeviceTemplate[] = [
  { name: '麦克风', type: 'input', channels: 2, icon: 'mic' },
  { name: '线路输入', type: 'input', channels: 2, icon: 'line_in' },
  { name: '扬声器', type: 'output', channels: 2, icon: 'speaker' },
  { name: '耳机', type: 'output', channels: 2, icon: 'headphone' },
  { name: '混音器', type: 'processor', channels: 8, icon: 'mixer' },
  { name: '均衡器', type: 'processor', channels: 2, icon: 'eq' },
];
