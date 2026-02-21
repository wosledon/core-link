import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import './CustomSelect.css';

export interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onMouseDown?: (e: React.MouseEvent) => void;
  searchable?: boolean;
  minDropdownWidth?: number;
}

export function CustomSelect({ 
  value, 
  options, 
  onChange, 
  placeholder = '请选择',
  disabled = false,
  className = '',
  onMouseDown,
  searchable = false,
  minDropdownWidth = 280
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0, maxHeight: 300 });
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedLabel = options.find(opt => opt.value === value)?.label || placeholder;

  // 过滤选项
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(opt => 
      opt.label.toLowerCase().includes(query) || 
      opt.value.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  const updatePosition = useCallback(() => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      // 计算下拉框宽度：自适应内容，只设置最小宽度
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      let maxTextWidth = 0;
      if (context) {
        context.font = '14px sans-serif';
        filteredOptions.forEach(opt => {
          const textWidth = context.measureText(opt.label).width;
          maxTextWidth = Math.max(maxTextWidth, textWidth);
        });
      }
      // 宽度 = 最大文本宽度 + 左右padding(32px) + 滚动条宽度(8px)
      const contentWidth = Math.max(maxTextWidth + 40, rect.width, minDropdownWidth);
      const width = Math.min(contentWidth, viewportWidth * 0.8);
      
      // 计算水平位置：优先左对齐，如果超出视口则右对齐
      let left = rect.left + window.scrollX;
      if (left + width > viewportWidth - 10) {
        left = rect.right + window.scrollX - width;
      }
      
      // 计算垂直位置
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      let top;
      let maxHeight;
      
      // 如果下方空间足够（至少200px），优先向下展开
      if (spaceBelow >= 200) {
        top = rect.bottom + 4 + window.scrollY;
        maxHeight = Math.min(300, spaceBelow - 10);
      } else if (spaceAbove >= 200) {
        // 向上展开，top 设置为触发器上方减去最大高度
        maxHeight = Math.min(300, spaceAbove - 10);
        top = rect.top + window.scrollY - maxHeight - 4;
      } else {
        // 空间不足，向下展开并使用可用空间
        top = rect.bottom + 4 + window.scrollY;
        maxHeight = Math.max(100, spaceBelow - 10);
      }
      
      setDropdownPos({ top, left, width, maxHeight });
    }
  }, [minDropdownWidth, filteredOptions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      // 聚焦搜索框
      if (searchable && searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, updatePosition, searchable]);

  const handleClick = () => {
    if (!disabled) {
      updatePosition();
      setIsOpen(!isOpen);
      if (!isOpen) {
        setSearchQuery('');
      }
    }
  };

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
  };

  const dropdown = isOpen && !disabled ? (
    <div 
      className="custom-select-dropdown"
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        maxHeight: dropdownPos.maxHeight,
        zIndex: 99999
      }}
      onWheel={handleWheel}
    >
      {searchable && options.length > 5 && (
        <div className="custom-select-search">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <svg className="search-icon" viewBox="0 0 24 24">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
        </div>
      )}
      <div className="custom-select-options">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => (
            <div
              key={option.value}
              className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
              onClick={() => handleSelect(option.value)}
              title={option.label}
            >
              {option.label}
            </div>
          ))
        ) : (
          <div className="custom-select-no-results">无匹配选项</div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div 
      className={`custom-select-wrapper ${className} ${disabled ? 'disabled' : ''}`} 
      ref={wrapperRef}
      onMouseDown={onMouseDown}
    >
      <button 
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={handleClick}
        type="button"
        disabled={disabled}
        title={selectedLabel}
      >
        <span className="custom-select-label">{selectedLabel}</span>
        <svg className="custom-select-arrow" viewBox="0 0 24 24">
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
