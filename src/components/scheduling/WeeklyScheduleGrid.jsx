import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Edit2, Plus, Trash2 } from 'lucide-react';
import {
  SCHEDULE_TYPE_COLORS,
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
  addDays,
  formatWeekRange,
} from '../../constants/scheduleGrid';

export default function WeeklyScheduleGrid({
  title = 'Weekly Schedule',
  schoolYearLabel = 'SY 2025-2026',
  schoolYearOptions = [],
  onSchoolYearChange,
  semester = '1',
  onSemesterChange,
  lockSemester = false,
  scheduleTab = 'regular',
  onScheduleTabChange,
  weekStartDate,
  onPrevWeek,
  onNextWeek,
  canPrevWeek = true,
  canNextWeek = true,
  semesterRangeLabel = '',
  dayStatuses = [],
  blocks = [],
  showLegend = true,
  showControls = true,
  readOnly = false,
  canPlot = false,
  showDayDates = true, // New prop to control date display
  onAddBlock,
  onSlotSelect,
  onEditBlock,
  onDeleteBlock,
  emptyMessage,
}) {
  const weekStart = weekStartDate || new Date();
  const dayDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i).getDate());
  const weekLabel = formatWeekRange(weekStart);
  const gridHeight = gridTotalHeightPx();

  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  const finishDrag = useCallback((currentDrag) => {
    if (!currentDrag || !onSlotSelect) return;
    const { dayIndex, startSlot, endSlot, date } = currentDrag;
    const minSlot = Math.min(startSlot, endSlot);
    const maxSlot = Math.max(startSlot, endSlot);
    const startHour = slotIndexToHour(minSlot);
    const endHour = minSlot === maxSlot
      ? startHour + 1
      : slotIndexToHour(maxSlot) + 0.5;
    onSlotSelect({
      dayIndex,
      date,
      startHour,
      endHour,
      startTime: hourToTimeInput(startHour),
      endTime: hourToTimeInput(endHour),
      fromDrag: minSlot !== maxSlot,
    });
  }, [onSlotSelect]);

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

  const isSlotSelected = (dayIndex, slotIndex) => {
    if (!drag?.active || drag.dayIndex !== dayIndex) return false;
    const min = Math.min(drag.startSlot, drag.endSlot);
    const max = Math.max(drag.startSlot, drag.endSlot);
    return slotIndex >= min && slotIndex <= max;
  };

  const handleSlotMouseDown = (dayIndex, slotIndex, disabled, date) => {
    if (!canPlot || disabled || !onSlotSelect) return;
    setDrag({
      active: true,
      dayIndex,
      startSlot: slotIndex,
      endSlot: slotIndex,
      date,
    });
  };

  const handleSlotMouseEnter = (dayIndex, slotIndex, disabled) => {
    if (!drag?.active || disabled || drag.dayIndex !== dayIndex) return;
    setDrag((d) => (d ? { ...d, endSlot: slotIndex } : d));
  };

  const [typeFilter, setTypeFilter] = useState('All');

  const filteredBlocks = React.useMemo(() => {
    if (!typeFilter || typeFilter === 'All') return blocks;
    return blocks.filter((b) => {
      if (typeFilter === 'Reservation') {
        return b.type === 'Reservation' || b.type?.startsWith('Reservation');
      }
      return b.type === typeFilter;
    });
  }, [blocks, typeFilter]);

  const blocksByDay = Array.from({ length: 7 }, (_, day) => filteredBlocks.filter((b) => b.day === day));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>{title}</h3>
          <p className="text-xs font-bold text-[#7A0808] mt-0.5 flex items-center gap-1.5">
            <Calendar size={13} className="text-[#7A0808]" />
            <span>
              {(() => {
                const startDate = weekStart || new Date();
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
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canPlot && onAddBlock && (
            <button type="button" className="btn-maroon text-xs gap-1.5 py-1.5 px-3" onClick={onAddBlock}>
              <Plus size={14} /> Add schedule
            </button>
          )}
          {showControls && (
            <div className="inline-flex w-fit items-center p-1 gap-1 shadow-sm" style={{ background: '#F9FAFB', borderRadius: 10 }}>
              <button
                type="button"
                onClick={() => onScheduleTabChange?.('regular')}
                className="px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-all"
                style={scheduleTab === 'regular' ? { background: '#800000', color: 'white', borderRadius: 10 } : { background: 'transparent', color: '#2B3235', borderRadius: 10 }}
              >
                <Calendar size={12} /> Regular Schedule
              </button>
              <button
                type="button"
                onClick={() => onScheduleTabChange?.('exam')}
                className="px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-all"
                style={scheduleTab === 'exam' ? { background: '#800000', color: 'white', borderRadius: 10 } : { background: 'transparent', color: '#2B3235', borderRadius: 10 }}
              >
                <Calendar size={12} /> Exam Schedule
              </button>
            </div>
          )}
        </div>
      </div>

      {showControls && (
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {schoolYearOptions.length > 0 && onSchoolYearChange ? (
            <select className="form-input w-40 text-sm" value={schoolYearLabel} onChange={(e) => onSchoolYearChange(e.target.value)} disabled>
              {schoolYearOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-bold px-3 py-2 rounded-lg border border-gray-200" style={{ color: '#2B3235' }}>{schoolYearLabel}</span>
          )}
          <div className="inline-flex w-fit items-center p-1 gap-1 shadow-sm" style={{ background: '#F9FAFB', borderRadius: 10 }}>
            {['1', '2'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => !lockSemester && onSemesterChange?.(s)}
                disabled={lockSemester}
                className="px-4 py-1.5 text-xs font-bold transition-all disabled:opacity-60"
                style={semester === s ? { background: '#800000', color: 'white', borderRadius: 10 } : { background: 'transparent', color: '#2B3235', borderRadius: 10 }}
              >
                Semester {s}
              </button>
            ))}
          </div>
          {/* Week navigation - only show for exam schedule */}
          {scheduleTab === 'exam' && onPrevWeek && onNextWeek && (
            <>
              <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 flex items-center gap-1 disabled:opacity-40" onClick={onPrevWeek} disabled={!canPrevWeek}>
                <ChevronLeft size={12} /> Previous Week
              </button>
              <span className="text-xs font-semibold text-gray-400">{weekLabel}</span>
              <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 hover:bg-gray-50 flex items-center gap-1 disabled:opacity-40" style={{ color: '#7A0808' }} onClick={onNextWeek} disabled={!canNextWeek}>
                Next Week <ChevronRight size={12} />
              </button>
            </>
          )}
        </div>
      )}

      {semesterRangeLabel && (
        <p className="text-xs font-semibold mb-2" style={{ color: '#2B3235', opacity: 0.75 }}>
          {semesterRangeLabel}
          {scheduleTab === 'exam' ? ' · Exam schedule mode' : ' · Regular schedule mode'}
        </p>
      )}

      {canPlot && (
        <p className="text-[11px] font-semibold mb-3" style={{ color: '#7A0808', opacity: 0.85 }}>
          Click a time slot or drag across slots on a day to set start and end time, then fill in the schedule details.
        </p>
      )}

      {showLegend && (
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap bg-gray-50/60 p-3 rounded-xl border border-gray-100">
          {/* Interactive Legend Items */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Legend:</span>
            {[
              { type: 'Lecture', label: 'Lecture' },
              { type: 'Laboratory', label: 'Laboratory' },
            ].map(({ type, label }) => {
              const colors = SCHEDULE_TYPE_COLORS[type];
              const isSelected = typeFilter === type;

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter((prev) => (prev === type ? 'All' : type))}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                    isSelected ? 'ring-2 ring-offset-1 ring-[#800000] shadow-2xs' : 'hover:opacity-90'
                  }`}
                  style={{
                    background: colors?.bg || '#EFF6FF',
                    borderColor: colors?.border || '#BFDBFE',
                    color: colors?.text || '#1E40AF',
                  }}
                >
                  <div className="w-2.5 h-2.5 rounded-xs flex-shrink-0" style={{ background: colors?.text || '#1E40AF' }} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Schedule Type Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600">Filter Schedule:</span>
            <select
              className="form-input text-xs py-1.5 px-3 rounded-xl border-gray-200 bg-white font-medium cursor-pointer"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="All">All Types ({blocks.length})</option>
              <option value="Lecture">Lecture ({blocks.filter((b) => b.type === 'Lecture').length})</option>
              <option value="Laboratory">Laboratory ({blocks.filter((b) => b.type === 'Laboratory').length})</option>
            </select>
          </div>
        </div>
      )}

      <div className="overflow-x-auto select-none">
        <div style={{ minWidth: 700 }}>
          <div className="grid sticky top-0 bg-white z-10" style={{ gridTemplateColumns: '70px repeat(7, 1fr)' }}>
            <div className="py-2 text-[10px] font-bold text-gray-400 uppercase">Time</div>
            {SCHEDULE_DAYS.map((day, i) => {
              const status = dayStatuses[i];
              const disabled = status?.disabled;
              return (
                <div key={day} className="py-2 text-center">
                  <p className="text-[10px] font-bold uppercase text-gray-400">{day}</p>
                  {showDayDates && (
                    <p className="text-sm font-black" style={{ color: disabled ? '#9CA3AF' : '#2B3235' }}>{dayDates[i]}</p>
                  )}
                  {disabled && status?.reason && (
                    <p className="text-[8px] font-bold leading-tight mt-0.5 px-1 text-red-700">{status.reason}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="relative" style={{ height: gridHeight }}>
            {Array.from({ length: SCHEDULE_SLOT_COUNT }, (_, slotIndex) => {
              const hour = slotIndexToHour(slotIndex);
              const hInt = Math.floor(hour);
              const isHalf = hour % 1 !== 0;
              const minutes = isHalf ? 30 : 0;
              const ampm = hInt >= 12 ? 'PM' : 'AM';
              const displayH = hInt % 12 || 12;
              const label = `${displayH.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
              return (
                <div
                  key={slotIndex}
                  className="grid absolute left-0 right-0"
                  style={{ gridTemplateColumns: '70px repeat(7, 1fr)', height: SCHEDULE_CELL_HEIGHT, top: slotIndex * SCHEDULE_CELL_HEIGHT }}
                >
                  <div className="border-t border-gray-100 pr-2 flex items-start pt-1 bg-white z-[1]">
                    <span className="text-[10px] text-gray-400 font-medium">{label}</span>
                  </div>
                  {SCHEDULE_DAYS.map((_, dayIndex) => {
                    const disabled = dayStatuses[dayIndex]?.disabled;
                    const selected = isSlotSelected(dayIndex, slotIndex);
                    return (
                      <div
                        key={dayIndex}
                        className="border-t border-l border-gray-100"
                        style={{
                          height: SCHEDULE_CELL_HEIGHT,
                          background: disabled ? '#F3F4F6' : selected ? '#FEE2E2' : 'transparent',
                          cursor: canPlot && !disabled ? 'crosshair' : 'default',
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSlotMouseDown(dayIndex, slotIndex, disabled, dayStatuses[dayIndex]?.date);
                        }}
                        onMouseEnter={() => handleSlotMouseEnter(dayIndex, slotIndex, disabled)}
                        role="presentation"
                      />
                    );
                  })}
                </div>
              );
            })}

            <div
              className="absolute top-0 grid pointer-events-none"
              style={{ left: 70, right: 0, height: gridHeight, gridTemplateColumns: 'repeat(7, 1fr)' }}
            >
              {blocksByDay.map((dayBlocks, dayIndex) => (
                <div key={dayIndex} className="relative h-full" style={{ minHeight: gridHeight }}>
                  {dayBlocks.map((sched) => {
                    const colors = SCHEDULE_TYPE_COLORS[sched.type] ||
                      (sched.type?.startsWith('Reservation') ? SCHEDULE_TYPE_COLORS.Reservation : null) ||
                      SCHEDULE_TYPE_COLORS.Lecture;
                    const topPx = blockTopPx(sched.start);
                    const heightPx = blockHeightPx(sched.start, sched.end);
                    return (
                      <div
                        key={sched.id}
                        className="absolute left-1 right-1 pointer-events-auto overflow-hidden"
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          top: topPx,
                          height: heightPx,
                          maxHeight: gridHeight - topPx,
                          background: colors.bg,
                          border: `1.5px solid ${colors.border}`,
                          boxSizing: 'border-box',
                          padding: '8px',
                          borderRadius: '8px',
                        }}
                      >
                        <p className="text-[10px] font-black truncate" style={{ color: colors.text }}>{sched.title}</p>
                        <p className="text-[9px] font-semibold truncate" style={{ color: colors.text }}>
                          {sched.course}{sched.instructor ? ` · ${sched.instructor}` : ''}
                        </p>
                        {sched.roomCode && <p className="text-[9px] truncate" style={{ color: colors.text }}>{sched.roomCode}</p>}
                        <p className="text-[9px]" style={{ color: colors.text }}>
                          {formatScheduleHour(sched.start)} - {formatScheduleHour(sched.end)}
                        </p>
                        {!readOnly && (onEditBlock || onDeleteBlock) && (
                          <div className="flex gap-1 mt-1 pointer-events-auto">
                            {onEditBlock && (
                              <button 
                                type="button" 
                                className="p-0.5 rounded hover:bg-white/50" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  onEditBlock(sched);
                                }}
                              >
                                <Edit2 size={9} style={{ color: colors.text }} />
                              </button>
                            )}
                            {onDeleteBlock && (
                              <button 
                                type="button" 
                                className="p-0.5 rounded hover:bg-white/50" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  onDeleteBlock(sched);
                                }}
                              >
                                <Trash2 size={9} style={{ color: colors.text }} />
                              </button>
                            )}
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

      {!blocks.length && emptyMessage && (
        <p className="text-xs font-semibold text-center mt-4 py-3" style={{ color: '#2B3235', opacity: 0.55 }}>
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
