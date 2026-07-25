import React, { useEffect, useMemo, useState } from 'react';
import { getInitialWeekStart, getSemesterForDate, getMondayOfWeek } from '../utils/academicCalendarUtils';
import { addDays } from '../constants/scheduleGrid';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Printer, MapPin, Clock, Users, Wrench, Edit2, Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import EditRoomModal from '../components/modals/EditRoomModal';
import WeeklyScheduleGrid from '../components/scheduling/WeeklyScheduleGrid';
import { subscribeApprovedReservationsForRoom } from '../services/reservationService';
import { getRoomMaintenanceSchedule, subscribeMaintenanceSchedules } from '../services/maintenanceService';
import { subscribeAllPlotEntriesForRoom } from '../services/plotScheduleService';
import ScheduleMaintenanceModal from '../components/modals/ScheduleMaintenanceModal';
import ReportMaintenanceModal from '../components/modals/ReportMaintenanceModal';
import { useModal } from '../hooks/useModal';

const sampleSchedules = [];

export default function RoomDetails() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { id } = useParams();
  const { buildingList } = useApp();

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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showScheduleMaintenance, setShowScheduleMaintenance] = useState(false);
  const [showReportMaintenance, setShowReportMaintenance] = useState(false);

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

  // Subscribe to approved reservations for this room
  useEffect(() => {
    if (!displayRoom?.docId) return;
    
    const unsubscribe = subscribeApprovedReservationsForRoom(
      displayRoom.docId,
      (reservations) => setApprovedReservations(reservations),
      (error) => console.error('Error loading reservations:', error)
    );

    return () => unsubscribe();
  }, [displayRoom?.docId]);

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
    if (!displayRoom?.docId) return;
    
    console.log('[RoomDetails] Subscribing to maintenance schedules');
    
    const unsubscribe = subscribeMaintenanceSchedules(
      (schedules) => {
        console.log('[RoomDetails] Received maintenance schedules:', schedules);
        setMaintenanceSchedules(schedules);
      },
      (error) => console.error('Error loading maintenance schedules:', error),
      { 
        roomId: displayRoom.docId,
        // No semester filter - maintenance is date-based, not semester-based
      }
    );

    return () => unsubscribe();
  }, [displayRoom?.docId]);

  // Convert reservations, course schedules, and maintenance schedules to schedule blocks for the current week
  const scheduleBlocks = useMemo(() => {
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

    console.log('[RoomDetails] Week start date:', weekStartDate, 'Day of week:', weekStartDate.getDay());
    console.log('[RoomDetails] Building schedule blocks for week:', weekDates);
    console.log('[RoomDetails] Course schedules:', courseSchedules);
    console.log('[RoomDetails] Approved reservations:', approvedReservations);

    const blocks = [];

    // Add COURSE SCHEDULE blocks (Regular schedules - repeat every week)
    // These are semester-long and match by DAY OF WEEK, not specific date
    courseSchedules.forEach((schedule) => {
      // schedule.day is 0-6 for Monday-Sunday (from WEEKDAYS array in CourseSchedulingNew)
      const dayIndex = schedule.day;
      
      if (dayIndex < 0 || dayIndex >= 7) {
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
      };

      console.log('[RoomDetails] Adding course schedule block:', block);
      blocks.push(block);
    });

    // Add RESERVATION blocks (Date-specific - only show for matching date)
    approvedReservations.forEach((reservation) => {
      // Convert DD/MM/YYYY to YYYY-MM-DD
      let dateStr = reservation.dateOfActivity;
      if (dateStr && dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }

      const dayIndex = weekDates.indexOf(dateStr);
      if (dayIndex === -1) return; // Not in current week

      // Convert time strings to hour numbers
      const timeToHour = (timeStr) => {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours + minutes / 60;
      };

      blocks.push({
        id: `reservation-${reservation.id}`,
        day: dayIndex,
        title: reservation.activity || reservation.title,
        course: reservation.nameOfOrg || reservation.department,
        instructor: reservation.requestedBy,
        start: timeToHour(reservation.timeStart),
        end: timeToHour(reservation.timeEnd),
        type: reservation.type === 'academic' ? 'Reservation (Academic)' : 'Reservation (Non-Academic)',
        roomCode: displayRoom.id || displayRoom.roomCode,
        isReservation: true,
      });
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
      const endDate = schedule.endDate; // YYYY-MM-DD

      console.log('[RoomDetails] Maintenance dates:', { startDate, endDate, weekStartDate, weekDates });

      // Check if this week overlaps with the maintenance period
      const maintenanceStart = new Date(startDate + 'T00:00:00');
      const maintenanceEnd = new Date(endDate + 'T00:00:00');
      const weekEnd = addDays(weekStartDate, 6);

      if (maintenanceEnd < weekStartDate || maintenanceStart > weekEnd) {
        console.log('[RoomDetails] Maintenance does not overlap with current week');
        return; // No overlap
      }

      console.log('[RoomDetails] Maintenance overlaps with current week, adding blocks...');

      // For each day in the week that overlaps with maintenance
      weekDates.forEach((dateStr, dayIndex) => {
        // Use string comparison to avoid timezone issues
        // dateStr and startDate/endDate are all in YYYY-MM-DD format
        const isInMaintenancePeriod = dateStr >= startDate && dateStr <= endDate;
        
        console.log(`[RoomDetails] Checking date ${dateStr}: startDate=${startDate}, endDate=${endDate}, inPeriod=${isInMaintenancePeriod}, dayIndex=${dayIndex}`);
        
        if (isInMaintenancePeriod) {
          // Determine if this is a quick fix (hours) or multi-day
          const isQuickFix = schedule.durationType === 'hours' && schedule.isQuickFix;

          if (isQuickFix && dateStr === startDate) {
            // Quick fix - show specific time slot on start date only
            const timeToHour = (timeStr) => {
              if (!timeStr) return 8; // Default 8 AM
              const [hours, minutes] = timeStr.split(':').map(Number);
              return hours + minutes / 60;
            };

            const startHour = timeToHour(schedule.startTime || '08:00');
            const endHour = startHour + (schedule.durationHours || 2);

            console.log(`[RoomDetails] Adding quick fix maintenance block for ${dateStr} at day ${dayIndex}, startHour=${startHour}, endHour=${endHour}`);
            blocks.push({
              id: `maintenance-${schedule.id}-${dayIndex}`,
              day: dayIndex,
              title: '🔧 MAINTENANCE',
              course: schedule.reason || 'Scheduled maintenance',
              instructor: `Quick Fix (${schedule.durationHours || 2}h)`,
              start: startHour,
              end: Math.min(endHour, 20), // Cap at 8 PM (SCHEDULE_END_HOUR)
              type: 'Maintenance',
              roomCode: displayRoom.id || displayRoom.roomCode,
              isMaintenance: true,
            });
          } else if (!isQuickFix || dateStr === startDate) {
            // Multi-day or regular maintenance - block entire day (7 AM to 8 PM)
            // For multi-day quick fixes that aren't on start date, skip them
            console.log(`[RoomDetails] Adding full-day maintenance block for ${dateStr} at day ${dayIndex}`);
            blocks.push({
              id: `maintenance-${schedule.id}-${dayIndex}`,
              day: dayIndex,
              title: '🔧 MAINTENANCE',
              course: schedule.reason || 'Scheduled maintenance',
              instructor: isQuickFix ? 'Same-day maintenance' : 'Multi-day maintenance',
              start: 7, // 7 AM
              end: 20, // 8 PM (SCHEDULE_END_HOUR)
              type: 'Maintenance',
              roomCode: displayRoom.id || displayRoom.roomCode,
              isMaintenance: true,
            });
          }
        }
      });
    });

    console.log('[RoomDetails] Final schedule blocks:', blocks);
    return blocks;
  }, [courseSchedules, approvedReservations, maintenanceSchedules, weekStartDate, displayRoom]);

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
  return (
    <Layout title={displayRoom.name || displayRoom.id} subtitle={`${buildingName} · Floor ${floor}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm font-bold" style={{ color: '#2B3235' }}>
          <div className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 hover:bg-gray-100 transition-colors">
            <ArrowLeft size={16} />
          </div>
          Back
        </button>
        <div className="flex gap-2 flex-wrap">
          {buildingId && floorId && displayRoom?.docId && canEditRoom({ ...displayRoom, buildingId }) && (
            <button type="button" className="btn-outline-maroon flex items-center gap-2" onClick={() => setShowEditRoom(true)}>
              <Edit2 size={14} /> Edit Room Details
            </button>
          )}
          {canManageRoomMaintenance() && (
            <button
              type="button"
              className="btn-outline-maroon flex items-center gap-2"
              onClick={() => setShowScheduleMaintenance(true)}
            >
              <Wrench size={14} /> Schedule Maintenance
            </button>
          )}
          {!isGsd && (
            <button
              type="button"
              className="px-3 py-2 rounded-xl font-bold text-sm border-2 border-orange-500 text-orange-600 hover:bg-orange-50 transition-all flex items-center gap-2"
              onClick={() => setShowReportMaintenance(true)}
            >
              <AlertTriangle size={14} /> Report Issue
            </button>
          )}
          {canSubmitReservation() && (
            <button
              type="button"
              className="btn-maroon"
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
              <CalendarIcon size={16} /> Reserve Room
            </button>
          )}
          {(isRegistrar || canSubmitCourseSchedule()) && (
            <button type="button" className="btn-outline-maroon"><Plus size={16} /> Add Schedule</button>
          )}
          <button type="button" className="btn-outline-maroon flex items-center gap-2"><Printer size={14} /> Print Schedule</button>
        </div>
      </div>

      {/* Maintenance Banner */}
      {displayRoom.maintenanceStatus === 'under-maintenance' && (
        <div className="mb-5 bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-300 rounded-2xl p-4">
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
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Room Type</p>
            <span className="text-xs font-black px-2 py-1 rounded" style={{ background: '#FFF0F0', color: '#7A0808' }}>
              {displayRoom.type || 'Lecture Room'}
            </span>
          </div>
          <div className="stat-icon-box"><MapPin size={18} /></div>
        </div>
        <div className="stat-card">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Status</p>
            <span className={statusBadge}>{displayRoom.status}</span>
          </div>
          <div className="stat-icon-box"><Clock size={18} /></div>
        </div>
        <div className="stat-card">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Capacity</p>
            <p className="text-2xl font-black" style={{ color: '#2B3235' }}>{displayRoom.capacity}</p>
            <p className="text-xs text-gray-400">People</p>
          </div>
          <div className="stat-icon-box"><Users size={18} /></div>
        </div>
        <div className="stat-card">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Equipments</p>
            <p className="text-2xl font-black" style={{ color: '#2B3235' }}>{displayRoom.equipment?.length || 0}</p>
            <p className="text-xs text-gray-400">Items</p>
          </div>
          <div className="stat-icon-box"><Wrench size={18} /></div>
        </div>
      </div>

      {/* Equipment */}
      {displayRoom.equipment?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
          <h3 className="font-bold text-sm mb-3" style={{ color: '#2B3235' }}>Available Equipment</h3>
          <div className="flex flex-wrap gap-2">
            {displayRoom.equipment.map((e) => (
              <span key={e} className="text-xs font-semibold px-3 py-1.5 rounded-full border" style={{ borderColor: '#e2e5e8', color: '#2B3235' }}>{e}</span>
            ))}
          </div>
        </div>
      )}

      {/* Week Selector with Calendar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="font-bold text-sm" style={{ color: '#2B3235' }}>Room Schedule</h3>
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
              style={scheduleTab === 'regular' ? { background: '#800000', color: 'white', borderRadius: 10 } : { background: 'transparent', color: '#2B3235', borderRadius: 10 }}
            >
              <CalendarIcon size={12} /> Regular Schedule
            </button>
            <button
              type="button"
              onClick={() => setScheduleTab('exam')}
              className="px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-all"
              style={scheduleTab === 'exam' ? { background: '#800000', color: 'white', borderRadius: 10 } : { background: 'transparent', color: '#2B3235', borderRadius: 10 }}
            >
              <CalendarIcon size={12} /> Exam Calendar
            </button>
          </div>
        </div>

        {/* Semester and Week Navigation */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className="text-xs font-bold px-3 py-2 rounded-lg border border-gray-200" style={{ color: '#2B3235' }}>
            SY 2025-2026
          </span>
          
          {/* Semester Tabs */}
          <div className="inline-flex w-fit items-center p-1 gap-1 shadow-sm" style={{ background: '#F9FAFB', borderRadius: 10 }}>
            {['1', '2'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSemesterTab(s)}
                className="px-4 py-1.5 text-xs font-bold transition-all"
                style={semesterTab === s ? { background: '#800000', color: 'white', borderRadius: 10 } : { background: 'transparent', color: '#2B3235', borderRadius: 10 }}
              >
                Semester {s}
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
                <div className="absolute right-0 mt-2 p-4 bg-white rounded-xl shadow-lg border border-gray-100 z-20" style={{ minWidth: '250px' }}>
                  <p className="text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                    Select any date to view its week
                  </p>
                  <input
                    type="date"
                    className="form-input text-sm w-full"
                    defaultValue={formatDateForInput(weekStartDate)}
                    onChange={handleDateSelect}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <p className="text-[10px] text-gray-400 mt-2">
                    The calendar will show the week containing this date
                  </p>
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
          Semester {semesterTab} · {scheduleTab === 'exam' ? 'Exam calendar mode' : 'Regular schedule mode'}
        </p>
      </div>

      <WeeklyScheduleGrid
        blocks={scheduleBlocks}
        scheduleTab={scheduleTab}
        onScheduleTabChange={setScheduleTab}
        semester={semesterTab}
        onSemesterChange={setSemesterTab}
        schoolYearLabel="SY 2025-2026"
        weekStartDate={weekStartDate}
        onPrevWeek={() => setWeekStartDate((d) => getMondayOfWeek(addDays(d, -7)))}
        onNextWeek={() => setWeekStartDate((d) => getMondayOfWeek(addDays(d, 7)))}
        readOnly
        showControls={false}
        showLegend={true}
        emptyMessage={
          courseSchedules.length === 0 && approvedReservations.length === 0
            ? "No course schedules or reservations for this room"
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
    </Layout>
  );
}
