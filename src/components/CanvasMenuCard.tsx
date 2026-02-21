import { useState } from 'react';
import { Tooltip } from './Tooltip';
import './CanvasMenuCard.css';

interface ProjectListItem {
  id: string;
  name: string;
  updatedAt: string;
}

interface CanvasMenuCardProps {
  onNewProject: () => void;
  onSaveProject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAutoRoute: () => void;
  onAutoLayout: () => void;
  projects: ProjectListItem[];
  activeProjectId: string | null;
  onLoadProject: (projectId: string) => void;
  canUndo: boolean;
  canRedo: boolean;
}

// 图标组件
const NewIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
  </svg>
);

const ProjectIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8h-8l-2-4z"/>
  </svg>
);

const SaveIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM6 8V5h9v3H6z"/>
  </svg>
);

const UndoIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
  </svg>
);

const RedoIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
  </svg>
);

// 自动布线图标 - 使用分支/连接路径图标
const AutoRouteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M296-270q-42 35-87.5 32T129-269q-34-28-46.5-73.5T99-436l75-124q-25-22-39.5-53T120-680q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47q-9 0-18-1t-17-3l-77 130q-11 18-7 35.5t17 28.5q13 11 31 12.5t35-12.5l420-361q42-35 88-31.5t80 31.5q34 28 46 73.5T861-524l-75 124q25 22 39.5 53t14.5 67q0 66-47 113t-113 47q-66 0-113-47t-47-113q0-66 47-113t113-47q9 0 17.5 1t16.5 3l78-130q11-18 7-35.5T782-630q-13-11-31-12.5T716-630L296-270Z"/></svg>
);

// 自动排版图标 - 使用对齐/整理图标
const AutoLayoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M440-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h240v720Zm80-400v-320h240q33 0 56.5 23.5T840-760v240H520Zm0 400v-320h320v240q0 33-23.5 56.5T760-120H520Z"/></svg>
);

export function CanvasMenuCard({
  onNewProject,
  onSaveProject,
  onUndo,
  onRedo,
  onAutoRoute,
  onAutoLayout,
  projects,
  activeProjectId,
  onLoadProject,
  canUndo,
  canRedo,
}: CanvasMenuCardProps) {
  const [showProjects, setShowProjects] = useState(false);

  return (
    <div className="canvas-menu-wrap">
      <div className="canvas-menu-card">
        <Tooltip content="新建工程" placement="bottom">
          <button className="menu-card-btn" onClick={onNewProject}>
            <NewIcon />
          </button>
        </Tooltip>
        <Tooltip content="工程列表" placement="bottom">
          <button className={`menu-card-btn ${showProjects ? 'active' : ''}`} onClick={() => setShowProjects(prev => !prev)}>
            <ProjectIcon />
          </button>
        </Tooltip>
        <Tooltip content="保存工程" placement="bottom">
          <button className="menu-card-btn" onClick={onSaveProject}>
            <SaveIcon />
          </button>
        </Tooltip>
        <div className="menu-card-divider" />
        <Tooltip content="撤销" placement="bottom">
          <button 
            className={`menu-card-btn ${!canUndo ? 'disabled' : ''}`} 
            onClick={onUndo} 
            disabled={!canUndo}
          >
            <UndoIcon />
          </button>
        </Tooltip>
        <Tooltip content="重做" placement="bottom">
          <button 
            className={`menu-card-btn ${!canRedo ? 'disabled' : ''}`} 
            onClick={onRedo} 
            disabled={!canRedo}
          >
            <RedoIcon />
          </button>
        </Tooltip>
        <div className="menu-card-divider" />
        <Tooltip content="自动布线" placement="bottom">
          <button className="menu-card-btn" onClick={onAutoRoute}>
            <AutoRouteIcon />
          </button>
        </Tooltip>
        <Tooltip content="自动排版" placement="bottom">
          <button className="menu-card-btn" onClick={onAutoLayout}>
            <AutoLayoutIcon />
          </button>
        </Tooltip>
      </div>

      {showProjects && (
        <div className="menu-project-panel">
          <div className="menu-project-title">工程列表</div>
          <div className="menu-project-list">
            {projects.length === 0 && <div className="menu-project-empty">暂无已保存工程</div>}
            {projects.map(project => (
              <div className={`menu-project-item ${activeProjectId === project.id ? 'active' : ''}`} key={project.id}>
                <div className="menu-project-main">
                  <div className="menu-project-name">{project.name}</div>
                  <div className="menu-project-time">{new Date(project.updatedAt).toLocaleString()}</div>
                </div>
                <button
                  className="menu-project-load-btn"
                  onClick={() => {
                    onLoadProject(project.id);
                    setShowProjects(false);
                  }}
                >
                  加载
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
