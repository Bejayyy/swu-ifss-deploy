import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { parseTimeToHour, validateScheduleHours } from '../../services/plotScheduleService';
import { formatScheduleHour } from '../../constants/scheduleGrid';
import { formatDisplayDate } from '../../utils/academicCalendarUtils';
import TimePicker from '../ui/TimePicker';

const TYPE_OPTIONS = ['Lecture', 'Laboratory', 'CAS', 'Exam'];

export default function AddPlotEntryModal({
  onClose,
  onSave,
  initial,
  date,
  dayLabel,
  scheduleMode = 'regular',
  restrictRooms = false,
  assignedRooms = [],
  dayBlockReason,
  lockTimes = false,
}) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    courseCode: initial?.courseCode || initial?.course || '',
    instructor: initial?.instructor || '',
    type: initial?.type || (scheduleMode === 'exam' ? 'Exam' : 'Lecture'),
    startTime: initial?.startTime || '08:00',
    endTime: initial?.endTime || '09:30',
    roomCode: initial?.roomCode || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const roomOptions = useMemo(
    () => assignedRooms.map((r) => ({
      value: r.roomCode,
      label: `${r.buildingName} · ${r.roomCode}`,
    })),
    [assignedRooms],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (dayBlockReason) {
      setError(dayBlockReason);
      return;
    }
    if (!form.title.trim() || !form.courseCode.trim()) {
      setError('Title and course code are required.');
      return;
    }

    const startHour = parseTimeToHour(form.startTime);
    const endHour = parseTimeToHour(form.endTime);
    const timeCheck = validateScheduleHours(startHour, endHour);
    if (!timeCheck.valid) {
      setError(timeCheck.message);
      return;
    }
    if (restrictRooms && !form.roomCode) {
      setError('Select a room from the assigned list.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        date,
        title: form.title.trim(),
        courseCode: form.courseCode.trim(),
        instructor: form.instructor.trim(),
        type: form.type,
        startHour: timeCheck.startHour,
        endHour: timeCheck.endHour,
        roomCode: form.roomCode,
        scheduleMode,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save schedule block.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl relative" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 z-10">
          <X size={20} />
        </button>
        <form onSubmit={handleSubmit} className="p-8 pt-10">
          <h2 className="font-black text-lg mb-1" style={{ color: '#7A0808' }}>
            {initial ? 'Edit schedule block' : 'Add schedule block'}
          </h2>
          <p className="text-xs font-medium mb-4" style={{ color: '#2B3235', opacity: 0.65 }}>
            {dayLabel} · {formatDisplayDate(date)} · {scheduleMode === 'exam' ? 'Exam calendar' : 'Regular schedule'}
          </p>

          {dayBlockReason && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {dayBlockReason}
            </p>
          )}
          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <div className="space-y-3">
            <div>
              <label className="form-label">Title</label>
              <input className="form-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required disabled={!!dayBlockReason} />
            </div>
            <div>
              <label className="form-label">Course code</label>
              <input className="form-input" placeholder="e.g. MATH 301" value={form.courseCode} onChange={(e) => setForm((f) => ({ ...f, courseCode: e.target.value }))} required disabled={!!dayBlockReason} />
            </div>
            <div>
              <label className="form-label">Instructor</label>
              <input className="form-input" value={form.instructor} onChange={(e) => setForm((f) => ({ ...f, instructor: e.target.value }))} disabled={!!dayBlockReason} />
            </div>
            <div className="p-3 rounded-lg border border-gray-100 bg-gray-50">
              <p className="text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                Time: {formatScheduleHour(parseTimeToHour(form.startTime) || 0)} – {formatScheduleHour(parseTimeToHour(form.endTime) || 0)}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Start time</label>
                  <TimePicker value={form.startTime} onChange={(val) => setForm((f) => ({ ...f, startTime: val }))} required disabled={!!dayBlockReason || lockTimes} step={30} />
                </div>
                <div>
                  <label className="form-label">End time</label>
                  <TimePicker value={form.endTime} onChange={(val) => setForm((f) => ({ ...f, endTime: val }))} required disabled={!!dayBlockReason || lockTimes} step={30} />
                </div>
              </div>
              {lockTimes && (
                <p className="text-[10px] font-semibold mt-2 opacity-60" style={{ color: '#2B3235' }}>
                  Times set from grid selection. Drag on the grid to change.
                </p>
              )}
            </div>
            <div>
              <label className="form-label">Type</label>
              <select className="form-input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} disabled={!!dayBlockReason}>
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {restrictRooms && (
              <div>
                <label className="form-label">Room</label>
                <select className="form-input" value={form.roomCode} onChange={(e) => setForm((f) => ({ ...f, roomCode: e.target.value }))} required disabled={!!dayBlockReason}>
                  <option value="">Select room</option>
                  {roomOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            )}
            {!restrictRooms && (
              <div>
                <label className="form-label">Room (optional)</label>
                <input className="form-input" placeholder="e.g. ENG-101" value={form.roomCode} onChange={(e) => setForm((f) => ({ ...f, roomCode: e.target.value }))} disabled={!!dayBlockReason} />
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-8">
            <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-maroon flex-1 justify-center py-2.5" disabled={saving || !!dayBlockReason}>
              {saving ? 'Saving…' : 'Save block'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
