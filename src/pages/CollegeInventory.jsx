import React, { useEffect, useState } from 'react';
import { GraduationCap, Plus, Pencil, Trash2, Building2, X, BookOpen } from 'lucide-react';
import Layout from '../components/Layout';
import LoadingModal from '../components/modals/LoadingModal';
import NotificationModal from '../components/modals/NotificationModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { subscribeColleges, addCollege, updateCollege, deleteCollege } from '../services/collegeService';
import { subscribeCollegeCourses, addCourse, updateCourse, deleteCourse } from '../services/courseService';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
const COURSE_TYPES = [
  { value: 'lecture', label: 'Lecture Only' },
  { value: 'laboratory', label: 'Laboratory Only' },
  { value: 'both', label: 'Both (Lecture & Laboratory)' },
];

export default function CollegeInventory() {
  const { profile } = useAuth();
  const isRegistrar = profile?.role === ROLES.REGISTRAR;

  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [notification, setNotification] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCollege, setEditingCollege] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [formError, setFormError] = useState('');

  // Course management states
  const [viewingCollegeCourses, setViewingCollegeCourses] = useState(null);
  const [collegeCourses, setCollegeCourses] = useState([]);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseForm, setCourseForm] = useState({
    code: '',
    title: '',
    type: 'lecture',
    yearLevel: '1st Year',
    units: '',
    description: '',
  });
  const [courseError, setCourseError] = useState('');

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

  const resetForm = () => {
    setForm({ code: '', name: '', description: '' });
    setFormError('');
    setEditingCollege(null);
  };

  const handleAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleEdit = (college) => {
    setForm({
      code: college.code,
      name: college.name,
      description: college.description || '',
    });
    setEditingCollege(college);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    setFormError('');

    if (!form.code.trim() || !form.name.trim()) {
      setFormError('College code and name are required.');
      return;
    }

    // Check for duplicate code (only when adding or changing code)
    if (!editingCollege || editingCollege.code !== form.code) {
      const duplicate = colleges.find(c => c.code.toLowerCase() === form.code.trim().toLowerCase());
      if (duplicate) {
        setFormError('A college with this code already exists.');
        return;
      }
    }

    setIsLoading(true);
    setLoadingMessage(editingCollege ? 'Updating college...' : 'Adding college...');
    setShowAddModal(false);

    try {
      if (editingCollege) {
        await updateCollege(editingCollege.id, {
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          description: form.description.trim(),
        });
        setNotification({
          type: 'success',
          title: 'College Updated!',
          message: `${form.name} has been successfully updated.`,
        });
      } else {
        await addCollege({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          description: form.description.trim(),
        });
        setNotification({
          type: 'success',
          title: 'College Added!',
          message: `${form.name} has been successfully added.`,
        });
      }
      resetForm();
    } catch (err) {
      console.error('Error saving college:', err);
      setNotification({
        type: 'error',
        title: 'Failed to Save College',
        message: err.message || 'An error occurred while saving the college.',
      });
    } finally {
      setIsLoading(false);
    }
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
  };

  const handleBackToColleges = () => {
    setViewingCollegeCourses(null);
    setCollegeCourses([]);
  };

  const resetCourseForm = () => {
    setCourseForm({
      code: '',
      title: '',
      type: 'lecture',
      yearLevel: '1st Year',
      units: '',
      description: '',
    });
    setCourseError('');
    setEditingCourse(null);
  };

  const handleAddCourse = () => {
    resetCourseForm();
    setShowCourseModal(true);
  };

  const handleEditCourse = (course) => {
    setCourseForm({
      code: course.code,
      title: course.title,
      type: course.type,
      yearLevel: course.yearLevel,
      units: course.units.toString(),
      description: course.description || '',
    });
    setEditingCourse(course);
    setShowCourseModal(true);
  };

  const handleSaveCourse = async () => {
    setCourseError('');

    if (!courseForm.code.trim()) {
      setCourseError('Course code is required.');
      return;
    }
    if (!courseForm.title.trim()) {
      setCourseError('Course title is required.');
      return;
    }
    if (!courseForm.units) {
      setCourseError('Units are required.');
      return;
    }

    const units = parseFloat(courseForm.units);
    if (isNaN(units) || units <= 0) {
      setCourseError('Units must be a positive number.');
      return;
    }

    const targetCollegeCode = viewingCollegeCourses?.code || '';
    if (!targetCollegeCode) {
      setCourseError('Active college code is missing. Please select a college first.');
      return;
    }

    // Check for duplicate code within the same college
    if (!editingCourse || (editingCourse.code || '').toUpperCase() !== courseForm.code.trim().toUpperCase()) {
      const duplicate = collegeCourses.find(
        (c) => (c.code || '').trim().toUpperCase() === courseForm.code.trim().toUpperCase()
      );
      if (duplicate) {
        setCourseError(`A course with code "${courseForm.code.trim().toUpperCase()}" already exists in ${targetCollegeCode}.`);
        return;
      }
    }

    setIsLoading(true);
    setLoadingMessage(editingCourse ? 'Updating course...' : 'Adding course...');

    try {
      const courseData = {
        code: courseForm.code.trim().toUpperCase(),
        title: courseForm.title.trim(),
        type: courseForm.type || 'lecture',
        yearLevel: courseForm.yearLevel || '1st Year',
        units,
        description: (courseForm.description || '').trim(),
        collegeCode: targetCollegeCode.trim().toUpperCase(),
      };

      if (editingCourse) {
        await updateCourse(editingCourse.id, courseData);
        setNotification({
          type: 'success',
          title: 'Course Updated!',
          message: `${courseData.code} - ${courseData.title} has been updated successfully.`,
        });
      } else {
        await addCourse(courseData);
        setNotification({
          type: 'success',
          title: 'Course Added!',
          message: `${courseData.code} - ${courseData.title} has been added to ${targetCollegeCode}.`,
        });
      }
      setShowCourseModal(false);
      resetCourseForm();
    } catch (err) {
      console.error('Error saving course:', err);
      setCourseError(err.message || 'An error occurred while saving the course.');
    } finally {
      setIsLoading(false);
    }
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

  // Group courses by year level
  const coursesByYear = YEAR_LEVELS.reduce((acc, year) => {
    acc[year] = collegeCourses.filter(c => c.yearLevel === year);
    return acc;
  }, {});

  if (!isRegistrar) {
    return (
      <Layout title="Access Denied">
        <div className="text-center py-12">
          <p className="text-gray-500">You do not have permission to access this page.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout 
      title="College Inventory" 
      subtitle="Manage colleges and departments in the institution"
    >
      {!viewingCollegeCourses ? (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-bold text-base flex items-center gap-2" style={{ color: '#2B3235' }}>
                <Building2 size={18} /> Registered Colleges
              </h2>
              <p className="text-xs font-medium mt-1" style={{ color: '#2B3235', opacity: 0.65 }}>
                Add and manage colleges that will appear in user assignment dropdowns
              </p>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              className="btn-maroon flex items-center gap-2"
            >
              <Plus size={16} /> Add College
            </button>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl p-12 text-center">
              <p className="text-sm text-gray-400">Loading colleges...</p>
            </div>
          ) : colleges.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center">
              <GraduationCap size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-sm font-semibold text-gray-400 mb-2">No colleges added yet</p>
              <p className="text-xs text-gray-400 mb-4">Start by adding your first college</p>
              <button
                type="button"
                onClick={handleAdd}
                className="btn-maroon mx-auto flex items-center gap-2"
              >
                <Plus size={16} /> Add College
              </button>
            </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {colleges.map((college) => (
            <div
              key={college.id}
              className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-[#800000]/10 flex items-center justify-center">
                    <GraduationCap size={20} className="text-[#800000]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm" style={{ color: '#2B3235' }}>
                      {college.code}
                    </h3>
                    <p className="text-[10px] text-gray-500 font-medium">College Code</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(college)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-[#800000] transition-colors"
                    title="Edit college"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(college)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
                    title="Delete college"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              
              <h4 className="font-bold text-base mb-2" style={{ color: '#2B3235' }}>
                {college.name}
              </h4>
              
              {college.description && (
                <p className="text-xs text-gray-600 leading-relaxed mb-3">
                  {college.description}
                </p>
              )}
              
              <button
                type="button"
                onClick={() => handleViewCourses(college)}
                className="w-full py-2 px-3 mb-3 rounded-xl bg-[#800000] hover:bg-[#600000] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <BookOpen size={14} /> Manage Courses
              </button>
              
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[10px]">
                <span className="text-gray-500 font-medium">
                  Added {new Date(college.createdAt).toLocaleDateString()}
                </span>
                <span className="px-2 py-1 rounded-full bg-green-50 text-green-700 font-bold">
                  Active
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      ) : (
        /* Course Management View */
        <>
          <div className="mb-6">
            <button
              type="button"
              onClick={handleBackToColleges}
              className="text-sm text-gray-600 hover:text-[#800000] font-semibold mb-4 flex items-center gap-2"
            >
              ← Back to Colleges
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-xl flex items-center gap-2" style={{ color: '#2B3235' }}>
                  <BookOpen size={20} /> {viewingCollegeCourses.name} - Courses
                </h2>
                <p className="text-xs font-medium mt-1" style={{ color: '#2B3235', opacity: 0.65 }}>
                  Manage courses for {viewingCollegeCourses.code}, organized by year level
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddCourse}
                className="btn-maroon flex items-center gap-2"
              >
                <Plus size={16} /> Add Course
              </button>
            </div>
          </div>

          {collegeCourses.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center">
              <BookOpen size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-sm font-semibold text-gray-400 mb-2">No courses added yet</p>
              <p className="text-xs text-gray-400 mb-4">Start by adding courses for this college</p>
              <button
                type="button"
                onClick={handleAddCourse}
                className="btn-maroon mx-auto flex items-center gap-2"
              >
                <Plus size={16} /> Add Course
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {YEAR_LEVELS.map((yearLevel) => {
                const yearCourses = coursesByYear[yearLevel];
                if (yearCourses.length === 0) return null;

                return (
                  <div key={yearLevel} className="bg-white rounded-2xl p-6">
                    <h3 className="font-bold text-base mb-4 flex items-center gap-2" style={{ color: '#2B3235' }}>
                      {yearLevel}
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#800000]/10 text-[#800000]">
                        {yearCourses.length} {yearCourses.length === 1 ? 'course' : 'courses'}
                      </span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {yearCourses.map((course) => (
                        <div
                          key={course.id}
                          className="p-4 border border-gray-200 rounded-xl hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-bold text-sm mb-1" style={{ color: '#2B3235' }}>
                                {course.code}
                              </h4>
                              <p className="text-xs font-semibold text-gray-700 mb-2">
                                {course.title}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditCourse(course)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-[#800000] transition-colors"
                                title="Edit course"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCourse(course)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
                                title="Delete course"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-bold">
                              {course.units} {course.units === 1 ? 'unit' : 'units'}
                            </span>
                            <span className="text-[10px] px-2 py-1 rounded-full bg-purple-50 text-purple-700 font-bold capitalize">
                              {course.type}
                            </span>
                          </div>

                          {course.description && (
                            <p className="text-[10px] text-gray-600 leading-relaxed">
                              {course.description}
                            </p>
                          )}

                          {course.assignedTeacherName && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-[10px] text-gray-500 mb-1">Assigned to:</p>
                              <p className="text-xs font-semibold text-[#800000]">
                                {course.assignedTeacherName}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Add/Edit College Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-modal-pop">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-black text-lg" style={{ color: '#2B3235' }}>
                  {editingCollege ? 'Edit College' : 'Add New College'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {editingCollege ? 'Update college information' : 'Add a new college to the system'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs font-semibold text-red-700">{formError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  College Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., CAS, CEIT, CON"
                  className="input-field w-full"
                  maxLength={10}
                  autoFocus
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Short code for the college (e.g., CAS for College of Arts and Sciences)
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  College Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., College of Arts and Sciences"
                  className="input-field w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  Description (Optional)
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of the college..."
                  className="input-field w-full"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-6 mt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!form.code.trim() || !form.name.trim()}
                className="btn-maroon flex-1 flex items-center justify-center gap-2"
              >
                <Plus size={16} /> {editingCollege ? 'Update College' : 'Add College'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Course Modal */}
      {showCourseModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-modal-pop max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-black text-lg" style={{ color: '#2B3235' }}>
                  {editingCourse ? 'Edit Course' : 'Add New Course'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {editingCourse ? 'Update course information' : `Add a course to ${viewingCollegeCourses.name}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCourseModal(false);
                  resetCourseForm();
                }}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {courseError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs font-semibold text-red-700">{courseError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  Course Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={courseForm.code}
                  onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., CS101, MATH101"
                  className="input-field w-full"
                  maxLength={20}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  Course Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={courseForm.title}
                  onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                  placeholder="e.g., Introduction to Computer Science"
                  className="input-field w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                    Year Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={courseForm.yearLevel}
                    onChange={(e) => setCourseForm({ ...courseForm, yearLevel: e.target.value })}
                    className="input-field w-full"
                  >
                    {YEAR_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                    Units <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={courseForm.units}
                    onChange={(e) => setCourseForm({ ...courseForm, units: e.target.value })}
                    placeholder="3"
                    className="input-field w-full"
                    min="0"
                    step="0.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  Course Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={courseForm.type}
                  onChange={(e) => setCourseForm({ ...courseForm, type: e.target.value })}
                  className="input-field w-full"
                >
                  {COURSE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500 mt-1">
                  Select whether this course has lecture, laboratory, or both components
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  Description (Optional)
                </label>
                <textarea
                  value={courseForm.description}
                  onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                  placeholder="Brief description of the course..."
                  className="input-field w-full"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-6 mt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowCourseModal(false);
                  resetCourseForm();
                }}
                className="btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCourse}
                className="btn-maroon flex-1 flex items-center justify-center gap-2"
              >
                <Plus size={16} /> {editingCourse ? 'Update Course' : 'Add Course'}
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
