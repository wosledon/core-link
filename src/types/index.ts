export type Theme = 'light' | 'dark' | 'system';
export type Language = 'zh-CN' | 'en';

export interface AppSettings {
  language: Language;
  theme: Theme;
  autoStart: boolean;
  minimizeToTray: boolean;
  autoLoadLastProject: boolean;
}

export type NodeType = 'input' | 'output' | 'processor';

export interface DeviceNode {
  id: string;
  name: string;
  type: NodeType;
  channels: number;
  enabled: boolean;
  position: { x: number; y: number };
}

export interface RouteEdge {
  id: string;
  fromNodeId: string;
  fromChannel: number;
  toNodeId: string;
  toChannel: number;
  enabled: boolean;
}

export interface ProjectSnapshot {
  version: string;
  nodes: DeviceNode[];
  edges: RouteEdge[];
  updatedAt: string;
}
