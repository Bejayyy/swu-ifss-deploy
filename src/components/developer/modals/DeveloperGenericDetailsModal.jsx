import React, { useState } from 'react';
import {
  X,
  Database,
  Building,
  GraduationCap,
  BookOpen,
  Calendar,
  Layers,
  Trash2,
  Code,
  ChevronDown,
  ChevronUp,
  Tag,
  Clock,
  User,
} from 'lucide-react';

export default function DeveloperGenericDetailsModal({
  item,
  categoryTitle = 'Record Details',
  icon: Icon = Database,
  onClose,
  onDelete,
}) {
  const [showRawJson, setShowRawJson] = useState(false);

  if (!item) return null;

  const title = item.name || item.title || item.code || item.label || item.id || 'Record Details';
  const subtitle = item.description || item.reason || item.collegeCode || item.programCode || item.docPath || '';

  // Extract relevant key-value pairs
  const displayFields = Object.entries(item).filter(
    ([k, v]) =>
      !k.startsWith('_') &&
      typeof v !== 'object' &&
      v !== null &&
      v !== undefined &&
      k !== 'id'
  );

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-red-50/70 via-white to-amber-50/50 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-[#7A0808] flex items-center justify-center flex-shrink-0">
              <Icon size={20} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#7A0808] bg-[#FFF0F0] border border-[#FFD0D0] px-2.5 py-0.5 rounded-full">
                {categoryTitle}
              </span>
              <h3 className="font-black text-lg text-gray-900 leading-tight mt-1">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-gray-500 font-medium truncate max-w-[340px]">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-sm">
          {/* Summary Properties */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#7A0808]">Attributes & Properties</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <p className="text-gray-400 font-medium">Document ID:</p>
                <p className="font-mono font-bold text-gray-900 truncate">{item.id}</p>
              </div>

              {displayFields.slice(0, 10).map(([k, v]) => (
                <div key={k}>
                  <p className="text-gray-400 font-medium capitalize">
                    {k.replace(/([A-Z])/g, ' $1')}:
                  </p>
                  <p className="font-bold text-gray-800 truncate">{String(v)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Raw JSON Developer Toggle */}
          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowRawJson((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            >
              <Code size={13} />
              <span>{showRawJson ? 'Hide Raw Document' : 'View Raw Firestore Document (JSON)'}</span>
              {showRawJson ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showRawJson && (
              <pre className="mt-2 p-3 bg-gray-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-64">
                {JSON.stringify(item, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="btn-delete text-xs py-2 px-3.5 gap-1.5 cursor-pointer flex items-center text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl font-bold transition-colors"
          >
            <Trash2 size={14} />
            <span>Delete Document</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
