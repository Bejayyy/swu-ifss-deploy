import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

/**
 * Notification modal for success/error feedback
 * @param {string} type - "success", "error", "warning", or "info"
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {function} onClose - Callback when modal closes
 * @param {number} autoCloseMs - Auto-close after milliseconds (0 = no auto-close)
 */
export default function NotificationModal({
  type = 'success',
  title = '',
  message = '',
  onClose,
  autoCloseMs = 3000,
}) {
  useEffect(() => {
    if (autoCloseMs > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseMs);
      return () => clearTimeout(timer);
    }
  }, [autoCloseMs, onClose]);

  const config = {
    success: {
      icon: CheckCircle,
      bgColor: 'bg-green-100',
      iconColor: 'text-green-600',
      titleColor: '#059669',
      borderColor: 'border-green-200',
    },
    error: {
      icon: XCircle,
      bgColor: 'bg-[#FFF0F0]',
      iconColor: 'text-[#7A0808]',
      titleColor: '#7A0808',
      borderColor: 'border-[#FFCACA]',
    },
    warning: {
      icon: AlertCircle,
      bgColor: 'bg-[#FFF0F0]',
      iconColor: 'text-[#7A0808]',
      titleColor: '#7A0808',
      borderColor: 'border-[#FFCACA]',
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600',
      titleColor: '#2563EB',
      borderColor: 'border-blue-200',
    },
  };

  const { icon: Icon, bgColor, iconColor, titleColor, borderColor } = config[type] || config.info;

  return (
    <div className="modal-overlay !z-[9999]" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative z-[10000] animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 z-10"
        >
          <X size={20} />
        </button>

        <div className="p-8 pt-10">
          <div className="flex items-start gap-4 mb-6">
            <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${bgColor}`}>
              <Icon size={24} className={iconColor} />
            </div>
            <div className="flex-1">
              <h2 className="font-black text-lg mb-2" style={{ color: titleColor }}>
                {title}
              </h2>
              <p className="text-sm font-medium" style={{ color: '#2B3235', opacity: 0.75 }}>
                {message}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn-maroon w-full justify-center py-2.5"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
