import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Filter,
  Calendar,
  Layers,
  Wrench,
  DoorOpen,
  User,
  Users,
  Clock,
  Eye,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  XCircle,
  FileText,
  Building,
  GraduationCap,
  BookOpen,
  Tag,
  Database,
  CheckSquare,
  Square,
  MinusSquare,
  Shield,
  FolderTree,
  GitBranch,
} from 'lucide-react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import ProgressStatCards from '../../components/ProgressStatCards';
import ConfirmModal from '../../components/modals/ConfirmModal';
import { TableSkeleton } from '../../components/SkeletonLoader';
import DeveloperReservationDetailsModal from '../../components/developer/modals/DeveloperReservationDetailsModal';
import DeveloperScheduleDetailsModal from '../../components/developer/modals/DeveloperScheduleDetailsModal';
import DeveloperMaintenanceDetailsModal from '../../components/developer/modals/DeveloperMaintenanceDetailsModal';
import DeveloperUserDetailsModal from '../../components/developer/modals/DeveloperUserDetailsModal';
import DeveloperGenericDetailsModal from '../../components/developer/modals/DeveloperGenericDetailsModal';
import { useAuth } from '../../context/AuthContext';
import { getInitials } from '../../firebase/authHelpers';
import {
  subscribeAllReservations,
  deleteReservationRecord,
  batchDeleteReservations,
  subscribeAllCourseScheduleEntries,
  deleteCourseScheduleEntryByPath,
  batchDeleteCourseScheduleEntries,
  subscribeAllPlotRequests,
  deletePlotRequestRecord,
  batchDeletePlotRequests,
  subscribeAllMaintenanceSchedules,
  deleteMaintenanceScheduleRecord,
  batchDeleteMaintenanceSchedules,
  subscribeAllMaintenanceReports,
  deleteMaintenanceReportRecord,
  batchDeleteMaintenanceReports,
  subscribeAllSystemUsers,
  deleteSystemUserRecord,
  batchDeleteSystemUsers,
  subscribeAllBuildings,
  deleteBuildingRecord,
  batchDeleteBuildings,
  subscribeAllColleges,
  deleteCollegeRecord,
  batchDeleteColleges,
  subscribeAllProgramSections,
  deleteProgramSectionRecord,
  batchDeleteProgramSections,
  subscribeAllCoursesCatalog,
  deleteCourseRecord,
  batchDeleteCoursesCatalog,
  subscribeAllAcademicCalendars,
  deleteAcademicCalendarRecord,
  batchDeleteAcademicCalendars,
  subscribeAllNoClassDays,
  deleteNoClassDayRecord,
  batchDeleteNoClassDays,
  subscribeAllApprovalWorkflows,
  deleteApprovalWorkflowRecord,
  batchDeleteApprovalWorkflows,
} from '../../services/developerRecordsService';
import { formatScheduleHour, SCHEDULE_DAYS } from '../../constants/scheduleGrid';

