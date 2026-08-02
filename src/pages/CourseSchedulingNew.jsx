import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Send, ChevronDown, ChevronRight, Users, X, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { useAcademicCalendar } from '../hooks/useAcademicCalendar';
import { useModal } from '../hooks/useModal';
import { ModalRenderer } from '../components/modals/ModalProvider';
import WeeklyScheduleGrid from '../components/scheduling/WeeklyScheduleGrid';
import AddPlotEntryModal from '../components/modals/AddPlotEntryModal';
import AddPlotEntryModalEnhanced from '../components/modals/AddPlotEntryModalEnhanced';
import LoadingModal from '../components/modals/LoadingModal';
import NotificationModal from '../components/modals/NotificationModal';
import GrantScheduleAccessModal from '../components/modals/GrantScheduleAccessModal';
import ResetDeanSchedulesModal from '../components/modals/ResetDeanSchedulesModal';
import { addDays } from '../constants/scheduleGrid';
import {
  formatDisplayDate,
  getSemesterBounds,
  getInitialWeekStart,
  getWeekDates,
  getPlotDayStatus,
  parseDateOnly,
  getExamDatesForPeriod,
} from '../utils/academicCalendarUtils';
import {
  subscribePlotEntriesForDeanSection,
  addPlotEntryForSection,
  updatePlotEntryForSection,
  deletePlotEntryForSection,
  subscribeDeanSections,
  createDeanSection,
  deleteDeanSection,
  resetMultipleDeansSchedules,
  entriesToGridBlocks,
  hourToTimeInput,
} from '../services/plotScheduleService';
import { subscribeStaffUsers, getDeanDepartmentOptions } from '../services/systemUserService';
import {
  subscribeScheduleAccess,
  grantFirstCollegeAccess,
  grantAllRemainingAccess,
  hasSchedulingAccess,
  getAccessStatusMessage,
  resetScheduleAccess,
} from '../services/scheduleAccessService';
import { SCHEDULE_DAYS } from '../constants/scheduleGrid';

// Year level options for section metadata
const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];

// Student categories for exam scheduling
const STUDENT_CATEGORIES = [
  { key: 'freshmen', label: 'Freshmen', years: ['1st Year'], examKey: 'fr' },
  { key: 'upperclassmen', label: 'Upperclassmen', years: ['2nd Year', '3rd Year', '4th Year', '5th Year'], examKey: 'up' }
];

// Exam periods
const EXAM_PERIODS = [
  { key: 'p1', label: 'P1' },
  { key: 'p2', label: 'P2' },
  { key: 'p3', label: 'P3' },
  { key: 'rbe', label: 'RBE (Rad Block Exam)' }
];

// Days of the week for regular schedule (no dates needed)
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

