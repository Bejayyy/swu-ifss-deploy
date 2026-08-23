import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Clock, Calendar } from 'lucide-react';
import { subscribePlotEntriesForRoom } from '../../services/plotScheduleService';
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
 * RoomScheduleViewer - Interactive weekly schedule viewer for a specific room
 * Shows occupied time slots and allows drag-to-select for setting schedule times
 */
export default function RoomScheduleViewer({ 
  roomCode, 
  roomType = null,
  scheduleMode = 'regular',
  semester = '1',
  deanUid, // Dean's UID if available
  currentTimeSlot = null, // { day, startHour, endHour } - to highlight the proposed time
  onTimeSelect, // Callback when user drags to select a time: (day, startHour, endHour) => void
  onConflictsChange, // Callback when conflicts are detected or cleared: (conflictsList) => void
}) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const gridHeight = gridTotalHeightPx();

  // Keep drag ref in sync
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // Auto-scroll to proposed time slot when room schedule viewer opens or proposed time changes
  useEffect(() => {
    if (currentTimeSlot?.startHour !== undefined && scrollContainerRef.current) {
      const topPx = blockTopPx(currentTimeSlot.startHour);
      scrollContainerRef.current.scrollTop = Math.max(0, topPx - 10);
    }
  }, [currentTimeSlot?.startHour, roomCode]);

  // Subscribe to all schedule entries for this room across all deans and sections
  useEffect(() => {
    if (!roomCode) {
      setEntries([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return subscribePlotEntriesForRoom(
      roomCode,
      semester,
      scheduleMode,
      deanUid,
      (data) => {
        setEntries(data);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading room schedule:', err);
        setLoading(false);
      }
    );
  }, [roomCode, semester, scheduleMode, deanUid]);

  const parseDay = (d, dateStr, dayLabelStr) => {
    if (typeof d === 'number' && d >= 0 && d <= 6) return d;
    const str = String(d || dateStr || dayLabelStr || '').trim().toUpperCase();
    const idx = SCHEDULE_DAYS.findIndex((dayName) => str.includes(dayName) || dayName.includes(str));
    return idx >= 0 ? idx : 0;
  };

  // Convert entries to blocks for rendering
  const blocks = useMemo(() => {
    return entries.map(entry => ({
      id: entry.id,
      day: parseDay(entry.day, entry.date, entry.dayLabel),
      start: Number(entry.startHour) || 0,
      end: Number(entry.endHour) || 0,
      title: entry.title || entry.courseCode || '',
      course: entry.courseCode || entry.title || '',
      instructor: entry.instructor || '',
      type: entry.type || 'Lecture',
      section: entry.section || entry.sectionName || '',
      program: entry.program || entry.programCode || '',
    }));
  }, [entries]);

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
    if (!currentTimeSlot || currentTimeSlot.day !== dayIndex) return false;
    const slotHour = slotIndexToHour(slotIndex);
    return slotHour >= currentTimeSlot.startHour && slotHour < currentTimeSlot.endHour;
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

  // Detect conflicts with proposed time
  const conflicts = useMemo(() => {
    if (!currentTimeSlot || currentTimeSlot.day === undefined || currentTimeSlot.startHour === undefined || currentTimeSlot.endHour === undefined) {
      return [];
    }
    const result = [];
    blocks.forEach(block => {
      if (block.day !== currentTimeSlot.day) return;
      // Check if ranges overlap: block.start < currentTimeSlot.endHour && block.end > currentTimeSlot.startHour
      if (block.start < currentTimeSlot.endHour && block.end > currentTimeSlot.startHour) {
        result.push(block);
      }
    });
    return result;
  }, [currentTimeSlot, blocks]);

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
    Lecture: { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B' },
    Laboratory: { bg: '#D1FAE5', border: '#10B981', text: '#065F46' },
    CAS: { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
    Exam: { bg: '#FCE7F3', border: '#EC4899', text: '#9F1239' },
    Maintenance: { bg: '#FFEDD5', border: '#FDBA74', text: '#C2410C' },
    Reservation: { bg: '#F3E8FF', border: '#D8B4FE', text: '#6B21A8' },
  };

  return (
    <div className="space-y-3 select-none">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-xs font-black text-gray-900">
            Weekly Schedule for Room {roomCode}
          </p>
          <p className="text-[10px] font-medium text-gray-500">
            {entries.length === 0 ? 'No existing schedules this week (Room is vacant)' : `${entries.length} scheduled ${entries.length === 1 ? 'class' : 'classes'} this week`}
          </p>
        </div>
        {entries.length > 0 ? (
          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
            {entries.length} scheduled {entries.length === 1 ? 'block' : 'blocks'}
          </span>
        ) : (
          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            ✓ Vacant this week
          </span>
        )}
      </div>

      {/* Prominent Conflict Warning Bar (Top of Grid) */}
      {currentTimeSlot && conflicts.length > 0 && (
        <div className="p-3 bg-red-100/90 border-2 border-red-500 rounded-xl flex items-start gap-2.5 shadow-sm animate-in fade-in">
          <div className="p-1 rounded-lg bg-red-600 text-white font-black text-xs flex items-center justify-center">
            ⚠️
          </div>
          <div className="flex-1">
            <p className="text-xs font-black text-red-950 uppercase tracking-wide">
              Time Conflict: Room is already scheduled during this time!
            </p>
            <ul className="mt-1 space-y-1">
              {conflicts.map((conflict) => (
                <li key={conflict.id} className="text-[11px] font-bold text-red-900 bg-white/80 border border-red-200 px-2.5 py-1 rounded-lg flex items-center justify-between">
                  <span>
                    <span className="font-extrabold">{conflict.course || conflict.title}</span>
                    {conflict.instructor && <span className="text-gray-700 font-medium ml-1">· {conflict.instructor}</span>}
                    {conflict.section && <span className="text-red-700 font-semibold ml-1.5">(Sec: {conflict.section})</span>}
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-red-100 text-red-950">
                    {formatScheduleHour(conflict.start)} – {formatScheduleHour(conflict.end)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] font-semibold text-red-800 mt-1.5">
              Please choose a different day or time slot to proceed.
            </p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] bg-gray-50/70 p-2 rounded-xl border border-gray-100">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-100 border border-red-300"></div>
          <span className="text-gray-700 font-bold">Lecture</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-400"></div>
          <span className="text-gray-700 font-bold">Laboratory</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-purple-100 border border-purple-300"></div>
          <span className="text-gray-700 font-bold">Reservation</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-orange-100 border border-orange-300"></div>
          <span className="text-gray-700 font-bold">Maintenance</span>
        </div>
        {currentTimeSlot && (
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
              {/* Time slot rows */}
              {Array.from({ length: SCHEDULE_SLOT_COUNT }, (_, slotIndex) => {
                const hour = slotIndexToHour(slotIndex);
                const hInt = Math.floor(hour);
                const isHalf = hour % 1 !== 0;
                const mins = isHalf ? 30 : 0;
                const ampm = hInt >= 12 ? 'PM' : 'AM';
                const displayH = hInt % 12 || 12;
                // Show label for every slot (both :00 and :30)
                const label = `${displayH.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`;

                return (
                  <div
                    key={slotIndex}
                    className="grid absolute left-0 right-0"
                    style={{ 
                      gridTemplateColumns: '60px repeat(7, 1fr)', 
                      height: SCHEDULE_CELL_HEIGHT, 
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
                      const cellBg = proposed
                        ? (conflicts.length > 0 ? '#FEE2E2' : '#FEF3C7')
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

              {/* Proposed Time Overlay Block */}
              {currentTimeSlot && currentTimeSlot.day !== undefined && (
                <div
                  className="absolute top-0 grid pointer-events-none z-[5]"
                  style={{
                    left: 60,
                    right: 0,
                    height: gridHeight,
                    gridTemplateColumns: 'repeat(7, 1fr)',
                  }}
                >
                  <div
                    style={{ gridColumnStart: currentTimeSlot.day + 1 }}
                    className="relative h-full"
                  >
                    <div
                      className={`absolute left-1 right-1 rounded-xl p-2 shadow-md pointer-events-auto overflow-hidden animate-in fade-in duration-150 ${
                        conflicts.length > 0
                          ? 'bg-red-200/95 border-2 border-red-600 text-red-950'
                          : 'bg-amber-200/90 border-2 border-amber-600 text-amber-950'
                      }`}
                      style={{
                        top: blockTopPx(currentTimeSlot.startHour),
                        height: blockHeightPx(currentTimeSlot.startHour, currentTimeSlot.endHour),
                      }}
                    >
                      <p className={`text-[10px] font-black tracking-wide flex items-center gap-1 ${conflicts.length > 0 ? 'text-red-900' : 'text-amber-900'}`}>
                        <span>{conflicts.length > 0 ? '⚠️ TIME CONFLICT' : '★ YOUR PROPOSED TIME'}</span>
                      </p>
                      <p className="text-[11px] font-extrabold mt-0.5">
                        {formatScheduleHour(currentTimeSlot.startHour)} – {formatScheduleHour(currentTimeSlot.endHour)}
                      </p>
                      {conflicts.length > 0 ? (
                        <p className="text-[9px] font-black text-red-900 truncate">
                          Overlap: {conflicts[0].course || conflicts[0].title}
                        </p>
                      ) : (
                        <p className="text-[9px] font-bold text-amber-800">
                          ({Math.round((currentTimeSlot.endHour - currentTimeSlot.startHour) * 10) / 10} hrs)
                        </p>
                      )}
                    </div>
                  </div>
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
                          className="absolute left-1 right-1 rounded-lg p-2 pointer-events-auto overflow-hidden"
                          style={{
                            top: topPx,
                            height: heightPx,
                            maxHeight: gridHeight - topPx,
                            background: colors.bg,
                            border: `1.5px solid ${colors.border}`,
                          }}
                        >
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
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      {/* Conflict Warning */}
      {currentTimeSlot && conflicts.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs font-bold text-red-900 mb-1">⚠️ Time Conflict Detected!</p>
          <p className="text-[10px] text-red-700">
            The room is already occupied during this time:
          </p>
          <ul className="mt-1 space-y-1">
            {conflicts.map((conflict) => (
              <li key={conflict.id} className="text-[10px] text-red-700">
                • {conflict.course} - {conflict.instructor} ({formatScheduleHour(conflict.start)} - {formatScheduleHour(conflict.end)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Success message */}
      {currentTimeSlot && conflicts.length === 0 && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-xs font-bold text-green-900">
            ✓ Room is available at this time ({formatScheduleHour(currentTimeSlot.startHour)} - {formatScheduleHour(currentTimeSlot.endHour)})
          </p>
        </div>
      )}
    </div>
  );
}