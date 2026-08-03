import React, { useMemo, useState, useEffect } from 'react';
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
} from 'lucide-react';
import { parseTimeToHour, validateScheduleHours, hourToTimeInput } from '../../services/plotScheduleService';
import { formatScheduleHour, SCHEDULE_DAYS, SCHEDULE_START_HOUR, SCHEDULE_END_HOUR } from '../../constants/scheduleGrid';
import { formatDisplayDate } from '../../utils/academicCalendarUtils';
import { subscribeCollegeCourses } from '../../services/courseService';
import { subscribeToBuildings } from '../../services/buildingService';
import { subscribeStaffUsers } from '../../services/systemUserService';
import RoomScheduleViewer from '../scheduling/RoomScheduleViewer';

const COURSE_TYPES = ['Lecture', 'Laboratory']; // Only Lecture and Laboratory

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
  semester = '1', // Current semester
  sectionYearLevel = '1st Year', // Selected section's year level
  dayIndex, // 0-6 for Mon-Sun
  fromDrag = false,
}) {
  // Multi-step form state
  const [step, setStep] = useState(1); // 1: Course, 2: Teacher, 3: Type, 4: Building & Room, 5: Summary
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Data loading states
  const [courses, setCourses] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [teachersList, setTeachersList] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingBuildings, setLoadingBuildings] = useState(true);

  // Search Filters
  const [courseSearch, setCourseSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [buildingSearch, setBuildingSearch] = useState('');

  // Form data
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedType, setSelectedType] = useState('Lecture');
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [viewDetailsRoom, setViewDetailsRoom] = useState(null); // Track room for detailed preview modal
  // Only pre-populate time if user dragged on grid or editing existing schedule
  const [startTime, setStartTime] = useState(fromDrag || initial?.title ? initial?.startTime : null);
  const [endTime, setEndTime] = useState(fromDrag || initial?.title ? initial?.endTime : null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(dayIndex !== undefined ? dayIndex : 0); // Track which day user selected

  // Open floor accordion state
  const [openFloors, setOpenFloors] = useState({});

  // Subscribe to staff teachers for fallback if course isn't pre-assigned
  useEffect(() => {
    return subscribeStaffUsers(
      (users) => {
        const teachersOnly = users.filter((u) => u.roleValue === 'teacher');
        setTeachersList(teachersOnly);
      },
      (err) => console.error('Error loading teachers in modal:', err)
    );
  }, []);

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
        // Filter courses dynamically by Semester and Section Year Level
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
          if (sectionYearLevel) {
            const activeYear = String(sectionYearLevel).toLowerCase().trim();
            const courseYear = String(c.yearLevel || '1st Year').toLowerCase().trim();

            const activeDigit = activeYear.match(/\d/)?.[0];
            const courseDigit = courseYear.match(/\d/)?.[0];

            if (activeDigit && courseDigit && activeDigit !== courseDigit) {
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
  }, [deanCollege, semester, sectionYearLevel]);

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

  // Filtered courses by search query
  const displayedCourses = useMemo(() => {
    if (!courseSearch.trim()) return courses;
    const q = courseSearch.toLowerCase().trim();
    return courses.filter(
      (c) =>
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.title && c.title.toLowerCase().includes(q))
    );
  }, [courses, courseSearch]);

  // Get teachers for selected course
  const availableTeachers = useMemo(() => {
    if (!selectedCourse) return [];
    if (selectedCourse.assignedTeacherUid) {
      return [
        {
          uid: selectedCourse.assignedTeacherUid,
          name: selectedCourse.assignedTeacherName,
          email: selectedCourse.assignedTeacherEmail,
        },
      ];
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

  // Filtered buildings by search query AND selected class type
  const displayedBuildings = useMemo(() => {
    let filtered = buildings;

    // Filter buildings to only those containing at least 1 room matching selectedType
    if (selectedType) {
      filtered = filtered.filter((b) => {
        const floors = Array.isArray(b.floorData) ? b.floorData : [];
        const roomsDirect = Array.isArray(b.rooms) ? b.rooms : [];

        const hasMatchingRoomInFloors = floors.some((f) =>
          (f.rooms || []).some((r) => matchesRoomType(r.type || r.roomType, selectedType))
        );
        if (hasMatchingRoomInFloors) return true;

        const hasMatchingDirectRoom = roomsDirect.some((r) =>
          matchesRoomType(r.type || r.roomType, selectedType)
        );
        if (hasMatchingDirectRoom) return true;

        // Fallback for buildings with no rooms array populated yet
        const totalRooms = b.totalRooms || 0;
        return totalRooms === 0 || floors.length === 0;
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
  }, [buildings, selectedType, buildingSearch]);

  // Get all floors & rooms for selected building, strictly filtered by selected class type
  const availableFloors = useMemo(() => {
    if (!selectedBuilding) return [];

    let rawFloors = [];

    // 1. If floorData array exists on building object
    if (Array.isArray(selectedBuilding.floorData) && selectedBuilding.floorData.length > 0) {
      rawFloors = selectedBuilding.floorData.map((floor, idx) => ({
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

    // Filter rooms by selected class type (Lecture vs Laboratory)
    return rawFloors
      .map((f) => {
        const matchingRooms = f.rooms.filter((r) =>
          matchesRoomType(r.type || r.roomType, selectedType)
        );
        return {
          ...f,
          rooms: matchingRooms,
        };
      })
      .filter((f) => f.rooms.length > 0 || rawFloors.length === 1);
  }, [selectedBuilding, selectedType]);

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

  const handleNext = () => {
    setError('');

    if (step === 1 && !selectedCourse) {
      setError('Please select a course');
      return;
    }
    if (step === 2 && !selectedTeacher) {
      setError('Please select a teacher');
      return;
    }
    if (step === 3 && !selectedType) {
      setError('Please select a type');
      return;
    }
    if (step === 4 && !selectedBuilding) {
      setError('Please select a building');
      return;
    }
    if (step === 4 && !selectedRoom) {
      setError('Please select a room from the left floor panel');
      return;
    }
    if (step === 4 && (!startTime || !endTime)) {
      setError('Please click or drag on the room schedule grid to set your schedule time & day.');
      return;
    }

    setStep(step + 1);
  };

  const handleBack = () => {
    setError('');
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    setError('');

    if (dayBlockReason) {
      setError(dayBlockReason);
      return;
    }

    if (!selectedCourse || !selectedTeacher || !selectedType || !selectedBuilding || !selectedRoom) {
      setError('Please complete all steps');
      return;
    }

    const startHour = parseTimeToHour(startTime);
    const endHour = parseTimeToHour(endTime);
    const timeCheck = validateScheduleHours(startHour, endHour);
    if (!timeCheck.valid) {
      setError(timeCheck.message);
      return;
    }

    // Convert selectedDayIndex to day name (scheduleMode = 'regular')
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayLabels = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const finalDate = scheduleMode === 'regular' ? dayNames[selectedDayIndex] : date;
    const finalDayLabel = scheduleMode === 'regular' ? dayLabels[selectedDayIndex] : dayLabel;

    setSaving(true);
    try {
      console.log(
        'Modal: About to save with selectedDayIndex:',
        selectedDayIndex,
        'date:',
        finalDate,
        'dayLabel:',
        finalDayLabel
      );
      await onSave({
        date: finalDate,
        title: selectedCourse.title,
        courseCode: selectedCourse.code,
        instructor: selectedTeacher.name,
        type: selectedType,
        startHour: timeCheck.startHour,
        endHour: timeCheck.endHour,
        roomCode: selectedRoom.roomCode,
        scheduleMode,
      });
      console.log('Modal: Save completed, closing modal');
      onClose();
    } catch (err) {
      console.error('Modal: Save error:', err);
      setError(err.message || 'Failed to save schedule block.');
      setSaving(false);
    }
  };

  const stepTitles = [
    'Select Course',
    'Select Teacher',
    'Select Type',
    'Select Building & Room',
    'Summary',
  ];

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
      <div
        className="bg-white rounded-2xl w-full max-w-[1400px] max-h-[90vh] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-black text-xl" style={{ color: '#7A0808' }}>
                Add Schedule Block ({scheduleMode === 'exam' ? 'Exam Mode' : 'Regular Class'})
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Step {step} of 5: {stepTitles[step - 1]}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-gray-700"
            >
              <X size={20} />
            </button>
          </div>

          {/* Stepper Progress */}
          <div className="flex items-center justify-between">
            {stepTitles.map((title, idx) => {
              const stepNumber = idx + 1;
              const isCurrent = step === stepNumber;
              const isDone = step > stepNumber;

              return (
                <React.Fragment key={stepNumber}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                        isDone
                          ? 'bg-[#7A0808] text-white'
                          : isCurrent
                          ? 'bg-red-100 text-[#7A0808] border-2 border-[#7A0808]'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {stepNumber}
                    </div>
                    <span
                      className={`text-xs font-bold hidden sm:inline ${
                        isCurrent
                          ? 'text-[#7A0808]'
                          : isDone
                          ? 'text-gray-700'
                          : 'text-gray-400'
                      }`}
                    >
                      {title}
                    </span>
                  </div>
                  {stepNumber < 5 && (
                    <div
                      className={`flex-1 h-0.5 mx-2 ${
                        step > stepNumber ? 'bg-[#7A0808]' : 'bg-gray-200'
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen size={20} className="text-[#800000]" />
                    <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                      Select a Course
                    </h3>
                  </div>
                  <p className="text-xs font-semibold text-[#7A0808] mt-1 bg-red-50/80 px-3 py-1.5 rounded-xl border border-red-200/80 inline-block shadow-2xs">
                    Courses offered for {sectionYearLevel || '1st Year'} ({semesterDisplay})
                  </p>
                </div>

                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl self-start sm:self-auto">
                  {displayedCourses.length} course(s) available
                </span>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
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
                      : `No courses found for ${sectionYearLevel || '1st Year'} (${semesterDisplay})`}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {courseSearch
                      ? 'Try typing a different code or subject title'
                      : 'Add courses for this semester and year level in College Inventory'}
                  </p>
                </div>
              ) : (
                /* Compact Grid Layout for Courses */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {displayedCourses.map((course) => {
                    const isSelected = selectedCourse?.id === course.id;

                    return (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => {
                          setSelectedCourse(course);
                          setSelectedTeacher(null); // Reset teacher when course changes
                        }}
                        className={`text-left px-3.5 py-2.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-[#800000] bg-red-50/80 shadow-2xs'
                            : 'border-gray-200 hover:border-[#800000] hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-black text-xs text-[#800000]">{course.code}</span>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${
                              course.type === 'lecture'
                                ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                : course.type === 'laboratory'
                                ? 'bg-green-50 text-green-700 border border-green-100'
                                : 'bg-purple-50 text-purple-700 border border-purple-100'
                            }`}
                          >
                            {course.type?.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-gray-900 truncate">{course.title}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select Teacher with Compact List & Search */}
          {step === 2 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <User size={20} className="text-[#800000]" />
                  <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                    Select Teacher / Instructor
                  </h3>
                </div>
                {selectedCourse && (
                  <span className="text-xs font-bold text-blue-900 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                    Course: {selectedCourse.code}
                  </span>
                )}
              </div>

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

              {displayedTeachers.length === 0 ? (
                <div className="text-center py-8">
                  <User size={44} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-400">
                    {teacherSearch ? `No teachers matching "${teacherSearch}"` : 'No teacher available for this course'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {displayedTeachers.map((teacher) => {
                    const isSelected = selectedTeacher?.uid === teacher.uid;

                    return (
                      <button
                        key={teacher.uid}
                        type="button"
                        onClick={() => setSelectedTeacher(teacher)}
                        className={`text-left px-3.5 py-2.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-[#800000] bg-red-50/80 shadow-2xs'
                            : 'border-gray-200 hover:border-[#800000] hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs flex-shrink-0"
                            style={{ background: '#800000' }}
                          >
                            {teacher.name?.charAt(0)?.toUpperCase() || 'T'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs text-gray-900 truncate">{teacher.name}</p>
                            <p className="text-[10px] text-gray-500 truncate">{teacher.email}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Select Type */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock size={20} className="text-[#800000]" />
                <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                  Select Course Type
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {COURSE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setSelectedType(type);
                      setSelectedBuilding(null); // Reset building when class type changes
                      setSelectedRoom(null); // Reset room when class type changes
                    }}
                    className={`p-6 rounded-xl border-2 transition-all text-center ${
                      selectedType === type
                        ? 'border-[#800000] bg-red-50'
                        : 'border-gray-200 hover:border-[#800000] hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-black text-lg text-[#800000] mb-1">{type}</p>
                    <p className="text-xs text-gray-500">
                      {type === 'Lecture'
                        ? 'Regular classroom lecture session'
                        : 'Laboratory / practical hands-on session'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Select Building & Room with 30/70 Split View */}
          {step === 4 && (
            <div>
              {!selectedBuilding ? (
                /* Initial Building Selection (Small Compact Cards + Search + Type Filter Info) */
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2 size={20} className="text-[#800000]" />
                        <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                          Select Building
                        </h3>
                      </div>
                      <p className="text-xs font-semibold text-[#7A0808] mt-1 bg-red-50/80 px-2.5 py-1 rounded-lg border border-red-200/80 inline-block">
                        Showing buildings with {selectedType} rooms
                      </p>
                    </div>

                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
                      {displayedBuildings.length} building(s) available
                    </span>
                  </div>

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
                          className="text-left px-3.5 py-3 rounded-xl border border-gray-200 hover:border-[#800000] hover:bg-red-50/50 transition-all shadow-2xs group"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-black text-sm text-[#800000] truncate group-hover:text-[#600000]">
                              {building.name}
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                              {building.floors} Floors
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-gray-500">
                            Code: <span className="font-bold text-gray-700">{building.code}</span>
                          </p>
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
                        className="text-xs font-bold text-[#7A0808] hover:underline flex items-center gap-1 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200"
                      >
                        <ChevronLeft size={14} /> Change Building
                      </button>
                      <span className="text-gray-400">|</span>
                      <h4 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                        <Building2 size={16} className="text-[#800000]" />
                        <span>{selectedBuilding.name} ({selectedBuilding.code})</span>
                      </h4>
                    </div>

                    {selectedRoom && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 size={14} /> Selected Room: {selectedRoom.roomCode}
                      </span>
                    )}
                  </div>

                  {/* 30 / 70 Panel Division */}
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* LEFT PANEL (30% Width): Floor & Room List View */}
                    <div className="w-full lg:w-[30%] space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Layers size={14} className="text-[#800000]" /> Floors & Rooms ({selectedType})
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

                            // Format floor title cleanly (e.g. "1st Floor", "2nd Floor")
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
                                  className="w-full px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100/80 text-left flex items-center justify-between font-bold text-xs text-gray-800 transition-colors border-b border-gray-100"
                                >
                                  <span className="font-bold text-xs text-gray-900">{getFloorTitle()}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 font-bold">
                                      {floorData.rooms.length} room(s)
                                    </span>
                                    {isOpen ? (
                                      <ChevronDown size={15} className="text-[#800000] transition-transform" />
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

                                        return (
                                          <button
                                            key={room.roomCode}
                                            type="button"
                                            onClick={() => setSelectedRoom(room)}
                                            className={`text-left p-2.5 rounded-lg border-2 transition-all flex items-center justify-between ${
                                              isSelected
                                                ? 'border-[#800000] bg-red-50 shadow-2xs'
                                                : 'border-gray-100 hover:border-[#800000] hover:bg-gray-50'
                                            }`}
                                          >
                                            <div>
                                              <p className="font-black text-xs text-[#800000]">
                                                {room.roomCode}
                                              </p>
                                              <p className="text-[10px] text-gray-500">{room.type || room.roomType || 'Classroom'}</p>
                                            </div>
                                             <div className="flex items-center gap-1.5">
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
                                                 className="p-1 rounded-md text-gray-400 hover:text-[#800000] hover:bg-red-100/60 transition-colors"
                                               >
                                                 <Eye size={13} />
                                               </button>
                                             </div>
                                          </button>
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

                    {/* RIGHT PANEL (70% Width): Interactive Room Schedule Grid */}
                    <div className="w-full lg:w-[70%] border-l border-gray-200 pl-0 lg:pl-6 flex flex-col">
                      <div className="mb-3">
                        <h4 className="font-bold text-sm text-gray-900 mb-0.5">
                          Weekly Schedule Grid Overview
                        </h4>
                        <p className="text-xs text-gray-500">
                          {selectedRoom
                            ? `Showing current weekly schedule occupancy for Room ${selectedRoom.roomCode}`
                            : 'Select a room from the left floor list to view its live schedule grid'}
                        </p>
                      </div>

                      {selectedRoom ? (
                        <div className="flex-1 bg-white rounded-xl space-y-3">
                          {/* Live Interactive Time & Day Control Bar */}
                          <div className="p-3 bg-red-50/60 border border-red-200/80 rounded-xl space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-black text-[#800000] flex items-center gap-1.5">
                                <Clock size={14} /> Selected Schedule Time & Day:
                              </span>
                              {startTime && endTime && selectedDayIndex !== undefined ? (
                                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-[#800000] text-white shadow-2xs">
                                  {SCHEDULE_DAYS[selectedDayIndex]} {formatScheduleHour(parseTimeToHour(startTime))} – {formatScheduleHour(parseTimeToHour(endTime))} ({Math.round(Math.max(0, parseTimeToHour(endTime) - parseTimeToHour(startTime)) * 10) / 10} hrs)
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                                  👇 Click or drag on the grid below to set time
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                              {/* Day Selector */}
                              <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                  Day
                                </label>
                                <select
                                  value={selectedDayIndex !== undefined ? selectedDayIndex : 0}
                                  onChange={(e) => setSelectedDayIndex(Number(e.target.value))}
                                  className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-900 outline-none focus:border-[#800000]"
                                >
                                  {SCHEDULE_DAYS.map((d, idx) => (
                                    <option key={d} value={idx}>{d}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Start Time */}
                              <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                  Start Time
                                </label>
                                <select
                                  value={startTime || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setStartTime(val);
                                    if (!endTime && val) {
                                      const startH = parseTimeToHour(val);
                                      setEndTime(hourToTimeInput(startH + 1.5));
                                    }
                                  }}
                                  className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-900 outline-none focus:border-[#800000]"
                                >
                                  <option value="" disabled>Select start time...</option>
                                  {Array.from({ length: (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 2 }, (_, i) => {
                                    const h = SCHEDULE_START_HOUR + i * 0.5;
                                    const timeStr = hourToTimeInput(h);
                                    return (
                                      <option key={timeStr} value={timeStr}>
                                        {formatScheduleHour(h)}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              {/* End Time */}
                              <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                  End Time
                                </label>
                                <select
                                  value={endTime || ''}
                                  onChange={(e) => setEndTime(e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-900 outline-none focus:border-[#800000]"
                                >
                                  <option value="" disabled>Select end time...</option>
                                  {Array.from({ length: (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 2 }, (_, i) => {
                                    const h = SCHEDULE_START_HOUR + (i + 1) * 0.5;
                                    const timeStr = hourToTimeInput(h);
                                    return (
                                      <option key={timeStr} value={timeStr}>
                                        {formatScheduleHour(h)}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                            </div>
                          </div>

                          <RoomScheduleViewer
                            roomCode={selectedRoom.roomCode}
                            scheduleMode={scheduleMode}
                            semester={semester}
                            deanUid={deanUid}
                            currentTimeSlot={
                              startTime && endTime && selectedDayIndex !== undefined
                                ? {
                                    day: selectedDayIndex,
                                    startHour: parseTimeToHour(startTime),
                                    endHour: parseTimeToHour(endTime),
                                  }
                                : null
                            }
                            onTimeSelect={(day, startHour, endHour) => {
                              setSelectedDayIndex(day);
                              setStartTime(hourToTimeInput(startHour));
                              setEndTime(hourToTimeInput(endHour));
                            }}
                          />
                        </div>
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

          {/* Step 5: Schedule Summary */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-[#800000]" />
                  <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                    Schedule Plot Summary
                  </h3>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                  Ready to Plot
                </span>
              </div>

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
                    <span className="font-semibold">Type: {selectedType}</span>
                    <span>•</span>
                    <span>{semesterDisplay}</span>
                    <span>•</span>
                    <span>{sectionYearLevel || '1st Year'}</span>
                  </div>
                </div>

                {/* Instructor Card */}
                <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      INSTRUCTOR / TEACHER
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                      Assigned
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-xs"
                      style={{ background: '#800000' }}
                    >
                      {selectedTeacher?.name?.charAt(0)?.toUpperCase() || 'T'}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900">{selectedTeacher?.name || 'Unassigned'}</p>
                      <p className="text-xs text-gray-500">{selectedTeacher?.email || 'N/A'}</p>
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
                  <p className="font-bold text-sm text-gray-900">{selectedBuilding?.name} ({selectedBuilding?.code})</p>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>Room Type: {selectedRoom?.type || selectedRoom?.roomType || 'Classroom'}</span>
                    <span>•</span>
                    <span>Capacity: {selectedRoom?.capacity} students</span>
                  </div>
                </div>

                {/* Schedule Day & Time Card */}
                <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      SCHEDULE TIME & DAY
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                      {scheduleMode === 'exam' ? 'Exam Mode' : 'Regular Class'}
                    </span>
                  </div>
                  <p className="font-bold text-sm text-gray-900">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][selectedDayIndex] || date}
                  </p>
                  <p className="text-xs font-bold text-[#7A0808]">
                    Time: {formatScheduleHour(parseTimeToHour(startTime) || 0)} – {formatScheduleHour(parseTimeToHour(endTime) || 0)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                className="btn-outline flex items-center gap-2 text-xs"
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline text-xs"
              disabled={saving}
            >
              Cancel
            </button>

            {step < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                className="btn-maroon flex items-center gap-2 text-xs"
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || !selectedRoom}
                className="btn-maroon flex items-center gap-2 text-xs"
              >
                {saving ? 'Saving...' : 'Add Schedule Block'}
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
                <div className="w-10 h-10 rounded-xl bg-red-50 text-[#800000] flex items-center justify-center flex-shrink-0 border border-red-100">
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
                    <Layers size={14} className="text-[#800000]" />
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
                className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
