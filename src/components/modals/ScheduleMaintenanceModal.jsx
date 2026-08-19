import React, { useState } from 'react';
import { X, Calendar, FileText, AlertCircle } from 'lucide-react';
import { scheduleRoomMaintenance, updateMaintenanceSchedule } from '../../services/maintenanceService';
import { useAuth } from '../../context/AuthContext';
import LoadingModal from './LoadingModal';
import DatePicker from '../ui/DatePicker';
import TimePicker from '../ui/TimePicker';

export default function ScheduleMaintenanceModal({ 
  isOpen, 
  onClose, 
  room, 
  buildingName,
  existingSchedule = null, // For editing existing schedule
  reportId = null, // If scheduling from a report
  onSuccess 
}) {
  const { profile } = useAuth();
  const [durationType, setDurationType] = useState('days'); // 'hours' or 'days'
  const [startDate, setStartDate] = useState(existingSchedule?.startDate || '');
  const [startTime, setStartTime] = useState('08:00');
  const [endDate, setEndDate] = useState(existingSchedule?.endDate || '');
  const [endTime, setEndTime] = useState('17:00');
  const [durationHours, setDurationHours] = useState('2');
  const [reason, setReason] = useState(existingSchedule?.reason || '');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen || !room) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    let finalStartDate, finalEndDate;

    if (durationType === 'hours') {
      // Quick fix - calculate based on hours
      if (!startDate || !startTime || !durationHours) {
        setError('Please fill in all fields for quick fix.');
        return;
      }

      const hours = parseInt(durationHours);
      if (hours < 1 || hours > 24) {
        setError('Duration must be between 1 and 24 hours.');
        return;
      }

      // Use the date string directly (YYYY-MM-DD format from date input)
      // Do NOT convert to Date object to avoid timezone issues
      finalStartDate = startDate;
      finalEndDate = startDate; // Same day for quick fixes
    } else {
      // Multi-day maintenance
      if (!startDate || !endDate) {
        setError('Please select both start and end dates.');
        return;
      }

      if (startDate > endDate) {
        setError('End date must be after start date.');
        return;
      }

      // Use date strings directly (YYYY-MM-DD format)
      finalStartDate = startDate;
      finalEndDate = endDate;
    }

    if (!reason.trim()) {
      setError('Please provide a reason for maintenance.');
      return;
    }

    setIsLoading(true);

    try {
      console.log('[ScheduleMaintenanceModal] Current user:', profile);
      console.log('[ScheduleMaintenanceModal] Original dates from form - start:', startDate, 'end:', endDate);
      
      const scheduleData = {
        startDate: finalStartDate,
        endDate: finalEndDate,
        reason: reason.trim(),
        durationType, // 'hours' or 'days'
        ...(durationType === 'hours' && {
          startTime,
          durationHours: parseInt(durationHours),
        }),
      };
      
      console.log('[ScheduleMaintenanceModal] Schedule data to be saved:', scheduleData);

      if (existingSchedule) {
        // Update existing schedule
        console.log('[ScheduleMaintenanceModal] Updating schedule:', existingSchedule.id);
        await updateMaintenanceSchedule(existingSchedule.id, scheduleData);
      } else {
        // Create new schedule
        console.log('[ScheduleMaintenanceModal] Creating new schedule for room:', room);
        const newSchedule = await scheduleRoomMaintenance({
          roomId: room.id,
          roomDocId: room.docId || room.id, // Pass the Firestore document ID
          roomName: room.name || room.id,
          buildingId: room.buildingId,
          buildingName: buildingName || '',
          ...scheduleData,
          scheduledByUid: profile?.uid || null,
          scheduledByName: profile?.displayName || profile?.email || 'GSD',
          reportId, // Link to the maintenance report if scheduling from a report
        });
        console.log('[ScheduleMaintenanceModal] Schedule created successfully:', newSchedule);
      }

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      console.error('Error scheduling maintenance:', err);
      setError(err.message || 'Failed to schedule maintenance.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setDurationType('days');
      setStartDate('');
      setStartTime('08:00');
      setEndDate('');
      setEndTime('17:00');
      setDurationHours('2');
      setReason('');
      setError('');
      onClose();
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div 
          className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
          onClick={handleClose}
        />
        
        <div 
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
          style={{ maxHeight: '90vh' }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-[#7A0808]/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#7A0808]/10">
                <Calendar size={20} className="text-[#7A0808]" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-[#2B3235]">
                  {existingSchedule ? 'Update Maintenance Schedule' : 'Schedule Maintenance'}
                </h2>
                <p className="text-xs text-gray-500">
                  {room.name} - {buildingName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="px-6 py-5 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs font-semibold text-red-600">{error}</p>
              </div>
            )}

            {/* Duration Type Selection */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-gray-700 mb-3">
                Maintenance Duration Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDurationType('hours')}
                  disabled={isLoading}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    durationType === 'hours'
                      ? 'border-[#7A0808] bg-[#7A0808]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-bold text-sm mb-1 text-[#2B3235]">⚡ Quick Fix</div>
                  <div className="text-[10px] text-gray-500">Can be fixed in hours (same day)</div>
                </button>
                <button
                  type="button"
                  onClick={() => setDurationType('days')}
                  disabled={isLoading}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    durationType === 'days'
                      ? 'border-[#7A0808] bg-[#7A0808]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-bold text-sm mb-1 text-[#2B3235]">📅 Multi-Day</div>
                  <div className="text-[10px] text-gray-500">Requires multiple days</div>
                </button>
              </div>
            </div>

            {/* Quick Fix (Hours) Form */}
            {durationType === 'hours' && (
              <div className="space-y-4 mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    Maintenance Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker value={startDate} onChange={setStartDate} required readOnly={isLoading} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    Start Time <span className="text-red-500">*</span>
                  </label>
                  <TimePicker value={startTime} onChange={setStartTime} required disabled={isLoading} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    Estimated Duration (hours) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    required
                    disabled={isLoading}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7A0808]/20 disabled:opacity-50"
                  >
                    <option value="1">1 hour</option>
                    <option value="2">2 hours</option>
                    <option value="3">3 hours</option>
                    <option value="4">4 hours</option>
                    <option value="6">6 hours</option>
                    <option value="8">8 hours (full work day)</option>
                  </select>
                  {startDate && startTime && durationHours && (
                    <p className="text-[10px] text-blue-600 mt-1.5 font-semibold">
                      ⏱️ Estimated completion: {new Date(new Date(`${startDate}T${startTime}`).getTime() + parseInt(durationHours) * 60 * 60 * 1000).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Multi-Day Form */}
            {durationType === 'days' && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  Maintenance Period <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
                      Start Date
                    </label>
                    <DatePicker value={startDate} onChange={setStartDate} required readOnly={isLoading} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
                      End Date
                    </label>
                    <DatePicker value={endDate} onChange={setEndDate} required readOnly={isLoading} />
                  </div>
                </div>
                {startDate && endDate && startDate !== endDate && (
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    📅 Duration: {Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1} days
                  </p>
                )}
              </div>
            )}

            {/* Reason */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 mb-2">
                Reason for Maintenance <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe the maintenance work to be performed..."
                required
                disabled={isLoading}
                rows={4}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7A0808]/20 resize-none disabled:opacity-50"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                {reason.length}/500 characters
              </p>
            </div>

            {/* Info */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start gap-2">
                <FileText size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-[11px] text-blue-700">
                  <p className="font-bold mb-1">Maintenance Schedule Information</p>
                  <ul className="list-disc list-inside space-y-0.5 text-blue-600">
                    <li>Room will be marked as "Under Maintenance" during this period</li>
                    <li>Users will see the maintenance schedule when viewing the room</li>
                    <li>Room will be unavailable for reservations during maintenance</li>
                    {durationType === 'hours' && <li className="font-bold text-blue-700">⚡ Quick fix will be completed on the same day</li>}
                    <li>You can update or complete the schedule anytime from the maintenance dashboard</li>
                  </ul>
                </div>
              </div>
            </div>
          </form>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm border-2 border-gray-200 text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm bg-[#7A0808] text-white hover:bg-[#600000] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Calendar size={16} />
              {existingSchedule ? 'Update Schedule' : 'Schedule Maintenance'}
            </button>
          </div>
        </div>
      </div>

      <LoadingModal 
        isOpen={isLoading} 
        message={existingSchedule ? 'Updating maintenance schedule...' : 'Scheduling maintenance...'} 
      />
    </>
  );
}
