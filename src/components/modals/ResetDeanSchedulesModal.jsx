import React, { useState, useEffect } from 'react';
import { X, Trash2, AlertTriangle, Users } from 'lucide-react';
import { subscribeDeanSections } from '../../services/plotScheduleService';
import { useModal } from '../../hooks/useModal';

/**
 * ResetDeanSchedulesModal - Modern redesigned UI
 * 
 * Allows registrar to select one or more deans and delete their plotted schedules for a semester
 */
export default function ResetDeanSchedulesModal({
  isOpen,
  onClose,
  onConfirm,
  deanUsers = [],
  semester = '1', // Now receives just the number (e.g., "1" or "2")
  schoolYear = '2024-2025',
}) {
  const { showNotification } = useModal();
  // Format semester for display
  const semesterDisplay = `Semester ${semester}`;
  const [selectedDeans, setSelectedDeans] = useState(new Set());
  const [deanSectionsMap, setDeanSectionsMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Subscribe to each dean's sections
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribers = [];
    const newMap = {};

    deanUsers.forEach((dean) => {
      const unsubscribe = subscribeDeanSections(
        dean.uid,
        (sections) => {
          newMap[dean.uid] = sections;
          setDeanSectionsMap({ ...newMap });
        },
        (err) => {
          console.error(`Error loading sections for ${dean.email}:`, err);
        }
      );
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [isOpen, deanUsers]);

  const handleToggleDean = (deanUid) => {
    const newSelected = new Set(selectedDeans);
    if (newSelected.has(deanUid)) {
      newSelected.delete(deanUid);
    } else {
      newSelected.add(deanUid);
    }
    setSelectedDeans(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedDeans.size === deanUsers.length) {
      setSelectedDeans(new Set());
    } else {
      setSelectedDeans(new Set(deanUsers.map((d) => d.uid)));
    }
  };

  const getTotalScheduleCount = (deanUid) => {
    const sections = deanSectionsMap[deanUid] || [];
    return sections.reduce((total, section) => total + (section.scheduleCount || 0), 0);
  };

  const getSelectedDeansInfo = () => {
    const selectedDeanObjs = deanUsers.filter((d) => selectedDeans.has(d.uid));
    const totalSchedules = selectedDeanObjs.reduce((sum, d) => sum + getTotalScheduleCount(d.uid), 0);
    const totalSections = selectedDeanObjs.reduce((sum, d) => sum + (deanSectionsMap[d.uid]?.length || 0), 0);
    return { selectedDeanObjs, totalSchedules, totalSections };
  };

  const handleReset = async () => {
    if (selectedDeans.size === 0) return;

    setLoading(true);
    try {
      const deanUids = Array.from(selectedDeans);
      await onConfirm(deanUids, semester, schoolYear);
      setShowConfirmation(false);
      setSelectedDeans(new Set());
      onClose();
    } catch (err) {
      console.error('Reset failed:', err);
      showNotification({
        type: 'error',
        title: 'Reset Failed',
        message: err.message || 'Failed to reset schedules.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const { selectedDeanObjs, totalSchedules, totalSections } = getSelectedDeansInfo();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Trash2 size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Reset Dean Schedules</h2>
              <p className="text-sm text-red-100 mt-0.5">Delete course schedules for selected deans</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X size={20} className="text-white" />
          </button>
        </div>

        {!showConfirmation ? (
          <>
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Warning Banner */}
              <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg p-4">
                <div className="flex gap-3">
                  <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-amber-900">Warning: Permanent Deletion</h3>
                    <p className="text-sm text-amber-800 mt-1">
                      This will permanently delete all course schedules for <span className="font-bold">{semesterDisplay} ({schoolYear})</span> from the selected deans. 
                      This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>

              {/* Select All */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDeans.size === deanUsers.length && deanUsers.length > 0}
                    onChange={handleSelectAll}
                    className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-2 focus:ring-red-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-bold text-gray-900">Select All Deans</span>
                    <span className="text-sm text-gray-600 ml-2">({deanUsers.length} total)</span>
                  </div>
                </label>
              </div>

              {/* Dean List */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Select Deans to Reset</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {deanUsers.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                        <Users size={28} className="text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-900">No Deans Found</p>
                      <p className="text-xs text-gray-500 mt-1">There are no deans in the system</p>
                    </div>
                  ) : (
                    deanUsers.map((dean) => {
                      const sections = deanSectionsMap[dean.uid] || [];
                      const scheduleCount = getTotalScheduleCount(dean.uid);
                      const isSelected = selectedDeans.has(dean.uid);

                      return (
                        <div
                          key={dean.uid}
                          onClick={() => handleToggleDean(dean.uid)}
                          className={`
                            group relative rounded-xl p-4 border-2 cursor-pointer transition-all duration-200
                            ${isSelected 
                              ? 'bg-red-50 border-red-400 shadow-sm' 
                              : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                            }
                          `}
                        >
                          <div className="flex items-start gap-4">
                            {/* Checkbox */}
                            <div className="flex items-center pt-0.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-2 focus:ring-red-500 cursor-pointer"
                              />
                            </div>

                            {/* Dean Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-bold text-gray-900 truncate">
                                    {dean.displayName || dean.name}
                                  </h4>
                                  <p className="text-xs text-gray-600 mt-0.5 truncate">{dean.email}</p>
                                  {dean.college && (
                                    <div className="mt-2">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        {dean.college}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Stats */}
                              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-200">
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${scheduleCount > 0 ? 'bg-green-500' : 'bg-gray-300'}`} />
                                  <span className="text-xs font-medium text-gray-700">
                                    {sections.length} {sections.length === 1 ? 'Section' : 'Sections'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${scheduleCount > 0 ? 'bg-blue-500' : 'bg-gray-300'}`} />
                                  <span className="text-xs font-medium text-gray-700">
                                    {scheduleCount} {scheduleCount === 1 ? 'Schedule' : 'Schedules'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Selection Summary */}
              {selectedDeans.size > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle size={20} className="text-red-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-red-900">
                        Ready to Delete: {selectedDeans.size} {selectedDeans.size === 1 ? 'Dean' : 'Deans'} Selected
                      </h4>
                      <p className="text-sm text-red-700 mt-1">
                        This will permanently delete <span className="font-bold">{totalSections}</span> section{totalSections !== 1 ? 's' : ''} containing{' '}
                        <span className="font-bold">{totalSchedules}</span> course schedule{totalSchedules !== 1 ? 's' : ''}.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-between gap-3 flex-shrink-0">
              <button 
                onClick={onClose} 
                className="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowConfirmation(true)}
                disabled={selectedDeans.size === 0 || loading}
                className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm"
              >
                <Trash2 size={16} />
                Delete {selectedDeans.size > 0 ? `(${selectedDeans.size})` : 'Schedules'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Confirmation Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                      <AlertTriangle size={24} className="text-red-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-black text-red-900">Confirm Permanent Deletion</h3>
                    <p className="text-sm text-red-800 mt-2 leading-relaxed">
                      You are about to <span className="font-bold">permanently delete</span> all course schedules for the following deans. 
                      This will remove <span className="font-bold">{totalSections} sections</span> and{' '}
                      <span className="font-bold">{totalSchedules} schedules</span>.
                    </p>

                    {/* Dean List */}
                    <div className="mt-5 space-y-3">
                      {selectedDeanObjs.map((dean) => (
                        <div key={dean.uid} className="bg-white rounded-lg p-4 border border-red-200">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-red-700">
                                {(dean.displayName || dean.name).charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-gray-900">{dean.displayName || dean.name}</h4>
                              <p className="text-xs text-gray-600 mt-0.5">{dean.email}</p>
                              {dean.college && (
                                <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                                  {dean.college}
                                </span>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                                <span>📚 {deanSectionsMap[dean.uid]?.length || 0} sections</span>
                                <span>•</span>
                                <span>📅 {getTotalScheduleCount(dean.uid)} schedules</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 bg-white rounded-lg p-4 border-2 border-red-300">
                      <p className="text-sm font-bold text-red-900 flex items-center gap-2">
                        <span>⚠️</span>
                        This action cannot be undone!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirmation Footer */}
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-between gap-3 flex-shrink-0">
              <button
                onClick={() => setShowConfirmation(false)}
                disabled={loading}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 transition-all"
              >
                ← Go Back
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                className="btn-delete px-5 py-2.5 font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#7A0808] border-t-transparent" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    Yes, Delete Permanently
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
