import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  Users,
  Save,
  Hash,
} from 'lucide-react';
import Layout from '../components/Layout';
import { StatCardItem } from '../components/ProgressStatCards';
import LoadingModal from '../components/modals/LoadingModal';

import NotificationModal from '../components/modals/NotificationModal';
import CustomSelect from '../components/ui/CustomSelect';
import ConfirmModal from '../components/modals/ConfirmModal';
import AddCollegeModal from '../components/modals/AddCollegeModal';
import AddCourseModal from '../components/modals/AddCourseModal';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { subscribeColleges, deleteCollege } from '../services/collegeService';
import { subscribeCollegeCourses, deleteCourse } from '../services/courseService';
import { subscribeStaffUsers } from '../services/systemUserService';
import {
  subscribeProgramSections,
  upsertProgramYearSections,
  generateSectionNames,
  getYearLabel,
} from '../services/sectionService';

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

  // College drill-down tab state
  const [activeCollegeTab, setActiveCollegeTab] = useState('courses'); // 'courses' | 'sections'

  // Course management states
  const [viewingCollegeCourses, setViewingCollegeCourses] = useState(null);
  const [collegeCourses, setCollegeCourses] = useState([]);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [courseProgramFilter, setCourseProgramFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [semesterFilter, setSemesterFilter] = useState('All');
  const [courseCurrentPage, setCourseCurrentPage] = useState(1);
  const [courseItemsPerPage, setCourseItemsPerPage] = useState(5);

  // Sections management states
  const [selectedSectionProgram, setSelectedSectionProgram] = useState(null); // { code, name }
  const [programSectionRows, setProgramSectionRows] = useState([]); // from Firestore
  const [sectionDraftCounts, setSectionDraftCounts] = useState({}); // yearNumber -> count (draft)
  const [savingSectionYear, setSavingSectionYear] = useState(null); // yearNumber being saved
  const [extraYears, setExtraYears] = useState([]); // additional years beyond 4 added by registrar

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
  }, [courseSearchQuery, courseProgramFilter, yearFilter, semesterFilter, courseItemsPerPage]);

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
      const matchesProg =
        courseProgramFilter === 'All' ||
        String(c.programCode || '').trim().toUpperCase() === courseProgramFilter.toUpperCase() ||
        (!c.programCode && viewingCollegeCourses?.programs?.length === 1);
      if (!matchesProg) return false;

      const matchesYear = yearFilter === 'All' || c.yearLevel === yearFilter;
      const matchesSem = semesterFilter === 'All' || (c.semester || '1st Semester') === semesterFilter;
      if (!matchesYear || !matchesSem) return false;

      if (!courseSearchQuery.trim()) return true;
      const q = courseSearchQuery.toLowerCase().trim();
      return (
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.title && c.title.toLowerCase().includes(q)) ||
        (c.programCode && c.programCode.toLowerCase().includes(q))
      );
    });
  }, [collegeCourses, courseProgramFilter, yearFilter, semesterFilter, courseSearchQuery, viewingCollegeCourses]);

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
    setActiveCollegeTab('courses');
    setCourseSearchQuery('');
    setCourseProgramFilter('All');
    setYearFilter('All');
    setSemesterFilter('All');
    // Reset sections state
    setSelectedSectionProgram(null);
    setProgramSectionRows([]);
    setSectionDraftCounts({});
    setExtraYears([]);
  };

  const handleBackToColleges = () => {
    setViewingCollegeCourses(null);
    setCollegeCourses([]);
    setSelectedSectionProgram(null);
    setProgramSectionRows([]);
    setSectionDraftCounts({});
    setExtraYears([]);
  };

  // Subscribe to sections when program is selected
  useEffect(() => {
    if (!selectedSectionProgram) {
      setProgramSectionRows([]);
      setSectionDraftCounts({});
      setExtraYears([]);
      return () => {};
    }
    return subscribeProgramSections(
      selectedSectionProgram.code,
      (rows) => {
        setProgramSectionRows(rows);
        // Sync draft counts from Firestore (don't overwrite user's in-progress edits)
        setSectionDraftCounts((prev) => {
          const next = { ...prev };
          rows.forEach((r) => {
            // Only set if not already in draft (don't overwrite user edits)
            if (next[r.yearNumber] === undefined) {
              next[r.yearNumber] = r.sectionCount;
            }
          });
          return next;
        });
        // Determine extra years (beyond year 4) that are already saved
        const savedExtraYears = rows
          .filter((r) => r.yearNumber > 4)
          .map((r) => r.yearNumber)
          .filter((y) => ![...Array(4)].map((_, i) => i + 1).includes(y));
        setExtraYears((prev) => {
          const merged = Array.from(new Set([...savedExtraYears, ...prev]));
          return merged.sort((a, b) => a - b);
        });
      },
      (err) => console.error('Error loading program sections:', err)
    );
  }, [selectedSectionProgram]);

  // Save section count for a specific year
  const handleSaveSectionYear = useCallback(async (yearNumber) => {
    if (!selectedSectionProgram || !viewingCollegeCourses) return;
    const count = Number(sectionDraftCounts[yearNumber]) || 0;
    setSavingSectionYear(yearNumber);
    try {
      await upsertProgramYearSections(
        viewingCollegeCourses.code,
        selectedSectionProgram.code,
        yearNumber,
        count
      );
      setNotification({
        type: 'success',
        title: 'Sections Saved',
        message: `${getYearLabel(yearNumber)} sections for ${selectedSectionProgram.code} saved successfully.`,
      });
    } catch (err) {
      setNotification({ type: 'error', title: 'Save Failed', message: err.message });
    } finally {
      setSavingSectionYear(null);
    }
  }, [selectedSectionProgram, viewingCollegeCourses, sectionDraftCounts]);

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
        <StatCardItem label="Total Courses" value={viewingCollegeCourses ? collegeCourses.length : 0} icon={BookOpen} color="maroon" />
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
                <div className="w-[125px]">
                  <CustomSelect
                    value={`${itemsPerPage} per page`}
                    onChange={(e) => {
                      const val = Number(String(e.target.value).split(' ')[0]);
                      if (val) setItemsPerPage(val);
                    }}
                    options={[
                      { value: '5 per page', label: '5 per page' },
                      { value: '10 per page', label: '10 per page' },
                      { value: '20 per page', label: '20 per page' },
                      { value: '50 per page', label: '50 per page' },
                    ]}
                  />
                </div>
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
                                    className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 font-bold text-[11px] rounded-full border border-gray-200 leading-none"
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
                                onClick={() => { handleViewCourses(college); setActiveCollegeTab('courses'); }}
                                className="btn-table-action btn-table-action-maroon"
                                title="Manage courses"
                              >
                                <BookOpen size={13} /> Courses
                              </button>
                              <button
                                type="button"
                                onClick={() => { handleViewCourses(college); setActiveCollegeTab('sections'); }}
                                className="btn-table-action" style={{ color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe' }}
                                title="Manage sections"
                              >
                                <Users size={13} /> Sections
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEdit(college)}
                                className="btn-table-action-icon"
                                title="Edit college & programs"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(college)}
                                className="btn-delete-icon"
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
        /* COURSE / SECTIONS DRILL-DOWN VIEW */
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              type="button"
              onClick={handleBackToColleges}
              className="text-xs text-[#7A0808] hover:text-[#5A0606] font-bold flex items-center gap-1.5 bg-red-50 hover:bg-red-100/70 border border-red-100 px-3.5 py-2 rounded-xl transition-all"
            >
              ← Back to Colleges
            </button>
            {activeCollegeTab === 'courses' && (
              <button
                type="button"
                onClick={handleAddCourse}
                className="btn-maroon text-xs px-4 py-2.5 flex items-center gap-2 font-bold shadow-sm"
              >
                <Plus size={16} /> Add Courses
              </button>
            )}
          </div>

          {/* Tab Switcher */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            <button
              type="button"
              onClick={() => setActiveCollegeTab('courses')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeCollegeTab === 'courses'
                  ? 'bg-white text-[#7A0808] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <BookOpen size={13} /> Courses
            </button>
            <button
              type="button"
              onClick={() => setActiveCollegeTab('sections')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeCollegeTab === 'sections'
                  ? 'bg-white text-[#7A0808] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users size={13} /> Sections
            </button>
          </div>

            {/* ── COURSES TAB ── */}
          {activeCollegeTab === 'courses' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
                <div>
                  <h2 className="font-bold text-lg flex items-center gap-2" style={{ color: '#2B3235' }}>
                    <BookOpen size={20} className="text-[#7A0808]" /> {viewingCollegeCourses.name} ({viewingCollegeCourses.code})
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Manage course list, semester offerings, year levels, credit units, and course types.
                  </p>
                </div>

                {/* Program Filter Bar (if college has programs) */}
                {viewingCollegeCourses.programs?.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 bg-gray-50/60 p-3 rounded-xl border">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                        <GraduationCap size={16} className="text-[#7A0808]" /> Degree Program:
                      </span>
                      <div className="min-w-[260px]">
                        <CustomSelect
                          value={courseProgramFilter}
                          onChange={(e) => {
                            setCourseProgramFilter(e.target.value);
                            setCourseCurrentPage(1);
                          }}
                          options={[
                            { value: 'All', label: `All Programs (${collegeCourses.length} total courses)` },
                            ...(viewingCollegeCourses.programs || []).map((p) => {
                              const pCount = collegeCourses.filter(
                                (c) => String(c.programCode || '').trim().toUpperCase() === p.code.toUpperCase()
                              ).length;
                              return {
                                value: p.code,
                                label: `${p.code} — ${p.name || p.code} (${pCount})`,
                              };
                            }),
                          ]}
                          placeholder="Filter by Program"
                        />
                      </div>
                    </div>

                    {/* Quick Program Pills */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setCourseProgramFilter('All');
                          setCourseCurrentPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          courseProgramFilter === 'All'
                            ? 'bg-[#7A0808] text-white shadow-2xs'
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        All ({collegeCourses.length})
                      </button>
                      {viewingCollegeCourses.programs.map((p) => {
                        const isSelected = courseProgramFilter === p.code;
                        const pCount = collegeCourses.filter(
                          (c) => String(c.programCode || '').trim().toUpperCase() === p.code.toUpperCase()
                        ).length;
                        return (
                          <button
                            key={p.code}
                            type="button"
                            onClick={() => {
                              setCourseProgramFilter(p.code);
                              setCourseCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#7A0808] text-white shadow-2xs'
                                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                            title={`${p.code} - ${p.name}`}
                          >
                            {p.code} ({pCount})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                      const count = collegeCourses.filter((c) => {
                        const matchesProg =
                          courseProgramFilter === 'All' ||
                          String(c.programCode || '').trim().toUpperCase() === courseProgramFilter.toUpperCase() ||
                          (!c.programCode && viewingCollegeCourses?.programs?.length === 1);
                        return matchesProg && c.yearLevel === lvl;
                      }).length;

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
                    <div className="w-[145px]">
                      <CustomSelect
                        value={semesterFilter}
                        onChange={(e) => setSemesterFilter(e.target.value)}
                        options={['All Semesters', ...SEMESTERS]}
                        placeholder="All Semesters"
                      />
                    </div>
                  </div>

                  {/* Rows Per Page */}
                  <div className="flex items-center gap-2 text-xs text-gray-600 font-semibold">
                    <span>Show:</span>
                    <div className="w-[125px]">
                      <CustomSelect
                        value={`${courseItemsPerPage} per page`}
                        onChange={(e) => {
                          const val = Number(String(e.target.value).split(' ')[0]);
                          if (val) setCourseItemsPerPage(val);
                        }}
                        options={[
                          { value: '5 per page', label: '5 per page' },
                          { value: '10 per page', label: '10 per page' },
                          { value: '20 per page', label: '20 per page' },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Courses Table Grid */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {filteredCourses.length === 0 ? (
                  <div className="p-12 text-center">
                    <BookOpen size={48} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-500 mb-1">
                      {courseSearchQuery || courseProgramFilter !== 'All' || yearFilter !== 'All' || semesterFilter !== 'All'
                        ? 'No courses match your filter criteria'
                        : 'No courses added yet'}
                    </p>
                    <p className="text-xs text-gray-400 mb-4">
                      {courseSearchQuery || courseProgramFilter !== 'All' || yearFilter !== 'All' || semesterFilter !== 'All'
                        ? 'Try resetting search or filters'
                        : 'Start by adding your first course for this college'}
                    </p>
                    {courseSearchQuery || courseProgramFilter !== 'All' || yearFilter !== 'All' || semesterFilter !== 'All' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCourseSearchQuery('');
                          setCourseProgramFilter('All');
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
                          <th className="p-3.5 min-w-[200px]">Course Title</th>
                          <th className="p-3.5 min-w-[110px]">Program</th>
                          <th className="p-3.5 min-w-[100px]">Year Level</th>
                          <th className="p-3.5 min-w-[120px]">Semester</th>
                          <th className="p-3.5 min-w-[80px]">Units</th>
                          <th className="p-3.5 min-w-[120px]">Course Type</th>
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
                            <td className="p-3.5 font-bold">
                              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-black">
                                {course.programCode || viewingCollegeCourses.code}
                              </span>
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
                                  className="btn-delete-icon"
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
      )} {/* end courses tab */}

          {/* ── SECTIONS TAB ── */}
          {activeCollegeTab === 'sections' && (
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-5">
              <div>
                <h2 className="font-bold text-lg flex items-center gap-2" style={{ color: '#2B3235' }}>
                  <Users size={20} className="text-[#7A0808]" /> Sections — {viewingCollegeCourses.name}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Define the number of sections per year level for each program. Section names are auto-generated.
                </p>
              </div>

              {/* Program Picker */}
              {viewingCollegeCourses.programs?.length > 0 ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100">
                    <span className="text-xs font-bold text-gray-600">Program:</span>
                    <div className="w-[260px]">
                      <CustomSelect
                        value={selectedSectionProgram?.code || ''}
                        onChange={(e) => {
                          const code = e.target.value;
                          const prog = viewingCollegeCourses.programs?.find((p) => p.code === code);
                          if (prog) {
                            setSelectedSectionProgram({ code: prog.code, name: prog.name });
                            setSectionDraftCounts({});
                            setExtraYears([]);
                          } else {
                            setSelectedSectionProgram(null);
                          }
                        }}
                        options={[
                          { value: '', label: '— Select a Program —' },
                          ...(viewingCollegeCourses.programs || []).map((p) => ({
                            value: p.code,
                            label: `${p.code} — ${p.name}`,
                          })),
                        ]}
                      />
                    </div>
                  </div>

                  {selectedSectionProgram ? (
                    <div className="space-y-3">
                      {/* Year rows: 1–4 default + extra years */}
                      {[1, 2, 3, 4, ...extraYears].map((yearNum) => {
                        const savedRow = programSectionRows.find((r) => r.yearNumber === yearNum);
                        const rawDraft = sectionDraftCounts[yearNum];
                        const count = rawDraft !== undefined && rawDraft !== '' 
                          ? Number(rawDraft) 
                          : (savedRow?.sectionCount ?? 0);
                        const displayVal = rawDraft !== undefined ? rawDraft : (savedRow?.sectionCount !== undefined ? String(savedRow.sectionCount) : '');
                        const preview = count > 0 && selectedSectionProgram?.code
                          ? generateSectionNames(selectedSectionProgram.code, yearNum, count)
                          : [];
                        const isSaving = savingSectionYear === yearNum;

                        return (
                          <div
                            key={yearNum}
                            className="flex flex-wrap items-start gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100"
                          >
                            {/* Year label */}
                            <div className="w-24 flex-shrink-0 pt-1">
                              <span className="text-xs font-black text-[#7A0808]">{getYearLabel(yearNum)}</span>
                            </div>

                            {/* Section count input */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-600">Sections:</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={displayVal}
                                onChange={(e) => {
                                  const clean = e.target.value.replace(/[^0-9]/g, '');
                                  const formatted = clean === '' ? '' : String(parseInt(clean, 10));
                                  setSectionDraftCounts((prev) => ({
                                    ...prev,
                                    [yearNum]: formatted,
                                  }));
                                }}
                                className="w-16 text-center text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-[#7A0808] focus:border-[#7A0808] font-bold"
                                placeholder="0"
                              />
                            </div>

                            {/* Section name preview chips */}
                            <div className="flex-1 flex flex-wrap gap-1 min-w-0">
                              {preview.length > 0 ? (
                                preview.map((name) => (
                                  <span
                                    key={name}
                                    className="px-2 py-0.5 rounded-full bg-[#7A0808]/10 text-[#7A0808] border border-[#7A0808]/20 text-[10px] font-bold"
                                  >
                                    {name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-gray-400 italic pt-1">No sections — set count above</span>
                              )}
                            </div>

                            {/* Save button */}
                            <button
                              type="button"
                              onClick={() => handleSaveSectionYear(yearNum)}
                              disabled={isSaving}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#7A0808] text-white hover:bg-[#5A0606] disabled:opacity-50 transition-all flex-shrink-0"
                            >
                              <Save size={12} />
                              {isSaving ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        );
                      })}

                      {/* Add Year button */}
                      <button
                        type="button"
                        onClick={() => {
                          const nextYear = Math.max(4, ...[...extraYears]) + 1;
                          if (nextYear <= 7) setExtraYears((prev) => [...prev, nextYear]);
                        }}
                        disabled={extraYears.length >= 3} // max year 7
                        className="flex items-center gap-2 text-xs font-bold text-[#7A0808] border border-dashed border-[#7A0808]/40 rounded-xl px-4 py-2.5 hover:bg-red-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed w-full justify-center"
                      >
                        <Plus size={14} /> Add Year Level (e.g. 5th Year)
                      </button>
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <Hash size={36} className="mx-auto mb-2 text-gray-300" />
                      <p className="text-sm font-semibold text-gray-400">Select a program above to manage its sections</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8 text-center">
                  <GraduationCap size={36} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-400">No programs in this college yet</p>
                  <p className="text-xs text-gray-400 mt-1">Add programs to this college first, then manage their sections here.</p>
                </div>
              )}
            </div>
          )} {/* end sections tab */}

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
          programs={viewingCollegeCourses.programs || []}
          defaultProgramCode={
            courseProgramFilter !== 'All'
              ? courseProgramFilter
              : (viewingCollegeCourses.programs?.[0]?.code || '')
          }
          existingCourses={collegeCourses}
          editingCourse={editingCourse}
          onSaveSuccess={(msg) => {
            setNotification({
              type: 'success',
              title: editingCourse ? 'Course Updated!' : 'Courses Saved!',
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
