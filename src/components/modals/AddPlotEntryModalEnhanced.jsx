import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  BookOpen,
  User,
  Clock,
  Building2,
  DoorOpen,
  Calendar,
  Search,
  Layers,
  CheckCircle2,
  Eye,
  Check,
  GraduationCap,
  ArrowRight,
  Pencil,
  RefreshCw,
  Users,
  Plus,
} from 'lucide-react';
import {
  parseTimeToHour,
  validateScheduleHours,
  hourToTimeInput,
  subscribeDeanSections,
  subscribePlotEntriesForDeanSection,
  subscribeAllPlotEntriesForSection,
  subscribeAllSemesterPlotEntries,
} from '../../services/plotScheduleService';
import { formatScheduleHour, SCHEDULE_DAYS, SCHEDULE_START_HOUR, SCHEDULE_END_HOUR } from '../../constants/scheduleGrid';
import { formatDisplayDate } from '../../utils/academicCalendarUtils';
import { subscribeCollegeCourses } from '../../services/courseService';
import { subscribeToBuildings } from '../../services/buildingService';
import { useModal } from '../../hooks/useModal';
import { ModalRenderer } from './ModalProvider';
import { subscribeStaffUsers } from '../../services/systemUserService';
import { formatCollegeName } from '../../constants/colleges';
import RoomScheduleViewer from '../scheduling/RoomScheduleViewer';
import CustomSelect from '../ui/CustomSelect';
import TeacherScheduleModal from './TeacherScheduleModal';
import LoadingModal from './LoadingModal';

const COURSE_TYPES = ['Lecture', 'Laboratory']; // Only Lecture and Laboratory

export const DAY_PAIR_PRESETS = [
  { label: 'Mon & Thu', days: [0, 3] },
  { label: 'Tue & Fri', days: [1, 4] },
  { label: 'Wed & Sat', days: [2, 5] },
  { label: 'Mon & Tue', days: [0, 1] },
  { label: 'Mon, Wed & Fri', days: [0, 2, 4] },
  { label: 'Single Day', days: [0] },
];

/**
 * Calculates lecture and lab unit breakdown and required contact hours for a course
 */
export function getCourseUnitBreakdown(course) {
  if (!course) {
    return {
      numLec: 3,
      numLab: 0,
      totalUnits: 3,
      courseType: 'lecture',
      isLecOnly: true,
      isLabOnly: false,
      isCombined: false,
      targetLecHours: 3.0,
      targetLabHours: 0,
      targetHoursForType: () => 3.0,
    };
  }

  const rawLec = course.lecUnits !== undefined && course.lecUnits !== null && course.lecUnits !== '' ? Number(course.lecUnits) : null;
  const rawLab = course.labUnits !== undefined && course.labUnits !== null && course.labUnits !== '' ? Number(course.labUnits) : null;
  const rawUnits = Number(course.units) || 0;
  const typeStr = String(course.type || '').toLowerCase();

  let numLec = 0;
  let numLab = 0;

  if (rawLec !== null && !isNaN(rawLec)) {
    numLec = rawLec;
  } else if (typeStr === 'laboratory') {
    numLec = 0;
  } else {
    numLec = rawUnits > 0 ? rawUnits : 3;
  }

  if (rawLab !== null && !isNaN(rawLab)) {
    numLab = rawLab;
  } else if (typeStr === 'laboratory') {
    numLab = rawUnits > 0 ? rawUnits : 3;
  } else {
    numLab = 0;
  }

  const totalUnits = rawUnits > 0 ? rawUnits : (numLec + numLab);
  const isLecOnly = numLec > 0 && numLab === 0;
  const isLabOnly = numLab > 0 && numLec === 0;
  const isCombined = numLec > 0 && numLab > 0;

  const courseType = isCombined ? 'both' : (isLabOnly ? 'laboratory' : 'lecture');

  // Contact hours: Use explicit course.lecHours / course.labHours if configured, otherwise standard ratio (1 Lec unit = 1.0 hr/wk, 1 Lab unit = 3.0 hr/wk)
  const targetLecHours = course.lecHours !== undefined && course.lecHours !== null && course.lecHours !== ''
    ? Number(course.lecHours)
    : numLec * 1.0;
  const targetLabHours = course.labHours !== undefined && course.labHours !== null && course.labHours !== ''
    ? Number(course.labHours)
    : (numLab > 0 ? numLab * 3.0 : (typeStr === 'laboratory' ? (rawUnits > 0 ? rawUnits * 3.0 : 3.0) : 0));

  const targetHoursForType = (type) => {
    const isLab = String(type || '').toLowerCase().includes('lab');
    return isLab ? (targetLabHours || (numLab > 0 ? numLab * 3.0 : 3.0)) : (targetLecHours || (numLec > 0 ? numLec * 1.0 : 1.0));
  };

  return {
    numLec,
    numLab,
    totalUnits,
    courseType,
    isLecOnly,
    isLabOnly,
    isCombined,
    targetLecHours,
    targetLabHours,
    targetHoursForType,
  };
}

// Helper function to match room type with selected class type
function matchesRoomType(roomTypeRaw, selectedType) {
  if (!selectedType || selectedType === 'All') return true;

  const rType = String(roomTypeRaw || '').toLowerCase().trim();
  const sType = String(selectedType).toLowerCase().trim();

  if (sType === 'laboratory' || sType.includes('lab')) {
    return rType.includes('lab') || rType.includes('laboratory');
  }

  if (sType === 'lecture' || sType.includes('lec') || sType.includes('class')) {
    return !rType.includes('lab') || rType.includes('lecture') || rType.includes('classroom');
  }

  return true;
}

