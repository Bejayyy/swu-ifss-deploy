import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, ChevronLeft, ChevronRight, RefreshCw, Building2, Layers, Users } from 'lucide-react';
import { useAcademicCalendar } from '../../hooks/useAcademicCalendar';
import { useApp } from '../../context/AppContext';
import { subscribeAllPlotEntriesForRoom } from '../../services/plotScheduleService';
import { subscribeApprovedReservationsForRoom } from '../../services/reservationService';
import { RESERVATION_STATUS } from '../../constants/approvalWorkflow';
import { subscribeMaintenanceSchedules } from '../../services/maintenanceService';
import WeeklyScheduleGrid from '../scheduling/WeeklyScheduleGrid';
import { addDays, SCHEDULE_START_HOUR, SCHEDULE_END_HOUR } from '../../constants/scheduleGrid';
import { getMondayOfWeek, getSemesterWeekNumber, isScheduleActiveOnWeek } from '../../utils/academicCalendarUtils';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

export default function RoomWeeklyScheduleModal({
  isOpen = true,
  onClose,
  room = {},
  initialDate = '',
}) {
  useBodyScrollLock(Boolean(isOpen));
  const { calendarData, activeSchoolYearId } = useAcademicCalendar();
  const { requests } = useApp();

  const [semesterTab, setSemesterTab] = useState('1');
  const [scheduleTab, setScheduleTab] = useState('regular');
  const [courseSchedules, setCourseSchedules] = useState([]);
  const [approvedReservations, setApprovedReservations] = useState([]);
  const [maintenanceSchedules, setMaintenanceSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize weekStartDate to the Monday of initialDate, or current date's Monday
  const [weekStartDate, setWeekStartDate] = useState(() => {
    if (initialDate) {
      let dStr = initialDate;
      if (initialDate.includes('/')) {
        const [d, m, y] = initialDate.split('/');
        dStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      const d = new Date(dStr + 'T00:00:00');
      if (!isNaN(d.getTime())) return getMondayOfWeek(d);
    }
    return getMondayOfWeek(new Date());
  });

  const roomCode = room.id || room.roomCode || room.name || '';
  const roomDocId = room.docId || room.id || '';

  // Configured semesters
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

  const schoolYearLabel = calendarData?.config?.displayLabel || (
    calendarData?.config?.label ? `SY ${calendarData.config.label}` : 'Active School Year'
  );

  // 1. Subscribe to course schedules
  useEffect(() => {
    if (!roomCode) return;
    setIsLoading(true);
    const unsub = subscribeAllPlotEntriesForRoom(
      roomCode,
      semesterTab,
      'regular',
      activeSchoolYearId,
      (schedules) => {
        setCourseSchedules(schedules || []);
        setIsLoading(false);
      },
      (err) => {
        console.error('Error loading course schedules for RoomWeeklyScheduleModal:', err);
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [roomCode, semesterTab, activeSchoolYearId]);

  // 2. Subscribe to approved reservations
  useEffect(() => {
    if (!roomDocId && !roomCode) return;
    const unsub = subscribeApprovedReservationsForRoom(
      roomDocId,
      (resList) => setApprovedReservations(resList || []),
      (err) => {
        console.warn('Note on reservations listener in RoomWeeklyScheduleModal:', err?.message || err);
        setApprovedReservations([]);
      },
      roomCode
    );
    return () => unsub();
  }, [roomDocId, roomCode]);

  // 3. Subscribe to maintenance schedules
  useEffect(() => {
    if (!roomDocId) return;
    const unsub = subscribeMaintenanceSchedules(
      (mList) => setMaintenanceSchedules(mList || []),
      (err) => console.error('Error loading maintenance in RoomWeeklyScheduleModal:', err),
      { roomId: roomDocId }
    );
    return () => unsub();
  }, [roomDocId]);

  // Safety timer so loading spinner never hangs indefinitely
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [roomCode, semesterTab]);

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
          const isApproved = r.status === 'Approved' || r.status === 'approved' || r.status === 'APPROVED';
          if (isApproved) {
            seenIds.add(r.id);
            candidates.push(r);
          }
        }
      });
    }

    const targetRoomId = String(roomDocId || roomCode || '').trim().toLowerCase();
    const targetRoomCode = String(roomCode || roomDocId || '').trim().toLowerCase();

    return candidates.filter((res) => {
      const isApproved = res.status === 'Approved' || res.status === 'approved' || res.status === 'APPROVED';
      if (!isApproved) return false;

      const rRoomId = String(res.roomId || res.roomDocId || '').trim().toLowerCase();
      const rRoom = String(res.room || '').trim().toLowerCase();
      const rVenue = String(res.designatedVenue || res.venue || '').trim().toLowerCase();

      const matchId = targetRoomId && (rRoomId === targetRoomId || rRoom === targetRoomId);
      const matchCode = targetRoomCode && (rRoom === targetRoomCode || rRoomId === targetRoomCode || rVenue.includes(targetRoomCode));
      return matchId || matchCode;
    });
  }, [approvedReservations, requests, roomDocId, roomCode]);

  // Convert reservations, course schedules, and maintenance schedules into timetable grid blocks
  const scheduleBlocks = useMemo(() => {
    const semesterStartStr = activeSemesterObj?.start || null;
    const currentWeekNum = getSemesterWeekNumber(weekStartDate, semesterStartStr);

    const formatDateLocal = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStartDate, i);
      return formatDateLocal(date);
    });

    const blocks = [];

    // Course Schedules
    courseSchedules.forEach((schedule) => {
      const modality = schedule.modality || schedule.sectionModality || 'regular';
      const customOjtWeeks = schedule.customOjtWeeks || [];
      if (modality !== 'regular' && !isScheduleActiveOnWeek(modality, currentWeekNum, customOjtWeeks)) {
        return;
      }

      const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      let dayIndex = schedule.day;
      if (dayIndex === undefined || dayIndex === null || dayIndex < 0 || dayIndex >= 7) {
        if (schedule.date) {
          const foundIdx = dayNames.indexOf(String(schedule.date).toLowerCase().trim());
          if (foundIdx >= 0) dayIndex = foundIdx;
          else if (weekDates.includes(schedule.date)) dayIndex = weekDates.indexOf(schedule.date);
        }
      }
      if (dayIndex === undefined || dayIndex === null || dayIndex < 0 || dayIndex >= 7) return;

      let startHour = 0;
      let endHour = 0;
      if (typeof schedule.startHour === 'number' && typeof schedule.endHour === 'number') {
        startHour = schedule.startHour;
        endHour = schedule.endHour;
      } else if (schedule.startTime && schedule.endTime) {
        const timeToHour = (timeStr) => {
          if (!timeStr) return 0;
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours + minutes / 60;
        };
        startHour = timeToHour(schedule.startTime);
        endHour = timeToHour(schedule.endTime);
      } else {
        return;
      }

      blocks.push({
        id: `course-${schedule.id}`,
        day: dayIndex,
        title: schedule.title || schedule.courseCode,
        course: schedule.courseCode || '',
        instructor: schedule.instructor || schedule.deanName,
        start: startHour,
        end: endHour,
        type: schedule.type || 'Lecture',
        roomCode: roomCode,
        isCourseSchedule: true,
        college: schedule.college || '',
        section: schedule.sectionName || schedule.section || '',
        program: schedule.program || schedule.programCode || '',
      });
    });

    // Approved Reservations
    effectiveApprovedReservations.forEach((reservation) => {
      let dateStr = reservation.dateOfActivity;
      if (dateStr && dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }

      const dayIndex = weekDates.indexOf(dateStr);
      if (dayIndex === -1) return;

      const timeToHour = (tStr) => {
        if (!tStr) return 0;
        let str = String(tStr).trim();
        const isPM = str.toLowerCase().includes('pm');
        const isAM = str.toLowerCase().includes('am');
        str = str.replace(/[^\d:]/g, '');
        const [hStr, mStr] = str.split(':');
        let h = Number(hStr) || 0;
        const m = Number(mStr) || 0;
        if (isPM && h < 12) h += 12;
        if (isAM && h === 12) h = 0;
        return h + m / 60;
      };

      const start = timeToHour(reservation.timeStart);
      const end = timeToHour(reservation.timeEnd);
      if (end <= start) return;

      blocks.push({
        id: `reservation-${reservation.id}`,
        day: dayIndex,
        title: reservation.activity || reservation.title || 'Room Reservation',
        course: reservation.nameOfOrg || reservation.department || 'Reserved',
        instructor: reservation.requestedBy || '',
        start,
        end,
        type: reservation.type === 'academic' ? 'Reservation (Academic)' : 'Reservation (Non-Academic)',
        roomCode: roomCode,
        isReservation: true,
      });
    });

    // Maintenance Schedules
    maintenanceSchedules.forEach((schedule) => {
      if (schedule.status === 'cancelled' || schedule.status === 'completed') return;

      const startDate = schedule.startDate;
      const endDate = schedule.endDate || schedule.startDate;
      if (!startDate) return;

      const isQuickFix = schedule.durationType === 'hours' || Boolean(schedule.isQuickFix) || schedule.maintenanceType === 'quick_fix';

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

      weekDates.forEach((dateStr, dayIndex) => {
        const isInPeriod = dateStr >= startDate && dateStr <= endDate;
        if (isInPeriod) {
          if (isQuickFix) {
            if (dateStr === startDate || startDate === endDate) {
              const startHour = parseMaintHour(schedule.startTime, 8);
              const duration = parseFloat(schedule.durationHours || schedule.estimatedDurationHours) || 2;
              const endHour = schedule.endTime ? parseMaintHour(schedule.endTime, startHour + duration) : (startHour + duration);

              blocks.push({
                id: `maintenance-${schedule.id}-${dateStr}`,
                day: dayIndex,
                title: schedule.title || '🔧 UNDER MAINTENANCE',
                course: schedule.reason || schedule.issueType || 'Scheduled maintenance',
                instructor: schedule.assignedTechnicianName || schedule.technicianName || (schedule.scheduledByName ? `Scheduled by ${schedule.scheduledByName}` : `Quick Fix (${duration}h)`),
                start: Math.max(SCHEDULE_START_HOUR, startHour),
                end: Math.min(SCHEDULE_END_HOUR, Math.max(startHour + 0.5, endHour)),
                type: 'Maintenance',
                roomCode: roomCode,
                isMaintenance: true,
                maintenanceData: schedule,
              });
            }
          } else {
            // Full Day
            blocks.push({
              id: `maintenance-${schedule.id}-${dateStr}`,
              day: dayIndex,
              title: schedule.title || '🔧 UNDER MAINTENANCE',
              course: schedule.reason || schedule.issueType || 'Room unavailable',
              instructor: schedule.assignedTechnicianName || schedule.technicianName || (schedule.scheduledByName ? `Scheduled by ${schedule.scheduledByName}` : 'Multi-day maintenance'),
              start: SCHEDULE_START_HOUR,
              end: SCHEDULE_END_HOUR,
              type: 'Maintenance',
              roomCode: roomCode,
              isMaintenance: true,
              maintenanceData: schedule,
            });
          }
        }
      });
    });

    return blocks;
  }, [weekStartDate, courseSchedules, effectiveApprovedReservations, maintenanceSchedules, activeSemesterObj, roomCode]);

  const dayStatuses = useMemo(() => {
    const weekStart = weekStartDate || new Date();
    const days = [];

    for (let i = 0; i < 7; i++) {
      const currentDayDate = addDays(weekStart, i);
      const year = currentDayDate.getFullYear();
      const month = String(currentDayDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDayDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      let disabled = false;
      let reason = '';
      let description = '';
      let badge = '';

      // 1. Check holidays
      const holidayMatch = (calendarData?.holidays || []).find((h) => {
        const hStart = h.date || h.startDate;
        const hEnd = h.endDate || h.date || h.startDate;
        return hStart && dateStr >= hStart && dateStr <= hEnd;
      });

      if (holidayMatch) {
        disabled = true;
        reason = holidayMatch.name || holidayMatch.title || 'Official Holiday';
        description = holidayMatch.desc || holidayMatch.description || 'No Classes Scheduled';
        badge = 'HOLIDAY';
      }

      // 2. Check no-class periods
      if (!disabled) {
        const noClassMatch = (calendarData?.noClassPeriods || []).find((nc) => {
          const start = nc.start || nc.startDate;
          const end = nc.end || nc.endDate || start;
          return start && dateStr >= start && dateStr <= end;
        });

        if (noClassMatch) {
          disabled = true;
          reason = noClassMatch.reason || noClassMatch.desc || 'No Classes Scheduled';
          description = noClassMatch.desc || '';
          badge = 'NO CLASS';
        }
      }

      // 3. Check official calendar events (from AI scan or manual entry)
      if (!disabled) {
        const eventMatch = (calendarData?.events || []).find((ev) => {
          const evStart = ev.startDate || ev.date;
          const evEnd = ev.endDate || evStart;
          return (
            evStart &&
            dateStr >= evStart &&
            dateStr <= evEnd &&
            (ev.isNoClass || ev.category === 'holiday')
          );
        });

        if (eventMatch) {
          disabled = true;
          reason = eventMatch.title || 'School Activity / Holiday';
          description = eventMatch.description || (eventMatch.isNoClass ? 'No Classes' : '');
          badge = eventMatch.category === 'holiday' ? 'HOLIDAY' : 'NO CLASS';
        }
      }

      days.push({
        date: dateStr,
        disabled,
        reason,
        description,
        badge,
      });
    }

    return days;
  }, [weekStartDate, calendarData]);

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay !z-[10001] fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      onClick={(e) => {
        e.stopPropagation();
        onClose?.();
      }}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl max-w-6xl w-full p-4 sm:p-6 h-[92vh] max-h-[92vh] flex flex-col border border-gray-100 animate-modal-pop overflow-hidden"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-red-50 text-[#7A0808]">
              <Building2 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-gray-900">
                  {room.buildingName ? `${room.buildingName} — ` : ''}{room.name || roomCode}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-[#7A0808] border border-red-200 uppercase">
                  {room.type || room.roomType || 'Classroom'}
                </span>
                {room.capacity ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 flex items-center gap-1">
                    <Users size={11} /> {room.capacity} Pax
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Weekly Timetable Schedule (Classes, Approved Reservations, & Maintenance)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body: Weekly Schedule Grid */}
        <div className="overflow-y-auto flex-1 pr-1 overscroll-contain">
          {isLoading ? (
            <div className="py-24 text-center text-gray-400 space-y-3">
              <RefreshCw size={28} className="animate-spin mx-auto text-[#7A0808]" />
              <p className="text-xs font-bold">Loading room timetable...</p>
            </div>
          ) : (
            <WeeklyScheduleGrid
              blocks={scheduleBlocks}
              dayStatuses={dayStatuses}
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
              roomType={room.type || 'Classroom'}
              stickyHeaderOffset={0}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between shrink-0 gap-3">
          <p className="text-xs text-gray-400 font-medium">
            💡 Check available time slots before submitting your reservation.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Close Schedule View
          </button>
        </div>
      </div>
    </div>
  );
}
