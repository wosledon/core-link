import { useRef } from 'react';
import { isCoreLinkVirtualId } from '../types/audio';
import type { AudioDevice, DeviceType } from '../types/audio';
import { CustomSelect } from './CustomSelect';
import './DeviceCard.css';

const isLikelyVirtualHardware = (value: string) => /vb-?audio|voice ?meeter|virtual|cable|blackhole|loopback/i.test(value);

interface DeviceCardProps {
  device: AudioDevice;
  isSelected: boolean;
  isDragging: boolean;
  bindingOptions: Array<{ id: string; label: string }>;
  onChangeBinding: (boundDeviceId: string) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onPortMouseDown: (channel: number, portType: 'input' | 'output', e: React.MouseEvent) => void;
  onPortMouseUp: (channel: number, portType: 'input' | 'output', e: React.MouseEvent) => void;
  onPortMouseEnter: (channel: number, portType: 'input' | 'output') => void;
  onPortMouseLeave: () => void;
  getPortStatus: (channel: number, portType: 'input' | 'output') => 'idle' | 'valid' | 'invalid';
  onToggleMute: () => void;
}

// 设备图标
const DeviceIcon = ({ type, className }: { type: DeviceType; className?: string }) => {
  const icons = {
    input: (
      <svg viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
      </svg>
    ),
    output: (
      <svg viewBox="0 0 24 24">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
      </svg>
    ),
    processor: (
      <svg viewBox="0 0 24 24">
        <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
      </svg>
    ),
  };
  return <div className={`device-icon ${type} ${className || ''}`}>{icons[type]}</div>;
};

// 静音图标
const MuteIcon = ({ muted }: { muted: boolean }) => (
  <svg viewBox="0 0 24 24">
    {muted ? (
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
    ) : (
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    )}
  </svg>
);

