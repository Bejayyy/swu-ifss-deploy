import React, { useState } from 'react';
import { X, Calendar, Plus, Tag, FileText, CheckCircle2 } from 'lucide-react';
import { addCalendarEvent, updateCalendarEvent } from '../../services/academicCalendarService';
import DatePicker from '../ui/DatePicker';
import CustomSelect from '../ui/CustomSelect';

const EVENT_CATEGORIES = [
  { value: 'holiday', label: '🔴 Holiday (No Class)' },
  { value: 'academic', label: '🟢 Academic Milestone (Classes Begin / End)' },
  { value: 'exam', label: '🔵 Major Exam Period' },
  { value: 'activity', label: '🟣 University Activity (Maroon Jam, Orientation)' },
  { value: 'event', label: '⚪ General Event' },
];

export default function CreateCalendarEventModal({
  onClose,
  schoolYearId,
  initialDate = '',
  editingEvent = null,
  onSuccess,
}) {
  const [form, setForm] = useState({
    title: editingEvent?.title || '',
    startDate: editingEvent?.startDate || initialDate || new Date().toISOString().split('T')[0],
    endDate: editingEvent?.endDate || editingEvent?.startDate || initialDate || new Date().toISOString().split('T')[0],
    category: editingEvent?.category || 'event',
    isNoClass: editingEvent ? Boolean(editingEvent.isNoClass) : false,
    description: editingEvent?.description || '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Event title is required.');
      return;
    }
    if (!form.startDate) {
      setError('Start date is required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (editingEvent?.id) {
        await updateCalendarEvent(schoolYearId, editingEvent.id, {
          title: form.title,
          startDate: form.startDate,
          endDate: form.endDate || form.startDate,
          category: form.category,
          isNoClass: Boolean(form.isNoClass),
          description: form.description,
        });
        if (onSuccess) onSuccess('Event updated successfully.');
      } else {
        await addCalendarEvent(schoolYearId, {
          title: form.title,
          startDate: form.startDate,
          endDate: form.endDate || form.startDate,
          category: form.category,
          isNoClass: Boolean(form.isNoClass),
          description: form.description,
          source: 'manual',
        });
        if (onSuccess) onSuccess('Event added to calendar.');
      }
      onClose();
    } catch (err) {
      console.error('Error saving calendar event:', err);
      setError(err.message || 'Failed to save event.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#7A0808] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
              <Calendar size={18} />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">
                {editingEvent ? 'Edit Calendar Event' : 'Create an Event'}
              </h3>
              <p className="text-[11px] text-white/80">
                Mark dates and special events on the School Calendar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 font-bold">
              {error}
            </div>
          )}

          {/* Event Title */}
          <div>
            <label className="block font-bold text-gray-700 mb-1">
              Event Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Maroon Jam, Classes Begin, Maundy Thursday"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 focus:border-[#7A0808] focus:ring-1 focus:ring-[#7A0808] font-bold text-xs outline-none"
              required
              autoFocus
            />
          </div>

          {/* Dates (Start & End) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <DatePicker
                value={form.startDate}
                onChange={(val) => {
                  setForm((prev) => ({
                    ...prev,
                    startDate: val,
                    endDate: prev.endDate < val ? val : prev.endDate,
                  }));
                }}
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                End Date (Optional)
              </label>
              <DatePicker
                value={form.endDate}
                onChange={(val) => setForm({ ...form, endDate: val })}
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block font-bold text-gray-700 mb-1">
              Event Category <span className="text-red-500">*</span>
            </label>
            <CustomSelect
              value={form.category}
              onChange={(e) => {
                const cat = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  category: cat,
                  isNoClass: cat === 'holiday' ? true : prev.isNoClass,
                }));
              }}
              options={EVENT_CATEGORIES}
              placeholder="Select Category"
            />
          </div>

          {/* No Class Toggle */}
          <label className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 bg-gray-50/60 cursor-pointer hover:bg-gray-100/60 transition-colors">
            <input
              type="checkbox"
              checked={form.isNoClass}
              onChange={(e) => setForm({ ...form, isNoClass: e.target.checked })}
              className="w-4 h-4 rounded text-[#7A0808] focus:ring-[#7A0808]"
            />
            <div>
              <span className="font-bold text-gray-800 block text-xs">Declare as No-Class Day / Holiday</span>
              <span className="text-[10px] text-gray-500">
                Flags this date range so scheduling and room reservations reflect school suspension
              </span>
            </div>
          </label>

          {/* Description / Notes */}
          <div>
            <label className="block font-bold text-gray-700 mb-1">
              Description / Details (Optional)
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g., Special Non-Working Day for Upperclassmen and Freshmen"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:border-[#7A0808] focus:ring-1 focus:ring-[#7A0808] text-xs outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-3 border-t border-gray-100 font-bold">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-[#7A0808] text-white hover:bg-[#600000] shadow-md transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Saving...</span>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>{editingEvent ? 'Update Event' : 'Add Event'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
