import React, { useEffect, useMemo, useState } from 'react';
import {
  Sliders, Clock, FileUp, Download, Trash2, Check,
  FileText, ChevronRight, ChevronLeft, Plus, BookOpen, X, Eye, ChevronDown, Award, Edit,
  FileSpreadsheet, Upload, Search, User, RefreshCw, AlertCircle, CheckCircle2, Building2
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
import {
  downloadBulkActivityTemplate,
  parseBulkActivitySpreadsheet,
} from '../utils/excelTemplate';
import { subscribeColleges } from '../services/collegeService';
import {
  subscribeActivities,
  addActivity,
  updateActivity,
  deleteActivity,
} from '../services/activitiesService';

export default function SystemSettings() {
  const { profile } = useAuth();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();
  const {
    schoolYears = [],
    activeSchoolYearId,
    setActiveSchoolYearId,
    calendarData,
  } = useAcademicCalendar();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState('schoolYear'); // 'schoolYear' | 'examPeriods' | 'calendarPdf' | 'activities'

  // School Year & Semester state
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

  // Activities State
  const [activities, setActivities] = useState([]);
  const [collegesList, setCollegesList] = useState([]);
  const [activityCategoryTab, setActivityCategoryTab] = useState('academic'); // 'academic' | 'non-academic'
  const [selectedCollegeFilter, setSelectedCollegeFilter] = useState('ALL'); // 'ALL' or college code/id
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8; // 8 items per page

  const [showActivityModal, setShowActivityModal] = useState(false);
  const [modalTab, setModalTab] = useState('individual'); // 'individual' | 'bulk'
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [isSavingActivity, setIsSavingActivity] = useState(false);
  const [collegeSearch, setCollegeSearch] = useState('');

  // Bulk Activities State
  const [bulkRows, setBulkRows] = useState([]);
  const [isParsingBulk, setIsParsingBulk] = useState(false);
  const [bulkParseError, setBulkParseError] = useState('');
  const [isDragOverBulk, setIsDragOverBulk] = useState(false);
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  const [activityForm, setActivityForm] = useState({
    name: '',
    objective: '',
    colleges: [],
  });

  // Filter colleges based on search query in modal
  const filteredCollegesList = useMemo(() => {
    if (!collegeSearch.trim()) return collegesList;
    const search = collegeSearch.toLowerCase().trim();
    return collegesList.filter(
      (c) =>
        (c.code || '').toLowerCase().includes(search) ||
        (c.name || '').toLowerCase().includes(search)
    );
  }, [collegesList, collegeSearch]);

  // Filter activities based on Category, College, and Search Query
  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      // 1. Category Filter (Academic / Non-Academic)
      if ((activity.category || 'academic') !== activityCategoryTab) {
        return false;
      }
      // 2. College Filter
      if (selectedCollegeFilter !== 'ALL') {
        if (!Array.isArray(activity.colleges) || !activity.colleges.includes(selectedCollegeFilter)) {
          return false;
        }
      }
      // 3. Search Query
      if (activitySearchQuery.trim()) {
        const q = activitySearchQuery.toLowerCase().trim();
        const matchesName = (activity.name || '').toLowerCase().includes(q);
        const matchesObj = (activity.objective || '').toLowerCase().includes(q);
        if (!matchesName && !matchesObj) return false;
      }
      return true;
    });
  }, [activities, activityCategoryTab, selectedCollegeFilter, activitySearchQuery]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredActivities.length / pageSize) || 1;
  const paginatedActivities = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredActivities.slice(startIdx, startIdx + pageSize);
  }, [filteredActivities, currentPage, pageSize]);


  // Subscribe to Colleges and Activities
  useEffect(() => {
    const unsubColleges = subscribeColleges(
      (data) => setCollegesList(data),
      (err) => console.error('Error loading colleges:', err)
    );
    const unsubActivities = subscribeActivities(
      (data) => setActivities(data),
      (err) => console.error('Error loading activities:', err)
    );
    return () => {
      unsubColleges();
      unsubActivities();
    };
  }, []);

  const handleOpenAddActivity = (category) => {
    setEditingActivityId(null);
    setModalTab('individual');
    setCollegeSearch('');
    setBulkRows([]);
    setBulkParseError('');
    setActivityForm({
      name: '',
      objective: '',
      colleges: [],
    });
    setActivityCategoryTab(category);
    setShowActivityModal(true);
  };

  const handleOpenEditActivity = (activity) => {
    setEditingActivityId(activity.id);
    setModalTab('individual');
    setCollegeSearch('');
    setBulkRows([]);
    setBulkParseError('');
    setActivityForm({
      name: activity.name || '',
      objective: activity.objective || '',
      colleges: activity.colleges || [],
    });
    setActivityCategoryTab(activity.category || 'academic');
    setShowActivityModal(true);
  };

  const handleBulkFileUpload = async (file) => {
    if (!file) return;
    setIsParsingBulk(true);
    setBulkParseError('');
    try {
      const result = await parseBulkActivitySpreadsheet(file, collegesList);
      setBulkRows(result.rows || []);
    } catch (err) {
      setBulkParseError(err.message || 'Failed to parse activity spreadsheet.');
    } finally {
      setIsParsingBulk(false);
    }
  };

  const handleImportBulkActivities = async () => {
    const validRows = bulkRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsSavingBulk(true);
    try {
      let importedCount = 0;
      for (const row of validRows) {
        const selectedCollegeObjects = collegesList.filter((c) =>
          row.colleges.includes(c.code || c.id)
        );
        const collegeNames = selectedCollegeObjects.map((c) => c.name || c.code);

        await addActivity({
          category: row.category || 'academic',
          name: row.name,
          objective: row.objective || '',
          colleges: row.colleges,
          collegeNames,
          createdBy: profile?.email || null,
        });
        importedCount++;
      }

      showNotification({
        type: 'success',
        title: 'Bulk Activities Imported',
        message: `Successfully imported ${importedCount} activity record(s).`,
      });

      setBulkRows([]);
      setShowActivityModal(false);
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Import Failed',
        message: err.message || 'Failed to import bulk activities.',
      });
    } finally {
      setIsSavingBulk(false);
    }
  };

  const handleSaveActivity = async () => {
    if (!activityForm.name.trim()) {
      showNotification({
        type: 'warning',
        title: 'Missing Name',
        message: `Please enter an ${activityCategoryTab === 'academic' ? 'Academic' : 'Activity'} Name.`,
      });
      return;
    }

    if (!activityForm.colleges.length) {
      showNotification({
        type: 'warning',
        title: 'Select Colleges',
        message: 'Please select at least one college for this activity.',
      });
      return;
    }

    setIsSavingActivity(true);
    try {
      const selectedCollegeObjects = collegesList.filter(c => activityForm.colleges.includes(c.code || c.id));
      const collegeNames = selectedCollegeObjects.map(c => c.name || c.code);

      if (editingActivityId) {
        await updateActivity(editingActivityId, {
          category: activityCategoryTab,
          name: activityForm.name.trim(),
          objective: activityForm.objective.trim(),
          colleges: activityForm.colleges,
          collegeNames,
        });
        showNotification({
          type: 'success',
          title: 'Activity Updated',
          message: `Updated "${activityForm.name.trim()}" successfully.`,
        });
      } else {
        await addActivity({
          category: activityCategoryTab,
          name: activityForm.name.trim(),
          objective: activityForm.objective.trim(),
          colleges: activityForm.colleges,
          collegeNames,
          createdBy: profile?.email || null,
        });
        showNotification({
          type: 'success',
          title: 'Activity Added',
          message: `Added "${activityForm.name.trim()}" successfully.`,
        });
      }
      setShowActivityModal(false);
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Failed to save activity.',
      });
    } finally {
      setIsSavingActivity(false);
    }
  };

  const handleDeleteActivity = async (activity) => {
    const confirmed = await showConfirm({
      title: `Delete ${activity.category === 'academic' ? 'Academic' : 'Non-Academic'} Activity?`,
      message: `Are you sure you want to delete "${activity.name}"? This action cannot be undone.`,
      confirmText: 'Delete Activity',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteActivity(activity.id);
      showNotification({
        type: 'success',
        title: 'Activity Deleted',
        message: `Deleted "${activity.name}".`,
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Delete Failed',
        message: err.message || 'Failed to delete activity.',
      });
    }
  };


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
          {/* Active School Year Selector Card (AT THE VERY TOP) */}
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

            <button
              type="button"
              onClick={() => setActiveTab('activities')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'activities'
                  ? 'bg-[#800000] text-white shadow-2xs'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Award size={16} />
                <span>Activities</span>
              </div>
              <ChevronRight size={14} className={activeTab === 'activities' ? 'opacity-100' : 'opacity-40'} />
            </button>
          </div>

          {/* College Filter Card (In List Style below System Configuration) */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-3 shadow-2xs space-y-1">
            <div className="px-3 pt-2 pb-2 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <Building2 size={13} className="text-[#800000]" /> College Filter
              </p>
              {selectedCollegeFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => { setSelectedCollegeFilter('ALL'); setCurrentPage(1); }}
                  className="text-[10px] font-bold text-[#800000] hover:underline"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="space-y-0.5 max-h-[300px] overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedCollegeFilter('ALL');
                  setCurrentPage(1);
                  if (activeTab !== 'activities') setActiveTab('activities');
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all ${
                  selectedCollegeFilter === 'ALL'
                    ? 'bg-red-50 text-[#800000] border border-red-200 font-extrabold'
                    : 'text-gray-700 hover:bg-gray-100 font-medium'
                }`}
              >
                <span>All Colleges</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  selectedCollegeFilter === 'ALL' ? 'bg-[#800000] text-white' : 'bg-gray-200 text-gray-700'
                }`}>
                  {activities.length}
                </span>
              </button>

              {collegesList.map((college) => {
                const colKey = college.code || college.id;
                const isSelected = selectedCollegeFilter === colKey;
                const count = activities.filter(a => Array.isArray(a.colleges) && a.colleges.includes(colKey)).length;

                return (
                  <button
                    key={college.id}
                    type="button"
                    onClick={() => {
                      setSelectedCollegeFilter(colKey);
                      setCurrentPage(1);
                      if (activeTab !== 'activities') setActiveTab('activities');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all ${
                      isSelected
                        ? 'bg-red-50 text-[#800000] border border-red-200 font-extrabold'
                        : 'text-gray-700 hover:bg-gray-100 font-medium'
                    }`}
                    title={college.name}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-bold text-xs">{college.code}</span>
                      <span className="text-[11px] text-gray-500 truncate">{college.name}</span>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${
                      isSelected ? 'bg-[#800000] text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
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

          {/* TAB 4: Activities (Academic & Non-Academic) */}
          {activeTab === 'activities' && (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-2xs space-y-5">
              {/* Header & Add Button */}
              <div className="pb-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <Award size={18} className="text-[#800000]" />
                    Activities Management
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Manage institutional academic and non-academic activities, objectives, and belonging colleges.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAddActivity(activityCategoryTab === 'all' ? 'academic' : activityCategoryTab)}
                  className="px-4 py-2 bg-[#800000] text-white rounded-xl text-xs font-bold hover:bg-[#600000] transition-colors flex items-center gap-2 shadow-2xs whitespace-nowrap"
                >
                  <Plus size={14} /> Add Activity
                </button>
              </div>

              {/* Category Sub-Tabs (2 parts: Academic & Non-Academic) & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-3">
                <div className="flex gap-2 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => { setActivityCategoryTab('academic'); setCurrentPage(1); }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      activityCategoryTab === 'academic'
                        ? 'bg-[#800000] text-white shadow-2xs font-black'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>🎓 Academic</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      activityCategoryTab === 'academic' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {activities.filter(a => (a.category || 'academic') === 'academic').length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setActivityCategoryTab('non-academic'); setCurrentPage(1); }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      activityCategoryTab === 'non-academic'
                        ? 'bg-[#800000] text-white shadow-2xs font-black'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>🏆 Non-Academic</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      activityCategoryTab === 'non-academic' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {activities.filter(a => a.category === 'non-academic').length}
                    </span>
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                  <input
                    type="text"
                    value={activitySearchQuery}
                    onChange={(e) => { setActivitySearchQuery(e.target.value); setCurrentPage(1); }}
                    placeholder="Search activities..."
                    className="input-field w-full pl-8 py-1.5 text-xs font-medium bg-gray-50 border-gray-200"
                  />
                  {activitySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setActivitySearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Activities Table View */}
              {filteredActivities.length === 0 ? (
                <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                  <p className="text-xs font-bold text-gray-500">
                    No activities found matching the selected college or filter criteria.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCollegeFilter('ALL');
                      setActivityCategoryTab('all');
                      setActivitySearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="px-3.5 py-1.5 bg-[#800000] text-white rounded-lg text-xs font-bold hover:bg-[#600000] inline-flex items-center gap-1.5"
                  >
                    Clear All Filters
                  </button>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="p-3 w-12 text-center">#</th>
                        <th className="p-3 min-w-[180px]">Activity Name</th>
                        <th className="p-3 w-32">Category</th>
                        <th className="p-3 min-w-[220px]">Objective</th>
                        <th className="p-3 min-w-[180px]">Belonging Colleges</th>
                        <th className="p-3 w-24 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginatedActivities.map((activity, idx) => (
                        <tr key={activity.id} className="hover:bg-gray-50/80 transition-colors">
                          <td className="p-3 text-center font-bold text-gray-400 text-xs">
                            {(currentPage - 1) * pageSize + idx + 1}
                          </td>
                          <td className="p-3 font-bold text-gray-900">
                            {activity.name}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                              activity.category === 'non-academic'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}>
                              {activity.category === 'non-academic' ? '🏆 Non-Academic' : '🎓 Academic'}
                            </span>
                          </td>
                          <td className="p-3 text-gray-600 font-medium max-w-xs truncate" title={activity.objective}>
                            {activity.objective || <span className="italic text-gray-400">No objective specified</span>}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {Array.isArray(activity.colleges) && activity.colleges.length > 0 ? (
                                activity.colleges.map((colKey) => {
                                  const collegeObj = collegesList.find(c => (c.code || c.id) === colKey);
                                  return (
                                    <span
                                      key={colKey}
                                      className="px-2 py-0.5 rounded-md bg-red-50 text-[#800000] border border-red-200 text-[10px] font-bold"
                                      title={collegeObj?.name || colKey}
                                    >
                                      {collegeObj ? collegeObj.code : colKey}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-xs italic text-gray-400">All Colleges</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditActivity(activity)}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-gray-900 transition-colors"
                                title="Edit Activity"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteActivity(activity)}
                                className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                                title="Delete Activity"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination Footer */}
                  <div className="p-3 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <span className="text-gray-500 font-semibold">
                      Showing <strong className="text-gray-800">{(currentPage - 1) * pageSize + 1}</strong> to{' '}
                      <strong className="text-gray-800">{Math.min(currentPage * pageSize, filteredActivities.length)}</strong> of{' '}
                      <strong className="text-gray-800">{filteredActivities.length}</strong> activities
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <ChevronLeft size={14} /> Prev
                      </button>

                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                            currentPage === pageNum
                              ? 'bg-[#800000] text-white shadow-2xs font-extrabold'
                              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        Next <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Activity Modal */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 animate-modal-pop space-y-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="font-black text-base text-gray-900">
                  {editingActivityId ? 'Edit' : 'Add'} {activityCategoryTab === 'academic' ? 'Academic Activity' : 'Non-Academic Activity'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure activity name, objective, and belonging colleges.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowActivityModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Individual vs Bulk Add Tabs */}
            {!editingActivityId && (
              <div className="flex bg-gray-100 p-1 rounded-xl gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setModalTab('individual')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    modalTab === 'individual'
                      ? 'bg-white text-[#800000] shadow-2xs font-extrabold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <User size={15} /> Individual Add
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('bulk')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    modalTab === 'bulk'
                      ? 'bg-white text-[#800000] shadow-2xs font-extrabold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <FileSpreadsheet size={15} /> Bulk Add (Sheet Upload)
                </button>
              </div>
            )}

            <div className="overflow-y-auto flex-1 pr-1 space-y-4">
              {/* INDIVIDUAL ADD TAB */}
              {modalTab === 'individual' && (
                <div className="space-y-4">
                  {/* Category selector */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: '#2B3235' }}>
                      Activity Category <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setActivityCategoryTab('academic')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          activityCategoryTab === 'academic'
                            ? 'bg-blue-50 border-blue-500 text-blue-900 font-black'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        🎓 Academic
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivityCategoryTab('non-academic')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          activityCategoryTab === 'non-academic'
                            ? 'bg-amber-50 border-amber-500 text-amber-900 font-black'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        🏆 Non-Academic
                      </button>
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: '#2B3235' }}>
                      {activityCategoryTab === 'academic' ? 'Academic Name' : 'Activity Name'} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={activityForm.name}
                      onChange={(e) => setActivityForm({ ...activityForm, name: e.target.value })}
                      placeholder={activityCategoryTab === 'academic' ? 'e.g. Research Colloquium 2026' : 'e.g. University Sports Fest'}
                      className="input-field w-full text-xs font-semibold"
                      autoFocus
                    />
                  </div>

                  {/* Objective */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: '#2B3235' }}>
                      {activityCategoryTab === 'academic' ? 'Academic Objective' : 'Activity Objective'}
                    </label>
                    <textarea
                      value={activityForm.objective}
                      onChange={(e) => setActivityForm({ ...activityForm, objective: e.target.value })}
                      placeholder="Enter objective and goals..."
                      rows={3}
                      className="input-field w-full text-xs font-medium resize-none"
                    />
                  </div>

                  {/* Belonging Colleges Selection with Search */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold" style={{ color: '#2B3235' }}>
                        Belonging Colleges <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (activityForm.colleges.length === collegesList.length) {
                            setActivityForm(prev => ({ ...prev, colleges: [] }));
                          } else {
                            setActivityForm(prev => ({ ...prev, colleges: collegesList.map(c => c.code || c.id) }));
                          }
                        }}
                        className="text-[11px] font-bold text-[#800000] hover:underline"
                      >
                        {activityForm.colleges.length === collegesList.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    {/* Search Field for Colleges */}
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                      <input
                        type="text"
                        value={collegeSearch}
                        onChange={(e) => setCollegeSearch(e.target.value)}
                        placeholder="Search college code or name..."
                        className="input-field w-full pl-8 py-1.5 text-xs font-medium bg-gray-50 border-gray-200"
                      />
                      {collegeSearch && (
                        <button
                          type="button"
                          onClick={() => setCollegeSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* College Checkbox List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[180px] overflow-y-auto p-2 border border-gray-200 rounded-xl bg-gray-50">
                      {filteredCollegesList.length === 0 ? (
                        <p className="text-xs italic text-gray-400 col-span-2 text-center py-4">
                          {collegesList.length === 0 ? 'No colleges configured in database' : 'No colleges matching search'}
                        </p>
                      ) : (
                        filteredCollegesList.map((college) => {
                          const colKey = college.code || college.id;
                          const isChecked = activityForm.colleges.includes(colKey);
                          return (
                            <label
                              key={college.id}
                              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all text-xs font-semibold ${
                                isChecked
                                  ? 'bg-red-50 border-[#800000] text-[#800000]'
                                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setActivityForm(prev => {
                                    const current = prev.colleges;
                                    const next = current.includes(colKey)
                                      ? current.filter(k => k !== colKey)
                                      : [...current, colKey];
                                    return { ...prev, colleges: next };
                                  });
                                }}
                                className="accent-[#7A0808] rounded"
                              />
                              <div className="truncate">
                                <span className="font-bold">{college.code}</span>
                                <span className="text-[11px] text-gray-500 block truncate">{college.name}</span>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowActivityModal(false)}
                      className="btn-outline flex-1 text-xs"
                      disabled={isSavingActivity}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveActivity}
                      disabled={isSavingActivity || !activityForm.name.trim() || activityForm.colleges.length === 0}
                      className="btn-maroon flex-1 text-xs flex items-center justify-center gap-1"
                    >
                      {isSavingActivity ? 'Saving...' : editingActivityId ? 'Save Changes' : 'Add Activity'}
                    </button>
                  </div>
                </div>
              )}

              {/* BULK ADD TAB */}
              {modalTab === 'bulk' && (
                <div className="space-y-4">
                  {/* Step 1: Download Template */}
                  <div className="bg-red-50/60 border border-red-200 p-4 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#800000]">
                        <FileSpreadsheet size={16} />
                        <span>Step 1: Download Excel Template</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadBulkActivityTemplate(collegesList)}
                        className="px-3 py-1.5 bg-[#800000] text-white rounded-lg text-xs font-bold hover:bg-[#600000] transition-colors flex items-center gap-1.5 shadow-2xs"
                      >
                        <Download size={13} /> Download (.xlsx) Template
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-600">
                      File headers: <strong>Category</strong>, <strong>Activity Name</strong>, <strong>Activity Objective</strong>, and <strong>Belonging Colleges</strong> (comma-separated college codes or ALL).
                    </p>
                  </div>

                  {/* Step 2: Upload File Dropzone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOverBulk(true);
                    }}
                    onDragLeave={() => setIsDragOverBulk(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOverBulk(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleBulkFileUpload(e.dataTransfer.files[0]);
                      }
                    }}
                    className={`border-2 border-dashed rounded-xl p-5 text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                      isDragOverBulk
                        ? 'border-[#800000] bg-red-50/70'
                        : 'border-gray-300 hover:border-[#800000] bg-gray-50/50'
                    }`}
                  >
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      id="bulkActivityFileInput"
                      onChange={(e) => e.target.files && handleBulkFileUpload(e.target.files[0])}
                    />
                    <label htmlFor="bulkActivityFileInput" className="cursor-pointer flex flex-col items-center">
                      <Upload size={22} className="text-[#800000] mb-1.5" />
                      <span className="font-bold text-xs text-gray-800">
                        Step 2: Upload Excel / CSV Spreadsheet
                      </span>
                      <span className="text-[10px] text-gray-400 mt-0.5">
                        Drag & drop your file here or click to browse
                      </span>
                    </label>
                  </div>

                  {/* Parsing Error */}
                  {bulkParseError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-bold text-red-700">
                      <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
                      <span>{bulkParseError}</span>
                    </div>
                  )}

                  {/* Loader */}
                  {isParsingBulk && (
                    <div className="p-6 text-center bg-gray-50 rounded-xl border border-gray-200">
                      <RefreshCw size={22} className="animate-spin text-[#800000] mx-auto mb-2" />
                      <p className="font-bold text-xs text-gray-700">Reading activities spreadsheet...</p>
                    </div>
                  )}

                  {/* Parsed Preview Table */}
                  {!isParsingBulk && bulkRows.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-gray-800">
                            Parsed Activities ({bulkRows.length})
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                            {bulkRows.filter(r => r.isValid).length} Valid
                          </span>
                          {bulkRows.filter(r => !r.isValid).length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold text-[10px]">
                              {bulkRows.filter(r => !r.isValid).length} Invalid
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setBulkRows([])}
                          className="text-xs text-gray-400 hover:text-red-600 font-bold"
                        >
                          Clear
                        </button>
                      </div>

                      <div className="border border-gray-200 rounded-xl overflow-x-auto max-h-56">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-100 text-gray-600 font-bold text-[10px] uppercase">
                            <tr>
                              <th className="p-2">#</th>
                              <th className="p-2">Category</th>
                              <th className="p-2">Name</th>
                              <th className="p-2">Colleges</th>
                              <th className="p-2">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {bulkRows.map((row, i) => (
                              <tr key={row.id} className={row.isValid ? 'hover:bg-gray-50' : 'bg-red-50/50'}>
                                <td className="p-2 font-bold text-gray-400 text-[10px]">{i + 1}</td>
                                <td className="p-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                    row.category === 'academic' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                                  }`}>
                                    {row.category}
                                  </span>
                                </td>
                                <td className="p-2 font-bold text-gray-900">{row.name}</td>
                                <td className="p-2">
                                  <div className="flex flex-wrap gap-1">
                                    {row.colleges.map((c) => (
                                      <span key={c} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-bold">
                                        {c}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-2">
                                  {row.isValid ? (
                                    <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                                      <CheckCircle2 size={12} /> Valid
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-red-600 flex items-center gap-1" title={row.errors.join(', ')}>
                                      <AlertCircle size={12} /> {row.errors[0]}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Bulk Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowActivityModal(false)}
                          className="btn-outline flex-1 text-xs"
                          disabled={isSavingBulk}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleImportBulkActivities}
                          disabled={isSavingBulk || bulkRows.filter(r => r.isValid).length === 0}
                          className="btn-maroon flex-1 text-xs flex items-center justify-center gap-1"
                        >
                          {isSavingBulk ? 'Importing...' : `Import ${bulkRows.filter(r => r.isValid).length} Activities`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
