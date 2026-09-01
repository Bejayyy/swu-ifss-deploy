import React, { useEffect, useState, useMemo } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Clock, Users, Building2, Upload, CheckSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import Layout from '../components/Layout';
import LoadingModal from '../components/modals/LoadingModal';
import NotificationModal from '../components/modals/NotificationModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import AddCourseModal from '../components/modals/AddCourseModal';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { subscribeCollegeCourses, subscribeAllCourses, deleteCourse, batchDeleteCourses } from '../services/courseService';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];

export default function CourseInventory() {
  const { profile } = useAuth();
  const isRegistrar = profile?.role === ROLES.REGISTRAR;
  const isDean = profile?.role === ROLES.DEAN;
  const myCollege = profile?.department || profile?.college;

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [notification, setNotification] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [collegeFilter, setCollegeFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('latest');
  const [selectedCourseIds, setSelectedCourseIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [coursesPerPage, setCoursesPerPage] = useState(10);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);

  // Subscribe to courses
  useEffect(() => {
    setLoading(true);
    if (isDean && myCollege) {
      return subscribeCollegeCourses(
        myCollege,
        (data) => {
          setCourses(data);
          setLoading(false);
        },
        (err) => {
          console.error('Error loading courses:', err);
          setLoading(false);
        }
      );
    } else if (isRegistrar) {
      return subscribeAllCourses(
        (data) => {
          setCourses(data);
          setLoading(false);
        },
        (err) => {
          console.error('Error loading courses:', err);
          setLoading(false);
        }
      );
    } else {
      setLoading(false);
      return () => {};
    }
  }, [isDean, isRegistrar, myCollege]);

  const filteredCourses = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const matches = courses.filter((course) =>
      (!query || [course.code, course.title, course.collegeCode, course.programCode]
        .some((value) => String(value || '').toLowerCase().includes(query))) &&
      (!collegeFilter || course.collegeCode === collegeFilter) &&
      (!programFilter || course.programCode === programFilter) &&
      (!yearFilter || course.yearLevel === yearFilter) &&
      (!semesterFilter || course.semester === semesterFilter)
    );
    const timestamp = (course) => {
      const value = course.createdAt || course.updatedAt;
      if (value?.toMillis) return value.toMillis();
      if (value?.seconds) return value.seconds * 1000;
      const parsed = new Date(value || 0).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return [...matches].sort((a, b) => {
      if (sortOrder === 'latest') return timestamp(b) - timestamp(a);
      if (sortOrder === 'oldest') return timestamp(a) - timestamp(b);
      if (sortOrder === 'code') return String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true });
      if (sortOrder === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
      return 0;
    });
  }, [courses, searchTerm, collegeFilter, programFilter, yearFilter, semesterFilter, sortOrder]);

  const displayedCourses = filteredCourses;
  const totalPages = Math.max(1, Math.ceil(displayedCourses.length / coursesPerPage));
  const pageStartIndex = (currentPage - 1) * coursesPerPage;
  const paginatedCourses = displayedCourses.slice(pageStartIndex, pageStartIndex + coursesPerPage);

  const coursesByYear = useMemo(() => {
    const groups = {};
    YEAR_LEVELS.forEach((year) => {
      groups[year] = paginatedCourses.filter((course) => course.yearLevel === year);
    });
    return groups;
  }, [paginatedCourses]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, collegeFilter, programFilter, yearFilter, semesterFilter, sortOrder, coursesPerPage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const existingIds = new Set(courses.map((course) => course.id));
    setSelectedCourseIds((previous) => new Set([...previous].filter((id) => existingIds.has(id))));
  }, [courses]);

  const allFilteredSelected = filteredCourses.length > 0 && filteredCourses.every((course) => selectedCourseIds.has(course.id));
  const toggleAllFiltered = () => {
    setSelectedCourseIds((previous) => {
      const next = new Set(previous);
      if (allFilteredSelected) filteredCourses.forEach((course) => next.delete(course.id));
      else filteredCourses.forEach((course) => next.add(course.id));
      return next;
    });
  };

  const toggleCourseSelection = (courseId) => {
    setSelectedCourseIds((previous) => {
      const next = new Set(previous);
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId);
      return next;
    });
  };

  const handleBatchDelete = () => {
    const selected = courses.filter((course) => selectedCourseIds.has(course.id));
    if (!selected.length) return;
    setConfirmDialog({
      title: 'Delete Selected Courses',
      message: `Delete ${selected.length} selected course assignment(s)? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setIsLoading(true);
        setLoadingMessage(`Deleting ${selected.length} courses...`);
        try {
          const count = await batchDeleteCourses(selected.map((course) => course.id));
          setSelectedCourseIds(new Set());
          setNotification({ type: 'success', title: 'Courses Deleted', message: `${count} course assignment(s) were removed.` });
        } catch (error) {
          setNotification({ type: 'error', title: 'Batch Delete Failed', message: error.message || 'Some courses could not be deleted.' });
        } finally {
          setIsLoading(false);
        }
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  const filterOptions = useMemo(() => ({
    colleges: [...new Set(courses.map((course) => course.collegeCode).filter(Boolean))].sort(),
    programs: [...new Set(courses
      .filter((course) => !collegeFilter || course.collegeCode === collegeFilter)
      .map((course) => course.programCode).filter(Boolean))].sort(),
    semesters: [...new Set(courses.map((course) => course.semester).filter(Boolean))].sort(),
  }), [courses, collegeFilter]);

  const handleAdd = () => {
    setEditingCourse(null);
    setShowAddModal(true);
  };

  const handleEdit = (course) => {
    setEditingCourse(course);
    setShowAddModal(true);
  };

  const handleDelete = (course) => {
    setConfirmDialog({
      title: 'Delete Course',
      message: `Are you sure you want to delete "${course.code} - ${course.title}"? This action cannot be undone.${
        course.assignedTeacherName ? `\n\nNote: This course is currently assigned to ${course.assignedTeacherName}.` : ''
      }`,
      onConfirm: async () => {
        setIsLoading(true);
        setLoadingMessage('Deleting course...');
        setConfirmDialog(null);

        try {
          await deleteCourse(course.id);
          setNotification({
            type: 'success',
            title: 'Course Deleted!',
            message: `${course.code} has been removed.`,
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

  if (!isDean && !isRegistrar) {
    return (
      <Layout title="Access Denied">
        <div className="text-center py-12">
          <p className="text-gray-500">You do not have permission to access this page.</p>
        </div>
      </Layout>
    );
  }

  const stats = [
    { label: 'Total Courses', value: courses.length, color: 'blue' },
    { label: 'With Teachers', value: courses.filter(c => c.assignedTeacherUid).length, color: 'green' },
    { label: 'Unassigned', value: courses.filter(c => !c.assignedTeacherUid).length, color: 'yellow' },
    { label: 'Year Levels', value: YEAR_LEVELS.length, color: 'purple' },
  ];

  const paginationFooter = displayedCourses.length > 0 && (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-3">
      <p className="text-xs font-semibold text-gray-500">
        Showing {pageStartIndex + 1}–{Math.min(pageStartIndex + coursesPerPage, displayedCourses.length)} of {displayedCourses.length} course assignment(s)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="courses-per-page" className="text-xs font-bold text-gray-600">Rows</label>
        <select
          id="courses-per-page"
          value={coursesPerPage}
          onChange={(event) => setCoursesPerPage(Number(event.target.value))}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-bold text-gray-700 outline-none focus:border-[#7A0808]"
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
        <button type="button" aria-label="Previous course page" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="rounded-lg border border-gray-200 bg-white p-1.5 text-[#7A0808] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /></button>
        <span className="min-w-[72px] text-center text-xs font-black text-[#7A0808]">Page {currentPage} of {totalPages}</span>
        <button type="button" aria-label="Next course page" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="rounded-lg border border-gray-200 bg-white p-1.5 text-[#7A0808] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={15} /></button>
      </div>
    </div>
  );

  return (
    <Layout 
      title="Course Inventory" 
      subtitle={isDean ? `Manage courses for ${myCollege}` : 'Manage courses across all colleges'}
    >
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-black" style={{ color: '#2B3235' }}>{stat.value}</p>
                <p className="text-xs font-bold text-gray-500 mt-1">{stat.label}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                stat.color === 'blue' ? 'bg-blue-100' :
                stat.color === 'green' ? 'bg-green-100' :
                stat.color === 'yellow' ? 'bg-yellow-100' :
                'bg-purple-100'
              }`}>
                <BookOpen size={20} className={
                  stat.color === 'blue' ? 'text-blue-600' :
                  stat.color === 'green' ? 'text-green-600' :
                  stat.color === 'yellow' ? 'text-yellow-600' :
                  'text-purple-600'
                } />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-bold text-base flex items-center gap-2" style={{ color: '#2B3235' }}>
            <BookOpen size={18} /> Course Catalog
          </h2>
          <p className="text-xs font-medium mt-1" style={{ color: '#2B3235', opacity: 0.65 }}>
            Courses organized by year level
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="btn-maroon flex items-center gap-2"
        >
          {isRegistrar ? <Upload size={16} /> : <Plus size={16} />}
          {isRegistrar ? 'Upload Course Spreadsheet' : 'Add Course'}
        </button>
      </div>

      {isRegistrar && (
        <div className="mb-5 grid grid-cols-1 gap-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search code or title..." className="form-input text-xs" />
          <select value={collegeFilter} onChange={(e) => { setCollegeFilter(e.target.value); setProgramFilter(''); }} className="form-input text-xs">
            <option value="">All Colleges</option>{filterOptions.colleges.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className="form-input text-xs">
            <option value="">All Programs</option>{filterOptions.programs.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="form-input text-xs">
            <option value="">All Year Levels</option>{YEAR_LEVELS.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} className="form-input text-xs">
            <option value="">All Semesters</option>{filterOptions.semesters.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="form-input text-xs font-bold">
            <option value="latest">Latest Added</option><option value="oldest">Oldest Added</option><option value="code">Course Code A–Z</option><option value="title">Course Title A–Z</option>
          </select>
        </div>
      )}

      {isRegistrar && selectedCourseIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-black text-[#7A0808]"><CheckSquare size={16} /> {selectedCourseIds.size} course assignment(s) selected</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedCourseIds(new Set())} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600">Clear Selection</button>
            <button type="button" onClick={handleBatchDelete} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-800"><Trash2 size={14} /> Delete Selected</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <p className="text-sm text-gray-400">Loading courses...</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <BookOpen size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-sm font-semibold text-gray-400 mb-2">No courses added yet</p>
          <p className="text-xs text-gray-400 mb-4">Start by adding your first course</p>
          <button
            type="button"
            onClick={handleAdd}
            className="btn-maroon mx-auto flex items-center gap-2"
          >
            <Plus size={16} /> Add Course
          </button>
        </div>
      ) : isRegistrar ? (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-xs">
              <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="w-12 px-4 py-3 text-center"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} aria-label="Select all filtered courses" className="h-4 w-4 accent-[#7A0808]" /></th>
                  <th className="px-4 py-3">Course Code</th><th className="px-4 py-3">Course Title</th>
                  <th className="px-4 py-3">College</th><th className="px-4 py-3">Program</th>
                  <th className="px-4 py-3">Year Level</th><th className="px-4 py-3">Semester</th>
                  <th className="px-4 py-3">Credit Units</th><th className="px-4 py-3">Contact Hours</th>
                  <th className="px-4 py-3">Course Type</th><th className="px-4 py-3">Handled By</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedCourses.map((course) => {
                  const lecUnits = Number(course.lecUnits || 0);
                  const labUnits = Number(course.labUnits || 0);
                  return (
                    <tr key={course.id} className="hover:bg-gray-50/70">
                      <td className="px-4 py-3 text-center"><input type="checkbox" checked={selectedCourseIds.has(course.id)} onChange={() => toggleCourseSelection(course.id)} aria-label={`Select ${course.code}`} className="h-4 w-4 accent-[#7A0808]" /></td>
                      <td className="px-4 py-3 font-black text-[#7A0808]">{course.code}</td>
                      <td className="px-4 py-3 font-bold text-gray-800">{course.title}</td>
                      <td className="px-4 py-3 font-semibold">{course.collegeCode || '—'}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-amber-50 px-2 py-1 font-bold text-amber-800">{course.programCode || '—'}</span></td>
                      <td className="px-4 py-3">{course.yearLevel}</td><td className="px-4 py-3">{course.semester}</td>
                      <td className="px-4 py-3"><b>{Number(course.units || lecUnits + labUnits)} units</b><span className="block text-[10px] text-gray-500">Lec: {lecUnits} · Lab: {labUnits}</span></td>
                      <td className="px-4 py-3"><b>{Number(course.totalHours || 0)} hrs/wk</b><span className="block text-[10px] text-gray-500">Lec: {course.lecHours || 0}h · Lab: {course.labHours || 0}h</span></td>
                      <td className="px-4 py-3 font-bold capitalize">{course.type || (lecUnits && labUnits ? 'both' : labUnits ? 'laboratory' : 'lecture')}</td>
                      <td className="px-4 py-3 text-[10px] leading-relaxed">
                        {course.lecServiceCollege && <span className="block font-bold text-[#7A0808]">Lecture: {course.lecServiceCollege}</span>}
                        {course.labServiceCollege && <span className="block font-bold text-[#7A0808]">Laboratory: {course.labServiceCollege}</span>}
                        {!course.lecServiceCollege && !course.labServiceCollege && <span className="text-gray-500">Internal: {course.collegeCode}</span>}
                      </td>
                      <td className="px-4 py-3"><div className="flex justify-center gap-1"><button type="button" onClick={() => handleEdit(course)} className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-[#7A0808]" title="Edit"><Pencil size={14}/></button><button type="button" onClick={() => handleDelete(course)} className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 size={14}/></button></div></td>
                    </tr>
                  );
                })}
                {filteredCourses.length === 0 && <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-400">No courses match the selected filters.</td></tr>}
              </tbody>
            </table>
          </div>
          {paginationFooter}
        </div>
      ) : (
        <div className="space-y-6">
          {YEAR_LEVELS.map(yearLevel => {
            const yearCourses = coursesByYear[yearLevel];
            if (yearCourses.length === 0) return null;

            return (
              <div key={yearLevel}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-[#7A0808] flex items-center justify-center">
                    <span className="text-white font-black text-xs">{yearLevel.charAt(0)}</span>
                  </div>
                  <h3 className="font-black text-base" style={{ color: '#2B3235' }}>
                    {yearLevel}
                  </h3>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-[6px] bg-[#F59E0B] text-white shadow-2xs">
                    {yearCourses.length} {yearCourses.length === 1 ? 'course' : 'courses'}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {yearCourses.map((course) => (
                    <div
                      key={course.id}
                      className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-black text-sm" style={{ color: '#7A0808' }}>
                              {course.code}
                            </h4>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              course.type === 'lecture' ? 'bg-blue-100 text-blue-700' :
                              course.type === 'laboratory' ? 'bg-green-100 text-green-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {course.type === 'lecture' ? 'LEC' : 
                               course.type === 'laboratory' ? 'LAB' : 
                               'LEC+LAB'}
                            </span>
                          </div>
                          <p className="font-bold text-xs text-gray-900 mb-2">
                            {course.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(course)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-[#7A0808] transition-colors"
                            title="Edit course"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(course)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
                            title="Delete course"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Units Breakdown */}
                      <div className="space-y-1 mb-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 font-semibold">Credit Units:</span>
                          <span className="font-black text-gray-800">
                            {course.units || (Number(course.lecUnits || 0) + Number(course.labUnits || 0)) || 3} units
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-100">
                            Lec: {course.lecUnits !== undefined ? course.lecUnits : (course.type === 'laboratory' ? 0 : (course.units || 3))} u
                          </span>
                          <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 font-bold border border-green-100">
                            Lab: {course.labUnits !== undefined ? course.labUnits : (course.type === 'laboratory' ? (course.units || 3) : 0)} u
                          </span>
                        </div>
                      </div>

                      {/* Required Contact Hours */}
                      <div className="space-y-1 mb-3 pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 font-semibold flex items-center gap-1">
                            <Clock size={11} className="text-amber-600" /> Required Time:
                          </span>
                          <span className="font-black text-amber-900">
                            {course.totalHours || (
                              (course.lecHours !== undefined ? Number(course.lecHours) : (Number(course.lecUnits || 3) * 1)) +
                              (course.labHours !== undefined ? Number(course.labHours) : (Number(course.labUnits || 0) * 3))
                            )} hrs/wk
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold border border-amber-200">
                            Lec: {course.lecHours !== undefined ? course.lecHours : (Number(course.lecUnits !== undefined ? course.lecUnits : 3) * 1)}h
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold border border-amber-200">
                            Lab: {course.labHours !== undefined ? course.labHours : (Number(course.labUnits !== undefined ? course.labUnits : 0) * 3)}h
                          </span>
                        </div>
                      </div>

                      {/* Teacher Assignment */}
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {course.assignedTeacherName ? (
                          <div className="flex items-center gap-2">
                            <Users size={12} className="text-green-600" />
                            <span className="text-xs font-medium text-gray-700">
                              {course.assignedTeacherName}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Users size={12} className="text-gray-400" />
                            <span className="text-xs font-medium text-gray-400">
                              No teacher assigned
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Service College Badge */}
                      {(course.lecServiceCollege || course.labServiceCollege) && (
                        <div className="mt-2.5 pt-2 border-t border-indigo-100 text-[10px] flex items-center gap-1.5 font-bold text-indigo-900 bg-indigo-50/70 px-2.5 py-1 rounded-lg">
                          <Building2 size={12} className="text-indigo-700 shrink-0" />
                          <span>
                            Serviced by:{' '}
                            {course.lecServiceCollege && course.labServiceCollege
                              ? (course.lecServiceCollege === course.labServiceCollege
                                  ? `${course.lecServiceCollege} (Lec & Lab)`
                                  : `Lec: ${course.lecServiceCollege} · Lab: ${course.labServiceCollege}`)
                              : (course.lecServiceCollege ? `Lec: ${course.lecServiceCollege}` : `Lab: ${course.labServiceCollege}`)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {paginationFooter}
          </div>
        </div>
      )}

      {/* Add/Edit Course Modal using unified AddCourseModal */}
      {showAddModal && (
        <AddCourseModal
          onClose={() => {
            setShowAddModal(false);
            setEditingCourse(null);
          }}
          collegeCode={editingCourse?.collegeCode || myCollege || ''}
          collegeName={editingCourse?.collegeCode || profile?.department || profile?.college || (isRegistrar ? 'Central Course Inventory' : 'College')}
          existingCourses={courses}
          centralized={isRegistrar && !editingCourse}
          editingCourse={editingCourse}
          onSaveSuccess={(msg) => {
            setNotification({
              type: 'success',
              title: 'Success!',
              message: msg,
            });
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
          confirmStyle="danger"
        />
      )}
    </Layout>
  );
}
