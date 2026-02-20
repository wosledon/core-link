# Core Link

<p align="center">
  <strong>Modern UI Professional Audio Routing Software</strong>
</p>

<p align="center">
  English | <a href="README.md">中文</a>
</p>

---

## Introduction

Core Link is a modern UI professional audio routing software inspired by ASIO Link Pro. It provides an intuitive visual interface for easily creating and managing connections between audio devices.

## Key Features

- **Visual Routing Canvas**: Drag-and-drop operation with intuitive display of audio signal flow
- **Dynamic Device Management**: Support for input, output, and processor (effects) devices
- **Smart Auto-Routing**: One-click automatic device connection with many-to-many routing support
- **Auto Layout**: Intelligent layout algorithm for automatic device arrangement
- **Channel Mapping**: Flexible channel-level connection control
- **Real-time Level Meters**: Real-time audio signal strength monitoring
- **Project Management**: Support for saving, loading, and auto-restoring projects
- **Virtual Audio Driver**: Built-in virtual audio device support

![image](./images/image.png)

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Desktop Shell**: Tauri (Rust)
- **State Management**: React Hooks
- **Styling**: CSS Variables + Material Design

## System Requirements

- Windows 10/11
- Audio devices supporting ASIO or WASAPI

## Installation

```bash
# Clone repository
git clone https://github.com/yourusername/core-link.git
cd core-link

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build production version
npm run build
```

## Usage Guide

1. **Create Devices**: Drag input/output devices from the left panel to the canvas
2. **Establish Connections**: Click a device's output port and drag to the target device's input port
3. **Auto Route**: Click the "Auto Route" button in the toolbar for intelligent device connection
4. **Auto Layout**: Click the "Auto Layout" button to optimize device arrangement
5. **Save Project**: Press Ctrl+S to save current configuration

## Keyboard Shortcuts

| Shortcut               | Function                             |
| ---------------------- | ------------------------------------ |
| `Delete` / `Backspace` | Delete selected device or connection |
| `Ctrl + S`             | Save project                         |
| `Ctrl + Z`             | Undo                                 |
| `Ctrl + Y`             | Redo                                 |
| `Esc`                  | Deselect                             |
| `Scroll`               | Zoom canvas                          |
| `Space + Drag`         | Pan canvas                           |

## License

MIT License - see [LICENSE](LICENSE) file for details

---

<p align="center">
  Made with ❤️ by Core Link Team
</p>
