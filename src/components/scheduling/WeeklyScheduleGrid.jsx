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
import CustomSelect from '../ui/CustomSelect';

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
  roomType = null,
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
    const endHour = slotIndexToHour(maxSlot) + 0.5;
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

  const legendItems = React.useMemo(() => {
    if (roomType) {
      const isLab = roomType.toLowerCase().includes('lab');
      const schedulingColors = isLab ? SCHEDULE_TYPE_COLORS.Laboratory : SCHEDULE_TYPE_COLORS.Lecture;
      return [
        { type: 'Scheduling', label: `Scheduling (${roomType})`, colors: schedulingColors },
        { type: 'Reservation', label: 'Reservation', colors: SCHEDULE_TYPE_COLORS.Reservation },
        { type: 'Maintenance', label: 'Maintenance', colors: SCHEDULE_TYPE_COLORS.Maintenance },
      ];
    }
    return [
      { type: 'Lecture', label: 'Lecture', colors: SCHEDULE_TYPE_COLORS.Lecture },
      { type: 'Laboratory', label: 'Laboratory', colors: SCHEDULE_TYPE_COLORS.Laboratory },
    ];
  }, [roomType]);

  const dropdownOptions = React.useMemo(() => {
    if (roomType) {
      const schedCount = blocks.filter(
        (b) => b.isCourseSchedule || (!b.isReservation && !b.isMaintenance && b.type !== 'Maintenance' && !b.type?.startsWith?.('Reservation'))
      ).length;
      const resCount = blocks.filter(
        (b) => b.isReservation || b.type === 'Reservation' || b.type?.startsWith?.('Reservation')
      ).length;
      const maintCount = blocks.filter(
        (b) => b.isMaintenance || b.type === 'Maintenance'
      ).length;

      return [
        { value: 'All', label: `All Types (${blocks.length})` },
        { value: 'Scheduling', label: `Scheduling (${roomType}) (${schedCount})` },
        { value: 'Reservation', label: `Reservation (${resCount})` },
        { value: 'Maintenance', label: `Maintenance (${maintCount})` },
      ];
    }
    return [
      { value: 'All', label: `All Types (${blocks.length})` },
      { value: 'Lecture', label: `Lecture (${blocks.filter((b) => b.type === 'Lecture').length})` },
      { value: 'Laboratory', label: `Laboratory (${blocks.filter((b) => b.type === 'Laboratory').length})` },
    ];
  }, [roomType, blocks]);

  const filteredBlocks = React.useMemo(() => {
    if (!typeFilter || typeFilter === 'All') return blocks;
    return blocks.filter((b) => {
      if (typeFilter === 'Scheduling') {
        return b.isCourseSchedule || (!b.isReservation && !b.isMaintenance && b.type !== 'Maintenance' && !b.type?.startsWith?.('Reservation'));
      }
      if (typeFilter === 'Reservation') {
        return b.isReservation || b.type === 'Reservation' || b.type?.startsWith?.('Reservation');
      }
      if (typeFilter === 'Maintenance') {
        return b.isMaintenance || b.type === 'Maintenance';
      }
      return b.type === typeFilter;
    });
  }, [blocks, typeFilter]);

  const blocksByDay = Array.from({ length: 7 }, (_, day) => filteredBlocks.filter((b) => b.day === day));

  const formatPrintInterval = (slotIdx) => {
    const startH = slotIndexToHour(slotIdx);
    const endH = startH + 0.5;
    const formatTimeStr = (h) => {
      const hours = Math.floor(h);
      const mins = h % 1 !== 0 ? '30' : '00';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${mins}`;
    };
    return `${formatTimeStr(startH)}-${formatTimeStr(endH)}`;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 print:p-0 print:border-none print:shadow-none print:bg-transparent print-schedule-container">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3 print:hidden">
        <div>
          <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>{title}</h3>
          <p className="text-xs font-bold text-[#7A0808] mt-2 flex items-center gap-1.5 print:hidden">
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
        <div className="flex items-center gap-3 flex-wrap print:hidden">
          {showControls && (
            <div className="inline-flex w-fit items-center p-1 gap-1 bg-white rounded-2xl border border-gray-200 shadow-2xs">
              <button
                type="button"
                onClick={() => onScheduleTabChange?.('regular')}
                className={`px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-all rounded-xl cursor-pointer ${
                  scheduleTab === 'regular'
                    ? 'bg-[#7A0808] text-white shadow-2xs'
                    : 'bg-transparent text-[#2B3235] hover:bg-gray-100/70'
                }`}
              >
                <Calendar size={13} /> Regular Schedule
              </button>
              <button
                type="button"
                onClick={() => onScheduleTabChange?.('exam')}
                className={`px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-all rounded-xl cursor-pointer ${
                  scheduleTab === 'exam'
                    ? 'bg-[#7A0808] text-white shadow-2xs'
                    : 'bg-transparent text-[#2B3235] hover:bg-gray-100/70'
                }`}
              >
                <Calendar size={13} /> Exam Schedule
              </button>
            </div>
          )}

          {canPlot && onAddBlock && (
            <button
              type="button"
              className="btn-maroon text-xs gap-1.5 py-2 px-4 shadow-sm font-bold flex items-center cursor-pointer ml-auto"
              onClick={onAddBlock}
            >
              <Plus size={14} /> Add schedule
            </button>
          )}
        </div>
      </div>

      {showControls && (
        <div className="flex items-center gap-3 mb-3 flex-wrap print:hidden">
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
                style={semester === s ? { background: '#7A0808', color: 'white', borderRadius: 10 } : { background: 'transparent', color: '#2B3235', borderRadius: 10 }}
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
        <p className="text-xs font-semibold mb-2 print:hidden" style={{ color: '#2B3235', opacity: 0.75 }}>
          {semesterRangeLabel}
          {scheduleTab === 'exam' ? ' · Exam schedule mode' : ' · Regular schedule mode'}
        </p>
      )}

      {canPlot && (
        <p className="text-[11px] font-semibold mb-3 print:hidden" style={{ color: '#7A0808', opacity: 0.85 }}>
          Click a time slot or drag across slots on a day to set start and end time, then fill in the schedule details.
        </p>
      )}

      {showLegend && (
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap bg-gray-50/60 p-3 rounded-xl border border-gray-100 print:hidden">
          {/* Interactive Legend Items */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Legend:</span>
            {legendItems.map(({ type, label, colors: itemColors }) => {
              const colors = itemColors || SCHEDULE_TYPE_COLORS[type] || SCHEDULE_TYPE_COLORS.Lecture;
              const isSelected = typeFilter === type;

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter((prev) => (prev === type ? 'All' : type))}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                    isSelected ? 'ring-2 ring-offset-1 ring-[#7A0808] shadow-2xs' : 'hover:opacity-90'
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
            <div className="min-w-[170px]">
              <CustomSelect
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                options={dropdownOptions}
              />
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto select-none">
        <div style={{ minWidth: 700 }}>
          {/* Header Row */}
          <div
            className="grid sticky top-0 bg-white z-10 print:bg-[#7A0808] print:text-white print:border print:border-black"
            style={{ gridTemplateColumns: '85px repeat(7, 1fr)' }}
          >
            <div className="py-2 text-[10px] font-bold text-gray-400 uppercase text-center print:bg-[#7A0808] print:text-white print:font-extrabold print:text-xs print:border-r print:border-black flex items-center justify-center">
              TIME
            </div>
            {SCHEDULE_DAYS.map((day, i) => {
              const status = dayStatuses[i];
              const disabled = status?.disabled;
              const shortDay = day.substring(0, 3).toUpperCase();
              return (
                <div key={day} className="py-2 text-center print:bg-[#7A0808] print:text-white print:border-r print:border-black flex flex-col justify-center">
                  <p className="text-[10px] font-bold uppercase text-gray-400 print:text-white print:font-extrabold print:text-xs">
                    <span className="print:hidden">{day}</span>
                    <span className="hidden print:inline">{shortDay}</span>
                  </p>
                  {showDayDates && (
                    <p className="text-sm font-black print:hidden" style={{ color: disabled ? '#9CA3AF' : '#2B3235' }}>{dayDates[i]}</p>
                  )}
                  {disabled && status?.reason && (
                    <p className="text-[8px] font-bold leading-tight mt-0.5 px-1 text-red-700 print:hidden">{status.reason}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="relative" style={{ height: `calc(${SCHEDULE_SLOT_COUNT} * var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px))` }}>
            {Array.from({ length: SCHEDULE_SLOT_COUNT }, (_, slotIndex) => {
              const hour = slotIndexToHour(slotIndex);
              const hInt = Math.floor(hour);
              const isHalf = hour % 1 !== 0;
              const minutes = isHalf ? 30 : 0;
              const ampm = hInt >= 12 ? 'PM' : 'AM';
              const displayH = hInt % 12 || 12;
              const label = `${displayH.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
              const intervalLabel = formatPrintInterval(slotIndex);

              return (
                <div
                  key={slotIndex}
                  className="grid absolute left-0 right-0 print:border-b print:border-black"
                  style={{
                    gridTemplateColumns: '85px repeat(7, 1fr)',
                    height: 'var(--cell-height, 48px)',
                    top: `calc(${slotIndex} * var(--cell-height, 48px))`
                  }}
                >
                  <div className="border-t border-gray-100 pr-2 flex items-start pt-1 bg-white z-[1] print:border-r print:border-l print:border-black print:items-center print:justify-center print:pt-0">
                    <span className="text-[10px] text-gray-400 font-medium print:hidden">{label}</span>
                    <span className="hidden print:inline text-[9px] font-bold text-gray-900">{intervalLabel}</span>
                  </div>
                  {SCHEDULE_DAYS.map((_, dayIndex) => {
                    const disabled = dayStatuses[dayIndex]?.disabled;
                    const selected = isSlotSelected(dayIndex, slotIndex);
                    return (
                      <div
                        key={dayIndex}
                        className="border-t border-l border-gray-100 print:border-r print:border-black"
                        style={{
                          height: 'var(--cell-height, 48px)',
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
              style={{ left: 85, right: 0, height: `calc(${SCHEDULE_SLOT_COUNT} * var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px))`, gridTemplateColumns: 'repeat(7, 1fr)' }}
            >
              {blocksByDay.map((dayBlocks, dayIndex) => (
                <div key={dayIndex} className="relative h-full" style={{ minHeight: `calc(${SCHEDULE_SLOT_COUNT} * var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px))` }}>
                  {dayBlocks.map((sched) => {
                    const isLabRoom = roomType ? roomType.toLowerCase().includes('lab') : false;
                    const colors = SCHEDULE_TYPE_COLORS[sched.type] ||
                      (sched.isCourseSchedule ? (isLabRoom ? SCHEDULE_TYPE_COLORS.Laboratory : SCHEDULE_TYPE_COLORS.Lecture) : null) ||
                      (sched.isReservation || sched.type?.startsWith?.('Reservation') ? SCHEDULE_TYPE_COLORS.Reservation : null) ||
                      (sched.isMaintenance || sched.type === 'Maintenance' ? SCHEDULE_TYPE_COLORS.Maintenance : null) ||
                      SCHEDULE_TYPE_COLORS.Lecture;
                    const slotsFromStart = (sched.start - SCHEDULE_START_HOUR) * 2;
                    const durationSlots = (sched.end - sched.start) * 2;
                    const topCalc = `calc(${slotsFromStart} * var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px))`;
                    const heightCalc = `calc(${durationSlots} * var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px))`;

                    return (
                      <div
                        key={sched.id}
                        className="absolute left-1 right-1 pointer-events-auto overflow-hidden print:p-0.5 print:border print:border-black flex flex-col justify-center"
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          top: topCalc,
                          height: heightCalc,
                          background: colors.bg,
                          border: `1.5px solid ${colors.border}`,
                          boxSizing: 'border-box',
                          padding: '8px',
                          borderRadius: '8px',
                        }}
                      >
                        <p className="text-[10px] font-black truncate print:text-[8px] print:leading-tight" style={{ color: colors.text }}>{sched.title}</p>
                        <p className="text-[9px] font-semibold truncate print:text-[7px] print:leading-tight" style={{ color: colors.text }}>
                          {sched.course}{sched.instructor ? ` · ${sched.instructor}` : ''}
                        </p>
                        {(sched.section || sched.sectionName || sched.program) && (
                          <p className="text-[9px] font-bold truncate opacity-90 print:text-[7px] print:leading-tight" style={{ color: colors.text }}>
                            Sec: {sched.section || sched.sectionName || sched.program}
                          </p>
                        )}
                        {sched.roomCode && <p className="text-[9px] truncate print:text-[7px] print:leading-tight" style={{ color: colors.text }}>{sched.roomCode}</p>}
                        <p className="text-[9px] print:text-[7px] print:leading-tight" style={{ color: colors.text }}>
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