export default function CourseSchedulingNew() {
  const { profile } = useAuth();
  const isRegistrar = profile?.role === ROLES.REGISTRAR;
  const isDean = profile?.role === ROLES.DEAN;
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();

  const {
    schoolYears,
    activeSchoolYearId,
    setActiveSchoolYearId,
    calendarData,
  } = useAcademicCalendar();

  const [staffUsers, setStaffUsers] = useState([]);
  const [expandedColleges, setExpandedColleges] = useState({});
  const [selectedDeanUid, setSelectedDeanUid] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [deanSections, setDeanSections] = useState([]); // Dynamic sections from Firestore
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionYear, setNewSectionYear] = useState('1st Year');
  
  const [plotEntries, setPlotEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Loading and notification modals
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [notification, setNotification] = useState(null); // { type, title, message }

  // Access control state
  const [scheduleAccess, setScheduleAccess] = useState(null);
  const [showGrantAccessModal, setShowGrantAccessModal] = useState(false);
  
  // Reset schedules state
  const [showResetSchedulesModal, setShowResetSchedulesModal] = useState(false);
  const [selectedDeansForReset, setSelectedDeansForReset] = useState([]);

  const [scheduleTab, setScheduleTab] = useState('regular');
  const [semester, setSemester] = useState('1');
  const [weekStartDate, setWeekStartDate] = useState(() => getInitialWeekStart(null));
  const [selectedStudentCategory, setSelectedStudentCategory] = useState('freshmen'); // 'freshmen' or 'upperclassmen'
  const [selectedExamPeriod, setSelectedExamPeriod] = useState('p1'); // 'p1', 'p2', 'p3', 'rbe'

  const [entryModal, setEntryModal] = useState(null);

  // Auto-adjust week start date when switching to exam mode or changing exam period
  useEffect(() => {
    if (scheduleTab === 'exam' && selectedExamPeriod && selectedStudentCategory) {
      const examDates = getExamDatesForPeriod(
        calendarData.examPeriods, 
        semester, 
        selectedExamPeriod, 
        selectedStudentCategory
      );
      
      if (examDates.size > 0) {
        // Get the first date and set week to start on its Monday
        const datesArray = Array.from(examDates).sort();
        const firstExamDate = parseDateOnly(datesArray[0]);
        if (firstExamDate) {
          // Set to Monday of that week
          const monday = new Date(firstExamDate);
          const day = monday.getDay();
          const diff = day === 0 ? -6 : 1 - day;
          monday.setDate(monday.getDate() + diff);
          setWeekStartDate(monday);
        }
      }
    }
  }, [scheduleTab, selectedExamPeriod, selectedStudentCategory, semester, calendarData.examPeriods]);

  // Subscribe to schedule access control
  useEffect(() => {
    if (!activeSchoolYearId || !semester) {
      setScheduleAccess(null);
      return undefined;
    }

    return subscribeScheduleAccess(
      activeSchoolYearId,
      semester,
      (access) => setScheduleAccess(access),
      (err) => console.error('Error loading schedule access:', err)
    );
  }, [activeSchoolYearId, semester]);

  // Subscribe to staff users to get dean list
  useEffect(() => {
    return subscribeStaffUsers(
      (users) => setStaffUsers(users),
      (err) => console.error('Error loading staff:', err)
    );
  }, []);

  // Get dean departments grouped by college
  const deansByCollege = useMemo(() => {
    const departments = getDeanDepartmentOptions(staffUsers);
    return departments.map(dept => ({
      collegeName: dept.department,
      key: dept.key,
      tier: dept.tier,
      deans: dept.deans,
    }));
  }, [staffUsers]);

  // Auto-select first dean if none selected
  useEffect(() => {
    if (!selectedDeanUid && deansByCollege.length > 0) {
      const firstDean = deansByCollege[0]?.deans[0];
      if (firstDean) {
        setSelectedDeanUid(firstDean.uid);
        setExpandedColleges(prev => ({ ...prev, [deansByCollege[0].key]: true }));
      }
    }
  }, [deansByCollege, selectedDeanUid]);

  // If current user is dean, auto-select themselves
  useEffect(() => {
    if (isDean && profile?.uid && !selectedDeanUid) {
      setSelectedDeanUid(profile.uid);
      // Find and expand their college
      const myCollege = deansByCollege.find(c => 
        c.deans.some(d => d.uid === profile.uid)
      );
      if (myCollege) {
        setExpandedColleges(prev => ({ ...prev, [myCollege.key]: true }));
      }
    }
  }, [isDean, profile, selectedDeanUid, deansByCollege]);

  const selectedDean = useMemo(() => {
    return staffUsers.find(u => u.uid === selectedDeanUid);
  }, [staffUsers, selectedDeanUid]);

  // Auto-set section for exam mode (sections don't matter for exams)
  useEffect(() => {
    if (scheduleTab === 'exam') {
      setSelectedSection('exam-schedule'); // Use a generic identifier for exam schedules
    } else if (scheduleTab === 'regular' && selectedSection === 'exam-schedule') {
      // Reset to first section when switching back to regular
      setSelectedSection(deanSections[0]?.name || null);
    }
  }, [scheduleTab, deanSections]);

  // Subscribe to sections for selected dean
  useEffect(() => {
    if (!selectedDeanUid) {
      setDeanSections([]);
      return undefined;
    }

    return subscribeDeanSections(
      selectedDeanUid,
      (sections) => {
        setDeanSections(sections);
        // Auto-select first section if none selected or current selection doesn't exist
        const sectionNames = sections.map(s => s.name);
        if (!selectedSection || !sectionNames.includes(selectedSection)) {
          setSelectedSection(sections[0]?.name || null);
        }
      },
      (err) => console.error('Error loading sections:', err)
    );
  }, [selectedDeanUid, selectedSection]);

  // Subscribe to plot entries for selected dean and section
  useEffect(() => {
    if (!selectedDeanUid || !selectedSection) {
      setPlotEntries([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return subscribePlotEntriesForDeanSection(
      selectedDeanUid,
      selectedSection,
      semester,
      scheduleTab, // Pass scheduleMode (regular or exam)
      scheduleTab === 'exam' ? selectedExamPeriod : null, // Pass exam period for filtering
      (entries) => {
        setPlotEntries(entries);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Failed to load schedule.');
        setLoading(false);
      }
    );
  }, [selectedDeanUid, selectedSection, semester, scheduleTab, selectedExamPeriod]);

  // Check if current dean has scheduling access
  const myCollege = isDean ? (profile?.college || profile?.department) : null;
  const accessStatus = useMemo(() => {
    if (!isDean || !myCollege) return { hasAccess: true, message: '', isFirst: false }; // Registrar always has access for viewing
    return getAccessStatusMessage(scheduleAccess, myCollege);
  }, [isDean, myCollege, scheduleAccess]);

  const canPlot = useMemo(() => {
    if (isRegistrar) return false; // Registrar can only view
    if (isDean && profile?.uid === selectedDeanUid) {
      return accessStatus.hasAccess; // Dean must have access
    }
    return false;
  }, [isRegistrar, isDean, profile, selectedDeanUid, accessStatus]);

  const semesterBounds = useMemo(
    () => getSemesterBounds(calendarData.config, semester),
    [calendarData.config, semester]
  );

  // For regular schedule: use generic weekday indices (0-6)
  // For exam schedule: use actual dates based on exam calendar
  const weekDates = useMemo(() => {
    if (scheduleTab === 'regular') {
      // Generic weekdays - no actual dates
      return WEEKDAYS.map((_, index) => `weekday-${index}`);
    } else {
      // Exam schedule uses actual dates
      return getWeekDates(weekStartDate);
    }
  }, [scheduleTab, weekStartDate]);

  const dayStatuses = useMemo(
    () => weekDates.map((dateStr, index) => {
      if (scheduleTab === 'regular') {
        // Regular schedule: all days are enabled
        return { date: dateStr, disabled: false, reason: null };
      } else {
        // Exam schedule: check academic calendar with specific exam period
        const status = getPlotDayStatus(
          dateStr, 
          calendarData, 
          semester, 
          scheduleTab,
          selectedExamPeriod, // Pass the selected exam period
          selectedStudentCategory // Pass the student category
        );
        return { date: dateStr, ...status };
      }
    }),
    [weekDates, calendarData, semester, scheduleTab, selectedExamPeriod, selectedStudentCategory]
  );

  const filteredEntries = useMemo(
    () => plotEntries.filter((e) => e.scheduleMode === scheduleTab || (!e.scheduleMode && scheduleTab === 'regular')),
    [plotEntries, scheduleTab]
  );

  const gridBlocks = useMemo(
    () => entriesToGridBlocks(filteredEntries, weekDates),
    [filteredEntries, weekDates]
  );

  const schoolYearOptions = useMemo(
    () => schoolYears.map((sy) => ({
      value: sy.id,
      label: sy.displayLabel || `SY ${sy.label}`,
    })),
    [schoolYears]
  );

  const selectedSchoolYear = schoolYears.find((sy) => sy.id === activeSchoolYearId);
  const schoolYearLabel = selectedSchoolYear?.displayLabel || 'School year';

  const semesterRangeLabel = useMemo(() => {
    if (scheduleTab === 'regular') {
      // Show semester start/end dates for regular schedule
      return semesterBounds.start && semesterBounds.end
        ? `Semester ${semester}: ${formatDisplayDate(semesterBounds.start)} to ${formatDisplayDate(semesterBounds.end)}`
        : 'Semester dates not configured';
    }
    
    // For exam schedule, show the specific exam period dates
    if (scheduleTab === 'exam' && selectedExamPeriod && selectedStudentCategory) {
      const examDates = getExamDatesForPeriod(
        calendarData.examPeriods, 
        semester, 
        selectedExamPeriod, 
        selectedStudentCategory
      );
      
      if (examDates.size === 0) {
        return `${selectedExamPeriod.toUpperCase()} exam dates not configured`;
      }
      
      // Get first and last date from the set
      const datesArray = Array.from(examDates).sort();
      const startDate = datesArray[0];
      const endDate = datesArray[datesArray.length - 1];
      
      const categoryLabel = selectedStudentCategory === 'freshmen' ? 'Freshmen' : 'Upperclassmen';
      return `${selectedExamPeriod.toUpperCase()} - ${categoryLabel}: ${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`;
    }
    
    // Fallback to semester dates
    return semesterBounds.start && semesterBounds.end
      ? `${formatDisplayDate(semesterBounds.start)} to ${formatDisplayDate(semesterBounds.end)}`
      : 'Exam dates not configured in Academic Calendar';
  }, [scheduleTab, semesterBounds, semester, selectedExamPeriod, selectedStudentCategory, calendarData.examPeriods]);

  const canPrevWeek = useMemo(() => {
    if (!semesterBounds.start) return true;
    const semStart = parseDateOnly(semesterBounds.start);
    const prevWeekEnd = addDays(weekStartDate, -1);
    return prevWeekEnd >= semStart;
  }, [weekStartDate, semesterBounds.start]);

  const canNextWeek = useMemo(() => {
    if (!semesterBounds.end) return true;
    const semEnd = parseDateOnly(semesterBounds.end);
    const nextWeekStart = addDays(weekStartDate, 7);
    return nextWeekStart <= semEnd;
  }, [weekStartDate, semesterBounds.end]);

  const handleSlotSelect = ({ dayIndex, date, startTime, endTime, fromDrag }) => {
    if (!canPlot) return;
    
    // For regular schedule, use weekday name; for exam schedule, use actual date
    const dayIdentifier = scheduleTab === 'regular' ? WEEKDAYS[dayIndex] : date;
    if (!dayIdentifier) return;
    
    const status = dayStatuses[dayIndex];
    if (status?.disabled) return;
    
    setEntryModal({
      mode: 'add',
      date: dayIdentifier,
      dayLabel: SCHEDULE_DAYS[dayIndex],
      lockTimes: true,
      initial: { startTime, endTime },
      fromDrag,
    });
  };

  const openEditModal = (block) => {
    // Allow dean to edit their own schedules
    if (!isDean || !selectedDeanUid || profile?.uid !== selectedDeanUid) return;
    const dayIdx = block.day;
    const dayIdentifier = scheduleTab === 'regular' ? WEEKDAYS[dayIdx] : (block.date || weekDates[dayIdx]);
    
    setEntryModal({
      mode: 'edit',
      id: block.id,
      date: dayIdentifier,
      dayLabel: SCHEDULE_DAYS[dayIdx],
      initial: {
        title: block.title,
        courseCode: block.course,
        instructor: block.instructor,
        type: block.type,
        startTime: hourToTimeInput(block.start),
        endTime: hourToTimeInput(block.end),
        roomCode: block.roomCode,
      },
    });
  };

  const handleSaveEntry = async (payload) => {
    if (!selectedDeanUid || !selectedSection) return;
    
    console.log('handleSaveEntry called with payload:', payload);
    console.log('Selected dean UID:', selectedDeanUid);
    console.log('Selected section:', selectedSection);
    console.log('Schedule mode:', scheduleTab);
    
    // For regular schedule, use day index (0-6) instead of actual date
    // For exam schedule, use actual date
    const dayIdx = scheduleTab === 'regular' 
      ? WEEKDAYS.indexOf(payload.date) // Use weekday name for regular
      : weekDates.indexOf(payload.date); // Use actual date for exam
    
    console.log('Calculated dayIdx:', dayIdx, 'from date:', payload.date);
    
    // Only check date status for exam schedule
    if (scheduleTab === 'exam') {
      const status = getPlotDayStatus(
        payload.date, 
        calendarData, 
        semester, 
        scheduleTab,
        selectedExamPeriod,
        selectedStudentCategory
      );
      if (status.disabled) throw new Error(status.reason || 'This date is blocked.');
    }

    const entry = {
      ...payload,
      day: dayIdx,
      semester: Number(semester), // Always store semester for both regular and exam schedules
      section: selectedSection,
      studentCategory: scheduleTab === 'exam' ? selectedStudentCategory : null, // Store category for exam filtering
      examPeriod: scheduleTab === 'exam' ? selectedExamPeriod : null, // Store exam period (p1, p2, p3, rbe)
      deanUid: selectedDeanUid,
      deanName: selectedDean?.name || '',
      college: selectedDean?.college || selectedDean?.department || '',
      scheduleMode: scheduleTab, // 'regular' or 'exam'
      plottedBy: profile?.uid || null,
      plottedByEmail: normalizeEmail(profile?.email),
    };

    console.log('Entry to be saved:', entry);

    if (entryModal?.mode === 'edit' && entryModal.id) {
      console.log('Updating entry:', entryModal.id);
      await updatePlotEntryForSection(selectedDeanUid, selectedSection, entryModal.id, entry);
    } else {
      console.log('Adding new entry');
      const newId = await addPlotEntryForSection(selectedDeanUid, selectedSection, entry);
      console.log('New entry ID:', newId);
    }
    
    console.log('Save completed successfully');
  };

  const handleDeleteEntry = async (block) => {
    // Allow dean to delete their own schedules
    if (!isDean || !selectedDeanUid || !selectedSection || profile?.uid !== selectedDeanUid) return;
    
    const confirmed = await showConfirm({
      title: 'Delete schedule block?',
      message: `Remove "${block.title || block.course}" from the schedule? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;
    
    try {
      await deletePlotEntryForSection(selectedDeanUid, selectedSection, block.id);
      showNotification({
        type: 'success',
        title: 'Schedule deleted',
        message: 'The schedule block has been removed.',
      });
    } catch (err) {
      setError(err.message || 'Failed to delete block.');
      showNotification({
        type: 'error',
        title: 'Delete failed',
        message: err.message || 'Failed to delete the schedule block.',
      });
    }
  };

  const toggleCollege = (key) => {
    setExpandedColleges(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectDean = (deanUid) => {
    setSelectedDeanUid(deanUid);
    setSelectedSection(null); // Reset section when changing dean
  };

  const handleAddSection = async () => {
    if (!selectedDeanUid || !newSectionName.trim()) {
      setNotification({
        type: 'error',
        title: 'Invalid Input',
        message: 'Please enter a section name.',
      });
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Creating section...');
    setShowAddSectionModal(false);

    try {
      await createDeanSection(selectedDeanUid, newSectionName.trim(), newSectionYear);
      setNewSectionName('');
      setNewSectionYear('1st Year');
      setError('');
      setIsLoading(false);
      
      // Show success notification
      setNotification({
        type: 'success',
        title: 'Section Created!',
        message: `Section "${newSectionName.trim()}" has been successfully created.`,
      });
    } catch (err) {
      console.error('Error creating section:', err);
      setIsLoading(false);
      
      // Show error notification
      setNotification({
        type: 'error',
        title: 'Failed to Create Section',
        message: err.message || 'An error occurred while creating the section. Please try again.',
      });
    }
  };

  const handleDeleteSection = async (sectionName) => {
    if (!selectedDeanUid || !sectionName) return;
    
    const confirmed = await showConfirm({
      title: 'Delete section?',
      message: `Delete section "${sectionName}" and all its schedule entries? This action cannot be undone.`,
      confirmText: 'Delete Section',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Deleting section...');

    try {
      await deleteDeanSection(selectedDeanUid, sectionName);
      if (selectedSection === sectionName) {
        setSelectedSection(null);
      }
      setIsLoading(false);
      
      // Show success notification
      showNotification({
        type: 'success',
        title: 'Section Deleted!',
        message: `Section "${sectionName}" and all its schedules have been deleted.`,
      });
    } catch (err) {
      console.error('Error deleting section:', err);
      setIsLoading(false);
      
      // Show error notification
      showNotification({
        type: 'error',
        title: 'Failed to Delete Section',
        message: err.message || 'An error occurred while deleting the section.',
      });
    }
  };

  const entryModalDayStatus = entryModal && scheduleTab === 'exam'
    ? getPlotDayStatus(entryModal.date, calendarData, semester, scheduleTab, selectedExamPeriod, selectedStudentCategory)
    : null;

  const subtitle = isRegistrar
    ? 'View course schedules plotted by college deans'
    : 'Plot course schedules for your college sections';

  return (
    <Layout title="Course Scheduling" subtitle={subtitle}>
      {error && (
        <div className="mb-4 p-3 border border-red-200 bg-red-50 text-sm font-semibold text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* School Year Selector - At the very top */}
      <div className="mb-5 bg-white border-2 border-[#800000] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-black text-sm" style={{ color: '#800000' }}>School Year & Semester</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">This affects all schedules and dates displayed below</p>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-[9px] font-bold uppercase text-gray-500 mb-1">School Year</label>
              <select
                value={activeSchoolYearId || ''}
                onChange={(e) => setActiveSchoolYearId(e.target.value)}
                className="px-3 py-2 text-sm font-bold rounded-lg border-2 border-gray-200 focus:border-[#800000] focus:outline-none"
                style={{ color: '#2B3235' }}
              >
                {schoolYearOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-bold uppercase text-gray-500 mb-1">Semester</label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="px-3 py-2 text-sm font-bold rounded-lg border-2 border-gray-200 focus:border-[#800000] focus:outline-none"
                style={{ color: '#2B3235' }}
              >
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-bold text-base flex items-center gap-2" style={{ color: '#2B3235' }}>
            <Calendar size={18} /> Course Schedules by College
          </h2>
          <p className="text-xs font-medium mt-1" style={{ color: '#2B3235', opacity: 0.65 }}>
            {canPlot 
              ? 'Select a section to plot your course schedule. Click or drag on the grid to add schedule blocks.'
              : 'View course schedules by college and section.'}
          </p>
        </div>
      </div>

      {/* Registrar Access Control Panel */}
      {isRegistrar && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-sm" style={{ color: '#2B3235' }}>
                📋 Schedule Access Control
              </h3>
              <p className="text-xs text-gray-600 mt-0.5">
                Manage which colleges can create schedules
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Reset Schedules Button */}
              <button
                type="button"
                onClick={() => setShowResetSchedulesModal(true)}
                disabled={!activeSchoolYearId || !semester}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete plotted schedules by selected deans"
              >
                <Trash2 size={16} />
                Reset Schedules
              </button>

              {/* Grant First College or Reset Access Control */}
              {!scheduleAccess ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!activeSchoolYearId || !semester) {
                      alert('Please select a school year and semester first.');
                      return;
                    }
                    setShowGrantAccessModal(true);
                  }}
                  disabled={!activeSchoolYearId || !semester}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-[#800000] text-white hover:bg-[#600000] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                  Grant First College Access
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Reset access control? This will remove all granted permissions and you can start fresh. Existing schedules will NOT be deleted.')) {
                      return;
                    }
                    try {
                      await resetScheduleAccess(activeSchoolYearId, semester);
                      showNotification({
                        type: 'success',
                        title: 'Access Control Reset',
                        message: 'Schedule access control has been reset. You can now grant access again.',
                      });
                    } catch (err) {
                      showNotification({
                        type: 'error',
                        title: 'Reset Failed',
                        message: err.message || 'Failed to reset access control.',
                      });
                    }
                  }}
                  disabled={!activeSchoolYearId || !semester}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-orange-600 text-white hover:bg-orange-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Reset access control to start fresh"
                >
                  <X size={16} />
                  Reset Access Control
                </button>
              )}
            </div>
          </div>

          {scheduleAccess ? (
            <div className="space-y-3">
              {/* Current Status */}
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  Current Status:
                </p>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    scheduleAccess.status === 'all_allowed' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {scheduleAccess.status === 'all_allowed' 
                      ? '✅ All Colleges Can Schedule' 
                      : '⏳ First College Only'}
                  </span>
                </div>
              </div>

              {/* First College Info */}
              {scheduleAccess.firstCollege && (
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                    First College (Currently Scheduling):
                  </p>
                  <p className="text-sm font-bold text-[#800000]">
                    {scheduleAccess.firstCollege.name}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Granted: {new Date(scheduleAccess.firstCollege.grantedAt).toLocaleString()}
                  </p>
                </div>
              )}

              {/* Action Button */}
              {scheduleAccess.status === 'first_only' && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Allow all remaining colleges to create their schedules? This action cannot be undone.')) return;
                    try {
                      await grantAllRemainingAccess(activeSchoolYearId, semester, profile?.uid);
                    } catch (err) {
                      alert(err.message || 'Failed to grant access.');
                    }
                  }}
                  className="w-full px-4 py-3 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                >
                  ✅ Allow All Remaining Colleges to Schedule
                </button>
              )}

              {scheduleAccess.status === 'all_allowed' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-bold text-green-800">
                    ✅ All colleges have scheduling access
                  </p>
                  {scheduleAccess.allAccessGrantedAt && (
                    <p className="text-[10px] text-green-700 mt-1">
                      Granted: {new Date(scheduleAccess.allAccessGrantedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
              <p className="text-sm text-gray-500">
                No access control set for this semester. Click "Grant First College Access" to begin.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Dean Access Status Banner - Waiting */}
      {isDean && !accessStatus.hasAccess && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-6 mb-5 text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-200 flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">⏳</span>
          </div>
          <h3 className="font-black text-lg mb-2" style={{ color: '#92400E' }}>
            Waiting for Access
          </h3>
          <p className="text-sm font-semibold text-yellow-800">
            {accessStatus.message}
          </p>
        </div>
      )}

      {/* Dean Access Status Banner - First College */}
      {isDean && accessStatus.hasAccess && accessStatus.isFirst && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-4 mb-5">
          <p className="text-sm font-bold text-blue-900">
            🎯 You are the first college to schedule. Other colleges will schedule after you complete.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-5">
        {/* Left Sidebar - Colleges and Deans */}
        <div className="space-y-2">
          {/* My Schedule - Only shown for deans */}
          {isDean && profile?.uid && (
            <div className="bg-gradient-to-br from-[#800000] to-[#600000] border-2 border-[#800000] rounded-2xl p-4 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Calendar size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-sm text-white">My Course Schedule</h3>
                  <p className="text-[10px] text-white/80 font-medium">Quick access to your scheduling</p>
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => handleSelectDean(profile.uid)}
                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                  selectedDeanUid === profile.uid
                    ? 'bg-white text-[#800000] shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20 border border-white/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {profile.name || 'Your Schedule'}
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-yellow-400 text-yellow-900">
                        EDIT
                      </span>
                    </div>
                    <div className="text-[10px] font-normal mt-0.5 opacity-75">
                      {profile.department || profile.college || 'Your College'}
                    </div>
                  </div>
                  <ChevronRight size={16} />
                </div>
              </button>
            </div>
          )}

          <div className="bg-white border border-gray-100 rounded-2xl p-4">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: '#2B3235' }}>
              <Users size={14} /> {isDean ? 'Other Colleges & Deans' : 'Colleges & Deans'}
            </h3>
            
            <div className="space-y-1">
              {deansByCollege.map((college) => (
                <div key={college.key}>
                  {/* College Header */}
                  <button
                    type="button"
                    onClick={() => toggleCollege(college.key)}
                    className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <span className="font-bold text-xs" style={{ color: '#2B3235' }}>
                      {college.collegeName}
                      {college.tier === 'cas' && (
                        <span className="ml-1 text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: '#FEF3C7', color: '#92400E' }}>
                          CAS
                        </span>
                      )}
                    </span>
                    {expandedColleges[college.key] ? (
                      <ChevronDown size={14} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={14} className="text-gray-400" />
                    )}
                  </button>

                  {/* Deans List */}
                  {expandedColleges[college.key] && (
                    <div className="ml-3 mt-1 space-y-1">
                      {college.deans.map((dean) => {
                        const isCurrentUser = isDean && profile?.uid === dean.uid;
                        return (
                          <button
                            key={dean.uid}
                            type="button"
                            onClick={() => handleSelectDean(dean.uid)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all relative ${
                              selectedDeanUid === dean.uid
                                ? 'bg-[#800000] text-white'
                                : isCurrentUser
                                ? 'bg-gradient-to-r from-[#800000]/10 to-[#800000]/5 border-2 border-[#800000] hover:bg-[#800000]/15'
                                : 'hover:bg-gray-100'
                            }`}
                            style={selectedDeanUid === dean.uid ? {} : { color: '#2B3235' }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                {dean.name}
                                {isCurrentUser && (
                                  <span className="ml-2 text-[9px] font-black px-2 py-0.5 rounded-full bg-[#800000] text-white">
                                    YOU
                                  </span>
                                )}
                                <div className="text-[10px] font-normal mt-0.5 opacity-75">
                                  {dean.email}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div>
          {selectedDean ? (
            <div className="space-y-4">
              {/* Section Selector - Only show for regular schedule */}
              {scheduleTab === 'regular' && (
                <div className="bg-white border border-gray-100 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-black text-base" style={{ color: '#2B3235' }}>
                        {selectedDean.department || selectedDean.college}
                      </h3>
                      <p className="text-xs font-medium mt-0.5" style={{ color: '#2B3235', opacity: 0.65 }}>
                        {selectedDean.name} · {selectedDean.email}
                      </p>
                    </div>
                    {canPlot && (
                      <button
                        type="button"
                        onClick={() => setShowAddSectionModal(true)}
                        className="px-3 py-2 rounded-lg text-xs font-bold bg-[#800000] text-white hover:bg-[#600000] transition-all flex items-center gap-1"
                      >
                        <Plus size={14} /> Add Section
                      </button>
                    )}
                  </div>

                  {/* Section List - Only for Regular Schedule */}
                  {deanSections.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm font-semibold text-gray-400 mb-2">No sections added yet</p>
                      {canPlot && (
                        <button
                          type="button"
                          onClick={() => setShowAddSectionModal(true)}
                          className="btn-outline-maroon text-xs gap-1 mx-auto"
                        >
                          <Plus size={14} /> Add Your First Section
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Sections Grouped by Year Level */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#7A0808' }}>
                          Sections by Year Level
                        </p>
                        {YEAR_LEVELS.map((yearLevel) => {
                          const sectionsForYear = deanSections.filter(s => s.yearLevel === yearLevel);
                          if (sectionsForYear.length === 0) return null;
                          
                          return (
                            <div key={yearLevel} className="mb-3">
                              <p className="text-[9px] font-bold text-gray-500 mb-1.5">{yearLevel}</p>
                              <div className="flex flex-wrap gap-2">
                                {sectionsForYear.map((section) => (
                                  <div key={section.name} className="relative group">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedSection(section.name)}
                                      className={`px-4 py-2 pr-8 rounded-xl text-xs font-bold transition-all border-2 ${
                                        selectedSection === section.name
                                          ? 'bg-[#800000] text-white border-[#800000]'
                                          : 'bg-white text-[#2B3235] border-gray-200 hover:border-[#800000] hover:bg-red-50'
                                      }`}
                                    >
                                      {section.name}
                                    </button>
                                    {canPlot && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteSection(section.name);
                                        }}
                                        className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                                          selectedSection === section.name ? 'text-white hover:bg-red-700' : 'text-red-500 hover:bg-red-100'
                                        }`}
                                        title="Delete section"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {canPlot && deanSections.length > 0 && (
                    <div className="mt-4 p-3 rounded-lg" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                      <p className="text-xs font-bold" style={{ color: '#2B3235' }}>
                        🎯 Regular Schedule: Create a weekly schedule that repeats for the entire semester. Select a section to start plotting.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Exam Schedule Controls - Only show for exam schedule */}
              {scheduleTab === 'exam' && (
                <div className="bg-white border border-gray-100 rounded-2xl p-5">
                  <div className="mb-4">
                    <h3 className="font-black text-base" style={{ color: '#2B3235' }}>
                      {selectedDean.department || selectedDean.college}
                    </h3>
                    <p className="text-xs font-medium mt-0.5" style={{ color: '#2B3235', opacity: 0.65 }}>
                      {selectedDean.name} · {selectedDean.email}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {/* Student Category */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#7A0808' }}>
                        Student Category
                      </p>
                      <div className="flex gap-2">
                        {STUDENT_CATEGORIES.map((category) => (
                          <button
                            key={category.key}
                            type="button"
                            onClick={() => setSelectedStudentCategory(category.key)}
                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                              selectedStudentCategory === category.key
                                ? 'bg-[#800000] text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {category.label}
                            <div className="text-[9px] font-normal mt-0.5 opacity-75">
                              {category.years.join(', ')}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Exam Period */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#7A0808' }}>
                        Exam Period
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {EXAM_PERIODS.map((period) => (
                          <button
                            key={period.key}
                            type="button"
                            onClick={() => setSelectedExamPeriod(period.key)}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                              selectedExamPeriod === period.key
                                ? 'bg-[#800000] text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-100 border-2 border-gray-200'
                            }`}
                          >
                            {period.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-2">
                        {selectedStudentCategory === 'freshmen' 
                          ? '📚 Showing exam dates for Freshmen (1st Year)' 
                          : '📚 Showing exam dates for Upperclassmen (2nd-5th Year)'}
                      </p>
                    </div>

                    <div className="mt-4 p-3 rounded-lg" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                      <p className="text-xs font-bold" style={{ color: '#1E40AF' }}>
                        ℹ️ Exam schedules are based on student category (Freshmen/Upperclassmen), not sections. All exams for this category will appear on the schedule below.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Weekly Schedule Grid */}
              <WeeklyScheduleGrid
                title={scheduleTab === 'exam' 
                  ? `${selectedDean.department || selectedDean.college} · ${selectedStudentCategory === 'freshmen' ? 'Freshmen' : 'Upperclassmen'} · ${selectedExamPeriod.toUpperCase()}`
                  : `${selectedDean.department || selectedDean.college} · Section ${selectedSection || ''}`
                }
                schoolYearLabel={schoolYearLabel}
                schoolYearOptions={[]} // Empty - selector moved to top
                onSchoolYearChange={undefined} // Disabled - controlled from top
                semester={semester}
                onSemesterChange={setSemester} // Re-enabled for quick switching
                lockSemester={false} // Allow semester switching in grid
                scheduleTab={scheduleTab}
                onScheduleTabChange={setScheduleTab}
                weekStartDate={scheduleTab === 'exam' ? weekStartDate : null}
                onPrevWeek={scheduleTab === 'exam' ? () => setWeekStartDate((d) => addDays(d, -7)) : undefined}
                onNextWeek={scheduleTab === 'exam' ? () => setWeekStartDate((d) => addDays(d, 7)) : undefined}
                canPrevWeek={scheduleTab === 'exam' ? canPrevWeek : false}
                canNextWeek={scheduleTab === 'exam' ? canNextWeek : false}
                showDayDates={scheduleTab === 'exam'}
                semesterRangeLabel={semesterRangeLabel}
                dayStatuses={dayStatuses}
                blocks={gridBlocks}
                readOnly={!isDean || profile?.uid !== selectedDeanUid}
                canPlot={canPlot}
                onAddBlock={() => {
                  const firstOpenIdx = dayStatuses.findIndex((d) => !d.disabled);
                  if (firstOpenIdx >= 0) {
                    const dayIdentifier = scheduleTab === 'regular' ? WEEKDAYS[firstOpenIdx] : dayStatuses[firstOpenIdx].date;
                    handleSlotSelect({
                      dayIndex: firstOpenIdx,
                      date: dayIdentifier,
                      startTime: '08:00',
                      endTime: '09:00',
                      fromDrag: false,
                    });
                  }
                }}
                onSlotSelect={handleSlotSelect}
                onEditBlock={openEditModal}
                onDeleteBlock={handleDeleteEntry}
                emptyMessage={canPlot ? 'Click or drag on the grid to add schedule blocks.' : 'No schedule blocks yet.'}
              />
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
              <p className="text-sm font-semibold" style={{ color: '#2B3235', opacity: 0.55 }}>
                Select a dean from the sidebar to view their course schedules.
              </p>
            </div>
          )}
        </div>
      </div>

      {entryModal && canPlot && isDean ? (
        <AddPlotEntryModalEnhanced
          key={`${entryModal.mode}-${entryModal.date}-${entryModal.initial?.startTime}-${entryModal.initial?.endTime}`}
          onClose={() => setEntryModal(null)}
          onSave={handleSaveEntry}
          initial={entryModal.initial}
          date={entryModal.date}
          dayLabel={entryModal.dayLabel}
          scheduleMode={scheduleTab}
          dayBlockReason={entryModalDayStatus?.disabled ? entryModalDayStatus.reason : null}
          lockTimes={entryModal.lockTimes}
          deanCollege={selectedDean?.college || selectedDean?.department}
          deanUid={selectedDeanUid}
          semester={semester}
          sectionYearLevel={deanSections.find((s) => s.name === selectedSection)?.yearLevel || '1st Year'}
          dayIndex={WEEKDAYS.indexOf(entryModal.date) >= 0 ? WEEKDAYS.indexOf(entryModal.date) : weekDates.indexOf(entryModal.date)}
        />
      ) : entryModal ? (
        <AddPlotEntryModal
          key={`${entryModal.mode}-${entryModal.date}-${entryModal.initial?.startTime}-${entryModal.initial?.endTime}`}
          onClose={() => setEntryModal(null)}
          onSave={handleSaveEntry}
          initial={entryModal.initial}
          date={entryModal.date}
          dayLabel={entryModal.dayLabel}
          scheduleMode={scheduleTab}
          restrictRooms={false}
          assignedRooms={[]}
          dayBlockReason={entryModalDayStatus?.disabled ? entryModalDayStatus.reason : null}
          lockTimes={entryModal.lockTimes}
        />
      ) : null}

      {/* Add Section Modal */}
      {showAddSectionModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-modal-pop">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg" style={{ color: '#2B3235' }}>
                Add New Section
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddSectionModal(false);
                  setNewSectionName('');
                  setError('');
                }}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  Section Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="e.g., 1A, BSIT-2, Section Alpha"
                  className="input-field w-full"
                  autoFocus
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Enter any section name (e.g., 1A for first year section A, BSIT-2 for second year IT)
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  Year Level <span className="text-red-500">*</span>
                </label>
                <select
                  value={newSectionYear}
                  onChange={(e) => setNewSectionYear(e.target.value)}
                  className="input-field w-full"
                >
                  {YEAR_LEVELS.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500 mt-1">
                  ⚠️ Year level is required for exam scheduling. 1st year has separate exam period from 2nd-5th year.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSectionModal(false);
                    setNewSectionName('');
                    setError('');
                  }}
                  className="btn-outline flex-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddSection}
                  disabled={!newSectionName.trim()}
                  className="btn-maroon flex-1 flex items-center justify-center gap-1"
                >
                  <Plus size={14} /> Add Section
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading Modal */}
      <LoadingModal isOpen={isLoading} message={loadingMessage} />

      {/* Notification Modal */}
      {notification && (
        <NotificationModal
          type={notification.type}
          title={notification.title}
          message={notification.message}
          onClose={() => setNotification(null)}
          autoCloseMs={notification.type === 'success' ? 3000 : 0}
        />
      )}

      {/* Global Modals */}
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />

      {/* Grant Schedule Access Modal */}
      {showGrantAccessModal && (
        <GrantScheduleAccessModal
          isOpen={showGrantAccessModal}
          onClose={() => setShowGrantAccessModal(false)}
          schoolYearId={activeSchoolYearId}
          semester={semester}
          onSuccess={() => {
            setShowGrantAccessModal(false);
            showNotification({
              type: 'success',
              title: 'Access Granted',
              message: 'The first college has been granted scheduling access.',
            });
          }}
        />
      )}

      {/* Reset Dean Schedules Modal */}
      {showResetSchedulesModal && (
        <ResetDeanSchedulesModal
          isOpen={showResetSchedulesModal}
          onClose={() => setShowResetSchedulesModal(false)}
          onConfirm={async (deanUids, semester, schoolYear) => {
            setIsLoading(true);
            setLoadingMessage(`Deleting schedules for ${deanUids.length} dean(s)...`);
            try {
              const result = await resetMultipleDeansSchedules(deanUids, semester);
              setIsLoading(false);
              showNotification({
                type: 'success',
                title: 'Schedules Deleted',
                message: `Successfully deleted schedules for ${result.totalDeleted} entries across ${deanUids.length} dean(s).`,
              });
            } catch (err) {
              setIsLoading(false);
              showNotification({
                type: 'error',
                title: 'Reset Failed',
                message: err.message || 'Failed to reset schedules.',
              });
              throw err;
            }
          }}
          deanUsers={staffUsers.filter(u => u.roleValue === 'dean')}
          semester={semester}
          schoolYear={schoolYearLabel}
        />
      )}
    </Layout>
  );
}
