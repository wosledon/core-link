import { useState, useRef, useEffect, useCallback } from 'react';
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
}

export function CustomSelect({ 
  value, 
  options, 
  onChange, 
  placeholder = '请选择',
  disabled = false,
  className = '',
  onMouseDown
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find(opt => opt.value === value)?.label || placeholder;

  const updatePosition = useCallback(() => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4 + window.scrollY,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 200)
      });
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
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
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  const handleClick = () => {
    if (!disabled) {
      updatePosition();
      setIsOpen(!isOpen);
    }
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
        zIndex: 99999
      }}
      onWheel={handleWheel}
    >
      {options.map((option) => (
        <div
          key={option.value}
          className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
          onClick={() => {
            onChange(option.value);
            setIsOpen(false);
          }}
        >
          {option.label}
        </div>
      ))}
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
      >
        <span>{selectedLabel}</span>
        <svg className="custom-select-arrow" viewBox="0 0 24 24">
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
