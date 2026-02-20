import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { languages } from '../i18n';
import type { Language, Theme } from '../types';
import { CustomSelect } from './CustomSelect';
import './SettingsPanel.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  theme: Theme;
  autoStart: boolean;
  minimizeToTray: boolean;
  autoLoadLastProject: boolean;
  onLanguageChange: (lang: Language) => void;
  onThemeChange: (theme: Theme) => void;
  onAutoStartChange: (enabled: boolean) => void;
  onMinimizeToTrayChange: (enabled: boolean) => void;
  onAutoLoadLastProjectChange: (enabled: boolean) => void;
  virtualDriverStatus: {
    installed: boolean;
    installer_available: boolean;
    detected_inputs: string[];
    detected_outputs: string[];
  };
  virtualDriverBusy: boolean;
  virtualDriverMessage: string;
  virtualDriverInfFiles: string[];
  selectedVirtualDriverInf: string;
  onCheckVirtualDriver: () => void;
  onInstallVirtualDriver: () => void;
  onSelectVirtualDriverInf: (fileName: string) => void;
}



export function SettingsPanel({
  isOpen,
  onClose,
  language,
  theme,
  autoStart,
  minimizeToTray,
  autoLoadLastProject,
  onLanguageChange,
  onThemeChange,
  onAutoStartChange,
  onMinimizeToTrayChange,
  onAutoLoadLastProjectChange,
  virtualDriverStatus,
  virtualDriverBusy,
  virtualDriverMessage,
  virtualDriverInfFiles,
  selectedVirtualDriverInf,
  onCheckVirtualDriver,
  onInstallVirtualDriver,
  onSelectVirtualDriverInf,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'general' | 'appearance'>('general');

  if (!isOpen) return null;

  const languageOptions = languages.map(lang => ({ value: lang.code, label: lang.name }));
  const driverOptions = [
    { value: '', label: '自动选择' },
    ...virtualDriverInfFiles.map(file => ({ value: file, label: file }))
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t('settings.title')}</h2>
          <button className="settings-close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="settings-content settings-layout">
          <aside className="settings-nav">
            <button 
              className={`settings-nav-btn ${activeTab === 'general' ? 'active' : ''}`} 
              onClick={() => setActiveTab('general')}
            >
              {t('settings.general')}
            </button>
            <button 
              className={`settings-nav-btn ${activeTab === 'appearance' ? 'active' : ''}`} 
              onClick={() => setActiveTab('appearance')}
            >
              {t('settings.appearance')}
            </button>
          </aside>

          <div className="settings-main">
            {activeTab === 'general' && (
              <>
                <div className="settings-section">
                  <div className="settings-section-title">{t('settings.general')}</div>

                  <div className="settings-item">
                    <div className="settings-item-label">
                      <span className="settings-item-title">{t('settings.language')}</span>
                    </div>
                    <CustomSelect
                      value={language}
                      options={languageOptions}
                      onChange={(value) => onLanguageChange(value as Language)}
                    />
                  </div>

                  <div className="settings-item">
                    <div className="settings-item-label">
                      <span className="settings-item-title">{t('settings.autoStart')}</span>
                      <span className="settings-item-desc">{t('settings.autoStart')}</span>
                    </div>
                    <ToggleSwitch
                      checked={autoStart}
                      onChange={onAutoStartChange}
                    />
                  </div>

                  <div className="settings-item">
                    <div className="settings-item-label">
                      <span className="settings-item-title">{t('settings.minimizeToTray')}</span>
                      <span className="settings-item-desc">{t('settings.minimizeToTray')}</span>
                    </div>
                    <ToggleSwitch
                      checked={minimizeToTray}
                      onChange={onMinimizeToTrayChange}
                    />
                  </div>

                  <div className="settings-item">
                    <div className="settings-item-label">
                      <span className="settings-item-title">{t('settings.autoLoadLastProject.title')}</span>
                      <span className="settings-item-desc">{t('settings.autoLoadLastProject.desc')}</span>
                    </div>
                    <ToggleSwitch
                      checked={autoLoadLastProject}
                      onChange={onAutoLoadLastProjectChange}
                    />
                  </div>
                </div>

                {/* Virtual Driver Section */}
                <div className="settings-section">
                  <div className="settings-section-title">虚拟音频驱动</div>
                  
                  <div className="virtual-driver-header">
                    <div className="virtual-driver-status">
                      <div className={`virtual-driver-status-dot ${virtualDriverStatus.installed ? 'installed' : ''}`} />
                      <span className="virtual-driver-status-text">
                        {virtualDriverStatus.installed ? '已安装' : '未安装'}
                      </span>
                    </div>
                    <div className="virtual-driver-actions">
                      <button 
                        className="virtual-driver-btn" 
                        onClick={onCheckVirtualDriver} 
                        disabled={virtualDriverBusy}
                      >
                        检测驱动
                      </button>
                      <button
                        className="virtual-driver-btn primary"
                        onClick={onInstallVirtualDriver}
                        disabled={virtualDriverBusy || !virtualDriverStatus.installer_available}
                      >
                        安装驱动
                      </button>
                    </div>
                  </div>

                  <div className="virtual-driver-info">
                    <div className="virtual-driver-info-item">
                      <span className="virtual-driver-info-label">输入端</span>
                      <span className="virtual-driver-info-value">
                        {virtualDriverStatus.detected_inputs.length > 0 
                          ? virtualDriverStatus.detected_inputs.join(' / ') 
                          : '未检测到'}
                      </span>
                    </div>
                    <div className="virtual-driver-info-item">
                      <span className="virtual-driver-info-label">输出端</span>
                      <span className="virtual-driver-info-value">
                        {virtualDriverStatus.detected_outputs.length > 0 
                          ? virtualDriverStatus.detected_outputs.join(' / ') 
                          : '未检测到'}
                      </span>
                    </div>
                  </div>

                  <div className="virtual-driver-installer">
                    <div className="virtual-driver-installer-label">
                      <span className="virtual-driver-installer-title">安装包选择</span>
                      <span className="virtual-driver-installer-desc">从安装目录选择 .inf 或 Setup.exe</span>
                    </div>
                    <CustomSelect
                      value={selectedVirtualDriverInf}
                      options={driverOptions}
                      onChange={onSelectVirtualDriverInf}
                      placeholder="自动选择"
                    />
                  </div>

                  {virtualDriverMessage && (
                    <div className="virtual-driver-message">{virtualDriverMessage}</div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'appearance' && (
              <div className="settings-section">
                <div className="settings-section-title">{t('settings.appearance')}</div>

                <div className="settings-item">
                  <div className="settings-item-label">
                    <span className="settings-item-title">{t('settings.theme.title')}</span>
                  </div>
                  <div className="theme-options">
                    <button
                      className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                      onClick={() => onThemeChange('light')}
                    >
                      {t('settings.theme.light')}
                    </button>
                    <button
                      className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                      onClick={() => onThemeChange('dark')}
                    >
                      {t('settings.theme.dark')}
                    </button>
                    <button
                      className={`theme-option ${theme === 'system' ? 'active' : ''}`}
                      onClick={() => onThemeChange('system')}
                    >
                      {t('settings.theme.system')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleSwitch({ checked, onChange }: ToggleSwitchProps) {
  return (
    <div 
      className={`toggle-switch ${checked ? 'active' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <div className="toggle-switch-thumb" />
    </div>
  );
}
