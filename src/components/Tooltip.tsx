import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({ 
  children, 
  content, 
  placement = 'bottom',
  delay = 300 
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const updatePosition = useCallback(() => {
    if (!wrapperRef.current) return;
    
    const rect = wrapperRef.current.getBoundingClientRect();
    const tooltipWidth = 100;
    const tooltipHeight = 30;
    
    let x = 0;
    let y = 0;
    
    switch (placement) {
      case 'top':
        x = rect.left + rect.width / 2;
        y = rect.top - tooltipHeight;
        break;
      case 'bottom':
        x = rect.left + rect.width / 2;
        y = rect.bottom;
        break;
      case 'left':
        x = rect.left - tooltipWidth;
        y = rect.top + rect.height / 2;
        break;
      case 'right':
        x = rect.right;
        y = rect.top + rect.height / 2;
        break;
    }
    
    setPosition({ x, y });
  }, [placement]);

  const handleMouseEnter = useCallback(() => {
    updatePosition();
    timerRef.current = window.setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [delay, updatePosition]);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsVisible(false);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (isVisible) {
        updatePosition();
      }
    };
    
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isVisible, updatePosition]);

  const tooltip = isVisible ? (
    <div
      className="tooltip-content visible"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, 0)'
      }}
      data-placement={placement}
    >
      {content}
    </div>
  ) : null;

  return (
    <div
      ref={wrapperRef}
      className="tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {tooltip && createPortal(tooltip, document.body)}
    </div>
  );
}
