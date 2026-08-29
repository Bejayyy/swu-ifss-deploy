import React, { useEffect, useState, useMemo } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Clock, Users, Building2 } from 'lucide-react';
import Layout from '../components/Layout';
import LoadingModal from '../components/modals/LoadingModal';
import NotificationModal from '../components/modals/NotificationModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import AddCourseModal from '../components/modals/AddCourseModal';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { subscribeCollegeCourses, subscribeAllCourses, deleteCourse } from '../services/courseService';

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

  // Group courses by year level
  const coursesByYear = useMemo(() => {
    const groups = {};
    YEAR_LEVELS.forEach(year => {
      groups[year] = courses.filter(c => c.yearLevel === year);
    });
    return groups;
  }, [courses]);

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
        </div>
      )}

      {/* Add/Edit Course Modal using unified AddCourseModal */}
      {showAddModal && (
        <AddCourseModal
          onClose={() => {
            setShowAddModal(false);
            setEditingCourse(null);
          }}
          collegeCode={myCollege}
          collegeName={profile?.department || profile?.college || 'College'}
          existingCourses={courses}
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
