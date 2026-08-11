import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  Mail,
  Phone,
  BookOpen,
  Building2,
  GraduationCap,
  Plus,
  X,
  Calendar,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckSquare,
  Square,
  CheckCircle2,
} from 'lucide-react';
import Layout from '../components/Layout';
import { StatCardItem } from '../components/ProgressStatCards';
import LoadingModal from '../components/modals/LoadingModal';

import NotificationModal from '../components/modals/NotificationModal';
import TeacherScheduleModal from '../components/modals/TeacherScheduleModal';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { subscribeStaffUsers } from '../services/systemUserService';
import { subscribeCollegeCourses, assignTeacherToCourse, unassignTeacherFromCourse } from '../services/courseService';
import { formatCollegeName } from '../constants/colleges';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
const SEMESTERS = ['1st Semester', '2nd Semester', 'Summer'];

export default function TeachersDirectory() {
  const { profile } = useAuth();
  const isDean = profile?.role === ROLES.DEAN;
  const isRegistrar = profile?.role === ROLES.REGISTRAR;
  const myDepartment = profile?.department || profile?.college;

  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [notification, setNotification] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleTeacher, setScheduleTeacher] = useState(null);

  // Multi-select & Filters for Assign Course Modal
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);
  const [assignModalSearch, setAssignModalSearch] = useState('');
  const [assignModalYear, setAssignModalYear] = useState('All');
  const [assignModalSemester, setAssignModalSemester] = useState('All');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Subscribe to all teachers
  useEffect(() => {
    setLoading(true);
    return subscribeStaffUsers(
      (users) => {
        // Filter only teachers from the same department/college
        const filteredTeachers = users.filter((user) => {
          if (user.roleValue !== 'teacher') return false;

          // If dean, only show teachers from same department/college
          if (isDean && myDepartment) {
            const teacherDept = user.department || user.college;
            const formattedTeacherDept = formatCollegeName(teacherDept);
            const formattedMyDept = formatCollegeName(myDepartment);
            return (
              formattedTeacherDept &&
              formattedMyDept &&
              formattedTeacherDept.toLowerCase() === formattedMyDept.toLowerCase()
            );
          }

          return true; // Registrar sees all
        });

        setTeachers(filteredTeachers);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading teachers:', err);
        setLoading(false);
      }
    );
  }, [isDean, myDepartment]);

  // Subscribe to courses for the college (for assignment)
  useEffect(() => {
    if (isDean && myDepartment) {
      return subscribeCollegeCourses(
        myDepartment,
        (data) => setCourses(data),
        (err) => console.error('Error loading courses:', err)
      );
    }
    return () => {};
  }, [isDean, myDepartment]);

  // Get courses assigned to a teacher
  const getTeacherCourses = (teacherUid) => {
    return courses.filter((c) => c.assignedTeacherUid === teacherUid);
  };

  // Get available courses (not assigned to selected teacher) with Year Level & Semester filtering
  const getAvailableCourses = () => {
    if (!selectedTeacher) return [];
    const teacherCourses = getTeacherCourses(selectedTeacher.uid);
    const assignedIds = new Set(teacherCourses.map((c) => c.id));
    let available = courses.filter((c) => !assignedIds.has(c.id));

    if (assignModalYear !== 'All') {
      available = available.filter((c) => c.yearLevel === assignModalYear);
    }
    if (assignModalSemester !== 'All') {
      available = available.filter(
        (c) => (c.semester || '1st Semester') === assignModalSemester
      );
    }
    if (assignModalSearch.trim()) {
      const q = assignModalSearch.toLowerCase().trim();
      available = available.filter(
        (c) =>
          (c.code && c.code.toLowerCase().includes(q)) ||
          (c.title && c.title.toLowerCase().includes(q))
      );
    }

    return available;
  };

  // Get unique list of departments for filter dropdown
  const departmentList = useMemo(() => {
    const depts = new Set();
    teachers.forEach((t) => {
      const d = t.department || t.college || 'Unassigned';
      depts.add(d);
    });
    return Array.from(depts).sort();
  }, [teachers]);

  // Filter teachers by search query & department
  const filteredTeachers = useMemo(() => {
    return teachers.filter((teacher) => {
      const dept = teacher.department || teacher.college || 'Unassigned';
      if (deptFilter !== 'All' && dept !== deptFilter) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const teacherCourses = getTeacherCourses(teacher.uid);
      const matchesCourse = teacherCourses.some(
        (c) => (c.code && c.code.toLowerCase().includes(q)) || (c.title && c.title.toLowerCase().includes(q))
      );

      return (
        (teacher.name && teacher.name.toLowerCase().includes(q)) ||
        (teacher.email && teacher.email.toLowerCase().includes(q)) ||
        dept.toLowerCase().includes(q) ||
        matchesCourse
      );
    });
  }, [teachers, searchQuery, deptFilter, courses]);

  // Reset pagination when search query or department filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, deptFilter, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / itemsPerPage));
  const paginatedTeachers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTeachers.slice(start, start + itemsPerPage);
  }, [filteredTeachers, currentPage, itemsPerPage]);

  const handleAssignCourse = (teacher) => {
    setSelectedTeacher(teacher);
    setSelectedCourseIds([]);
    setAssignModalSearch('');
    setAssignModalYear('All');
    setAssignModalSemester('All');
    setShowAssignModal(true);
  };

  const handleViewSchedule = (teacher) => {
    setScheduleTeacher(teacher);
    setShowScheduleModal(true);
  };

  const toggleCourseSelection = (id) => {
    setSelectedCourseIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllCourses = (availableList) => {
    const availableIds = availableList.map((c) => c.id);
    const isAllSelected = availableIds.length > 0 && availableIds.every((id) => selectedCourseIds.includes(id));
    if (isAllSelected) {
      setSelectedCourseIds((prev) => prev.filter((id) => !availableIds.includes(id)));
    } else {
      setSelectedCourseIds((prev) => Array.from(new Set([...prev, ...availableIds])));
    }
  };

  const handleAssignCourseToTeacher = async (courseId) => {
    if (!selectedTeacher) return;

    setIsLoading(true);
    setLoadingMessage('Assigning course...');

    try {
      await assignTeacherToCourse(
        courseId,
        selectedTeacher.uid,
        selectedTeacher.name,
        selectedTeacher.email
      );
      setNotification({
        type: 'success',
        title: 'Course Assigned!',
        message: `Course has been assigned to ${selectedTeacher.name}.`,
      });
      setSelectedCourseIds((prev) => prev.filter((id) => id !== courseId));
    } catch (err) {
      console.error('Error assigning course:', err);
      setNotification({
        type: 'error',
        title: 'Failed to Assign Course',
        message: err.message || 'An error occurred while assigning the course.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchAssignCoursesToTeacher = async () => {
    if (!selectedTeacher || selectedCourseIds.length === 0) return;

    setIsLoading(true);
    setLoadingMessage(`Assigning ${selectedCourseIds.length} course(s)...`);

    try {
      for (const courseId of selectedCourseIds) {
        await assignTeacherToCourse(
          courseId,
          selectedTeacher.uid,
          selectedTeacher.name,
          selectedTeacher.email
        );
      }
      setNotification({
        type: 'success',
        title: 'Courses Assigned!',
        message: `Successfully assigned ${selectedCourseIds.length} course(s) to ${selectedTeacher.name}.`,
      });
      setSelectedCourseIds([]);
    } catch (err) {
      console.error('Error batch assigning courses:', err);
      setNotification({
        type: 'error',
        title: 'Failed to Assign Courses',
        message: err.message || 'An error occurred while assigning courses.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnassignCourse = async (courseId, courseName) => {
    if (!window.confirm(`Remove this course assignment?\n\n${courseName}`)) return;

    setIsLoading(true);
    setLoadingMessage('Removing assignment...');

    try {
      await unassignTeacherFromCourse(courseId);
      setNotification({
        type: 'success',
        title: 'Course Unassigned!',
        message: 'Course assignment has been removed.',
      });
    } catch (err) {
      console.error('Error unassigning course:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const startIdx = (currentPage - 1) * itemsPerPage + 1;

  const endIdx = Math.min(currentPage * itemsPerPage, filteredTeachers.length);
  const availableCoursesList = getAvailableCourses();
  const allFilteredSelected =
    availableCoursesList.length > 0 &&
    availableCoursesList.every((c) => selectedCourseIds.includes(c.id));

  return (
    <Layout
      title="Teachers Directory"
      subtitle={isDean ? `Teachers in ${myDepartment || 'your college'}` : 'View and manage all faculty members across colleges'}
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCardItem label="Total Teachers" value={teachers.length} icon={Users} color="blue" />
        <StatCardItem label="Active Teachers" value={teachers.filter((t) => t.status === 'Active' || !t.status).length} icon={GraduationCap} color="emerald" />
        <StatCardItem label="Inactive Teachers" value={teachers.filter((t) => t.status === 'Inactive').length} icon={Users} color="slate" />
        <StatCardItem label={isDean ? 'Your Department' : 'Colleges Covered'} value={departmentList.length} icon={Building2} color="amber" />
      </div>



      {/* Header & Controls Bar */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-base flex items-center gap-2" style={{ color: '#2B3235' }}>
              <Users size={18} className="text-[#7A0808]" /> Faculty & Instructor Directory
            </h2>
            <p className="text-xs font-medium mt-0.5 text-gray-500">
              Filter by name, email, department, or assigned subjects. View weekly schedules and assign course loads.
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              className="w-full pl-10 pr-4 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-1 focus:ring-[#7A0808] focus:border-[#7A0808] transition-all font-medium"
              placeholder="Search by teacher name, email, department, or course code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Department Filter */}
          {!isDean && departmentList.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-600 font-semibold">
              <Filter size={14} className="text-gray-400" />
              <span>Department:</span>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-xs font-bold cursor-pointer text-[#7A0808]"
              >
                <option value="All">All Departments</option>
                {departmentList.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Rows Per Page */}
          <div className="flex items-center gap-2 text-xs text-gray-600 font-semibold">
            <span>Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-xs font-bold cursor-pointer"
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>
        </div>
      </div>

      {/* Teachers Data Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <p className="text-sm text-gray-400">Loading teachers...</p>
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-semibold text-gray-500 mb-1">
              {searchQuery || deptFilter !== 'All' ? `No teachers found matching your filters` : 'No teachers found'}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              {searchQuery || deptFilter !== 'All'
                ? 'Try clearing your search query or department filter'
                : isDean
                ? `No teachers are assigned to ${myDepartment || 'your college'} yet.`
                : 'No teachers have been added to the system yet.'}
            </p>
            {(searchQuery || deptFilter !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDeptFilter('All');
                }}
                className="btn-outline-maroon text-xs px-4 py-2"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-100">
                <tr>
                  <th className="p-3.5 w-12 text-center">#</th>
                  <th className="p-3.5 min-w-[200px]">Faculty Member</th>
                  <th className="p-3.5 min-w-[150px]">Department / College</th>
                  <th className="p-3.5 min-w-[220px]">Assigned Courses</th>
                  <th className="p-3.5 min-w-[90px]">Status</th>
                  <th className="p-3.5 text-center min-w-[160px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {paginatedTeachers.map((teacher, idx) => {
                  const teacherCourses = getTeacherCourses(teacher.uid);
                  const deptName = teacher.department || teacher.college || 'Unassigned';

                  return (
                    <tr key={teacher.uid} className="hover:bg-red-50/20 transition-colors">
                      <td className="p-3.5 text-center font-bold text-gray-400">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>

                      {/* Teacher Profile Info */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-xs flex-shrink-0"
                            style={{ background: '#7A0808' }}
                          >
                            {teacher.initials || teacher.name?.charAt(0)?.toUpperCase() || 'T'}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-gray-900 text-xs truncate">{teacher.name}</h4>
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5">
                              <Mail size={12} className="text-gray-400 flex-shrink-0" />
                              <span className="truncate">{teacher.email}</span>
                            </div>
                            {teacher.phone && (
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-0.5">
                                <Phone size={11} className="text-gray-400 flex-shrink-0" />
                                <span>{teacher.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Department / College */}
                      <td className="p-3.5">
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-700 font-bold text-[10px] rounded-lg border border-gray-200 inline-block">
                          {deptName}
                        </span>
                      </td>

                      {/* Assigned Courses */}
                      <td className="p-3.5">
                        {teacherCourses.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 max-w-xs">
                            {teacherCourses.map((c) => (
                              <span
                                key={c.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-[#7A0808] font-bold text-[10px] rounded-md border border-red-100"
                                title={`${c.code} - ${c.title}`}
                              >
                                <span>{c.code}</span>
                                {isDean && (
                                  <button
                                    type="button"
                                    onClick={() => handleUnassignCourse(c.id, `${c.code} - ${c.title}`)}
                                    className="hover:text-red-700 hover:bg-red-200/60 p-0.5 rounded transition-colors"
                                    title="Unassign course"
                                  >
                                    <X size={10} />
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs italic">No assigned subjects</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            teacher.status === 'Inactive'
                              ? 'bg-gray-100 text-gray-600 border-gray-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {teacher.status || 'Active'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleViewSchedule(teacher)}
                            className="px-2.5 py-1.5 bg-gray-100 hover:bg-[#7A0808] text-gray-700 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-2xs"
                            title="View weekly schedule"
                          >
                            <Calendar size={13} /> Schedule
                          </button>
                          {isDean && (
                            <button
                              type="button"
                              onClick={() => handleAssignCourse(teacher)}
                              className="px-2 py-1.5 bg-red-50 hover:bg-red-100 text-[#7A0808] border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                              title="Assign new course"
                            >
                              <Plus size={13} /> Assign
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls Footer */}
        {filteredTeachers.length > 0 && (
          <div className="flex flex-wrap items-center justify-between p-4 border-t border-gray-100 text-xs text-gray-600 gap-3 bg-gray-50/50">
            <span className="font-semibold">
              Showing <strong className="text-gray-900">{startIdx}</strong> to{' '}
              <strong className="text-gray-900">{endIdx}</strong> of{' '}
              <strong className="text-gray-900">{filteredTeachers.length}</strong> teacher(s)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-bold transition-all shadow-2xs"
              >
                <ChevronLeft size={16} />
              </button>

              <span className="px-3 py-1 font-bold text-xs text-gray-800">
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-bold transition-all shadow-2xs"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Teacher Schedule Modal */}
      {showScheduleModal && scheduleTeacher && (
        <TeacherScheduleModal
          teacher={scheduleTeacher}
          semester="1"
          collegeCode={scheduleTeacher.department || scheduleTeacher.college}
          onClose={() => {
            setShowScheduleModal(false);
            setScheduleTeacher(null);
          }}
        />
      )}

      {/* Assign Course Modal WITH MULTI-SELECT CHECKBOXES & FILTERS */}
      {showAssignModal && selectedTeacher && (
        <div className="modal-overlay z-[100]" onClick={() => setShowAssignModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-xl w-full relative animate-modal-pop max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg text-dark">
                  Assign Course to {selectedTeacher.name}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select one or multiple courses using checkboxes to assign all at once.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter Controls & Select All Header */}
            <div className="p-4 bg-gray-50/80 border-b border-gray-200 space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search course code or title..."
                  value={assignModalSearch}
                  onChange={(e) => setAssignModalSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 text-xs border border-gray-200 rounded-xl bg-white focus:ring-1 focus:ring-[#7A0808] focus:border-[#7A0808] font-medium"
                />
                {assignModalSearch && (
                  <button
                    type="button"
                    onClick={() => setAssignModalSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
                    Year Level Filter
                  </label>
                  <select
                    value={assignModalYear}
                    onChange={(e) => setAssignModalYear(e.target.value)}
                    className="w-full text-xs font-bold py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer"
                  >
                    <option value="All">All Year Levels</option>
                    {YEAR_LEVELS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
                    Semester Filter
                  </label>
                  <select
                    value={assignModalSemester}
                    onChange={(e) => setAssignModalSemester(e.target.value)}
                    className="w-full text-xs font-bold py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer text-[#7A0808]"
                  >
                    <option value="All">All Semesters</option>
                    {SEMESTERS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Select All Bar */}
              {availableCoursesList.length > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-200/60">
                  <button
                    type="button"
                    onClick={() => toggleSelectAllCourses(availableCoursesList)}
                    className="flex items-center gap-2 text-xs font-bold text-gray-700 hover:text-[#7A0808]"
                  >
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={() => toggleSelectAllCourses(availableCoursesList)}
                      className="w-4 h-4 rounded text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                    />
                    <span>Select All ({availableCoursesList.length})</span>
                  </button>

                  <span className="text-xs font-bold text-[#7A0808]">
                    {selectedCourseIds.length} Selected
                  </span>
                </div>
              )}
            </div>

            {/* Courses List with Checkboxes */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
              {availableCoursesList.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-xs font-semibold">
                    {assignModalSearch || assignModalYear !== 'All' || assignModalSemester !== 'All'
                      ? 'No unassigned courses match your selected filters.'
                      : 'No available unassigned courses for this department.'}
                  </p>
                  {(assignModalSearch || assignModalYear !== 'All' || assignModalSemester !== 'All') && (
                    <button
                      type="button"
                      onClick={() => {
                        setAssignModalSearch('');
                        setAssignModalYear('All');
                        setAssignModalSemester('All');
                      }}
                      className="mt-2 text-xs font-bold text-[#7A0808] hover:underline"
                    >
                      Reset Assign Filters
                    </button>
                  )}
                </div>
              ) : (
                availableCoursesList.map((course) => {
                  const isChecked = selectedCourseIds.includes(course.id);

                  return (
                    <div
                      key={course.id}
                      onClick={() => toggleCourseSelection(course.id)}
                      className={`flex items-center justify-between p-3.5 border rounded-xl cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-red-50/70 border-[#7A0808] shadow-2xs'
                          : 'bg-gray-50/80 hover:bg-gray-100/60 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent div onClick
                          className="w-4 h-4 rounded text-[#7A0808] focus:ring-[#7A0808] cursor-pointer flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs text-gray-900 truncate">
                            {course.code} — {course.title}
                          </h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                              {course.units} units
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100 capitalize">
                              {course.type}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                              {course.yearLevel || '1st Year'}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-50 text-[#7A0808] border border-red-100">
                              {course.semester || '1st Semester'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAssignCourseToTeacher(course.id);
                        }}
                        className="btn-maroon text-xs px-3 py-1.5 font-bold shadow-2xs flex-shrink-0"
                      >
                        Assign
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer with Batch Assign Button */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="btn-outline-maroon font-bold text-xs px-4 py-2"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handleBatchAssignCoursesToTeacher}
                disabled={selectedCourseIds.length === 0}
                className="btn-maroon font-bold text-xs px-5 py-2 flex items-center gap-2 shadow-md disabled:opacity-50"
              >
                <Plus size={15} />
                <span>Assign {selectedCourseIds.length} Selected Course(s)</span>
              </button>
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
    </Layout>
  );
}
