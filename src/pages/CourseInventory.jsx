import React, { useEffect, useState, useMemo } from 'react';
import { BookOpen, Plus, Pencil, Trash2, X, Users } from 'lucide-react';
import Layout from '../components/Layout';
import LoadingModal from '../components/modals/LoadingModal';
import NotificationModal from '../components/modals/NotificationModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import CustomSelect from '../components/ui/CustomSelect';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { subscribeCollegeCourses, subscribeAllCourses, addCourse, updateCourse, deleteCourse } from '../services/courseService';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
const COURSE_TYPES = [
  { value: 'lecture', label: 'Lecture Only' },
  { value: 'laboratory', label: 'Laboratory Only' },
  { value: 'both', label: 'Both (Lecture & Laboratory)' },
];

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

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [form, setForm] = useState({
    code: '',
    title: '',
    type: 'lecture',
    yearLevel: '1st Year',
    units: '',
    description: '',
  });
  const [formError, setFormError] = useState('');

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

  // Group courses by year level
  const coursesByYear = useMemo(() => {
    const groups = {};
    YEAR_LEVELS.forEach(year => {
      groups[year] = courses.filter(c => c.yearLevel === year);
    });
    return groups;
  }, [courses]);

  const resetForm = () => {
    setForm({
      code: '',
      title: '',
      type: 'lecture',
      yearLevel: '1st Year',
      units: '',
      description: '',
    });
    setFormError('');
    setEditingCourse(null);
  };

  const handleAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleEdit = (course) => {
    setForm({
      code: course.code,
      title: course.title,
      type: course.type,
      yearLevel: course.yearLevel,
      units: course.units || '',
      description: course.description || '',
    });
    setEditingCourse(course);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    setFormError('');

    if (!form.code.trim() || !form.title.trim()) {
      setFormError('Course code and title are required.');
      return;
    }

    // Check for duplicate code (only when adding or changing code)
    if (!editingCourse || editingCourse.code !== form.code) {
      const duplicate = courses.find(c => 
        c.code.toLowerCase() === form.code.trim().toLowerCase() &&
        c.yearLevel === form.yearLevel
      );
      if (duplicate) {
        setFormError('A course with this code already exists for this year level.');
        return;
      }
    }

    setIsLoading(true);
    setLoadingMessage(editingCourse ? 'Updating course...' : 'Adding course...');
    setShowAddModal(false);

    try {
      const courseData = {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        type: form.type,
        yearLevel: form.yearLevel,
        units: form.units ? Number(form.units) : null,
        description: form.description.trim(),
        collegeCode: myCollege,
        collegeName: profile?.name || '',
      };

      if (editingCourse) {
        await updateCourse(editingCourse.id, courseData);
        setNotification({
          type: 'success',
          title: 'Course Updated!',
          message: `${form.code} has been successfully updated.`,
        });
      } else {
        await addCourse(courseData);
        setNotification({
          type: 'success',
          title: 'Course Added!',
          message: `${form.code} - ${form.title} has been successfully added.`,
        });
      }
      resetForm();
    } catch (err) {
      console.error('Error saving course:', err);
      setNotification({
        type: 'error',
        title: 'Failed to Save Course',
        message: err.message || 'An error occurred while saving the course.',
      });
    } finally {
      setIsLoading(false);
    }
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
          <Plus size={16} /> Add Course
        </button>
      </div>

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

                      {course.description && (
                        <p className="text-xs text-gray-600 mb-3 line-clamp-2">
                          {course.description}
                        </p>
                      )}

                      {course.units && (
                        <p className="text-[10px] font-bold text-gray-500 mb-3">
                          {course.units} {course.units === 1 ? 'unit' : 'units'}
                        </p>
                      )}

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
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Course Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-modal-pop max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-black text-lg" style={{ color: '#2B3235' }}>
                  {editingCourse ? 'Edit Course' : 'Add New Course'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {editingCourse ? 'Update course information' : 'Add a new course to the catalog'}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                    Course Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="e.g., CS101, MATH201"
                    className="form-input w-full"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                    Year Level <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={form.yearLevel}
                    onChange={(e) => setForm({ ...form, yearLevel: e.target.value })}
                    options={YEAR_LEVELS}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  Course Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., Introduction to Computer Science"
                  className="form-input w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                    Course Type <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    options={COURSE_TYPES}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                    Units (Optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={form.units}
                    onChange={(e) => setForm({ ...form, units: e.target.value })}
                    placeholder="e.g., 3"
                    className="form-input w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  Description (Optional)
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of the course..."
                  className="form-input w-full"
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
                disabled={!form.code.trim() || !form.title.trim()}
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
