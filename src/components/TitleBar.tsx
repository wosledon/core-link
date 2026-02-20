import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import './TitleBar.css';

interface TitleBarProps {
  onOpenSettings: () => void;
  projectName: string;
  onProjectNameChange: (projectName: string) => void;
}

export function TitleBar({ onOpenSettings, projectName, onProjectNameChange }: TitleBarProps) {
  const { t } = useTranslation();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(projectName);

  useEffect(() => {
    if (!isEditingName) {
      setNameDraft(projectName);
    }
  }, [isEditingName, projectName]);

  const handleMinimize = () => {
    invoke('minimize_window');
  };

  const handleMaximize = () => {
    invoke('maximize_window');
  };

  const handleClose = () => {
    invoke('close_window');
  };

  // 处理拖拽 - 只在非按钮区域触发
  const handleDrag = (e: React.MouseEvent) => {
    // 只有左键才能拖拽
    if (e.button === 0) {
      invoke('start_drag');
    }
  };

  const commitProjectName = () => {
    onProjectNameChange(nameDraft);
    setIsEditingName(false);
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <div className="titlebar-icon" data-tauri-drag-region>
          <svg viewBox="0 0 24 24" data-tauri-drag-region>
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
        </div>
        <span className="titlebar-title" data-tauri-drag-region>{t('app.name')}</span>
      </div>

      <div className="titlebar-center" data-tauri-drag-region onMouseDown={handleDrag}>
        <div className="titlebar-project-name" onMouseDown={(event) => event.stopPropagation()}>
          {isEditingName ? (
            <div className="project-name-editor">
              <input
                autoFocus
                className="project-name-input"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitProjectName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitProjectName();
                  }
                  if (event.key === 'Escape') {
                    setNameDraft(projectName);
                    setIsEditingName(false);
                  }
                }}
              />
              <span className="project-name-ext">.ck</span>
            </div>
          ) : (
            <button className="project-name-view" onClick={() => setIsEditingName(true)} title="点击编辑工程名称">
              {projectName}
              <span className="project-name-ext">.ck</span>
            </button>
          )}
        </div>
      </div>

      <div className="titlebar-right">
        {/* 设置按钮 */}
        <button className="titlebar-btn" onClick={onOpenSettings} title={t('common.settings')}>
          <svg viewBox="0 0 24 24">
            <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
          </svg>
        </button>
        <button className="titlebar-btn" onClick={handleMinimize} title={t('common.minimize')}>
          <svg viewBox="0 0 24 24">
            <path d="M19 13H5v-2h14v2z"/>
          </svg>
        </button>
        <button className="titlebar-btn" onClick={handleMaximize} title={t('common.maximize')}>
          <svg viewBox="0 0 24 24">
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
          </svg>
        </button>
        <button className="titlebar-btn close" onClick={handleClose} title={t('common.close')}>
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
