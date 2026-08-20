import React, { useEffect, useMemo, useState } from 'react';
import { getInitialWeekStart, getSemesterForDate, getMondayOfWeek, getSemesterWeekNumber, isScheduleActiveOnWeek } from '../utils/academicCalendarUtils';
import { addDays, SCHEDULE_START_HOUR, SCHEDULE_END_HOUR } from '../constants/scheduleGrid';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Printer, MapPin, Clock, Users, Wrench, Edit2, Calendar as CalendarIcon, AlertTriangle, ChevronDown } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { useAcademicCalendar } from '../hooks/useAcademicCalendar';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import EditRoomModal from '../components/modals/EditRoomModal';
import WeeklyScheduleGrid from '../components/scheduling/WeeklyScheduleGrid';
import AddPlotEntryModalEnhanced from '../components/modals/AddPlotEntryModalEnhanced';
import { subscribeApprovedReservationsForRoom } from '../services/reservationService';
import { RESERVATION_STATUS } from '../constants/approvalWorkflow';
import { getRoomMaintenanceSchedule, subscribeMaintenanceSchedules } from '../services/maintenanceService';
import {
  subscribeAllPlotEntriesForRoom,
  addPlotEntryForSection,
  createDeanSection,
  subscribeDeanSections,
} from '../services/plotScheduleService';
import ScheduleMaintenanceModal from '../components/modals/ScheduleMaintenanceModal';
import ReportMaintenanceModal from '../components/modals/ReportMaintenanceModal';
import { useModal } from '../hooks/useModal';
import ProgressStatCards from '../components/ProgressStatCards';
import DatePicker, { CalendarCard } from '../components/ui/DatePicker';

const sampleSchedules = [];

