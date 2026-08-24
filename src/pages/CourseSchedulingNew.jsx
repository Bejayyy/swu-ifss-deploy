import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Send, ChevronDown, ChevronRight, Users, X, Trash2, Layers, Search, Edit, GraduationCap, BookOpen } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { useAcademicCalendar } from '../hooks/useAcademicCalendar';
import { useModal } from '../hooks/useModal';
import { ModalRenderer } from '../components/modals/ModalProvider';
import WeeklyScheduleGrid from '../components/scheduling/WeeklyScheduleGrid';
import AddPlotEntryModal from '../components/modals/AddPlotEntryModal';
import AddPlotEntryModalEnhanced from '../components/modals/AddPlotEntryModalEnhanced';
import ViewScheduleDetailsModal from '../components/modals/ViewScheduleDetailsModal';
import LoadingModal from '../components/modals/LoadingModal';
import NotificationModal from '../components/modals/NotificationModal';
import GrantScheduleAccessModal from '../components/modals/GrantScheduleAccessModal';
import ResetDeanSchedulesModal from '../components/modals/ResetDeanSchedulesModal';
import CustomSelect from '../components/ui/CustomSelect';
import { subscribeColleges } from '../services/collegeService';
import { addDays } from '../constants/scheduleGrid';
import {
  formatDisplayDate,
  getSemesterBounds,
  getInitialWeekStart,
  getWeekDates,
  getPlotDayStatus,
  parseDateOnly,
  getExamDatesForPeriod,
  getSemesterWeekNumber,
  isScheduleActiveOnWeek,
} from '../utils/academicCalendarUtils';
import {
  subscribePlotEntriesForDeanSection,
  addPlotEntryForSection,
  updatePlotEntryForSection,
  deletePlotEntryForSection,
  subscribeDeanSections,
  createDeanSection,
  updateDeanSectionModality,
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
  getAssignedRoomsForCollege,
  resetScheduleAccess,
} from '../services/scheduleAccessService';
import { SCHEDULE_DAYS } from '../constants/scheduleGrid';

// Year level options for section metadata
const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];

