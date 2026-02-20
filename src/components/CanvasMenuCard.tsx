import { useState } from 'react';
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

const AutoRouteIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
  </svg>
);

const AutoLayoutIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
  </svg>
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
      <button className="menu-card-btn" onClick={onNewProject} title="新建工程">
        <NewIcon />
      </button>
      <button className={`menu-card-btn ${showProjects ? 'active' : ''}`} onClick={() => setShowProjects(prev => !prev)} title="工程列表">
        <ProjectIcon />
      </button>
      <button className="menu-card-btn" onClick={onSaveProject} title="保存工程">
        <SaveIcon />
      </button>
      <div className="menu-card-divider" />
      <button 
        className={`menu-card-btn ${!canUndo ? 'disabled' : ''}`} 
        onClick={onUndo} 
        title="撤销"
        disabled={!canUndo}
      >
        <UndoIcon />
      </button>
      <button 
        className={`menu-card-btn ${!canRedo ? 'disabled' : ''}`} 
        onClick={onRedo} 
        title="重做"
        disabled={!canRedo}
      >
        <RedoIcon />
      </button>
      <div className="menu-card-divider" />
      <button className="menu-card-btn" onClick={onAutoRoute} title="自动布线">
        <AutoRouteIcon />
      </button>
      <button className="menu-card-btn" onClick={onAutoLayout} title="自动排版">
        <AutoLayoutIcon />
      </button>
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
