import React, { useEffect, useState, useMemo } from 'react';
import {
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  Building2,
  X,
  BookOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  UserCheck,
} from 'lucide-react';
import Layout from '../components/Layout';
import { StatCardItem } from '../components/ProgressStatCards';
import LoadingModal from '../components/modals/LoadingModal';

import NotificationModal from '../components/modals/NotificationModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import AddCollegeModal from '../components/modals/AddCollegeModal';
import AddCourseModal from '../components/modals/AddCourseModal';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { subscribeColleges, deleteCollege } from '../services/collegeService';
import { subscribeCollegeCourses, deleteCourse } from '../services/courseService';
import { subscribeStaffUsers } from '../services/systemUserService';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
const SEMESTERS = ['1st Semester', '2nd Semester', 'Summer'];

export default function CollegeInventory() {
  const { profile } = useAuth();
  const isRegistrar = profile?.role === ROLES.REGISTRAR;

  const [colleges, setColleges] = useState([]);
  const [deansList, setDeansList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [notification, setNotification] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Colleges Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  // Modal states for College
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCollege, setEditingCollege] = useState(null);

  // Course management states
  const [viewingCollegeCourses, setViewingCollegeCourses] = useState(null);
  const [collegeCourses, setCollegeCourses] = useState([]);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('All');
  const [semesterFilter, setSemesterFilter] = useState('All');
  const [courseCurrentPage, setCourseCurrentPage] = useState(1);
  const [courseItemsPerPage, setCourseItemsPerPage] = useState(5);

  // Subscribe to colleges
  useEffect(() => {
    setLoading(true);
    return subscribeColleges(
      (data) => {
        setColleges(data);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading colleges:', err);
        setLoading(false);
      }
    );
  }, []);

  // Subscribe to Dean users to display College Dean info
  useEffect(() => {
    return subscribeStaffUsers(
      (users) => {
        const deansOnly = users.filter(
          (u) => u.roleValue === 'dean' || u.role?.toLowerCase() === 'dean'
        );
        setDeansList(deansOnly);
      },
      (err) => console.error('Error fetching deans for college inventory:', err),
      ['dean']
    );
  }, []);

  // Subscribe to courses when viewing a college
  useEffect(() => {
    if (!viewingCollegeCourses) {
      setCollegeCourses([]);
      return () => {};
    }

    return subscribeCollegeCourses(
      viewingCollegeCourses.code,
      (data) => setCollegeCourses(data),
      (err) => console.error('Error loading courses:', err)
    );
  }, [viewingCollegeCourses]);

  // Match Dean to College
  const getDeanForCollege = (college) => {
    if (!deansList || deansList.length === 0) return null;
    const code = (college.code || '').trim().toUpperCase();
    const name = (college.name || '').trim().toLowerCase();

    return deansList.find((d) => {
      const userDept = (d.college || d.department || '').trim();
      const userDeptUpper = userDept.toUpperCase();
      const userDeptLower = userDept.toLowerCase();

      return (
        userDeptUpper === code ||
        userDeptLower === name ||
        (name.length > 3 && userDeptLower.includes(name)) ||
        (userDeptLower.length > 3 && name.includes(userDeptLower))
      );
    });
  };

  // Reset pagination when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  useEffect(() => {
    setCourseCurrentPage(1);
  }, [courseSearchQuery, yearFilter, semesterFilter, courseItemsPerPage]);

  // Filtered & Paginated Colleges
  const filteredColleges = useMemo(() => {
    if (!searchQuery.trim()) return colleges;
    const q = searchQuery.toLowerCase().trim();
    return colleges.filter(
      (c) =>
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.programs && c.programs.some((p) => p.code?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q)))
    );
  }, [colleges, searchQuery]);

  const totalCollegePages = Math.max(1, Math.ceil(filteredColleges.length / itemsPerPage));
  const paginatedColleges = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredColleges.slice(start, start + itemsPerPage);
  }, [filteredColleges, currentPage, itemsPerPage]);

  // Filtered & Paginated Courses
  const filteredCourses = useMemo(() => {
    return collegeCourses.filter((c) => {
      const matchesYear = yearFilter === 'All' || c.yearLevel === yearFilter;
      const matchesSem = semesterFilter === 'All' || (c.semester || '1st Semester') === semesterFilter;
      if (!matchesYear || !matchesSem) return false;

      if (!courseSearchQuery.trim()) return true;
      const q = courseSearchQuery.toLowerCase().trim();
      return (
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.title && c.title.toLowerCase().includes(q))
      );
    });
  }, [collegeCourses, yearFilter, semesterFilter, courseSearchQuery]);

  const totalCoursePages = Math.max(1, Math.ceil(filteredCourses.length / courseItemsPerPage));
  const paginatedCourses = useMemo(() => {
    const start = (courseCurrentPage - 1) * courseItemsPerPage;
    return filteredCourses.slice(start, start + courseItemsPerPage);
  }, [filteredCourses, courseCurrentPage, courseItemsPerPage]);

  const handleAdd = () => {
    setEditingCollege(null);
    setShowAddModal(true);
  };

  const handleEdit = (college) => {
    setEditingCollege(college);
    setShowAddModal(true);
  };

  const handleDelete = (college) => {
    setConfirmDialog({
      title: 'Delete College',
      message: `Are you sure you want to delete "${college.name}"? This action cannot be undone. Make sure no users are assigned to this college.`,
      onConfirm: async () => {
        setIsLoading(true);
        setLoadingMessage('Deleting college...');
        setConfirmDialog(null);

        try {
          await deleteCollege(college.id);
          setNotification({
            type: 'success',
            title: 'College Deleted!',
            message: `${college.name} has been removed.`,
          });
        } catch (err) {
          console.error('Error deleting college:', err);
          setNotification({
            type: 'error',
            title: 'Failed to Delete College',
            message: err.message || 'An error occurred while deleting the college.',
          });
        } finally {
          setIsLoading(false);
        }
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  // Course management functions
  const handleViewCourses = (college) => {
    setViewingCollegeCourses(college);
    setCourseSearchQuery('');
    setYearFilter('All');
    setSemesterFilter('All');
  };

  const handleBackToColleges = () => {
    setViewingCollegeCourses(null);
    setCollegeCourses([]);
  };

  const handleAddCourse = () => {
    setEditingCourse(null);
    setShowCourseModal(true);
  };

  const handleEditCourse = (course) => {
    setEditingCourse(course);
    setShowCourseModal(true);
  };

  const handleDeleteCourse = (course) => {
    setConfirmDialog({
      title: 'Delete Course',
      message: `Are you sure you want to delete "${course.title}"? This action cannot be undone.`,
      onConfirm: async () => {
        setIsLoading(true);
        setLoadingMessage('Deleting course...');
        setConfirmDialog(null);

        try {
          await deleteCourse(course.id);
          setNotification({
            type: 'success',
            title: 'Course Deleted!',
            message: `${course.title} has been removed.`,
          });
        } catch (err) {
          console.error('Error deleting course:', err);
          setNotification({
            type: 'error',
            title: 'Failed to Delete Course',
            message: err.message || 'An error occurred while deleting the course.',
          });
        } finally {
          setIsLoading(false);
        }
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  if (!isRegistrar) {
    return (
      <Layout title="Access Denied">
        <div className="text-center py-12">
          <p className="text-gray-500">You do not have permission to access this page.</p>
        </div>
      </Layout>
    );
  }

  const collegeStartIdx = (currentPage - 1) * itemsPerPage + 1;
  const collegeEndIdx = Math.min(currentPage * itemsPerPage, filteredColleges.length);

  const courseStartIdx = (courseCurrentPage - 1) * courseItemsPerPage + 1;
  const courseEndIdx = Math.min(courseCurrentPage * courseItemsPerPage, filteredCourses.length);

  const totalPrograms = colleges.reduce((sum, c) => sum + (c.programs?.length || 0), 0);
  const deansCount = colleges.filter((c) => c.deanEmail).length;

  return (
    <Layout
      title="College Inventory"
      subtitle="Manage colleges, assigned deans, degree programs, and course catalogues"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCardItem label="Total Colleges" value={colleges.length} icon={Building2} color="blue" />
        <StatCardItem label="Active Deans" value={deansCount} icon={UserCheck} color="emerald" />
        <StatCardItem label="Academic Programs" value={totalPrograms} icon={GraduationCap} color="amber" />
        <StatCardItem label="Total Courses" value={courses.length} icon={BookOpen} color="maroon" />
      </div>

      {!viewingCollegeCourses ? (

        /* COLLEGES TABLE VIEW */
        <div className="space-y-4">
          {/* Header & Controls Bar */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-base flex items-center gap-2" style={{ color: '#2B3235' }}>
                  <Building2 size={18} className="text-[#7A0808]" /> Registered Colleges
                </h2>
                <p className="text-xs font-medium mt-0.5 text-gray-500">
                  Manage academic colleges, assigned college deans, degree programs offered, and course catalogues.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAdd}
                className="btn-maroon font-bold flex items-center gap-2 shadow-sm text-xs px-4 py-2.5"
              >
                <Plus size={16} /> Add College
              </button>
            </div>

            {/* Search Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
              <div className="relative flex-1 min-w-[240px]">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-1 focus:ring-[#7A0808] focus:border-[#7A0808] transition-all font-medium"
                  placeholder="Search by college code, name, or programs..."
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

              {/* Rows Per Page Selector */}
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

          {/* Table Grid */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center">
                <p className="text-sm text-gray-400">Loading colleges...</p>
              </div>
            ) : filteredColleges.length === 0 ? (
              <div className="p-12 text-center">
                <GraduationCap size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-semibold text-gray-500 mb-1">
                  {searchQuery ? `No colleges found matching "${searchQuery}"` : 'No colleges added yet'}
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  {searchQuery ? 'Try clearing your search query' : 'Start by adding your first college'}
                </p>
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="btn-outline-maroon text-xs px-4 py-2"
                  >
                    Clear Search
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAdd}
                    className="btn-maroon mx-auto flex items-center gap-2 text-xs"
                  >
                    <Plus size={16} /> Add College
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-100">
                    <tr>
                      <th className="p-3.5 w-12 text-center">#</th>
                      <th className="p-3.5 min-w-[120px]">College Code</th>
                      <th className="p-3.5 min-w-[200px]">College Name</th>
                      <th className="p-3.5 min-w-[180px]">Programs Offered</th>
                      <th className="p-3.5 min-w-[180px]">College Dean</th>
                      <th className="p-3.5 text-center w-36">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {paginatedColleges.map((college, idx) => {
                      const dean = getDeanForCollege(college);

                      return (
                        <tr key={college.id} className="hover:bg-red-50/20 transition-colors">
                          <td className="p-3.5 text-center font-bold text-gray-400">
                            {(currentPage - 1) * itemsPerPage + idx + 1}
                          </td>
                          <td className="p-3.5 font-black text-[#7A0808]">
                            <span className="px-2.5 py-1 bg-red-50 border border-red-100 rounded-lg inline-block">
                              {college.code}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold text-[#2B3235]">
                            {college.name}
                          </td>
                          <td className="p-3.5">
                            {college.programs && college.programs.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {college.programs.map((p, pIdx) => (
                                  <span
                                    key={pIdx}
                                    className="px-2 py-0.5 bg-gray-100 text-gray-700 font-bold text-[10px] rounded-md border border-gray-200"
                                    title={p.name}
                                  >
                                    {p.code}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 italic">None</span>
                            )}
                          </td>
                          {/* College Dean Column */}
                          <td className="p-3.5">
                            {dean ? (
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-[10px] flex-shrink-0"
                                  style={{ background: '#7A0808' }}
                                >
                                  {dean.initials || dean.name?.charAt(0)?.toUpperCase() || 'D'}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-gray-900 text-xs truncate">{dean.name}</p>
                                  <p className="text-[10px] text-gray-500 truncate">{dean.email}</p>
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs italic">Unassigned</span>
                            )}
                          </td>
                          <td className="p-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleViewCourses(college)}
                                className="px-2 py-1 bg-[#7A0808] hover:bg-[#5A0606] text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs"
                                title="Manage courses"
                              >
                                <BookOpen size={12} /> Courses
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEdit(college)}
                                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 hover:text-[#7A0808] transition-colors"
                                title="Edit college & programs"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(college)}
                                className="p-1.5 rounded-lg border border-gray-200 hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
                                title="Delete college"
                              >
                                <Trash2 size={13} />
                              </button>
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
            {filteredColleges.length > 0 && (
              <div className="flex flex-wrap items-center justify-between p-4 border-t border-gray-100 text-xs text-gray-600 gap-3 bg-gray-50/50">
                <span className="font-semibold">
                  Showing <strong className="text-gray-900">{collegeStartIdx}</strong> to{' '}
                  <strong className="text-gray-900">{collegeEndIdx}</strong> of{' '}
                  <strong className="text-gray-900">{filteredColleges.length}</strong> college(s)
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
                    Page {currentPage} of {totalCollegePages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalCollegePages, p + 1))}
                    disabled={currentPage === totalCollegePages}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-bold transition-all shadow-2xs"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* COURSE MANAGEMENT TABLE VIEW */
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              type="button"
              onClick={handleBackToColleges}
              className="text-xs text-[#7A0808] hover:text-[#5A0606] font-bold flex items-center gap-1.5 bg-red-50 hover:bg-red-100/70 border border-red-100 px-3.5 py-2 rounded-xl transition-all"
            >
              ← Back to Colleges
            </button>
            <button
              type="button"
              onClick={handleAddCourse}
              className="btn-maroon text-xs px-4 py-2.5 flex items-center gap-2 font-bold shadow-sm"
            >
              <Plus size={16} /> Add Courses
            </button>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
            <div>
              <h2 className="font-bold text-lg flex items-center gap-2" style={{ color: '#2B3235' }}>
                <BookOpen size={20} className="text-[#7A0808]" /> {viewingCollegeCourses.name} ({viewingCollegeCourses.code})
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Manage course list, semester offerings, year levels, credit units, and course types.
              </p>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-1 focus:ring-[#7A0808] focus:border-[#7A0808] transition-all font-medium"
                  placeholder="Search course code or title..."
                  value={courseSearchQuery}
                  onChange={(e) => setCourseSearchQuery(e.target.value)}
                />
                {courseSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCourseSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Year Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setYearFilter('All')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    yearFilter === 'All'
                      ? 'bg-[#7A0808] text-white shadow-2xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All Years
                </button>
                {YEAR_LEVELS.map((lvl) => {
                  const count = collegeCourses.filter((c) => c.yearLevel === lvl).length;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setYearFilter(lvl)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                        yearFilter === lvl
                          ? 'bg-[#7A0808] text-white shadow-2xs'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {lvl} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Semester Filter Dropdown */}
              <div className="flex items-center gap-2 text-xs text-gray-600 font-semibold">
                <span>Semester:</span>
                <select
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-xs font-bold cursor-pointer text-[#7A0808]"
                >
                  <option value="All">All Semesters</option>
                  {SEMESTERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rows Per Page */}
              <div className="flex items-center gap-2 text-xs text-gray-600 font-semibold">
                <span>Show:</span>
                <select
                  value={courseItemsPerPage}
                  onChange={(e) => setCourseItemsPerPage(Number(e.target.value))}
                  className="px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-xs font-bold cursor-pointer"
                >
                  <option value={5}>5 per page</option>
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                </select>
              </div>
            </div>
          </div>

          {/* Courses Table Grid */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {filteredCourses.length === 0 ? (
              <div className="p-12 text-center">
                <BookOpen size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-semibold text-gray-500 mb-1">
                  {courseSearchQuery || yearFilter !== 'All' || semesterFilter !== 'All'
                    ? 'No courses match your filter criteria'
                    : 'No courses added yet'}
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  {courseSearchQuery || yearFilter !== 'All' || semesterFilter !== 'All'
                    ? 'Try resetting search or filters'
                    : 'Start by adding your first course for this college'}
                </p>
                {courseSearchQuery || yearFilter !== 'All' || semesterFilter !== 'All' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCourseSearchQuery('');
                      setYearFilter('All');
                      setSemesterFilter('All');
                    }}
                    className="btn-outline-maroon text-xs px-4 py-2"
                  >
                    Reset Filters
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddCourse}
                    className="btn-maroon mx-auto flex items-center gap-2 text-xs"
                  >
                    <Plus size={16} /> Add Courses
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-100">
                    <tr>
                      <th className="p-3.5 w-12 text-center">#</th>
                      <th className="p-3.5 min-w-[110px]">Course Code</th>
                      <th className="p-3.5 min-w-[220px]">Course Title</th>
                      <th className="p-3.5 min-w-[100px]">Year Level</th>
                      <th className="p-3.5 min-w-[120px]">Semester</th>
                      <th className="p-3.5 min-w-[80px]">Units</th>
                      <th className="p-3.5 min-w-[130px]">Course Type</th>
                      <th className="p-3.5 text-center w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {paginatedCourses.map((course, idx) => (
                      <tr key={course.id} className="hover:bg-red-50/20 transition-colors">
                        <td className="p-3.5 text-center font-bold text-gray-400">
                          {(courseCurrentPage - 1) * courseItemsPerPage + idx + 1}
                        </td>
                        <td className="p-3.5 font-black text-[#7A0808]">
                          <span className="px-2.5 py-1 bg-red-50 border border-red-100 rounded-lg inline-block">
                            {course.code}
                          </span>
                        </td>
                        <td className="p-3.5 font-bold text-[#2B3235]">
                          {course.title}
                        </td>
                        <td className="p-3.5 font-bold text-gray-700">
                          {course.yearLevel || '1st Year'}
                        </td>
                        <td className="p-3.5 font-bold text-[#7A0808]">
                          <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-[#7A0808] border border-red-100 text-[10px]">
                            {course.semester || '1st Semester'}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 font-bold text-[11px]">
                            {course.units} {course.units === 1 ? 'unit' : 'units'}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-100 font-bold text-[11px] capitalize">
                            {course.type}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEditCourse(course)}
                              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 hover:text-[#7A0808] transition-colors"
                              title="Edit course"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCourse(course)}
                              className="p-1.5 rounded-lg border border-gray-200 hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
                              title="Delete course"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Courses Pagination Controls Footer */}
            {filteredCourses.length > 0 && (
              <div className="flex flex-wrap items-center justify-between p-4 border-t border-gray-100 text-xs text-gray-600 gap-3 bg-gray-50/50">
                <span className="font-semibold">
                  Showing <strong className="text-gray-900">{courseStartIdx}</strong> to{' '}
                  <strong className="text-gray-900">{courseEndIdx}</strong> of{' '}
                  <strong className="text-gray-900">{filteredCourses.length}</strong> course(s)
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCourseCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={courseCurrentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-bold transition-all shadow-2xs"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <span className="px-3 py-1 font-bold text-xs text-gray-800">
                    Page {courseCurrentPage} of {totalCoursePages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCourseCurrentPage((p) => Math.min(totalCoursePages, p + 1))}
                    disabled={courseCurrentPage === totalCoursePages}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-bold transition-all shadow-2xs"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit College Modal */}
      {showAddModal && (
        <AddCollegeModal
          onClose={() => {
            setShowAddModal(false);
            setEditingCollege(null);
          }}
          onSaveSuccess={(code) => {
            setNotification({
              type: 'success',
              title: editingCollege ? 'College Updated!' : 'College Added!',
              message: `College ${code} and its programs/courses have been saved successfully.`,
            });
            setEditingCollege(null);
          }}
          colleges={colleges}
          editingCollege={editingCollege}
        />
      )}

      {/* Add/Edit Course Modal with Individual vs Bulk Add tabs */}
      {showCourseModal && viewingCollegeCourses && (
        <AddCourseModal
          onClose={() => {
            setShowCourseModal(false);
            setEditingCourse(null);
          }}
          collegeCode={viewingCollegeCourses.code}
          collegeName={viewingCollegeCourses.name}
          existingCourses={collegeCourses}
          editingCourse={editingCourse}
          onSaveSuccess={(msg) => {
            setNotification({
              type: 'success',
              title: 'Courses Saved!',
              message: msg || 'Courses have been saved successfully.',
            });
            setEditingCourse(null);
          }}
        />
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

      {/* Confirm Delete Modal */}
      {confirmDialog && (
        <ConfirmModal
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />
      )}
    </Layout>
  );
}