// Modality options for section / class scheduling
const MODALITY_OPTIONS = [
  { value: 'regular', label: 'Every Week (Classroom)', badge: 'Weekly' },
  { value: 'odd-weeks', label: 'Classroom (Odd Wks) / OJT (Even Wks)', badge: 'Odd Wks Class / Even Wks OJT' },
  { value: 'even-weeks', label: 'Classroom (Even Wks) / OJT (Odd Wks)', badge: 'Even Wks Class / Odd Wks OJT' },
];


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
  const [colleges, setColleges] = useState([]);
  const [expandedColleges, setExpandedColleges] = useState({});
  const [selectedDeanUid, setSelectedDeanUid] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState('ALL'); // 'ALL' or specific programCode like 'BSMT', 'BSN'
  const [selectedSection, setSelectedSection] = useState(null);
  const [deanSections, setDeanSections] = useState([]); // Dynamic sections from Firestore
  const [expandedYearLevels, setExpandedYearLevels] = useState({});
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');

  const currentSectionObj = useMemo(() => {
    return deanSections.find(s => s.name === selectedSection);
  }, [deanSections, selectedSection]);

  const [scheduleTab, setScheduleTab] = useState('regular');
  const [semester, setSemester] = useState('1');
  const [weekStartDate, setWeekStartDate] = useState(() => getInitialWeekStart(null));
  const [selectedExamPeriod, setSelectedExamPeriod] = useState('p1'); // 'p1', 'p2', 'p3', 'rbe'

  // Automatically determine student category (Freshmen for 1st Year, Upperclassmen for 2nd Year+)
  const selectedStudentCategory = useMemo(() => {
    if (!selectedSection && !currentSectionObj) return 'freshmen';
    
    // Check yearLevel from section object if available (e.g. "1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year")
    const yl = (currentSectionObj?.yearLevel || '').toLowerCase();
    if (yl.includes('1st') || yl.includes('first') || yl === '1') return 'freshmen';
    if (
      yl.includes('2nd') ||
      yl.includes('3rd') ||
      yl.includes('4th') ||
      yl.includes('5th') ||
      yl.includes('upper') ||
      yl === '2' ||
      yl === '3' ||
      yl === '4' ||
      yl === '5'
    ) {
      return 'upperclassmen';
    }

    // Fallback based on section name pattern (e.g., BSMT1-A1 -> 1 = freshmen, BSMT2-B1 -> 2 = upperclassmen)
    const secStr = String(selectedSection || '').toUpperCase();
    const match = secStr.match(/[A-Z]+(\d)/);
    if (match) {
      return match[1] === '1' ? 'freshmen' : 'upperclassmen';
    }

    const anyDigitMatch = secStr.match(/\d+/);
    if (anyDigitMatch) {
      return anyDigitMatch[0].startsWith('1') ? 'freshmen' : 'upperclassmen';
    }

    return 'freshmen';
  }, [currentSectionObj, selectedSection]);

  const semesterOptions = useMemo(() => {
    if (Array.isArray(calendarData?.config?.semesters) && calendarData.config.semesters.length > 0) {
      return calendarData.config.semesters.map((s, idx) => ({
        value: String(idx + 1),
        label: s.name || (idx === 2 ? 'Summer' : `Semester ${idx + 1}`),
        start: s.start,
        end: s.end,
      }));
    }
    return [
      { value: '1', label: 'Semester 1', start: calendarData?.config?.semester1Start, end: calendarData?.config?.semester1End },
      { value: '2', label: 'Semester 2', start: calendarData?.config?.semester2Start, end: calendarData?.config?.semester2End },
    ];
  }, [calendarData?.config]);

  const selectedSemesterObj = useMemo(() => {
    return semesterOptions.find((s) => s.value === semester) || semesterOptions[0];
  }, [semesterOptions, semester]);

  const semesterStartStr = selectedSemesterObj?.start || null;

  const currentWeekNum = useMemo(() => {
    return getSemesterWeekNumber(weekStartDate, semesterStartStr);
  }, [weekStartDate, semesterStartStr]);

  const isSectionOnOjtThisWeek = useMemo(() => {
    if (!currentSectionObj || !currentSectionObj.modality || currentSectionObj.modality === 'regular') return false;
    return !isScheduleActiveOnWeek(currentSectionObj.modality, currentWeekNum);
  }, [currentSectionObj, currentWeekNum]);


  const toggleYearLevel = (yearLevel) => {
    setExpandedYearLevels((prev) => ({
      ...prev,
      [yearLevel]: !prev[yearLevel],
    }));
  };

  const handleUpdateSectionModality = async (newModality) => {
    if (!selectedDeanUid || !selectedSection) return;
    setIsLoading(true);
    setLoadingMessage('Updating section modality...');
    try {
      await updateDeanSectionModality(selectedDeanUid, selectedSection, newModality);
      setIsLoading(false);
      setNotification({
        type: 'success',
        title: 'Modality Updated',
        message: `Section "${selectedSection}" updated to ${MODALITY_OPTIONS.find(m => m.value === newModality)?.label}`,
      });
    } catch (err) {
      setIsLoading(false);
      setNotification({
        type: 'error',
        title: 'Update Failed',
        message: err.message || 'Failed to update section modality.',
      });
    }
  };

  
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

  const [entryModal, setEntryModal] = useState(null);
  const [viewingBlock, setViewingBlock] = useState(null);


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

  // Subscribe to colleges to get programs and degree curricula
  useEffect(() => {
    return subscribeColleges(
      (list) => setColleges(list),
      (err) => console.error('Error loading colleges in course scheduling:', err)
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
    const found = staffUsers.find(u => u.uid === selectedDeanUid);
    if (found) return found;
    if (isDean && profile) {
      return {
        uid: profile.uid,
        name: profile.displayName || profile.name || 'Dean',
        email: profile.email || '',
        college: profile.college || profile.department || '',
        department: profile.department || profile.college || '',
        role: 'Dean',
        roleValue: 'dean',
      };
    }
    return null;
  }, [staffUsers, selectedDeanUid, isDean, profile]);

  // Active college info for selected dean
  const activeCollegeCode = useMemo(() => {
    return selectedDean?.college || selectedDean?.department || (isDean ? (profile?.college || profile?.department) : '') || '';
  }, [selectedDean, isDean, profile]);

  const activeCollegeObj = useMemo(() => {
    // 1. Direct match by dean ID or email in colleges collection
    if (selectedDeanUid) {
      const byDean = colleges.find(
        (c) =>
          c.deanUid === selectedDeanUid ||
          (c.deanEmail && selectedDean?.email && String(c.deanEmail).trim().toLowerCase() === String(selectedDean.email).trim().toLowerCase()) ||
          (isDean && profile?.email && String(c.deanEmail || '').trim().toLowerCase() === String(profile.email).trim().toLowerCase())
      );
      if (byDean) return byDean;
    }

    if (!activeCollegeCode) return null;
    const clean = String(activeCollegeCode).trim().toUpperCase();
    return colleges.find(
      (c) =>
        String(c.code || '').trim().toUpperCase() === clean ||
        String(c.name || '').trim().toLowerCase() === String(activeCollegeCode).trim().toLowerCase() ||
        String(c.name || '').trim().toUpperCase().includes(clean) ||
        clean.includes(String(c.name || '').trim().toUpperCase()) ||
        String(c.code || '').trim().toUpperCase().includes(clean) ||
        clean.includes(String(c.code || '').trim().toUpperCase()) ||
        (Array.isArray(c.programs) && c.programs.some((p) => {
          const pCode = String(p.code || '').trim().toUpperCase();
          const pName = String(p.name || '').trim().toUpperCase();
          return pCode === clean || pName === clean || pCode.includes(clean) || clean.includes(pCode);
        }))
    ) || null;
  }, [colleges, activeCollegeCode, selectedDeanUid, selectedDean, isDean, profile]);

  // Programs offered by this dean's college
  const availablePrograms = useMemo(() => {
    const progMap = new Map();

    // 1. From college document (configured in College Inventory)
    if (activeCollegeObj?.programs && Array.isArray(activeCollegeObj.programs)) {
      activeCollegeObj.programs.forEach((p) => {
        const pCode = String(p.code || '').trim().toUpperCase();
        if (pCode) {
          progMap.set(pCode, {
            code: pCode,
            name: p.name || pCode,
            coursesCount: Array.isArray(p.courses) ? p.courses.length : 0,
          });
        }
      });
    }

    // 2. Supplement with any programCode found in deanSections
    deanSections.forEach((s) => {
      const pCode = String(s.programCode || '').trim().toUpperCase();
      if (pCode && !progMap.has(pCode)) {
        progMap.set(pCode, {
          code: pCode,
          name: pCode,
          coursesCount: 0,
        });
      }
    });

    const list = Array.from(progMap.values());
    list.sort((a, b) => a.code.localeCompare(b.code));
    return list;
  }, [activeCollegeObj, deanSections]);

  const selectedProgramObj = useMemo(() => {
    if (!selectedProgram) return availablePrograms[0] || null;
    return availablePrograms.find((p) => p.code === selectedProgram) || availablePrograms[0] || null;
  }, [availablePrograms, selectedProgram]);

  // Auto-select first program if none selected or current selection is invalid
  useEffect(() => {
    if (availablePrograms.length > 0) {
      if (!selectedProgram || !availablePrograms.some((p) => p.code === selectedProgram)) {
        setSelectedProgram(availablePrograms[0].code);
      }
    } else {
      setSelectedProgram('');
    }
  }, [availablePrograms, selectedProgram]);

  // Handle program tab click
  const handleSelectProgram = (progCode) => {
    setSelectedProgram(progCode);
    const progSections = deanSections.filter((s) => {
      const pCode = String(s.programCode || '').trim().toUpperCase();
      return pCode ? pCode === progCode.toUpperCase() : s.name.toUpperCase().startsWith(progCode.toUpperCase());
    });
    setSelectedSection(progSections[0]?.name || null);
  };

  // Filter sections by selected program
  const displayedDeanSections = useMemo(() => {
    if (!selectedProgram) return [];
    const currentProg = String(selectedProgram).trim().toUpperCase();
    return deanSections.filter((s) => {
      const pCode = String(s.programCode || '').trim().toUpperCase();
      if (pCode) {
        return pCode === currentProg;
      }
      return s.name.toUpperCase().startsWith(currentProg);
    });
  }, [deanSections, selectedProgram]);

  // Ensure selectedSection is always scoped strictly to the active program's sections
  useEffect(() => {
    if (scheduleTab === 'exam') return;
    if (!selectedProgram) {
      setSelectedSection(null);
      return;
    }

    const validSectionNames = displayedDeanSections.map((s) => s.name);
    if (validSectionNames.length > 0) {
      if (!selectedSection || !validSectionNames.includes(selectedSection)) {
        setSelectedSection(validSectionNames[0]);
      }
    } else {
      setSelectedSection(null);
    }
  }, [selectedProgram, displayedDeanSections, selectedSection, scheduleTab]);

  // Auto-set section for exam mode (sections don't matter for exams)
  useEffect(() => {
    if (scheduleTab === 'exam') {
      setSelectedSection('exam-schedule'); // Use a generic identifier for exam schedules
    } else if (scheduleTab === 'regular' && selectedSection === 'exam-schedule') {
      // Reset to first section of active program when switching back to regular
      setSelectedSection(displayedDeanSections[0]?.name || null);
    }
  }, [scheduleTab, displayedDeanSections]);

  // Subscribe to sections for selected dean
  useEffect(() => {
    if (!selectedDeanUid) {
      setDeanSections([]);
      return undefined;
    }

    const deanCollegeCode = selectedDean?.college || selectedDean?.department || (isDean ? (profile?.college || profile?.department) : '') || '';
    const collegeCode = activeCollegeObj?.code || '';
    const programCodes = (activeCollegeObj?.programs || []).map((p) => String(p.code || '').trim().toUpperCase()).filter(Boolean);

    return subscribeDeanSections(
      selectedDeanUid,
      (sections) => {
        setDeanSections(sections);
        // Auto-expand year level dropdowns that contain sections so they are open by default
        const yearExpandState = {};
        sections.forEach((s) => {
          if (s.yearLevel) {
            yearExpandState[s.yearLevel] = true;
          }
        });
        setExpandedYearLevels((prev) => ({ ...yearExpandState, ...prev }));
      },
      (err) => console.error('Error loading sections:', err),
      deanCollegeCode || collegeCode,
      programCodes
    );

  }, [selectedDeanUid, selectedDean, activeCollegeObj, isDean, profile]);

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
      activeSchoolYearId, // Filter by active selected school year
      (entries) => {
        setPlotEntries(entries);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Failed to load schedule.');
        setLoading(false);
      }
    );
  }, [selectedDeanUid, selectedSection, semester, scheduleTab, selectedExamPeriod, activeSchoolYearId]);

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
      schoolYearId: activeSchoolYearId || null,
      schoolYear: selectedSchoolYear?.label || selectedSchoolYear?.displayLabel || activeSchoolYearId || null,
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
    setSelectedProgram('ALL');
    setSelectedSection(null); // Reset section when changing dean
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

  const deanAssignedRooms = useMemo(() => {
    const code =
      activeCollegeObj?.code ||
      selectedDean?.college ||
      selectedDean?.department ||
      (isDean ? (profile?.college || profile?.department) : '');
    return getAssignedRoomsForCollege(scheduleAccess, code);
  }, [scheduleAccess, activeCollegeObj, selectedDean, isDean, profile]);

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
      <div className="mb-5 bg-white border-2 border-[#7A0808] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-black text-sm" style={{ color: '#7A0808' }}>School Year & Semester</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">This affects all schedules and dates displayed below</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="min-w-[160px]">
              <label className="block text-[9px] font-bold uppercase text-gray-500 mb-1">School Year</label>
              <CustomSelect
                value={activeSchoolYearId || ''}
                onChange={(e) => setActiveSchoolYearId(e.target.value)}
                options={schoolYearOptions}
                placeholder="Select school year"
              />
            </div>
            <div className="min-w-[140px]">
              <label className="block text-[9px] font-bold uppercase text-gray-500 mb-1">Semester</label>
              <CustomSelect
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                options={semesterOptions}
                placeholder="Select semester"
              />
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
                className="btn-delete cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete plotted schedules by selected deans"
              >
                <Trash2 size={14} />
                Reset Schedules
              </button>

              {/* Grant First College or Reset Access Control */}
              {!scheduleAccess ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!activeSchoolYearId || !semester) {
                      showNotification({
                        type: 'warning',
                        title: 'Selection Required',
                        message: 'Please select a school year and semester first.',
                      });
                      return;
                    }
                    setShowGrantAccessModal(true);
                  }}
                  disabled={!activeSchoolYearId || !semester}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-[#7A0808] text-white hover:bg-[#600000] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                  Grant College Access
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowGrantAccessModal(true)}
                  disabled={!activeSchoolYearId || !semester}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-[#7A0808] text-white hover:bg-[#600000] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                  title="Edit granted colleges or reset access"
                >
                  <Edit size={16} />
                  Edit Access
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
                  <span className={`inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs font-bold leading-none ${
                    scheduleAccess.status === 'all_allowed' 
                      ? 'bg-green-100 text-green-800 border border-green-200' 
                      : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                  }`}>
                    {scheduleAccess.status === 'all_allowed' 
                      ? '✅ All Colleges Can Schedule' 
                      : '⏳ Granted Colleges Only'}
                  </span>
                </div>
              </div>

              {/* Granted Colleges Info & Accomplishment Window */}
              {scheduleAccess.firstCollege && (
                <div className="bg-white rounded-lg p-3 border border-gray-200 space-y-2">
                  <div>
                    <p className="text-xs font-bold" style={{ color: '#2B3235' }}>
                      Granted College(s) (Currently Scheduling):
                    </p>
                    <p className="text-sm font-black text-[#7A0808]">
                      {scheduleAccess.firstCollege.name}
                    </p>
                  </div>

                  {(scheduleAccess.startDate || scheduleAccess.endDate || scheduleAccess.firstCollege?.startDate || scheduleAccess.firstCollege?.endDate) && (
                    <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-0.5">
                      <p className="font-extrabold text-amber-950 flex items-center gap-1.5">
                        <Calendar size={13} className="text-[#7A0808]" />
                        Accomplishment Window (Day Limit):
                      </p>
                      <p className="font-bold text-gray-800">
                        {scheduleAccess.startDate || scheduleAccess.firstCollege?.startDate ? new Date(scheduleAccess.startDate || scheduleAccess.firstCollege?.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Immediate'} — {scheduleAccess.endDate || scheduleAccess.firstCollege?.endDate ? new Date(scheduleAccess.endDate || scheduleAccess.firstCollege?.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline set'}
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] text-gray-500">
                    Granted: {new Date(scheduleAccess.firstCollege.grantedAt).toLocaleString()}
                  </p>
                </div>
              )}

              {/* Action Button */}
              {scheduleAccess.status === 'first_only' && (
                <button
                  type="button"
                  onClick={() => setShowGrantAccessModal(true)}
                  className="btn-maroon w-full justify-center text-xs sm:text-sm font-bold py-3 shadow-2xs cursor-pointer flex items-center gap-2"
                >
                  <Send size={15} /> Allow / Grant Additional Colleges Access
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
        {/* Left Sidebar */}
        <div className="space-y-4">
          {/* Registrar View: Colleges & Deans Selection Card */}
          {!isDean && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-2xs">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: '#2B3235' }}>
                <Users size={14} /> Colleges & Deans
              </h3>
              
              <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
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
                        {college.deans.map((dean) => (
                          <button
                            key={dean.uid}
                            type="button"
                            onClick={() => handleSelectDean(dean.uid)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all relative ${
                              selectedDeanUid === dean.uid
                                ? 'bg-[#7A0808] text-white shadow-2xs'
                                : 'hover:bg-gray-100'
                            }`}
                            style={selectedDeanUid === dean.uid ? {} : { color: '#2B3235' }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                {dean.name}
                                <div className="text-[10px] font-normal mt-0.5 opacity-75">
                                  {dean.email}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Degree Programs Navigation Card */}
          {availablePrograms.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-2xs">
              <div className="pb-2.5 mb-3 border-b border-gray-100 flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm flex items-center gap-1.5" style={{ color: '#2B3235' }}>
                  <GraduationCap size={16} className="text-[#7A0808]" /> Degree Programs
                </h3>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  {availablePrograms.length} {availablePrograms.length === 1 ? 'Program' : 'Programs'}
                </span>
              </div>

              <div className="space-y-1.5">
                {availablePrograms.map((prog) => {
                  const isProgActive = selectedProgram === prog.code;
                  const progSectionsCount = deanSections.filter((s) => {
                    const pCode = String(s.programCode || '').trim().toUpperCase();
                    return pCode ? pCode === prog.code : s.name.toUpperCase().startsWith(prog.code);
                  }).length;

                  return (
                    <button
                      key={prog.code}
                      type="button"
                      onClick={() => handleSelectProgram(prog.code)}
                      className={`w-full text-left p-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                        isProgActive
                          ? 'bg-[#7A0808] text-white shadow-2xs'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-100'
                      }`}
                      title={`${prog.code} - ${prog.name}`}
                    >
                      <div className="truncate pr-2">
                        <div className="flex items-center gap-1.5">
                          <BookOpen size={13} className={isProgActive ? 'text-red-200' : 'text-[#7A0808]'} />
                          <span className="font-extrabold">{prog.code}</span>
                        </div>
                        <span className={`block text-[10px] font-medium truncate mt-0.5 ${
                          isProgActive ? 'text-red-100' : 'text-gray-500'
                        }`}>
                          {prog.name}
                        </span>
                      </div>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                        isProgActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {progSectionsCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sections per Year Level Sidebar (Rendered for both Dean and Registrar) */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-2xs">
            <div className="pb-2.5 mb-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <h3 className="font-bold text-sm flex items-center gap-1.5" style={{ color: '#2B3235' }}>
                <Layers size={16} className="text-[#7A0808]" /> Sections per Year Level
              </h3>
              {selectedProgram !== 'ALL' && selectedProgram && (
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 truncate max-w-[100px]" title={`Filtered by ${selectedProgram}`}>
                  {selectedProgram}
                </span>
              )}
              {selectedProgram === 'ALL' && !isDean && selectedDean && (
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-red-50 text-[#7A0808] truncate max-w-[110px]" title={selectedDean.college || selectedDean.department || selectedDean.name}>
                  {selectedDean.college || selectedDean.department || selectedDean.name}
                </span>
              )}
            </div>

            {/* Search Bar Below Divider Line */}
            <div className="mb-3">
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={sectionSearchQuery}
                  onChange={(e) => setSectionSearchQuery(e.target.value)}
                  placeholder="Search sections..."
                  className="w-full pl-9 pr-7 py-2 bg-gray-50/80 border border-gray-200 rounded-full text-xs font-semibold focus:bg-white focus:border-[#7A0808] focus:ring-1 focus:ring-[#7A0808] transition-all outline-none"
                />
                {sectionSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setSectionSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {(() => {
                const isSearching = Boolean(sectionSearchQuery.trim());
                const searchTerm = sectionSearchQuery.toLowerCase().trim();

                return YEAR_LEVELS.map((yearLevel) => {
                  const sectionsForYear = displayedDeanSections.filter((s) => {
                    const matchesYear = s.yearLevel === yearLevel;
                    if (!isSearching) return matchesYear;
                    return matchesYear && s.name?.toLowerCase().includes(searchTerm);
                  });

                  // Auto-expand year level if searching and has matching sections
                  const isOpen = isSearching ? sectionsForYear.length > 0 : Boolean(expandedYearLevels[yearLevel]);

                  if (isSearching && sectionsForYear.length === 0) return null;

                  return (
                    <div key={yearLevel} className="space-y-1">
                      {/* Year Level Header Dropdown */}
                      <button
                        type="button"
                        onClick={() => toggleYearLevel(yearLevel)}
                        className="w-full px-3 py-2 bg-white hover:bg-gray-50/80 rounded-xl border border-gray-200 transition-all flex items-center justify-between shadow-2xs group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs" style={{ color: '#2B3235' }}>
                            {yearLevel}
                          </span>
                          <span className="text-[10px] font-black min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-[6px] bg-[#F59E0B] text-white shadow-2xs">
                            {sectionsForYear.length}
                          </span>
                        </div>
                        {isOpen ? (
                          <ChevronDown size={14} className="text-gray-400 group-hover:text-gray-600 transition-transform" />
                        ) : (
                          <ChevronRight size={14} className="text-gray-400 group-hover:text-gray-600 transition-transform" />
                        )}
                      </button>

                      {/* Sections Sub-List */}
                      {isOpen && (
                        <div className="ml-2 mt-1 space-y-1 pl-2 border-l-2 border-red-100">
                          {sectionsForYear.length === 0 ? (
                            <p className="text-[10px] text-gray-400 italic px-2 py-1">
                              No {yearLevel} sections
                            </p>
                          ) : (
                            sectionsForYear.map((section) => {
                              const isSelected = selectedSection === section.name;

                              return (
                                <div
                                  key={section.name}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSelectedSection(section.name)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      setSelectedSection(section.name);
                                    }
                                  }}
                                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all relative flex items-center justify-between group cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#7A0808] text-white shadow-2xs'
                                      : 'bg-white hover:bg-gray-100 text-gray-800 border border-gray-100'
                                  }`}
                                >
                                  <span className="truncate">{section.name}</span>
                                  {canPlot && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteSection(section.name);
                                      }}
                                      className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                                        isSelected ? 'text-white hover:bg-red-700' : 'text-red-500 hover:bg-red-100'
                                      }`}
                                      title="Delete section"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div>
          {selectedDean ? (
            <div className="space-y-4">
              {/* Active Section Info Header - Regular Schedule */}
              {scheduleTab === 'regular' && (
                <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 space-y-3 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-black text-base" style={{ color: '#2B3235' }}>
                          {selectedDean.department || selectedDean.college}
                        </h3>
                        {(selectedProgramObj || currentSectionObj?.programCode) && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200 px-3.5 py-1.5 rounded-full shadow-2xs leading-normal">
                            <GraduationCap size={13} className="text-amber-700" />
                            Program: <span className="font-extrabold">{selectedProgramObj?.code || currentSectionObj?.programCode}</span>
                            {selectedProgramObj?.name ? ` · ${selectedProgramObj.name}` : ''}
                          </span>
                        )}
                        {selectedSection && (
                          <span className="inline-flex items-center justify-center text-xs font-bold bg-[#7A0808] text-white px-3.5 py-1.5 rounded-full shadow-2xs leading-normal">
                            Section: {selectedSection}
                          </span>
                        )}
                        <span className="inline-flex items-center justify-center text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3.5 py-1.5 rounded-full shadow-2xs leading-normal">
                          Week {currentWeekNum}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-gray-500 mt-2.5 flex items-center gap-1.5">
                        {selectedDean.name} · {selectedDean.email}
                      </p>
                    </div>

                    {/* Section Modality Selector */}
                    {selectedSection && (
                      <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200">
                        <span className="text-xs font-bold text-gray-700 whitespace-nowrap">Class Modality:</span>
                        {canPlot ? (
                          <div className="min-w-[220px]">
                            <CustomSelect
                              value={currentSectionObj?.modality || 'regular'}
                              onChange={(e) => handleUpdateSectionModality(e.target.value)}
                              options={MODALITY_OPTIONS}
                            />
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-gray-800 bg-white px-2 py-1 rounded border border-gray-200">
                            {MODALITY_OPTIONS.find(m => m.value === (currentSectionObj?.modality || 'regular'))?.label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* OJT Week Banner */}
                  {isSectionOnOjtThisWeek && (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 flex items-center justify-between gap-3 text-amber-900 animate-pulse">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">🎓</span>
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider">Students Currently on OJT / Fieldwork (Week {currentWeekNum})</p>
                          <p className="text-[11px] font-medium text-amber-800">
                            Classroom schedules for Section <span className="font-bold">{selectedSection}</span> are temporarily hidden this week. Next week they will automatically return.
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-200 text-amber-900 whitespace-nowrap">
                        OJT Week Active
                      </span>
                    </div>
                  )}
                </div>
              )}


              {/* Exam Schedule Controls - Only show for exam schedule */}
              {scheduleTab === 'exam' && (
                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
                    <div>
                      <h3 className="font-black text-base" style={{ color: '#2B3235' }}>
                        {selectedDean.department || selectedDean.college}
                      </h3>
                      <p className="text-xs font-medium mt-0.5" style={{ color: '#2B3235', opacity: 0.65 }}>
                        {selectedDean.name} · {selectedDean.email}
                      </p>
                    </div>

                    {/* Section & Auto Category Tag */}
                    {selectedSection && (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-800 text-xs font-bold">
                          Section: <span className="text-[#7A0808] font-black">{selectedSection}</span>
                        </span>
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-black ${
                          selectedStudentCategory === 'freshmen'
                            ? 'bg-red-50 text-[#7A0808] border border-red-200'
                            : 'bg-blue-50 text-blue-900 border border-blue-200'
                        }`}>
                          {selectedStudentCategory === 'freshmen' ? '🎓 Freshmen (1st Year)' : '🎓 Upperclassmen (2nd Year+)'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* Exam Period */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#7A0808]">
                          Select Exam Period
                        </p>
                        <span className="text-[10px] font-bold text-gray-500">
                          Category: <strong className="text-gray-800">{selectedStudentCategory === 'freshmen' ? 'Freshmen (1st Yr)' : 'Upperclassmen (2nd Yr+)'}</strong>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {EXAM_PERIODS.map((period) => (
                          <button
                            key={period.key}
                            type="button"
                            onClick={() => setSelectedExamPeriod(period.key)}
                            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              selectedExamPeriod === period.key
                                ? 'bg-[#7A0808] text-white shadow-xs'
                                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                          >
                            {period.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-600 mt-2.5 flex items-center gap-1.5 font-medium">
                        <span>📅</span>
                        <span>
                          Showing exam schedule for <strong className="text-[#7A0808]">{selectedSection || 'Section'}</strong> ({selectedStudentCategory === 'freshmen' ? 'Freshmen / 1st Year' : 'Upperclassmen / 2nd Year+'})
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Weekly Schedule Grid or Empty Program Placeholder */}
              {!selectedSection ? (
                <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center space-y-3 shadow-2xs">
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center mx-auto border border-amber-200 shadow-2xs">
                    <GraduationCap size={32} />
                  </div>
                  <h3 className="font-bold text-base text-gray-800">
                    No Section Selected
                  </h3>
                  <p className="text-xs text-gray-500 max-w-md mx-auto">
                    {displayedDeanSections.length === 0
                      ? 'There are currently no sections created for this academic program. Go to College Inventory to create and configure sections for this program.'
                      : `Please select a section from the left sidebar to view or plot its ${scheduleTab === 'exam' ? 'exam' : 'weekly'} schedule.`}
                  </p>
                </div>
              ) : (
                <WeeklyScheduleGrid
                  title={scheduleTab === 'exam' 
                    ? `${selectedDean.department || selectedDean.college} · Section ${selectedSection || ''} · ${selectedStudentCategory === 'freshmen' ? 'Freshmen' : 'Upperclassmen'} · ${selectedExamPeriod.toUpperCase()}`
                    : `${selectedDean.department || selectedDean.college} · ${selectedProgramObj?.code || ''} · Section ${selectedSection || ''}`
                  }
                  schoolYearLabel={schoolYearLabel}
                  schoolYearOptions={[]} // Empty - selector moved to top
                  onSchoolYearChange={undefined} // Disabled - controlled from top
                  semester={semester}
                  onSemesterChange={setSemester} // Re-enabled for quick switching
                  semesterOptions={semesterOptions}
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
                    const defaultIdx = firstOpenIdx >= 0 ? firstOpenIdx : 0;
                    const dayIdentifier = scheduleTab === 'regular' ? WEEKDAYS[defaultIdx] : (dayStatuses[defaultIdx]?.date || weekDates[defaultIdx]);
                    setEntryModal({
                      mode: 'add',
                      date: dayIdentifier,
                      dayLabel: SCHEDULE_DAYS[defaultIdx],
                      lockTimes: false,
                      initial: null,
                      fromDrag: false,
                    });
                  }}
                  onSlotSelect={handleSlotSelect}
                  onEditBlock={openEditModal}
                  onDeleteBlock={handleDeleteEntry}
                  onBlockClick={(block) => setViewingBlock(block)}
                  emptyMessage={canPlot ? 'Click or drag on the grid to add schedule blocks.' : 'No schedule blocks yet.'}
                />
              )}
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

      {/* View Course Schedule Details Modal */}
      {viewingBlock && (
        <ViewScheduleDetailsModal
          block={viewingBlock}
          onClose={() => setViewingBlock(null)}
          onEdit={(block) => {
            setViewingBlock(null);
            openEditModal(block);
          }}
          onDelete={(block) => {
            setViewingBlock(null);
            handleDeleteEntry(block);
          }}
          canEdit={canPlot && isDean && profile?.uid === selectedDeanUid}
          schoolYearLabel={schoolYearLabel}
          semesterLabel={selectedSemesterObj?.label || `Semester ${semester}`}
        />
      )}

      {entryModal && canPlot && isDean ? (
        <AddPlotEntryModalEnhanced
          key={`${entryModal.mode}-${entryModal.date}-${entryModal.initial?.startTime}-${entryModal.initial?.endTime}-${entryModal.fromDrag}`}
          onClose={() => setEntryModal(null)}
          onSave={handleSaveEntry}
          initial={entryModal.initial}
          fromDrag={entryModal.fromDrag}
          date={entryModal.date}
          dayLabel={entryModal.dayLabel}
          scheduleMode={scheduleTab}
          assignedRooms={deanAssignedRooms}
          dayBlockReason={entryModalDayStatus?.disabled ? entryModalDayStatus.reason : null}
          lockTimes={entryModal.lockTimes}
          deanCollege={selectedDean?.college || selectedDean?.department}
          deanUid={selectedDeanUid}
          programCode={currentSectionObj?.programCode || (selectedProgram !== 'ALL' ? selectedProgram : null)}
          programName={availablePrograms.find((p) => p.code === (currentSectionObj?.programCode || selectedProgram))?.name || ''}
          sections={displayedDeanSections}
          initialSection={selectedSection || ''}
          semester={semester}
          schoolYearId={activeSchoolYearId}
          sectionYearLevel={currentSectionObj?.yearLevel || '1st Year'}
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
          assignedRooms={deanAssignedRooms}
          dayBlockReason={entryModalDayStatus?.disabled ? entryModalDayStatus.reason : null}
          lockTimes={entryModal.lockTimes}
        />
      ) : null}

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

      {/* Grant Schedule Access Modal */}
      {showGrantAccessModal && (
        <GrantScheduleAccessModal
          isOpen={showGrantAccessModal}
          onClose={() => setShowGrantAccessModal(false)}
          schoolYearId={activeSchoolYearId}
          semester={semester}
          semesterLabel={selectedSemesterObj?.label}
          initialCollegeCodes={scheduleAccess?.approvedColleges || []}
          initialStartDate={scheduleAccess?.startDate || scheduleAccess?.firstCollege?.startDate || ''}
          initialEndDate={scheduleAccess?.endDate || scheduleAccess?.firstCollege?.endDate || ''}
          initialAssignedRooms={scheduleAccess?.assignedRooms || []}
          onReset={async () => {
            setShowGrantAccessModal(false);
            const confirmed = await showConfirm({
              title: 'Reset Access Control?',
              message: 'This will remove all granted permissions so you can start fresh. Existing schedules will NOT be deleted.',
              confirmText: 'Reset Access Control',
              cancelText: 'Cancel',
              variant: 'danger',
            });
            if (!confirmed) return;

            setIsLoading(true);
            setLoadingMessage('Resetting access control...');
            try {
              await resetScheduleAccess(activeSchoolYearId, semester);
              setIsLoading(false);
              showNotification({
                type: 'success',
                title: 'Access Control Reset',
                message: 'Schedule access control has been reset. You can now grant access again.',
              });
            } catch (err) {
              setIsLoading(false);
              showNotification({
                type: 'error',
                title: 'Reset Failed',
                message: err.message || 'Failed to reset access control.',
              });
            }
          }}
          onSave={async (payload) => {
            setShowGrantAccessModal(false);
            setIsLoading(true);
            setLoadingMessage(scheduleAccess ? 'Updating schedule access...' : 'Granting college access...');
            try {
              await grantFirstCollegeAccess(payload);
              setIsLoading(false);
              showNotification({
                type: 'success',
                title: scheduleAccess ? 'Access Updated' : 'Access Granted',
                message: scheduleAccess
                  ? 'Granted college access and room allocations have been updated successfully.'
                  : 'The selected college(s) have been granted scheduling access.',
              });
            } catch (err) {
              setIsLoading(false);
              showNotification({
                type: 'error',
                title: 'Save Failed',
                message: err.message || 'Failed to save schedule access.',
              });
            }
          }}
        />
      )}

      {/* Reset Dean Schedules Modal */}
      {showResetSchedulesModal && (
        <ResetDeanSchedulesModal
          isOpen={showResetSchedulesModal}
          onClose={() => setShowResetSchedulesModal(false)}
          onConfirm={async (deanUids, sem, sy) => {
            setIsLoading(true);
            setLoadingMessage(`Deleting schedules for ${deanUids.length} dean(s)...`);
            try {
              const result = await resetMultipleDeansSchedules(deanUids, sem, activeSchoolYearId);
              setIsLoading(false);
              showNotification({
                type: 'success',
                title: 'Schedules Deleted',
                message: `Successfully deleted ${result.totalDeleted} schedule entries across ${deanUids.length} dean(s).`,
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
          deanUsers={staffUsers.filter((u) => u.roleValue === 'dean' || u.role?.toLowerCase() === 'dean' || u.role?.toLowerCase().includes('dean'))}
          semester={semester}
          semesterLabel={selectedSemesterObj?.label}
          schoolYear={schoolYearLabel}
        />
      )}

      {/* Global Confirmation & Notification Modals (Rendered last so they sit on top of all active page modals) */}
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
    </Layout>
  );
}
