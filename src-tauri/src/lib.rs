// Core Link - Tauri Backend
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, State, WebviewWindow, WindowEvent,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub language: String,
    pub theme: String,
    pub auto_start: bool,
    pub minimize_to_tray: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: "zh-CN".to_string(),
            theme: "dark".to_string(),
            auto_start: false,
            minimize_to_tray: true,
        }
    }
}

pub struct AppState {
    pub settings: Mutex<AppSettings>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioHardwareDevice {
    pub id: String,
    pub name: String,
    pub channels: u16,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioHardwareSnapshot {
    pub inputs: Vec<AudioHardwareDevice>,
    pub outputs: Vec<AudioHardwareDevice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VirtualDriverStatus {
    pub installed: bool,
    pub installer_available: bool,
    pub detected_inputs: Vec<String>,
    pub detected_outputs: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioRouteStatus {
    pub running: bool,
    pub input_device_id: Option<String>,
    pub output_device_id: Option<String>,
    pub route_count: usize,
    pub routes: Vec<AudioRoutePair>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AudioLevelSnapshot {
    pub input_levels: HashMap<String, f32>,
    pub output_levels: HashMap<String, f32>,
}

impl Default for AudioRouteStatus {
    fn default() -> Self {
        Self {
            running: false,
            input_device_id: None,
            output_device_id: None,
            route_count: 0,
            routes: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct AudioRoutePair {
    pub input_device_id: String,
    pub output_device_id: String,
}

struct PassthroughSession {
    _input_stream: cpal::Stream,
    _output_stream: cpal::Stream,
    input_device_id: String,
    output_device_id: String,
    input_meter: Arc<AtomicU32>,
    output_meter: Arc<AtomicU32>,
}

struct StreamBridgeState {
    queue: VecDeque<f32>,
    read_phase: f64,
    input_sample_rate: f64,
    output_sample_rate: f64,
    target_latency_samples: f64,
    max_buffer_samples: usize,
    min_prefill_samples: usize,
}

enum AudioEngineCommand {
    StartMany {
        routes: Vec<AudioRoutePair>,
        responder: mpsc::Sender<Result<(), String>>,
    },
    Stop {
        responder: mpsc::Sender<Result<(), String>>,
    },
    GetLevels {
        responder: mpsc::Sender<AudioLevelSnapshot>,
    },
}

struct AudioEngineHandle {
    sender: mpsc::Sender<AudioEngineCommand>,
    status: Arc<Mutex<AudioRouteStatus>>,
}

static AUDIO_ENGINE: OnceLock<AudioEngineHandle> = OnceLock::new();
// Note: virtual endpoint registry and mapping removed. Keep driver detection/installer only.

// virtual endpoint management removed: we no longer create in-app virtual endpoints or mappings.

fn resolve_virtual_routes(routes: Vec<AudioRoutePair>) -> Result<Vec<AudioRoutePair>, String> {
    // Virtual endpoint mapping removed — passthrough routes unchanged.
    Ok(routes)
}

fn load_atomic_f32(value: &AtomicU32) -> f32 {
    f32::from_bits(value.load(Ordering::Relaxed))
}

fn store_atomic_f32(value: &AtomicU32, next: f32) {
    value.store(next.to_bits(), Ordering::Relaxed);
}

fn parse_device_index(device_id: &str, prefix: &str) -> Result<usize, String> {
    let Some(raw) = device_id.strip_prefix(prefix) else {
        return Err(format!("Invalid device id format: {}", device_id));
    };

    raw.parse::<usize>()
        .map_err(|_| format!("Invalid device id index: {}", device_id))
}

fn is_virtual_driver_device_name(name: &str) -> bool {
    let normalized = name.to_lowercase();
    let keywords = [
        "vb-audio",
        "vb audio",
        "cable input",
        "cable output",
        "voicemeeter",
        "virtual audio",
        "virtual cable",
        "asio link",
        "blackhole",
        "loopback",
        "jackrouter",
    ];

    keywords.iter().any(|keyword| normalized.contains(keyword))
}

fn locate_virtual_driver_installer_script() -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    let candidates = vec![
        cwd.join("drivers/windows/install-virtual-audio-driver.ps1"),
        cwd.join("../drivers/windows/install-virtual-audio-driver.ps1"),
        cwd.join("../../drivers/windows/install-virtual-audio-driver.ps1"),
    ];

    candidates
        .into_iter()
        .find(|path| path.exists() && path.is_file())
}

fn list_virtual_driver_inf_files_internal() -> Vec<String> {
    let Some(script) = locate_virtual_driver_installer_script() else {
        return vec![];
    };

    let Some(folder) = script.parent() else {
        return vec![];
    };

    let Ok(entries) = std::fs::read_dir(folder) else {
        return vec![];
    };

    let mut installer_targets = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let ext = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .map(|value| value.to_string())?;

            if ext.eq_ignore_ascii_case("inf") {
                return Some(name);
            }

            if ext.eq_ignore_ascii_case("exe") {
                let lower = name.to_lowercase();
                let is_setup = lower.contains("setup")
                    || lower.contains("install")
                    || lower.contains("voicemeeter")
                    || lower.contains("vbcable");

                if is_setup {
                    return Some(name);
                }
            }

            None
        })
        .collect::<Vec<_>>();

    installer_targets.sort();
    installer_targets
}

fn get_virtual_driver_status() -> VirtualDriverStatus {
    let detected_inputs = enumerate_audio_inputs()
        .map(|(devices, _)| {
            devices
                .iter()
                .enumerate()
                .filter_map(|(index, device)| {
                    let name = device
                        .name()
                        .unwrap_or_else(|_| format!("Input Device {}", index + 1));
                    if is_virtual_driver_device_name(&name) {
                        Some(name)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let detected_outputs = enumerate_audio_outputs()
        .map(|(devices, _)| {
            devices
                .iter()
                .enumerate()
                .filter_map(|(index, device)| {
                    let name = device
                        .name()
                        .unwrap_or_else(|_| format!("Output Device {}", index + 1));
                    if is_virtual_driver_device_name(&name) {
                        Some(name)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    VirtualDriverStatus {
        installed: !detected_inputs.is_empty() || !detected_outputs.is_empty(),
        installer_available: locate_virtual_driver_installer_script().is_some(),
        detected_inputs,
        detected_outputs,
    }
}

fn enumerate_audio_inputs() -> Result<(Vec<cpal::Device>, Option<String>), String> {
    let host = cpal::default_host();
    let default_input_name = host
        .default_input_device()
        .and_then(|device| device.name().ok());

    let inputs = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {}", e))?
        .collect::<Vec<_>>();

    Ok((inputs, default_input_name))
}

fn enumerate_audio_outputs() -> Result<(Vec<cpal::Device>, Option<String>), String> {
    let host = cpal::default_host();
    let default_output_name = host
        .default_output_device()
        .and_then(|device| device.name().ok());

    let outputs = host
        .output_devices()
        .map_err(|e| format!("Failed to enumerate output devices: {}", e))?
        .collect::<Vec<_>>();

    Ok((outputs, default_output_name))
}

fn push_mono_samples_f32(
    data: &[f32],
    input_channels: usize,
    bridge: &Arc<Mutex<StreamBridgeState>>,
    meter: &Arc<AtomicU32>,
) {
    if input_channels == 0 {
        return;
    }

    let mut guard = bridge.lock().unwrap();
    let mut sq_sum = 0.0_f32;
    let mut count = 0_usize;
    for frame in data.chunks(input_channels) {
        let frame_sum = frame.iter().copied().sum::<f32>();
        let mono = frame_sum / input_channels as f32;
        guard.queue.push_back(mono);
        sq_sum += mono * mono;
        count += 1;
    }

    while guard.queue.len() > guard.max_buffer_samples {
        guard.queue.pop_front();
    }

    if count > 0 {
        let rms = (sq_sum / count as f32).sqrt().clamp(0.0, 1.0);
        let prev = load_atomic_f32(meter);
        store_atomic_f32(meter, prev * 0.45 + rms * 0.55);
    }
}

fn push_mono_samples_i16(
    data: &[i16],
    input_channels: usize,
    bridge: &Arc<Mutex<StreamBridgeState>>,
    meter: &Arc<AtomicU32>,
) {
    if input_channels == 0 {
        return;
    }

    let mut guard = bridge.lock().unwrap();
    let mut sq_sum = 0.0_f32;
    let mut count = 0_usize;
    for frame in data.chunks(input_channels) {
        let frame_sum = frame
            .iter()
            .map(|sample| *sample as f32 / i16::MAX as f32)
            .sum::<f32>();
        let mono = frame_sum / input_channels as f32;
        guard.queue.push_back(mono);
        sq_sum += mono * mono;
        count += 1;
    }

    while guard.queue.len() > guard.max_buffer_samples {
        guard.queue.pop_front();
    }

    if count > 0 {
        let rms = (sq_sum / count as f32).sqrt().clamp(0.0, 1.0);
        let prev = load_atomic_f32(meter);
        store_atomic_f32(meter, prev * 0.45 + rms * 0.55);
    }
}

fn push_mono_samples_u16(
    data: &[u16],
    input_channels: usize,
    bridge: &Arc<Mutex<StreamBridgeState>>,
    meter: &Arc<AtomicU32>,
) {
    if input_channels == 0 {
        return;
    }

    let mut guard = bridge.lock().unwrap();
    let mut sq_sum = 0.0_f32;
    let mut count = 0_usize;
    for frame in data.chunks(input_channels) {
        let frame_sum = frame
            .iter()
            .map(|sample| (*sample as f32 / u16::MAX as f32) * 2.0 - 1.0)
            .sum::<f32>();
        let mono = frame_sum / input_channels as f32;
        guard.queue.push_back(mono);
        sq_sum += mono * mono;
        count += 1;
    }

    while guard.queue.len() > guard.max_buffer_samples {
        guard.queue.pop_front();
    }

    if count > 0 {
        let rms = (sq_sum / count as f32).sqrt().clamp(0.0, 1.0);
        let prev = load_atomic_f32(meter);
        store_atomic_f32(meter, prev * 0.45 + rms * 0.55);
    }
}

fn next_resampled_sample(state: &mut StreamBridgeState) -> f32 {
    if state.queue.len() < state.min_prefill_samples {
        return 0.0;
    }

    if state.queue.len() < 2 {
        return state.queue.front().copied().unwrap_or(0.0);
    }

    let base_ratio = state.input_sample_rate / state.output_sample_rate;
    let buffer_error = state.queue.len() as f64 - state.target_latency_samples;
    let correction = (buffer_error / state.target_latency_samples).clamp(-0.08, 0.08) * 0.01;
    let adjusted_ratio = base_ratio * (1.0 + correction);

    while state.read_phase >= 1.0 && state.queue.len() > 1 {
        state.queue.pop_front();
        state.read_phase -= 1.0;
    }

    let s0 = state.queue.get(0).copied().unwrap_or(0.0);
    let s1 = state.queue.get(1).copied().unwrap_or(s0);
    let frac = state.read_phase as f32;
    let out = s0 * (1.0 - frac) + s1 * frac;

    state.read_phase += adjusted_ratio;
    out.clamp(-1.0, 1.0)
}

fn fill_output_f32(
    data: &mut [f32],
    output_channels: usize,
    bridge: &Arc<Mutex<StreamBridgeState>>,
    meter: &Arc<AtomicU32>,
) {
    if output_channels == 0 {
        return;
    }

    let mut guard = bridge.lock().unwrap();
    let mut sq_sum = 0.0_f32;
    let mut count = 0_usize;
    for frame in data.chunks_mut(output_channels) {
        let sample = next_resampled_sample(&mut guard);
        sq_sum += sample * sample;
        count += 1;
        for channel in frame.iter_mut() {
            *channel = sample;
        }
    }

    if count > 0 {
        let rms = (sq_sum / count as f32).sqrt().clamp(0.0, 1.0);
        let prev = load_atomic_f32(meter);
        store_atomic_f32(meter, prev * 0.45 + rms * 0.55);
    }
}

fn fill_output_i16(
    data: &mut [i16],
    output_channels: usize,
    bridge: &Arc<Mutex<StreamBridgeState>>,
    meter: &Arc<AtomicU32>,
) {
    if output_channels == 0 {
        return;
    }

    let mut guard = bridge.lock().unwrap();
    let mut sq_sum = 0.0_f32;
    let mut count = 0_usize;
    for frame in data.chunks_mut(output_channels) {
        let sample = next_resampled_sample(&mut guard);
        sq_sum += sample * sample;
        count += 1;
        let sample_i16 = (sample * i16::MAX as f32) as i16;
        for channel in frame.iter_mut() {
            *channel = sample_i16;
        }
    }

    if count > 0 {
        let rms = (sq_sum / count as f32).sqrt().clamp(0.0, 1.0);
        let prev = load_atomic_f32(meter);
        store_atomic_f32(meter, prev * 0.45 + rms * 0.55);
    }
}

fn fill_output_u16(
    data: &mut [u16],
    output_channels: usize,
    bridge: &Arc<Mutex<StreamBridgeState>>,
    meter: &Arc<AtomicU32>,
) {
    if output_channels == 0 {
        return;
    }

    let mut guard = bridge.lock().unwrap();
    let mut sq_sum = 0.0_f32;
    let mut count = 0_usize;
    for frame in data.chunks_mut(output_channels) {
        let sample = next_resampled_sample(&mut guard);
        sq_sum += sample * sample;
        count += 1;
        let mapped = ((sample + 1.0) * 0.5 * u16::MAX as f32) as u16;
        for channel in frame.iter_mut() {
            *channel = mapped;
        }
    }

    if count > 0 {
        let rms = (sq_sum / count as f32).sqrt().clamp(0.0, 1.0);
        let prev = load_atomic_f32(meter);
        store_atomic_f32(meter, prev * 0.45 + rms * 0.55);
    }
}

fn create_passthrough_session(
    input_device_id: String,
    output_device_id: String,
) -> Result<PassthroughSession, String> {
    let (input_devices, _) = enumerate_audio_inputs()?;
    let (output_devices, _) = enumerate_audio_outputs()?;

    let output_index = parse_device_index(&output_device_id, "out-")?;
    let output_device = output_devices
        .get(output_index)
        .ok_or_else(|| format!("Output device not found: {}", output_device_id))?;

    let (input_device, input_config) = if input_device_id.starts_with("loop-out-") {
        let loopback_index = parse_device_index(&input_device_id, "loop-out-")?;
        let loopback_device = output_devices
            .get(loopback_index)
            .ok_or_else(|| format!("Loopback output device not found: {}", input_device_id))?
            .clone();

        let config = loopback_device
            .default_output_config()
            .map_err(|e| format!("Failed to get loopback config: {}", e))?;

        (loopback_device, config)
    } else {
        let input_index = parse_device_index(&input_device_id, "in-")?;
        let input_device = input_devices
            .get(input_index)
            .ok_or_else(|| format!("Input device not found: {}", input_device_id))?
            .clone();

        let config = input_device
            .default_input_config()
            .map_err(|e| format!("Failed to get input config: {}", e))?;

        (input_device, config)
    };
    let output_config = output_device
        .default_output_config()
        .map_err(|e| format!("Failed to get output config: {}", e))?;

    let input_stream_config: cpal::StreamConfig = input_config.clone().into();
    let output_stream_config: cpal::StreamConfig = output_config.clone().into();

    let input_channels = input_stream_config.channels as usize;
    let output_channels = output_stream_config.channels as usize;
    let input_sample_rate = input_stream_config.sample_rate.0 as f64;
    let output_sample_rate = output_stream_config.sample_rate.0 as f64;
    let target_latency_ms = 45.0;
    let target_latency_samples = (input_sample_rate * (target_latency_ms / 1000.0)).max(64.0);
    let max_buffer_samples = (input_sample_rate * 1.2) as usize;
    let min_prefill_samples = (target_latency_samples * 0.35) as usize;

    let bridge = Arc::new(Mutex::new(StreamBridgeState {
        queue: VecDeque::new(),
        read_phase: 0.0,
        input_sample_rate,
        output_sample_rate,
        target_latency_samples,
        max_buffer_samples,
        min_prefill_samples,
    }));
    let input_meter = Arc::new(AtomicU32::new(0.0_f32.to_bits()));
    let output_meter = Arc::new(AtomicU32::new(0.0_f32.to_bits()));

    let input_err = |err| eprintln!("Input stream error: {}", err);
    let output_err = |err| eprintln!("Output stream error: {}", err);

    let input_stream = match input_config.sample_format() {
        cpal::SampleFormat::F32 => {
            let bridge_ref = Arc::clone(&bridge);
            let meter_ref = Arc::clone(&input_meter);
            input_device
                .build_input_stream(
                    &input_stream_config,
                    move |data: &[f32], _| {
                        push_mono_samples_f32(data, input_channels, &bridge_ref, &meter_ref)
                    },
                    input_err,
                    None,
                )
                .map_err(|e| format!("Failed to build f32 input stream: {}", e))?
        }
        cpal::SampleFormat::I16 => {
            let bridge_ref = Arc::clone(&bridge);
            let meter_ref = Arc::clone(&input_meter);
            input_device
                .build_input_stream(
                    &input_stream_config,
                    move |data: &[i16], _| {
                        push_mono_samples_i16(data, input_channels, &bridge_ref, &meter_ref)
                    },
                    input_err,
                    None,
                )
                .map_err(|e| format!("Failed to build i16 input stream: {}", e))?
        }
        cpal::SampleFormat::U16 => {
            let bridge_ref = Arc::clone(&bridge);
            let meter_ref = Arc::clone(&input_meter);
            input_device
                .build_input_stream(
                    &input_stream_config,
                    move |data: &[u16], _| {
                        push_mono_samples_u16(data, input_channels, &bridge_ref, &meter_ref)
                    },
                    input_err,
                    None,
                )
                .map_err(|e| format!("Failed to build u16 input stream: {}", e))?
        }
        _ => return Err("Unsupported input sample format".to_string()),
    };

    let output_stream = match output_config.sample_format() {
        cpal::SampleFormat::F32 => {
            let bridge_ref = Arc::clone(&bridge);
            let meter_ref = Arc::clone(&output_meter);
            output_device
                .build_output_stream(
                    &output_stream_config,
                    move |data: &mut [f32], _| {
                        fill_output_f32(data, output_channels, &bridge_ref, &meter_ref)
                    },
                    output_err,
                    None,
                )
                .map_err(|e| format!("Failed to build f32 output stream: {}", e))?
        }
        cpal::SampleFormat::I16 => {
            let bridge_ref = Arc::clone(&bridge);
            let meter_ref = Arc::clone(&output_meter);
            output_device
                .build_output_stream(
                    &output_stream_config,
                    move |data: &mut [i16], _| {
                        fill_output_i16(data, output_channels, &bridge_ref, &meter_ref)
                    },
                    output_err,
                    None,
                )
                .map_err(|e| format!("Failed to build i16 output stream: {}", e))?
        }
        cpal::SampleFormat::U16 => {
            let bridge_ref = Arc::clone(&bridge);
            let meter_ref = Arc::clone(&output_meter);
            output_device
                .build_output_stream(
                    &output_stream_config,
                    move |data: &mut [u16], _| {
                        fill_output_u16(data, output_channels, &bridge_ref, &meter_ref)
                    },
                    output_err,
                    None,
                )
                .map_err(|e| format!("Failed to build u16 output stream: {}", e))?
        }
        _ => return Err("Unsupported output sample format".to_string()),
    };

    input_stream
        .play()
        .map_err(|e| format!("Failed to start input stream: {}", e))?;
    output_stream
        .play()
        .map_err(|e| format!("Failed to start output stream: {}", e))?;

    Ok(PassthroughSession {
        _input_stream: input_stream,
        _output_stream: output_stream,
        input_device_id,
        output_device_id,
        input_meter,
        output_meter,
    })
}

fn audio_engine_handle() -> &'static AudioEngineHandle {
    AUDIO_ENGINE.get_or_init(|| {
        let (sender, receiver) = mpsc::channel::<AudioEngineCommand>();
        let status = Arc::new(Mutex::new(AudioRouteStatus::default()));
        let status_ref = Arc::clone(&status);

        std::thread::spawn(move || {
            let mut active_sessions: Vec<PassthroughSession> = vec![];

            while let Ok(command) = receiver.recv() {
                match command {
                    AudioEngineCommand::StartMany { routes, responder } => {
                        active_sessions.clear();

                        let mut unique = HashSet::<AudioRoutePair>::new();
                        let deduped_routes = routes
                            .into_iter()
                            .filter(|route| unique.insert(route.clone()))
                            .collect::<Vec<_>>();

                        let mut started_routes = vec![];
                        let mut errors = vec![];

                        for route in deduped_routes {
                            match create_passthrough_session(
                                route.input_device_id.clone(),
                                route.output_device_id.clone(),
                            ) {
                                Ok(session) => {
                                    started_routes.push(AudioRoutePair {
                                        input_device_id: session.input_device_id.clone(),
                                        output_device_id: session.output_device_id.clone(),
                                    });
                                    active_sessions.push(session);
                                }
                                Err(error) => {
                                    errors.push(format!(
                                        "{} -> {}: {}",
                                        route.input_device_id, route.output_device_id, error
                                    ));
                                }
                            }
                        }

                        {
                            let mut state = status_ref.lock().unwrap();
                            state.running = !active_sessions.is_empty();
                            state.route_count = active_sessions.len();
                            state.routes = started_routes.clone();

                            if let Some(first_route) = started_routes.first() {
                                state.input_device_id = Some(first_route.input_device_id.clone());
                                state.output_device_id = Some(first_route.output_device_id.clone());
                            } else {
                                state.input_device_id = None;
                                state.output_device_id = None;
                            }
                        }

                        if !errors.is_empty() && active_sessions.is_empty() {
                            let _ = responder.send(Err(errors.join("; ")));
                        } else {
                            let _ = responder.send(Ok(()));
                        }
                    }
                    AudioEngineCommand::Stop { responder } => {
                        active_sessions.clear();
                        let mut state = status_ref.lock().unwrap();
                        state.running = false;
                        state.input_device_id = None;
                        state.output_device_id = None;
                        state.route_count = 0;
                        state.routes = vec![];
                        let _ = responder.send(Ok(()));
                    }
                    AudioEngineCommand::GetLevels { responder } => {
                        let mut input_levels = HashMap::<String, f32>::new();
                        let mut output_levels = HashMap::<String, f32>::new();

                        for session in &active_sessions {
                            let input_value = load_atomic_f32(&session.input_meter);
                            let output_value = load_atomic_f32(&session.output_meter);

                            input_levels
                                .entry(session.input_device_id.clone())
                                .and_modify(|current| *current = (*current).max(input_value))
                                .or_insert(input_value);

                            output_levels
                                .entry(session.output_device_id.clone())
                                .and_modify(|current| *current = (*current).max(output_value))
                                .or_insert(output_value);
                        }

                        let _ = responder.send(AudioLevelSnapshot {
                            input_levels,
                            output_levels,
                        });
                    }
                }
            }

            drop(active_sessions);
        });

        AudioEngineHandle { sender, status }
    })
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> AppSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn update_settings(settings: AppSettings, state: State<AppState>) -> Result<(), String> {
    *state.settings.lock().unwrap() = settings;
    Ok(())
}

#[tauri::command]
fn set_auto_start(enabled: bool, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;

    let autostart_manager = app.autolaunch();
    if enabled {
        autostart_manager.enable().map_err(|e| e.to_string())?;
    } else {
        autostart_manager.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn is_auto_start_enabled(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;

    let autostart_manager = app.autolaunch();
    autostart_manager.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn close_window(window: WebviewWindow) {
    window.close().unwrap();
}

#[tauri::command]
fn minimize_window(window: WebviewWindow) {
    window.minimize().unwrap();
}

#[tauri::command]
fn maximize_window(window: WebviewWindow) {
    if window.is_maximized().unwrap() {
        window.unmaximize().unwrap();
    } else {
        window.maximize().unwrap();
    }
}

#[tauri::command]
fn start_drag(window: WebviewWindow) {
    window.start_dragging().unwrap();
}

#[tauri::command]
fn list_audio_hardware() -> Result<AudioHardwareSnapshot, String> {
    let (inputs, default_input_name) = enumerate_audio_inputs()?;
    let (outputs, default_output_name) = enumerate_audio_outputs()?;

    let mut input_list = inputs
        .iter()
        .enumerate()
        .map(|(index, device)| {
            let name = device
                .name()
                .unwrap_or_else(|_| format!("Input Device {}", index + 1));
            let channels = device
                .default_input_config()
                .map(|config| config.channels())
                .unwrap_or(2);

            AudioHardwareDevice {
                id: format!("in-{}", index),
                name: name.clone(),
                channels,
                is_default: default_input_name
                    .as_ref()
                    .map(|n| n == &name)
                    .unwrap_or(false),
            }
        })
        .collect::<Vec<_>>();

    let loopback_inputs = outputs
        .iter()
        .enumerate()
        .map(|(index, device)| {
            let name = device
                .name()
                .unwrap_or_else(|_| format!("Output Device {}", index + 1));
            let channels = device
                .default_output_config()
                .map(|config| config.channels())
                .unwrap_or(2);

            AudioHardwareDevice {
                id: format!("loop-out-{}", index),
                name: format!("{} (扬声器回采)", name),
                channels,
                is_default: false,
            }
        })
        .collect::<Vec<_>>();

    input_list.extend(loopback_inputs);

    let mut output_list = outputs
        .iter()
        .enumerate()
        .map(|(index, device)| {
            let name = device
                .name()
                .unwrap_or_else(|_| format!("Output Device {}", index + 1));
            let channels = device
                .default_output_config()
                .map(|config| config.channels())
                .unwrap_or(2);

            AudioHardwareDevice {
                id: format!("out-{}", index),
                name: name.clone(),
                channels,
                is_default: default_output_name
                    .as_ref()
                    .map(|n| n == &name)
                    .unwrap_or(false),
            }
        })
        .collect::<Vec<_>>();

    // In-app virtual endpoints removed; only real system devices are listed.

    Ok(AudioHardwareSnapshot {
        inputs: input_list,
        outputs: output_list,
    })
}

// virtual endpoint commands removed

#[tauri::command]
fn check_virtual_audio_driver() -> VirtualDriverStatus {
    get_virtual_driver_status()
}

#[tauri::command]
fn list_virtual_driver_inf_files() -> Vec<String> {
    list_virtual_driver_inf_files_internal()
}

#[tauri::command]
fn install_virtual_audio_driver(inf_name: Option<String>) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Err("Virtual audio driver installer currently supports Windows only".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let script = locate_virtual_driver_installer_script().ok_or_else(|| {
            "Driver installer script not found: drivers/windows/install-virtual-audio-driver.ps1"
                .to_string()
        })?;

        let mut command = Command::new("powershell");
        command
            .arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-File")
            .arg(&script);

        if let Some(value) = inf_name
            .as_ref()
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
        {
            command.arg("-InfName").arg(value);
        }

        let output = command
            .output()
            .map_err(|err| format!("Failed to launch driver installer: {}", err))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() {
                Ok("Virtual audio driver installation command completed".to_string())
            } else {
                Ok(stdout)
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if stderr.is_empty() {
                Err("Virtual audio driver installation failed".to_string())
            } else {
                Err(stderr)
            }
        }
    }
}

#[tauri::command]
fn start_audio_routes(routes: Vec<AudioRoutePair>) -> Result<(), String> {
    let resolved_routes = resolve_virtual_routes(routes)?;
    let handle = audio_engine_handle();
    let (responder, receiver) = mpsc::channel::<Result<(), String>>();

    handle
        .sender
        .send(AudioEngineCommand::StartMany {
            routes: resolved_routes,
            responder,
        })
        .map_err(|e| format!("Failed to send start command: {}", e))?;

    receiver
        .recv()
        .map_err(|e| format!("Failed to receive start result: {}", e))?
}

#[tauri::command]
fn start_audio_passthrough(
    input_device_id: String,
    output_device_id: String,
) -> Result<(), String> {
    start_audio_routes(vec![AudioRoutePair {
        input_device_id,
        output_device_id,
    }])
}

#[tauri::command]
fn stop_audio_routes() -> Result<(), String> {
    let handle = audio_engine_handle();
    let (responder, receiver) = mpsc::channel::<Result<(), String>>();

    handle
        .sender
        .send(AudioEngineCommand::Stop { responder })
        .map_err(|e| format!("Failed to send stop command: {}", e))?;

    receiver
        .recv()
        .map_err(|e| format!("Failed to receive stop result: {}", e))?
}

#[tauri::command]
fn stop_audio_passthrough() -> Result<(), String> {
    stop_audio_routes()
}

#[tauri::command]
fn get_audio_route_status() -> AudioRouteStatus {
    let handle = audio_engine_handle();
    handle.status.lock().unwrap().clone()
}

#[tauri::command]
fn get_audio_levels() -> Result<AudioLevelSnapshot, String> {
    let handle = audio_engine_handle();
    let (responder, receiver) = mpsc::channel::<AudioLevelSnapshot>();

    handle
        .sender
        .send(AudioEngineCommand::GetLevels { responder })
        .map_err(|e| format!("Failed to send get-levels command: {}", e))?;

    receiver
        .recv()
        .map_err(|e| format!("Failed to receive levels: {}", e))
}

fn create_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let show_i = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
    let hide_i = MenuItem::with_id(app, "hide", "隐藏", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

    let _ = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Core Link")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn setup_window_events(window: &WebviewWindow) {
    window.on_window_event(|event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            settings: Mutex::new(AppSettings::default()),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_settings,
            update_settings,
            set_auto_start,
            is_auto_start_enabled,
            close_window,
            minimize_window,
            maximize_window,
            start_drag,
            list_audio_hardware,
            check_virtual_audio_driver,
            list_virtual_driver_inf_files,
            install_virtual_audio_driver,
            start_audio_routes,
            start_audio_passthrough,
            stop_audio_routes,
            stop_audio_passthrough,
            get_audio_route_status,
            get_audio_levels,
        ])
        .setup(|app| {
            create_tray(app.handle())?;

            if let Some(window) = app.get_webview_window("main") {
                setup_window_events(&window);

                let window = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    let _ = window.show();
                });
            }

            let _ = audio_engine_handle();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