export function DeviceCard({
  device,
  isSelected,
  isDragging,
  bindingOptions,
  onChangeBinding,
  onMouseDown,
  onPortMouseDown,
  onPortMouseUp,
  onPortMouseEnter,
  onPortMouseLeave,
  getPortStatus,
  onToggleMute,
}: DeviceCardProps) {
  const peakLevelsRef = useRef<number[]>([]);
  const peakHoldUntilRef = useRef<number[]>([]);
  const peakLastUpdateRef = useRef<number[]>([]);

  if (peakLevelsRef.current.length !== device.channels) {
    peakLevelsRef.current = Array.from({ length: device.channels }, (_, index) => Math.max(0, Math.min(1, device.levels[index] || 0)));
    peakHoldUntilRef.current = Array(device.channels).fill(0);
    peakLastUpdateRef.current = Array(device.channels).fill(performance.now());
  }

  const now = performance.now();
  const displayLevels = Array.from({ length: device.channels }, (_, index) => Math.max(0, Math.min(1, device.levels[index] || 0)));
  const peakLevels = displayLevels.map((level, index) => {
    const currentPeak = peakLevelsRef.current[index] ?? 0;
    const holdUntil = peakHoldUntilRef.current[index] ?? 0;
    const lastUpdate = peakLastUpdateRef.current[index] ?? now;
    const deltaMs = Math.max(0, now - lastUpdate);

    let nextPeak = currentPeak;
    let nextHoldUntil = holdUntil;

    if (level >= currentPeak) {
      nextPeak = level;
      nextHoldUntil = now + 260;
    } else if (now > holdUntil) {
      nextPeak = Math.max(level, currentPeak - deltaMs * 0.0017);
    }

    peakLevelsRef.current[index] = nextPeak;
    peakHoldUntilRef.current[index] = nextHoldUntil;
    peakLastUpdateRef.current[index] = now;

    return Math.max(0, Math.min(1, nextPeak));
  });

  const levelToDb = (level: number) => {
    if (level <= 0.0001) {
      return -60;
    }

    return Math.max(-60, Math.min(6, Math.round(20 * Math.log10(level))));
  };

  // 将线性电平转换为对数刻度的显示宽度，让低电平也能清晰可见
  const levelToDisplayWidth = (level: number) => {
    if (level <= 0.0001) {
      return 0;
    }
    // 使用对数刻度：-60dB 对应 0%，0dB 对应 100%
    // 公式：width = (20 * log10(level) + 60) / 60 * 100
    const db = 20 * Math.log10(level);
    const width = ((db + 60) / 60) * 100;
    return Math.max(0, Math.min(100, width));
  };

  const isLoopbackInput = device.type === 'input' && (device.boundDeviceId?.startsWith('loop-out-') ?? false);
  const displayType = isLoopbackInput ? 'loopback' : device.type;
  const isCoreLinkVirtual = isCoreLinkVirtualId(device.boundDeviceId);
  const isVirtualHardware = !device.isVirtual && isLikelyVirtualHardware(`${device.boundDeviceLabel || ''} ${device.boundDeviceId || ''}`);

  return (
    <div
      className={`device-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${device.type}`}
      style={{
        left: device.position.x,
        top: device.position.y,
      }}
    >
      <div className={`device-type-bar ${displayType}`} />
      
      <div className="device-header" onMouseDown={onMouseDown}>
        <div className="device-header-main">
          <DeviceIcon type={device.type} className={isLoopbackInput ? 'loopback' : ''} />
          <div className="device-info">
            <div className="device-name-row">
              <div className="device-name">{device.name}</div>
              <span className={`device-name-mode ${device.nameCustomized ? 'custom' : 'auto'}`}>
                {device.nameCustomized ? '自定义' : '自动'}
              </span>
            </div>
            <div className="device-type">{isLoopbackInput ? 'loopback' : device.type}</div>
          </div>
          <button 
            className={`device-mute-btn ${device.muted ? 'muted' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
          >
            <MuteIcon muted={device.muted} />
          </button>
        </div>
        <div className="device-header-meta">
          <div className={`device-source-tag ${isCoreLinkVirtual || device.isVirtual ? 'virtual' : isVirtualHardware ? 'virtual-hw' : 'local'}`}>
            {isCoreLinkVirtual || device.isVirtual ? 'Core Link 虚拟设备' : isVirtualHardware ? '虚拟声卡' : '本机设备'}
          </div>
          <div className="device-channel-count">{device.channels} 通道</div>
        </div>
      </div>

      <div className="device-channels">
        {device.type === 'processor' || isCoreLinkVirtual || device.isVirtual ? (
          <div className="device-binding">{device.boundDeviceLabel || '未绑定设备'}</div>
        ) : (
          <CustomSelect
            value={device.boundDeviceId || ''}
            options={bindingOptions.length === 0 
              ? [{ value: '', label: '未检测到设备' }]
              : bindingOptions.map(option => ({ value: option.id, label: option.label }))
            }
            onChange={(value) => onChangeBinding(value)}
            disabled={bindingOptions.length === 0}
            className="device-binding-select"
            onMouseDown={(e) => e.stopPropagation()}
            searchable
            minDropdownWidth={200}
          />
        )}
        {Array.from({ length: device.channels }).map((_, i) => (
          <div key={i} className="channel-row">
            {/* Input Port (for output and processor devices) */}
            {(device.type === 'output' || device.type === 'processor') && (
              <div
                className={`channel-port input ${getPortStatus(i, 'input')}`}
                onMouseDown={(e) => onPortMouseDown(i, 'input', e)}
                onMouseUp={(e) => onPortMouseUp(i, 'input', e)}
                onMouseEnter={() => onPortMouseEnter(i, 'input')}
                onMouseLeave={onPortMouseLeave}
              />
            )}
            
            {/* Channel Label */}
            <span className="channel-label">{i + 1}</span>
            
            {/* Level Meter */}
            <div className="channel-meter">
              <div className="channel-meter-scale" />
              <div 
                className="channel-meter-fill"
                style={{ 
                  width: `${levelToDisplayWidth(displayLevels[i])}%`,
                  opacity: device.muted ? 0.3 : 1,
                }}
              />
              <div
                className="channel-meter-peak"
                style={{
                  left: `calc(${levelToDisplayWidth(peakLevels[i])}% - 1px)`,
                  opacity: device.muted ? 0.25 : 0.95,
                }}
              />
            </div>

            <span className="channel-db">{levelToDb(displayLevels[i])} dB</span>
            
            {/* Output Port (for input, output and processor devices) */}
            {(device.type === 'input' || device.type === 'output' || device.type === 'processor') && (
              <div
                className={`channel-port output ${getPortStatus(i, 'output')}`}
                onMouseDown={(e) => onPortMouseDown(i, 'output', e)}
                onMouseUp={(e) => onPortMouseUp(i, 'output', e)}
                onMouseEnter={() => onPortMouseEnter(i, 'output')}
                onMouseLeave={onPortMouseLeave}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// 设备模板卡片（用于侧边栏）
interface DeviceTemplateCardProps {
  name: string;
  type: DeviceType;
  channels: number;
  onDragStart: (e: React.DragEvent) => void;
  disabled?: boolean;
}

export function DeviceTemplateCard({ name, type, channels, onDragStart, disabled }: DeviceTemplateCardProps) {
  return (
    <div 
      className={`template-card ${type} ${disabled ? 'disabled' : ''}`} 
      draggable={!disabled} 
      onDragStart={onDragStart}
    >
      <div className={`template-border ${type}`} />
      <div className="template-content">
        <div className={`template-icon ${type}`}>
          <DeviceIcon type={type} />
        </div>
        <div className="template-info">
          <div className="template-name">{name}</div>
          <div className="template-channels">{channels} 通道</div>
        </div>
      </div>
    </div>
  );
}
