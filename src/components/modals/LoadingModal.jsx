import React from 'react';
import { Loader2 } from 'lucide-react';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

/**
 * Loading modal that appears during async operations
 * Blocks user interaction with a dimmed, blurred background
 * 
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {string} message - Loading message to display
 */
export default function LoadingModal({ isOpen, message = 'Processing...' }) {
  useBodyScrollLock(Boolean(isOpen));

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center modal-overlay"
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 animate-fadeIn"
        style={{ minWidth: '300px' }}
      >
        <Loader2 
          size={48} 
          className="animate-spin"
          style={{ color: '#7A0808' }}
        />
        <p className="text-base font-bold text-center" style={{ color: '#2B3235' }}>
          {message}
        </p>
        <p className="text-xs text-gray-500 text-center">
          Please wait...
        </p>
      </div>
    </div>
  );
}
