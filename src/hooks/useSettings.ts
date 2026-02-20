import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings, Language, Theme } from '../types';
import i18n from '../i18n';

const SETTINGS_STORAGE_KEY = 'core-link-settings';

const defaultSettings: AppSettings = {
  language: 'zh-CN',
  theme: 'dark',
  autoStart: false,
  minimizeToTray: true,
  autoLoadLastProject: true,
};

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // 加载设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // 从本地存储加载
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        let loadedSettings = defaultSettings;
        
        if (stored) {
          loadedSettings = { ...defaultSettings, ...JSON.parse(stored) };
        }
        
        // 从后端获取自启动状态
        try {
          const autoStartEnabled = await invoke<boolean>('is_auto_start_enabled');
          loadedSettings.autoStart = autoStartEnabled;
        } catch (e) {
          console.log('Failed to get auto start status:', e);
        }
        
        setSettingsState(loadedSettings);
        
        // 应用语言设置
        i18n.changeLanguage(loadedSettings.language);
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSettings();
  }, []);

  // 保存设置到本地存储
  const saveToStorage = useCallback((newSettings: AppSettings) => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
  }, []);

  // 更新语言
  const setLanguage = useCallback(async (language: Language) => {
    const newSettings = { ...settings, language };
    setSettingsState(newSettings);
    saveToStorage(newSettings);
    i18n.changeLanguage(language);
    
    try {
      await invoke('update_settings', { settings: newSettings });
    } catch (e) {
      console.log('Failed to update settings on backend:', e);
    }
  }, [settings, saveToStorage]);

  // 更新主题
  const setTheme = useCallback(async (theme: Theme) => {
    const newSettings = { ...settings, theme };
    setSettingsState(newSettings);
    saveToStorage(newSettings);
    
    try {
      await invoke('update_settings', { settings: newSettings });
    } catch (e) {
      console.log('Failed to update settings on backend:', e);
    }
  }, [settings, saveToStorage]);

  // 更新自启动
  const setAutoStart = useCallback(async (autoStart: boolean) => {
    const newSettings = { ...settings, autoStart };
    setSettingsState(newSettings);
    saveToStorage(newSettings);
    
    try {
      await invoke('set_auto_start', { enabled: autoStart });
    } catch (e) {
      console.error('Failed to set auto start:', e);
      // 回滚状态
      setSettingsState(settings);
    }
  }, [settings, saveToStorage]);

  // 更新最小化到托盘
  const setMinimizeToTray = useCallback(async (minimizeToTray: boolean) => {
    const newSettings = { ...settings, minimizeToTray };
    setSettingsState(newSettings);
    saveToStorage(newSettings);
    
    try {
      await invoke('update_settings', { settings: newSettings });
    } catch (e) {
      console.log('Failed to update settings on backend:', e);
    }
  }, [settings, saveToStorage]);

  // 更新自动加载上次工程
  const setAutoLoadLastProject = useCallback(async (autoLoadLastProject: boolean) => {
    const newSettings = { ...settings, autoLoadLastProject };
    setSettingsState(newSettings);
    saveToStorage(newSettings);
    
    try {
      await invoke('update_settings', { settings: newSettings });
    } catch (e) {
      console.log('Failed to update settings on backend:', e);
    }
  }, [settings, saveToStorage]);

  return {
    settings,
    isLoading,
    setLanguage,
    setTheme,
    setAutoStart,
    setMinimizeToTray,
    setAutoLoadLastProject,
  };
}
