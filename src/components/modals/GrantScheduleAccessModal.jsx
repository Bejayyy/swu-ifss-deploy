import React, { useState, useEffect, useRef } from 'react';
import { X, Send, ChevronDown, Search, Trash2 } from 'lucide-react';
import { subscribeColleges } from '../../services/collegeService';
import { grantFirstCollegeAccess } from '../../services/scheduleAccessService';
import { useAuth } from '../../context/AuthContext';

export default function GrantScheduleAccessModal({
  isOpen,
  onClose,
  schoolYearId,
  semester,
  initialCollegeCodes = [],
  onReset,
  onSuccess,
}) {
  const { profile } = useAuth();
  const [colleges, setColleges] = useState([]);
  const [selectedCollegeCodes, setSelectedCollegeCodes] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(true); // Default open for ease of use
  const [collegeSearch, setCollegeSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedCollegeCodes(initialCollegeCodes || []);
    }
  }, [isOpen, initialCollegeCodes]);

  useEffect(() => {
    if (!isOpen) return undefined;
    
    return subscribeColleges(
      (collegeList) => {
        setColleges(collegeList);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading colleges:', err);
        setError('Failed to load colleges.');
        setLoading(false);
      }
    );
  }, [isOpen]);

  const filteredColleges = colleges.filter((c) => {
    if (!collegeSearch.trim()) return true;
    const q = collegeSearch.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.code && c.code.toLowerCase().includes(q))
    );
  });

  const isAllSelected =
    colleges.length > 0 && selectedCollegeCodes.length === colleges.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedCollegeCodes([]);
    } else {
      setSelectedCollegeCodes(colleges.map((c) => c.code));
    }
  };

  const toggleCollegeCode = (code) => {
    setSelectedCollegeCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const getDropdownLabel = () => {
    if (selectedCollegeCodes.length === 0) return 'Choose college(s)...';
    if (selectedCollegeCodes.length === colleges.length && colleges.length > 0) {
      return `All Colleges Selected (${colleges.length})`;
    }
    if (selectedCollegeCodes.length === 1) {
      const c = colleges.find((x) => x.code === selectedCollegeCodes[0]);
      return c ? `${c.name} (${c.code})` : selectedCollegeCodes[0];
    }
    return `${selectedCollegeCodes.length} Colleges Selected (${selectedCollegeCodes.join(', ')})`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (selectedCollegeCodes.length === 0) {
      setError('Please select at least one college.');
      return;
    }

    if (!schoolYearId || !semester) {
      setError('School year and semester are required.');
      return;
    }

    const selectedColleges = colleges.filter((c) =>
      selectedCollegeCodes.includes(c.code)
    );

    if (selectedColleges.length === 0) {
      setError('Invalid college selection.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await grantFirstCollegeAccess({
        schoolYearId,
        schoolYearLabel: `SY ${schoolYearId}`,
        semester,
        collegeCodes: selectedCollegeCodes,
        selectedColleges,
        grantedBy: profile?.uid,
      });
      
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error granting access:', err);
      setError(err.message || 'Failed to grant access.');
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col relative overflow-hidden">
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
          {/* Fixed Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0 bg-white">
            <div>
              <h3 className="font-black text-lg" style={{ color: '#2B3235' }}>
                {initialCollegeCodes.length > 0 ? 'Edit Granted College Access' : 'Grant College Access'}
              </h3>
              <p className="text-xs mt-0.5 text-gray-500 font-medium">
                {initialCollegeCodes.length > 0
                  ? 'Add or remove colleges with scheduling access'
                  : 'Select college(s) that can create schedules first'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-700"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Modal Content */}
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-700">{error}</p>
              </div>
            )}

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5">
              <p className="text-xs font-bold text-blue-900 mb-1">
                📋 School Year {schoolYearId} · Semester {semester}
              </p>
              <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
                The selected college(s) will be granted immediate access to create course schedules. You can select multiple colleges at once.
              </p>
            </div>

            {/* Selected Colleges Preview Pills */}
            {selectedCollegeCodes.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-black text-gray-500 tracking-wider uppercase">
                  <span>Selected Colleges ({selectedCollegeCodes.length})</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCollegeCodes([])}
                    className="text-[#800000] hover:underline font-bold"
                  >
                    Clear All
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 border border-gray-200 rounded-xl max-h-28 overflow-y-auto">
                  {colleges
                    .filter((c) => selectedCollegeCodes.includes(c.code))
                    .map((c) => (
                      <span
                        key={c.code}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-[#800000] border border-red-100 text-xs font-bold shadow-2xs"
                      >
                        <span>{c.name} ({c.code})</span>
                        <button
                          type="button"
                          onClick={() => toggleCollegeCode(c.code)}
                          className="text-[#800000] hover:text-red-900 p-0.5 rounded-full hover:bg-red-100 transition-colors ml-0.5"
                          title="Remove college"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Multi-Select College Dropdown with Checkboxes */}
            <div className="space-y-2" ref={dropdownRef}>
              <label className="block text-xs font-bold" style={{ color: '#2B3235' }}>
                Select Granted College(s) <span className="text-red-500">*</span>
              </label>

              {loading ? (
                <div className="input-field w-full text-gray-400 py-2.5">Loading colleges...</div>
              ) : (
                <div className="border border-gray-200 rounded-xl bg-gray-50/50 p-2.5 space-y-2 shadow-2xs">
                  {/* Trigger / Summary Bar */}
                  <div
                    onClick={() => !submitting && setIsDropdownOpen((prev) => !prev)}
                    className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 transition-all"
                  >
                    <span
                      className={`text-xs truncate ${
                        selectedCollegeCodes.length > 0 ? 'text-gray-900 font-bold' : 'text-gray-400 font-medium'
                      }`}
                    >
                      {getDropdownLabel()}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180 text-[#800000]' : ''}`}
                    />
                  </div>

                  {/* Dropdown Options List */}
                  {isDropdownOpen && (
                    <div className="bg-white border border-gray-200 rounded-xl p-2.5 space-y-2 animate-in fade-in duration-150 shadow-sm">
                      {/* Search & Select All Bar */}
                      <div className="space-y-2 pb-2 border-b border-gray-100">
                        <div className="relative">
                          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={collegeSearch}
                            onChange={(e) => setCollegeSearch(e.target.value)}
                            placeholder="Filter colleges by code or name..."
                            className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:border-[#800000] focus:bg-white"
                          />
                        </div>

                        <div
                          onClick={toggleSelectAll}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 cursor-pointer text-xs font-bold text-gray-800 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={() => {}}
                            className="rounded border-gray-300 text-[#800000] focus:ring-[#800000] cursor-pointer"
                          />
                          <span>Select All Colleges ({colleges.length})</span>
                        </div>
                      </div>

                      {/* Colleges Scrollable List */}
                      <div className="max-h-52 overflow-y-auto space-y-1 pr-1 pb-1">
                        {filteredColleges.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-400 font-medium">No colleges match filter</div>
                        ) : (
                          filteredColleges.map((college) => {
                            const isSelected = selectedCollegeCodes.includes(college.code);
                            return (
                              <div
                                key={college.code}
                                onClick={() => toggleCollegeCode(college.code)}
                                className={`flex items-center justify-between px-2.5 py-2.5 rounded-lg cursor-pointer text-xs transition-all ${
                                  isSelected
                                    ? 'bg-red-50 text-[#800000] font-bold border border-red-100/80 shadow-2xs'
                                    : 'text-gray-700 hover:bg-gray-50 font-medium'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="rounded border-gray-300 text-[#800000] focus:ring-[#800000] cursor-pointer flex-shrink-0"
                                  />
                                  <span className="truncate">{college.name}</span>
                                </div>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase flex-shrink-0 border border-gray-200">
                                  {college.code}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-[10px] text-gray-500 mt-1 font-medium">
                Deans of the selected colleges will receive immediate access to create schedules.
              </p>
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="flex items-center justify-between p-5 border-t border-gray-100 flex-shrink-0 bg-white">
            {initialCollegeCodes.length > 0 && onReset ? (
              <button
                type="button"
                onClick={onReset}
                disabled={submitting}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors flex items-center gap-1.5"
                title="Reset access control to start fresh"
              >
                <Trash2 size={14} /> Reset Access
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || loading || selectedCollegeCodes.length === 0}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#800000] text-white hover:bg-[#600000] transition-colors disabled:opacity-50 flex items-center gap-2 shadow-2xs"
              >
                <Send size={15} />
                {submitting
                  ? 'Saving Access...'
                  : initialCollegeCodes.length > 0
                    ? `Update Access (${selectedCollegeCodes.length})`
                    : `Grant Access (${selectedCollegeCodes.length})`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
