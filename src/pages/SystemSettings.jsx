import React, { useEffect, useMemo, useState } from 'react';
import {
  Sliders, Clock, FileUp, Download, Trash2, Check,
  FileText, ChevronRight, Plus, BookOpen, X, Eye, ChevronDown
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../hooks/useModal';
import { ModalRenderer } from '../components/modals/ModalProvider';
import { useAcademicCalendar } from '../hooks/useAcademicCalendar';
import {
  buildSchoolYearId,
  saveSchoolYearConfig,
  saveExamPeriodRange,
  subscribeSchoolCalendarPdf,
  saveSchoolCalendarPdf,
  deleteSchoolCalendarPdf,
} from '../services/academicCalendarService';
import {
  formatExamRange,
  normalizeExamPeriods,
} from '../utils/academicCalendarUtils';

export default function SystemSettings() {
  const { profile } = useAuth();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();
  const [activeTab, setActiveTab] = useState('schoolYear'); // 'schoolYear' | 'examPeriods' | 'calendarPdf'

  // Academic Calendar Hook
  const {
    schoolYears,
    activeSchoolYearId,
    setActiveSchoolYearId,
    calendarData,
  } = useAcademicCalendar();

  // School Year & Semester Form state
  const [syForm, setSyForm] = useState({
    label: '',
    semester1Start: '',
    semester1End: '',
    semester2Start: '',
    semester2End: '',
  });
  const [isSavingSy, setIsSavingSy] = useState(false);
  const [isCreatingSy, setIsCreatingSy] = useState(false);
  const [newSyLabel, setNewSyLabel] = useState('');

  // Exam Period Range state
  const [examSemTab, setExamSemTab] = useState('1'); // '1' | '2'
  const [examEdit, setExamEdit] = useState(null); // { periodKey, level }
  const [examDraft, setExamDraft] = useState({ start: '', end: '' });
  const [isSavingExam, setIsSavingExam] = useState(false);

  // School Calendar PDF state
  const [calendarPdfData, setCalendarPdfData] = useState(null);
  const [pdfUploading, setPdfUploading] = useState(false);

  const { config } = calendarData;
  const examPeriods = useMemo(() => normalizeExamPeriods(config?.examPeriods), [config?.examPeriods]);

  // Load School Year config into form
  useEffect(() => {
    if (config) {
      setSyForm({
        label: config.label || '',
        semester1Start: config.semester1Start || '',
        semester1End: config.semester1End || '',
        semester2Start: config.semester2Start || '',
        semester2End: config.semester2End || '',
      });
    }
  }, [config]);

  // Subscribe to PDF School Calendar
  useEffect(() => {
    const unsub = subscribeSchoolCalendarPdf(
      (data) => setCalendarPdfData(data),
      (err) => console.error('Error loading PDF calendar:', err)
    );
    return () => unsub();
  }, []);

  // Save SY & Semester Config
  const handleSaveSyConfig = async () => {
    if (!syForm.label.trim()) {
      showNotification({
        type: 'warning',
        title: 'Missing Label',
        message: 'Please provide a School Year label (e.g. 2026-2027).',
      });
      return;
    }

    setIsSavingSy(true);
    try {
      const syId = activeSchoolYearId || buildSchoolYearId(syForm.label);
      await saveSchoolYearConfig(syId, {
        label: syForm.label.trim(),
        semester1Start: syForm.semester1Start,
        semester1End: syForm.semester1End,
        semester2Start: syForm.semester2Start,
        semester2End: syForm.semester2End,
      });

      showNotification({
        type: 'success',
        title: 'Configuration Saved',
        message: `School Year ${syForm.label} and semester settings updated successfully.`,
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Failed to save configuration.',
      });
    } finally {
      setIsSavingSy(false);
    }
  };

  // Create New School Year
  const handleCreateNewSy = async () => {
    if (!newSyLabel.trim()) return;
    try {
      const syId = buildSchoolYearId(newSyLabel.trim());
      await saveSchoolYearConfig(syId, {
        label: newSyLabel.trim(),
        semester1Start: '',
        semester1End: '',
        semester2Start: '',
        semester2End: '',
      });
      setActiveSchoolYearId(syId);
      setNewSyLabel('');
      setIsCreatingSy(false);
      showNotification({
        type: 'success',
        title: 'School Year Created',
        message: `Created and selected SY ${newSyLabel.trim()}.`,
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Creation Failed',
        message: err.message || 'Failed to create school year.',
      });
    }
  };

  // Save Exam Period Date Range
  const handleSaveExamRangeFor = async (periodKey, level) => {
    if (!activeSchoolYearId || !examDraft.start || !examDraft.end) {
      showNotification({
        type: 'warning',
        title: 'Missing Dates',
        message: 'Please select both start and end dates.',
      });
      return;
    }
    setIsSavingExam(true);
    try {
      await saveExamPeriodRange(
        activeSchoolYearId,
        examSemTab,
        periodKey,
        level,
        examDraft.start,
        examDraft.end
      );
      setExamEdit(null);
      setExamDraft({ start: '', end: '' });
      showNotification({
        type: 'success',
        title: 'Exam Range Saved',
        message: 'Exam period date range updated successfully.',
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Failed to save exam range.',
      });
    } finally {
      setIsSavingExam(false);
    }
  };

  // Upload PDF File
  const handlePdfFileUpload = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showNotification({
        type: 'warning',
        title: 'Invalid File Type',
        message: 'Please select a valid PDF file (.pdf).',
      });
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      showNotification({
        type: 'warning',
        title: 'File Too Large',
        message: 'PDF file size must be under 8MB.',
      });
      return;
    }

    setPdfUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result;
        await saveSchoolCalendarPdf({
          pdfUrl: dataUrl,
          pdfFileName: file.name,
          uploadedBy: profile?.displayName || profile?.name || profile?.email || 'Registrar',
        });
        showNotification({
          type: 'success',
          title: 'PDF Calendar Uploaded',
          message: 'Official School Calendar PDF has been uploaded and published.',
        });
      } catch (err) {
        showNotification({
          type: 'error',
          title: 'Upload Failed',
          message: err.message || 'Failed to save PDF calendar.',
        });
      } finally {
        setPdfUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Remove PDF
  const handleRemovePdf = async () => {
    const confirmed = await showConfirm({
      title: 'Remove School Calendar PDF?',
      message: 'This will delete the uploaded official PDF calendar document for all users. You can upload a new copy anytime.',
      confirmText: 'Remove PDF',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteSchoolCalendarPdf();
      showNotification({
        type: 'success',
        title: 'PDF Removed',
        message: 'Official School Calendar PDF has been removed.',
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Delete Failed',
        message: err.message || 'Failed to remove PDF calendar.',
      });
    }
  };

  return (
    <Layout title="System Settings" subtitle="Configure school year, active semester, exam periods, and official school calendar">
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6 items-start">
        {/* Left Column: Navigation & School Year Selector */}
        <div className="space-y-4 sticky top-20">
          {/* Vertical Navigation Menu */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-3 shadow-2xs space-y-1">
            <p className="px-3 pt-2 pb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">
              System Configuration
            </p>

            <button
              type="button"
              onClick={() => setActiveTab('schoolYear')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'schoolYear'
                  ? 'bg-[#800000] text-white shadow-2xs'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Sliders size={16} />
                <span>School Year Configuration</span>
              </div>
              <ChevronRight size={14} className={activeTab === 'schoolYear' ? 'opacity-100' : 'opacity-40'} />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('examPeriods')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'examPeriods'
                  ? 'bg-[#800000] text-white shadow-2xs'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Clock size={16} />
                <span>Exam Period Range</span>
              </div>
              <ChevronRight size={14} className={activeTab === 'examPeriods' ? 'opacity-100' : 'opacity-40'} />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('calendarPdf')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'calendarPdf'
                  ? 'bg-[#800000] text-white shadow-2xs'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookOpen size={16} />
                <span>School Calendar (PDF)</span>
              </div>
              <ChevronRight size={14} className={activeTab === 'calendarPdf' ? 'opacity-100' : 'opacity-40'} />
            </button>
          </div>

          {/* Active School Year Selector Card */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400">
                Select School Year
              </label>
              {!isCreatingSy && (
                <button
                  type="button"
                  onClick={() => setIsCreatingSy(true)}
                  className="text-[11px] font-bold text-[#800000] hover:underline flex items-center gap-0.5"
                >
                  <Plus size={13} /> Add
                </button>
              )}
            </div>

            {isCreatingSy ? (
              <div className="p-3 bg-red-50/50 border border-red-200 rounded-xl space-y-2">
                <input
                  type="text"
                  value={newSyLabel}
                  onChange={(e) => setNewSyLabel(e.target.value)}
                  placeholder="e.g. 2026-2027"
                  className="input-field w-full text-xs font-bold"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsCreatingSy(false)}
                    className="px-2.5 py-1 text-[11px] font-bold text-gray-500 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateNewSy}
                    className="px-3 py-1 bg-[#800000] text-white rounded-lg text-[11px] font-bold hover:bg-[#600000]"
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={activeSchoolYearId || ''}
                  onChange={(e) => setActiveSchoolYearId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-[#800000] rounded-xl text-xs font-extrabold text-[#800000] outline-none shadow-2xs appearance-none pr-9 cursor-pointer focus:ring-2 focus:ring-red-100"
                >
                  {schoolYears.map((sy) => (
                    <option key={sy.id} value={sy.id} className="font-bold text-gray-900">
                      {sy.displayLabel || `SY ${sy.label}`}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#800000] pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        {/* Tab Contents */}
        <div className="space-y-6">
          {/* TAB 1: School Year & Semester Configuration */}
          {activeTab === 'schoolYear' && (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-2xs space-y-6">
              <div className="pb-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <Sliders size={18} className="text-[#800000]" />
                    School Year & Semester Configuration
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Manage active school year, semester terms, and operational date ranges.
                  </p>
                </div>
              </div>

              {/* Semester Dates Config */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                {/* Semester 1 */}
                <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3">
                  <h4 className="font-bold text-xs text-gray-900 flex items-center justify-between">
                    <span>Semester 1</span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      Term 1
                    </span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={syForm.semester1Start}
                        onChange={(e) => setSyForm({ ...syForm, semester1Start: e.target.value })}
                        className="input-field w-full text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 mb-1">End Date</label>
                      <input
                        type="date"
                        value={syForm.semester1End}
                        onChange={(e) => setSyForm({ ...syForm, semester1End: e.target.value })}
                        className="input-field w-full text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Semester 2 */}
                <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3">
                  <h4 className="font-bold text-xs text-gray-900 flex items-center justify-between">
                    <span>Semester 2</span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                      Term 2
                    </span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={syForm.semester2Start}
                        onChange={(e) => setSyForm({ ...syForm, semester2Start: e.target.value })}
                        className="input-field w-full text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 mb-1">End Date</label>
                      <input
                        type="date"
                        value={syForm.semester2End}
                        onChange={(e) => setSyForm({ ...syForm, semester2End: e.target.value })}
                        className="input-field w-full text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Save Button */}
              <div className="pt-3 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveSyConfig}
                  disabled={isSavingSy}
                  className="px-6 py-2.5 rounded-xl bg-[#800000] text-white font-bold text-xs hover:bg-[#600000] shadow-2xs transition-all flex items-center gap-2"
                >
                  {isSavingSy ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Exam Period Range Configuration */}
          {activeTab === 'examPeriods' && (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-2xs space-y-6">
              <div className="pb-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <Clock size={18} className="text-[#800000]" />
                    Exam Period Range Configuration
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Set date ranges for Freshmen (1st Year) and Upperclassmen across P1, P2, P3, and RBE exam periods.
                  </p>
                </div>

                {/* Semester Switcher */}
                <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                  {['1', '2'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setExamSemTab(t)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        examSemTab === t ? 'bg-[#800000] text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Semester {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4 Exam Period Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { key: 'p1', label: 'P1 Period', bg: '#FFF5F5', border: '#F3CACA' },
                  { key: 'p2', label: 'P2 Period', bg: '#FFFAF0', border: '#F5D5A3' },
                  { key: 'p3', label: 'P3 Period', bg: '#FBF5FF', border: '#E9D8FD' },
                  { key: 'rbe', label: 'RBE Period', bg: '#F0FFF4', border: '#B7E4C7' },
                ].map((period) => (
                  <div
                    key={period.key}
                    className="p-4 border rounded-2xl space-y-3"
                    style={{ background: period.bg, borderColor: period.border }}
                  >
                    <h4 className="font-black text-xs text-gray-900 flex items-center gap-1.5">
                      <FileText size={14} className="text-[#800000]" />
                      {period.label}
                    </h4>

                    <div className="space-y-2.5">
                      {[
                        { level: 'fr', label: 'Freshmen (1st Year)' },
                        { level: 'up', label: 'Upperclassmen' },
                      ].map(({ level, label }) => {
                        const data = examPeriods[examSemTab]?.[period.key]?.[level];
                        const rangeText = formatExamRange(data);
                        const isEditing =
                          examEdit?.periodKey === period.key &&
                          examEdit?.level === level &&
                          examEdit?.semester === examSemTab;

                        return (
                          <div
                            key={level}
                            className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-2xs space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-extrabold text-[#800000]">{label}</span>
                            </div>

                            {rangeText && !isEditing && (
                              <p className="text-[11px] font-bold text-blue-900 bg-blue-50 px-2 py-1 rounded-md">
                                {rangeText}
                              </p>
                            )}

                            {isEditing ? (
                              <div className="space-y-2 pt-2 border-t border-gray-100">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[9px] font-bold text-gray-500 mb-0.5">Start Date</label>
                                    <input
                                      type="date"
                                      value={examDraft.start}
                                      onChange={(e) => setExamDraft({ ...examDraft, start: e.target.value })}
                                      className="input-field w-full text-xs font-semibold py-1 px-2"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-bold text-gray-500 mb-0.5">End Date</label>
                                    <input
                                      type="date"
                                      value={examDraft.end}
                                      onChange={(e) => setExamDraft({ ...examDraft, end: e.target.value })}
                                      className="input-field w-full text-xs font-semibold py-1 px-2"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-1.5 justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setExamEdit(null)}
                                    className="px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveExamRangeFor(period.key, level)}
                                    disabled={isSavingExam}
                                    className="px-3 py-1 bg-[#800000] text-white text-[11px] font-bold rounded-lg hover:bg-[#600000] shadow-2xs"
                                  >
                                    Save Range
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setExamEdit({ semester: examSemTab, periodKey: period.key, level });
                                  setExamDraft({ start: data?.start || '', end: data?.end || '' });
                                }}
                                className="w-full py-1.5 border border-gray-200 hover:border-[#800000] hover:bg-red-50/50 rounded-lg text-[11px] font-bold text-gray-700 hover:text-[#800000] transition-all flex items-center justify-center gap-1"
                              >
                                <Plus size={12} />
                                {rangeText ? 'Edit Dates' : 'Set Dates'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Official School Calendar (PDF Upload & Viewer) */}
          {activeTab === 'calendarPdf' && (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-2xs space-y-6">
              <div className="pb-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <BookOpen size={18} className="text-[#800000]" />
                    Official School Calendar (PDF Copy)
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Upload an official PDF copy of the school calendar for all students, deans, and staff to view.
                  </p>
                </div>
              </div>

              {/* Upload Zone */}
              <div className="p-6 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50 hover:bg-gray-50 transition-colors text-center">
                <input
                  type="file"
                  id="pdf-upload-input"
                  accept="application/pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handlePdfFileUpload(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                <label htmlFor="pdf-upload-input" className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-[#800000]">
                    <FileUp size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">
                      {pdfUploading ? 'Uploading PDF...' : 'Click or Drag PDF file here to upload'}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Supports PDF files up to 8MB
                    </p>
                  </div>
                </label>
              </div>

              {/* PDF Document Status Banner */}
              {calendarPdfData?.pdfUrl && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center flex-shrink-0">
                      <BookOpen size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950 truncate max-w-sm">
                        {calendarPdfData.pdfFileName || 'School_Calendar.pdf'}
                      </h4>
                      <p className="text-[10px] font-semibold text-emerald-700 mt-0.5">
                        Uploaded by {calendarPdfData.uploadedBy || 'Registrar'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={calendarPdfData.pdfUrl}
                      download={calendarPdfData.pdfFileName || 'School_Calendar.pdf'}
                      className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                      <Download size={13} /> Download PDF
                    </a>
                    <button
                      type="button"
                      onClick={handleRemovePdf}
                      className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                </div>
              )}

              {/* Embedded PDF Viewer */}
              {calendarPdfData?.pdfUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                      <Eye size={14} className="text-[#800000]" /> Live PDF Document Preview
                    </span>
                  </div>

                  <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-900 shadow-sm">
                    <iframe
                      src={calendarPdfData.pdfUrl}
                      title="Official School Calendar PDF"
                      className="w-full h-[650px] border-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-2xl">
                  <p className="text-xs font-bold text-gray-500">
                    No official PDF school calendar has been uploaded yet. Upload a copy above to publish it for users.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
