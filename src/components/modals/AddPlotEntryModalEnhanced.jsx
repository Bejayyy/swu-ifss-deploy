import React, { useMemo, useState, useEffect } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  User,
  Clock,
  Building2,
  DoorOpen,
  Calendar,
  Search,
} from 'lucide-react';
import { parseTimeToHour, validateScheduleHours, hourToTimeInput } from '../../services/plotScheduleService';
import { formatScheduleHour } from '../../constants/scheduleGrid';
import { formatDisplayDate } from '../../utils/academicCalendarUtils';
import { subscribeCollegeCourses } from '../../services/courseService';
import { subscribeToBuildings } from '../../services/buildingService';
import { subscribeStaffUsers } from '../../services/systemUserService';
import RoomScheduleViewer from '../scheduling/RoomScheduleViewer';

const COURSE_TYPES = ['Lecture', 'Laboratory']; // Only Lecture and Laboratory

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
}) {
  // Multi-step form state
  const [step, setStep] = useState(1); // 1: Course, 2: Teacher, 3: Type, 4: Building, 5: Room & Time
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

  // Form data
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedType, setSelectedType] = useState('Lecture');
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [startTime, setStartTime] = useState(initial?.startTime || '08:00');
  const [endTime, setEndTime] = useState(initial?.endTime || '09:30');
  const [selectedDayIndex, setSelectedDayIndex] = useState(dayIndex); // Track which day user selected

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

  // Get rooms for selected building
  const availableRooms = useMemo(() => {
    if (!selectedBuilding) return [];

    const roomsByFloor = {};
    selectedBuilding.floorData.forEach((floor) => {
      floor.rooms.forEach((room) => {
        if (!roomsByFloor[floor.floorNumber]) {
          roomsByFloor[floor.floorNumber] = {
            label: floor.label,
            rooms: [],
          };
        }
        roomsByFloor[floor.floorNumber].rooms.push(room);
      });
    });

    return roomsByFloor;
  }, [selectedBuilding]);

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
    if (step === 5 && !selectedRoom) {
      setError('Please select a room');
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

    if (!selectedCourse || !selectedTeacher || !selectedType || !selectedRoom) {
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
    'Select Building',
    'Select Room & Set Time',
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
                    onClick={() => setSelectedType(type)}
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

          {/* Step 4: Select Building */}
          {step === 4 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={20} className="text-[#800000]" />
                <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                  Select Building
                </h3>
              </div>

              {loadingBuildings ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">Loading buildings...</p>
                </div>
              ) : buildings.length === 0 ? (
                <div className="text-center py-8">
                  <Building2 size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-400">No buildings available</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {buildings.map((building) => (
                    <button
                      key={building.id}
                      type="button"
                      onClick={() => {
                        setSelectedBuilding(building);
                        setSelectedRoom(null); // Reset room when building changes
                      }}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${
                        selectedBuilding?.id === building.id
                          ? 'border-[#800000] bg-red-50'
                          : 'border-gray-200 hover:border-[#800000] hover:bg-gray-50'
                      }`}
                    >
                      <h4 className="font-bold text-sm text-[#800000] mb-1">{building.name}</h4>
                      <p className="text-xs text-gray-600 mb-2">Code: {building.code}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-bold">
                        {building.floors} Floors
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Select Room & Set Time with Schedule Matrix */}
          {step === 5 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <DoorOpen size={20} className="text-[#800000]" />
                <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>
                  Select Room & Set Schedule Time
                </h3>
              </div>

              {/* Day Selection (Only for regular schedule mode) */}
              {scheduleMode === 'regular' && (
                <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <label className="block text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: '#2B3235' }}>
                    <Calendar size={14} className="text-[#800000]" />
                    Select Class Day <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-7 gap-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName, idx) => (
                      <button
                        key={dayName}
                        type="button"
                        onClick={() => setSelectedDayIndex(idx)}
                        className={`py-2 px-1 rounded-lg text-xs font-bold transition-all text-center ${
                          selectedDayIndex === idx
                            ? 'bg-[#800000] text-white shadow-md'
                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {dayName}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2">
                    Selected Day:{' '}
                    <strong className="text-[#800000]">
                      {
                        ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][
                          selectedDayIndex
                        ]
                      }
                    </strong>
                  </p>
                </div>
              )}

              {/* Time Inputs */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: '#2B3235' }}>
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    disabled={lockTimes}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: '#2B3235' }}>
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    disabled={lockTimes}
                    className="input-field w-full"
                  />
                </div>
              </div>

              {/* Room Selection by Floor */}
              {Object.keys(availableRooms).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">No rooms found in selected building</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(availableRooms).map(([floorNum, floorData]) => (
                    <div key={floorNum}>
                      <h4 className="font-bold text-xs text-gray-700 mb-3 uppercase tracking-wider">
                        {floorData.label} (Floor {floorNum})
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {floorData.rooms.map((room) => {
                          const isSelected = selectedRoom?.roomCode === room.roomCode;

                          return (
                            <div
                              key={room.roomCode}
                              className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-[#800000] bg-red-50'
                                  : 'border-gray-200 hover:border-[#800000] hover:bg-gray-50'
                              }`}
                              onClick={() => setSelectedRoom(room)}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                  <h5 className="font-black text-sm text-[#800000]">{room.roomCode}</h5>
                                  <p className="text-xs text-gray-600">{room.roomType}</p>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                  Cap: {room.capacity}
                                </span>
                              </div>

                              {/* Room Schedule Occupancy Matrix */}
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <RoomScheduleViewer
                                  roomCode={room.roomCode}
                                  startTime={startTime}
                                  endTime={endTime}
                                  date={
                                    scheduleMode === 'regular'
                                      ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][
                                          selectedDayIndex
                                        ]
                                      : date
                                  }
                                  scheduleMode={scheduleMode}
                                  semester={semester}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                className="btn-[#7A0808] btn-maroon flex items-center gap-2 text-xs"
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
    </div>
  );
}