export default function DeveloperSystemRecords() {
  const { profile } = useAuth();
  const currentUid = profile?.uid;

  // Active Tab: 'users' | 'reservations' | 'schedules' | 'maintenance' | 'buildings' | 'colleges' | 'courses' | 'calendars' | 'workflows'
  const [activeTab, setActiveTab] = useState('users');

  // Sub-tabs
  const [scheduleSubTab, setScheduleSubTab] = useState('entries'); // 'entries' | 'plot_requests'
  const [maintenanceSubTab, setMaintenanceSubTab] = useState('schedules'); // 'schedules' | 'reports'
  const [collegeSubTab, setCollegeSubTab] = useState('colleges'); // 'colleges' | 'sections'
  const [calendarSubTab, setCalendarSubTab] = useState('calendars'); // 'calendars' | 'no_class_days'

  // Data states
  const [systemUsers, setSystemUsers] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [courseEntries, setCourseEntries] = useState([]);
  const [plotRequests, setPlotRequests] = useState([]);
  const [maintenanceSchedules, setMaintenanceSchedules] = useState([]);
  const [maintenanceReports, setMaintenanceReports] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [programSections, setProgramSections] = useState([]);
  const [courses, setCourses] = useState([]);
  const [academicCalendars, setAcademicCalendars] = useState([]);
  const [noClassDays, setNoClassDays] = useState([]);
  const [approvalWorkflows, setApprovalWorkflows] = useState([]);

  // Multi-selection states (Sets of IDs / docPaths / UIDs)
  const [selectedItems, setSelectedItems] = useState(new Set());

  // Loading & Error states
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [schoolYearFilter, setSchoolYearFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Modal inspection states
  const [viewUser, setViewUser] = useState(null);
  const [viewReservation, setViewReservation] = useState(null);
  const [viewSchedule, setViewSchedule] = useState(null);
  const [viewMaintenance, setViewMaintenance] = useState(null);
  const [viewGeneric, setViewGeneric] = useState(null); // { item, categoryTitle, icon }

  // Deletion confirm states
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Clear selections when switching tabs
  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setSelectedItems(new Set());
    setSearchQuery('');
    setStatusFilter('all');
    setRoleFilter('all');
    setTypeFilter('all');
    setSchoolYearFilter('all');
  };

  // Real-time Subscriptions across ALL collections
  useEffect(() => {
    setLoading(true);
    let count = 0;
    const totalSubs = 12;
    const checkDone = () => {
      count += 1;
      if (count >= totalSubs) setLoading(false);
    };

    const unsubUsers = subscribeAllSystemUsers(
      (list) => {
        setSystemUsers(list);
        checkDone();
      },
      (err) => {
        console.error('Users error:', err);
        checkDone();
      }
    );

    const unsubRes = subscribeAllReservations(
      (list) => {
        setReservations(list);
        checkDone();
      },
      (err) => {
        console.error('Reservations error:', err);
        checkDone();
      }
    );

    const unsubSched = subscribeAllCourseScheduleEntries(
      (list) => {
        setCourseEntries(list);
        checkDone();
      },
      (err) => {
        console.error('Course schedules error:', err);
        checkDone();
      }
    );

    const unsubPlots = subscribeAllPlotRequests(
      (list) => {
        setPlotRequests(list);
        checkDone();
      },
      (err) => {
        console.error('Plot requests error:', err);
        checkDone();
      }
    );

    const unsubMaintSched = subscribeAllMaintenanceSchedules(
      (list) => {
        setMaintenanceSchedules(list);
        checkDone();
      },
      (err) => {
        console.error('Maintenance schedules error:', err);
        checkDone();
      }
    );

    const unsubMaintRep = subscribeAllMaintenanceReports(
      (list) => {
        setMaintenanceReports(list);
        checkDone();
      },
      (err) => {
        console.error('Maintenance reports error:', err);
        checkDone();
      }
    );

    const unsubBld = subscribeAllBuildings(
      (list) => {
        setBuildings(list);
        checkDone();
      },
      (err) => {
        console.error('Buildings error:', err);
        checkDone();
      }
    );

    const unsubCol = subscribeAllColleges(
      (list) => {
        setColleges(list);
        checkDone();
      },
      (err) => {
        console.error('Colleges error:', err);
        checkDone();
      }
    );

    const unsubSec = subscribeAllProgramSections(
      (list) => {
        setProgramSections(list);
        checkDone();
      },
      (err) => {
        console.error('Program sections error:', err);
        checkDone();
      }
    );

    const unsubCourses = subscribeAllCoursesCatalog(
      (list) => {
        setCourses(list);
        checkDone();
      },
      (err) => {
        console.error('Courses error:', err);
        checkDone();
      }
    );

    const unsubCal = subscribeAllAcademicCalendars(
      (list) => {
        setAcademicCalendars(list);
        checkDone();
      },
      (err) => {
        console.error('Calendars error:', err);
        checkDone();
      }
    );

    const unsubNoClass = subscribeAllNoClassDays(
      (list) => {
        setNoClassDays(list);
        checkDone();
      },
      (err) => {
        console.error('No-class days error:', err);
        checkDone();
      }
    );

    const unsubWorkflows = subscribeAllApprovalWorkflows(
      (list) => {
        setApprovalWorkflows(list);
      },
      (err) => {
        console.error('Workflows error:', err);
      }
    );

    return () => {
      unsubUsers();
      unsubRes();
      unsubSched();
      unsubPlots();
      unsubMaintSched();
      unsubMaintRep();
      unsubBld();
      unsubCol();
      unsubSec();
      unsubCourses();
      unsubCal();
      unsubNoClass();
      unsubWorkflows();
    };
  }, []);

  // Clear toast
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(''), 4000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(''), 6000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  // Dynamically extract all available school years
  const availableSchoolYears = useMemo(() => {
    const syMap = new Map();
    academicCalendars.forEach((sy) => {
      const clean = String(sy.label || sy.id || '').replace(/^sy_/i, '').replace(/^sy\s+/i, '').trim();
      if (clean) syMap.set(clean, sy.displayLabel || (clean.startsWith('SY ') ? clean : `SY ${clean}`));
    });
    courseEntries.forEach((e) => {
      const raw = e.schoolYear || e.schoolYearId || e.schoolYearLabel;
      if (raw) {
        const clean = String(raw).replace(/^sy_/i, '').replace(/^sy\s+/i, '').trim();
        if (clean && !syMap.has(clean)) {
          syMap.set(clean, clean.startsWith('SY ') ? clean : `SY ${clean}`);
        }
      }
    });
    if (syMap.size === 0) {
      syMap.set('2026-2027', 'SY 2026-2027');
    }
    return Array.from(syMap.entries()).map(([value, label]) => ({ value, label }));
  }, [academicCalendars, courseEntries]);

  // Summary Stat cards
  const activeUsersCount = systemUsers.filter((u) => (u.status || '').toLowerCase() === 'active').length;
  const approvedReservationsCount = reservations.filter(
    (r) => (r.status || '').toLowerCase() === 'approved'
  ).length;

  const stats = [
    {
      label: 'System Users',
      value: systemUsers.length,
      icon: Users,
      accent: 'maroon',
      description: `${activeUsersCount} active · ${systemUsers.length - activeUsersCount} inactive`,
    },
    {
      label: 'Room Reservations',
      value: reservations.length,
      icon: Calendar,
      accent: 'neutral',
      description: `${approvedReservationsCount} approved · ${reservations.length - approvedReservationsCount} pending/other`,
    },
    {
      label: 'Plotted Class Schedules',
      value: courseEntries.length,
      icon: Layers,
      accent: 'approved',
      description: `${plotRequests.length} plot requests · all school years included`,
    },
    {
      label: 'Campus Facilities & Rooms',
      value: buildings.length,
      icon: Building,
      accent: 'pending',
      description: `${courses.length} courses · ${colleges.length} colleges · ${programSections.length} section sets`,
    },
  ];

  // ---------------------------------------------------------------------------
  // FILTERED DATASETS
  // ---------------------------------------------------------------------------

  // Users
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return systemUsers.filter((u) => {
      if (roleFilter !== 'all') {
        const r = (u.role || u.roleValue || '').toLowerCase();
        if (!r.includes(roleFilter)) return false;
      }
      if (statusFilter !== 'all' && (u.status || '').toLowerCase() !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (u.displayName || u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.college || '').toLowerCase().includes(q) ||
        (u.uid || u.id || '').toLowerCase().includes(q)
      );
    });
  }, [systemUsers, searchQuery, roleFilter, statusFilter]);

  // Reservations
  const filteredReservations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reservations.filter((r) => {
      if (statusFilter !== 'all') {
        const st = (r.status || '').toLowerCase();
        if (statusFilter === 'approved' && st !== 'approved') return false;
        if (statusFilter === 'pending' && !['pending', 'in-progress', 'in_progress'].includes(st)) return false;
        if (statusFilter === 'rejected' && st !== 'rejected') return false;
        if (statusFilter === 'draft' && st !== 'draft') return false;
      }
      if (typeFilter !== 'all') {
        const t = (r.type || '').toLowerCase();
        if (typeFilter === 'academic' && !t.includes('academic')) return false;
        if (typeFilter === 'non-academic' && t.includes('academic') && !t.includes('non')) return false;
      }
      if (!q) return true;
      return (
        (r.title || '').toLowerCase().includes(q) ||
        (r.activity || '').toLowerCase().includes(q) ||
        (r.requestor || '').toLowerCase().includes(q) ||
        (r.designatedVenue || '').toLowerCase().includes(q) ||
        (r.room || '').toLowerCase().includes(q) ||
        (r.building || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q)
      );
    });
  }, [reservations, searchQuery, statusFilter, typeFilter]);

  // Plotted Course Entries
  const filteredCourseEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return courseEntries.filter((e) => {
      if (schoolYearFilter !== 'all') {
        const cleanTarget = schoolYearFilter.replace(/^sy_/i, '').replace(/^sy\s+/i, '').toLowerCase();
        const entrySy = String(e.schoolYear || e.schoolYearId || e.schoolYearLabel || '').replace(/^sy_/i, '').replace(/^sy\s+/i, '').toLowerCase();
        if (!entrySy.includes(cleanTarget) && !cleanTarget.includes(entrySy)) return false;
      }
      if (dayFilter !== 'all') {
        const dayIdx = Number(dayFilter);
        if (e.day !== dayIdx && String(e.date || '') !== dayFilter) return false;
      }
      if (semesterFilter !== 'all' && String(e.semester || '') !== semesterFilter) return false;
      if (modeFilter !== 'all') {
        const m = (e.scheduleMode || 'regular').toLowerCase();
        if (modeFilter !== m) return false;
      }
      if (!q) return true;
      return (
        (e.courseCode || '').toLowerCase().includes(q) ||
        (e.course || '').toLowerCase().includes(q) ||
        (e.title || '').toLowerCase().includes(q) ||
        (e.subject || '').toLowerCase().includes(q) ||
        (e.section || '').toLowerCase().includes(q) ||
        (e.instructor || '').toLowerCase().includes(q) ||
        (e.instructorFullName || '').toLowerCase().includes(q) ||
        (e.roomCode || '').toLowerCase().includes(q) ||
        (e.buildingName || '').toLowerCase().includes(q) ||
        (e.id || '').toLowerCase().includes(q)
      );
    });
  }, [courseEntries, searchQuery, schoolYearFilter, dayFilter, semesterFilter, modeFilter]);

  // Plot Requests
  const filteredPlotRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return plotRequests.filter((p) => {
      if (!q) return true;
      return (
        (p.title || '').toLowerCase().includes(q) ||
        (p.schoolYearLabel || '').toLowerCase().includes(q) ||
        (p.status || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q)
      );
    });
  }, [plotRequests, searchQuery]);

  // Maintenance Schedules & Reports
  const filteredMaintenanceSchedules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return maintenanceSchedules.filter((s) => {
      if (statusFilter !== 'all' && (s.status || '').toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      return (
        (s.roomName || '').toLowerCase().includes(q) ||
        (s.buildingName || '').toLowerCase().includes(q) ||
        (s.reason || '').toLowerCase().includes(q) ||
        (s.id || '').toLowerCase().includes(q)
      );
    });
  }, [maintenanceSchedules, searchQuery, statusFilter]);

  const filteredMaintenanceReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return maintenanceReports.filter((r) => {
      if (statusFilter !== 'all' && (r.status || '').toLowerCase() !== statusFilter) return false;
      if (priorityFilter !== 'all' && (r.priority || '').toLowerCase() !== priorityFilter) return false;
      if (!q) return true;
      return (
        (r.roomName || '').toLowerCase().includes(q) ||
        (r.buildingName || '').toLowerCase().includes(q) ||
        (r.issue || '').toLowerCase().includes(q) ||
        (r.reportedByName || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q)
      );
    });
  }, [maintenanceReports, searchQuery, statusFilter, priorityFilter]);

  // Buildings
  const filteredBuildings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return buildings.filter((b) => {
      if (!q) return true;
      return (
        (b.name || '').toLowerCase().includes(q) ||
        (b.code || '').toLowerCase().includes(q) ||
        (b.id || '').toLowerCase().includes(q)
      );
    });
  }, [buildings, searchQuery]);

  // Colleges & Sections
  const filteredColleges = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return colleges.filter((c) => {
      if (!q) return true;
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        (c.deanName || '').toLowerCase().includes(q) ||
        (c.id || '').toLowerCase().includes(q)
      );
    });
  }, [colleges, searchQuery]);

  const filteredProgramSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return programSections.filter((s) => {
      if (!q) return true;
      return (
        (s.programCode || '').toLowerCase().includes(q) ||
        (s.collegeCode || '').toLowerCase().includes(q) ||
        (s.yearLabel || '').toLowerCase().includes(q) ||
        (s.id || '').toLowerCase().includes(q)
      );
    });
  }, [programSections, searchQuery]);

  // Courses Catalog
  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return courses.filter((c) => {
      if (!q) return true;
      return (
        (c.code || '').toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.collegeCode || '').toLowerCase().includes(q) ||
        (c.programCode || '').toLowerCase().includes(q) ||
        (c.assignedTeacherName || '').toLowerCase().includes(q) ||
        (c.id || '').toLowerCase().includes(q)
      );
    });
  }, [courses, searchQuery]);

  // Calendars & No Class Days
  const filteredCalendars = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return academicCalendars.filter((c) => {
      if (!q) return true;
      return (
        (c.label || '').toLowerCase().includes(q) ||
        (c.displayLabel || '').toLowerCase().includes(q) ||
        (c.id || '').toLowerCase().includes(q)
      );
    });
  }, [academicCalendars, searchQuery]);

  const filteredNoClassDays = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return noClassDays.filter((d) => {
      if (!q) return true;
      return (
        (d.title || '').toLowerCase().includes(q) ||
        (d.date || '').toLowerCase().includes(q) ||
        (d.reason || '').toLowerCase().includes(q) ||
        (d.id || '').toLowerCase().includes(q)
      );
    });
  }, [noClassDays, searchQuery]);

  // Workflows
  const filteredWorkflows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return approvalWorkflows.filter((w) => {
      if (!q) return true;
      return (
        (w.name || '').toLowerCase().includes(q) ||
        (w.type || '').toLowerCase().includes(q) ||
        (w.id || '').toLowerCase().includes(q)
      );
    });
  }, [approvalWorkflows, searchQuery]);

  // ---------------------------------------------------------------------------
  // SELECTION HANDLERS
  // ---------------------------------------------------------------------------
  const toggleSelect = (key) => {
    if (activeTab === 'users' && key === currentUid) return; // protect self
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = (itemList, keyExtractor) => {
    const keys = itemList
      .map(keyExtractor)
      .filter((k) => activeTab !== 'users' || k !== currentUid);
    if (selectedItems.size === keys.length && keys.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(keys));
    }
  };

  // ---------------------------------------------------------------------------
  // DELETION HANDLER (SINGLE & BATCH)
  // ---------------------------------------------------------------------------
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      if (itemToDelete.isBatch) {
        const keys = Array.from(selectedItems);
        let count = keys.length;

        if (activeTab === 'users') {
          count = await batchDeleteSystemUsers(keys);
        } else if (activeTab === 'reservations') {
          count = await batchDeleteReservations(keys);
        } else if (activeTab === 'schedules') {
          if (scheduleSubTab === 'entries') count = await batchDeleteCourseScheduleEntries(keys);
          else count = await batchDeletePlotRequests(keys);
        } else if (activeTab === 'maintenance') {
          if (maintenanceSubTab === 'schedules') count = await batchDeleteMaintenanceSchedules(keys);
          else count = await batchDeleteMaintenanceReports(keys);
        } else if (activeTab === 'buildings') {
          count = await batchDeleteBuildings(keys);
        } else if (activeTab === 'colleges') {
          if (collegeSubTab === 'colleges') count = await batchDeleteColleges(keys);
          else count = await batchDeleteProgramSections(keys);
        } else if (activeTab === 'courses') {
          count = await batchDeleteCoursesCatalog(keys);
        } else if (activeTab === 'calendars') {
          if (calendarSubTab === 'calendars') count = await batchDeleteAcademicCalendars(keys);
          else count = await batchDeleteNoClassDays(keys);
        } else if (activeTab === 'workflows') {
          count = await batchDeleteApprovalWorkflows(keys);
        }

        setSelectedItems(new Set());
        setSuccessMessage(`Successfully batch deleted ${count} document(s).`);
      } else {
        // Single deletion
        const t = itemToDelete.type;
        if (t === 'user') await deleteSystemUserRecord(itemToDelete.uid);
        else if (t === 'reservation') await deleteReservationRecord(itemToDelete.id);
        else if (t === 'schedule_entry') await deleteCourseScheduleEntryByPath(itemToDelete.docPath);
        else if (t === 'plot_request') await deletePlotRequestRecord(itemToDelete.id);
        else if (t === 'maintenance_schedule') await deleteMaintenanceScheduleRecord(itemToDelete.id);
        else if (t === 'maintenance_report') await deleteMaintenanceReportRecord(itemToDelete.id);
        else if (t === 'building') await deleteBuildingRecord(itemToDelete.id);
        else if (t === 'college') await deleteCollegeRecord(itemToDelete.id);
        else if (t === 'program_section') await deleteProgramSectionRecord(itemToDelete.id);
        else if (t === 'course') await deleteCourseRecord(itemToDelete.id);
        else if (t === 'academic_calendar') await deleteAcademicCalendarRecord(itemToDelete.id);
        else if (t === 'no_class_day') await deleteNoClassDayRecord(itemToDelete.id);
        else if (t === 'approval_workflow') await deleteApprovalWorkflowRecord(itemToDelete.id);

        setSuccessMessage(`Document "${itemToDelete.title || itemToDelete.id}" was successfully deleted.`);
        setViewUser(null);
        setViewReservation(null);
        setViewSchedule(null);
        setViewMaintenance(null);
        setViewGeneric(null);
      }

      setItemToDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
      setErrorMessage(err.message || 'Failed to delete document(s). Please verify permissions.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <DeveloperLayout
      title="System Records & Master Data"
      subtitle="Complete, unfiltered view of all users, reservations, course schedules, maintenance, facilities, and curricula in the system"
    >
      {/* Stat Summary Cards */}
      <ProgressStatCards items={stats} />

      {/* Notifications */}
      {successMessage && (
        <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Tab Switcher - All System Categories */}
      <div className="flex items-center gap-1.5 mt-6 border-b border-gray-200 overflow-x-auto pb-1">
        {[
          { key: 'users', label: 'All Users', icon: Users, count: systemUsers.length },
          { key: 'reservations', label: 'Reservations', icon: Calendar, count: reservations.length },
          { key: 'schedules', label: 'Course Schedules', icon: Layers, count: courseEntries.length },
          { key: 'maintenance', label: 'Maintenance', icon: Wrench, count: maintenanceSchedules.length + maintenanceReports.length },
          { key: 'buildings', label: 'Buildings & Rooms', icon: Building, count: buildings.length },
          { key: 'colleges', label: 'Colleges & Sections', icon: GraduationCap, count: colleges.length + programSections.length },
          { key: 'courses', label: 'Course Catalog', icon: BookOpen, count: courses.length },
          { key: 'calendars', label: 'Academic Calendar', icon: Clock, count: academicCalendars.length + noClassDays.length },
          { key: 'workflows', label: 'Approval Workflows', icon: GitBranch, count: approvalWorkflows.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'border-[#7A0808] text-[#7A0808] bg-[#FFF0F0] rounded-t-lg'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50/70'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-[#7A0808] text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Batch Action Toolbar */}
      {selectedItems.size > 0 && (
        <div className="mt-4 p-3 bg-rose-50/90 border border-rose-200 rounded-xl flex items-center justify-between gap-3 text-xs animate-in fade-in">
          <div className="flex items-center gap-2 text-rose-900 font-bold">
            <CheckSquare size={16} className="text-[#7A0808]" />
            <span>{selectedItems.size} record(s) selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedItems(new Set())}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg font-bold transition-all cursor-pointer"
            >
              Deselect All
            </button>
            <button
              type="button"
              onClick={() =>
                setItemToDelete({
                  isBatch: true,
                  count: selectedItems.size,
                })
              }
              className="px-3.5 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Batch Delete ({selectedItems.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. ALL USERS TAB                                                         */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-center justify-between">
            <div className="relative flex-1 min-w-[240px] max-w-md w-full">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="form-input pl-9 text-xs w-full"
                placeholder="Search name, email, department, college, role, UID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <select
                className="form-input text-xs py-1.5 px-3 bg-white"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">All Roles</option>
                <option value="registrar">Registrar</option>
                <option value="dean">Dean</option>
                <option value="teacher">Teacher</option>
                <option value="gsd">GSD</option>
                <option value="student_life">Student Life</option>
                <option value="organization_head">Organization Head</option>
                <option value="developer">Developer</option>
              </select>

              <select
                className="form-input text-xs py-1.5 px-3 bg-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : (
            <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                          checked={
                            filteredUsers.length > 0 &&
                            selectedItems.size === filteredUsers.filter((u) => u.uid !== currentUid && u.id !== currentUid).length &&
                            filteredUsers.filter((u) => u.uid !== currentUid && u.id !== currentUid).length > 0
                          }
                          onChange={() => toggleSelectAll(filteredUsers, (u) => u.uid || u.id)}
                          title="Select all matching"
                        />
                      </th>
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Department / College</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const userUid = u.uid || u.id;
                      const isSelf = userUid === currentUid;
                      const isSelected = selectedItems.has(userUid);
                      const initials = u.initials || getInitials(u.displayName || u.name, u.email);
                      const isActive = (u.status || '').toLowerCase() === 'active';
                      const role = u.role || u.roleValue || 'User';

                      return (
                        <tr
                          key={userUid}
                          className={`border-b border-gray-50 transition-colors ${
                            isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              disabled={isSelf}
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              checked={isSelected}
                              onChange={() => toggleSelect(userUid)}
                            />
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-8 h-8 flex items-center justify-center text-xs font-black text-white rounded-lg flex-shrink-0"
                                style={{ background: '#7A0808' }}
                              >
                                {initials}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 leading-tight">
                                  {u.displayName || u.name || 'Unnamed User'}
                                </p>
                                {isSelf && (
                                  <span className="text-[10px] text-purple-700 font-bold">You (Super Admin)</span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-gray-700 font-medium">{u.email || '—'}</td>

                          <td className="py-3 px-4">
                            <span className="font-bold text-[10px] uppercase bg-[#FFF0F0] text-[#7A0808] border border-[#FFD0D0] px-2 py-0.5 rounded-full">
                              {role}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-gray-600">
                            {u.department || u.college || '—'}
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 font-bold text-[10px] uppercase px-2 py-0.5 rounded-full border ${
                                isActive
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-rose-100 text-rose-800 border-rose-300'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewUser(u)}
                                className="p-1.5 hover:bg-gray-100 text-gray-600 hover:text-gray-900 rounded-lg transition-colors cursor-pointer"
                                title="View User Details"
                              >
                                <Eye size={15} />
                              </button>
                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setItemToDelete({
                                      type: 'user',
                                      uid: userUid,
                                      title: u.displayName || u.name || u.email,
                                    })
                                  }
                                  className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title="Delete User"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400 font-medium">
                          No users found matching your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. ROOM RESERVATIONS TAB                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'reservations' && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-center justify-between">
            <div className="relative flex-1 min-w-[240px] max-w-md w-full">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="form-input pl-9 text-xs w-full"
                placeholder="Search by activity, requestor, email, venue, college…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <select
                className="form-input text-xs py-1.5 px-3 bg-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending / In Progress</option>
                <option value="rejected">Rejected</option>
                <option value="draft">Draft</option>
              </select>

              <select
                className="form-input text-xs py-1.5 px-3 bg-white"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="academic">Academic</option>
                <option value="non-academic">Non-Academic</option>
              </select>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : (
            <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                          checked={
                            filteredReservations.length > 0 &&
                            selectedItems.size === filteredReservations.length
                          }
                          onChange={() => toggleSelectAll(filteredReservations, (r) => r.id)}
                          title="Select all matching"
                        />
                      </th>
                      <th className="py-3 px-4">Activity / Title</th>
                      <th className="py-3 px-4">Requestor & Org</th>
                      <th className="py-3 px-4">Venue / Room</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReservations.map((r) => {
                      const isAcademic = (r.type || '').toLowerCase().includes('academic');
                      const st = (r.status || 'pending').toLowerCase();
                      const isApproved = st === 'approved';
                      const isPending = ['pending', 'in-progress', 'in_progress'].includes(st);
                      const isRejected = st === 'rejected';
                      const isSelected = selectedItems.has(r.id);

                      return (
                        <tr
                          key={r.id}
                          className={`border-b border-gray-50 transition-colors ${
                            isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleSelect(r.id)}
                            />
                          </td>

                          <td className="py-3 px-4">
                            <p className="font-bold text-gray-900 leading-tight">
                              {r.title || r.activity || 'Room Reservation'}
                            </p>
                            <p className="text-[10px] font-mono text-gray-400 mt-0.5 truncate max-w-[180px]">
                              ID: {r.id}
                            </p>
                          </td>

                          <td className="py-3 px-4">
                            <p className="font-bold text-gray-800">{r.requestor || r.requestedBy || 'Staff'}</p>
                            <p className="text-[10px] text-gray-500 truncate max-w-[160px]">
                              {r.requestorEmail || r.createdByEmail || r.department || '—'}
                            </p>
                          </td>

                          <td className="py-3 px-4">
                            <p className="font-bold text-gray-900">{r.designatedVenue || r.room || 'Venue TBA'}</p>
                            {r.building && <p className="text-[10px] text-gray-500">{r.building}</p>}
                          </td>

                          <td className="py-3 px-4">
                            <p className="font-bold text-[#7A0808]">{r.dateOfActivity || 'N/A'}</p>
                            <p className="text-[10px] text-gray-500 font-medium">
                              {r.timeStart && r.timeEnd ? `${r.timeStart} - ${r.timeEnd}` : '—'}
                            </p>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`inline-block font-bold text-[10px] uppercase px-2 py-0.5 rounded-full border ${
                                isAcademic
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : 'bg-purple-50 text-purple-800 border-purple-200'
                              }`}
                            >
                              {isAcademic ? 'Academic' : 'Non-Academic'}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 font-bold text-[10px] uppercase px-2 py-0.5 rounded-full border ${
                                isApproved
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : isPending
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : isRejected
                                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                                  : 'bg-gray-100 text-gray-700 border-gray-300'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isApproved ? 'bg-emerald-500' : isPending ? 'bg-amber-500' : isRejected ? 'bg-rose-500' : 'bg-gray-400'
                                }`}
                              />
                              {r.status || 'Pending'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewReservation(r)}
                                className="p-1.5 hover:bg-gray-100 text-gray-600 hover:text-gray-900 rounded-lg transition-colors cursor-pointer"
                                title="View Details"
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setItemToDelete({
                                    type: 'reservation',
                                    id: r.id,
                                    title: r.title || r.activity,
                                  })
                                }
                                className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Delete Record"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredReservations.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-gray-400 font-medium">
                          No room reservations found matching your criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. COURSE SCHEDULING TAB                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'schedules' && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setScheduleSubTab('entries');
                setSelectedItems(new Set());
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                scheduleSubTab === 'entries'
                  ? 'bg-[#7A0808] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Class Schedules ({courseEntries.length} entries across all school years)
            </button>
            <button
              type="button"
              onClick={() => {
                setScheduleSubTab('plot_requests');
                setSelectedItems(new Set());
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                scheduleSubTab === 'plot_requests'
                  ? 'bg-[#7A0808] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Plot Requests ({plotRequests.length} requests)
            </button>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-center justify-between">
            <div className="relative flex-1 min-w-[240px] max-w-md w-full">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="form-input pl-9 text-xs w-full"
                placeholder="Search course code, subject, instructor, room, section, SY…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <select
                className="form-input text-xs py-1.5 px-3 bg-white font-bold text-[#7A0808] border-[#FFD0D0]"
                value={schoolYearFilter}
                onChange={(e) => setSchoolYearFilter(e.target.value)}
              >
                <option value="all">All School Years ({courseEntries.length})</option>
                {availableSchoolYears.map((sy) => (
                  <option key={sy.value} value={sy.value}>
                    {sy.label}
                  </option>
                ))}
              </select>

              {scheduleSubTab === 'entries' && (
                <>
                  <select
                    className="form-input text-xs py-1.5 px-3 bg-white"
                    value={dayFilter}
                    onChange={(e) => setDayFilter(e.target.value)}
                  >
                    <option value="all">All Days</option>
                    {SCHEDULE_DAYS.map((d, idx) => (
                      <option key={d} value={idx}>
                        {d}
                      </option>
                    ))}
                  </select>

                  <select
                    className="form-input text-xs py-1.5 px-3 bg-white"
                    value={semesterFilter}
                    onChange={(e) => setSemesterFilter(e.target.value)}
                  >
                    <option value="all">All Semesters</option>
                    <option value="1">1st Semester</option>
                    <option value="2">2nd Semester</option>
                    <option value="3">Summer Term</option>
                  </select>

                  <select
                    className="form-input text-xs py-1.5 px-3 bg-white"
                    value={modeFilter}
                    onChange={(e) => setModeFilter(e.target.value)}
                  >
                    <option value="all">All Modes</option>
                    <option value="regular">Regular Classes</option>
                    <option value="exam">Exam Schedules</option>
                  </select>
                </>
              )}
            </div>
          </div>

          {scheduleSubTab === 'entries' ? (
            loading ? (
              <TableSkeleton rows={6} cols={9} />
            ) : (
              <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                            checked={
                              filteredCourseEntries.length > 0 &&
                              selectedItems.size === filteredCourseEntries.length
                            }
                            onChange={() => toggleSelectAll(filteredCourseEntries, (e) => e.docPath)}
                            title="Select all matching"
                          />
                        </th>
                        <th className="py-3 px-4">Course / Subject</th>
                        <th className="py-3 px-4">School Year & Sem</th>
                        <th className="py-3 px-4">Section & Program</th>
                        <th className="py-3 px-4">Instructor</th>
                        <th className="py-3 px-4">Day & Time</th>
                        <th className="py-3 px-4">Assigned Room</th>
                        <th className="py-3 px-4">Type / Mode</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCourseEntries.map((e) => {
                        const title = e.title || e.subject || 'Course';
                        const code = e.courseCode || e.course || '';
                        const sec = e.section || e.sectionName || e.pathSection || 'N/A';
                        const inst = e.instructorFullName || e.instructor || 'Unassigned';
                        const syLabel = e.schoolYearDisplay || `SY ${e.schoolYear || '2026-2027'}`;
                        const semLabel = e.semester ? `Sem ${e.semester}` : 'Term 1';
                        const dayName =
                          typeof e.day === 'number' && SCHEDULE_DAYS[e.day]
                            ? SCHEDULE_DAYS[e.day]
                            : e.date || 'Day';
                        const start = e.startHour ?? e.start ?? 7;
                        const end = e.endHour ?? e.end ?? 8;
                        const time = `${formatScheduleHour(start)} – ${formatScheduleHour(end)}`;
                        const isExam = (e.scheduleMode || '').toLowerCase() === 'exam';
                        const isSelected = selectedItems.has(e.docPath);

                        return (
                          <tr
                            key={e.docPath || e.id}
                            className={`border-b border-gray-50 transition-colors ${
                              isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                            }`}
                          >
                            <td className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                                checked={isSelected}
                                onChange={() => toggleSelect(e.docPath)}
                              />
                            </td>

                            <td className="py-3 px-4">
                              <p className="font-bold text-gray-900 leading-tight">
                                {code ? `${code} · ` : ''}{title}
                              </p>
                              <p className="text-[10px] font-mono text-gray-400 mt-0.5 truncate max-w-[170px]">
                                ID: {e.id}
                              </p>
                            </td>

                            <td className="py-3 px-4">
                              <div className="space-y-0.5">
                                <span className="inline-block font-black text-[10px] text-[#7A0808] bg-[#FFF0F0] border border-[#FFD0D0] px-2 py-0.5 rounded-md">
                                  {syLabel}
                                </span>
                                <p className="text-[10px] text-gray-500 font-semibold">{semLabel}</p>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-xs text-gray-900 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md">
                                  {sec}
                                </span>
                                {e.program && (
                                  <span className="text-[10px] font-semibold text-gray-500">
                                    {e.program}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <p className="font-bold text-gray-800">{inst}</p>
                              {e.instructorEmail && (
                                <p className="text-[10px] text-gray-400 truncate max-w-[140px]">
                                  {e.instructorEmail}
                                </p>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <p className="font-bold text-gray-900">{dayName}</p>
                              <p className="text-[10px] font-medium text-[#7A0808]">{time}</p>
                            </td>

                            <td className="py-3 px-4">
                              <p className="font-bold text-gray-900">{e.roomCode || e.room || 'TBA'}</p>
                              {e.buildingName && <p className="text-[10px] text-gray-500">{e.buildingName}</p>}
                            </td>

                            <td className="py-3 px-4">
                              <span
                                className={`inline-block font-bold text-[10px] uppercase px-2 py-0.5 rounded-full border ${
                                  isExam
                                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                                    : 'bg-red-50 text-[#7A0808] border-red-200'
                                }`}
                              >
                                {isExam ? 'Exam' : e.type || 'Lecture'}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setViewSchedule(e)}
                                  className="p-1.5 hover:bg-gray-100 text-gray-600 hover:text-gray-900 rounded-lg transition-colors cursor-pointer"
                                  title="View Details"
                                >
                                  <Eye size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setItemToDelete({
                                      type: 'schedule_entry',
                                      docPath: e.docPath,
                                      title: `${code || title} (${sec})`,
                                    })
                                  }
                                  className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Record"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredCourseEntries.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-gray-400 font-medium">
                            No class schedule entries found matching your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : (
            <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                          checked={
                            filteredPlotRequests.length > 0 &&
                            selectedItems.size === filteredPlotRequests.length
                          }
                          onChange={() => toggleSelectAll(filteredPlotRequests, (p) => p.id)}
                          title="Select all matching"
                        />
                      </th>
                      <th className="py-3 px-4">Request Title</th>
                      <th className="py-3 px-4">School Year & Sem</th>
                      <th className="py-3 px-4">Recipients / Deans</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlotRequests.map((p) => {
                      const isSelected = selectedItems.has(p.id);
                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-gray-50 transition-colors ${
                            isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleSelect(p.id)}
                            />
                          </td>
                          <td className="py-3 px-4 font-bold text-gray-900">{p.title}</td>
                          <td className="py-3 px-4 text-gray-700">
                            {p.schoolYearLabel || p.schoolYearId || '—'} · Sem {p.semester || 1}
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {(p.recipients || []).length} assigned dean(s)
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-[10px] uppercase bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full">
                              {p.status || 'Active'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setItemToDelete({
                                  type: 'plot_request',
                                  id: p.id,
                                  title: p.title,
                                })
                              }
                              className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="Delete Request"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredPlotRequests.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-400 font-medium">
                          No plot requests found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. FACILITY MAINTENANCE TAB                                              */}
      {/* ========================================================================= */}
      {activeTab === 'maintenance' && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMaintenanceSubTab('schedules');
                setSelectedItems(new Set());
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                maintenanceSubTab === 'schedules'
                  ? 'bg-[#7A0808] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Maintenance Schedules ({maintenanceSchedules.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setMaintenanceSubTab('reports');
                setSelectedItems(new Set());
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                maintenanceSubTab === 'reports'
                  ? 'bg-[#7A0808] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Issue Reports ({maintenanceReports.length})
            </button>
          </div>

          {/* Maintenance Table Content */}
          {maintenanceSubTab === 'schedules' ? (
            <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                          checked={
                            filteredMaintenanceSchedules.length > 0 &&
                            selectedItems.size === filteredMaintenanceSchedules.length
                          }
                          onChange={() => toggleSelectAll(filteredMaintenanceSchedules, (s) => s.id)}
                          title="Select all matching"
                        />
                      </th>
                      <th className="py-3 px-4">Room & Building</th>
                      <th className="py-3 px-4">Reason / Purpose</th>
                      <th className="py-3 px-4">Schedule Dates</th>
                      <th className="py-3 px-4">Type / Time</th>
                      <th className="py-3 px-4">Scheduled By</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaintenanceSchedules.map((s) => {
                      const isSelected = selectedItems.has(s.id);
                      return (
                        <tr
                          key={s.id}
                          className={`border-b border-gray-50 transition-colors ${
                            isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleSelect(s.id)}
                            />
                          </td>

                          <td className="py-3 px-4">
                            <p className="font-bold text-gray-900">{s.roomName || 'Room'}</p>
                            <p className="text-[10px] text-gray-500">{s.buildingName || 'Building'}</p>
                          </td>

                          <td className="py-3 px-4">
                            <p className="font-medium text-gray-800 line-clamp-1 max-w-[200px]">
                              {s.reason || 'Maintenance work'}
                            </p>
                          </td>

                          <td className="py-3 px-4 font-bold text-[#7A0808]">
                            {s.startDate} to {s.endDate}
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-bold text-[10px] uppercase bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                              {s.durationType === 'hours' ? `Quick Fix (${s.durationHours || 2}h)` : 'Full Days'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-gray-700 font-medium">
                            {s.scheduledByName || 'GSD Staff'}
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-bold text-[10px] uppercase bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full">
                              {s.status || 'Scheduled'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewMaintenance({ ...s, isSchedule: true })}
                                className="p-1.5 hover:bg-gray-100 text-gray-600 hover:text-gray-900 rounded-lg transition-colors cursor-pointer"
                                title="View Details"
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setItemToDelete({
                                    type: 'maintenance_schedule',
                                    id: s.id,
                                    title: s.roomName,
                                  })
                                }
                                className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Delete Record"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredMaintenanceSchedules.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-gray-400 font-medium">
                          No maintenance schedules found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                          checked={
                            filteredMaintenanceReports.length > 0 &&
                            selectedItems.size === filteredMaintenanceReports.length
                          }
                          onChange={() => toggleSelectAll(filteredMaintenanceReports, (r) => r.id)}
                          title="Select all matching"
                        />
                      </th>
                      <th className="py-3 px-4">Room & Building</th>
                      <th className="py-3 px-4">Reported Issue</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Reported By</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaintenanceReports.map((r) => {
                      const isSelected = selectedItems.has(r.id);
                      return (
                        <tr
                          key={r.id}
                          className={`border-b border-gray-50 transition-colors ${
                            isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleSelect(r.id)}
                            />
                          </td>

                          <td className="py-3 px-4">
                            <p className="font-bold text-gray-900">{r.roomName || 'Room'}</p>
                            <p className="text-[10px] text-gray-500">{r.buildingName || 'Building'}</p>
                          </td>

                          <td className="py-3 px-4">
                            <p className="font-medium text-gray-800 line-clamp-2 max-w-[240px]">
                              {r.issue || 'Issue reported'}
                            </p>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`font-bold text-[10px] uppercase px-2 py-0.5 rounded-full ${
                                r.priority === 'urgent'
                                  ? 'bg-rose-600 text-white'
                                  : r.priority === 'high'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {r.priority || 'medium'}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <p className="font-bold text-gray-800">{r.reportedByName || 'Staff'}</p>
                            <p className="text-[10px] text-gray-400">{r.reportedByEmail}</p>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-bold text-[10px] uppercase bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                              {r.status || 'Pending'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewMaintenance({ ...r, isReport: true })}
                                className="p-1.5 hover:bg-gray-100 text-gray-600 hover:text-gray-900 rounded-lg transition-colors cursor-pointer"
                                title="View Details"
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setItemToDelete({
                                    type: 'maintenance_report',
                                    id: r.id,
                                    title: r.roomName,
                                  })
                                }
                                className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Delete Record"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredMaintenanceReports.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400 font-medium">
                          No maintenance issue reports found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. BUILDINGS & FACILITIES TAB                                            */}
      {/* ========================================================================= */}
      {activeTab === 'buildings' && (
        <div className="mt-4 space-y-4">
          <div className="relative max-w-md w-full">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="form-input pl-9 text-xs w-full"
              placeholder="Search building name, code, ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                        checked={
                          filteredBuildings.length > 0 &&
                          selectedItems.size === filteredBuildings.length
                        }
                        onChange={() => toggleSelectAll(filteredBuildings, (b) => b.id)}
                        title="Select all matching"
                      />
                    </th>
                    <th className="py-3 px-4">Building Name</th>
                    <th className="py-3 px-4">Building Code</th>
                    <th className="py-3 px-4">Total Floors</th>
                    <th className="py-3 px-4">Floors / Layout Data</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBuildings.map((b) => {
                    const isSelected = selectedItems.has(b.id);
                    const floorCount = Array.isArray(b.floorData) ? b.floorData.length : (b.floors || 0);
                    return (
                      <tr
                        key={b.id}
                        className={`border-b border-gray-50 transition-colors ${
                          isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleSelect(b.id)}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-gray-900">{b.name}</p>
                          <p className="text-[10px] font-mono text-gray-400">ID: {b.id}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-black text-xs text-[#7A0808] bg-[#FFF0F0] px-2.5 py-0.5 rounded-md">
                            {b.code || b.buildingCode || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-800">{floorCount} floor(s)</td>
                        <td className="py-3 px-4 text-gray-500">
                          {Array.isArray(b.floorData) ? `${b.floorData.reduce((acc, f) => acc + (f.rooms?.length || 0), 0)} total rooms configured` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewGeneric({ item: b, categoryTitle: 'Building', icon: Building })}
                              className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg cursor-pointer"
                              title="View Details"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setItemToDelete({ type: 'building', id: b.id, title: b.name })}
                              className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg cursor-pointer"
                              title="Delete Building"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredBuildings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-400 font-medium">
                        No buildings found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. COLLEGES & SECTIONS TAB                                               */}
      {/* ========================================================================= */}
      {activeTab === 'colleges' && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCollegeSubTab('colleges');
                setSelectedItems(new Set());
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                collegeSubTab === 'colleges'
                  ? 'bg-[#7A0808] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Colleges ({colleges.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setCollegeSubTab('sections');
                setSelectedItems(new Set());
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                collegeSubTab === 'sections'
                  ? 'bg-[#7A0808] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Program Sections ({programSections.length})
            </button>
          </div>

          <div className="relative max-w-md w-full">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="form-input pl-9 text-xs w-full"
              placeholder="Search college, program, section…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {collegeSubTab === 'colleges' ? (
            <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                          checked={
                            filteredColleges.length > 0 &&
                            selectedItems.size === filteredColleges.length
                          }
                          onChange={() => toggleSelectAll(filteredColleges, (c) => c.id)}
                          title="Select all matching"
                        />
                      </th>
                      <th className="py-3 px-4">College Code</th>
                      <th className="py-3 px-4">College Name</th>
                      <th className="py-3 px-4">Assigned Dean</th>
                      <th className="py-3 px-4">Programs</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredColleges.map((c) => {
                      const isSelected = selectedItems.has(c.id);
                      return (
                        <tr
                          key={c.id}
                          className={`border-b border-gray-50 transition-colors ${
                            isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleSelect(c.id)}
                            />
                          </td>
                          <td className="py-3 px-4 font-black text-xs text-[#7A0808]">{c.code}</td>
                          <td className="py-3 px-4 font-bold text-gray-900">{c.name}</td>
                          <td className="py-3 px-4 text-gray-700 font-medium">{c.deanName || c.deanEmail || 'Unassigned'}</td>
                          <td className="py-3 px-4 text-gray-500">{(c.programs || []).length} degree programs</td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewGeneric({ item: c, categoryTitle: 'College', icon: GraduationCap })}
                                className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg cursor-pointer"
                                title="View Details"
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setItemToDelete({ type: 'college', id: c.id, title: c.name || c.code })}
                                className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg cursor-pointer"
                                title="Delete College"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredColleges.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-400 font-medium">
                          No colleges found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                          checked={
                            filteredProgramSections.length > 0 &&
                            selectedItems.size === filteredProgramSections.length
                          }
                          onChange={() => toggleSelectAll(filteredProgramSections, (s) => s.id)}
                          title="Select all matching"
                        />
                      </th>
                      <th className="py-3 px-4">Program</th>
                      <th className="py-3 px-4">Year Level</th>
                      <th className="py-3 px-4">Sections</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProgramSections.map((s) => {
                      const isSelected = selectedItems.has(s.id);
                      return (
                        <tr
                          key={s.id}
                          className={`border-b border-gray-50 transition-colors ${
                            isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleSelect(s.id)}
                            />
                          </td>
                          <td className="py-3 px-4 font-black text-xs text-[#7A0808]">{s.programCode}</td>
                          <td className="py-3 px-4 font-bold text-gray-800">{s.yearLabel}</td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {(s.sections || []).map((sec) => (
                                <span key={sec} className="bg-gray-100 font-bold text-[10px] px-2 py-0.5 rounded-md">
                                  {sec}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setItemToDelete({ type: 'program_section', id: s.id, title: `${s.programCode} ${s.yearLabel}` })}
                              className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg cursor-pointer"
                              title="Delete Section Set"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredProgramSections.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-400 font-medium">
                          No program sections found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. COURSE CATALOG TAB                                                    */}
      {/* ========================================================================= */}
      {activeTab === 'courses' && (
        <div className="mt-4 space-y-4">
          <div className="relative max-w-md w-full">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="form-input pl-9 text-xs w-full"
              placeholder="Search course code, subject title, college, teacher…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                        checked={
                          filteredCourses.length > 0 &&
                          selectedItems.size === filteredCourses.length
                        }
                        onChange={() => toggleSelectAll(filteredCourses, (c) => c.id)}
                        title="Select all matching"
                      />
                    </th>
                    <th className="py-3 px-4">Course Code & Title</th>
                    <th className="py-3 px-4">College & Program</th>
                    <th className="py-3 px-4">Units & Hours</th>
                    <th className="py-3 px-4">Assigned Instructor</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCourses.map((c) => {
                    const isSelected = selectedItems.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-gray-50 transition-colors ${
                          isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleSelect(c.id)}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-gray-900">{c.code} · {c.title}</p>
                          <p className="text-[10px] text-gray-400 font-medium">{c.yearLevel || '1st Year'} · {c.semester || '1st Semester'}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-xs text-[#7A0808] bg-[#FFF0F0] px-2 py-0.5 rounded-md">
                            {c.collegeCode || c.programCode || 'General'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-800">
                          {c.units || 3} units ({c.type || 'Lecture'})
                        </td>
                        <td className="py-3 px-4 text-gray-700 font-medium">
                          {c.assignedTeacherName || 'Unassigned'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewGeneric({ item: c, categoryTitle: 'Course Subject', icon: BookOpen })}
                              className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg cursor-pointer"
                              title="View Details"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setItemToDelete({ type: 'course', id: c.id, title: `${c.code} · ${c.title}` })}
                              className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg cursor-pointer"
                              title="Delete Course"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredCourses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-400 font-medium">
                        No courses found in catalog.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. ACADEMIC CALENDAR & NO CLASS DAYS TAB                                 */}
      {/* ========================================================================= */}
      {activeTab === 'calendars' && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCalendarSubTab('calendars');
                setSelectedItems(new Set());
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                calendarSubTab === 'calendars'
                  ? 'bg-[#7A0808] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              School Year Calendars ({academicCalendars.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setCalendarSubTab('no_class_days');
                setSelectedItems(new Set());
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                calendarSubTab === 'no_class_days'
                  ? 'bg-[#7A0808] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              No Class Days ({noClassDays.length})
            </button>
          </div>

          <div className="relative max-w-md w-full">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="form-input pl-9 text-xs w-full"
              placeholder="Search school year, holiday, reason…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {calendarSubTab === 'calendars' ? (
            <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                          checked={
                            filteredCalendars.length > 0 &&
                            selectedItems.size === filteredCalendars.length
                          }
                          onChange={() => toggleSelectAll(filteredCalendars, (c) => c.id)}
                          title="Select all matching"
                        />
                      </th>
                      <th className="py-3 px-4">School Year</th>
                      <th className="py-3 px-4">Semester 1 Window</th>
                      <th className="py-3 px-4">Semester 2 Window</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCalendars.map((c) => {
                      const isSelected = selectedItems.has(c.id);
                      return (
                        <tr
                          key={c.id}
                          className={`border-b border-gray-50 transition-colors ${
                            isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleSelect(c.id)}
                            />
                          </td>
                          <td className="py-3 px-4 font-black text-xs text-[#7A0808]">
                            {c.displayLabel || c.label || c.id}
                          </td>
                          <td className="py-3 px-4 text-gray-800 font-medium">
                            {c.semester1Start || '—'} to {c.semester1End || '—'}
                          </td>
                          <td className="py-3 px-4 text-gray-800 font-medium">
                            {c.semester2Start || '—'} to {c.semester2End || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewGeneric({ item: c, categoryTitle: 'Academic Calendar', icon: Clock })}
                                className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg cursor-pointer"
                                title="View Details"
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setItemToDelete({ type: 'academic_calendar', id: c.id, title: c.label || c.id })}
                                className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg cursor-pointer"
                                title="Delete Calendar"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredCalendars.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-400 font-medium">
                          No calendars found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                          checked={
                            filteredNoClassDays.length > 0 &&
                            selectedItems.size === filteredNoClassDays.length
                          }
                          onChange={() => toggleSelectAll(filteredNoClassDays, (d) => d.id)}
                          title="Select all matching"
                        />
                      </th>
                      <th className="py-3 px-4">Title / Holiday</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Reason / Notes</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNoClassDays.map((d) => {
                      const isSelected = selectedItems.has(d.id);
                      return (
                        <tr
                          key={d.id}
                          className={`border-b border-gray-50 transition-colors ${
                            isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleSelect(d.id)}
                            />
                          </td>
                          <td className="py-3 px-4 font-bold text-gray-900">{d.title}</td>
                          <td className="py-3 px-4 font-bold text-[#7A0808]">{d.date}</td>
                          <td className="py-3 px-4 text-gray-600">{d.reason || d.description || '—'}</td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setItemToDelete({ type: 'no_class_day', id: d.id, title: d.title })}
                              className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg cursor-pointer"
                              title="Delete Day"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredNoClassDays.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-400 font-medium">
                          No special no-class days found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. APPROVAL WORKFLOWS TAB                                                */}
      {/* ========================================================================= */}
      {activeTab === 'workflows' && (
        <div className="mt-4 space-y-4">
          <div className="relative max-w-md w-full">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="form-input pl-9 text-xs w-full"
              placeholder="Search workflow name, type…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                        checked={
                          filteredWorkflows.length > 0 &&
                          selectedItems.size === filteredWorkflows.length
                        }
                        onChange={() => toggleSelectAll(filteredWorkflows, (w) => w.id)}
                        title="Select all matching"
                      />
                    </th>
                    <th className="py-3 px-4">Workflow Name</th>
                    <th className="py-3 px-4">Workflow Type</th>
                    <th className="py-3 px-4">Approval Steps Count</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkflows.map((w) => {
                    const isSelected = selectedItems.has(w.id);
                    return (
                      <tr
                        key={w.id}
                        className={`border-b border-gray-50 transition-colors ${
                          isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50/60'
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleSelect(w.id)}
                          />
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-900">{w.name || w.id}</td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-xs uppercase bg-[#FFF0F0] text-[#7A0808] px-2 py-0.5 rounded-md">
                            {w.type || 'Standard'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-700">
                          {(w.steps || []).length} sequential steps
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewGeneric({ item: w, categoryTitle: 'Approval Workflow', icon: GitBranch })}
                              className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg cursor-pointer"
                              title="View Details"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setItemToDelete({ type: 'approval_workflow', id: w.id, title: w.name || w.id })}
                              className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg cursor-pointer"
                              title="Delete Workflow"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredWorkflows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-gray-400 font-medium">
                        No workflows found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS: DETAILS INSPECTORS & DELETION CONFIRMATION                         */}
      {/* ========================================================================= */}
      {viewUser && (
        <DeveloperUserDetailsModal
          user={viewUser}
          currentUid={currentUid}
          onClose={() => setViewUser(null)}
          onDelete={(u) =>
            setItemToDelete({
              type: 'user',
              uid: u.uid || u.id,
              title: u.displayName || u.name || u.email,
            })
          }
        />
      )}

      {viewReservation && (
        <DeveloperReservationDetailsModal
          reservation={viewReservation}
          onClose={() => setViewReservation(null)}
          onDelete={(r) =>
            setItemToDelete({
              type: 'reservation',
              id: r.id,
              title: r.title || r.activity,
            })
          }
        />
      )}

      {viewSchedule && (
        <DeveloperScheduleDetailsModal
          schedule={viewSchedule}
          onClose={() => setViewSchedule(null)}
          onDelete={(s) =>
            setItemToDelete({
              type: 'schedule_entry',
              docPath: s.docPath,
              title: `${s.courseCode || s.title} (${s.section || s.pathSection})`,
            })
          }
        />
      )}

      {viewMaintenance && (
        <DeveloperMaintenanceDetailsModal
          item={viewMaintenance}
          onClose={() => setViewMaintenance(null)}
          onDelete={(m) =>
            setItemToDelete({
              type: m.isSchedule || m.startDate ? 'maintenance_schedule' : 'maintenance_report',
              id: m.id,
              title: m.roomName,
            })
          }
        />
      )}

      {viewGeneric && (
        <DeveloperGenericDetailsModal
          item={viewGeneric.item}
          categoryTitle={viewGeneric.categoryTitle}
          icon={viewGeneric.icon}
          onClose={() => setViewGeneric(null)}
          onDelete={(item) =>
            setItemToDelete({
              type: viewGeneric.categoryTitle.toLowerCase().replace(/\s+/g, '_'),
              id: item.id,
              title: item.name || item.title || item.code || item.id,
            })
          }
        />
      )}

      {itemToDelete && (
        <ConfirmModal
          title={itemToDelete.isBatch ? 'Confirm Batch Deletion' : 'Confirm Permanent Deletion'}
          message={
            itemToDelete.isBatch
              ? `Are you sure you want to permanently delete all ${itemToDelete.count} selected record(s)? This operation removes the documents from Firestore and cannot be undone.`
              : `Are you sure you want to permanently delete "${itemToDelete.title || itemToDelete.name || itemToDelete.roomName || itemToDelete.id}"? This action removes the document from Firestore and cannot be undone.`
          }
          confirmText={itemToDelete.isBatch ? `Delete ${itemToDelete.count} Record(s)` : 'Delete Record'}
          cancelText="Cancel"
          variant="danger"
          isProcessing={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setItemToDelete(null)}
        />
      )}
    </DeveloperLayout>
  );
}
