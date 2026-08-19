import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Confirmation modal for destructive or important actions
 * @param {string} title - Modal title
 * @param {string} message - Confirmation message
 * @param {string} confirmText - Text for confirm button (default: "Confirm")
 * @param {string} cancelText - Text for cancel button (default: "Cancel")
 * @param {string} variant - Button style: "danger" (red) or "primary" (maroon)
 * @param {function} onConfirm - Callback when user confirms
 * @param {function} onCancel - Callback when user cancels
 * @param {boolean} isProcessing - Show loading state on confirm button
 */
export default function ConfirmModal({
  title = 'Confirm action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
  isProcessing = false,
}) {
  const handleConfirm = () => {
    if (!isProcessing) {
      onConfirm();
    }
  };

  return (
    <div className="modal-overlay !z-[9999]" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative z-[10000]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 z-10"
          disabled={isProcessing}
        >
          <X size={20} />
        </button>

        <div className="p-8 pt-10">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-[#FFF0F0] border border-[#FFCACA]">
              <AlertTriangle
                size={22}
                className="text-[#7A0808]"
              />
            </div>
            <div className="flex-1">
              <h2
                className="font-black text-lg mb-2 text-[#7A0808]"
              >
                {title}
              </h2>
              <p className="text-sm font-medium" style={{ color: '#2B3235', opacity: 0.75 }}>
                {message}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              className="btn-outline-maroon flex-1 justify-center py-2.5 rounded-xl"
              onClick={onCancel}
              disabled={isProcessing}
            >
              {cancelText}
            </button>
            <button
              type="button"
              className={`flex-1 justify-center py-2.5 font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                variant === 'danger'
                  ? 'btn-delete rounded-xl justify-center text-sm py-2.5'
                  : 'bg-[#7A0808] text-white hover:bg-[#5A0606] rounded-xl'
              }`}
              onClick={handleConfirm}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