export default function RoomDetails() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { id } = useParams();
  const { buildingList, requests = [] } = useApp();
  const { calendarData } = useAcademicCalendar();

  let room = state?.room;
  let buildingId = state?.buildingId;
  let buildingName = state?.buildingName || '';
  let floor = state?.floor || 1;
  let floorId = state?.floorId;

  if (!room) {
    for (const b of buildingList) {
      for (const f of b.floorData) {
        const found = f.rooms.find((r) => r.id === id || r.roomCode === id);
        if (found) {
          room = found;
          buildingId = b.id;
          buildingName = b.name;
          floor = f.floor;
          floorId = f.floorId;
          break;
        }
      }
      if (room) break;
    }
  }

  const liveRoom = useMemo(() => {
    if (!buildingId || !floorId) return room;
    const building = buildingList.find((b) => String(b.id) === String(buildingId));
    const floorEntry = building?.floorData?.find((f) => f.floorId === floorId);
    const docId = room?.docId;
    if (docId && floorEntry) {
      return floorEntry.rooms.find((r) => r.docId === docId) || room;
    }
    return floorEntry?.rooms?.find((r) => r.id === id) || room;
  }, [buildingList, buildingId, floorId, room, id]);

  const displayRoom = liveRoom || room;

  const { canEditRoom, canSubmitCourseSchedule, canSubmitReservation, isRegistrar, canManageRoomMaintenance, isGsd } = useRolePermissions();
  const { openReservation, modals } = useRoomReservationFlow();
  const { showNotification } = useModal();
  const [scheduleTab, setScheduleTab] = useState('regular');
  const [semesterTab, setSemesterTab] = useState('1');
  const [weekStartDate, setWeekStartDate] = useState(() => getInitialWeekStart(null));
  const [showEditRoom, setShowEditRoom] = useState(false);
  const [approvedReservations, setApprovedReservations] = useState([]);
  const [courseSchedules, setCourseSchedules] = useState([]); // Course schedules from all deans
  const [maintenanceSchedules, setMaintenanceSchedules] = useState([]);
  const { profile } = useAuth();
  const isDean = profile?.role === ROLES.DEAN || profile?.role === 'dean';
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [deanSections, setDeanSections] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showScheduleMaintenance, setShowScheduleMaintenance] = useState(false);
  const [showReportMaintenance, setShowReportMaintenance] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  // Subscribe to Dean's sections if dean is logged in
  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeDeanSections(
      profile.uid,
      (secs) => setDeanSections(secs),
      (err) => console.error('Error loading dean sections in RoomDetails:', err)
    );
  }, [profile?.uid]);

  const currentBuildingObj = useMemo(() => {
    return (
      buildingList.find(
        (b) => b.id === buildingId || b.name === buildingName || b.docId === buildingId
      ) || null
    );
  }, [buildingList, buildingId, buildingName]);

  const handleSaveScheduleFromRoom = async (entryData) => {
    const targetDeanUid = entryData.deanUid || profile?.uid;
    const targetSection = entryData.section || deanSections[0]?.name || 'Section 1';

    // Auto-create section document if needed
    if (deanSections.length === 0 && targetDeanUid) {
      try {
        await createDeanSection(targetDeanUid, targetSection, entryData.yearLevel || '1st Year', 'regular');
      } catch (e) {
        console.warn('Auto create section note:', e);
      }
    }

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    let computedDay = entryData.day;
    if (computedDay === undefined || computedDay === null || computedDay < 0) {
      if (entryData.date) {
        const foundIdx = dayNames.findIndex(d => d.toLowerCase() === String(entryData.date).toLowerCase());
        if (foundIdx >= 0) computedDay = foundIdx;
      }
    }

    await addPlotEntryForSection(targetDeanUid, targetSection, {
      ...entryData,
      day: computedDay !== undefined && computedDay !== null && computedDay >= 0 ? computedDay : 0,
      semester: semesterTab,
      scheduleMode: scheduleTab,
      section: targetSection,
      roomCode: displayRoom.id || displayRoom.roomCode || displayRoom.name,
      buildingId: buildingId,
      buildingName: buildingName,
      floor: floor,
    });

    setShowAddScheduleModal(false);
    showNotification({
      type: 'success',
      title: 'Schedule Added',
      message: `Schedule block for ${entryData.title || entryData.courseCode} has been added to ${displayRoom.name || displayRoom.id || displayRoom.roomCode}.`,
      autoCloseMs: 3000,
    });
  };

  const handleMaintenanceScheduled = () => {
    showNotification({
      type: 'success',
      title: 'Maintenance scheduled',
      message: 'Room maintenance has been scheduled successfully.',
      autoCloseMs: 3000,
    });
  };

  const handleMaintenanceReported = () => {
    showNotification({
      type: 'success',
      title: 'Report submitted',
      message: 'Your maintenance report has been submitted to GSD.',
      autoCloseMs: 3000,
    });
  };

  // Handle date selection from calendar
  const handleDateSelect = (e) => {
    const selectedDate = new Date(e.target.value + 'T00:00:00');
    // Find the Monday of the selected week
    const dayOfWeek = selectedDate.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust to get Monday
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() + diff);
    setWeekStartDate(monday);
    setShowDatePicker(false);
  };

  // Format date for input (YYYY-MM-DD)
  const formatDateForInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Subscribe to approved reservations for this room
  useEffect(() => {
    const targetRoomId = displayRoom?.docId || displayRoom?.id;
    const targetRoomCode = displayRoom?.roomCode || displayRoom?.id || displayRoom?.name;
    if (!targetRoomId && !targetRoomCode) return;
    
    const unsubscribe = subscribeApprovedReservationsForRoom(
      targetRoomId,
      (reservations) => {
        console.log('[RoomDetails] Received approved reservations:', reservations);
        if (Array.isArray(reservations) && reservations.length > 0) {
          setApprovedReservations(reservations);
        }
      },
      (error) => {
        console.warn('[RoomDetails] Note on reservations listener:', error?.message || error);
      },
      targetRoomCode
    );

    return () => unsubscribe();
  }, [displayRoom?.docId, displayRoom?.id, displayRoom?.roomCode, displayRoom?.name]);

  // Aggregate approved reservations from direct listener and global requests in useApp()
  const effectiveApprovedReservations = useMemo(() => {
    const candidates = [];
    const seenIds = new Set();

    if (Array.isArray(approvedReservations) && approvedReservations.length > 0) {
      approvedReservations.forEach((r) => {
        if (r?.id && !seenIds.has(r.id)) {
          seenIds.add(r.id);
          candidates.push(r);
        }
      });
    }

    if (Array.isArray(requests) && requests.length > 0) {
      requests.forEach((r) => {
        if (r?.id && !seenIds.has(r.id)) {
          const isApproved = r.status === 'Approved' || r.status === 'approved' || r.status === RESERVATION_STATUS.APPROVED;
          if (isApproved) {
            seenIds.add(r.id);
            candidates.push(r);
          }
        }
      });
    }

    const targetRoomId = String(displayRoom?.docId || displayRoom?.id || '').trim().toLowerCase();
    const targetRoomCode = String(displayRoom?.roomCode || displayRoom?.id || displayRoom?.name || '').trim().toLowerCase();

    return candidates.filter((res) => {
      const isApproved = res.status === 'Approved' || res.status === 'approved' || res.status === RESERVATION_STATUS.APPROVED;
      if (!isApproved) return false;

      const rRoomId = String(res.roomId || res.roomDocId || '').trim().toLowerCase();
      const rRoom = String(res.room || '').trim().toLowerCase();
      const rVenue = String(res.designatedVenue || res.venue || '').trim().toLowerCase();

      const matchId = targetRoomId && (rRoomId === targetRoomId || rRoom === targetRoomId);
      const matchCode = targetRoomCode && (rRoom === targetRoomCode || rRoomId === targetRoomCode || rVenue.includes(targetRoomCode));
      return matchId || matchCode;
    });
  }, [approvedReservations, requests, displayRoom]);

  // Subscribe to course schedules for this room (from ALL deans)
  useEffect(() => {
    if (!displayRoom?.id && !displayRoom?.roomCode) return;
    
    const roomCode = displayRoom.id || displayRoom.roomCode;
    
    console.log('[RoomDetails] Subscribing to course schedules for room:', roomCode);
    
    const unsubscribe = subscribeAllPlotEntriesForRoom(
      roomCode,
      semesterTab,
      'regular', // Only get regular schedules (not exam schedules)
      (schedules) => {
        console.log(`[RoomDetails] Loaded ${schedules.length} course schedules for room ${roomCode}:`, schedules);
        setCourseSchedules(schedules);
      },
      (error) => console.error('[RoomDetails] Error loading course schedules:', error)
    );

    return () => {
      console.log('[RoomDetails] Unsubscribing from course schedules');
      unsubscribe();
    };
  }, [displayRoom?.id, displayRoom?.roomCode, semesterTab]);

  // Subscribe to maintenance schedules for this room
  useEffect(() => {
    const targetRoomId = displayRoom?.docId || displayRoom?.id;
    if (!targetRoomId) return;
    
    console.log('[RoomDetails] Subscribing to maintenance schedules for room:', targetRoomId);
    
    const unsubscribe = subscribeMaintenanceSchedules(
      (schedules) => {
        console.log('[RoomDetails] Received maintenance schedules:', schedules);
        setMaintenanceSchedules(schedules);
      },
      (error) => console.error('Error loading maintenance schedules:', error),
      { 
        roomId: targetRoomId,
        // No semester filter - maintenance is date-based, not semester-based
      }
    );

    return () => unsubscribe();
  }, [displayRoom?.docId, displayRoom?.id]);

  const configuredSemesters = useMemo(() => {
    if (Array.isArray(calendarData?.config?.semesters) && calendarData.config.semesters.length > 0) {
      return calendarData.config.semesters.map((s, idx) => ({
        value: String(idx + 1),
        label: s.name || (idx === 2 ? 'Summer' : `Semester ${idx + 1}`),
        start: s.start,
        end: s.end,
      }));
    }
    return [
      { value: '1', label: 'Semester 1', start: calendarData?.config?.semester1Start, end: calendarData?.config?.semester1End },
      { value: '2', label: 'Semester 2', start: calendarData?.config?.semester2Start, end: calendarData?.config?.semester2End },
    ];
  }, [calendarData?.config]);

  const activeSemesterObj = useMemo(() => {
    return configuredSemesters.find((s) => s.value === semesterTab) || configuredSemesters[0];
  }, [configuredSemesters, semesterTab]);

  const schoolYearLabel = calendarData?.config?.displayLabel || (calendarData?.config?.label ? `SY ${calendarData.config.label}` : 'Active School Year');

  // Convert reservations, course schedules, and maintenance schedules to schedule blocks for the current week
  const scheduleBlocks = useMemo(() => {
    // Determine semester start date
    const semesterStartStr = activeSemesterObj?.start || null;
    const currentWeekNum = getSemesterWeekNumber(weekStartDate, semesterStartStr);

    // Use timezone-safe date formatting to avoid off-by-one errors
    const formatDateLocal = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStartDate, i);
      return formatDateLocal(date); // Use local date formatting instead of toISOString()
    });

    console.log('[RoomDetails] Week start date:', weekStartDate, 'Day of week:', weekStartDate.getDay(), 'Week num:', currentWeekNum);
    console.log('[RoomDetails] Building schedule blocks for week:', weekDates);
    console.log('[RoomDetails] Course schedules:', courseSchedules);
    console.log('[RoomDetails] Approved reservations:', effectiveApprovedReservations);

    const blocks = [];

    // Add COURSE SCHEDULE blocks (Regular schedules - repeat every week unless OJT)
    courseSchedules.forEach((schedule) => {
      // Check modality (regular, odd-weeks, even-weeks, custom-ojt)
      const modality = schedule.modality || schedule.sectionModality || 'regular';
      const customOjtWeeks = schedule.customOjtWeeks || [];
      if (modality !== 'regular' && !isScheduleActiveOnWeek(modality, currentWeekNum, customOjtWeeks)) {
        console.log(`[RoomDetails] Schedule ${schedule.title} hidden on week ${currentWeekNum} due to OJT modality (${modality})`);
        return; // Temporarily hide schedule on OJT week!
      }

      // schedule.day is 0-6 for Monday-Sunday (from WEEKDAYS array in CourseSchedulingNew)
      const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      let dayIndex = schedule.day;
      if (dayIndex === undefined || dayIndex === null || dayIndex < 0 || dayIndex >= 7) {
        if (schedule.date) {
          const foundIdx = dayNames.indexOf(String(schedule.date).toLowerCase().trim());
          if (foundIdx >= 0) {
            dayIndex = foundIdx;
          } else if (weekDates.includes(schedule.date)) {
            dayIndex = weekDates.indexOf(schedule.date);
          }
        }
      }
      
      if (dayIndex === undefined || dayIndex === null || dayIndex < 0 || dayIndex >= 7) {
        console.warn('[RoomDetails] Invalid day index for schedule:', dayIndex, schedule);
        return; // Invalid day
      }
      
      // Get start and end times - handle both hour numbers and time strings
      let startHour = 0;
      let endHour = 0;
      
      if (typeof schedule.startHour === 'number' && typeof schedule.endHour === 'number') {
        // Data stored as hour numbers (e.g., 7.5 = 7:30 AM)
        startHour = schedule.startHour;
        endHour = schedule.endHour;
      } else if (schedule.startTime && schedule.endTime) {
        // Data stored as time strings (e.g., "07:30")
        const timeToHour = (timeStr) => {
          if (!timeStr) return 0;
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours + minutes / 60;
        };
        startHour = timeToHour(schedule.startTime);
        endHour = timeToHour(schedule.endTime);
      } else {
        console.warn('[RoomDetails] Schedule missing time data:', schedule);
        return; // Skip schedules without valid times
      }

      const block = {
        id: `course-${schedule.id}`,
        day: dayIndex,
        title: schedule.title || schedule.courseCode,
        course: schedule.courseCode || '',
        instructor: schedule.instructor || schedule.deanName,
        start: startHour,
        end: endHour,
        type: schedule.type || 'Lecture',
        roomCode: displayRoom.id || displayRoom.roomCode,
        isCourseSchedule: true,
        college: schedule.college || '',
        section: schedule.sectionName || schedule.section || '',
        program: schedule.program || schedule.programCode || '',
      };

      console.log('[RoomDetails] Adding course schedule block:', block);
      blocks.push(block);
    });

    // Add RESERVATION blocks (Date-specific - only show for matching date)
    effectiveApprovedReservations.forEach((reservation) => {
      let dateStr = reservation.dateOfActivity;
      if (dateStr) {
        dateStr = String(dateStr).trim();
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            } else {
              dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
        }
      }

      const dayIndex = weekDates.indexOf(dateStr);
      if (dayIndex === -1) {
        console.log(`[RoomDetails] Reservation ${reservation.activity || reservation.title} on ${dateStr} not in current week`, weekDates);
        return; // Not in current week
      }

      // Convert time strings (e.g. "09:00", "01:30 PM", "9:30 AM") to hour numbers
      const parseTimeToHour = (timeStr) => {
        if (!timeStr) return 0;
        if (typeof timeStr === 'number') return timeStr;
        let str = String(timeStr).trim();
        const isPM = str.toLowerCase().includes('pm');
        const isAM = str.toLowerCase().includes('am');
        str = str.replace(/[^\d:]/g, '');
        const [hStr, mStr] = str.split(':');
        let h = Number(hStr) || 0;
        const m = Number(mStr) || 0;
        if (isPM && h < 12) h += 12;
        if (isAM && h === 12) h = 0;
        return h + (isNaN(m) ? 0 : m / 60);
      };

      const start = parseTimeToHour(reservation.timeStart);
      const end = parseTimeToHour(reservation.timeEnd);
      if (end <= start) return;

      const resBlock = {
        id: `reservation-${reservation.id}`,
        day: dayIndex,
        title: reservation.activity || reservation.title || 'Room Reservation',
        course: reservation.nameOfOrg || reservation.department || 'Reserved',
        instructor: reservation.requestedBy || reservation.requestor || '',
        start,
        end,
        type: reservation.type === 'academic' ? 'Reservation (Academic)' : 'Reservation (Non-Academic)',
        roomCode: displayRoom.id || displayRoom.roomCode,
        isReservation: true,
      };

      console.log('[RoomDetails] Adding reservation schedule block:', resBlock);
      blocks.push(resBlock);
    });

    // Add maintenance blocks
    console.log('[RoomDetails] Processing maintenance schedules:', maintenanceSchedules);
    maintenanceSchedules.forEach((schedule) => {
      console.log('[RoomDetails] Checking maintenance schedule:', schedule);
      
      // Only show active/scheduled maintenance
      if (schedule.status === 'cancelled' || schedule.status === 'completed') {
        console.log('[RoomDetails] Skipping maintenance - status:', schedule.status);
        return;
      }

      const startDate = schedule.startDate; // YYYY-MM-DD
      const endDate = schedule.endDate || schedule.startDate; // YYYY-MM-DD
      if (!startDate) return;

      console.log('[RoomDetails] Maintenance dates:', { startDate, endDate, weekStartDate, weekDates });

      // Check if this week overlaps with the maintenance period
      const isOverlapping = weekDates.some(date => date >= startDate && date <= endDate);
      
      if (!isOverlapping) {
        console.log('[RoomDetails] Maintenance does not overlap with current week');
        return;
      }

      // Check if this schedule is a quick fix (hours-based)
      const isQuickFix = schedule.durationType === 'hours' || Boolean(schedule.isQuickFix) || schedule.maintenanceType === 'quick_fix';

      // Check each day of the week
      weekDates.forEach((dateStr, dayIndex) => {
        if (dateStr >= startDate && dateStr <= endDate) {
          if (isQuickFix) {
            // For quick fix maintenance, render on matching dates (typically startDate)
            if (dateStr === startDate || startDate === endDate) {
              const parseMaintHour = (timeStr, defaultHour = 8) => {
                if (!timeStr && timeStr !== 0) return defaultHour;
                if (typeof timeStr === 'number') return timeStr;
                let str = String(timeStr).trim();
                const isPM = str.toLowerCase().includes('pm');
                const isAM = str.toLowerCase().includes('am');
                str = str.replace(/[^\d:]/g, '');
                const [hStr, mStr] = str.split(':');
                let h = Number(hStr) || 0;
                const m = Number(mStr) || 0;
                if (isPM && h < 12) h += 12;
                if (isAM && h === 12) h = 0;
                return h + (isNaN(m) ? 0 : m / 60);
              };

              const startHour = parseMaintHour(schedule.startTime, 8);
              const duration = parseFloat(schedule.durationHours || schedule.estimatedDurationHours) || 2;
              const endHour = schedule.endTime ? parseMaintHour(schedule.endTime, startHour + duration) : (startHour + duration);

              console.log(`[RoomDetails] Adding quick fix maintenance block for ${dateStr} at day ${dayIndex}, startHour=${startHour}, endHour=${endHour}`);
              blocks.push({
                id: `maintenance-${schedule.id}-${dateStr}`,
                day: dayIndex,
                title: schedule.title || '🔧 UNDER MAINTENANCE',
                course: schedule.reason || schedule.issueType || 'Scheduled maintenance',
                instructor: schedule.assignedTechnicianName || schedule.technicianName || (schedule.scheduledByName ? `Scheduled by ${schedule.scheduledByName}` : `Quick Fix (${duration}h)`),
                start: Math.max(SCHEDULE_START_HOUR, startHour),
                end: Math.min(SCHEDULE_END_HOUR, Math.max(startHour + 0.5, endHour)),
                type: 'Maintenance',
                roomCode: displayRoom.id || displayRoom.roomCode,
                isMaintenance: true,
                maintenanceData: schedule,
              });
            }
          } else {
            console.log(`[RoomDetails] Adding full day maintenance block for ${dateStr} at day ${dayIndex}`);
            blocks.push({
              id: `maintenance-${schedule.id}-${dateStr}`,
              day: dayIndex,
              title: schedule.title || '🔧 UNDER MAINTENANCE',
              course: schedule.reason || schedule.issueType || 'Room unavailable',
              instructor: schedule.assignedTechnicianName || schedule.technicianName || (schedule.scheduledByName ? `Scheduled by ${schedule.scheduledByName}` : 'Multi-day maintenance'),
              start: SCHEDULE_START_HOUR, // 6 AM
              end: SCHEDULE_END_HOUR, // 8 PM (20)
              type: 'Maintenance',
              roomCode: displayRoom.id || displayRoom.roomCode,
              isMaintenance: true,
              maintenanceData: schedule,
            });
          }
        }
      });
    });

    console.log('[RoomDetails] Final schedule blocks:', blocks);
    return blocks;
  }, [courseSchedules, effectiveApprovedReservations, maintenanceSchedules, weekStartDate, displayRoom]);

  if (!displayRoom) {
    return (
      <Layout title="Room Details">
        <div className="text-center py-20 text-gray-400">Room not found.</div>
      </Layout>
    );
  }

  const statusBadge =
    displayRoom.status === 'Available'
      ? 'badge-available'
      : displayRoom.status === 'Occupied'
        ? 'badge-occupied'
        : 'badge-maintenance';

  const handlePrintSchedule = () => {
    const CELL_H = 19;
    const START_HOUR = 6;
    const END_HOUR = 20;
    const SLOT_COUNT = (END_HOUR - START_HOUR) * 2;
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const TYPE_COLORS = {
      Lecture: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
      Laboratory: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
    };

    const toTitleCase = (str) => {
      if (!str) return '';
      return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    };

    const formatTime = (h) => {
      const hrs = Math.floor(h);
      const mins = h % 1 !== 0 ? '30' : '00';
      const displayH = hrs % 12 || 12;
      return `${displayH}:${mins}`;
    };

    const formatTimeAMPM = (h) => {
      const hrs = Math.floor(h);
      const mins = h % 1 !== 0 ? '30' : '00';
      const ampm = hrs >= 12 ? 'PM' : 'AM';
      const displayH = hrs % 12 || 12;
      return `${displayH}:${mins} ${ampm}`;
    };

    // Build slot rows — just show time like "6:00", "6:30", "7:00"
    let slotsHtml = '';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const slotHour = START_HOUR + i * 0.5;
      slotsHtml += `<div class="slot-row" style="top:${i * CELL_H}px;height:${CELL_H}px;">`;
      slotsHtml += `<div class="time-cell">${formatTime(slotHour)}</div>`;
      for (let d = 0; d < 7; d++) {
        slotsHtml += `<div class="day-cell"></div>`;
      }
      slotsHtml += `</div>`;
    }

    // Build blocks overlay - ONLY include course schedules (exclude reservations and maintenance)
    let blocksHtml = '';
    const courseOnlyBlocks = scheduleBlocks.filter(
      (b) => b.isCourseSchedule || (!b.isReservation && !b.isMaintenance)
    );
    const blocksByDay = Array.from({ length: 7 }, (_, d) =>
      courseOnlyBlocks.filter((b) => b.day === d)
    );
    blocksByDay.forEach((dayBlocks, dayIdx) => {
      dayBlocks.forEach((sched) => {
        const isLab = String(sched.type || '').toLowerCase().includes('lab');
        const colors = isLab ? TYPE_COLORS.Laboratory : TYPE_COLORS.Lecture;
        const slotsFromStart = (sched.start - START_HOUR) * 2;
        const durationSlots = (sched.end - sched.start) * 2;
        const top = slotsFromStart * CELL_H;
        const height = durationSlots * CELL_H;
        const left = `calc(60px + ${dayIdx} * ((100% - 60px) / 7) + 2px)`;
        const width = `calc((100% - 60px) / 7 - 4px)`;

        const courseCode = sched.course || '';
        const title = sched.title || '';
        const instructor = toTitleCase(sched.instructor || '');
        const section = sched.section || sched.sectionName || sched.program || '';
        const timeRange = `${formatTimeAMPM(sched.start)} - ${formatTimeAMPM(sched.end)}`;

        blocksHtml += `<div style="position:absolute;top:${top}px;height:${height}px;left:${left};width:${width};background:${colors.bg};border:1.5px solid ${colors.border};border-radius:4px;padding:2px 3px;overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;">`;
        if (courseCode) blocksHtml += `<div style="font-size:7px;font-weight:800;color:${colors.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${courseCode}</div>`;
        blocksHtml += `<div style="font-size:8px;font-weight:900;color:${colors.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${toTitleCase(title)}</div>`;
        if (instructor) blocksHtml += `<div style="font-size:7px;font-weight:600;color:${colors.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${instructor}</div>`;
        if (section) blocksHtml += `<div style="font-size:7px;font-weight:700;color:${colors.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Sec: ${section}</div>`;
        blocksHtml += `<div style="font-size:6.5px;font-weight:600;color:${colors.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${timeRange}</div>`;
        blocksHtml += `</div>`;
      });
    });

    const gridH = SLOT_COUNT * CELL_H;
    const roomName = displayRoom.name || displayRoom.id;
    const roomType = displayRoom.type || 'Lecture Room';
    const semDisplay = activeSemesterObj?.label || (
      semesterTab === 'Summer' || semesterTab === 'summer' || semesterTab === '3'
        ? 'Summer'
        : `Semester ${semesterTab}`
    );

    const html = `<!DOCTYPE html>
<html><head><title>Schedule - ${roomName}</title>
<style>
  @page { size: landscape; margin: 5mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; background: white; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 6px; border-bottom: 2px solid #333; margin-bottom: 8px; }
  .header h1 { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; }
  .header .meta { font-size: 9px; font-weight: 700; color: #444; margin-top: 2px; }
  .header .meta .room-type { color: #7A0808; font-weight: 900; text-transform: uppercase; }
  .header .right { text-align: right; }
  .header .right p:first-child { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
  .header .right p:last-child { font-size: 9px; font-weight: 700; color: #555; }
  .grid-wrap { position: relative; width: 100%; }
  .day-header { display: grid; grid-template-columns: 60px repeat(7, 1fr); }
  .day-header > div { background: #7A0808 !important; color: white !important; font-size: 10px; font-weight: 800; text-align: center; padding: 4px 0; border-right: 1px solid #333; border-top: 1px solid #333; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .day-header > div:first-child { border-left: 1px solid #333; }
  .slots-container { position: relative; height: ${gridH}px; border-left: 1px solid #333; }
  .slot-row { display: grid; grid-template-columns: 60px repeat(7, 1fr); position: absolute; left: 0; right: 0; }
  .time-cell { border-bottom: 1px solid #999; border-right: 1px solid #999; font-size: 8px; font-weight: 700; display: flex; align-items: center; justify-content: center; background: white; }
  .day-cell { border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; }
</style></head><body>
<div class="header">
  <div>
    <h1>${buildingName} — ${roomName}</h1>
    <p class="meta">ROOM TYPE: <span class="room-type">${roomType}</span> · FLOOR ${floor} · CAPACITY: ${displayRoom.capacity || 0} PAX</p>
  </div>
  <div class="right">
    <p>SWU-IFSS ROOM SCHEDULE</p>
    <p>${schoolYearLabel} · ${semDisplay}</p>
  </div>
</div>
<div class="grid-wrap">
  <div class="day-header">
    <div>TIME</div>
    ${DAYS.map((d) => `<div>${d}</div>`).join('')}
  </div>
  <div class="slots-container">
    ${slotsHtml}
    ${blocksHtml}
  </div>
</div>
</body></html>`;

    // Use hidden iframe instead of new tab
    let printFrame = document.getElementById('schedule-print-frame');
    if (printFrame) printFrame.remove();
    printFrame = document.createElement('iframe');
    printFrame.id = 'schedule-print-frame';
    printFrame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentDocument || printFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    printFrame.onload = () => {
      setTimeout(() => {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
        setTimeout(() => printFrame.remove(), 1000);
      }, 300);
    };
  };

  return (
    <Layout title={displayRoom.name || displayRoom.id} subtitle={`${buildingName} · Floor ${floor}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5 print:hidden">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm font-bold" style={{ color: '#2B3235' }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 shadow-sm hover:bg-gray-100 transition-colors">
            <ArrowLeft size={15} />
            <span className="text-xs font-bold">Back</span>
          </div>
        </button>
        <div className="flex items-center gap-2.5 flex-wrap relative">
          {/* Primary Action 1: Reserve Room */}
          {canSubmitReservation() && (
            <button
              type="button"
              className="btn-maroon flex items-center gap-2 text-xs font-bold whitespace-nowrap py-2 px-4 rounded-xl shadow-2xs cursor-pointer"
              onClick={() => openReservation({
                building: buildingName,
                buildingId,
                room: displayRoom.id || displayRoom.roomCode,
                roomDocId: displayRoom.docId,
                floor,
                floorId,
                designatedVenue: `${displayRoom.name || displayRoom.id}, ${buildingName} Floor ${floor}`,
              })}
            >
              <CalendarIcon size={14} /> Reserve Room
            </button>
          )}

          {/* Primary Action 2: Add Schedule */}
          {(isRegistrar || canSubmitCourseSchedule()) && (
            <button
              type="button"
              className="btn-outline-maroon flex items-center gap-1.5"
              onClick={() => setShowAddScheduleModal(true)}
            >
              <Plus size={15} /> Add Schedule
            </button>
          )}

          {/* More Actions Dropdown Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreActions((prev) => !prev)}
              className="btn-soft-maroon"
            >
              <span>More Actions</span>
              <ChevronDown size={15} className={`text-[#7A0808] transition-transform duration-200 ${showMoreActions ? 'rotate-180' : ''}`} />
            </button>

            {showMoreActions && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowMoreActions(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl border border-gray-200 shadow-xl p-1.5 z-30 animate-fadeIn space-y-1">
                  {buildingId && floorId && displayRoom?.docId && canEditRoom({ ...displayRoom, buildingId }) && (
                    <button
                      type="button"
                      className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100/80 hover:text-[#7A0808] flex items-center gap-2.5 transition-all cursor-pointer group"
                      onClick={() => {
                        setShowMoreActions(false);
                        setShowEditRoom(true);
                      }}
                    >
                      <Edit2 size={15} className="text-gray-500 group-hover:text-[#7A0808]" /> Edit Room Details
                    </button>
                  )}
                  {canManageRoomMaintenance() && (
                    <button
                      type="button"
                      className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100/80 hover:text-[#7A0808] flex items-center gap-2.5 transition-all cursor-pointer group"
                      onClick={() => {
                        setShowMoreActions(false);
                        setShowScheduleMaintenance(true);
                      }}
                    >
                      <Wrench size={15} className="text-gray-500 group-hover:text-[#7A0808]" /> Schedule Maintenance
                    </button>
                  )}
                  {!isGsd && (
                    <button
                      type="button"
                      className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold text-amber-800 hover:bg-amber-50 flex items-center gap-2.5 transition-all cursor-pointer group"
                      onClick={() => {
                        setShowMoreActions(false);
                        setShowReportMaintenance(true);
                      }}
                    >
                      <AlertTriangle size={15} className="text-amber-600 group-hover:text-amber-700" /> Report Issue
                    </button>
                  )}
                  <button
                    type="button"
                    className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100/80 hover:text-[#7A0808] flex items-center gap-2.5 transition-all cursor-pointer group"
                    onClick={() => {
                      setShowMoreActions(false);
                      handlePrintSchedule();
                    }}
                  >
                    <Printer size={15} className="text-gray-500 group-hover:text-[#7A0808]" /> Print Schedule
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Maintenance Banner */}
      {displayRoom.maintenanceStatus === 'under-maintenance' && (
        <div className="mb-5 bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-300 rounded-2xl p-4 print:hidden">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Wrench size={20} className="text-orange-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm text-orange-900 mb-1">Room Under Maintenance</h3>
              <p className="text-xs text-orange-700 mb-2">
                {displayRoom.maintenanceReason || 'This room is currently undergoing maintenance.'}
              </p>
              {displayRoom.maintenanceStartDate && displayRoom.maintenanceEndDate && (
                <div className="flex items-center gap-4 text-[11px] font-bold text-orange-600">
                  <span>Start: {displayRoom.maintenanceStartDate}</span>
                  <span>•</span>
                  <span>End: {displayRoom.maintenanceEndDate}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Room info cards */}
      <div className="mb-6 print:hidden">
        <ProgressStatCards
          items={[
            {
              label: 'Room Type',
              value: displayRoom.type || 'Lecture Room',
              icon: MapPin,
              color: 'maroon',
            },
            {
              label: 'Status',
              value: displayRoom.status || 'Available',
              icon: Clock,
              color:
                displayRoom.status === 'Available'
                  ? 'emerald'
                  : displayRoom.status === 'Occupied'
                  ? 'red'
                  : 'amber',
            },
            {
              label: 'Capacity (People)',
              value: displayRoom.capacity || 0,
              icon: Users,
              color: 'blue',
            },
            {
              label: 'Equipments (Items)',
              value: displayRoom.equipment?.length || 0,
              icon: Wrench,
              color: 'amber',
            },
          ]}
        />
      </div>

      {/* Equipment */}
      {displayRoom.equipment?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5 print:hidden">
          <h3 className="font-bold text-sm mb-3" style={{ color: '#2B3235' }}>Available Equipment</h3>
          <div className="flex flex-wrap gap-2">
            {displayRoom.equipment.map((e) => (
              <span key={e} className="text-xs font-semibold px-3 py-1.5 rounded-full border" style={{ borderColor: '#e2e5e8', color: '#2B3235' }}>{e}</span>
            ))}
          </div>
        </div>
      )}

      {/* Week Selector with Calendar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5 print:hidden">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="font-bold text-sm" style={{ color: '#2B3235' }}>Room Schedule</h3>
            <p className="text-xs font-bold text-[#7A0808] mt-0.5 flex items-center gap-1.5">
              <CalendarIcon size={13} className="text-[#7A0808]" />
              <span>
                {(() => {
                  const startDate = weekStartDate || new Date();
                  const endDate = addDays(startDate, 6);
                  const startMonth = startDate.toLocaleString('en-US', { month: 'long' });
                  const endMonth = endDate.toLocaleString('en-US', { month: 'long' });
                  const startYear = startDate.getFullYear();
                  const endYear = endDate.getFullYear();

                  if (startYear !== endYear) {
                    return `${startMonth} ${startYear} – ${endMonth} ${endYear}`;
                  }
                  if (startMonth !== endMonth) {
                    return `${startMonth} – ${endMonth} ${startYear}`;
                  }
                  return `${startMonth} ${startYear}`;
                })()}
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {courseSchedules.length > 0 && `${courseSchedules.length} course schedule${courseSchedules.length !== 1 ? 's' : ''} (repeats weekly)`}
              {courseSchedules.length > 0 && approvedReservations.length > 0 && ' • '}
              {approvedReservations.length > 0 && `${approvedReservations.length} reservation${approvedReservations.length !== 1 ? 's' : ''} (date-specific)`}
              {courseSchedules.length === 0 && approvedReservations.length === 0 && 'No schedules or reservations'}
            </p>
          </div>
          
          {/* Schedule Type Toggle */}
          <div className="inline-flex w-fit items-center p-1 gap-1 shadow-sm" style={{ background: '#F9FAFB', borderRadius: 10 }}>
            <button
              type="button"
              onClick={() => setScheduleTab('regular')}
              className="px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-all"
              style={scheduleTab === 'regular' ? { background: '#7A0808', color: 'white', borderRadius: 10 } : { background: 'transparent', color: '#2B3235', borderRadius: 10 }}
            >
              <CalendarIcon size={12} /> Regular Schedule
            </button>
            <button
              type="button"
              onClick={() => setScheduleTab('exam')}
              className="px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-all"
              style={scheduleTab === 'exam' ? { background: '#7A0808', color: 'white', borderRadius: 10 } : { background: 'transparent', color: '#2B3235', borderRadius: 10 }}
            >
              <CalendarIcon size={12} /> Exam Calendar
            </button>
          </div>
        </div>

        {/* Semester and Week Navigation */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className="text-xs font-bold px-3 py-2 rounded-lg border border-gray-200" style={{ color: '#2B3235' }}>
            {schoolYearLabel}
          </span>
          
          {/* Semester Tabs */}
          <div className="inline-flex w-fit items-center p-1 gap-1 shadow-sm flex-wrap" style={{ background: '#F9FAFB', borderRadius: 10 }}>
            {configuredSemesters.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSemesterTab(s.value)}
                className="px-4 py-1.5 text-xs font-bold transition-all"
                style={semesterTab === s.value ? { background: '#7A0808', color: 'white', borderRadius: 10 } : { background: 'transparent', color: '#2B3235', borderRadius: 10 }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Week Navigation */}
          <button
            type="button"
            onClick={() => setWeekStartDate((d) => getMondayOfWeek(addDays(d, -7)))}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50"
          >
            ← Previous Week
          </button>
          
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border-2 transition-all hover:bg-red-50"
              style={{ borderColor: '#7A0808', color: '#7A0808' }}
            >
              <CalendarIcon size={14} />
              Select Week
            </button>
            
                        {showDatePicker && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowDatePicker(false)}
                />
                <div className="absolute right-0 mt-2 z-20">
                  <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-2">
                    <p className="text-[10px] font-semibold text-gray-500 px-2 pb-2">Select any date to jump to its week</p>
                    <CalendarCard
                      value={formatDateForInput(weekStartDate)}
                      onChange={handleDateSelect}
                      onClose={() => setShowDatePicker(false)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setWeekStartDate((d) => getMondayOfWeek(addDays(d, 7)))}
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 hover:bg-gray-50"
            style={{ color: '#7A0808' }}
          >
            Next Week →
          </button>

          <button
            type="button"
            onClick={() => setWeekStartDate(getInitialWeekStart(null))}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50"
          >
            Today
          </button>
        </div>

        <p className="text-xs font-semibold mb-3" style={{ color: '#2B3235', opacity: 0.75 }}>
          {activeSemesterObj?.label || `Semester ${semesterTab}`} · {scheduleTab === 'exam' ? 'Exam calendar mode' : 'Regular schedule mode'}
        </p>
      </div>

      {/* Print-Only Header */}
      <div className="hidden print:block mb-6 pb-4 border-b-2 border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
              {buildingName} — {displayRoom.name || displayRoom.id}
            </h1>
            <p className="text-xs font-bold text-gray-700 mt-1">
              ROOM TYPE: <span className="uppercase text-[#7A0808] font-black">{displayRoom.type || 'Lecture Room'}</span> · FLOOR {floor} · CAPACITY: {displayRoom.capacity || 0} PAX
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-black text-gray-900 uppercase tracking-wider">SWU-IFSS Room Schedule</p>
            <p className="text-xs font-bold text-gray-600 mt-0.5">{schoolYearLabel} · {activeSemesterObj?.label || `Semester ${semesterTab}`}</p>
          </div>
        </div>
      </div>

      <WeeklyScheduleGrid
        blocks={scheduleBlocks}
        scheduleTab={scheduleTab}
        onScheduleTabChange={setScheduleTab}
        semester={semesterTab}
        onSemesterChange={setSemesterTab}
        semesterOptions={configuredSemesters}
        schoolYearLabel={schoolYearLabel}
        weekStartDate={weekStartDate}
        onPrevWeek={() => setWeekStartDate((d) => getMondayOfWeek(addDays(d, -7)))}
        onNextWeek={() => setWeekStartDate((d) => getMondayOfWeek(addDays(d, 7)))}
        readOnly
        showControls={false}
        showLegend={true}
        roomType={displayRoom.type || 'Lecture Room'}
        emptyMessage={
          courseSchedules.length === 0 && approvedReservations.length === 0 && maintenanceSchedules.length === 0
            ? "No course schedules, reservations, or maintenance for this room"
            : "Navigate through weeks to see schedules and reservations"
        }
      />

      {modals}

      {showEditRoom && buildingId && floorId && displayRoom?.docId && (
        <EditRoomModal
          room={displayRoom}
          buildingId={buildingId}
          floorId={floorId}
          onClose={() => setShowEditRoom(false)}
        />
      )}

      <ScheduleMaintenanceModal
        isOpen={showScheduleMaintenance}
        onClose={() => setShowScheduleMaintenance(false)}
        room={{
          ...displayRoom,
          docId: displayRoom.docId, // Ensure docId is passed
        }}
        buildingName={buildingName}
        onSuccess={handleMaintenanceScheduled}
      />

      <ReportMaintenanceModal
        isOpen={showReportMaintenance}
        onClose={() => setShowReportMaintenance(false)}
        room={{
          ...displayRoom,
          docId: displayRoom.docId, // Ensure docId is passed
        }}
        buildingName={buildingName}
        onSuccess={handleMaintenanceReported}
      />

      {showAddScheduleModal && (
        <AddPlotEntryModalEnhanced
          onClose={() => setShowAddScheduleModal(false)}
          onSave={handleSaveScheduleFromRoom}
          scheduleMode={scheduleTab}
          semester={semesterTab}
          deanCollege={profile?.college || profile?.department}
          deanUid={profile?.uid}
          initialBuildingId={buildingId}
          initialBuilding={currentBuildingObj}
          initialRoomCode={displayRoom.id || displayRoom.roomCode}
          initialRoom={displayRoom}
          initialType={displayRoom.type && String(displayRoom.type).toLowerCase().includes('lab') ? 'Laboratory' : 'Lecture'}
          skipTypeStep={true}
          sections={deanSections}
          sectionYearLevel={deanSections[0]?.yearLevel || '1st Year'}
        />
      )}
    </Layout>
  );
}
