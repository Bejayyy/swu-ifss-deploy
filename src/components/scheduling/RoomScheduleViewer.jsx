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
  scheduleMode = 'regular',
  semester = '1',
  deanUid, // Required: The dean's UID to query their schedules
  currentTimeSlot = null, // { day, startHour, endHour } - to highlight the proposed time
  onTimeSelect, // Callback when user drags to select a time: (day, startHour, endHour) => void
}) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);

  const gridHeight = gridTotalHeightPx();

  // Keep drag ref in sync
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // Subscribe to all schedule entries for this room
  useEffect(() => {
    if (!roomCode || !deanUid) {
      setEntries([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return subscribePlotEntriesForRoom(
      roomCode,
      semester,
      scheduleMode,
      deanUid, // Pass deanUid to query function
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

  // Convert entries to blocks for rendering
  const blocks = useMemo(() => {
    return entries.map(entry => ({
      id: entry.id,
      day: entry.day,
      start: entry.startHour,
      end: entry.endHour,
      title: entry.title,
      course: entry.courseCode,
      instructor: entry.instructor,
      type: entry.type,
      section: entry.sectionName || entry.section || '',
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
    const endHour = minSlot === maxSlot
      ? startHour + 1
      : slotIndexToHour(maxSlot) + 0.5;
    
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
    return slotIndex >= min && slotIndex <= max;
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
    console.log('Mouse down on day:', dayIndex, 'slot:', slotIndex, 'day name:', SCHEDULE_DAYS[dayIndex]);
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
    console.log('Mouse enter on day:', dayIndex, 'slot:', slotIndex);
    setDrag((d) => (d ? { ...d, endSlot: slotIndex } : d));
  };

  // Detect conflicts with proposed time
  const conflicts = useMemo(() => {
    if (!currentTimeSlot) return [];
    const result = [];
    blocks.forEach(block => {
      if (block.day !== currentTimeSlot.day) return;
      // Check if ranges overlap
      if (block.start < currentTimeSlot.endHour && block.end > currentTimeSlot.startHour) {
        result.push(block);
      }
    });
    return result;
  }, [currentTimeSlot, blocks]);

  if (loading) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-gray-400">Loading room schedule...</p>
      </div>
    );
  }

  const SCHEDULE_TYPE_COLORS = {
    Lecture: { bg: '#DBEAFE', border: '#3B82F6', text: '#1E40AF' },
    Laboratory: { bg: '#D1FAE5', border: '#10B981', text: '#065F46' },
    CAS: { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
    Exam: { bg: '#FCE7F3', border: '#EC4899', text: '#9F1239' },
    Maintenance: { bg: '#F3F4F6', border: '#9CA3AF', text: '#374151' },
  };

  return (
    <div className="space-y-3 select-none">
      <div className="mb-2">
        <p className="text-xs font-bold" style={{ color: '#2B3235' }}>
          Weekly Schedule for {roomCode}
        </p>
        <p className="text-[10px] text-gray-500">
          {entries.length} schedule {entries.length === 1 ? 'entry' : 'entries'} this week
        </p>
        {onTimeSelect && (
          <p className="text-[10px] font-semibold mt-1" style={{ color: '#7A0808' }}>
            👆 Click or drag on the grid to set your schedule time
          </p>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-[10px]">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#DBEAFE', border: '1.5px solid #3B82F6' }}></div>
          <span className="text-gray-600 font-semibold">Lecture</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#D1FAE5', border: '1.5px solid #10B981' }}></div>
          <span className="text-gray-600 font-semibold">Laboratory</span>
        </div>
        {onTimeSelect && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#FEE2E2', border: '1.5px solid #FCA5A5' }}></div>
            <span className="text-gray-600 font-semibold">Drag selection</span>
          </div>
        )}
        {currentTimeSlot && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#FEF3C7', border: '1.5px solid #F59E0B' }}></div>
            <span className="text-gray-600 font-semibold">Your time</span>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
          <Calendar size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-xs text-gray-500">No schedules for this room yet</p>
          {onTimeSelect && (
            <p className="text-[10px] text-gray-400 mt-1">Click or drag to set your time</p>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div style={{ minWidth: 600, maxHeight: 500, overflowY: 'auto' }}>
            {/* Day Headers */}
            <div className="grid sticky top-0 bg-white z-10 border-b border-gray-200" style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}>
              <div className="p-2 text-[10px] font-bold text-gray-400 uppercase">Time</div>
              {SCHEDULE_DAYS.map((day) => (
                <div key={day} className="p-2 text-center border-l border-gray-200">
                  <p className="text-[10px] font-bold text-gray-700 uppercase">{day.slice(0, 3)}</p>
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

                      return (
                        <div
                          key={dayIndex}
                          className="border-t border-l border-gray-100"
                          style={{
                            height: SCHEDULE_CELL_HEIGHT,
                            background: proposed ? '#FEF3C7' : selected ? '#FEE2E2' : 'transparent',
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

              {/* Schedule blocks overlay */}
              <div
                className="absolute top-0 grid pointer-events-none"
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
      )}

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