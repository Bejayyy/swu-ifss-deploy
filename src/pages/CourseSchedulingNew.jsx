import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Calendar,
  Plus,
  Send,
  ChevronDown,
  ChevronRight,
  Users,
  X,
  Trash2,
  Layers,
  Search,
  Edit,
  GraduationCap,
  BookOpen,
  RefreshCw,
  Building2,
  Bell,
  ExternalLink,
} from 'lucide-react';
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
import NotifyServiceCollegeModal from '../components/modals/NotifyServiceCollegeModal';
import CustomSelect from '../components/ui/CustomSelect';
import { subscribeColleges } from '../services/collegeService';
import { subscribeToBuildings } from '../services/buildingService';
import { subscribeCollegeCourses, subscribeServiceCollegeCourses } from '../services/courseService';
import { subscribeServiceCourseReleases, isServiceCourseReleased } from '../services/serviceCourseReleaseService';
import { notifyServiceCollegeDeans } from '../services/notificationService';
import { submitScheduleApprovalRequest } from '../services/scheduleApprovalService';
import { getCollegeProgramSections, generateSectionNames } from '../services/sectionService';
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
  normalizeSchoolYearLabel,
} from '../utils/academicCalendarUtils';
import {
  subscribePlotEntriesForDeanSection,
  subscribeAllPlotEntriesForSection,
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

const getCourseYearLevel = (course = {}) => {
  const raw = String(course.yearLevel || course.year || course.yearNumber || '').trim();
  const number = Number.parseInt(raw, 10);
  if (number >= 1 && number <= YEAR_LEVELS.length) return YEAR_LEVELS[number - 1];
  const exact = YEAR_LEVELS.find((level) => level.toLowerCase() === raw.toLowerCase());
  return exact || 'Unspecified Year';
};

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
  const { state: navigationState } = useLocation();
  const { profile } = useAuth();
  const isRegistrar = profile?.role === ROLES.REGISTRAR;
  const isDean = profile?.role === ROLES.DEAN;
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();

  useEffect(() => {
    const rejectedRequest = navigationState?.rejectedScheduleRequest;
    if (!rejectedRequest) return;
    showNotification({
      type: 'warning',
      title: `Replot ${rejectedRequest.courseCode || 'course'} schedule`,
      message: `${rejectedRequest.rejectionReason || 'The previous room schedule was rejected.'} Select the course again, then choose a different room or preferred time and submit the replacement for approval.`,
      autoCloseMs: 0,
    });
  }, [navigationState?.rejectedScheduleRequest, showNotification]);

  const {
    schoolYears,
    activeSchoolYearId,
    setActiveSchoolYearId,
    calendarData,
  } = useAcademicCalendar();

  const [staffUsers, setStaffUsers] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [buildingList, setBuildingList] = useState([]);
  const [expandedColleges, setExpandedColleges] = useState({});
  const [selectedDeanUid, setSelectedDeanUid] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState('ALL'); // 'ALL' or specific programCode like 'BSMT', 'BSN'
  const [selectedSection, setSelectedSection] = useState(null);
  const [deanSections, setDeanSections] = useState([]); // Dynamic sections from Firestore
  const [expandedYearLevels, setExpandedYearLevels] = useState({});
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');

  const [scheduleTab, setScheduleTab] = useState('regular');
  const [semester, setSemester] = useState('1');
  const [weekStartDate, setWeekStartDate] = useState(() => getInitialWeekStart(null));
  const [selectedExamPeriod, setSelectedExamPeriod] = useState('p1'); // 'p1', 'p2', 'p3', 'rbe'

  // Service College (Cross-College Teaching Assignments) State
  const [serviceCourses, setServiceCourses] = useState([]);
  const [serviceSectionsMap, setServiceSectionsMap] = useState({}); // { [courseId]: [ { name, programCode, yearNumber, motherCollege } ] }
  const [expandedServiceCourses, setExpandedServiceCourses] = useState({});
  const [expandedServiceMothers, setExpandedServiceMothers] = useState({});
  const [activeServiceAssignment, setActiveServiceAssignment] = useState(null);
  const [curriculumCourses, setCurriculumCourses] = useState([]);
  const [showNotifyServiceModal, setShowNotifyServiceModal] = useState(false);
  const [serviceCourseReleases, setServiceCourseReleases] = useState([]);

  // Subscribe to service course releases for the active school year and semester
  useEffect(() => {
    if (!activeSchoolYearId || !semester) {
      setServiceCourseReleases([]);
      return;
    }
    return subscribeServiceCourseReleases(
      activeSchoolYearId,
      semester,
      (releases) => setServiceCourseReleases(releases || []),
      (err) => console.warn('Error subscribing to service course releases:', err)
    );
  }, [activeSchoolYearId, semester]);

  useEffect(() => subscribeToBuildings(
    setBuildingList,
    (error) => console.warn('Course scheduling building listener:', error),
  ), []);

  const currentSectionObj = useMemo(() => {
    const ownSection = deanSections.find(s => s.name === selectedSection);
    if (ownSection) return ownSection;
    if (activeServiceAssignment) {
      return (serviceSectionsMap[activeServiceAssignment.course?.id] || []).find((s) => s.name === selectedSection) || null;
    }
    return null;
  }, [deanSections, selectedSection, activeServiceAssignment, serviceSectionsMap]);

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
  const [cycleViewTab, setCycleViewTab] = useState('all'); // 'all' | 'week_a' | 'week_b'

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
    const found = staffUsers.find((u) => u.uid === selectedDeanUid);
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
  }, [
    staffUsers,
    selectedDeanUid,
    isDean,
    profile?.uid,
    profile?.displayName,
    profile?.name,
    profile?.email,
    profile?.college,
    profile?.department,
  ]);

  // Active college code for selected dean
  const activeCollegeCode = useMemo(() => {
    return (
      selectedDean?.college ||
      selectedDean?.department ||
      (isDean ? profile?.college || profile?.department : '') ||
      ''
    );
  }, [
    selectedDean?.college,
    selectedDean?.department,
    isDean,
    profile?.college,
    profile?.department,
  ]);

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

  const isGENoSections = useMemo(() => {
    return Boolean(
      activeCollegeObj?.managesGeneralEducationCourses &&
      (activeCollegeObj?.noOwnSections || activeCollegeObj?.doesNotHandleSections)
    );
  }, [activeCollegeObj]);

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
      setSelectedProgram((prev) => {
        if (!prev || !availablePrograms.some((p) => p.code === prev)) {
          return availablePrograms[0].code;
        }
        return prev;
      });
    } else {
      setSelectedProgram((prev) => (prev !== '' ? '' : prev));
    }
  }, [availablePrograms]);

  // Handle program tab click
  const handleSelectProgram = (progCode) => {
    // Program cards and their sections belong to the dean's own college.
    // Never carry a previous cross-college assignment into this context.
    setActiveServiceAssignment(null);
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
      setSelectedSection((prev) => (prev !== null ? null : prev));
      return;
    }

    const validSectionNames = displayedDeanSections.map((s) => s.name);
    if (validSectionNames.length > 0) {
      setSelectedSection((prev) => {
        if (!prev || !validSectionNames.includes(prev)) {
          return validSectionNames[0];
        }
        return prev;
      });
    } else {
      setSelectedSection((prev) => (prev !== null ? null : prev));
    }
  }, [selectedProgram, displayedDeanSections, scheduleTab]);

  // Auto-set section for exam mode (sections don't matter for exams)
  useEffect(() => {
    if (scheduleTab === 'exam') {
      setSelectedSection('exam-schedule'); // Use a generic identifier for exam schedules
    } else if (scheduleTab === 'regular') {
      setSelectedSection((prev) => {
        if (prev === 'exam-schedule') {
          return displayedDeanSections[0]?.name || null;
        }
        return prev;
      });
    }
  }, [scheduleTab, displayedDeanSections]);

  const activeCollegeCodeStr = activeCollegeObj?.code || '';
  const activeProgramCodesKey = useMemo(() => {
    return (activeCollegeObj?.programs || [])
      .map((p) => String(p.code || '').trim().toUpperCase())
      .filter(Boolean)
      .sort()
      .join(',');
  }, [activeCollegeObj?.programs]);

  // Subscribe to sections for selected dean
  useEffect(() => {
    if (!selectedDeanUid) {
      setDeanSections([]);
      return undefined;
    }

    const deanCollegeCode = selectedDean?.college || selectedDean?.department || (isDean ? (profile?.college || profile?.department) : '') || '';
    const programCodes = activeProgramCodesKey ? activeProgramCodesKey.split(',') : [];

    return subscribeDeanSections(
      selectedDeanUid,
      (sections) => {
        setDeanSections(sections);
        // Auto-expand year level dropdowns that contain sections so they are open by default
        setExpandedYearLevels((prev) => {
          let hasNew = false;
          const next = { ...prev };
          sections.forEach((s) => {
            if (s.yearLevel && !next[s.yearLevel]) {
              next[s.yearLevel] = true;
              hasNew = true;
            }
          });
          return hasNew ? next : prev;
        });
      },
      (err) => console.error('Error loading sections:', err),
      deanCollegeCode || activeCollegeCodeStr,
      programCodes
    );

  }, [selectedDeanUid, selectedDean?.college, selectedDean?.department, activeCollegeCodeStr, activeProgramCodesKey, isDean, profile?.college, profile?.department]);

  // Subscribe to plot entries for selected section (across all mother and service colleges)
  useEffect(() => {
    if (!selectedSection) {
      setPlotEntries([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return subscribeAllPlotEntriesForSection(
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
  }, [selectedSection, semester, scheduleTab, selectedExamPeriod, activeSchoolYearId]);

  // Check if current dean has scheduling access
  const deanCollegeContext = useMemo(() => {
    if (!isDean) return null;
    return {
      college: profile?.college,
      department: profile?.department,
      code: activeCollegeObj?.code,
      name: activeCollegeObj?.name,
      programs: activeCollegeObj?.programs,
    };
  }, [isDean, profile, activeCollegeObj]);

  // Subscribe to curriculum courses for current dean / active college
  useEffect(() => {
    const colCode = activeCollegeObj?.code || selectedDean?.college || selectedDean?.department;
    if (!colCode) {
      setCurriculumCourses([]);
      return;
    }
    return subscribeCollegeCourses(
      colCode,
      (courses) => setCurriculumCourses(courses || []),
      (err) => console.warn('Error loading curriculum courses:', err)
    );
  }, [activeCollegeObj, selectedDean]);

  // Subscribe to service college courses (courses where this college is the designated Service College)
  useEffect(() => {
    const myCol = isDean
      ? (profile?.college || profile?.department || '')
      : (selectedDean?.college || selectedDean?.department || '');
    if (!myCol) {
      setServiceCourses([]);
      return;
    }
    return subscribeServiceCollegeCourses(
      myCol,
      async (courses) => {
        setServiceCourses(courses || []);
        // Fetch sections for each mother college & program
        const secMap = {};
        for (const crs of (courses || [])) {
          if (crs.collegeCode && crs.programCode) {
            try {
              const motherSecs = await getCollegeProgramSections(crs.collegeCode);
              const matchedSecs = (motherSecs || []).filter(
                (s) => s.programCode?.toUpperCase() === crs.programCode.toUpperCase()
              );
              const generated = [];
              matchedSecs.forEach((m) => {
                const yearNum = m.yearNumber || 1;
                const count = Number(m.sectionCount) || 0;
                const names = generateSectionNames(crs.programCode, yearNum, count);
                names.forEach((name) => {
                  generated.push({
                    name,
                    programCode: crs.programCode,
                    yearNumber: yearNum,
                    motherCollege: crs.collegeCode,
                    hasOjtAlternatingModality: Boolean(m.hasOjtAlternatingModality),
                  });
                });
              });
              secMap[crs.id] = generated;
            } catch (err) {
              console.warn('Error fetching mother college sections for service course:', err);
            }
          }
        }
        setServiceSectionsMap(secMap);
      },
      (err) => console.error('Error loading service courses:', err)
    );
  }, [isDean, profile, selectedDean]);

  // Group service courses by unique course code
  const groupedServiceCourses = useMemo(() => {
    const map = new Map();
    (serviceCourses || []).forEach((c) => {
      const key = c.code || c.title;
      if (!map.has(key)) {
        map.set(key, {
          courseCode: c.code,
          courseTitle: c.title,
          courses: [],
        });
      }
      map.get(key).courses.push(c);
    });
    return Array.from(map.values());
  }, [serviceCourses]);

  const servicedMotherColleges = useMemo(() => {
    const map = new Map();
    (serviceCourses || []).forEach((course) => {
      const code = String(course.collegeCode || '').trim().toUpperCase();
      if (!code) return;
      const college = colleges.find((item) => String(item.code || '').trim().toUpperCase() === code);
      if (!map.has(code)) map.set(code, { code, name: college?.name || code, courseCount: 0, sectionCount: 0 });
      const entry = map.get(code);
      entry.courseCount += 1;
      entry.sectionCount += (serviceSectionsMap[course.id] || []).length;
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [serviceCourses, serviceSectionsMap, colleges]);

  const selectedSectionCourseChecklist = useMemo(() => {
    if (!selectedSection || scheduleTab !== 'regular') return [];

    const sourceCourses = activeServiceAssignment?.course ? [activeServiceAssignment.course] : curriculumCourses;
    const sectionProgram = String(currentSectionObj?.programCode || selectedProgram || '').trim().toUpperCase();
    const sectionYear = getCourseYearLevel(currentSectionObj || {});
    const selectedSemesterNumber = Number.parseInt(String(semester), 10) || 1;
    const normalizeSemester = (course) => {
      const raw = String(course.semester || course.term || '').toLowerCase();
      const number = Number.parseInt(raw, 10);
      if (number) return number;
      if (raw.includes('second')) return 2;
      if (raw.includes('summer') || raw.includes('third')) return 3;
      return 1;
    };

    return sourceCourses
      .filter((course) => {
        if (activeServiceAssignment) return true;
        const courseProgram = String(course.programCode || course.program || '').trim().toUpperCase();
        const programMatches = !sectionProgram || sectionProgram === 'ALL' || courseProgram === sectionProgram;
        return programMatches && getCourseYearLevel(course) === sectionYear && normalizeSemester(course) === selectedSemesterNumber;
      })
      .map((course) => {
        const code = String(course.code || course.courseCode || '').trim();
        const entries = plotEntries.filter(
          (entry) => String(entry.courseCode || entry.code || '').trim().toUpperCase() === code.toUpperCase()
        );
        const requiredLecture = Number(course.lecHours ?? course.lectureHours ?? course.lecUnits ?? 0);
        const requiredLaboratory = Number(course.labHours ?? course.laboratoryHours ?? 0) || Number(course.labUnits ?? 0) * 3;
        const plottedHours = (type) => entries
          .filter((entry) => String(entry.type || '').toLowerCase().includes(type))
          .reduce((total, entry) => total + Math.max(0, Number(entry.endHour || 0) - Number(entry.startHour || 0)), 0);
        const lectureDone = requiredLecture <= 0 || plottedHours('lecture') >= requiredLecture;
        const laboratoryDone = requiredLaboratory <= 0 || plottedHours('lab') >= requiredLaboratory;
        const status = lectureDone && laboratoryDone && entries.length > 0
          ? 'complete'
          : entries.length > 0 ? 'partial' : 'pending';
        return { code, title: course.title || course.courseTitle || '', status };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [selectedSection, scheduleTab, activeServiceAssignment, curriculumCourses, currentSectionObj, selectedProgram, semester, plotEntries]);

  // Check if current active service assignment has been released by Mother College
  const isCurrentServiceAssignmentReleased = useMemo(() => {
    if (!activeServiceAssignment) return true;
    if (isGENoSections) return true;
    return isServiceCourseReleased(serviceCourseReleases, {
      courseId: activeServiceAssignment.course?.id,
      courseCode: activeServiceAssignment.course?.code,
      component: activeServiceAssignment.component,
      sectionName: selectedSection,
      serviceCollegeCode: profile?.college || profile?.department || selectedDean?.college,
      motherCollegeCode: activeServiceAssignment.motherCollege,
    });
  }, [activeServiceAssignment, isGENoSections, serviceCourseReleases, selectedSection, profile, selectedDean]);

  // Count unreleased service courses in the active curriculum for the selected section
  const unreleasedServiceCourseCount = useMemo(() => {
    if (!curriculumCourses || curriculumCourses.length === 0) return 0;
    const isGENoSecCol = (code) => {
      if (!code) return false;
      const norm = String(code).trim().toUpperCase();
      return colleges.some(
        (col) =>
          (String(col.code).trim().toUpperCase() === norm || String(col.name).trim().toUpperCase() === norm) &&
          col.managesGeneralEducationCourses &&
          (col.noOwnSections || col.doesNotHandleSections)
      );
    };

    const serviceList = curriculumCourses.filter((c) => {
      const lecCol = c.lecServiceCollege ? String(c.lecServiceCollege).trim().toUpperCase() : null;
      const labCol = c.labServiceCollege ? String(c.labServiceCollege).trim().toUpperCase() : null;
      if (!lecCol && !labCol) return false;
      if ((!lecCol || isGENoSecCol(lecCol)) && (!labCol || isGENoSecCol(labCol))) return false;
      return true;
    });

    return serviceList.filter((c) => !isServiceCourseReleased(serviceCourseReleases, {
      courseId: c.id,
      courseCode: c.code,
      sectionName: selectedSection,
      motherCollegeCode: activeCollegeObj?.code || activeCollegeCode,
    })).length;
  }, [curriculumCourses, colleges, serviceCourseReleases, selectedSection, activeCollegeObj, activeCollegeCode]);

  // Handle Mother College Dean clicking Notify Service College - opens release modal
  const handleNotifyServiceCollege = () => {
    const isGENoSecCol = (code) => {
      if (!code) return false;
      const norm = String(code).trim().toUpperCase();
      return colleges.some(
        (col) =>
          (String(col.code).trim().toUpperCase() === norm || String(col.name).trim().toUpperCase() === norm) &&
          col.managesGeneralEducationCourses &&
          (col.noOwnSections || col.doesNotHandleSections)
      );
    };

    const serviced = (curriculumCourses || []).filter((c) => {
      const lecCol = c.lecServiceCollege ? String(c.lecServiceCollege).trim().toUpperCase() : null;
      const labCol = c.labServiceCollege ? String(c.labServiceCollege).trim().toUpperCase() : null;
      if (!lecCol && !labCol) return false;
      if ((!lecCol || isGENoSecCol(lecCol)) && (!labCol || isGENoSecCol(labCol))) return false;
      return true;
    });

    if (serviced.length === 0) {
      showNotification({
        type: 'info',
        title: 'No External Service College to Notify',
        message: 'Courses assigned to General Education Providers (e.g. CAS) plot directly upon Registrar access and do not require manual release notifications.',
      });
      return;
    }
    setShowNotifyServiceModal(true);
  };

  const accessStatus = useMemo(() => {
    if (!isDean || !deanCollegeContext) return { hasAccess: true, message: '', isFirst: false }; // Registrar always has access for viewing
    return getAccessStatusMessage(scheduleAccess, deanCollegeContext);
  }, [isDean, deanCollegeContext, scheduleAccess]);

  const canPlot = useMemo(() => {
    if (isRegistrar) return false; // Registrar can only view
    if (isDean) {
      if (activeServiceAssignment) {
        if (isGENoSections) {
          return accessStatus.hasAccess;
        }
        // Service College Dean is authorized ONLY if Mother College Dean has released this course/section
        return isCurrentServiceAssignmentReleased;
      }
      if (profile?.uid === selectedDeanUid) {
        return accessStatus.hasAccess; // Dean must have access
      }
    }
    return false;
  }, [isRegistrar, isDean, profile, selectedDeanUid, accessStatus, activeServiceAssignment, isGENoSections, isCurrentServiceAssignmentReleased]);

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
    () => plotEntries.filter((e) => {
      const modeMatch = e.scheduleMode === scheduleTab || (!e.scheduleMode && scheduleTab === 'regular');
      if (!modeMatch) return false;

      if (scheduleTab === 'regular' && cycleViewTab !== 'all') {
        const eCycle = e.rotationCycle || e.weekCycle || 'all';
        if (eCycle !== 'all' && eCycle !== cycleViewTab) return false;
      }

      return true;
    }),
    [plotEntries, scheduleTab, cycleViewTab]
  );

  const gridBlocks = useMemo(
    () => entriesToGridBlocks(filteredEntries, weekDates),
    [filteredEntries, weekDates]
  );

  const schoolYearOptions = useMemo(
    () => schoolYears.map((sy) => ({
      value: sy.id,
      label: `SY ${normalizeSchoolYearLabel(sy.label || sy.displayLabel || sy.id)}`,
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
      initial: {
        startTime,
        endTime,
        courseCode: activeServiceAssignment?.course?.code || undefined,
        type: activeServiceAssignment?.component || undefined,
      },
      fromDrag,
      isServiceCollegeMode: Boolean(activeServiceAssignment),
      serviceComponent: activeServiceAssignment?.component || null,
    });
  };

  const openEditModal = (block) => {
    // Allow dean to edit their own schedules or their service college assignment
    if (!isDean) return;
    const canEditBlock = (selectedDeanUid && profile?.uid === selectedDeanUid) || Boolean(activeServiceAssignment) || block.plottedBy === profile?.uid;
    if (!canEditBlock) return;
    const dayIdx = typeof block.day === 'number' ? block.day : WEEKDAYS.indexOf(block.date);
    const validDayIdx = dayIdx >= 0 && dayIdx <= 6 ? dayIdx : 0;
    const dayIdentifier = scheduleTab === 'regular' ? WEEKDAYS[validDayIdx] : (block.date || weekDates[validDayIdx]);
    
    setEntryModal({
      mode: 'edit',
      id: block.id,
      date: dayIdentifier,
      dayLabel: SCHEDULE_DAYS[validDayIdx],
      lockTimes: false,
      initial: {
        id: block.id,
        courseCode: block.courseCode || block.course,
        type: block.type,
        startTime: block.startTime,
        endTime: block.endTime,
        roomCode: block.roomCode || block.room,
        instructor: block.instructor,
        modality: block.modality || 'in_person',
        rotationCycle: block.rotationCycle || 'all',
        isCombinedSection: block.isCombinedSection || false,
        combinedSections: block.combinedSections || [],
      },
      fromDrag: false,
      isServiceCollegeMode: Boolean(activeServiceAssignment),
      serviceComponent: activeServiceAssignment?.component || null,
    });
  };

  const handleSaveEntry = async (payload) => {
    if (!canPlot) return;
    if (!selectedSection) {
      showNotification({
        type: 'error',
        title: 'No Section Selected',
        message: 'Please select a section before adding a schedule entry.',
      });
      return;
    }

    const dayIdx = WEEKDAYS.indexOf(entryModal?.date);

    try {
      if (scheduleTab === 'exam' && entryModal?.date) {
        const status = getPlotDayStatus(
          entryModal.date,
          calendarData.events,
          calendarData.noClassDays,
          calendarData.examPeriods,
          scheduleTab,
          selectedExamPeriod,
          selectedStudentCategory
        );
        if (status.disabled) throw new Error(status.reason || 'This date is blocked.');
      }

      const targetDeanUid = activeServiceAssignment?.motherDeanUid || selectedDeanUid || profile?.uid;

      const entry = {
        ...payload,
        // Regular schedules may submit several independently selected weekdays.
        // Only exam entries derive their day from the modal's calendar date.
        day: scheduleTab === 'exam' && dayIdx >= 0 ? dayIdx : (payload.day ?? 0),
        semester: Number(semester),
        schoolYearId: activeSchoolYearId || null,
        schoolYear: selectedSchoolYear?.label || selectedSchoolYear?.displayLabel || activeSchoolYearId || null,
        section: selectedSection,
        studentCategory: scheduleTab === 'exam' ? selectedStudentCategory : null,
        examPeriod: scheduleTab === 'exam' ? selectedExamPeriod : null,
        deanUid: targetDeanUid,
        deanName: selectedDean?.name || profile?.displayName || profile?.name || '',
        college: activeServiceAssignment ? activeServiceAssignment.motherCollege : (selectedDean?.college || selectedDean?.department || ''),
        serviceCollege: activeServiceAssignment ? (profile?.college || profile?.department || null) : null,
        scheduleMode: scheduleTab,
        plottedBy: profile?.uid || null,
        plottedByEmail: normalizeEmail(profile?.email),
      };
      const requiresRoomApproval = Boolean(payload.usedNonBudgetedRoom);
      const requesterUid = profile?.uid || targetDeanUid;
      const roomManagerUid = payload.roomManagerUid || null;
      const isOtherDeanManagedRoom = Boolean(roomManagerUid && String(roomManagerUid) !== String(requesterUid));
      const approvalTarget = isOtherDeanManagedRoom ? 'room_manager' : 'registrar';

      // Target sections to receive this plotted block
      const targetSections = (entry.isCombinedSection && Array.isArray(entry.combinedSections) && entry.combinedSections.length > 0)
        ? Array.from(new Set([selectedSection, ...entry.combinedSections]))
        : [selectedSection];
      const entryPaths = [];

      if (entryModal?.mode === 'edit' && entryModal.id) {
        for (const sec of targetSections) {
          const secEntry = {
            ...entry,
            section: sec,
            isCombinedSection: targetSections.length > 1,
            combinedSections: targetSections,
          };
          await updatePlotEntryForSection(targetDeanUid, sec, entryModal.id, secEntry);
          entryPaths.push(`users/${targetDeanUid}/course_schedules/${sec}/entries/${entryModal.id}`);
        }
      } else {
        const sharedEntryId = `entry_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        for (const sec of targetSections) {
          const secEntry = {
            ...entry,
            id: sharedEntryId,
            section: sec,
            isCombinedSection: targetSections.length > 1,
            combinedSections: targetSections,
          };
          await addPlotEntryForSection(targetDeanUid, sec, secEntry, sharedEntryId);
          entryPaths.push(`users/${targetDeanUid}/course_schedules/${sec}/entries/${sharedEntryId}`);
        }

        // Auto-mirror reciprocal entry for partner section if provided
        if (payload.reciprocalEntry && payload.partnerSection) {
          const recip = {
            ...payload.reciprocalEntry,
            day: scheduleTab === 'exam' && dayIdx >= 0 ? dayIdx : (payload.reciprocalEntry.day ?? 0),
            semester: Number(semester),
            schoolYearId: activeSchoolYearId || null,
            schoolYear: selectedSchoolYear?.label || selectedSchoolYear?.displayLabel || activeSchoolYearId || null,
            section: payload.partnerSection,
            studentCategory: scheduleTab === 'exam' ? selectedStudentCategory : null,
            examPeriod: scheduleTab === 'exam' ? selectedExamPeriod : null,
            deanUid: targetDeanUid,
            deanName: selectedDean?.name || profile?.displayName || profile?.name || '',
            college: activeServiceAssignment ? activeServiceAssignment.motherCollege : (selectedDean?.college || selectedDean?.department || ''),
            serviceCollege: activeServiceAssignment ? (profile?.college || profile?.department || null) : null,
            scheduleMode: scheduleTab,
            plottedBy: profile?.uid || null,
            plottedByEmail: normalizeEmail(profile?.email),
          };
          const reciprocalId = await addPlotEntryForSection(targetDeanUid, payload.partnerSection, {
            ...recip,
            approvalStatus: requiresRoomApproval ? 'pending' : 'approved',
            approved: !requiresRoomApproval,
          });
          entryPaths.push(`users/${targetDeanUid}/course_schedules/${payload.partnerSection}/entries/${reciprocalId}`);
        }
      }

      if (requiresRoomApproval) {
        await submitScheduleApprovalRequest({
          approvalSubmissionId: payload.approvalSubmissionId,
          entryPaths,
          deanUid: profile?.uid || targetDeanUid,
          deanEmail: normalizeEmail(profile?.email),
          deanName: profile?.displayName || profile?.name || selectedDean?.name || '',
          targetDeanUid,
          courseCode: payload.courseCode || payload.title || '',
          courseTitle: payload.title || '',
          sections: targetSections,
          day: entry.day,
          startHour: payload.startHour,
          endHour: payload.endHour,
          teacher: payload.instructor || 'TBA',
          roomCode: payload.roomCode,
          roomId: payload.roomId || payload.roomCode,
          buildingId: payload.buildingId || null,
          buildingName: payload.buildingName || '',
          floorId: payload.floorId || null,
          floor: payload.floor || null,
          nonBudgetedReason: payload.nonBudgetedRoomReason || null,
          usedNonBudgetedRoom: true,
          approvalTarget,
          approverUid: isOtherDeanManagedRoom ? roomManagerUid : null,
          approverName: isOtherDeanManagedRoom ? (payload.roomManagerName || 'Room Manager') : 'Registrar',
          approverDepartment: isOtherDeanManagedRoom ? (payload.roomManagerDepartment || '') : '',
          approverRole: isOtherDeanManagedRoom ? 'dean' : 'registrar',
          schoolYearId: activeSchoolYearId || null,
          semester: Number(semester),
        });
      }

      showNotification({
        type: 'success',
        title: requiresRoomApproval ? 'Schedule Submitted for Approval' : (entryModal?.mode === 'edit' ? 'Schedule Updated' : 'Schedule Saved'),
        message: requiresRoomApproval
          ? (targetSections.length > 1
            ? `${payload.courseCode || payload.title || 'Course'} is pending ${isOtherDeanManagedRoom ? 'room manager' : 'Registrar'} approval and reserves the selected time for ${targetSections.join(' & ')}.`
            : `${payload.courseCode || payload.title || 'Course'} is pending ${isOtherDeanManagedRoom ? 'room manager' : 'Registrar'} approval because a non-assigned room was selected.`)
          : (targetSections.length > 1
            ? `${payload.courseCode || payload.title || 'Course'} was approved immediately and saved for ${targetSections.join(' & ')} using an allocated room.`
            : `${payload.courseCode || payload.title || 'Course'} was saved immediately using the Registrar-allocated room.`),
      });
    } catch (err) {
      console.error('handleSaveEntry error:', err);
      showNotification({
        type: 'error',
        title: 'Failed to Save Schedule',
        message: err.message || 'An error occurred while saving schedule.',
      });
      throw err;
    }
  };

  const handleDeleteEntry = async (block) => {
    // Allow dean to delete their own schedules or service college assignment
    if (!isDean || !selectedSection) return;
    const canDeleteBlock = (selectedDeanUid && profile?.uid === selectedDeanUid) || Boolean(activeServiceAssignment) || block.plottedBy === profile?.uid;
    if (!canDeleteBlock) return;
    
    const confirmed = await showConfirm({
      title: 'Delete schedule block?',
      message: `Remove "${block.title || block.course}" from the schedule? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;
    
    try {
      const targetDeanUid = block.sourceDeanUid || block.rawEntry?._sourceDeanUid || activeServiceAssignment?.motherDeanUid || selectedDeanUid || profile?.uid;
      const sourceSection = block.sourceSection || block.rawEntry?._sourceSection || selectedSection;
      const deleteSections = (block.isCombinedSection && Array.isArray(block.combinedSections) && block.combinedSections.length > 0)
        ? Array.from(new Set([sourceSection, ...block.combinedSections]))
        : [sourceSection];

      for (const sec of deleteSections) {
        await deletePlotEntryForSection(targetDeanUid, sec, block.id);
      }

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
    setActiveServiceAssignment(null);
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
    const grantedRooms = getAssignedRoomsForCollege(scheduleAccess, code);
    // Managed rooms are detected separately by the room picker. Keeping them
    // out of this list prevents them from being mislabeled as Registrar-assigned.
    return Array.from(new Set(grantedRooms.filter(Boolean)));
  }, [scheduleAccess, activeCollegeObj, selectedDean, isDean, profile]);

  const subtitle = isRegistrar
    ? 'View course schedules plotted by college deans'
    : 'Plot course schedules for your college sections';

  return (
    <Layout title="Course Scheduling" subtitle={subtitle} compactNavOnDesktop>
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

      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] items-start gap-5">
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

          {/* General Education Provider Notice for CAS-type colleges without own sections */}
          {isGENoSections && (
            <div className="bg-gradient-to-br from-amber-50 to-red-50 border border-amber-200/80 rounded-2xl p-4 shadow-2xs space-y-2">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-[#7A0808]" />
                <h3 className="font-black text-xs text-[#7A0808] uppercase tracking-wider">
                  General Education Provider
                </h3>
              </div>
              <p className="text-[11px] text-gray-700 font-medium leading-relaxed">
                This college centrally plots minor subjects across all assigned college sections. Select a course and section from the <strong>Service College Requests</strong> below to view or plot schedules.
              </p>
            </div>
          )}

          {/* Degree Programs Navigation Card */}
          {!isGENoSections && availablePrograms.length > 0 && (
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

          {/* Sections per Year Level Sidebar (Rendered for both Dean and Registrar when college handles sections) */}
          {!isGENoSections && (
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

              <div className="space-y-2.5">
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
                                    onClick={() => {
                                      setActiveServiceAssignment(null);
                                      setSelectedSection(section.name);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        setActiveServiceAssignment(null);
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
          )}

          {/* Inter-College Service Requests Card (Cross-College Teaching) */}
          {groupedServiceCourses.length > 0 && (
            <div className="bg-gradient-to-br from-indigo-50/90 to-purple-50/90 border-2 border-indigo-200/80 rounded-2xl p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-indigo-800" />
                  <h4 className="font-black text-xs text-indigo-950 uppercase tracking-wider">
                    Service College Requests
                  </h4>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-900">
                  {groupedServiceCourses.length} Course{groupedServiceCourses.length > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-[11px] text-indigo-900/80 font-medium leading-relaxed">
                Courses from other colleges assigned to your faculty to teach:
              </p>

              <div className="hidden">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#7A0808]">
                  Colleges requiring your schedules ({servicedMotherColleges.length})
                </p>
                {servicedMotherColleges.map((college) => (
                  <div key={college.code} className="flex items-center justify-between gap-2 rounded-lg bg-red-50/70 px-2.5 py-2">
                    <div className="min-w-0">
                      <span className="block truncate text-[11px] font-black text-gray-800">{college.name}</span>
                      <span className="text-[9px] font-bold text-gray-500">{college.code}</span>
                    </div>
                    <span className="shrink-0 text-[9px] font-black text-[#7A0808]">
                      {college.courseCount} course{college.courseCount !== 1 ? 's' : ''} · {college.sectionCount} section{college.sectionCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-1">
                {servicedMotherColleges.map((college) => (
                  <section key={college.code} className="rounded-xl border border-indigo-200 bg-white/80 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-indigo-100 pb-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-black text-indigo-950">{college.name}</p>
                        <p className="text-[9px] font-bold text-gray-500">{college.code}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-black text-indigo-800">
                        {college.courseCount} course{college.courseCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-3">
                {[...YEAR_LEVELS, 'Unspecified Year'].map((yearLevel) => {
                  const hasCoursesForYear = serviceCourses.some(
                    (course) =>
                      String(course.collegeCode || '').trim().toUpperCase() === college.code &&
                      getCourseYearLevel(course) === yearLevel
                  );
                  if (!hasCoursesForYear) return null;
                  return (
                    <div key={`${college.code}:${yearLevel}`} className="rounded-lg bg-indigo-50/60 p-2">
                      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-900">
                        <GraduationCap size={12} />
                        {yearLevel}
                      </div>
                      <div className="space-y-2">
                {groupedServiceCourses.map((grp) => {
                  const coursesForCollege = grp.courses.filter(
                    (course) =>
                      String(course.collegeCode || '').trim().toUpperCase() === college.code &&
                      getCourseYearLevel(course) === yearLevel
                  );
                  if (coursesForCollege.length === 0) return null;
                  const expansionKey = `${college.code}:${grp.courseCode}`;
                  const isExp = Boolean(expandedServiceCourses[expansionKey]);
                  return (
                    <div key={expansionKey} className="bg-white rounded-xl border border-indigo-100 overflow-hidden shadow-2xs">
                      {/* Header: Course Code & Title */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedServiceCourses((prev) => ({
                            ...prev,
                            [expansionKey]: !prev[expansionKey],
                          }))
                        }
                        className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-indigo-50/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <BookOpen size={13} className="text-indigo-700 shrink-0" />
                          <div className="truncate">
                            <span className="font-extrabold text-xs text-indigo-950 block">{grp.courseCode}</span>
                            <span className="text-[10px] text-gray-500 font-medium truncate block">{grp.courseTitle}</span>
                          </div>
                        </div>
                        <ChevronRight
                          size={14}
                          className={`text-indigo-600 transition-transform duration-200 shrink-0 ${
                            isExp ? 'rotate-90' : ''
                          }`}
                        />
                      </button>

                      {/* Child: Mother College & Sections */}
                      {isExp && (
                        <div className="px-3 pb-3 pt-1 border-t border-indigo-50 space-y-2 bg-indigo-50/30">
                          {coursesForCollege.map((crs) => {
                            const motherCol = crs.collegeCode || 'Mother College';
                            const courseYearNumber = YEAR_LEVELS.indexOf(getCourseYearLevel(crs)) + 1;
                            const allCourseSections = serviceSectionsMap[crs.id] || [];
                            const secList = courseYearNumber > 0
                              ? allCourseSections.filter((sec) => Number(sec.yearNumber) === courseYearNumber)
                              : allCourseSections;
                            const providerCode = String(activeCollegeObj?.code || activeCollegeCode || '').toUpperCase();
                            const handlesLecture = String(crs.lecServiceCollege || '').toUpperCase() === providerCode;
                            const handlesLaboratory = String(crs.labServiceCollege || '').toUpperCase() === providerCode;
                            const compLabel = handlesLecture && handlesLaboratory ? 'Lecture & Laboratory' : (handlesLecture ? 'Lecture' : 'Laboratory');

                            return (
                              <div key={crs.id} className="space-y-1.5 pl-1 border-l-2 border-indigo-300">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-black text-indigo-950">
                                    🏛️ {motherCol} ({crs.programCode})
                                  </span>
                                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                                    {compLabel}
                                  </span>
                                </div>

                                {secList.length === 0 ? (
                                  <p className="text-[10px] text-gray-400 italic">No sections created yet</p>
                                ) : (
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {secList.map((sec) => {
                                      const isSecActive =
                                        selectedSection === sec.name &&
                                        activeServiceAssignment?.course?.id === crs.id;

                                      const isReleasedForSec = isGENoSections || isServiceCourseReleased(serviceCourseReleases, {
                                        courseId: crs.id,
                                        courseCode: crs.code,
                                        component: compLabel,
                                        sectionName: sec.name,
                                        serviceCollegeCode: providerCode,
                                        motherCollegeCode: motherCol,
                                      });

                                      return (
                                        <button
                                          key={sec.name}
                                          type="button"
                                          onClick={() => {
                                            // Find mother college dean
                                            const motherDean = staffUsers.find(
                                              (u) =>
                                                (u.roleValue === 'dean' || u.role?.toLowerCase() === 'dean') &&
                                                (String(u.college || u.department || '').toUpperCase().includes(motherCol.toUpperCase()) ||
                                                 motherCol.toUpperCase().includes(String(u.college || u.department || '').toUpperCase()))
                                            );

                                            setSelectedSection(sec.name);
                                            setActiveServiceAssignment({
                                              course: crs,
                                              motherCollege: motherCol,
                                              component: compLabel,
                                              motherDeanUid: motherDean?.uid || selectedDeanUid,
                                            });
                                          }}
                                          className={`text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                            isSecActive
                                              ? 'bg-indigo-700 text-white shadow-2xs'
                                              : 'bg-white hover:bg-indigo-100/70 text-indigo-950 border border-indigo-200/60'
                                          }`}
                                          title={isReleasedForSec ? 'Released by Mother College (Ready to Plot)' : 'Locked: Waiting for Mother College release'}
                                        >
                                          <div className="flex items-center justify-between gap-1 min-w-0">
                                            <span className="truncate">{sec.name}</span>
                                            {isReleasedForSec ? (
                                              <span className={`text-[8px] font-black uppercase px-1 py-0.2 rounded shrink-0 ${
                                                isSecActive ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                                              }`}>
                                                ✓ Ready
                                              </span>
                                            ) : (
                                              <span className={`text-[8px] font-black uppercase px-1 py-0.2 rounded shrink-0 ${
                                                isSecActive ? 'bg-amber-400 text-amber-950' : 'bg-amber-100 text-amber-900 border border-amber-300'
                                              }`}>
                                                🔒 Locked
                                              </span>
                                            )}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                      </div>
                    </div>
                  );
                })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="min-w-0">
          {selectedDean ? (
            <div className="space-y-4">
              {/* Service College Mode Active Alert Banner */}
              {activeServiceAssignment && (
                isCurrentServiceAssignmentReleased ? (
                  <div className="p-4 bg-gradient-to-r from-indigo-900 via-indigo-850 to-purple-900 text-white rounded-2xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-black text-white shrink-0">
                        🏛️
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                            Service College Mode
                          </span>
                          <span className="text-xs font-bold text-indigo-200">
                            {activeServiceAssignment.motherCollege} Program
                          </span>
                          <span className="text-[9px] font-black bg-emerald-400 text-emerald-950 px-2 py-0.5 rounded-full">
                            ✓ Released by Mother College
                          </span>
                        </div>
                        <h3 className="font-black text-sm text-white mt-0.5">
                          Scheduling <span className="underline">{activeServiceAssignment.component}</span> for {activeServiceAssignment.course.code} - {activeServiceAssignment.course.title}
                        </h3>
                        <p className="text-xs text-indigo-200 mt-0.5">
                          Section: <span className="font-bold text-white">{selectedSection}</span> · You can assign your college faculty & rooms for this component.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveServiceAssignment(null)}
                      className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <X size={14} />
                      Exit Service Mode
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-gradient-to-r from-amber-950 via-amber-900 to-red-950 text-white rounded-2xl shadow-md border-2 border-amber-500/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center font-black text-xl shrink-0 border border-amber-400/40">
                        🔒
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full">
                            Plotting Locked
                          </span>
                          <span className="text-xs font-bold text-amber-200">
                            {activeServiceAssignment.motherCollege} Program
                          </span>
                        </div>
                        <h3 className="font-black text-sm text-white mt-0.5">
                          Waiting for Mother College Dean ({activeServiceAssignment.motherCollege}) to release <span className="underline">{activeServiceAssignment.component}</span> for {activeServiceAssignment.course.code}
                        </h3>
                        <p className="text-xs text-amber-200/90 mt-0.5">
                          Section: <span className="font-bold text-white">{selectedSection}</span> · You will be notified and granted plotting access once the Mother College Dean completes their schedule and clicks &quot;Notify Service College&quot;.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveServiceAssignment(null)}
                      className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <X size={14} />
                      Exit Service Mode
                    </button>
                  </div>
                )
              )}

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

                        {/* Mother College Notify Service College button */}
                        {!isGENoSections && !activeServiceAssignment && curriculumCourses.some((c) => c.lecServiceCollege || c.labServiceCollege) && (
                          <button
                            type="button"
                            onClick={handleNotifyServiceCollege}
                            className={`btn-outline-maroon flex items-center gap-1.5 text-xs font-bold py-1 px-3 rounded-xl shadow-2xs transition-all cursor-pointer ${
                              unreleasedServiceCourseCount > 0
                                ? 'bg-amber-100/90 hover:bg-amber-200/90 border-amber-400 text-amber-950 ring-2 ring-amber-300/50 animate-pulse'
                                : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-950'
                            }`}
                            title="Notify assigned Service College Deans to schedule their components"
                          >
                            <Bell size={13} className={unreleasedServiceCourseCount > 0 ? 'text-amber-700' : 'text-emerald-700'} />
                            <span>
                              Notify Service College
                              {unreleasedServiceCourseCount > 0 ? ` (${unreleasedServiceCourseCount} pending)` : ' (All released)'}
                            </span>
                          </button>
                        )}
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
                              options={currentSectionObj?.hasOjtAlternatingModality
                                ? MODALITY_OPTIONS
                                : MODALITY_OPTIONS.filter((option) => option.value === 'regular')}
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

              {/* Cycle View Filter Switcher (When Regular Schedule Tab is active) */}
              {scheduleTab === 'regular' && selectedSection && currentSectionObj?.hasOjtAlternatingModality && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white border border-gray-100 rounded-2xl shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                      <RefreshCw size={13} className="text-[#7A0808]" /> Schedule View Cycle:
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium">
                      Filter grid by OJT Rotation Week
                    </span>
                  </div>

                  <div className="flex items-center gap-1 bg-gray-100/90 p-1 rounded-xl border border-gray-200 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setCycleViewTab('all')}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        cycleViewTab === 'all'
                          ? 'bg-white text-gray-900 shadow-2xs border border-gray-200'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      🌐 All Schedules ({plotEntries.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCycleViewTab('week_a')}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        cycleViewTab === 'week_a'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-blue-700 hover:bg-blue-50'
                      }`}
                    >
                      🔵 Week A (Odd Weeks)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCycleViewTab('week_b')}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        cycleViewTab === 'week_b'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'text-purple-700 hover:bg-purple-50'
                      }`}
                    >
                      🟣 Week B (Even Weeks)
                    </button>
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
                    {isGENoSections
                      ? 'Please select a mother college section from the Service College Requests on the left to view or plot your assigned minor subject schedule.'
                      : displayedDeanSections.length === 0
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
                  hideSectionNameInBlocks
                  addScheduleDisabledReason={
                    !isDean
                      ? 'Only a dean can add course schedules.'
                      : activeServiceAssignment && !isCurrentServiceAssignmentReleased
                        ? `This service course has not been released by the Mother College Dean (${activeServiceAssignment.motherCollege}) yet. Waiting for notification.`
                        : profile?.uid !== selectedDeanUid && !activeServiceAssignment
                          ? 'You can only add schedules for sections assigned to your dean account.'
                      : accessStatus.message || 'Scheduling access has not been granted for this college yet.'
                  }
                  courseChecklist={selectedSectionCourseChecklist}
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
                  emptyMessage={
                    activeServiceAssignment && !isCurrentServiceAssignmentReleased
                      ? `🔒 Waiting for Mother College Dean (${activeServiceAssignment.motherCollege}) to notify & release this course.`
                      : canPlot
                      ? 'Click or drag on the grid to add schedule blocks.'
                      : 'No schedule blocks yet.'
                  }
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
          canEdit={canPlot && isDean && (profile?.uid === selectedDeanUid || Boolean(activeServiceAssignment) || viewingBlock?.plottedBy === profile?.uid)}
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
          deanCollege={activeCollegeObj?.code || selectedDean?.college || selectedDean?.department}
          collegeCode={activeCollegeObj?.code || selectedDean?.college}
          deanUid={selectedDeanUid}
          deanName={selectedDean?.name || profile?.displayName || profile?.name || ''}
          programCode={currentSectionObj?.programCode || (selectedProgram !== 'ALL' ? selectedProgram : null)}
          programName={availablePrograms.find((p) => p.code === (currentSectionObj?.programCode || selectedProgram))?.name || ''}
          sections={displayedDeanSections}
          initialSection={selectedSection || ''}
          semester={semester}
          schoolYearId={activeSchoolYearId}
          sectionYearLevel={currentSectionObj?.yearLevel || '1st Year'}
          allowOjtRotation={Boolean(currentSectionObj?.hasOjtAlternatingModality)}
          dayIndex={WEEKDAYS.indexOf(entryModal.date) >= 0 ? WEEKDAYS.indexOf(entryModal.date) : weekDates.indexOf(entryModal.date)}
          isServiceCollegeMode={entryModal.isServiceCollegeMode || Boolean(activeServiceAssignment)}
          serviceComponent={entryModal.serviceComponent || activeServiceAssignment?.component || null}
          serviceCollegeCode={isDean ? (profile?.college || profile?.department) : (selectedDean?.college || selectedDean?.department)}
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

      {/* Notify Service College Modal */}
      {showNotifyServiceModal && (
        <NotifyServiceCollegeModal
          isOpen={showNotifyServiceModal}
          onClose={() => setShowNotifyServiceModal(false)}
          motherCollegeCode={activeCollegeObj?.code || activeCollegeCode}
          motherCollegeName={activeCollegeObj?.name || activeCollegeObj?.code || activeCollegeCode}
          programCode={selectedProgramObj?.code || currentSectionObj?.programCode || selectedProgram}
          sectionName={selectedSection}
          schoolYearId={activeSchoolYearId}
          schoolYearLabel={schoolYearLabel}
          semester={semester}
          curriculumCourses={curriculumCourses}
          serviceCourseReleases={serviceCourseReleases}
          colleges={colleges}
          currentUser={profile}
        />
      )}

      {/* Global Confirmation & Notification Modals (Rendered last so they sit on top of all active page modals) */}
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
    </Layout>
  );
}
