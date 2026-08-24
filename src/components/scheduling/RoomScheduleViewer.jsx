import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Clock, Calendar } from 'lucide-react';
import { subscribePlotEntriesForRoomAndSection } from '../../services/plotScheduleService';
import { 
  SCHEDULE_DAYS,
  SCHEDULE_CELL_HEIGHT,
  SCHEDULE_START_HOUR,
  SCHEDULE_SLOT_COUNT,
  formatScheduleHour,
  slotIndexToHour,
  hourToTimeInput,
  gridTotalHeightPx,
  blockTopPx,
  blockHeightPx,
} from '../../constants/scheduleGrid';

/**
 * RoomScheduleViewer - Interactive weekly schedule viewer for a specific room and section
 * Shows occupied room time slots AND section commitments with distinct colors, and prevents conflicts
 */
export default function RoomScheduleViewer({ 
  roomCode, 
  sectionName = null, // Current Section being scheduled (e.g. 'BSMT1-A1')
  roomType = null,
  scheduleMode = 'regular',
  semester = '1',
  deanUid, // Dean's UID if available
  currentTimeSlot = null, // Single slot: { day, startHour, endHour }
  currentTimeSlots = null, // Multi-slot array: [ { day, startHour, endHour }, ... ]
  isEditMode = false,
  ignoreCourseCode = null,
  ignoreSection = null,
  ignoreType = null,
  ignoreEntryIds = [],
  onTimeSelect, // Callback when user drags to select a time: (day, startHour, endHour) => void
  onConflictsChange, // Callback when conflicts are detected or cleared: (conflictsList) => void
}) {
  const [roomEntries, setRoomEntries] = useState([]);
  const [sectionEntries, setSectionEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const gridHeight = gridTotalHeightPx();

  // Normalize single slot or array of slots
  const effectiveTimeSlots = useMemo(() => {
    if (Array.isArray(currentTimeSlots) && currentTimeSlots.length > 0) {
      return currentTimeSlots.filter(s => s && s.day !== undefined && s.startHour !== undefined && s.endHour !== undefined);
    }
    if (currentTimeSlot && currentTimeSlot.day !== undefined && currentTimeSlot.startHour !== undefined && currentTimeSlot.endHour !== undefined) {
      return [currentTimeSlot];
    }
    return [];
  }, [currentTimeSlots, currentTimeSlot]);

  // Keep drag ref in sync
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // Auto-scroll to proposed time slot when room schedule viewer opens or proposed time changes
  useEffect(() => {
    const firstSlot = effectiveTimeSlots[0];
    if (firstSlot?.startHour !== undefined && scrollContainerRef.current) {
      const topPx = blockTopPx(firstSlot.startHour);
      scrollContainerRef.current.scrollTop = Math.max(0, topPx - 10);
    }
  }, [effectiveTimeSlots, roomCode]);

  // Subscribe to all schedule entries for this room AND this section across all deans
  useEffect(() => {
    if (!roomCode && !sectionName) {
      setRoomEntries([]);
      setSectionEntries([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return subscribePlotEntriesForRoomAndSection(
      roomCode,
      sectionName,
      semester,
      scheduleMode,
      deanUid,
      ({ roomEntries: rData, sectionEntries: sData }) => {
        setRoomEntries(rData || []);
        setSectionEntries(sData || []);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading room & section schedule:', err);
        setLoading(false);
      }
    );
  }, [roomCode, sectionName, semester, scheduleMode, deanUid]);

  const parseDay = (d, dateStr, dayLabelStr) => {
    if (typeof d === 'number' && d >= 0 && d <= 6) return d;
    const str = String(d || dateStr || dayLabelStr || '').trim().toUpperCase();
    const idx = SCHEDULE_DAYS.findIndex((dayName) => str.includes(dayName) || dayName.includes(str));
    return idx >= 0 ? idx : 0;
  };

  const normalizeRoom = (str) => String(str || '').replace(/[\s\-_]/g, '').toUpperCase();
  const currentRoomNorm = normalizeRoom(roomCode);

  // Convert entries to blocks for rendering (combining room blocks and section-only blocks)
  const blocks = useMemo(() => {
    const all = [];
    const seenIds = new Set();

    // 1. Room Blocks (Class taking place in this room)
    roomEntries.forEach((entry) => {
      seenIds.add(entry.id);
      all.push({
        id: `room-${entry.id}`,
        originalId: entry.id,
        day: parseDay(entry.day, entry.date, entry.dayLabel),
        start: Number(entry.startHour) || 0,
        end: Number(entry.endHour) || 0,
        title: entry.title || entry.courseCode || '',
        course: entry.courseCode || entry.title || '',
        instructor: entry.instructor || '',
        type: entry.type || 'Lecture',
        section: entry.section || entry.sectionName || '',
        program: entry.program || entry.programCode || '',
        roomCode: entry.roomCode || roomCode,
        isSectionOnly: false,
      });
    });

    // 2. Section Blocks (This section has class in OTHER rooms)
    sectionEntries.forEach((entry) => {
      const eRoomNorm = normalizeRoom(entry.roomCode || entry.room || entry.roomId || entry.roomName || '');
      // If this entry is already taking place in the current room, it is already rendered in roomBlocks
      if (eRoomNorm === currentRoomNorm || seenIds.has(entry.id)) {
        return;
      }

      all.push({
        id: `sec-${entry.id}`,
        originalId: entry.id,
        day: parseDay(entry.day, entry.date, entry.dayLabel),
        start: Number(entry.startHour) || 0,
        end: Number(entry.endHour) || 0,
        title: entry.title || entry.courseCode || '',
        course: entry.courseCode || entry.title || '',
        instructor: entry.instructor || '',
        type: 'SectionBusy',
        section: entry.section || sectionName,
        program: entry.program || entry.programCode || '',
        roomCode: entry.roomCode || 'Other Room',
        isSectionOnly: true,
      });
    });

    return all;
  }, [roomEntries, sectionEntries, roomCode, currentRoomNorm, sectionName]);

  // Group blocks by day
  const blocksByDay = useMemo(() => {
    return Array.from({ length: 7 }, (_, day) => blocks.filter((b) => b.day === day));
  }, [blocks]);

  // Finish drag and call onTimeSelect
  const finishDrag = useCallback((currentDrag) => {
    if (!currentDrag || !onTimeSelect) return;
    const { dayIndex, startSlot, endSlot } = currentDrag;
    const minSlot = Math.min(startSlot, endSlot);
    const maxSlot = Math.max(startSlot, endSlot);
    const startHour = slotIndexToHour(minSlot);
    const endHour = minSlot === maxSlot ? slotIndexToHour(maxSlot) + 0.5 : slotIndexToHour(maxSlot);
    
    onTimeSelect(dayIndex, startHour, endHour);
  }, [onTimeSelect]);

  // Handle mouse up globally
  useEffect(() => {
    const onMouseUp = () => {
      const d = dragRef.current;
      if (d?.active) {
        finishDrag(d);
      }
      setDrag(null);
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [finishDrag]);

  // Check if slot is selected during drag
  const isSlotSelected = (dayIndex, slotIndex) => {
    if (!drag?.active || drag.dayIndex !== dayIndex) return false;
    const min = Math.min(drag.startSlot, drag.endSlot);
    const max = Math.max(drag.startSlot, drag.endSlot);
    if (min === max) return slotIndex === min;
    return slotIndex >= min && slotIndex < max;
  };

  // Check if slot is part of proposed time
  const isSlotProposed = (dayIndex, slotIndex) => {
    const slotHour = slotIndexToHour(slotIndex);
    return effectiveTimeSlots.some(
      (s) => s.day === dayIndex && slotHour >= s.startHour && slotHour < s.endHour
    );
  };

  // Handle slot mouse down
  const handleSlotMouseDown = (dayIndex, slotIndex) => {
    if (!onTimeSelect) return;
    setDrag({
      active: true,
      dayIndex,
      startSlot: slotIndex,
      endSlot: slotIndex,
    });
  };

  // Handle slot mouse enter during drag
  const handleSlotMouseEnter = (dayIndex, slotIndex) => {
    if (!drag?.active || drag.dayIndex !== dayIndex) return;
    setDrag((d) => (d ? { ...d, endSlot: slotIndex } : d));
  };

  // Detect conflicts with proposed times across all active days (both Room & Section conflicts)
  const conflicts = useMemo(() => {
    if (effectiveTimeSlots.length === 0) return [];
    const result = [];
    const seenConflictKeys = new Set();

    const isConflictIgnored = (block) => {
      if (ignoreEntryIds && Array.isArray(ignoreEntryIds) && ignoreEntryIds.length > 0) {
        if (ignoreEntryIds.includes(block.originalId) || ignoreEntryIds.includes(block.id)) {
          return true;
        }
      }
      if (ignoreCourseCode) {
        const codeMatches =
          String(block.course || '').trim().toUpperCase() === String(ignoreCourseCode).trim().toUpperCase() ||
          String(block.title || '').trim().toUpperCase().includes(String(ignoreCourseCode).trim().toUpperCase());
        const secMatches =
          !ignoreSection ||
          String(block.section || '').trim().toUpperCase() === String(ignoreSection).trim().toUpperCase();

        const isLabBlock = String(block.type || '').toLowerCase().includes('lab');
        const isLabIgnore = String(ignoreType || '').toLowerCase().includes('lab');
        const typeMatches = !ignoreType || isLabBlock === isLabIgnore;

        if (codeMatches && secMatches && typeMatches) {
          return true;
        }
      }
      return false;
    };

    effectiveTimeSlots.forEach((slot) => {
      blocks.forEach((block) => {
        if (block.day !== slot.day) return;
        if (isConflictIgnored(block)) return;

        // Check time overlap: (start1 < end2) AND (start2 < end1)
        if (block.start < slot.endHour && block.end > slot.startHour) {
          const conflictType = block.isSectionOnly ? 'section' : 'room';
          const key = `${conflictType}-${block.originalId || block.id}-${slot.day}`;
          if (seenConflictKeys.has(key)) return;
          seenConflictKeys.add(key);

          result.push({
            ...block,
            conflictType,
            conflictDay: slot.day,
            conflictDayName: SCHEDULE_DAYS[slot.day],
            conflictStart: slot.startHour,
            conflictEnd: slot.endHour,
            message: conflictType === 'section'
              ? `Section ${sectionName || 'this section'} already has "${block.course || block.title}" scheduled in Room ${block.roomCode || 'another room'} (${formatScheduleHour(block.start)} – ${formatScheduleHour(block.end)})`
              : `Room ${roomCode} is already occupied by "${block.course || block.title}"${block.section ? ` (Sec: ${block.section})` : ''} (${formatScheduleHour(block.start)} – ${formatScheduleHour(block.end)})`,
          });
        }
      });
    });
    return result;
  }, [effectiveTimeSlots, blocks, roomCode, sectionName, isEditMode, ignoreCourseCode, ignoreSection, ignoreType, ignoreEntryIds]);

  // Propagate conflicts to parent
  useEffect(() => {
    if (onConflictsChange) {
      onConflictsChange(conflicts);
    }
  }, [conflicts, onConflictsChange]);

  if (loading) {
    return (
      <div className="p-8 text-center bg-gray-50/70 rounded-2xl border border-gray-200">
        <p className="text-xs font-semibold text-gray-500">Loading live schedule for Room {roomCode}...</p>
      </div>
    );
  }

  const SCHEDULE_TYPE_COLORS = {
    Lecture: { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B', badgeBg: '#FEF2F2', badgeText: '#991B1B' },
    Laboratory: { bg: '#D1FAE5', border: '#10B981', text: '#065F46', badgeBg: '#ECFDF5', badgeText: '#065F46' },
    CAS: { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', badgeBg: '#FFFBEB', badgeText: '#92400E' },
    Exam: { bg: '#FCE7F3', border: '#EC4899', text: '#9F1239', badgeBg: '#FDF2F8', badgeText: '#9F1239' },
    Maintenance: { bg: '#FFEDD5', border: '#FDBA74', text: '#C2410C', badgeBg: '#FFF7ED', badgeText: '#C2410C' },
    Reservation: { bg: '#F3E8FF', border: '#D8B4FE', text: '#6B21A8', badgeBg: '#FAF5FF', badgeText: '#6B21A8' },
    SectionBusy: { bg: '#EEF2FF', border: '#6366F1', text: '#312E81', badgeBg: '#4F46E5', badgeText: '#FFFFFF' },
  };

  const sectionBusyBlocksCount = blocks.filter((b) => b.isSectionOnly).length;

  return (
    <div className="space-y-3 select-none">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-xs font-black text-gray-900">
            Weekly Schedule for Room {roomCode}
          </p>
          <p className="text-[10px] font-medium text-gray-500">
            {roomEntries.length === 0
              ? 'No existing schedules in this room (Room is vacant)'
              : `${roomEntries.length} scheduled ${roomEntries.length === 1 ? 'class' : 'classes'} in this room`}
            {sectionName && sectionBusyBlocksCount > 0 && (
              <span className="text-indigo-700 font-bold ml-1.5">
                • {sectionBusyBlocksCount} other {sectionBusyBlocksCount === 1 ? 'class' : 'classes'} scheduled for Section {sectionName}
              </span>
            )}
          </p>
        </div>
        {roomEntries.length > 0 ? (
          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
            {roomEntries.length} room {roomEntries.length === 1 ? 'block' : 'blocks'}
          </span>
        ) : (
          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            ✓ Room vacant this week
          </span>
        )}
      </div>

      {/* Prominent Detailed Conflict Warning Card (Top of Grid) */}
      {effectiveTimeSlots.length > 0 && conflicts.length > 0 && (
        <div className="p-4 bg-red-50/95 border-2 border-red-500 rounded-2xl space-y-3 shadow-md animate-in fade-in duration-200">
          <div className="flex items-center justify-between gap-2 border-b border-red-200 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-red-600 text-white font-black text-xs flex items-center justify-center shadow-xs flex-shrink-0">
                ⚠️
              </div>
              <div>
                <p className="text-xs font-black text-red-950 uppercase tracking-wide">
                  Scheduling Conflict Detected ({conflicts.length} {conflicts.length === 1 ? 'conflict' : 'conflicts'})
                </p>
                <p className="text-[11px] font-semibold text-red-800">
                  The selected time slot cannot be scheduled due to overlapping commitments. Review details below:
                </p>
              </div>
            </div>
            <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-red-600 text-white uppercase tracking-wider flex-shrink-0">
              Action Required
            </span>
          </div>

          <div className="space-y-3">
            {conflicts.map((conflict, cIdx) => {
              const isSectionConflict = conflict.conflictType === 'section';
              return (
                <div
                  key={`${conflict.id}-${cIdx}`}
                  className="bg-white rounded-xl border border-red-200 p-3.5 shadow-xs space-y-2.5"
                >
                  {/* Badge & Day Row */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          isSectionConflict
                            ? 'bg-indigo-100 text-indigo-950 border border-indigo-300'
                            : 'bg-red-100 text-red-950 border border-red-300'
                        }`}
                      >
                        {isSectionConflict ? '📌 Section Schedule Conflict' : '🚪 Room Occupancy Conflict'}
                      </span>
                      <span className="font-black text-xs text-gray-900">
                        {conflict.conflictDayName || SCHEDULE_DAYS[conflict.day]}
                      </span>
                    </div>

                    <span className="text-[10.5px] font-extrabold text-red-700 bg-red-50 px-2.5 py-0.5 rounded-md border border-red-200">
                      Overlap: {formatScheduleHour(Math.max(conflict.start, conflict.conflictStart))} – {formatScheduleHour(Math.min(conflict.end, conflict.conflictEnd))}
                    </span>
                  </div>

                  {/* Explicit Explanation of Why it is a Conflict */}
                  <div className="p-3 rounded-xl bg-gray-50/90 border border-gray-200 text-xs space-y-1.5">
                    <p className="font-bold text-gray-900 leading-relaxed">
                      {isSectionConflict ? (
                        <>
                          <span className="text-indigo-900 font-extrabold">Why this is a conflict: </span>
                          Section <span className="font-black underline text-indigo-950">{sectionName || conflict.section}</span> is already scheduled for{' '}
                          <span className="font-black text-[#7A0808]">{conflict.course || conflict.title}</span>
                          {conflict.instructor && <span className="text-gray-700 font-medium"> ({conflict.instructor})</span>} in{' '}
                          <span className="font-black text-indigo-900 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">Room {conflict.roomCode}</span> on{' '}
                          <span className="font-bold">{conflict.conflictDayName}</span> from{' '}
                          <span className="font-black text-red-900">{formatScheduleHour(conflict.start)} to {formatScheduleHour(conflict.end)}</span>.
                        </>
                      ) : (
                        <>
                          <span className="text-red-900 font-extrabold">Why this is a conflict: </span>
                          Room <span className="font-black underline text-red-950">{roomCode}</span> is already occupied by{' '}
                          {conflict.section && <span className="font-bold">Section {conflict.section} for </span>}
                          <span className="font-black text-[#7A0808]">{conflict.course || conflict.title}</span>
                          {conflict.instructor && <span className="text-gray-700 font-medium"> ({conflict.instructor})</span>} on{' '}
                          <span className="font-bold">{conflict.conflictDayName}</span> from{' '}
                          <span className="font-black text-red-900">{formatScheduleHour(conflict.start)} to {formatScheduleHour(conflict.end)}</span>.
                        </>
                      )}
                    </p>

                    <p className="text-[11px] font-medium text-gray-600 flex items-center gap-1.5">
                      {isSectionConflict ? (
                        <>
                          <span className="text-amber-600 font-black">⚠️ Student Double-Booking:</span> Students in section <span className="font-bold text-gray-900">{sectionName || conflict.section}</span> cannot be attending class in <span className="font-bold text-gray-900">{roomCode}</span> and <span className="font-bold text-indigo-900">{conflict.roomCode}</span> at the same time.
                        </>
                      ) : (
                        <>
                          <span className="text-amber-600 font-black">⚠️ Room Double-Booking:</span> Room <span className="font-bold text-gray-900">{roomCode}</span> is not vacant during this time. Two different classes cannot occupy the same room simultaneously.
                        </>
                      )}
                    </p>
                  </div>

                  {/* Action Recommendation */}
                  <div className="p-2.5 rounded-lg bg-gray-100/80 text-[10.5px] font-medium text-gray-700 flex items-center gap-1.5">
                    <span className="font-black text-gray-900 flex-shrink-0">💡 How to resolve:</span>
                    <span className="truncate">
                      {isSectionConflict
                        ? `Change ${conflict.conflictDayName}'s time to before ${formatScheduleHour(conflict.start)} or after ${formatScheduleHour(conflict.end)}, uncheck ${conflict.conflictDayName}, or select an alternate vacant day/time.`
                        : `Choose an available time slot on the grid, select another room from the left floor list, or choose a different day.`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] bg-gray-50/70 p-2 rounded-xl border border-gray-100">
        {sectionName && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-indigo-100 border-2 border-dashed border-indigo-500"></div>
            <span className="text-indigo-900 font-extrabold">Section {sectionName} (Other Room)</span>
          </div>
        )}
        {effectiveTimeSlots.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${conflicts.length > 0 ? 'bg-red-200 border-2 border-red-600' : 'bg-amber-200 border-2 border-amber-600'}`}></div>
            <span className={conflicts.length > 0 ? 'text-red-950 font-black' : 'text-amber-950 font-black'}>
              {conflicts.length > 0 ? 'Conflicting Proposed Time' : 'Your Proposed Time'}
            </span>
          </div>
        )}
      </div>

      {/* Full Weekly Schedule Grid (Always Rendered) */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
        <div ref={scrollContainerRef} style={{ minWidth: 600, maxHeight: 420, overflowY: 'auto' }}>
          {/* Day Headers */}
          <div className="grid sticky top-0 bg-white z-10 border-b border-gray-200 shadow-2xs" style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}>
            <div className="p-2 text-[10px] font-black text-gray-400 uppercase">Time</div>
            {SCHEDULE_DAYS.map((day) => (
              <div key={day} className="p-2 text-center border-l border-gray-200">
                <p className="text-[10px] font-black text-gray-800 uppercase">{day.slice(0, 3)}</p>
              </div>
            ))}
          </div>

          {/* Time Grid */}
          <div className="relative" style={{ height: gridHeight }}>
            {/* Grid rows */}
            {Array.from({ length: SCHEDULE_SLOT_COUNT }, (_, slotIndex) => {
              const hour = slotIndexToHour(slotIndex);
              const isHalf = slotIndex % 2 !== 0;
              const label = formatScheduleHour(hour);

              return (
                <div
                  key={slotIndex}
                  className="grid"
                  style={{ 
                    gridTemplateColumns: '60px repeat(7, 1fr)', 
                    height: SCHEDULE_CELL_HEIGHT,
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: slotIndex * SCHEDULE_CELL_HEIGHT 
                  }}
                >
                  {/* Time label - show for all slots */}
                  <div className="border-t border-gray-100 pr-2 flex items-start pt-1 bg-white z-[1]">
                    <span className={`text-[9px] font-medium ${isHalf ? 'text-gray-300' : 'text-gray-400'}`}>
                      {label}
                    </span>
                  </div>

                  {/* Day cells */}
                  {SCHEDULE_DAYS.map((_, dayIndex) => {
                    const selected = isSlotSelected(dayIndex, slotIndex);
                    const proposed = isSlotProposed(dayIndex, slotIndex);
                    const dayConflicts = conflicts.filter(c => c.conflictDay === dayIndex);
                    const hasDayConflict = dayConflicts.length > 0;
                    const cellBg = proposed
                      ? (hasDayConflict ? '#FEE2E2' : '#FEF3C7')
                      : selected
                      ? '#FEE2E2'
                      : 'transparent';

                    return (
                      <div
                        key={dayIndex}
                        className="border-t border-l border-gray-100"
                        style={{
                          height: SCHEDULE_CELL_HEIGHT,
                          background: cellBg,
                          cursor: onTimeSelect ? 'crosshair' : 'default',
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSlotMouseDown(dayIndex, slotIndex);
                        }}
                        onMouseEnter={() => handleSlotMouseEnter(dayIndex, slotIndex)}
                        role="presentation"
                      />
                    );
                  })}
                </div>
              );
            })}

            {/* Proposed Time Overlay Blocks (Multi-Day Support) */}
            {effectiveTimeSlots.length > 0 && (
              <div
                className="absolute top-0 grid pointer-events-none z-[5]"
                style={{
                  left: 60,
                  right: 0,
                  height: gridHeight,
                  gridTemplateColumns: 'repeat(7, 1fr)',
                }}
              >
                {effectiveTimeSlots.map((slot, idx) => {
                  const dayConflicts = conflicts.filter((c) => c.conflictDay === slot.day);
                  const hasConflict = dayConflicts.length > 0;

                  return (
                    <div
                      key={`${slot.day}-${slot.startHour}-${slot.endHour}-${idx}`}
                      style={{ gridColumnStart: slot.day + 1 }}
                      className="relative h-full"
                    >
                      <div
                        className={`absolute left-1 right-1 rounded-xl p-2 shadow-md pointer-events-auto overflow-hidden animate-in fade-in duration-150 ${
                          hasConflict
                            ? 'bg-red-200/95 border-2 border-red-600 text-red-950'
                            : 'bg-amber-200/90 border-2 border-amber-600 text-amber-950'
                        }`}
                        style={{
                          top: blockTopPx(slot.startHour),
                          height: blockHeightPx(slot.startHour, slot.endHour),
                        }}
                      >
                        <p className={`text-[10px] font-black tracking-wide flex items-center gap-1 ${hasConflict ? 'text-red-900' : 'text-amber-900'}`}>
                          <span>{hasConflict ? '⚠️ CONFLICT' : '★ PROPOSED'}</span>
                        </p>
                        <p className="text-[11px] font-extrabold mt-0.5">
                          {formatScheduleHour(slot.startHour)} – {formatScheduleHour(slot.endHour)}
                        </p>
                        {hasConflict ? (
                          <p className="text-[9px] font-black text-red-900 truncate">
                            {dayConflicts[0].conflictType === 'section' ? 'Section Conflict: ' : 'Room Conflict: '}
                            {dayConflicts[0].course || dayConflicts[0].title}
                          </p>
                        ) : (
                          <p className="text-[9px] font-bold text-amber-800">
                            ({Math.round((slot.endHour - slot.startHour) * 10) / 10} hrs)
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Schedule blocks overlay */}
            <div
              className="absolute top-0 grid pointer-events-none z-[10]"
              style={{ 
                left: 60, 
                right: 0, 
                height: gridHeight, 
                gridTemplateColumns: 'repeat(7, 1fr)' 
              }}
            >
              {blocksByDay.map((dayBlocks, dayIndex) => (
                <div key={dayIndex} className="relative h-full" style={{ minHeight: gridHeight }}>
                  {dayBlocks.map((block) => {
                    const colors = SCHEDULE_TYPE_COLORS[block.type] || SCHEDULE_TYPE_COLORS.Lecture;
                    const topPx = blockTopPx(block.start);
                    const heightPx = blockHeightPx(block.start, block.end);
                    
                    return (
                      <div
                        key={block.id}
                        className="absolute left-1 right-1 rounded-lg p-2 pointer-events-auto overflow-hidden shadow-2xs"
                        style={{
                          top: topPx,
                          height: heightPx,
                          maxHeight: gridHeight - topPx,
                          background: colors.bg,
                          border: block.isSectionOnly ? `2px dashed ${colors.border}` : `1.5px solid ${colors.border}`,
                        }}
                      >
                        {block.isSectionOnly ? (
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className="text-[7.5px] font-black px-1.5 py-0.2 rounded bg-indigo-600 text-white uppercase tracking-wider">
                                Section Busy
                              </span>
                              <span className="text-[7.5px] font-black text-indigo-700 truncate">
                                📍 Rm: {block.roomCode}
                              </span>
                            </div>
                            <p className="text-[9px] font-black text-indigo-950 truncate">
                              {block.title || block.course}
                            </p>
                            <p className="text-[8px] font-bold text-indigo-800 truncate">
                              Sec: {block.section}{block.instructor ? ` · ${block.instructor}` : ''}
                            </p>
                            <p className="text-[8px] font-semibold text-indigo-700">
                              {formatScheduleHour(block.start)} – {formatScheduleHour(block.end)}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-[9px] font-black truncate" style={{ color: colors.text }}>
                              {block.title || block.course}
                            </p>
                            <p className="text-[8px] font-semibold truncate" style={{ color: colors.text }}>
                              {block.course}{block.instructor ? ` · ${block.instructor}` : ''}
                            </p>
                            {(block.section || block.program) && (
                              <p className="text-[8px] font-bold truncate opacity-90" style={{ color: colors.text }}>
                                Sec: {block.section || block.program}
                              </p>
                            )}
                            <p className="text-[8px]" style={{ color: colors.text }}>
                              {formatScheduleHour(block.start)} - {formatScheduleHour(block.end)}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}