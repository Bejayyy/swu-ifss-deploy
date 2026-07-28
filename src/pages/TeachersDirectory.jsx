import React, { useEffect, useState, useMemo } from 'react';
import { Users, Mail, Phone, BookOpen, Building2, GraduationCap, Plus, X, Calendar } from 'lucide-react';
import Layout from '../components/Layout';
import LoadingModal from '../components/modals/LoadingModal';
import NotificationModal from '../components/modals/NotificationModal';
import TeacherScheduleModal from '../components/modals/TeacherScheduleModal';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { subscribeStaffUsers } from '../services/systemUserService';
import { subscribeCollegeCourses, assignTeacherToCourse, unassignTeacherFromCourse } from '../services/courseService';
import { formatCollegeName } from '../constants/colleges';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];

export default function TeachersDirectory() {
  const { profile } = useAuth();
  const isDean = profile?.role === ROLES.DEAN;
  const myDepartment = profile?.department || profile?.college;

  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [notification, setNotification] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleTeacher, setScheduleTeacher] = useState(null);

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
      console.log('Dean profile:', profile);
      console.log('My department/college:', myDepartment);
      console.log('Fetching courses for college code:', myDepartment);
      
      return subscribeCollegeCourses(
        myDepartment,
        (data) => {
          console.log('Courses fetched:', data);
          setCourses(data);
        },
        (err) => console.error('Error loading courses:', err)
      );
    }
    return () => {};
  }, [isDean, myDepartment, profile]);

  // Filter teachers by search query
  const filteredTeachers = useMemo(() => {
    if (!searchQuery.trim()) return teachers;
    
    const query = searchQuery.toLowerCase();
    return teachers.filter(teacher => 
      teacher.name?.toLowerCase().includes(query) ||
      teacher.email?.toLowerCase().includes(query) ||
      teacher.department?.toLowerCase().includes(query)
    );
  }, [teachers, searchQuery]);

  // Group teachers by department/college
  const teachersByDepartment = useMemo(() => {
    const groups = {};
    filteredTeachers.forEach(teacher => {
      const dept = teacher.department || teacher.college || 'Unassigned';
      if (!groups[dept]) {
        groups[dept] = [];
      }
      groups[dept].push(teacher);
    });
    return groups;
  }, [filteredTeachers]);

  // Get courses assigned to a teacher
  const getTeacherCourses = (teacherUid) => {
    return courses.filter(c => c.assignedTeacherUid === teacherUid);
  };

  // Get available courses (not assigned to selected teacher)
  const getAvailableCourses = () => {
    if (!selectedTeacher) return [];
    const teacherCourses = getTeacherCourses(selectedTeacher.uid);
    const assignedIds = new Set(teacherCourses.map(c => c.id));
    return courses.filter(c => !assignedIds.has(c.id));
  };

  const handleAssignCourse = (teacher) => {
    setSelectedTeacher(teacher);
    setShowAssignModal(true);
  };

  const handleViewSchedule = (teacher) => {
    setScheduleTeacher(teacher);
    setShowScheduleModal(true);
  };

  const handleAssignCourseToTeacher = async (courseId) => {
    if (!selectedTeacher) return;

    setIsLoading(true);
    setLoadingMessage('Assigning course...');
    setShowAssignModal(false);

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
    } catch (err) {
      console.error('Error assigning course:', err);
      setNotification({
        type: 'error',
        title: 'Failed to Assign Course',
        message: err.message || 'An error occurred while assigning the course.',
      });
    } finally {
      setIsLoading(false);
      setSelectedTeacher(null);
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
      setNotification({
        type: 'error',
        title: 'Failed to Unassign Course',
        message: err.message || 'An error occurred.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const stats = [
    { label: 'Total Teachers', value: teachers.length, icon: Users, accent: 'total' },
    { label: 'Active', value: teachers.filter(t => t.status === 'Active').length, icon: GraduationCap, accent: 'approved' },
    { label: 'Inactive', value: teachers.filter(t => t.status === 'Inactive').length, icon: Users, accent: 'neutral' },
    { label: isDean ? 'Your College' : 'Departments', value: Object.keys(teachersByDepartment).length, icon: Building2, accent: 'pending' },
  ];

  return (
    <Layout 
      title="Teachers Directory" 
      subtitle={isDean ? `Teachers in ${myDepartment || 'your college'}` : 'View all teachers across colleges'}
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                stat.accent === 'total' ? 'bg-blue-100' :
                stat.accent === 'approved' ? 'bg-green-100' :
                stat.accent === 'pending' ? 'bg-yellow-100' :
                'bg-gray-100'
              }`}>
                <stat.icon size={20} className={
                  stat.accent === 'total' ? 'text-blue-600' :
                  stat.accent === 'approved' ? 'text-green-600' :
                  stat.accent === 'pending' ? 'text-yellow-600' :
                  'text-gray-600'
                } />
              </div>
              <span className="text-2xl font-black" style={{ color: '#2B3235' }}>
                {stat.value}
              </span>
            </div>
            <p className="text-xs font-bold text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search teachers by name, email, or college..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field w-full max-w-md"
        />
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-2xl p-12 text-center">
          <p className="text-sm text-gray-400">Loading teachers...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && teachers.length === 0 && (
        <div className="bg-white rounded-2xl p-12 text-center">
          <Users size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-sm font-semibold text-gray-400 mb-2">No teachers found</p>
          <p className="text-xs text-gray-400">
            {isDean 
              ? `No teachers are assigned to ${myDepartment || 'your college'} yet.`
              : 'No teachers have been added to the system yet.'}
          </p>
        </div>
      )}

      {/* Teachers Grouped by Department */}
      {!loading && teachers.length > 0 && (
        <div className="space-y-6">
          {Object.entries(teachersByDepartment).map(([department, deptTeachers]) => (
            <div key={department}>
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={18} className="text-[#800000]" />
                <h3 className="font-black text-base" style={{ color: '#2B3235' }}>
                  {department}
                </h3>
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                  {deptTeachers.length} {deptTeachers.length === 1 ? 'teacher' : 'teachers'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {deptTeachers.map((teacher) => {
                  const teacherCourses = getTeacherCourses(teacher.uid);
                  
                  return (
                    <div
                      key={teacher.uid}
                      className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-md transition-shadow"
                    >
                      {/* Header with Avatar */}
                      <div className="flex items-start gap-3 mb-4">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black flex-shrink-0"
                          style={{ background: '#800000' }}
                        >
                          {teacher.initials || teacher.name?.charAt(0)?.toUpperCase() || 'T'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm truncate" style={{ color: '#2B3235' }}>
                            {teacher.name}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`w-2 h-2 rounded-full ${
                              teacher.status === 'Active' ? 'bg-green-500' : 'bg-gray-400'
                            }`} />
                            <span className="text-[10px] font-bold text-gray-500">
                              {teacher.status || 'Active'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Contact Info */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-start gap-2">
                          <Mail size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-gray-600 break-all">
                            {teacher.email}
                          </span>
                        </div>
                        
                        {teacher.phone && (
                          <div className="flex items-center gap-2">
                            <Phone size={14} className="text-gray-400 flex-shrink-0" />
                            <span className="text-xs text-gray-600">
                              {teacher.phone}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Assigned Courses */}
                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">
                            Assigned Courses ({teacherCourses.length})
                          </span>
                          {isDean && (
                            <button
                              type="button"
                              onClick={() => handleAssignCourse(teacher)}
                              className="text-[#800000] hover:bg-red-50 p-1 rounded transition-colors"
                              title="Assign course"
                            >
                              <Plus size={14} />
                            </button>
                          )}
                        </div>
                        
                        {teacherCourses.length > 0 ? (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {teacherCourses.map(course => (
                              <div 
                                key={course.id}
                                className="flex items-start justify-between gap-2 p-2 bg-gray-50 rounded-lg group"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-gray-900 truncate">
                                    {course.code}
                                  </p>
                                  <p className="text-[10px] text-gray-600 truncate">
                                    {course.title}
                                  </p>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block mt-1 ${
                                    course.type === 'lecture' ? 'bg-blue-100 text-blue-700' :
                                    course.type === 'laboratory' ? 'bg-green-100 text-green-700' :
                                    'bg-purple-100 text-purple-700'
                                  }`}>
                                    {course.type === 'lecture' ? 'LEC' : 
                                     course.type === 'laboratory' ? 'LAB' : 
                                     'LEC+LAB'}
                                  </span>
                                </div>
                                {isDean && (
                                  <button
                                    type="button"
                                    onClick={() => handleUnassignCourse(course.id, `${course.code} - ${course.title}`)}
                                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-100 p-1 rounded transition-all"
                                    title="Remove assignment"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">
                            No courses assigned yet
                          </p>
                        )}
                      </div>

                      {/* Custom Access Badge */}
                      {teacher.useCustomAccess && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-purple-50 text-purple-700">
                            Custom Access
                          </span>
                        </div>
                      )}

                      {/* View Schedule Button */}
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => handleViewSchedule(teacher)}
                          className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 hover:bg-[#800000] hover:text-white transition-all flex items-center justify-center gap-1.5"
                        >
                          <Calendar size={14} />
                          View Weekly Schedule
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Results from Search */}
      {!loading && teachers.length > 0 && filteredTeachers.length === 0 && (
        <div className="bg-white rounded-2xl p-12 text-center">
          <Users size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-sm font-semibold text-gray-400 mb-2">No teachers match your search</p>
          <p className="text-xs text-gray-400">Try a different search term</p>
        </div>
      )}

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

      {/* Assign Course Modal */}
      {showAssignModal && selectedTeacher && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-lg" style={{ color: '#2B3235' }}>
                    Assign Course to {selectedTeacher.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Select a course to assign
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedTeacher(null);
                  }}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {getAvailableCourses().length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-400 mb-2">No courses available</p>
                  <p className="text-xs text-gray-400">
                    All courses have been assigned or no courses exist yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {YEAR_LEVELS.map(yearLevel => {
                    const yearCourses = getAvailableCourses().filter(c => c.yearLevel === yearLevel);
                    if (yearCourses.length === 0) return null;

                    return (
                      <div key={yearLevel}>
                        <h4 className="font-bold text-sm mb-2" style={{ color: '#2B3235' }}>
                          {yearLevel}
                        </h4>
                        <div className="space-y-2">
                          {yearCourses.map(course => (
                            <button
                              key={course.id}
                              type="button"
                              onClick={() => handleAssignCourseToTeacher(course.id)}
                              className="w-full text-left p-3 border-2 border-gray-200 rounded-xl hover:border-[#800000] hover:bg-red-50 transition-all group"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-black text-sm text-[#800000]">
                                      {course.code}
                                    </span>
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
                                  <p className="text-xs font-medium text-gray-900">
                                    {course.title}
                                  </p>
                                  {course.units && (
                                    <p className="text-[10px] text-gray-500 mt-1">
                                      {course.units} {course.units === 1 ? 'unit' : 'units'}
                                    </p>
                                  )}
                                </div>
                                <Plus size={16} className="text-[#800000] opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