export default function AddPlotEntryModalEnhanced({
  onClose,
  onSave,
  initial,
  date,
  dayLabel,
  scheduleMode = 'regular',
  dayBlockReason,
  lockTimes = false,
  deanCollege, // Dean's college code for fetching courses
  deanUid, // Dean's UID for querying room schedules
  deanName, // Exact-name fallback for legacy room manager assignments
  programCode, // Optional program code to filter curriculum
  programName, // Optional program title
  semester = '1', // Current semester
  sectionYearLevel = '1st Year', // Selected section's year level
  allowOjtRotation = false, // Registrar-controlled OJT alternating flag for this section/year
  dayIndex, // 0-6 for Mon-Sun
  fromDrag = false,
  initialBuildingId,
  initialRoomCode,
  initialBuilding,
  initialRoom,
  initialType,
  lockRoom = false,
  assignedRooms = [],
  sections = [],
  initialSection = '',
  skipTypeStep = false,
  schoolYearId = null,
  isServiceCollegeMode = false,
  serviceComponent = null,
  serviceCollegeCode = null,
}) {
  const { showConfirm, confirmState, notificationState } = useModal();
  // Multi-step form state
  const isEditingExisting = Boolean(initial?.id || initial?.entryId || initial?.courseCode);
  const [step, setStep] = useState(() => (isEditingExisting ? 6 : 1)); // Course → Type (when needed) → Preferred Time → Teacher → Room → Summary
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Year level and section filters
  const [deanSections, setDeanSections] = useState(sections || []);
  const [selectedSection, setSelectedSection] = useState(initialSection || (sections?.[0]?.name || ''));
  const [sectionPlotEntries, setSectionPlotEntries] = useState([]); // Live plot entries of selectedSection
  const [viewScheduleCourse, setViewScheduleCourse] = useState(null); // Preview modal for Eye button

  // Active section object and automatic year level (fixed to selected section)
  const currentSectionObj = useMemo(() => {
    return deanSections.find((s) => s.name === selectedSection);
  }, [deanSections, selectedSection]);

  const activeYearLevel = useMemo(() => {
    return currentSectionObj?.yearLevel || sectionYearLevel || '1st Year';
  }, [currentSectionObj, sectionYearLevel]);

  // Available sections for combining MUST be in the same year level and program as selectedSection
  const mergeableSections = useMemo(() => {
    if (!selectedSection) return [];
    const currentYl = String(activeYearLevel || '').toLowerCase().trim();
    const currentPCode = String(programCode || currentSectionObj?.programCode || '').toUpperCase().trim();

    return deanSections.filter((s) => {
      // Must match program code if present
      if (currentPCode && s.programCode && s.programCode.toUpperCase().trim() !== currentPCode) {
        return false;
      }
      // Must match exact same year level
      const sYl = String(s.yearLevel || '').toLowerCase().trim();
      if (currentYl && sYl && sYl !== currentYl) {
        return false;
      }
      return true;
    });
  }, [deanSections, selectedSection, activeYearLevel, programCode, currentSectionObj?.programCode]);

  // Data loading states
  const [courses, setCourses] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [teachersList, setTeachersList] = useState([]);
  const [staffDirectory, setStaffDirectory] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingBuildings, setLoadingBuildings] = useState(true);

  // Search Filters
  const [courseSearch, setCourseSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [buildingSearch, setBuildingSearch] = useState('');
  const [showAllAvailableRooms, setShowAllAvailableRooms] = useState(false);
  const [nonBudgetedRoomReason, setNonBudgetedRoomReason] = useState(initial?.nonBudgetedRoomReason || '');

  // Form data
  const [isEditMode, setIsEditMode] = useState(Boolean(initial?.id || initial?.entryId));
  const [editingEntryId, setEditingEntryId] = useState(initial?.id || initial?.entryId || null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState(() => {
    if (initial?.instructor) return { name: initial.instructor };
    return null;
  });
  const [selectedType, setSelectedType] = useState(() => {
    if (initial?.type) return initial.type;
    if (initialType) return initialType;
    if (initialRoom?.type && String(initialRoom.type).toLowerCase().includes('lab')) return 'Laboratory';
    return 'Lecture';
  });
  const [selectedBuilding, setSelectedBuilding] = useState(initialBuilding || null);
  const [selectedRoom, setSelectedRoom] = useState(
    initialRoom || (initial?.roomCode ? { roomCode: initial.roomCode, name: initial.roomCode, id: initial.roomCode } : null)
  );
  const [viewDetailsRoom, setViewDetailsRoom] = useState(null); // Track room for detailed preview modal
  
  // Multi-day and time state
  const [selectedDays, setSelectedDays] = useState(() => {
    if (initial?.days && Array.isArray(initial.days) && initial.days.length > 0) return initial.days;
    if (initial?.day !== undefined && initial.day !== null && Number(initial.day) >= 0 && Number(initial.day) <= 6) return [Number(initial.day)];
    if (dayIndex !== undefined && dayIndex !== null && Number(dayIndex) >= 0 && Number(dayIndex) <= 6) return [Number(dayIndex)];
    return [];
  });
  const [timeMode, setTimeMode] = useState(() => (
    initial?.dayTimes && Object.keys(initial.dayTimes).length > 0 ? 'individual' : 'combined'
  )); // 'combined' | 'individual'
  const [combinedStartTime, setCombinedStartTime] = useState(initial?.startTime || '');
  const [combinedEndTime, setCombinedEndTime] = useState(initial?.endTime || '');
  const [additionalTimeSlots, setAdditionalTimeSlots] = useState(() =>
    Array.isArray(initial?.additionalTimeSlots) ? initial.additionalTimeSlots : []
  );

  useEffect(() => {
    setAdditionalTimeSlots((prev) => prev.filter((slot) => selectedDays.includes(Number(slot.day))));
  }, [selectedDays]);
  const [dayTimes, setDayTimes] = useState(() => {
    if (initial?.dayTimes && typeof initial.dayTimes === 'object') return initial.dayTimes;
    if (initial?.day !== undefined && initial?.startTime && initial?.endTime) {
      return { [initial.day]: { startTime: initial.startTime, endTime: initial.endTime } };
    }
    return {};
  });

  // OJT Rotation & Combined Sections States
  const [rotationCycle, setRotationCycle] = useState(initial?.rotationCycle || initial?.weekCycle || 'all'); // 'all' | 'week_a' | 'week_b'
  const [partnerSection, setPartnerSection] = useState(initial?.partnerSection || '');
  const [autoMirrorPartner, setAutoMirrorPartner] = useState(true);
  const [selectedCombinedSections, setSelectedCombinedSections] = useState(() => {
    if (initial?.combinedSections && Array.isArray(initial.combinedSections) && initial.combinedSections.length > 0) {
      return initial.combinedSections;
    }
    return [initialSection || selectedSection || ''];
  });

  useEffect(() => {
    if (!allowOjtRotation) {
      setRotationCycle('all');
      setPartnerSection('');
      setAutoMirrorPartner(false);
    }
  }, [allowOjtRotation]);

  // Keep selectedCombinedSections locked to primary selectedSection and valid within mergeableSections
  useEffect(() => {
    if (selectedSection) {
      setSelectedCombinedSections((prev) => {
        const validNames = new Set(mergeableSections.map((s) => s.name));
        const filtered = prev.filter((name) => validNames.has(name) && name !== selectedSection);
        return [selectedSection, ...filtered];
      });
    }
  }, [selectedSection, mergeableSections]);

  const [roomConflicts, setRoomConflicts] = useState([]); // Track conflicting schedules for selected room/day/time
  const [completedTypes, setCompletedTypes] = useState([]); // Tracks saved components (e.g. ['Laboratory']) for combined courses
  const [transitionBanner, setTransitionBanner] = useState(null); // Notice after saving first part of combined course
  const [allSemesterEntries, setAllSemesterEntries] = useState([]); // All plot entries for evaluating teacher availability
  const [viewTeacherSchedule, setViewTeacherSchedule] = useState(null); // Teacher schedule preview modal: { teacher, entries }

  // Subscribe to all semester entries across the college for teacher availability checking
  useEffect(() => {
    return subscribeAllSemesterPlotEntries(
      semester,
      scheduleMode,
      schoolYearId,
      (entries) => setAllSemesterEntries(entries || []),
      (err) => console.warn('Error loading all semester entries for teachers:', err)
    );
  }, [semester, scheduleMode, schoolYearId]);

  // Open floor accordion state
  const [openFloors, setOpenFloors] = useState({});

  // Refs to ensure pre-selection only runs once on mount
  const initializedBuildingRef = useRef(false);
  const initializedRoomRef = useRef(false);
  const initializedCourseRef = useRef(false);

  // Subscribe to staff teachers for fallback if course isn't pre-assigned
  useEffect(() => {
    return subscribeStaffUsers(
      (users) => {
        setStaffDirectory(users || []);
        const targetCollege = formatCollegeName(serviceCollegeCode || deanCollege || '').trim().toLowerCase();
        const teachersOnly = users.filter((u) => {
          if (u.roleValue !== 'teacher' || u.status !== 'Active') return false;
          if (!targetCollege) return false;
          const teacherCollege = formatCollegeName(u.college || u.department || '').trim().toLowerCase();
          return teacherCollege === targetCollege;
        });
        setTeachersList(teachersOnly);
        if (selectedTeacher?.uid && !teachersOnly.some((teacher) => teacher.uid === selectedTeacher.uid)) {
          setSelectedTeacher(null);
        }
        if (selectedTeacher?.name && selectedTeacher.name !== 'TBA (To Be Assigned)' && !selectedTeacher.uid) {
          const match = teachersOnly.find(
            (t) =>
              t.name?.toLowerCase().trim() === selectedTeacher.name?.toLowerCase().trim() ||
              t.displayName?.toLowerCase().trim() === selectedTeacher.name?.toLowerCase().trim() ||
              t.name?.toLowerCase().includes(selectedTeacher.name?.toLowerCase().trim()) ||
              selectedTeacher.name?.toLowerCase().includes(t.name?.toLowerCase().trim())
          );
          if (match) {
            setSelectedTeacher({
              uid: match.uid,
              name: match.name || match.displayName,
              email: match.email || '',
            });
          }
        }
      },
      (err) => console.error('Error loading teachers in modal:', err)
    );
  }, [selectedTeacher, serviceCollegeCode, deanCollege]);

  // Subscribe to Dean's sections if deanUid is provided and sections not passed
  useEffect(() => {
    if (!deanUid || (sections && sections.length > 0)) return;
    return subscribeDeanSections(
      deanUid,
      (secs) => {
        setDeanSections(secs);
        if (!selectedSection && secs.length > 0) {
          setSelectedSection(secs[0].name);
        }
      },
      (err) => console.error('Error loading dean sections:', err)
    );
  }, [deanUid, sections]);

  // Subscribe to section plot entries in current semester & scheduleMode (across all colleges)
  useEffect(() => {
    if (!selectedSection) {
      setSectionPlotEntries([]);
      return undefined;
    }
    return subscribeAllPlotEntriesForSection(
      selectedSection,
      semester,
      scheduleMode,
      null,
      schoolYearId,
      (entries) => setSectionPlotEntries(entries),
      (err) => console.warn('Error loading section plot entries:', err)
    );
  }, [selectedSection, semester, scheduleMode, schoolYearId]);

  // Subscribe to courses for the Dean's college
  useEffect(() => {
    if (!deanCollege) {
      setCourses([]);
      setLoadingCourses(false);
      return undefined;
    }

    setLoadingCourses(true);
    return subscribeCollegeCourses(
      deanCollege,
      (data) => {
        // Filter courses dynamically by Semester, Section Year Level, and Program Code
        const effectiveProgramCode = programCode || deanSections.find((s) => s.name === selectedSection)?.programCode;

        const filtered = data.filter((c) => {
          // 1. Semester matching
          if (semester) {
            const activeSem = String(semester).toLowerCase().trim();
            const courseSem = String(c.semester || '1st Semester').toLowerCase().trim();

            const isSem1 = activeSem === '1' || activeSem.includes('1st') || activeSem.includes('first');
            const isSem2 = activeSem === '2' || activeSem.includes('2nd') || activeSem.includes('second');
            const isSemSummer = activeSem === '3' || activeSem.includes('summer') || activeSem.includes('midyear');

            if (isSem1 && !courseSem.includes('1') && !courseSem.includes('first')) return false;
            if (isSem2 && !courseSem.includes('2') && !courseSem.includes('second')) return false;
            if (isSemSummer && !courseSem.includes('summer') && !courseSem.includes('3')) return false;
          }

          // 2. Section Year Level matching
          if (activeYearLevel && activeYearLevel !== 'All' && activeYearLevel !== 'all') {
            const activeYear = String(activeYearLevel).toLowerCase().trim();
            const courseYear = String(c.yearLevel || '1st Year').toLowerCase().trim();

            const activeDigit = activeYear.match(/\d/)?.[0];
            const courseDigit = courseYear.match(/\d/)?.[0];

            if (activeDigit && courseDigit && activeDigit !== courseDigit) {
              return false;
            }
          }

          // 3. Program Code matching
          if (effectiveProgramCode && effectiveProgramCode !== 'ALL' && effectiveProgramCode !== 'all') {
            const activePrg = String(effectiveProgramCode).toUpperCase().trim();
            const coursePrg = String(c.programCode || '').toUpperCase().trim();
            if (coursePrg && coursePrg !== activePrg) {
              return false;
            }
          }

          return true;
        });

        setCourses(filtered);
        setLoadingCourses(false);
      },
      (err) => {
        console.error('Error loading courses:', err);
        setLoadingCourses(false);
      }
    );
  }, [deanCollege, semester, activeYearLevel, programCode, selectedSection, deanSections]);

  // Pre-select course and enter edit mode if initial course is passed on mount
  useEffect(() => {
    if (initializedCourseRef.current) return;
    if (!courses || courses.length === 0) return;

    if (initial?.courseCode || initial?.title) {
      const cCode = String(initial.courseCode || initial.title || '').trim().toUpperCase();
      const match = courses.find(
        (c) =>
          String(c.code || '').trim().toUpperCase() === cCode ||
          String(c.title || '').trim().toUpperCase() === cCode
      );
      if (match) {
        initializedCourseRef.current = true;
        setSelectedCourse(match);
        if (initial?.id) {
          setIsEditMode(true);
          setEditingEntryId(initial.id);
        }
        if (initial?.type) {
          setSelectedType(initial.type);
        }
        const initDays = (initial?.days && initial.days.length > 0)
          ? initial.days
          : (initial?.day !== undefined ? [Number(initial.day)] : (dayIndex !== undefined && dayIndex >= 0 ? [Number(dayIndex)] : []));
        if (initDays.length > 0) {
          setSelectedDays(initDays);
        }
        if (initial?.startTime) setCombinedStartTime(initial.startTime);
        if (initial?.endTime) setCombinedEndTime(initial.endTime);
        if (initial?.instructor) setSelectedTeacher({ name: initial.instructor });
        
        // In edit mode, jump directly to Building & Room / Time
        if (initial?.id || initial?.courseCode) {
          setStep(6);
        }
      }
    }
  }, [courses, initial, dayIndex]);

  // Subscribe to buildings
  useEffect(() => {
    setLoadingBuildings(true);
    return subscribeToBuildings(
      (data) => {
        setBuildings(data);
        setLoadingBuildings(false);
      },
      (err) => {
        console.error('Error loading buildings:', err);
        setLoadingBuildings(false);
      }
    );
  }, []);

  // Calculates plotted hours and schedule status for a course in the current section
  const getCourseScheduleStatus = (course) => {
    if (!course) {
      return {
        plottedLecHours: 0,
        plottedLabHours: 0,
        totalPlottedHours: 0,
        targetLec: 0,
        targetLab: 0,
        targetTotal: 0,
        lecDone: false,
        labDone: false,
        isFullyPlotted: false,
        isPartiallyPlotted: false,
        matchingEntries: [],
        remainingType: null,
      };
    }

    const cu = getCourseUnitBreakdown(course);
    const codeNorm = String(course.code || '').trim().toUpperCase();
    const titleNorm = String(course.title || '').trim().toUpperCase();

    const matchingEntries = (sectionPlotEntries || []).filter((e) => {
      const eCode = String(e.courseCode || '').trim().toUpperCase();
      const eTitle = String(e.title || '').trim().toUpperCase();
      return (codeNorm && eCode === codeNorm) || (titleNorm && eTitle === titleNorm);
    });

    let plottedLecHours = 0;
    let plottedLabHours = 0;

    matchingEntries.forEach((e) => {
      const sH = e.startHour ?? parseTimeToHour(e.startTime || '08:00');
      const eH = e.endHour ?? parseTimeToHour(e.endTime || '09:00');
      const duration = Math.max(0, eH - sH);
      const eType = String(e.type || '').toLowerCase();
      if (eType.includes('lab')) {
        plottedLabHours += duration;
      } else {
        plottedLecHours += duration;
      }
    });

    plottedLecHours = Math.round(plottedLecHours * 10) / 10;
    plottedLabHours = Math.round(plottedLabHours * 10) / 10;
    const totalPlottedHours = Math.round((plottedLecHours + plottedLabHours) * 10) / 10;

    const targetLec = cu.targetLecHours || 0;
    const targetLab = cu.targetLabHours || 0;
    const targetTotal = Math.round((targetLec + targetLab) * 10) / 10;

    let isFullyPlotted = false;
    let isPartiallyPlotted = false;
    let remainingType = null;

    if (cu.isCombined) {
      const lecDone = targetLec > 0 ? plottedLecHours >= targetLec : true;
      const labDone = targetLab > 0 ? plottedLabHours >= targetLab : true;
      isFullyPlotted = (plottedLecHours >= targetLec) && (plottedLabHours >= targetLab);
      isPartiallyPlotted = (plottedLecHours > 0 || plottedLabHours > 0) && !isFullyPlotted;
      if (isPartiallyPlotted) {
        remainingType = plottedLabHours < targetLab ? 'Laboratory' : 'Lecture';
      }
    } else if (cu.isLabOnly) {
      isFullyPlotted = targetLab > 0 ? plottedLabHours >= targetLab : plottedLabHours > 0;
      isPartiallyPlotted = plottedLabHours > 0 && !isFullyPlotted;
      remainingType = 'Laboratory';
    } else {
      isFullyPlotted = targetLec > 0 ? plottedLecHours >= targetLec : plottedLecHours > 0;
      isPartiallyPlotted = plottedLecHours > 0 && !isFullyPlotted;
      remainingType = 'Lecture';
    }

    return {
      plottedLecHours,
      plottedLabHours,
      totalPlottedHours,
      targetLec,
      targetLab,
      targetTotal,
      lecDone: targetLec > 0 ? plottedLecHours >= targetLec : true,
      labDone: targetLab > 0 ? plottedLabHours >= targetLab : true,
      isFullyPlotted,
      isPartiallyPlotted,
      matchingEntries,
      remainingType,
    };
  };

  // Filtered and sorted courses:
  // 1. Filter by search query
  // 2. Sort so available / incomplete courses are at the top, and fully plotted courses are at the bottom
  const displayedCourses = useMemo(() => {
    let list = courses;
    if (courseSearch.trim()) {
      const q = courseSearch.toLowerCase().trim();
      list = list.filter(
        (c) =>
          (c.code && c.code.toLowerCase().includes(q)) ||
          (c.title && c.title.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      const aStatus = getCourseScheduleStatus(a);
      const bStatus = getCourseScheduleStatus(b);

      // Incomplete courses first (0), Fully plotted courses at the bottom (1)
      if (aStatus.isFullyPlotted !== bStatus.isFullyPlotted) {
        return aStatus.isFullyPlotted ? 1 : -1;
      }
      // Partially plotted courses above completely unplotted
      if (aStatus.isPartiallyPlotted !== bStatus.isPartiallyPlotted) {
        return aStatus.isPartiallyPlotted ? -1 : 1;
      }
      // Natural order by course code
      return (a.code || '').localeCompare(b.code || '');
    });
  }, [courses, courseSearch, sectionPlotEntries]);

  // Get teachers for selected course
  const availableTeachers = useMemo(() => {
    if (!selectedCourse) return [];
    if (selectedCourse.assignedTeacherUid) {
      const currentAssignedTeacher = teachersList.find(
        (teacher) => teacher.uid === selectedCourse.assignedTeacherUid
      );
      // Never revive a deleted or moved teacher from stale course metadata.
      return currentAssignedTeacher ? [currentAssignedTeacher] : teachersList;
    }
    return teachersList;
  }, [selectedCourse, teachersList]);

  // Filtered teachers by search query
  const displayedTeachers = useMemo(() => {
    if (!teacherSearch.trim()) return availableTeachers;
    const q = teacherSearch.toLowerCase().trim();
    return availableTeachers.filter(
      (t) =>
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.email && t.email.toLowerCase().includes(q))
    );
  }, [availableTeachers, teacherSearch]);

  const managedRoomCountsByBuilding = useMemo(() => {
    const counts = new Map();
    const currentDeanName = String(deanName || '').trim().toLowerCase();
    const isManagedByCurrentDean = (room, floor = {}) => {
      const managerUid = room?.managedBy || floor?.managedBy || '';
      const managerName = String(room?.managedByName || floor?.managedByName || '').trim().toLowerCase();
      return (Boolean(deanUid) && String(managerUid) === String(deanUid))
        || (Boolean(currentDeanName) && managerName === currentDeanName);
    };

    buildings.forEach((building) => {
      const floorRooms = (building.floorData || []).flatMap((floor) =>
        (floor.rooms || []).filter((room) =>
          matchesRoomType(room.type || room.roomType, selectedType) && isManagedByCurrentDean(room, floor)
        )
      );
      const directRooms = (building.rooms || []).filter((room) =>
        matchesRoomType(room.type || room.roomType, selectedType) && isManagedByCurrentDean(room)
      );
      counts.set(building.id, new Set([...floorRooms, ...directRooms].map((room) => room.roomCode || room.name || room.id)).size);
    });
    return counts;
  }, [buildings, selectedType, deanUid, deanName]);

  const managedRoomCount = useMemo(() => (
    [...managedRoomCountsByBuilding.values()].reduce((total, count) => total + count, 0)
  ), [managedRoomCountsByBuilding]);

  // Filtered buildings by search query AND selected class type AND assignedRooms
  const displayedBuildings = useMemo(() => {
    let filtered = buildings;

    const isRoomInAssignedList = (r, list) => {
      if (!list || list.length === 0) return false;
      const c = String(r?.roomCode || r?.name || r?.id || '').trim().toUpperCase();
      return list.some((item) => String(item || '').trim().toUpperCase() === c);
    };
    const isManagedByCurrentDean = (room, floor = {}) => {
      const managerUid = room?.managedBy || floor?.managedBy || '';
      const managerName = String(room?.managedByName || floor?.managedByName || '').trim().toLowerCase();
      const currentDeanName = String(deanName || '').trim().toLowerCase();
      return (Boolean(deanUid) && String(managerUid) === String(deanUid))
        || (Boolean(currentDeanName) && managerName === currentDeanName);
    };
    const isAccessibleRoom = (room, floor = {}) => (
      isRoomInAssignedList(room, assignedRooms) || isManagedByCurrentDean(room, floor)
    );

    // Assigned rooms and rooms managed by this dean are immediately accessible.
    if (!showAllAvailableRooms) {
      filtered = filtered.filter((b) => {
        const floors = Array.isArray(b.floorData) ? b.floorData : [];
        const roomsDirect = Array.isArray(b.rooms) ? b.rooms : [];
        const hasAssignedInFloors = floors.some((f) =>
          (f.rooms || []).some((r) => isAccessibleRoom(r, f))
        );
        if (hasAssignedInFloors) return true;
        return roomsDirect.some((r) => isAccessibleRoom(r));
      });
    }

    // Filter buildings to only those containing at least 1 room matching selectedType
    if (selectedType) {
      filtered = filtered.filter((b) => {
        const floors = Array.isArray(b.floorData) ? b.floorData : [];
        const roomsDirect = Array.isArray(b.rooms) ? b.rooms : [];

        const hasMatchingRoomInFloors = floors.some((f) =>
          (f.rooms || []).some((r) => {
            const matchesType = matchesRoomType(r.type || r.roomType, selectedType);
            if (!matchesType) return false;
            if (!showAllAvailableRooms) {
              return isAccessibleRoom(r, f);
            }
            return true;
          })
        );
        if (hasMatchingRoomInFloors) return true;

        const hasMatchingDirectRoom = roomsDirect.some((r) => {
          const matchesType = matchesRoomType(r.type || r.roomType, selectedType);
          if (!matchesType) return false;
          if (!showAllAvailableRooms) {
            return isAccessibleRoom(r);
          }
          return true;
        });
        if (hasMatchingDirectRoom) return true;

        // Never suggest an empty building. A building becomes selectable only
        // after at least one real room matches the selected component type.
        return false;
      });
    }

    if (buildingSearch.trim()) {
      const q = buildingSearch.toLowerCase().trim();
      filtered = filtered.filter(
        (b) =>
          (b.name && b.name.toLowerCase().includes(q)) ||
          (b.code && b.code.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [buildings, selectedType, buildingSearch, assignedRooms, showAllAvailableRooms, deanUid, deanName]);

  // Get all floors & rooms for selected building, strictly filtered by selected class type & assignedRooms
  const availableFloors = useMemo(() => {
    if (!selectedBuilding) return [];

    let rawFloors = [];

    const isRoomInAssignedList = (r, list) => {
      if (!list || list.length === 0) return false;
      const c = String(r?.roomCode || r?.name || r?.id || '').trim().toUpperCase();
      return list.some((item) => String(item || '').trim().toUpperCase() === c);
    };

    // 1. If floorData array exists on building object
    if (Array.isArray(selectedBuilding.floorData) && selectedBuilding.floorData.length > 0) {
      rawFloors = selectedBuilding.floorData.map((floor, idx) => ({
        ...floor,
        floorNumber: floor.floorNumber || idx + 1,
        label: floor.label || `Floor ${floor.floorNumber || idx + 1}`,
        rooms: Array.isArray(floor.rooms) ? floor.rooms : [],
      }));
    } else if (Array.isArray(selectedBuilding.rooms) && selectedBuilding.rooms.length > 0) {
      const grouped = {};
      selectedBuilding.rooms.forEach((r) => {
        const fn = r.floorNumber || r.floor || 1;
        if (!grouped[fn]) {
          grouped[fn] = {
            floorNumber: fn,
            label: `${fn}${fn === 1 ? 'st' : fn === 2 ? 'nd' : fn === 3 ? 'rd' : 'th'} Floor`,
            rooms: [],
          };
        }
        grouped[fn].rooms.push(r);
      });
      rawFloors = Object.values(grouped).sort((a, b) => a.floorNumber - b.floorNumber);
    } else {
      // Fallback: construct floors based on building.floors count
      const floorCount = Number(selectedBuilding.floors) || 1;
      rawFloors = Array.from({ length: floorCount }, (_, idx) => {
        const fn = idx + 1;
        return {
          floorNumber: fn,
          label: `${fn}${fn === 1 ? 'st' : fn === 2 ? 'nd' : fn === 3 ? 'rd' : 'th'} Floor`,
          rooms: [],
        };
      });
    }

    // Filter rooms by selected class type (Lecture vs Laboratory) AND assignedRooms
    return rawFloors
      .map((f) => {
        const matchingRooms = f.rooms.filter((r) => {
          const matchesType = matchesRoomType(r.type || r.roomType, selectedType);
          if (!matchesType) return false;
          if (!showAllAvailableRooms) {
            const effectiveManagerUid = r.managedBy || f.managedBy || null;
            const effectiveManagerName = String(r.managedByName || f.managedByName || '').trim().toLowerCase();
            const currentDeanName = String(deanName || '').trim().toLowerCase();
            const managedByCurrentDean = (Boolean(deanUid) && String(effectiveManagerUid || '') === String(deanUid))
              || (Boolean(currentDeanName) && effectiveManagerName === currentDeanName);
            return isRoomInAssignedList(r, assignedRooms) || managedByCurrentDean;
          }
          return true;
        }).map((room) => ({
          ...room,
          effectiveManagerUid: room.managedBy || f.managedBy || null,
          effectiveManagerName: room.managedByName || f.managedByName || null,
          effectiveFloorId: room.floorId || f.floorId || f.id || null,
          effectiveFloorNumber: room.floorNumber || f.floorNumber || f.floor || null,
        }));
        return {
          ...f,
          rooms: matchingRooms,
        };
      })
      .filter((f) => f.rooms.length > 0);
  }, [selectedBuilding, selectedType, assignedRooms, showAllAvailableRooms, deanUid, deanName]);

  const selectedRoomIsBudgeted = useMemo(() => {
    if (!selectedRoom) return false;
    const managerUid = selectedRoom.effectiveManagerUid || selectedRoom.managedBy || '';
    const managerName = String(selectedRoom.effectiveManagerName || selectedRoom.managedByName || '').trim().toLowerCase();
    const currentDeanName = String(deanName || '').trim().toLowerCase();
    const managedByCurrentDean = (Boolean(deanUid) && String(managerUid) === String(deanUid))
      || (Boolean(currentDeanName) && managerName === currentDeanName);
    if (managedByCurrentDean) return true;
    if (!assignedRooms?.length) return false;
    const selectedCode = String(selectedRoom.roomCode || selectedRoom.name || selectedRoom.id || '').trim().toUpperCase();
    return assignedRooms.some((code) => String(code || '').trim().toUpperCase() === selectedCode);
  }, [selectedRoom, assignedRooms, deanUid, deanName]);

  const selectedRoomApprover = useMemo(() => {
    if (!selectedRoom || selectedRoomIsBudgeted) return null;
    const managerUid = selectedRoom.effectiveManagerUid || selectedRoom.managedBy || '';
    const managerName = String(selectedRoom.effectiveManagerName || selectedRoom.managedByName || '').trim();
    if (!managerUid && !managerName) return { name: 'Registrar', department: '' };
    const manager = staffDirectory.find((user) => (
      (managerUid && String(user.uid || user.id) === String(managerUid))
      || (managerName && String(user.name || user.displayName || '').trim().toLowerCase() === managerName.toLowerCase())
    ));
    return {
      name: manager?.name || manager?.displayName || managerName || 'Room Manager',
      department: formatCollegeName(manager?.college || manager?.department || ''),
    };
  }, [selectedRoom, selectedRoomIsBudgeted, staffDirectory]);

  // Pre-select building ONCE if initialBuilding, initialBuildingId, or initial?.buildingName is passed
  useEffect(() => {
    if (initializedBuildingRef.current) return;
    if (buildings.length > 0) {
      if (initialBuilding) {
        const found = buildings.find(b => b.id === initialBuilding.id || b.docId === initialBuilding.docId || b.name === initialBuilding.name) || initialBuilding;
        setSelectedBuilding(found);
        initializedBuildingRef.current = true;
      } else if (initialBuildingId || initial?.buildingId || initial?.buildingName) {
        const bId = initialBuildingId || initial?.buildingId;
        const bName = initial?.buildingName;
        const found = buildings.find(b => 
          (bId && (b.id === bId || b.docId === bId || b.name === bId)) ||
          (bName && (b.name === bName || b.code === bName || (b.name && b.name.toLowerCase().includes(bName.toLowerCase()))))
        );
        if (found) {
          setSelectedBuilding(found);
          initializedBuildingRef.current = true;
        }
      } else if (initial?.roomCode || initialRoomCode || initialRoom?.roomCode) {
        const targetR = initial?.roomCode || initialRoomCode || initialRoom?.roomCode;
        const found = buildings.find(bld => {
          const floors = Array.isArray(bld.floorData) ? bld.floorData : [];
          const directRooms = Array.isArray(bld.rooms) ? bld.rooms : [];
          return floors.some(f => (f.rooms || []).some(r => r.roomCode === targetR || r.name === targetR || r.id === targetR)) ||
                 directRooms.some(r => r.roomCode === targetR || r.name === targetR || r.id === targetR);
        });
        if (found) {
          setSelectedBuilding(found);
          initializedBuildingRef.current = true;
        }
      }
    }
  }, [buildings, initialBuilding, initialBuildingId, initial?.buildingId, initial?.buildingName, initial?.roomCode, initialRoomCode, initialRoom]);

  // Pre-select room ONCE if initialRoom or initialRoomCode is passed
  useEffect(() => {
    if (initializedRoomRef.current) return;
    if (selectedBuilding && availableFloors.length > 0) {
      const targetCode = initialRoom?.roomCode || initialRoom?.id || initialRoom?.name || initialRoomCode || initial?.roomCode || initial?.roomId;
      if (targetCode) {
        for (const floor of availableFloors) {
          const found = (floor.rooms || []).find(
            r => r.roomCode === targetCode || r.id === targetCode || r.name === targetCode || r.docId === targetCode
          );
          if (found) {
            setSelectedRoom(found);
            setOpenFloors(prev => ({ ...prev, [floor.floorNumber]: true }));
            initializedRoomRef.current = true;
            break;
          }
        }
      } else if (initialRoom) {
        setSelectedRoom(initialRoom);
        initializedRoomRef.current = true;
      }
    }
  }, [selectedBuilding, availableFloors, initialRoom, initialRoomCode, initial?.roomCode, initial?.roomId]);

  // Auto-expand all floors when selected building changes
  useEffect(() => {
    if (selectedBuilding && availableFloors.length > 0) {
      const initialOpen = {};
      availableFloors.forEach((f) => {
        initialOpen[f.floorNumber] = true;
      });
      setOpenFloors(initialOpen);
    }
  }, [selectedBuilding, availableFloors]);

  const toggleFloor = (fNum) => {
    setOpenFloors((prev) => ({
      ...prev,
      [fNum]: prev[fNum] === undefined ? false : !prev[fNum],
    }));
  };

  const courseUnits = useMemo(() => getCourseUnitBreakdown(selectedCourse), [selectedCourse]);

  const availableTypes = useMemo(() => {
    if (!selectedCourse) return COURSE_TYPES;
    const cu = getCourseUnitBreakdown(selectedCourse);

    if (isServiceCollegeMode && serviceComponent) {
      return [serviceComponent];
    }

    const motherCol = String(selectedCourse.collegeCode || selectedCourse.college || deanCollege || '').trim().toUpperCase();
    const lecSvc = selectedCourse.lecServiceCollege ? String(selectedCourse.lecServiceCollege).trim().toUpperCase() : '';
    const labSvc = selectedCourse.labServiceCollege ? String(selectedCourse.labServiceCollege).trim().toUpperCase() : '';

    const isLecOut = lecSvc && lecSvc !== motherCol;
    const isLabOut = labSvc && labSvc !== motherCol;

    if (cu.isCombined) {
      if (isLecOut && !isLabOut) return ['Laboratory'];
      if (!isLecOut && isLabOut) return ['Lecture'];
      if (isLecOut && isLabOut) return [];
      return ['Lecture', 'Laboratory'];
    }
    if (cu.isLabOnly) {
      if (isLabOut) return [];
      return ['Laboratory'];
    }
    if (cu.isLecOnly) {
      if (isLecOut) return [];
      return ['Lecture'];
    }
    return ['Lecture'];
  }, [selectedCourse, isServiceCollegeMode, serviceComponent, deanCollege]);

  const isTypeSkipped = useMemo(() => {
    if (skipTypeStep || Boolean(initialRoom || initialRoomCode)) return true;
    if (!selectedCourse) return false;
    if (isServiceCollegeMode && serviceComponent) return true;
    if (availableTypes.length <= 1) return true;
    return courseUnits.isLecOnly || courseUnits.isLabOnly;
  }, [skipTypeStep, initialRoom, initialRoomCode, selectedCourse, courseUnits, isServiceCollegeMode, serviceComponent, availableTypes]);

  // Step Configuration
  const stepConfig = useMemo(() => {
    if (isTypeSkipped) {
      return [
        { id: 1, title: 'Select Course' },
        { id: 6, title: 'Select Preferred Time' },
        { id: 2, title: 'Select Teacher' },
        { id: 4, title: 'Select Building & Room' },
        { id: 5, title: 'Summary' },
      ];
    }
    return [
      { id: 1, title: 'Select Course' },
      { id: 3, title: 'Select Type' },
      { id: 6, title: 'Select Preferred Time' },
      { id: 2, title: 'Select Teacher' },
      { id: 4, title: 'Select Building & Room' },
      { id: 5, title: 'Summary' },
    ];
  }, [isTypeSkipped]);

  const currentStepIndex = useMemo(() => {
    const idx = stepConfig.findIndex((s) => s.id === step);
    return idx >= 0 ? idx : 0;
  }, [stepConfig, step]);

  const totalSteps = stepConfig.length;
  const currentStepTitle = stepConfig[currentStepIndex]?.title || '';

  // Calculate day slots with startHour, endHour, and duration
  const selectedDaySlots = useMemo(() => {
    const slots = [];

    if (selectedDays?.length > 0 && timeMode === 'combined' && combinedStartTime && combinedEndTime) {
      const sHour = parseTimeToHour(combinedStartTime);
      const eHour = parseTimeToHour(combinedEndTime);
      if (eHour > sHour) {
        selectedDays.forEach((d) => slots.push({
          day: d,
          dayName: SCHEDULE_DAYS[d],
          startTime: combinedStartTime,
          endTime: combinedEndTime,
          startHour: sHour,
          endHour: eHour,
          duration: Math.round((eHour - sHour) * 10) / 10,
        }));
      }
    } else if (selectedDays?.length > 0) {
      selectedDays.forEach((d) => {
        const sTime = dayTimes[d]?.startTime || combinedStartTime;
        const eTime = dayTimes[d]?.endTime || combinedEndTime;
        if (sTime && eTime) {
          const sHour = parseTimeToHour(sTime);
          const eHour = parseTimeToHour(eTime);
          if (eHour > sHour) {
            slots.push({
              day: d,
              dayName: SCHEDULE_DAYS[d],
              startTime: sTime,
              endTime: eTime,
              startHour: sHour,
              endHour: eHour,
              duration: Math.round((eHour - sHour) * 10) / 10,
            });
          }
        }
      });
    }

    additionalTimeSlots.forEach((extra, index) => {
      if (extra.day === '' || extra.day === null || extra.day === undefined || !extra.startTime || !extra.endTime) return;
      const startHour = parseTimeToHour(extra.startTime);
      const endHour = parseTimeToHour(extra.endTime);
      if (endHour <= startHour) return;
      slots.push({
        ...extra,
        id: extra.id || `extra-${index}`,
        day: Number(extra.day),
        dayName: SCHEDULE_DAYS[Number(extra.day)],
        startHour,
        endHour,
        duration: Math.round((endHour - startHour) * 10) / 10,
        isAdditional: true,
      });
    });

    return slots.sort((a, b) => a.day - b.day || a.startHour - b.startHour);
  }, [selectedDays, timeMode, combinedStartTime, combinedEndTime, dayTimes, additionalTimeSlots]);

  const overlappingPreferredSlots = useMemo(() => {
    const overlaps = [];
    selectedDaySlots.forEach((slot, index) => {
      selectedDaySlots.slice(index + 1).forEach((other) => {
        if (slot.day === other.day && slot.startHour < other.endHour && slot.endHour > other.startHour) {
          overlaps.push({ slot, other });
        }
      });
    });
    return overlaps;
  }, [selectedDaySlots]);

  const totalPlottedHours = useMemo(() => {
    return Math.round(selectedDaySlots.reduce((acc, slot) => acc + slot.duration, 0) * 10) / 10;
  }, [selectedDaySlots]);

  const sectionTimeConflicts = useMemo(() => {
    if (selectedDaySlots.length === 0) return [];
    const targetSections = new Set(
      (selectedCombinedSections.length ? selectedCombinedSections : [selectedSection])
        .filter(Boolean)
        .map((name) => String(name).trim().toUpperCase())
    );
    const activeEditId = editingEntryId || initial?.id || initial?.entryId;
    const found = [];

    for (const entry of allSemesterEntries || []) {
      if (activeEditId && [entry.id, entry.originalId, entry.combinedGroupId].includes(activeEditId)) continue;
      const entrySection = String(entry.section || entry.sectionName || '').trim().toUpperCase();
      const entrySections = new Set([
        entrySection,
        ...(entry.combinedSections || []).map((name) => String(name).trim().toUpperCase()),
      ]);
      const affected = [...targetSections].filter((name) => entrySections.has(name));
      if (affected.length === 0) continue;

      const entryCycle = String(entry.rotationCycle || entry.weekCycle || 'all').toLowerCase();
      const oppositeRotation =
        (rotationCycle === 'week_a' && entryCycle === 'week_b') ||
        (rotationCycle === 'week_b' && entryCycle === 'week_a');
      if (allowOjtRotation && oppositeRotation) continue;

      const rawDay = entry.day ?? entry.date ?? entry.dayLabel;
      const entryDay = typeof rawDay === 'number'
        ? rawDay
        : Math.max(0, SCHEDULE_DAYS.findIndex((name) => String(rawDay || '').toUpperCase().includes(name)));
      const start = Number(entry.startHour) || 0;
      const end = Number(entry.endHour) || 0;
      for (const slot of selectedDaySlots) {
        if (entryDay === slot.day && start < slot.endHour && end > slot.startHour) {
          found.push({ ...entry, affectedSections: affected, conflictDayName: slot.dayName, start, end });
          break;
        }
      }
    }
    return found;
  }, [selectedDaySlots, selectedCombinedSections, selectedSection, allSemesterEntries, editingEntryId, initial, rotationCycle, allowOjtRotation]);

  const targetHours = useMemo(() => {
    return courseUnits.targetHoursForType(selectedType);
  }, [courseUnits, selectedType]);

  const componentHoursProgress = useMemo(() => {
    const status = getCourseScheduleStatus(selectedCourse);
    const activeEditId = editingEntryId || initial?.id || initial?.entryId;
    const selectedIsLab = String(selectedType || '').toLowerCase().includes('lab');
    const alreadyPlotted = (status.matchingEntries || []).reduce((sum, entry) => {
      const entryIsLab = String(entry.type || '').toLowerCase().includes('lab');
      if (entryIsLab !== selectedIsLab) return sum;
      if (activeEditId && [entry.id, entry.originalId, entry.combinedGroupId].includes(activeEditId)) return sum;
      const start = entry.startHour ?? parseTimeToHour(entry.startTime || '');
      const end = entry.endHour ?? parseTimeToHour(entry.endTime || '');
      return sum + Math.max(0, (Number(end) || 0) - (Number(start) || 0));
    }, 0);
    const existing = Math.round(alreadyPlotted * 10) / 10;
    const current = Math.round(totalPlottedHours * 10) / 10;
    const required = Math.round(targetHours * 10) / 10;
    const resulting = Math.round((existing + current) * 10) / 10;
    return {
      existing,
      current,
      required,
      resulting,
      remaining: Math.round(Math.max(0, required - resulting) * 10) / 10,
      excess: Math.round(Math.max(0, resulting - required) * 10) / 10,
    };
  }, [selectedCourse, selectedType, sectionPlotEntries, editingEntryId, initial, totalPlottedHours, targetHours]);

  const otherType = useMemo(() => {
    if (!courseUnits?.isCombined) return null;
    if (!selectedType) return null;
    const target = selectedType === 'Laboratory' ? 'Lecture' : 'Laboratory';
    if (!availableTypes.includes(target)) return null;
    return target;
  }, [courseUnits, selectedType, availableTypes]);

  const isOtherTypePending = useMemo(() => {
    if (!otherType) return false;
    if (completedTypes.includes(otherType)) return false;
    if (!availableTypes.includes(otherType)) return false;

    // Check if the other component is already plotted in sectionPlotEntries
    if (selectedCourse) {
      const status = getCourseScheduleStatus(selectedCourse);
      if (otherType === 'Lecture' && status.lecDone) return false;
      if (otherType === 'Laboratory' && status.labDone) return false;
    }

    return true;
  }, [otherType, completedTypes, availableTypes, selectedCourse, sectionPlotEntries]);

  // Helper to parse day from entry
  const parseDayIndex = (d, dateStr, dayLabelStr) => {
    if (typeof d === 'number' && d >= 0 && d <= 6) return d;
    const str = String(d || dateStr || dayLabelStr || '').trim().toUpperCase();
    const idx = SCHEDULE_DAYS.findIndex((dayName) => str.includes(dayName) || dayName.includes(str));
    return idx >= 0 ? idx : 0;
  };

  // Compute occupied intervals per day (0-6) for selected room, section, and teacher
  const occupiedIntervalsByDay = useMemo(() => {
    const map = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    if (!allSemesterEntries || allSemesterEntries.length === 0) return map;

    const rCodeNorm = selectedRoom?.roomCode ? String(selectedRoom.roomCode).replace(/[\s\-_]/g, '').toUpperCase() : '';
    const sectionNorms = new Set(
      (selectedCombinedSections.length > 0 ? selectedCombinedSections : [selectedSection])
        .filter(Boolean)
        .map((name) => String(name).trim().toUpperCase())
    );
    const tName = selectedTeacher?.name && selectedTeacher.name !== 'TBA (To Be Assigned)' ? String(selectedTeacher.name).trim().toLowerCase() : '';
    const tEmail = selectedTeacher?.email ? String(selectedTeacher.email).trim().toLowerCase() : '';

    const activeEditId = editingEntryId || initial?.id || initial?.entryId;
    const initialCourseCodeNorm = String(initial?.courseCode || initial?.title || selectedCourse?.code || '').trim().toUpperCase();

    allSemesterEntries.forEach((entry) => {
      // 1. Exclude the exact entry being edited by ID
      if (activeEditId && (entry.id === activeEditId || entry.originalId === activeEditId || entry.combinedGroupId === activeEditId)) {
        return;
      }

      // 2. Exclude matching entry if in edit mode (same course, section, and day)
      if (isEditMode && initialCourseCodeNorm) {
        const eCode = String(entry.courseCode || entry.title || '').trim().toUpperCase();
        const eSec = String(entry.section || entry.sectionName || '').trim().toUpperCase();
        const eDay = typeof entry.day === 'number' && entry.day >= 0 && entry.day <= 6
          ? entry.day
          : parseDayIndex(entry.day, entry.date, entry.dayLabel);
        const initDay = typeof initial?.day === 'number' ? initial.day : dayIndex;

        if (eCode === initialCourseCodeNorm && (sectionNorms.has(eSec) || (initial?.combinedSections || []).map(s => String(s).toUpperCase()).includes(eSec)) && eDay === initDay) {
          return;
        }
      }

      const eDay = typeof entry.day === 'number' && entry.day >= 0 && entry.day <= 6
        ? entry.day
        : parseDayIndex(entry.day, entry.date, entry.dayLabel);
      if (eDay < 0 || eDay > 6) return;

      const sHour = Number(entry.startHour) || 0;
      const eHour = Number(entry.endHour) || 0;
      if (eHour <= sHour) return;

      let isOccupied = false;
      let reason = '';

      // Check rotation cycle compatibility
      const entryCycle = entry.rotationCycle || entry.weekCycle || 'all';
      const isOppositeCycle =
        (rotationCycle === 'week_a' && entryCycle === 'week_b') ||
        (rotationCycle === 'week_b' && entryCycle === 'week_a');

      // 1. Room is occupied (only if NOT opposite rotation cycles!)
      if (rCodeNorm && !isOppositeCycle) {
        const entryRoomNorm = String(entry.roomCode || entry.room || '').replace(/[\s\-_]/g, '').toUpperCase();
        if (entryRoomNorm === rCodeNorm) {
          isOccupied = true;
          reason = `Room ${selectedRoom.roomCode} Occupied (${entry.courseCode || entry.title || 'Class'}${entryCycle !== 'all' ? ` • ${entryCycle.toUpperCase()}` : ''})`;
        }
      }

      // 2. Section is occupied
      if (!isOccupied && sectionNorms.size > 0) {
        const entrySec = String(entry.section || entry.sectionName || '').trim().toUpperCase();
        const entryCombinedSections = (entry.combinedSections || []).map((name) => String(name).trim().toUpperCase());
        const conflictingSection = [...sectionNorms].find(
          (name) => entrySec === name || entryCombinedSections.includes(name)
        );
        if (conflictingSection) {
          isOccupied = true;
          reason = `Section ${conflictingSection} in Class (${entry.courseCode || entry.title || 'Class'})`;
        }
      }

      // 3. Teacher is occupied
      if (!isOccupied && (tName || tEmail)) {
        const inst = String(entry.instructor || '').trim().toLowerCase();
        const instEmail = String(entry.instructorEmail || '').trim().toLowerCase();
        if (
          (tName && (inst === tName || inst.includes(tName) || tName.includes(inst))) ||
          (tEmail && instEmail === tEmail)
        ) {
          isOccupied = true;
          reason = `Teacher ${selectedTeacher.name} Busy (${entry.courseCode || entry.title || 'Class'})`;
        }
      }

      if (isOccupied) {
        map[eDay].push({
          startHour: sHour,
          endHour: eHour,
          reason,
        });
      }
    });

    return map;
  }, [allSemesterEntries, selectedRoom, selectedSection, selectedCombinedSections, selectedTeacher, editingEntryId, initial, isEditMode, selectedCourse, dayIndex, rotationCycle]);

  // Generates start time dropdown options with occupied slots disabled
  const getStartTimeOptions = useCallback((daysToCheck) => {
    const days = daysToCheck && daysToCheck.length > 0 ? daysToCheck : [];
    const totalSlots = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 2;

    return Array.from({ length: totalSlots }, (_, i) => {
      const h = SCHEDULE_START_HOUR + i * 0.5;
      const val = hourToTimeInput(h);
      const label = formatScheduleHour(h);

      if (days.length === 0) {
        return { value: val, label, disabled: false };
      }

      let isOccupied = false;
      for (const d of days) {
        const intervals = occupiedIntervalsByDay[d] || [];
        for (const occ of intervals) {
          if (h >= occ.startHour && h < occ.endHour) {
            isOccupied = true;
            break;
          }
          if (Math.max(h, occ.startHour) < Math.min(h + 0.5, occ.endHour)) {
            isOccupied = true;
            break;
          }
        }
        if (isOccupied) break;
      }

      return {
        value: val,
        label,
        disabled: isOccupied,
      };
    });
  }, [occupiedIntervalsByDay]);

  // Generates end time dropdown options with occupied/conflict slots disabled
  const getEndTimeOptions = useCallback((daysToCheck, currentStartTimeVal) => {
    const days = daysToCheck && daysToCheck.length > 0 ? daysToCheck : [];
    const sHour = currentStartTimeVal ? parseTimeToHour(currentStartTimeVal) : SCHEDULE_START_HOUR;
    const totalSlots = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 2;

    return Array.from({ length: totalSlots }, (_, i) => {
      const h = SCHEDULE_START_HOUR + (i + 1) * 0.5;
      const val = hourToTimeInput(h);
      const label = formatScheduleHour(h);

      if (h <= sHour) {
        return { value: val, label, disabled: true };
      }

      if (days.length === 0) {
        return { value: val, label, disabled: false };
      }

      let hasConflict = false;
      for (const d of days) {
        const intervals = occupiedIntervalsByDay[d] || [];
        for (const occ of intervals) {
          if (Math.max(sHour, occ.startHour) < Math.min(h, occ.endHour)) {
            hasConflict = true;
            break;
          }
        }
        if (hasConflict) break;
      }

      return {
        value: val,
        label,
        disabled: hasConflict,
      };
    });
  }, [occupiedIntervalsByDay]);

  const getAdditionalStartOptions = useCallback((extra, index) => {
    const day = Number(extra.day);
    const currentId = extra.id || `extra-${index}`;
    const otherProposed = selectedDaySlots.filter((slot) => slot.day === day && slot.id !== currentId);
    return getStartTimeOptions([day]).map((option) => {
      const hour = parseTimeToHour(option.value);
      const overlapsProposed = otherProposed.some((slot) => hour < slot.endHour && hour + 0.5 > slot.startHour);
      return {
        ...option,
        disabled: option.disabled || overlapsProposed,
        label: overlapsProposed ? `${option.label} (Already selected)` : option.label,
      };
    });
  }, [selectedDaySlots, getStartTimeOptions]);

  const getAdditionalEndOptions = useCallback((extra, index) => {
    const day = Number(extra.day);
    const currentId = extra.id || `extra-${index}`;
    const startHour = parseTimeToHour(extra.startTime);
    const otherProposed = selectedDaySlots.filter((slot) => slot.day === day && slot.id !== currentId);
    return getEndTimeOptions([day], extra.startTime).map((option) => {
      const endHour = parseTimeToHour(option.value);
      const crossesProposed = Number.isFinite(startHour) && otherProposed.some(
        (slot) => startHour < slot.endHour && endHour > slot.startHour
      );
      return {
        ...option,
        disabled: option.disabled || crossesProposed,
        label: crossesProposed ? `${option.label} (Crosses selected time)` : option.label,
      };
    });
  }, [selectedDaySlots, getEndTimeOptions]);

  // Auto-adjust start & end times when room, days, or occupied intervals change so current selection doesn't sit on an occupied slot
  useEffect(() => {
    if (!selectedDays || selectedDays.length === 0) return;

    if (timeMode === 'combined') {
      const startOpts = getStartTimeOptions(selectedDays);
      const currentStartOpt = startOpts.find((o) => o.value === combinedStartTime);
      
      // If current start time is occupied/disabled, switch to first available start time
      if (!currentStartOpt || currentStartOpt.disabled) {
        if (isEditMode && initial?.startTime && combinedStartTime === initial.startTime) {
          // Keep initial start time in edit mode
        } else {
          const firstAvailable = startOpts.find((o) => !o.disabled);
          if (firstAvailable) {
            setCombinedStartTime(firstAvailable.value);
            const sH = parseTimeToHour(firstAvailable.value);
            const endOpts = getEndTimeOptions(selectedDays, firstAvailable.value);
            const firstValidEnd = endOpts.find((o) => !o.disabled && parseTimeToHour(o.value) > sH);
            if (firstValidEnd) {
              setCombinedEndTime(firstValidEnd.value);
            }
          }
        }
      } else {
        // If start time is ok, verify end time is not disabled
        const endOpts = getEndTimeOptions(selectedDays, combinedStartTime);
        const currentEndOpt = endOpts.find((o) => o.value === combinedEndTime);
        if (!currentEndOpt || currentEndOpt.disabled) {
          if (isEditMode && initial?.endTime && combinedEndTime === initial.endTime) {
            // Keep initial end time in edit mode
          } else {
            const sH = parseTimeToHour(combinedStartTime);
            const firstValidEnd = endOpts.find((o) => !o.disabled && parseTimeToHour(o.value) > sH);
            if (firstValidEnd) {
              setCombinedEndTime(firstValidEnd.value);
            }
          }
        }
      }
    } else {
      // Individual mode: check each day
      selectedDays.forEach((d) => {
        const dStart = dayTimes[d]?.startTime || combinedStartTime;
        const startOpts = getStartTimeOptions([d]);
        const currentStartOpt = startOpts.find((o) => o.value === dStart);
        if (!currentStartOpt || currentStartOpt.disabled) {
          const firstAvailable = startOpts.find((o) => !o.disabled);
          if (firstAvailable) {
            const sH = parseTimeToHour(firstAvailable.value);
            const endOpts = getEndTimeOptions([d], firstAvailable.value);
            const firstValidEnd = endOpts.find((o) => !o.disabled && parseTimeToHour(o.value) > sH);
            setDayTimes((prev) => ({
              ...prev,
              [d]: {
                startTime: firstAvailable.value,
                endTime: firstValidEnd ? firstValidEnd.value : hourToTimeInput(sH + 1.5),
              },
            }));
          }
        }
      });
    }
  }, [selectedRoom, selectedDays, occupiedIntervalsByDay, timeMode, getStartTimeOptions, getEndTimeOptions, isEditMode, initial]);

  const hoursStatus = useMemo(() => {
    if (selectedDaySlots.length === 0) {
      return {
        type: 'empty',
        message: '👉 Please select schedule day(s) and start/end time above, or click & drag on the room schedule grid below.',
        badge: 'No Time Set',
        color: 'gray',
      };
    }

    const roundedPlotted = componentHoursProgress.resulting;
    const roundedTarget = componentHoursProgress.required;
    const diff = Math.round(Math.abs(roundedPlotted - roundedTarget) * 10) / 10;

    if (roundedPlotted === roundedTarget) {
      return {
        type: 'match',
        message: `Exact Match: ${componentHoursProgress.existing}h already plotted + ${componentHoursProgress.current}h current = ${roundedPlotted}h of ${roundedTarget}h required for ${selectedType}.`,
        badge: '✓ Exact Match',
        color: 'emerald',
      };
    } else if (roundedPlotted > roundedTarget) {
      return {
        type: 'exceed',
        message: `Exceeds Requirement: ${componentHoursProgress.existing}h already plotted + ${componentHoursProgress.current}h current = ${roundedPlotted}h, which is ${diff}h over the ${roundedTarget}h ${selectedType} requirement.`,
        badge: `⚠️ +${diff} hrs Over`,
        color: 'red',
      };
    } else {
      return {
        type: 'lack',
        message: `Remaining Time: ${componentHoursProgress.existing}h already plotted + ${componentHoursProgress.current}h current = ${roundedPlotted}h of ${roundedTarget}h required. ${diff}h still needed for ${selectedType}.`,
        badge: `⚠️ -${diff} hrs Lacking`,
        color: 'red',
      };
    }
  }, [selectedDaySlots, componentHoursProgress, selectedType]);

  // Evaluates a teacher's schedule across all sections in the semester for conflicts
  const getTeacherConflictStatus = (t) => {
    if (!t || !t.name || t.name === 'TBA (To Be Assigned)') {
      return { hasConflict: false, conflicts: [], allTeacherClasses: [] };
    }
    const tName = String(t.name || '').trim().toLowerCase();
    const tEmail = String(t.email || '').trim().toLowerCase();

    const teacherDocs = (allSemesterEntries || []).filter((e) => {
      const activeEditId = editingEntryId || initial?.id || initial?.entryId;
      if (activeEditId && (e.id === activeEditId || e.originalId === activeEditId || e.combinedGroupId === activeEditId)) return false;
      if (isEditMode && initial?.courseCode) {
        const eCode = String(e.courseCode || e.title || '').trim().toUpperCase();
        const initCode = String(initial.courseCode || initial.title || '').trim().toUpperCase();
        const eSec = String(e.section || e.sectionName || '').trim().toUpperCase();
        const eDay = typeof e.day === 'number' ? e.day : parseDayIndex(e.day, e.date, e.dayLabel);
        const initDay = typeof initial?.day === 'number' ? initial.day : dayIndex;
        if (eCode === initCode && (eSec === (selectedSection || '').toUpperCase() || (initial?.combinedSections || []).map(s => String(s).toUpperCase()).includes(eSec)) && eDay === initDay) {
          return false;
        }
      }
      
      const inst = String(e.instructor || '').trim().toLowerCase();
      const instEmail = String(e.instructorEmail || '').trim().toLowerCase();
      if (!inst || inst.includes('tba') || inst.includes('to be assigned')) return false;

      const matchesName = tName && (inst === tName || inst.includes(tName) || tName.includes(inst));
      const matchesEmail = tEmail && (instEmail === tEmail || inst.includes(tEmail));
      return matchesName || matchesEmail;
    });

    if (!selectedDaySlots || selectedDaySlots.length === 0) {
      return { hasConflict: false, conflicts: [], allTeacherClasses: teacherDocs };
    }

    const tConflicts = [];
    selectedDaySlots.forEach((slot) => {
      teacherDocs.forEach((doc) => {
        const docDay = typeof doc.day === 'number' ? doc.day : 0;
        if (docDay === slot.day) {
          const dStart = Number(doc.startHour) || 0;
          const dEnd = Number(doc.endHour) || 0;
          if (dStart < slot.endHour && dEnd > slot.startHour) {
            tConflicts.push({
              ...doc,
              conflictDay: slot.day,
              conflictDayName: SCHEDULE_DAYS[slot.day],
              overlapStart: Math.max(dStart, slot.startHour),
              overlapEnd: Math.min(dEnd, slot.endHour),
              courseCode: doc.courseCode || doc.title,
              roomCode: doc.roomCode || 'Other Room',
              section: doc.section || 'Other Section',
              start: dStart,
              end: dEnd,
            });
          }
        }
      });
    });

    return {
      hasConflict: tConflicts.length > 0,
      conflicts: tConflicts,
      allTeacherClasses: teacherDocs,
    };
  };

  const selectedTeacherConflict = useMemo(() => {
    return getTeacherConflictStatus(selectedTeacher);
  }, [selectedTeacher, selectedDaySlots, allSemesterEntries, editingEntryId, isEditMode, initial, selectedSection, dayIndex]);

  const getRoomConflictStatus = useCallback((room) => {
    const roomCode = String(room?.roomCode || room?.name || room?.id || '').replace(/[\s\-_]/g, '').toUpperCase();
    if (!roomCode || selectedDaySlots.length === 0) return { hasConflict: false, conflicts: [] };
    const activeEditId = editingEntryId || initial?.id || initial?.entryId;
    const conflicts = (allSemesterEntries || []).filter((entry) => {
      if (activeEditId && [entry.id, entry.originalId, entry.combinedGroupId].includes(activeEditId)) return false;
      const entryRoom = String(entry.roomCode || entry.room || entry.roomId || '').replace(/[\s\-_]/g, '').toUpperCase();
      if (entryRoom !== roomCode) return false;
      const entryCycle = String(entry.rotationCycle || entry.weekCycle || 'all').toLowerCase();
      if ((rotationCycle === 'week_a' && entryCycle === 'week_b') || (rotationCycle === 'week_b' && entryCycle === 'week_a')) return false;
      const entryDay = parseDayIndex(entry.day, entry.date, entry.dayLabel);
      const start = Number(entry.startHour) || 0;
      const end = Number(entry.endHour) || 0;
      return selectedDaySlots.some((slot) => entryDay === slot.day && start < slot.endHour && end > slot.startHour);
    });
    return { hasConflict: conflicts.length > 0, conflicts };
  }, [selectedDaySlots, allSemesterEntries, editingEntryId, initial, rotationCycle]);

  // Allows freely clicking between any steps in the stepper header
  const handleStepClick = (targetStepId) => {
    setError('');
    if (targetStepId === 1) {
      setStep(1);
      return;
    }
    if (!selectedCourse) {
      setError('Please select a course first before moving to other steps.');
      return;
    }
    if (step === 6 && targetStepId !== 1 && targetStepId !== 6) {
      if (selectedDaySlots.length === 0) {
        setError('Select at least one day and a valid preferred start and end time.');
        return;
      }
      if (overlappingPreferredSlots.length > 0) {
        setError('Two preferred time blocks overlap on the same day. Adjust or remove one of the blocks before continuing.');
        return;
      }
      if (componentHoursProgress.resulting > componentHoursProgress.required) {
        setError(`The selected time exceeds the required ${componentHoursProgress.required} hours for ${selectedType}.`);
        return;
      }
      if (sectionTimeConflicts.length > 0) {
        setError('The preferred time overlaps an existing section schedule. Choose a conflict-free time before continuing.');
        return;
      }
    }
    const targetStepIndex = stepConfig.findIndex((item) => item.id === targetStepId);
    if (step === 4 && targetStepIndex > currentStepIndex && !selectedRoom) {
      setError('Please select a room before continuing to the next step.');
      return;
    }
    setStep(targetStepId);
  };

  // Helper to switch type and automatically load existing schedule configuration (Building, Room, Time, Days, Instructor) for that type
  const handleTypeSelect = (type, targetCourse = selectedCourse, specificEntry = null) => {
    setSelectedType(type);
    const courseToInspect = targetCourse || selectedCourse;
    if (!courseToInspect) return;

    setRoomConflicts([]);

    const status = getCourseScheduleStatus(courseToInspect);
    const typeEntries = specificEntry
      ? [specificEntry]
      : (status.matchingEntries || []).filter((e) => {
          const isLab = String(e.type || '').toLowerCase().includes('lab');
          return type === 'Laboratory' ? isLab : !isLab;
        });

    if (typeEntries.length > 0) {
      const primaryEntry = typeEntries[0];
      setEditingEntryId(primaryEntry.id || null);

      // Pre-fill building if available
      if (primaryEntry.buildingId || primaryEntry.buildingName) {
        const b = buildings.find(
          (bld) =>
            bld.id === primaryEntry.buildingId ||
            bld.name === primaryEntry.buildingName ||
            bld.code === primaryEntry.buildingName
        );
        if (b) {
          setSelectedBuilding(b);
        } else if (primaryEntry.buildingName) {
          setSelectedBuilding({ name: primaryEntry.buildingName, code: primaryEntry.buildingName, id: primaryEntry.buildingId });
        }
      }

      // Pre-fill room if available
      if (primaryEntry.roomCode) {
        setSelectedRoom({
          roomCode: primaryEntry.roomCode,
          name: primaryEntry.roomCode,
          id: primaryEntry.roomCode,
          type: primaryEntry.type,
        });
      }

      // Pre-fill all scheduled days for this component
      const days = Array.from(
        new Set(
          typeEntries
            .map((e) => Number(e.day))
            .filter((d) => !isNaN(d) && d >= 0 && d <= 6)
        )
      );
      setSelectedDays(days.length > 0 ? days : (primaryEntry.day !== undefined ? [Number(primaryEntry.day)] : []));

      // Pre-fill start and end time from existing entry
      if (primaryEntry.startHour !== undefined && primaryEntry.endHour !== undefined) {
        setCombinedStartTime(hourToTimeInput(primaryEntry.startHour));
        setCombinedEndTime(hourToTimeInput(primaryEntry.endHour));
      } else if (primaryEntry.startTime && primaryEntry.endTime) {
        setCombinedStartTime(primaryEntry.startTime);
        setCombinedEndTime(primaryEntry.endTime);
      }

      // Pre-fill individual dayTimes if slots vary
      const dTimes = {};
      typeEntries.forEach((e) => {
        if (e.day !== undefined) {
          const sT = e.startHour !== undefined ? hourToTimeInput(e.startHour) : (e.startTime || '');
          const eT = e.endHour !== undefined ? hourToTimeInput(e.endHour) : (e.endTime || '');
          if (sT && eT) {
            dTimes[e.day] = { startTime: sT, endTime: eT };
          }
        }
      });
      setDayTimes(dTimes);

      // Pre-fill teacher if assigned
      if (primaryEntry.instructor && primaryEntry.instructor !== 'TBA') {
        setSelectedTeacher({
          uid: primaryEntry.instructorUid || null,
          name: primaryEntry.instructor,
          email: primaryEntry.instructorEmail || '',
        });
      } else {
        setSelectedTeacher({ uid: null, name: 'TBA (To Be Assigned)', email: '' });
      }
    } else {
      // If no entries plotted for this type yet, start fresh
      setEditingEntryId(null);
      setSelectedBuilding(null);
      setSelectedRoom(null);
      setSelectedDays([]);
      setCombinedStartTime('');
      setCombinedEndTime('');
      setDayTimes({});
      setAdditionalTimeSlots([]);
    }
  };

  // Initiates editing mode for a course and directly transitions into configuring schedule
  const startEditingCourse = (course, targetEntry = null) => {
    setError('');
    setIsEditMode(true);
    setSelectedCourse(course);
    setRoomConflicts([]);

    const cu = getCourseUnitBreakdown(course);
    const status = getCourseScheduleStatus(course);

    let initialTypeToUse = 'Lecture';
    if (targetEntry) {
      initialTypeToUse = targetEntry.type || (cu.isLabOnly ? 'Laboratory' : 'Lecture');
    } else if (status.isPartiallyPlotted && status.remainingType) {
      initialTypeToUse = status.remainingType;
    } else if (cu.isLabOnly) {
      initialTypeToUse = 'Laboratory';
    } else {
      initialTypeToUse = 'Lecture';
    }

    handleTypeSelect(initialTypeToUse, course, targetEntry);
    setViewScheduleCourse(null);

    // Existing blocks still pass through preferred-time validation before resources are chosen.
    if (cu.isCombined && !targetEntry) {
      setStep(3);
    } else {
      setStep(6);
    }
  };

  // Start a separate meeting without modifying an existing schedule entry.
  const startAddingCourseBlock = (course) => {
    const cu = getCourseUnitBreakdown(course);

    setError('');
    setIsEditMode(false);
    setEditingEntryId(null);
    setSelectedCourse(course);
    setSelectedType(cu.isLabOnly ? 'Laboratory' : 'Lecture');
    setSelectedTeacher(null);
    setSelectedBuilding(null);
    setSelectedRoom(null);
    setSelectedDays([]);
    setCombinedStartTime('');
    setCombinedEndTime('');
    setDayTimes({});
    setAdditionalTimeSlots([]);
    setRoomConflicts([]);
    setViewScheduleCourse(null);
    setStep(cu.isCombined ? 3 : 4);
  };

  const handleNext = () => {
    setError('');

    if (step === 1) {
      if (!selectedCourse) {
        setError('Please select a course to continue.');
        return;
      }
      // Auto-set type if course is lecture-only or lab-only
      const cu = getCourseUnitBreakdown(selectedCourse);
      if (cu.isLecOnly) {
        setSelectedType('Lecture');
      } else if (cu.isLabOnly) {
        setSelectedType('Laboratory');
      }
    }

    if (step === 3 && !selectedType) {
      setError('Please select a course type.');
      return;
    }

    if (step === 6) {
      if (selectedDaySlots.length === 0) {
        setError('Select at least one day and a valid preferred start and end time.');
        return;
      }
      if (overlappingPreferredSlots.length > 0) {
        setError('Two preferred time blocks overlap on the same day. Adjust or remove one of the blocks.');
        return;
      }
      if (componentHoursProgress.resulting > componentHoursProgress.required) {
        setError(`The selected time exceeds the required ${componentHoursProgress.required} hours for ${selectedType}.`);
        return;
      }
      for (const slot of selectedDaySlots) {
        const timeCheck = validateScheduleHours(slot.startHour, slot.endHour);
        if (!timeCheck.valid) {
          setError(`${slot.dayName}: ${timeCheck.message}`);
          return;
        }
      }
      if (sectionTimeConflicts.length > 0) {
        const conflict = sectionTimeConflicts[0];
        setError(`Section conflict: ${conflict.affectedSections.join(', ')} already has ${conflict.courseCode || conflict.title || 'a class'} on ${conflict.conflictDayName} at ${formatScheduleHour(conflict.start)}–${formatScheduleHour(conflict.end)}.`);
        return;
      }
    }

    if (step === 4) {
      if (!selectedBuilding) {
        setError('Please select a building.');
        return;
      }
      if (!selectedRoom) {
        setError('Please select a room from the left floor list.');
        return;
      }
      if (!selectedRoomIsBudgeted && !nonBudgetedRoomReason.trim()) {
        setError('Please explain why this non-assigned room is required.');
        return;
      }
      // Only room occupancy and section double-booking block proceeding from Step 3 (Building & Room)
      const hardConflicts = roomConflicts.filter((c) => c.conflictType !== 'teacher');
      if (hardConflicts.length > 0) {
        const firstConflict = hardConflicts[0];
        const conflictTypeLabel = firstConflict.conflictType === 'section' ? 'Section Conflict' : 'Room Conflict';
        setError(`⚠️ ${conflictTypeLabel}: ${firstConflict.message || 'Time conflict detected.'} Please choose a different time slot or room.`);
        return;
      }
    }

    if (step === 2) {
      if (selectedTeacherConflict.hasConflict) {
        setError(`Cannot proceed: ${selectedTeacher?.name || 'Selected teacher'} has a schedule conflict.`);
        return;
      }
    }

    const nextStepObj = stepConfig[currentStepIndex + 1];
    if (nextStepObj) {
      setStep(nextStepObj.id);
    }
  };

  const handleBack = () => {
    setError('');
    const prevStepObj = stepConfig[currentStepIndex - 1];
    if (prevStepObj) {
      setStep(prevStepObj.id);
    }
  };

  const handleSubmit = async (continueToOther = false) => {
    setError('');

    if (dayBlockReason) {
      setError(dayBlockReason);
      return;
    }

    if (!selectedCourse || !selectedBuilding || !selectedRoom || selectedDaySlots.length === 0) {
      setError('Please complete all schedule details.');
      return;
    }

    const hardConflicts = roomConflicts.filter((c) => c.conflictType !== 'teacher');
    if (hardConflicts.length > 0) {
      setError('Cannot save schedule: Room or section schedule conflict detected. Please select an available time slot or room.');
      return;
    }

    if (selectedTeacherConflict.hasConflict) {
      setError(`Cannot save schedule: ${selectedTeacher.name} has a schedule conflict. Please choose another faculty member or select TBA in Step 4.`);
      return;
    }

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayLabels = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

    const confirmed = await showConfirm({
      title: isEditMode ? 'Save schedule changes?' : `Save ${selectedType} schedule?`,
      message: continueToOther
        ? `This will save the ${selectedType} schedule and continue to the ${otherType} component.`
        : isEditMode
          ? `Confirm the updated ${selectedType} schedule for ${selectedCourse.code}.`
          : `Confirm the ${selectedType} schedule for ${selectedCourse.code}${completedTypes.length > 0 ? ' and complete this combined course schedule' : ''}.`,
      confirmText: isEditMode ? 'Save Changes' : continueToOther ? `Save & Continue` : 'Save Schedule',
      cancelText: 'Cancel',
      variant: 'primary',
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      const isCombined = selectedCombinedSections.length > 1;
      const combinedSecList = isCombined ? selectedCombinedSections : [selectedSection || 'Section 1'];
      const approvalSubmissionId = !selectedRoomIsBudgeted
        ? `schedule_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
        : null;

      // Save schedule blocks for each plotted day
      for (const slot of selectedDaySlots) {
        const finalDate = scheduleMode === 'regular' ? dayNames[slot.day] : date;
        const finalDayLabel = scheduleMode === 'regular' ? dayLabels[slot.day] : dayLabel;

        const mainPayload = {
          id: isEditMode ? (editingEntryId || initial?.id || null) : null,
          date: finalDate,
          day: slot.day,
          dayLabel: finalDayLabel,
          title: selectedCourse.title,
          courseCode: selectedCourse.code,
          instructor: selectedTeacher?.name && selectedTeacher.name !== 'TBA (To Be Assigned)' ? selectedTeacher.name : 'TBA',
          instructorUid: selectedTeacher?.uid || null,
          instructorEmail: selectedTeacher?.email || null,
          type: selectedType,
          startHour: slot.startHour,
          endHour: slot.endHour,
          roomCode: selectedRoom.roomCode || selectedRoom.id || selectedRoom.name,
          roomId: selectedRoom.docId || selectedRoom.id || selectedRoom.roomCode,
          buildingId: selectedBuilding?.id || selectedBuilding?.docId,
          buildingName: selectedBuilding?.name,
          floorId: selectedRoom.effectiveFloorId || selectedRoom.floorId || null,
          floor: selectedRoom.effectiveFloorNumber || selectedRoom.floorNumber || selectedRoom.floor || null,
          section: selectedSection || 'Section 1',
          partnerSection: partnerSection || null,
          rotationCycle: allowOjtRotation ? (rotationCycle || 'all') : 'all',
          isCombinedSection: isCombined,
          combinedSections: combinedSecList,
          yearLevel: activeYearLevel !== 'All' ? activeYearLevel : (selectedCourse.yearLevel || '1st Year'),
          scheduleMode,
          semester,
          approvalStatus: selectedRoomIsBudgeted ? 'approved' : 'pending',
          approved: selectedRoomIsBudgeted,
          usedNonBudgetedRoom: !selectedRoomIsBudgeted,
          nonBudgetedRoomReason: !selectedRoomIsBudgeted ? nonBudgetedRoomReason.trim() : null,
          roomManagerUid: selectedRoom?.effectiveManagerUid || selectedRoom?.managedBy || null,
          roomManagerName: selectedRoom?.effectiveManagerName || selectedRoom?.managedByName || null,
          roomManagerDepartment: selectedRoomApprover?.department || null,
          approvalSubmissionId,
        };

        // If auto-mirror partner is checked and partner is selected for rotation
        if (allowOjtRotation && autoMirrorPartner && partnerSection && rotationCycle !== 'all') {
          mainPayload.reciprocalEntry = {
            date: finalDate,
            day: slot.day,
            dayLabel: finalDayLabel,
            title: selectedCourse.title,
            courseCode: selectedCourse.code,
            instructor: selectedTeacher?.name && selectedTeacher.name !== 'TBA (To Be Assigned)' ? selectedTeacher.name : 'TBA',
            instructorUid: selectedTeacher?.uid || null,
            instructorEmail: selectedTeacher?.email || null,
            type: selectedType,
            startHour: slot.startHour,
            endHour: slot.endHour,
            roomCode: selectedRoom.roomCode || selectedRoom.id || selectedRoom.name,
            roomId: selectedRoom.docId || selectedRoom.id || selectedRoom.roomCode,
            buildingId: selectedBuilding?.id || selectedBuilding?.docId,
            buildingName: selectedBuilding?.name,
            floorId: selectedRoom.effectiveFloorId || selectedRoom.floorId || null,
            floor: selectedRoom.effectiveFloorNumber || selectedRoom.floorNumber || selectedRoom.floor || null,
            section: partnerSection,
            partnerSection: selectedSection,
            rotationCycle: rotationCycle === 'week_a' ? 'week_b' : 'week_a',
            yearLevel: activeYearLevel !== 'All' ? activeYearLevel : (selectedCourse.yearLevel || '1st Year'),
            scheduleMode,
            semester,
            approvalStatus: selectedRoomIsBudgeted ? 'approved' : 'pending',
            approved: selectedRoomIsBudgeted,
            usedNonBudgetedRoom: !selectedRoomIsBudgeted,
            nonBudgetedRoomReason: !selectedRoomIsBudgeted ? nonBudgetedRoomReason.trim() : null,
            roomManagerUid: selectedRoom?.effectiveManagerUid || selectedRoom?.managedBy || null,
            roomManagerName: selectedRoom?.effectiveManagerName || selectedRoom?.managedByName || null,
            roomManagerDepartment: selectedRoomApprover?.department || null,
            approvalSubmissionId,
          };
          mainPayload.partnerSection = partnerSection;
        }

        await onSave(mainPayload);
      }

      if (isEditMode) {
        onClose();
        return;
      }

      if (!isEditMode && continueToOther && otherType && isOtherTypePending) {
        const justSavedType = selectedType;
        const nextTargetType = otherType;
        setCompletedTypes((prev) => [...prev, justSavedType]);
        setSelectedType(nextTargetType);
        setSelectedBuilding(null);
        setSelectedRoom(null);
        setSelectedDays([]);
        setCombinedStartTime('');
        setCombinedEndTime('');
        setDayTimes({});
        setAdditionalTimeSlots([]);
        setRoomConflicts([]);
        setShowAllAvailableRooms(false);
        setNonBudgetedRoomReason('');
        setTransitionBanner({
          prevType: justSavedType,
          nextType: nextTargetType,
          courseCode: selectedCourse.code,
        });
        setStep(6); // Select the next component's preferred time before resources
        setSaving(false);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Modal: Save error:', err);
      setError(err.message || 'Failed to save schedule block(s).');
      setSaving(false);
    }
  };

  const semesterDisplay =
    semester === '1' || semester?.includes('1')
      ? '1st Semester'
      : semester === '2' || semester?.includes('2')
      ? '2nd Semester'
      : 'Summer';

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <LoadingModal
        isOpen={saving}
        message={selectedRoomIsBudgeted ? 'Saving approved schedule...' : 'Submitting schedule for room approval...'}
      />
      <div
        className="bg-white rounded-2xl w-full max-w-[1400px] max-h-[90vh] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-xl" style={{ color: '#7A0808' }}>
                  {isEditMode && selectedCourse
                    ? `Edit Schedule: ${selectedCourse.code}`
                    : `Add Schedule Block (${scheduleMode === 'exam' ? 'Exam Mode' : 'Regular Class'})`}
                </h2>
                {isEditMode && (
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wider">
                    Edit Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Step {currentStepIndex + 1} of {totalSteps}: {currentStepTitle}
                {isEditMode && ' • Click any step in the stepper to jump directly'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Stepper Progress with Direct Step Navigation */}
          <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
            {stepConfig.map((s, idx) => {
              const stepNumber = idx + 1;
              const isCurrent = step === s.id;
              const isDone = currentStepIndex > idx;
              const isClickable = Boolean(selectedCourse || s.id === 1);

              return (
                <React.Fragment key={s.id}>
                  <button
                    type="button"
                    onClick={() => handleStepClick(s.id)}
                    disabled={!isClickable}
                    className={`flex items-center gap-2 transition-all text-left p-1 rounded-xl group ${
                      isClickable
                        ? 'cursor-pointer hover:bg-gray-100/80 active:scale-95'
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                    title={isClickable ? `Jump to Step ${stepNumber}: ${s.title}` : 'Select a course first'}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                        isDone
                          ? 'bg-[#7A0808] text-white shadow-2xs group-hover:scale-105'
                          : isCurrent
                          ? 'bg-red-100 text-[#7A0808] border-2 border-[#7A0808] shadow-xs group-hover:scale-105'
                          : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
                      }`}
                    >
                      {stepNumber}
                    </div>
                    <span
                      className={`text-xs font-bold hidden sm:inline transition-colors ${
                        isCurrent
                          ? 'text-[#7A0808]'
                          : isDone
                          ? 'text-gray-800'
                          : 'text-gray-400'
                      }`}
                    >
                      {s.title}
                    </span>
                  </button>
                  {stepNumber < totalSteps && (
                    <div
                      className={`flex-1 h-0.5 mx-2 min-w-[12px] ${
                        currentStepIndex > idx ? 'bg-[#7A0808]' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-semibold text-red-700">{error}</p>
          </div>
        )}

        {dayBlockReason && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-semibold text-red-700">{dayBlockReason}</p>
          </div>
        )}

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Select Course with Tile Subtitle & Search */}
          {step === 1 && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen size={20} className="text-[#7A0808]" />
                    <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                      Select a Course
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <p className="text-xs font-bold text-[#7A0808] bg-red-50/80 px-3 py-1.5 rounded-xl border border-red-200/80 inline-flex items-center gap-1.5 shadow-2xs">
                      <span>Courses for {activeYearLevel} ({semesterDisplay})</span>
                    </p>
                    {deanSections.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 min-w-[170px]">
                        <span>Section:</span>
                        <CustomSelect
                          size="sm"
                          value={selectedSection}
                          onChange={(e) => {
                            setSelectedSection(e.target.value);
                          }}
                          options={deanSections.map((s) => ({
                            value: s.name,
                            label: `${s.name}${s.yearLevel ? ` (${s.yearLevel})` : ''}`,
                          }))}
                          placeholder="Section"
                        />
                      </div>
                    )}
                  </div>
                  {(programCode || deanSections.find((s) => s.name === selectedSection)?.programCode) && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold shadow-2xs">
                      <GraduationCap size={14} className="text-amber-700" />
                      <span>
                        Program: <span className="font-black">{programCode || deanSections.find((s) => s.name === selectedSection)?.programCode}</span>
                        {programName ? ` (${programName})` : ''}
                      </span>
                    </div>
                  )}

                  {/* Multi-Section Merging / Combination Selector (Scoped to SAME Year Level & Program) */}
                  {mergeableSections.length > 1 && (
                    <div className="mt-3 p-3 bg-gray-50/90 rounded-2xl border border-gray-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Users size={13} className="text-[#7A0808]" /> Section Merging in {activeYearLevel} (Capacity Optimization)
                        </span>
                        {selectedCombinedSections.length > 1 && (
                          <span className="text-[10px] font-black uppercase text-purple-800 bg-purple-100 px-2 py-0.5 rounded-md border border-purple-200">
                            Merged ({selectedCombinedSections.length} Sections)
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-500">
                        Merge other {activeYearLevel} sections into this classroom schedule block to maximize room capacity.
                      </p>

                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {mergeableSections.map((sec) => {
                          const isPrimary = sec.name === selectedSection;
                          const isChecked = selectedCombinedSections.includes(sec.name);
                          return (
                            <button
                              key={sec.name}
                              type="button"
                              disabled={isPrimary}
                              onClick={() => {
                                if (isPrimary) return;
                                if (isChecked) {
                                  setSelectedCombinedSections(selectedCombinedSections.filter((s) => s !== sec.name));
                                } else {
                                  setSelectedCombinedSections([...selectedCombinedSections, sec.name]);
                                }
                              }}
                              title={isPrimary ? 'Primary Active Section (Cannot be deselected)' : 'Click to toggle combine/merge'}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${
                                isPrimary
                                  ? 'bg-[#7A0808] text-white border-[#7A0808] shadow-2xs cursor-default'
                                  : isChecked
                                  ? 'bg-purple-700 text-white border-purple-700 shadow-2xs cursor-pointer'
                                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 cursor-pointer'
                              }`}
                            >
                              <span>{sec.name}</span>
                              {isPrimary ? (
                                <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.2 rounded font-black uppercase">
                                  Active
                                </span>
                              ) : isChecked ? (
                                <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.2 rounded font-black uppercase">
                                  Merged
                                </span>
                              ) : null}
                              <span className={`text-[9px] ${isPrimary || isChecked ? 'text-white/80' : 'text-gray-400'} font-normal`}>
                                ({sec.studentCount || sec.studentsPerSection || 40} stds)
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl">
                    {displayedCourses.length} course(s) available
                  </span>
                </div>
              </div>

              {/* Quick Search Bar */}
              <div className="mb-4 relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search course code or title..."
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-1 focus:ring-[#7A0808] focus:border-[#7A0808] font-medium"
                />
                {courseSearch && (
                  <button
                    type="button"
                    onClick={() => setCourseSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {loadingCourses ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">Loading courses...</p>
                </div>
              ) : displayedCourses.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen size={44} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-400">
                    {courseSearch
                      ? `No courses matching "${courseSearch}"`
                      : `No courses found for ${activeYearLevel} (${semesterDisplay})`}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {courseSearch
                      ? 'Try typing a different code or subject title'
                      : 'Add courses for this semester and year level in College Inventory'}
                  </p>
                </div>
              ) : (
                /* Compact Grid Layout for Courses */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {displayedCourses.map((course) => {
                    const isSelected = selectedCourse?.id === course.id;
                    const cu = getCourseUnitBreakdown(course);
                    const status = getCourseScheduleStatus(course);

                    // 1. FULLY PLOTTED / COMPLETED COURSE CARD
                    if (status.isFullyPlotted) {
                      return (
                        <div
                          key={course.id}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            isSelected
                              ? 'border-[#7A0808] bg-red-50/90 shadow-xs'
                              : 'border-gray-200 bg-gray-50/60 hover:bg-gray-100/70 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-black text-xs text-[#7A0808] truncate">{course.code}</span>
                              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-red-50 text-[#7A0808] border border-red-200/80 flex items-center gap-1 flex-shrink-0">
                                <CheckCircle2 size={11} className="text-[#7A0808]" /> Fully Scheduled
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* Eye / View Details Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewScheduleCourse({ course, status, entries: status.matchingEntries });
                                }}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-[#7A0808] hover:bg-red-50 transition-colors cursor-pointer"
                                title="View scheduled time, room, and teacher"
                              >
                                <Eye size={14} />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startAddingCourseBlock(course);
                                }}
                                className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-[#7A0808] bg-white hover:bg-red-50 text-[#7A0808] flex items-center gap-1 transition-colors cursor-pointer"
                                title="Add another non-overlapping schedule block for this course"
                              >
                                <Plus size={11} /> Add Block
                              </button>

                              {/* Edit Schedule Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingCourse(course);
                                }}
                                className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#7A0808] hover:bg-[#9B1B1B] text-white flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                                title="Edit and re-configure schedule for this course"
                              >
                                <Pencil size={11} /> Edit
                              </button>
                            </div>
                          </div>

                          <p className="text-xs font-semibold text-gray-800 truncate mb-1.5">{course.title}</p>

                          {/* Plotted Hours Breakdown */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] pt-1.5 border-t border-gray-200/80">
                            {cu.isCombined ? (
                              <>
                                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-900 font-bold border border-blue-200">
                                  ✓ Lec: {status.plottedLecHours}/{status.targetLec}h
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-900 font-bold border border-emerald-200">
                                  ✓ Lab: {status.plottedLabHours}/{status.targetLab}h
                                </span>
                              </>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 font-bold border border-gray-200">
                                ✓ {status.totalPlottedHours}/{status.targetTotal || status.totalPlottedHours}h Plotted
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-gray-500 ml-auto">
                              {status.matchingEntries.length} block(s)
                            </span>
                          </div>
                        </div>
                      );
                    }

                    // 2. PARTIALLY PLOTTED COURSE CARD
                    if (status.isPartiallyPlotted) {
                      return (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => {
                            setSelectedCourse(course);
                            if (status.remainingType) {
                              setSelectedType(status.remainingType);
                            } else if (cu.isLecOnly) {
                              setSelectedType('Lecture');
                            } else if (cu.isLabOnly) {
                              setSelectedType('Laboratory');
                            } else {
                              setSelectedType('Lecture');
                            }
                            setSelectedTeacher(null);
                          }}
                          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-[#7A0808] bg-red-50/90 shadow-2xs'
                              : 'border-amber-300 bg-amber-50/40 hover:bg-amber-50/80'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-black text-xs text-[#7A0808] truncate">{course.code}</span>
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex-shrink-0">
                                ⚠️ 1 of 2 Parts Plotted
                              </span>
                            </div>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 flex-shrink-0">
                              LEC + LAB
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-gray-900 truncate mb-1.5">{course.title}</p>

                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] pt-1 border-t border-amber-100">
                            {status.lecDone ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold border border-emerald-200">
                                ✓ Lec ({status.plottedLecHours}h) Done
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold border border-amber-200">
                                ⏳ Lec: {status.plottedLecHours}/{status.targetLec}h Remaining
                              </span>
                            )}
                            {status.labDone ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold border border-emerald-200">
                                ✓ Lab ({status.plottedLabHours}h) Done
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold border border-amber-200">
                                ⏳ Lab: {status.plottedLabHours}/{status.targetLab}h Remaining
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    }

                    // 3. UNPLOTTED / AVAILABLE COURSE CARD
                    return (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => {
                          setSelectedCourse(course);
                          if (cu.isLecOnly) {
                            setSelectedType('Lecture');
                          } else if (cu.isLabOnly) {
                            setSelectedType('Laboratory');
                          } else {
                            setSelectedType('Lecture');
                          }
                          setSelectedTeacher(null); // Reset teacher when course changes
                        }}
                        className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#7A0808] bg-red-50/90 shadow-2xs'
                            : 'border-gray-200 hover:border-[#7A0808] hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-black text-xs text-[#7A0808]">{course.code}</span>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${
                              cu.isLabOnly
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : cu.isCombined
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {cu.isLabOnly ? 'LAB ONLY' : cu.isCombined ? 'LEC + LAB' : 'LECTURE'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-gray-900 truncate mb-1.5">{course.title}</p>
                        
                        {/* Units & Contact Hours Breakdown */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          {cu.numLec > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 font-semibold border border-blue-100">
                              {cu.numLec} Lec Unit{cu.numLec > 1 ? 's' : ''} ({cu.targetLecHours}h/wk)
                            </span>
                          )}
                          {cu.numLab > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-100">
                              {cu.numLab} Lab Unit{cu.numLab > 1 ? 's' : ''} ({cu.targetLabHours}h/wk)
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-bold ml-auto">
                            {cu.totalUnits} Units Total
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 6: choose section-safe time before assigning people or rooms */}
          {step === 6 && (
            <div className="space-y-4">
              {transitionBanner && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[#D9A3A3] bg-[#FFF5F5] p-3.5 shadow-xs animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#7A0808] text-sm font-black text-white">
                      2
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#7A0808]">
                        {transitionBanner.prevType} saved — now plotting {transitionBanner.nextType}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-[#9B2C2C]">
                        Part 1 of {transitionBanner.courseCode} is complete. Select the preferred days and times for the {transitionBanner.nextType} component ({targetHours} hrs/week required).
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTransitionBanner(null)}
                    className="flex-shrink-0 rounded-lg border border-[#D9A3A3] bg-white px-2.5 py-1 text-[10px] font-black text-[#7A0808] hover:bg-[#FDE8E8]"
                  >
                    Dismiss
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Calendar size={20} className="text-[#7A0808]" />
                    <h3 className="font-bold text-base text-[#2B3235]">Select Preferred Section Time</h3>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Choose a conflict-free time for {selectedCombinedSections.length > 1 ? `all merged sections (${selectedCombinedSections.join(', ')})` : selectedSection}. Teacher and room availability will be checked next.
                  </p>
                </div>
                <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-[#7A0808]">
                  {selectedCourse?.code} · {selectedType}
                </span>
              </div>

              <div className={`rounded-2xl border-2 p-3 ${componentHoursProgress.resulting === componentHoursProgress.required ? 'border-emerald-300 bg-emerald-50' : componentHoursProgress.resulting > componentHoursProgress.required ? 'border-red-400 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-gray-950">{selectedType} Required Hours</p>
                    <p className="text-[10px] text-gray-600">Only {String(selectedType || 'course').toLowerCase()} blocks for {selectedCourse?.code} are counted here.</p>
                  </div>
                  <span className="rounded-lg bg-white px-2.5 py-1 text-[10px] font-black text-[#7A0808] shadow-sm">
                    {componentHoursProgress.resulting}/{componentHoursProgress.required} hrs after this plot
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-white/80 bg-white/80 p-2">
                    <p className="text-[9px] font-black uppercase text-gray-500">Required</p>
                    <p className="text-sm font-black text-gray-950">{componentHoursProgress.required} hrs</p>
                  </div>
                  <div className="rounded-xl border border-white/80 bg-white/80 p-2">
                    <p className="text-[9px] font-black uppercase text-gray-500">Already plotted</p>
                    <p className="text-sm font-black text-blue-800">{componentHoursProgress.existing} hrs</p>
                  </div>
                  <div className="rounded-xl border border-white/80 bg-white/80 p-2">
                    <p className="text-[9px] font-black uppercase text-gray-500">Current selection</p>
                    <p className="text-sm font-black text-[#7A0808]">{componentHoursProgress.current} hrs</p>
                  </div>
                  <div className="rounded-xl border border-white/80 bg-white/80 p-2">
                    <p className="text-[9px] font-black uppercase text-gray-500">{componentHoursProgress.excess > 0 ? 'Excess' : 'Remaining'}</p>
                    <p className={`text-sm font-black ${componentHoursProgress.excess > 0 ? 'text-red-700' : componentHoursProgress.remaining === 0 ? 'text-emerald-700' : 'text-amber-800'}`}>
                      {componentHoursProgress.excess > 0 ? componentHoursProgress.excess : componentHoursProgress.remaining} hrs
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full transition-all ${componentHoursProgress.resulting > componentHoursProgress.required ? 'bg-red-600' : componentHoursProgress.resulting === componentHoursProgress.required ? 'bg-emerald-600' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, componentHoursProgress.required > 0 ? (componentHoursProgress.resulting / componentHoursProgress.required) * 100 : 0)}%` }}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 space-y-4">
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-600">Select schedule day(s)</p>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {SCHEDULE_DAYS.map((day, index) => {
                      const active = selectedDays.includes(index);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setSelectedDays((prev) => active ? prev.filter((d) => d !== index) : [...prev, index].sort((a, b) => a - b))}
                          className={`rounded-xl border px-2 py-2 text-xs font-black transition-colors ${active ? 'border-[#7A0808] bg-[#7A0808] text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-[#7A0808]'}`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {allowOjtRotation && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-purple-200 bg-purple-50 p-2.5">
                    <span className="text-[10px] font-black uppercase text-purple-900">OJT rotational week</span>
                    <div className="flex gap-1">
                      {[['all', 'All Weeks'], ['week_a', 'Week A'], ['week_b', 'Week B']].map(([value, label]) => (
                        <button key={value} type="button" onClick={() => setRotationCycle(value)} className={`rounded-lg px-2.5 py-1 text-[10px] font-bold ${rotationCycle === value ? 'bg-purple-700 text-white' : 'bg-white text-purple-800 border border-purple-200'}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-600">Apply start time to all selected days</label>
                    <CustomSelect
                      size="sm"
                      value={combinedStartTime}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        setTimeMode('combined');
                        setDayTimes({});
                        setCombinedStartTime(nextStart);
                        const validEnd = getEndTimeOptions(selectedDays, nextStart).find((option) => !option.disabled);
                        if (!combinedEndTime || parseTimeToHour(combinedEndTime) <= parseTimeToHour(nextStart)) setCombinedEndTime(validEnd?.value || '');
                      }}
                      options={getStartTimeOptions(selectedDays)}
                      placeholder="Select start time"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-600">Apply end time to all selected days</label>
                    <CustomSelect
                      size="sm"
                      value={combinedEndTime}
                      onChange={(e) => {
                        setTimeMode('combined');
                        setDayTimes({});
                        setCombinedEndTime(e.target.value);
                      }}
                      options={getEndTimeOptions(selectedDays, combinedStartTime)}
                      placeholder="Select end time"
                    />
                  </div>
                </div>

                {selectedDays.length > 0 && combinedStartTime && combinedEndTime && timeMode === 'individual' && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-blue-950">Set time for each selected day</p>
                        <p className="text-[10px] text-blue-700">Each selected day may use a different start and end time.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTimeMode('combined');
                          setDayTimes({});
                        }}
                        className="rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[9px] font-black text-blue-800 hover:bg-blue-100"
                      >
                        Use same time for all days
                      </button>
                    </div>
                    <div className="space-y-2">
                      {selectedDays.map((day) => {
                        const startValue = dayTimes[day]?.startTime || combinedStartTime;
                        const endValue = dayTimes[day]?.endTime || combinedEndTime;
                        return (
                          <div key={day} className="grid grid-cols-1 items-end gap-2 rounded-lg border border-blue-100 bg-white p-2 sm:grid-cols-[140px_1fr_1fr]">
                            <div>
                              <p className="text-[9px] font-black uppercase text-gray-500">Day</p>
                              <p className="py-2 text-xs font-black text-gray-900">{SCHEDULE_DAYS[day]}</p>
                            </div>
                            <div>
                              <label className="mb-1 block text-[9px] font-black uppercase text-gray-500">Start</label>
                              <CustomSelect
                                size="sm"
                                value={startValue}
                                onChange={(event) => {
                                  const nextStart = event.target.value;
                                  const endOptions = getEndTimeOptions([day], nextStart);
                                  const nextEnd = parseTimeToHour(endValue) > parseTimeToHour(nextStart) && !endOptions.find((option) => option.value === endValue)?.disabled
                                    ? endValue
                                    : (endOptions.find((option) => !option.disabled)?.value || '');
                                  setTimeMode('individual');
                                  setDayTimes((prev) => ({ ...prev, [day]: { startTime: nextStart, endTime: nextEnd } }));
                                }}
                                options={getStartTimeOptions([day])}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[9px] font-black uppercase text-gray-500">End</label>
                              <CustomSelect
                                size="sm"
                                value={endValue}
                                onChange={(event) => {
                                  setTimeMode('individual');
                                  setDayTimes((prev) => ({ ...prev, [day]: { startTime: startValue, endTime: event.target.value } }));
                                }}
                                options={getEndTimeOptions([day], startValue)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className={additionalTimeSlots.length > 0 ? 'border-t border-gray-200 pt-3' : ''}>
                  <div className={`flex flex-wrap items-center justify-end gap-2 ${additionalTimeSlots.length > 0 ? 'mb-2' : ''}`}>
                    {additionalTimeSlots.length > 0 && <div className="mr-auto">
                      <p className="text-[10px] font-black uppercase tracking-wider text-gray-700">Split hours within a day</p>
                      <p className="text-[10px] text-gray-500">Add separate class periods on the same day, such as 11:00–12:00 and 1:00–3:00.</p>
                    </div>}
                    {timeMode !== 'individual' && selectedDays.length > 0 && combinedStartTime && combinedEndTime && (
                      <button
                        type="button"
                        onClick={() => {
                          setDayTimes(Object.fromEntries(selectedDays.map((day) => [day, {
                            startTime: combinedStartTime,
                            endTime: combinedEndTime,
                          }])));
                          setTimeMode('individual');
                        }}
                        className="flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[10px] font-black text-blue-800 hover:bg-blue-50"
                      >
                        <Plus size={12} /> Different time per day
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const targetDays = selectedDays.length > 0 ? selectedDays : [0];
                        const groupId = Date.now();
                        setAdditionalTimeSlots((prev) => [
                          ...prev,
                          ...targetDays.map((day, dayIndex) => ({
                            id: `extra-${groupId}-${day}-${dayIndex}`,
                            groupId,
                            day,
                            startTime: '',
                            endTime: '',
                          })),
                        ]);
                      }}
                      className="flex items-center gap-1 rounded-lg border border-[#7A0808] bg-white px-2.5 py-1 text-[10px] font-black text-[#7A0808] hover:bg-red-50"
                    >
                      <Plus size={12} /> {additionalTimeSlots.length > 0
                        ? `Add another block for ${selectedDays.length > 1 ? `${selectedDays.length} selected days` : 'selected day'}`
                        : 'Split hours in one day'}
                    </button>
                  </div>

                  {additionalTimeSlots.length > 0 && (
                    <div className="space-y-2">
                      {additionalTimeSlots.map((extra, index) => (
                        <div key={extra.id || index} className="grid grid-cols-1 items-end gap-2 rounded-xl border border-gray-200 bg-white p-2.5 sm:grid-cols-[150px_1fr_1fr_34px]">
                          <div>
                            <label className="mb-1 block text-[9px] font-black uppercase text-gray-500">Day</label>
                            <CustomSelect
                              size="sm"
                              value={String(extra.day)}
                              onChange={(event) => setAdditionalTimeSlots((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, day: Number(event.target.value) } : item))}
                              options={(selectedDays.length > 0 ? selectedDays : [0]).map((dayIndex) => ({ value: String(dayIndex), label: SCHEDULE_DAYS[dayIndex] }))}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[9px] font-black uppercase text-gray-500">Start</label>
                            <CustomSelect
                              size="sm"
                              value={extra.startTime}
                              onChange={(event) => setAdditionalTimeSlots((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: event.target.value, endTime: '' } : item))}
                              options={getAdditionalStartOptions(extra, index)}
                              placeholder="Start time"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[9px] font-black uppercase text-gray-500">End</label>
                            <CustomSelect
                              size="sm"
                              value={extra.endTime}
                              onChange={(event) => setAdditionalTimeSlots((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: event.target.value } : item))}
                              options={getAdditionalEndOptions(extra, index)}
                              placeholder="End time"
                            />
                          </div>
                          <button type="button" onClick={() => setAdditionalTimeSlots((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} title="Remove this time block" className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {overlappingPreferredSlots.length > 0 && (
                <div className="rounded-xl border-2 border-red-500 bg-red-50 p-3 text-xs font-black text-red-900">
                  Two preferred blocks overlap on {overlappingPreferredSlots[0].slot.dayName}. Keep the blocks separate, for example 11:00–12:00 and 1:00–3:00.
                </div>
              )}

              {sectionTimeConflicts.length > 0 && (
                <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-3">
                  <p className="text-xs font-black text-red-950">This preferred time conflicts with {sectionTimeConflicts.length} existing section schedule(s).</p>
                  {sectionTimeConflicts.slice(0, 4).map((conflict, index) => (
                    <p key={`${conflict.id || index}-${index}`} className="mt-1 text-[11px] font-semibold text-red-800">
                      {conflict.affectedSections.join(', ')} · {conflict.courseCode || conflict.title} · {conflict.conflictDayName} {formatScheduleHour(conflict.start)}–{formatScheduleHour(conflict.end)}
                    </p>
                  ))}
                </div>
              )}

              <RoomScheduleViewer
                roomCode=""
                sectionName={selectedSection}
                rotationCycle={allowOjtRotation ? rotationCycle : 'all'}
                scheduleMode={scheduleMode}
                semester={semester}
                deanUid={deanUid}
                currentTimeSlots={selectedDaySlots}
                isEditMode={isEditMode}
                ignoreEntryIds={editingEntryId ? [editingEntryId] : (initial?.id ? [initial.id] : [])}
                initialCourse={selectedCourse?.code || initial?.courseCode || ''}
                onTimeSelect={(clickedDay, startHour, endHour) => {
                  const hasBlockOnDay = selectedDaySlots.some((slot) => slot.day === clickedDay);
                  if (hasBlockOnDay) {
                    setAdditionalTimeSlots((prev) => [...prev, {
                      id: `extra-${Date.now()}`,
                      day: clickedDay,
                      startTime: hourToTimeInput(startHour),
                      endTime: hourToTimeInput(endHour),
                    }]);
                  } else {
                    if (!selectedDays.includes(clickedDay)) setSelectedDays((prev) => [...prev, clickedDay].sort((a, b) => a - b));
                    setTimeMode('combined');
                    setCombinedStartTime(hourToTimeInput(startHour));
                    setCombinedEndTime(hourToTimeInput(endHour));
                  }
                }}
              />
            </div>
          )}

          {/* Step 2: Select Teacher with Compact List & Search (Optional) */}
          {step === 2 && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <User size={20} className="text-[#7A0808]" />
                    <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                      Select Teacher / Instructor
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                      Optional
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Assign a faculty member now or skip to leave as TBA (To Be Assigned).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeacher({ uid: null, name: 'TBA (To Be Assigned)', email: '' });
                      handleNext();
                    }}
                    className="px-3 py-1.5 rounded-xl border border-gray-300 hover:bg-gray-100 text-xs font-bold text-gray-700 transition-colors cursor-pointer"
                  >
                    Skip / Assign Later (TBA) →
                  </button>
                  {selectedCourse && (
                    <span className="text-xs font-bold text-blue-900 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                      {selectedCourse.code}
                    </span>
                  )}
                </div>
              </div>

              {/* Teacher Schedule Conflict Warning Banner */}
              {selectedTeacherConflict.hasConflict && (
                <div className="p-4 bg-red-50/95 border-2 border-red-500 rounded-2xl space-y-2.5 mb-4 shadow-md animate-in fade-in">
                  <div className="flex items-center justify-between gap-2 border-b border-red-200 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-red-600 text-white font-black text-xs flex items-center justify-center shadow-xs flex-shrink-0">
                        ⚠️
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-red-950 uppercase tracking-wide">
                          Teacher Schedule Conflict: {selectedTeacher.name}
                        </h4>
                        <p className="text-[11px] font-semibold text-red-800">
                          {selectedTeacher.name} is already teaching another class during your selected time slot.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTeacher({ uid: null, name: 'TBA (To Be Assigned)', email: '' })}
                      className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-white text-red-800 border border-red-300 hover:bg-red-100 cursor-pointer shadow-2xs"
                    >
                      Set to TBA instead
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {selectedTeacherConflict.conflicts.map((tc, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-white border border-red-200 text-xs flex items-center justify-between gap-2">
                        <div>
                          <span className="font-black text-gray-900">{tc.conflictDayName}: </span>
                          <span className="font-bold text-[#7A0808]">{tc.courseCode}</span>
                          <span className="text-gray-600"> (Sec: {tc.section} in Room {tc.roomCode})</span>
                        </div>
                        <span className="font-black text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 text-[10px]">
                          {formatScheduleHour(tc.start)} – {formatScheduleHour(tc.end)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] font-medium text-red-800">
                    💡 <b>How to resolve:</b> Select a different faculty member below with the <span className="text-emerald-700 font-bold">✓ Available</span> badge, or select <b>"TBA (To Be Assigned)"</b>.
                  </p>
                </div>
              )}

              {/* Currently Assigned Faculty Notice */}
              {selectedTeacher?.name && selectedTeacher.name !== 'TBA (To Be Assigned)' && !selectedTeacherConflict.hasConflict && (
                <div className="p-3 bg-red-50/90 border border-red-200 rounded-xl flex items-center justify-between gap-2 mb-3 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-[#7A0808]" />
                    <p className="text-xs text-red-950 font-bold">
                      Currently Assigned: <span className="font-extrabold underline">{selectedTeacher.name}</span>
                      {selectedTeacher.email ? ` (${selectedTeacher.email})` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[#7A0808] text-white">
                    Assigned to this Course
                  </span>
                </div>
              )}

              {/* Quick Teacher Search Bar */}
              <div className="mb-4 relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search teacher by name or email..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-1 focus:ring-[#7A0808] focus:border-[#7A0808] font-medium"
                />
                {teacherSearch && (
                  <button
                    type="button"
                    onClick={() => setTeacherSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {/* Default TBA Option Card */}
                <button
                  type="button"
                  onClick={() => setSelectedTeacher({ uid: null, name: 'TBA (To Be Assigned)', email: '' })}
                  className={`text-left px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${
                    !selectedTeacher || selectedTeacher?.name === 'TBA (To Be Assigned)'
                      ? 'border-2 border-gray-400 bg-gray-100 shadow-2xs'
                      : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-200 text-gray-700 font-black text-xs flex-shrink-0">
                      ?
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-gray-900 truncate">TBA (To Be Assigned)</p>
                      <p className="text-[10px] text-gray-500 truncate">No faculty member assigned yet</p>
                    </div>
                  </div>
                </button>

                {displayedTeachers.map((teacher) => {
                  const isSelected = Boolean(
                    selectedTeacher &&
                      selectedTeacher.name !== 'TBA (To Be Assigned)' &&
                      (
                        (teacher.uid && selectedTeacher.uid === teacher.uid) ||
                        (teacher.email && selectedTeacher.email && teacher.email.toLowerCase() === selectedTeacher.email.toLowerCase()) ||
                        (teacher.name && selectedTeacher.name && (
                          teacher.name.toLowerCase().trim() === selectedTeacher.name.toLowerCase().trim() ||
                          teacher.name.toLowerCase().includes(selectedTeacher.name.toLowerCase().trim()) ||
                          selectedTeacher.name.toLowerCase().includes(teacher.name.toLowerCase().trim())
                        ))
                      )
                  );
                  const isPreAssigned = selectedCourse?.assignedTeacherUid === teacher.uid;
                  const teacherStatus = getTeacherConflictStatus(teacher);

                  return (
                    <div
                      key={teacher.uid}
                      onClick={() => setSelectedTeacher(teacher)}
                      className={`text-left px-3.5 py-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? teacherStatus.hasConflict
                            ? 'border-2 border-red-500 bg-red-50/90 shadow-md ring-2 ring-red-100'
                            : 'border-2 border-[#7A0808] bg-red-50/90 shadow-md ring-2 ring-red-100'
                          : teacherStatus.hasConflict
                          ? 'border-red-200/80 bg-red-50/40 hover:border-red-400'
                          : 'border-gray-200 hover:border-[#7A0808] hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs flex-shrink-0"
                          style={{ background: teacherStatus.hasConflict ? '#DC2626' : '#7A0808' }}
                        >
                          {teacher.name?.charAt(0)?.toUpperCase() || 'T'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <p className="font-bold text-xs text-gray-900 truncate">{teacher.name}</p>
                            <div className="flex items-center gap-1">
                              {isSelected && (
                                <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded bg-[#7A0808] text-white flex items-center gap-0.5 shadow-2xs">
                                  <Check size={10} /> Selected
                                </span>
                              )}
                              {teacherStatus.hasConflict ? (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white border border-red-700 shadow-2xs">
                                  ⚠️ Has Conflict
                                </span>
                              ) : selectedDaySlots.length > 0 ? (
                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  ✓ Available
                                </span>
                              ) : isPreAssigned ? (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                  Assigned
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-500 truncate">{teacher.email}</p>
                        </div>
                      </div>

                      {/* View Schedule Button */}
                      <div className="flex items-center justify-between gap-1 pt-2 mt-2 border-t border-gray-100/90">
                        <span className="text-[9.5px] text-gray-500 font-medium truncate">
                          {teacherStatus.allTeacherClasses.length} class{teacherStatus.allTeacherClasses.length === 1 ? '' : 'es'} this semester
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewTeacherSchedule({ teacher, entries: teacherStatus.allTeacherClasses });
                          }}
                          className="px-2 py-0.5 text-[9.5px] font-bold rounded-md border border-gray-200 bg-white hover:bg-[#7A0808] text-gray-700 hover:text-white flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                          title={`View ${teacher.name}'s schedule`}
                        >
                          <Calendar size={10} /> View Schedule
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Select Type (Only displayed for combined courses) */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock size={20} className="text-[#7A0808]" />
                <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                  Select Course Type to Schedule
                </h3>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                This course contains both Lecture and Laboratory components. Select which session you are currently plotting.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableTypes.map((type) => {
                  const isLab = type === 'Laboratory';
                  const reqUnits = isLab ? courseUnits.numLab : courseUnits.numLec;
                  const reqHours = isLab ? courseUnits.targetLabHours : courseUnits.targetLecHours;
                  const isSelected = selectedType === type;

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeSelect(type)}
                      className={`p-6 rounded-2xl border-2 transition-all text-left cursor-pointer ${
                        isSelected
                          ? 'border-[#7A0808] bg-red-50/80 shadow-md ring-2 ring-[#7A0808]/20'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-black text-lg text-[#7A0808]">{type}</span>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-700 shadow-2xs">
                          {reqUnits} Unit{reqUnits > 1 ? 's' : ''} • {reqHours} hrs/week
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mb-3">
                        {type === 'Lecture'
                          ? 'Standard lecture room or theoretical session.'
                          : 'Specialized lab or practical hands-on room.'}
                      </p>
                      <div className="text-[11px] font-semibold text-[#7A0808]">
                        Required Weekly Duration: <span className="font-black">{reqHours} Hours / Week</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Select Building & Room with 30/70 Split View & Multi-Day Controls */}
          {step === 4 && (
            <div className="space-y-4">
              {transitionBanner && (
                <div className="p-3.5 bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0">
                      ✓
                    </div>
                    <div>
                      <p className="text-xs font-black text-emerald-950">
                        {transitionBanner.prevType} Schedule Saved for {transitionBanner.courseCode}!
                      </p>
                      <p className="text-[11px] font-medium text-emerald-800">
                        Now select a building and room for the <span className="font-extrabold underline">{transitionBanner.nextType}</span> component. The {transitionBanner.prevType} block you plotted is already saved.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTransitionBanner(null)}
                    className="text-xs font-bold text-emerald-800 hover:text-emerald-950 px-2.5 py-1 rounded-lg bg-emerald-100/80 hover:bg-emerald-200 transition-colors flex-shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {!selectedBuilding ? (
                /* Initial Building Selection (Small Compact Cards + Search + Type Filter Info) */
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2 size={20} className="text-[#7A0808]" />
                        <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                          Select Building
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <p className="text-xs font-semibold text-[#7A0808] bg-red-50/80 px-2.5 py-0.5 rounded-lg border border-red-200/80 inline-block">
                          Showing buildings with {selectedType} rooms
                        </p>
                        {assignedRooms && assignedRooms.length > 0 && (
                          <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 size={12} /> {assignedRooms.length} Registrar-Assigned Rooms
                          </span>
                        )}
                        {managedRoomCount > 0 && (
                          <span className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-extrabold text-blue-800">
                            <DoorOpen size={12} /> {managedRoomCount} Managed by You — Unrestricted Access
                          </span>
                        )}
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#D9A3A3] bg-[#FFF5F5] px-2.5 py-1 text-[10px] font-black text-[#7A0808] transition-colors hover:bg-[#FDE8E8]">
                          <input
                            type="checkbox"
                            checked={showAllAvailableRooms}
                            onChange={(event) => {
                              setShowAllAvailableRooms(event.target.checked);
                              setSelectedBuilding(null);
                              setSelectedRoom(null);
                            }}
                            className="h-3.5 w-3.5 cursor-pointer accent-[#7A0808]"
                          />
                          <span>View other available rooms</span>
                        </label>
                      </div>
                    </div>

                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
                      {displayedBuildings.length} building(s) available
                    </span>
                  </div>

                  {/* Building Search Bar */}
                  {showAllAvailableRooms && (
                    <div className="mb-4 rounded-xl border border-[#D9A3A3] bg-[#FFF5F5] p-3">
                      <label className="block text-[11px] font-black text-[#7A0808]">Reason for requesting a non-assigned room</label>
                      <p className="mb-2 text-[10px] text-[#9B2C2C]">The room manager or Registrar will read this reason before approving the pending schedule.</p>
                      <textarea
                        value={nonBudgetedRoomReason}
                        onChange={(event) => setNonBudgetedRoomReason(event.target.value)}
                        rows={2}
                        placeholder="Explain why the assigned rooms are unsuitable or unavailable..."
                        className="w-full resize-none rounded-lg border border-[#E7BABA] bg-white px-3 py-2 text-xs focus:border-[#7A0808] focus:ring-1 focus:ring-[#7A0808] focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Building Search Bar */}
                  <div className="mb-4 relative">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search building code or name..."
                      value={buildingSearch}
                      onChange={(e) => setBuildingSearch(e.target.value)}
                      className="w-full pl-10 pr-8 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-1 focus:ring-[#7A0808] focus:border-[#7A0808] font-medium"
                    />
                    {buildingSearch && (
                      <button
                        type="button"
                        onClick={() => setBuildingSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {loadingBuildings ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-400">Loading buildings...</p>
                    </div>
                  ) : displayedBuildings.length === 0 ? (
                    <div className="text-center py-8">
                      <Building2 size={44} className="mx-auto mb-3 text-gray-300" />
                      <p className="text-sm font-semibold text-gray-400">
                        {buildingSearch
                          ? `No building matching "${buildingSearch}"`
                          : `No buildings with ${selectedType} rooms found`}
                      </p>
                    </div>
                  ) : (
                    /* Compact Small Cards for Buildings */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {displayedBuildings.map((building) => (
                        <button
                          key={building.id}
                          type="button"
                          onClick={() => {
                            setSelectedBuilding(building);
                            setSelectedRoom(null); // Reset room when building changes
                          }}
                          className="text-left px-3.5 py-3 rounded-xl border border-gray-200 hover:border-[#7A0808] hover:bg-red-50/50 transition-all shadow-2xs group cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-black text-sm text-[#7A0808] truncate group-hover:text-[#600000]">
                              {building.name}
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                              {building.floors} Floors
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-gray-500">
                            Code: <span className="font-bold text-gray-700">{building.code}</span>
                          </p>
                          {(managedRoomCountsByBuilding.get(building.id) || 0) > 0 && (
                            <span className="mt-2 inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-800">
                              <DoorOpen size={11} /> {managedRoomCountsByBuilding.get(building.id)} room(s) managed by you — no approval required
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* 2-Panel 30 / 70 Division View (Building Clicked) */
                <div>
                  {/* Selected Building Breadcrumb / Change Header */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBuilding(null);
                          setSelectedRoom(null);
                        }}
                        className="text-xs font-bold text-[#7A0808] hover:underline flex items-center gap-1 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 cursor-pointer"
                      >
                        <ChevronLeft size={14} /> Change Building
                      </button>
                      <span className="text-gray-400">|</span>
                      <h4 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                        <Building2 size={16} className="text-[#7A0808]" />
                        <span>{selectedBuilding.name} ({selectedBuilding.code})</span>
                      </h4>
                      {(managedRoomCountsByBuilding.get(selectedBuilding.id) || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-800">
                          <DoorOpen size={12} /> Managed by you — unrestricted access, no room approval required
                        </span>
                      )}
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#D9A3A3] bg-[#FFF5F5] px-2.5 py-1 text-[10px] font-black text-[#7A0808] transition-colors hover:bg-[#FDE8E8]">
                        <input
                          type="checkbox"
                          checked={showAllAvailableRooms}
                          onChange={(event) => {
                            setShowAllAvailableRooms(event.target.checked);
                            setSelectedBuilding(null);
                            setSelectedRoom(null);
                          }}
                          className="h-3.5 w-3.5 cursor-pointer accent-[#7A0808]"
                        />
                        <span>View other available rooms</span>
                      </label>
                    </div>

                    {selectedRoom && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 size={14} /> Selected Room: {selectedRoom.roomCode}
                      </span>
                    )}
                  </div>

                  {showAllAvailableRooms && (
                    <div className="mb-4 rounded-xl border border-[#D9A3A3] bg-[#FFF5F5] p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <label htmlFor="selected-room-request-reason" className="block text-[11px] font-black text-[#7A0808]">
                            Reason for requesting a non-assigned room
                          </label>
                          <p className="mb-2 text-[10px] text-[#9B2C2C]">
                            You may enter the reason before or after selecting a room. The room manager or Registrar will review it.
                          </p>
                        </div>
                        {selectedRoom && (
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${selectedRoomIsBudgeted ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-[#FDE8E8] text-[#7A0808] border border-[#D9A3A3]'}`}>
                            {selectedRoomIsBudgeted ? 'No approval required' : 'Approval required'}
                          </span>
                        )}
                      </div>
                      <textarea
                        id="selected-room-request-reason"
                        value={nonBudgetedRoomReason}
                        onChange={(event) => setNonBudgetedRoomReason(event.target.value)}
                        rows={2}
                        placeholder="Explain why the assigned rooms are unsuitable or unavailable..."
                        className="w-full resize-none rounded-lg border border-[#E7BABA] bg-white px-3 py-2 text-xs focus:border-[#7A0808] focus:ring-1 focus:ring-[#7A0808] focus:outline-none"
                      />
                      {selectedRoom && !selectedRoomIsBudgeted && selectedRoomApprover && (
                        <p className="mt-2 rounded-lg border border-[#D9A3A3] bg-white px-3 py-2 text-[11px] font-bold text-[#7A0808]">
                          Approval required from {selectedRoomApprover.name}
                          {selectedRoomApprover.department ? ` - ${selectedRoomApprover.department}` : ''}. This dean can review this room's schedule before deciding.
                        </p>
                      )}
                    </div>
                  )}

                  {/* 30 / 70 Panel Division */}
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* LEFT PANEL (30% Width): Floor & Room List View */}
                    <div className="w-full lg:w-[30%] space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Layers size={14} className="text-[#7A0808]" /> Floors & Rooms ({selectedType})
                        </h4>
                        <span className="text-[10px] text-gray-400 font-semibold">Click room to view grid</span>
                      </div>

                      {availableFloors.length === 0 ? (
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
                          <p className="text-xs text-gray-400">No {selectedType} rooms found in this building</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                          {availableFloors.map((floorData) => {
                            const floorNum = floorData.floorNumber;
                            const isOpen = openFloors[floorNum] !== false; // Open by default

                            const getFloorTitle = () => {
                              const rawLabel = (floorData.label || '').trim();
                              const fNum = Number(floorNum) || 1;
                              if (rawLabel && !rawLabel.toLowerCase().startsWith('floor')) {
                                return rawLabel;
                              }
                              const ordinal = fNum === 1 ? '1st' : fNum === 2 ? '2nd' : fNum === 3 ? '3rd' : `${fNum}th`;
                              return `${ordinal} Floor`;
                            };

                            return (
                              <div
                                key={floorNum}
                                className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleFloor(floorNum)}
                                  className="w-full px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100/80 text-left flex items-center justify-between font-bold text-xs text-gray-800 transition-colors border-b border-gray-100 cursor-pointer"
                                >
                                  <span className="font-bold text-xs text-gray-900">{getFloorTitle()}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 font-bold">
                                      {floorData.rooms.length} room(s)
                                    </span>
                                    {isOpen ? (
                                      <ChevronDown size={15} className="text-[#7A0808] transition-transform" />
                                    ) : (
                                      <ChevronRight size={15} className="text-gray-400 transition-transform" />
                                    )}
                                  </div>
                                </button>

                                {isOpen && (
                                  <div className="p-2.5 grid grid-cols-1 gap-2 bg-white">
                                    {floorData.rooms.length === 0 ? (
                                      <p className="text-[11px] text-gray-400 text-center py-2 font-medium">
                                        No {selectedType} rooms on this floor
                                      </p>
                                    ) : (
                                      floorData.rooms.map((room) => {
                                        const isSelected = selectedRoom?.roomCode === room.roomCode;
                                        const roomStatus = getRoomConflictStatus(room);
                                        const roomCode = String(room.roomCode || room.name || room.id || '').trim().toUpperCase();
                                        const isRegistrarAssigned = assignedRooms.some(
                                          (code) => String(code || '').trim().toUpperCase() === roomCode
                                        );
                                        const managerUid = room.effectiveManagerUid || room.managedBy || floorData.managedBy || '';
                                        const managerName = String(room.effectiveManagerName || room.managedByName || floorData.managedByName || '').trim().toLowerCase();
                                        const isManagedByCurrentDean = (Boolean(deanUid) && String(managerUid) === String(deanUid))
                                          || (Boolean(String(deanName || '').trim()) && managerName === String(deanName || '').trim().toLowerCase());

                                        return (
                                          <div
                                            key={room.roomCode}
                                            role="button"
                                            tabIndex={roomStatus.hasConflict ? -1 : 0}
                                            aria-disabled={roomStatus.hasConflict}
                                            onClick={() => !roomStatus.hasConflict && setSelectedRoom(room)}
                                            onKeyDown={(e) => {
                                              if (!roomStatus.hasConflict && (e.key === 'Enter' || e.key === ' ')) {
                                                e.preventDefault();
                                                setSelectedRoom(room);
                                              }
                                            }}
                                            title={roomStatus.hasConflict ? 'Unavailable: this room already has a schedule during the preferred time.' : 'Available during the preferred time'}
                                            className={`text-left p-2.5 rounded-lg border-2 transition-all flex items-center justify-between ${
                                              isSelected
                                                ? 'border-[#7A0808] bg-red-50 shadow-2xs'
                                                : roomStatus.hasConflict
                                                ? 'border-red-200 bg-red-50/70 opacity-60 cursor-not-allowed'
                                                : 'border-gray-100 hover:border-[#7A0808] hover:bg-gray-50'
                                            }`}
                                          >
                                            <div>
                                              <p className="font-black text-xs text-[#7A0808]">
                                                {room.roomCode}
                                              </p>
                                              <p className="text-[10px] text-gray-500">{room.type || room.roomType || 'Classroom'}</p>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              {isRegistrarAssigned && (
                                                <span className="rounded bg-[#FFF0F0] px-2 py-0.5 text-[9px] font-black text-[#7A0808] border border-[#D9A3A3]">
                                                  Assigned
                                                </span>
                                              )}
                                              {isManagedByCurrentDean && (
                                                <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-800">
                                                  Managed by you — unrestricted
                                                </span>
                                              )}
                                              <span className={`text-[9px] font-black px-2 py-0.5 rounded ${roomStatus.hasConflict ? 'bg-red-600 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                                                {roomStatus.hasConflict ? 'Conflict' : 'Available'}
                                              </span>
                                              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                                                Cap: {room.capacity}
                                              </span>
                                              <button
                                                type="button"
                                                title="View Room Details"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setViewDetailsRoom({
                                                    ...room,
                                                    buildingName: selectedBuilding?.name || selectedBuilding?.code || 'Building',
                                                    floorName: floorData.name,
                                                  });
                                                }}
                                                className="p-1 rounded-md text-gray-400 hover:text-[#7A0808] hover:bg-red-100/60 transition-colors cursor-pointer"
                                              >
                                                <Eye size={13} />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* RIGHT PANEL (70% Width): Multi-Day Controls & Interactive Room Grid */}
                    <div className="w-full lg:w-[70%] border-l border-gray-200 pl-0 lg:pl-6 flex flex-col space-y-3">
                      {selectedRoom ? (
                        <>
                          {/* Top Bar: Course Target Hours & Multi-Day Controls */}
                          <div className="hidden">
                            {/* Course Target Info */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200/60 pb-2.5">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-xs text-[#7A0808]">
                                  {selectedCourse?.code} • {selectedType}
                                </span>
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-white border border-red-200 text-[#7A0808] shadow-2xs">
                                  Required: {targetHours} hrs/week
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-gray-700">Plotted Total:</span>
                                <span
                                  className={`text-xs font-black px-2.5 py-0.5 rounded-md shadow-2xs ${
                                    totalPlottedHours === targetHours
                                      ? 'bg-emerald-600 text-white'
                                      : totalPlottedHours > 0
                                      ? 'bg-red-600 text-white'
                                      : 'bg-[#7A0808] text-white'
                                  }`}
                                >
                                  {totalPlottedHours} hrs
                                </span>
                              </div>
                            </div>

                            {/* Multi-Day Checkboxes & Quick Presets */}
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                <label className="text-[10px] font-black text-gray-700 uppercase tracking-wider flex items-center gap-1">
                                  <Calendar size={13} className="text-[#7A0808]" /> Select Schedule Day(s):
                                </label>

                                {/* Quick Pair Presets */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] text-gray-400 font-bold mr-1">Presets:</span>
                                  {DAY_PAIR_PRESETS.map((preset) => (
                                    <button
                                      key={preset.label}
                                      type="button"
                                      onClick={() => setSelectedDays(preset.days)}
                                      className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-white hover:bg-red-50 text-gray-700 hover:text-[#7A0808] border border-gray-200 hover:border-red-300 transition-all cursor-pointer"
                                    >
                                      {preset.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Day Selection Pills with Checkbox */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
                                {SCHEDULE_DAYS.map((dayName, idx) => {
                                  const isChecked = selectedDays.includes(idx);
                                  return (
                                    <button
                                      key={dayName}
                                      type="button"
                                      onClick={() => {
                                        if (isChecked) {
                                          if (selectedDays.length > 1) {
                                            setSelectedDays(selectedDays.filter((d) => d !== idx));
                                          }
                                        } else {
                                          setSelectedDays([...selectedDays, idx].sort((a, b) => a - b));
                                        }
                                      }}
                                      className={`px-2 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                                        isChecked
                                          ? 'bg-[#7A0808] text-white border-[#7A0808] shadow-xs'
                                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                                      }`}
                                    >
                                      <span
                                        className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] font-black ${
                                          isChecked ? 'bg-white text-[#7A0808]' : 'border border-gray-300'
                                        }`}
                                      >
                                        {isChecked ? '✓' : ''}
                                      </span>
                                      <span className="truncate">{dayName.slice(0, 3)}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* OJT Rotation Cycle & Partner Section Pairing Controls */}
                            {allowOjtRotation && (
                            <div className="p-3 bg-white border border-red-200/80 rounded-2xl space-y-2.5 shadow-2xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <RefreshCw size={13} className="text-[#7A0808]" />
                                  <span className="text-[10px] font-black text-gray-800 uppercase tracking-wider">
                                    OJT Rotational Modality (Week A / Week B)
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-[10px] font-bold">
                                  <button
                                    type="button"
                                    onClick={() => setRotationCycle('all')}
                                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                      rotationCycle === 'all'
                                        ? 'bg-white text-gray-900 shadow-2xs border border-gray-200'
                                        : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                  >
                                    All Weeks (Regular)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRotationCycle('week_a')}
                                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                      rotationCycle === 'week_a'
                                        ? 'bg-blue-600 text-white shadow-2xs'
                                        : 'text-blue-700 hover:bg-blue-50'
                                    }`}
                                  >
                                    🔵 Week A (Odd)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRotationCycle('week_b')}
                                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                      rotationCycle === 'week_b'
                                        ? 'bg-purple-600 text-white shadow-2xs'
                                        : 'text-purple-700 hover:bg-purple-50'
                                    }`}
                                  >
                                    🟣 Week B (Even)
                                  </button>
                                </div>
                              </div>

                              {rotationCycle !== 'all' && (
                                <div className="p-2.5 bg-gradient-to-r from-blue-50/70 to-purple-50/70 border border-blue-200 rounded-xl space-y-2 text-xs">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <span className="text-[11px] font-bold text-gray-800">
                                      Partner Section for {rotationCycle === 'week_a' ? 'Week B (Reciprocal)' : 'Week A (Reciprocal)'}:
                                    </span>
                                    <div className="w-full sm:w-52">
                                      <CustomSelect
                                        size="sm"
                                        value={partnerSection || ''}
                                        onChange={(e) => setPartnerSection(e.target.value)}
                                        options={[
                                          { value: '', label: 'None (Solo Rotation)' },
                                          ...deanSections
                                            .filter((s) => s.name !== selectedSection)
                                            .map((s) => ({
                                              value: s.name,
                                              label: `${s.name} (${s.studentCount || 40} stds)`,
                                            })),
                                        ]}
                                        placeholder="Select partner section..."
                                      />
                                    </div>
                                  </div>

                                  {partnerSection && (
                                    <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-blue-200/60 select-none">
                                      <input
                                        type="checkbox"
                                        checked={autoMirrorPartner}
                                        onChange={(e) => setAutoMirrorPartner(e.target.checked)}
                                        className="w-3.5 h-3.5 text-[#7A0808] rounded border-gray-300 focus:ring-[#7A0808] cursor-pointer"
                                      />
                                      <span className="text-[11px] font-medium text-gray-700">
                                        <strong className="text-[#7A0808]">1-Click Auto-Mirror:</strong> Automatically schedule reciprocal {rotationCycle === 'week_a' ? 'Week B' : 'Week A'} slot for <strong className="text-gray-900">{partnerSection}</strong> in this room.
                                      </span>
                                    </label>
                                  )}
                                </div>
                              )}
                            </div>
                            )}

                            {/* Time Controls: Combined vs Individual */}
                            <div className="pt-2 border-t border-red-200/60">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-1.5">
                                  <Clock size={13} className="text-[#7A0808]" />
                                  <span className="text-[10px] font-black text-gray-700 uppercase tracking-wider">
                                    Time Configuration
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-gray-200 text-[10px] font-bold">
                                  <button
                                    type="button"
                                    onClick={() => setTimeMode('combined')}
                                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                      timeMode === 'combined'
                                        ? 'bg-[#7A0808] text-white'
                                        : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                  >
                                    Combined Time
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTimeMode('individual')}
                                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                      timeMode === 'individual'
                                        ? 'bg-[#7A0808] text-white'
                                        : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                  >
                                    Individual Times
                                  </button>
                                </div>
                              </div>

                              {timeMode === 'combined' ? (
                                /* Combined Mode: Single Start & End Time */
                                <div className="relative z-[9999] grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-gray-200">
                                  <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                      Start Time (All Selected Days)
                                    </label>
                                    <CustomSelect
                                      size="sm"
                                      value={combinedStartTime || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setCombinedStartTime(val);
                                        const sHour = parseTimeToHour(val);
                                        const endOpts = getEndTimeOptions(selectedDays, val);
                                        const firstValidEnd = endOpts.find((opt) => !opt.disabled && parseTimeToHour(opt.value) > sHour);
                                        if (!combinedEndTime || parseTimeToHour(combinedEndTime) <= sHour || endOpts.find(o => o.value === combinedEndTime)?.disabled) {
                                          setCombinedEndTime(firstValidEnd ? firstValidEnd.value : hourToTimeInput(sHour + 1.5));
                                        }
                                      }}
                                      options={getStartTimeOptions(selectedDays)}
                                      placeholder="Select start time..."
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                      End Time (All Selected Days)
                                    </label>
                                    <CustomSelect
                                      size="sm"
                                      value={combinedEndTime || ''}
                                      onChange={(e) => setCombinedEndTime(e.target.value)}
                                      options={getEndTimeOptions(selectedDays, combinedStartTime)}
                                      placeholder="Select end time..."
                                    />
                                  </div>
                                </div>
                              ) : (
                                /* Individual Mode: Start & End Time per Checked Day */
                                <div className="space-y-1.5 overflow-visible">
                                  {selectedDays.map((d, dIdx) => {
                                    const dStart = dayTimes[d]?.startTime || combinedStartTime || '';
                                    const dEnd = dayTimes[d]?.endTime || combinedEndTime || '';
                                    const dDuration = dStart && dEnd ? Math.max(0, parseTimeToHour(dEnd) - parseTimeToHour(dStart)) : 0;

                                    return (
                                      <div
                                        key={d}
                                        style={{ zIndex: 9999 - dIdx }}
                                        className="relative flex items-center gap-2 bg-white p-2 rounded-xl border border-gray-200 text-xs"
                                      >
                                        <span className="font-bold text-gray-900 w-24 truncate">
                                          {SCHEDULE_DAYS[d]}:
                                        </span>

                                        <div className="flex-1 relative">
                                          <CustomSelect
                                            size="sm"
                                            value={dStart}
                                            onChange={(e) => {
                                              const newStart = e.target.value;
                                              const sH = parseTimeToHour(newStart);
                                              const endOpts = getEndTimeOptions([d], newStart);
                                              const firstValidEnd = endOpts.find((opt) => !opt.disabled && parseTimeToHour(opt.value) > sH);
                                              const newEnd = !dEnd || parseTimeToHour(dEnd) <= sH || endOpts.find(o => o.value === dEnd)?.disabled
                                                ? (firstValidEnd ? firstValidEnd.value : hourToTimeInput(sH + 1.5))
                                                : dEnd;
                                              setDayTimes((prev) => ({
                                                ...prev,
                                                [d]: { startTime: newStart, endTime: newEnd },
                                              }));
                                            }}
                                            options={getStartTimeOptions([d])}
                                            placeholder="Start time..."
                                          />
                                        </div>

                                        <span className="text-gray-400 text-xs">–</span>

                                        <div className="flex-1 relative">
                                          <CustomSelect
                                            size="sm"
                                            value={dEnd}
                                            onChange={(e) => {
                                              const newEnd = e.target.value;
                                              setDayTimes((prev) => ({
                                                ...prev,
                                                [d]: { startTime: dStart, endTime: newEnd },
                                              }));
                                            }}
                                            options={getEndTimeOptions([d], dStart)}
                                            placeholder="End time..."
                                          />
                                        </div>

                                        <span className="text-[10px] font-bold text-gray-500 w-14 text-right">
                                          ({Math.round(dDuration * 10) / 10}h)
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Required Unit Hours Notification Banner */}
                            <div
                              className={`p-2.5 rounded-xl border-2 flex items-start justify-between gap-2 transition-all shadow-xs ${
                                hoursStatus.type === 'match'
                                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-900'
                                  : hoursStatus.type === 'empty'
                                  ? 'bg-gray-50 border-gray-300 text-gray-700'
                                  : 'bg-red-50/95 border-red-500 text-red-950 font-medium'
                              }`}
                            >
                              <p className="text-xs font-bold leading-relaxed">
                                {hoursStatus.message}
                              </p>
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-md flex-shrink-0 ${
                                  hoursStatus.type === 'match'
                                    ? 'bg-emerald-600 text-white'
                                    : hoursStatus.type === 'empty'
                                    ? 'bg-gray-500 text-white'
                                    : 'bg-red-600 text-white'
                                }`}
                              >
                                {hoursStatus.badge}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                            <p className="text-[11px] font-bold text-blue-950">
                              Preferred time locked from Step 2 · {selectedDaySlots.length} block{selectedDaySlots.length === 1 ? '' : 's'} · {totalPlottedHours} hrs
                            </p>
                            <button type="button" onClick={() => setStep(6)} className="text-[10px] font-black text-blue-800 underline hover:text-blue-950">
                              Change preferred time
                            </button>
                          </div>

                          {/* Read-only room availability grid; preferred time is edited in Step 2. */}
                          <div className="flex-1 bg-white rounded-xl">
                            <RoomScheduleViewer
                              roomCode={selectedRoom.roomCode || selectedRoom.name || selectedRoom.id}
                              sectionName={selectedSection}
                              teacher={selectedTeacher}
                              roomType={selectedRoom.type || selectedRoom.roomType}
                              rotationCycle={allowOjtRotation ? rotationCycle : 'all'}
                              scheduleMode={scheduleMode}
                              semester={semester}
                              deanUid={deanUid}
                              currentTimeSlots={selectedDaySlots}
                              isEditMode={isEditMode}
                              ignoreEntryIds={editingEntryId ? [editingEntryId] : (initial?.id ? [initial.id] : [])}
                              initialCourse={selectedCourse?.code || initial?.courseCode || initial?.title || ''}
                              onConflictsChange={setRoomConflicts}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-[380px] bg-gray-50/80 rounded-2xl border border-gray-200">
                          <div className="text-center p-6">
                            <DoorOpen size={48} className="mx-auto mb-3 text-gray-300" />
                            <p className="text-sm font-semibold text-gray-500">No Room Selected</p>
                            <p className="text-xs text-gray-400 mt-1">
                              Click any {selectedType} room on the left floor panel to view its weekly schedule grid
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Schedule Plot Summary */}
          {step === 5 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-[#7A0808]" />
                  <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                    Schedule Plot Summary
                  </h3>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                  Ready to Save
                </span>
              </div>

              {/* Combined Course Part 1 Notice */}
              {isOtherTypePending && (
                <div className="p-3.5 bg-indigo-50 border-2 border-indigo-200 rounded-2xl flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0">
                      Part 1
                    </div>
                    <div>
                      <p className="text-xs font-black text-indigo-950">
                        Part 1 of 2: {selectedType} Schedule Ready
                      </p>
                      <p className="text-[11px] font-medium text-indigo-800">
                        {selectedCourse?.code} has both Lecture ({courseUnits?.targetLecHours} hrs) and Laboratory ({courseUnits?.targetLabHours} hrs). You can save and proceed directly to schedule the <span className="font-extrabold underline">{otherType}</span> component, or save now and plot {otherType} later.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-200 uppercase flex-shrink-0">
                    {otherType} Pending
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Course Details Card */}
                <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      COURSE DETAILS
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-50 text-[#7A0808]">
                      {selectedCourse?.code}
                    </span>
                  </div>
                  <p className="font-bold text-sm text-gray-900">{selectedCourse?.title}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="font-semibold text-[#7A0808]">Type: {selectedType}</span>
                    <span>•</span>
                    <span>{semesterDisplay}</span>
                    <span>•</span>
                    <span>{sectionYearLevel || '1st Year'}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-gray-500">Required Hours:</span>
                    <span className="font-bold text-gray-900">{targetHours} hrs/week</span>
                  </div>
                </div>

                {/* Instructor Card */}
                <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      INSTRUCTOR / TEACHER
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        selectedTeacher?.name && selectedTeacher.name !== 'TBA (To Be Assigned)'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {selectedTeacher?.name && selectedTeacher.name !== 'TBA (To Be Assigned)'
                        ? 'Assigned'
                        : 'TBA'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-xs"
                      style={{ background: '#7A0808' }}
                    >
                      {selectedTeacher?.name?.charAt(0)?.toUpperCase() || 'T'}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900">
                        {selectedTeacher?.name || 'TBA (To Be Assigned)'}
                      </p>
                      <p className="text-xs text-gray-500">{selectedTeacher?.email || 'Faculty will be assigned later'}</p>
                    </div>
                  </div>
                </div>

                {/* Building & Room Location Card */}
                <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      LOCATION & ROOM
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700">
                      Room {selectedRoom?.roomCode}
                    </span>
                  </div>
                  <p className="font-bold text-sm text-gray-900">
                    {selectedBuilding?.name} ({selectedBuilding?.code})
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>Room Type: {selectedRoom?.type || selectedRoom?.roomType || 'Classroom'}</span>
                    <span>•</span>
                    <span>Capacity: {selectedRoom?.capacity} students</span>
                  </div>
                </div>

                {/* Schedule Day & Time Card with Multi-Day List */}
                <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      SCHEDULED DAYS & TIMES
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800">
                      {selectedDaySlots.length} Block(s) • Total {totalPlottedHours} hrs
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {selectedDaySlots.map((slot) => (
                      <div
                        key={slot.day}
                        className="flex items-center justify-between text-xs bg-gray-50 px-2.5 py-1 rounded-lg"
                      >
                        <span className="font-bold text-gray-900">{slot.dayName}</span>
                        <span className="font-black text-[#7A0808]">
                          {formatScheduleHour(slot.startHour)} – {formatScheduleHour(slot.endHour)} ({slot.duration} hrs)
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Hours status pill */}
                  <div className="pt-1">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-block ${
                        hoursStatus.type === 'match'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : hoursStatus.type === 'exceed'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {hoursStatus.message}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="btn-outline flex items-center gap-2 text-xs cursor-pointer"
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline text-xs cursor-pointer"
              disabled={saving}
            >
              Cancel
            </button>

            {currentStepIndex < totalSteps - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={
                  saving ||
                  (step === 6 && (selectedDaySlots.length === 0 || sectionTimeConflicts.length > 0 || overlappingPreferredSlots.length > 0 || componentHoursProgress.resulting > componentHoursProgress.required)) ||
                  (step === 4 && (!selectedRoom || selectedDaySlots.length === 0 || roomConflicts.filter((c) => c.conflictType !== 'teacher').length > 0)) ||
                  (step === 2 && selectedTeacherConflict.hasConflict)
                }
                className={`btn-maroon flex items-center gap-2 text-xs transition-all cursor-pointer ${
                  (step === 6 && (selectedDaySlots.length === 0 || sectionTimeConflicts.length > 0 || overlappingPreferredSlots.length > 0 || componentHoursProgress.resulting > componentHoursProgress.required)) ||
                  (step === 4 && (!selectedRoom || roomConflicts.filter((c) => c.conflictType !== 'teacher').length > 0 || selectedDaySlots.length === 0)) ||
                  (step === 2 && selectedTeacherConflict.hasConflict)
                    ? 'opacity-50 cursor-not-allowed bg-red-950/70 border border-red-800'
                    : ''
                }`}
                title={
                  step === 6 && overlappingPreferredSlots.length > 0
                    ? 'Cannot proceed: preferred time blocks overlap on the same day'
                    : step === 6 && componentHoursProgress.resulting > componentHoursProgress.required
                    ? `Cannot proceed: selected time exceeds the required ${componentHoursProgress.required} hours`
                    : step === 6 && sectionTimeConflicts.length > 0
                    ? 'Cannot proceed: one or more selected/merged sections are already busy at this time'
                    : step === 6 && selectedDaySlots.length === 0
                    ? 'Select a preferred day and time to proceed'
                    : step === 4 && !selectedRoom
                    ? 'Select a room before continuing'
                    : step === 4 && roomConflicts.filter((c) => c.conflictType !== 'teacher').length > 0
                    ? 'Cannot proceed: Room or section schedule conflict detected'
                    : step === 2 && selectedTeacherConflict.hasConflict
                    ? `Cannot proceed: ${selectedTeacher?.name || 'Selected teacher'} has a schedule conflict`
                    : step === 4 && selectedDaySlots.length === 0
                    ? 'Please select schedule day(s) and time to proceed'
                    : undefined
                }
              >
                Next <ChevronRight size={16} />
              </button>
            ) : isEditMode ? (
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={saving || !selectedRoom || selectedDaySlots.length === 0}
                className="btn-maroon flex items-center gap-2 text-xs cursor-pointer shadow-md font-bold"
              >
                {saving ? 'Saving Changes...' : 'Save Changes'}
              </button>
            ) : isOtherTypePending ? (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={saving || !selectedRoom || selectedDaySlots.length === 0}
                  className="btn-outline flex items-center gap-1.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer"
                  title={`Save ${selectedType} schedule only and exit`}
                >
                  {saving ? 'Saving...' : `Save ${selectedType} Only`}
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  disabled={saving || !selectedRoom || selectedDaySlots.length === 0}
                  className="btn-maroon flex items-center gap-2 text-xs cursor-pointer shadow-md font-bold"
                  title={`Save ${selectedType} and continue to configure ${otherType}`}
                >
                  {saving ? 'Saving...' : `Save & Schedule ${otherType}`} <ArrowRight size={15} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={saving || !selectedRoom || selectedDaySlots.length === 0}
                className="btn-maroon flex items-center gap-2 text-xs cursor-pointer font-bold"
              >
                {saving
                  ? 'Saving...'
                  : completedTypes.length > 0
                  ? `Save & Complete ${selectedCourse?.code || 'Course'} Schedule`
                  : `Add Schedule Block${selectedDaySlots.length > 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Room Details Preview Modal */}
      {viewDetailsRoom && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-[#7A0808] flex items-center justify-center flex-shrink-0 border border-red-100">
                  <DoorOpen size={20} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-gray-900 leading-tight">
                    {viewDetailsRoom.roomCode || viewDetailsRoom.name}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    {viewDetailsRoom.buildingName || 'Building'} • {viewDetailsRoom.floorName || 'Floor'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewDetailsRoom(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-gray-200/80 bg-gray-50/50 space-y-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    ROOM TYPE
                  </span>
                  <p className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5">
                    <Layers size={14} className="text-[#7A0808]" />
                    {viewDetailsRoom.type || viewDetailsRoom.roomType || 'Classroom'}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-gray-200/80 bg-gray-50/50 space-y-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    SEATING CAPACITY
                  </span>
                  <p className="font-extrabold text-sm text-blue-700 flex items-center gap-1.5">
                    <User size={14} className="text-blue-600" />
                    {viewDetailsRoom.capacity || 40} Students
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-gray-200/80 bg-gray-50/50 space-y-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    AVAILABILITY STATUS
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    {viewDetailsRoom.status || 'Available'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-gray-200/80 bg-gray-50/50 space-y-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    MANAGED BY
                  </span>
                  <p className="font-bold text-xs text-gray-800 truncate">
                    {viewDetailsRoom.managedBy || 'College Dean / Registrar'}
                  </p>
                </div>
              </div>

              {/* Equipment & Facilities */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Equipment & Facilities
                </h4>
                {Array.isArray(viewDetailsRoom.equipment) && viewDetailsRoom.equipment.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {viewDetailsRoom.equipment.map((item, idx) => (
                      <span
                        key={idx}
                        className="text-xs font-semibold px-3 py-1 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1.5"
                      >
                        <Check size={13} className="text-emerald-600" />
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1.5">
                      <Check size={13} className="text-emerald-600" /> Standard Whiteboard & Markers
                    </span>
                    <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1.5">
                      <Check size={13} className="text-emerald-600" /> Air Conditioning Unit
                    </span>
                    <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1.5">
                      <Check size={13} className="text-emerald-600" /> Overhead Digital Projector / Screen
                    </span>
                  </div>
                )}
              </div>

              {/* Additional Room Info */}
              {viewDetailsRoom.description && (
                <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-1">
                  <p className="text-[11px] font-bold text-amber-900 uppercase">Room Notes / Description</p>
                  <p className="text-xs text-amber-800">{viewDetailsRoom.description}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setViewDetailsRoom(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Details Preview Modal (Eye button on course card) */}
      {viewScheduleCourse && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-red-50/50">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl text-white flex items-center justify-center flex-shrink-0 shadow-xs font-black"
                  style={{ background: '#7A0808' }}
                >
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-lg text-gray-900 leading-tight">
                      {viewScheduleCourse.course.code}
                    </h3>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-50 text-[#7A0808] border border-red-200/80">
                      Fully Scheduled
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-medium truncate max-w-[300px]">
                    {viewScheduleCourse.course.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewScheduleCourse(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between text-xs font-bold text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-200">
                <span>Section: <span className="font-black text-gray-900">{selectedSection}</span></span>
                <span>Total Plotted: <span className="font-black text-[#7A0808]">{viewScheduleCourse.status.totalPlottedHours} hrs</span></span>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider">
                  Plotted Schedule Blocks ({viewScheduleCourse.entries.length})
                </h4>
                {viewScheduleCourse.entries.map((entry, idx) => (
                  <div
                    key={entry.id || idx}
                    className="p-3.5 rounded-xl border border-gray-200 bg-white space-y-2 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                          String(entry.type || '').toLowerCase().includes('lab')
                            ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                            : 'bg-blue-50 text-blue-900 border border-blue-200'
                        }`}>
                          {entry.type || 'Lecture'}
                        </span>
                        <span className="text-xs font-black text-[#7A0808]">
                          {formatScheduleHour(entry.startHour)} – {formatScheduleHour(entry.endHour)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => startEditingCourse(viewScheduleCourse.course, entry)}
                        className="px-2 py-1 text-[10px] font-bold rounded-lg bg-gray-100 hover:bg-[#7A0808] text-gray-700 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                        title="Edit this schedule block"
                      >
                        <Pencil size={11} /> Edit Block
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-gray-100">
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <Calendar size={13} className="text-gray-400" />
                        <span className="font-bold">{SCHEDULE_DAYS[entry.day] || entry.dayLabel || 'Day'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <DoorOpen size={13} className="text-gray-400" />
                        <span className="font-bold">Room: {entry.roomCode || entry.room}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-700 col-span-2">
                        <User size={13} className="text-gray-400" />
                        <span className="font-medium truncate">Instructor: <span className="font-bold">{entry.instructor || 'TBA'}</span></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewScheduleCourse(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => startEditingCourse(viewScheduleCourse.course)}
                className="btn-maroon px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Pencil size={13} /> Edit This Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teacher Schedule Grid Modal (View Schedule button on faculty card) */}
      {viewTeacherSchedule && (
        <TeacherScheduleModal
          teacher={viewTeacherSchedule.teacher || viewTeacherSchedule}
          initialSemester={String(semester || '1')}
          collegeCode={
            deanCollege ||
            (viewTeacherSchedule.teacher?.department ||
              viewTeacherSchedule.department ||
              viewTeacherSchedule.teacher?.college ||
              viewTeacherSchedule.college ||
              '')
          }
          onClose={() => setViewTeacherSchedule(null)}
        />
      )}
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
    </div>
  );
}
