import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Edit2, Plus, Trash2, Eye } from 'lucide-react';
import {
  SCHEDULE_TYPE_COLORS,
  SCHEDULE_DAYS,
  SCHEDULE_CELL_HEIGHT,
  SCHEDULE_START_HOUR,
  SCHEDULE_END_HOUR,
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
  semesterOptions = null,
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
  hideSectionNameInBlocks = false,
  addScheduleDisabledReason = 'Scheduling access is currently unavailable.',
  courseChecklist = [],
  showDayDates = true, // New prop to control date display
  stickyHeaderOffset = 76,
  onAddBlock,
  onSlotSelect,
  onEditBlock,
  onDeleteBlock,
  onBlockClick,
  emptyMessage,
}) {
  const activeSemesterOptions = useMemo(() => {
    if (Array.isArray(semesterOptions) && semesterOptions.length > 0) {
      return semesterOptions.map((opt) =>
        typeof opt === 'string' ? { value: opt, label: `Semester ${opt}` } : opt
      );
    }
    return [
      { value: '1', label: 'Semester 1' },
      { value: '2', label: 'Semester 2' },
    ];
  }, [semesterOptions]);

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
    const endHour = slotIndexToHour(maxSlot);
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
    const hasDisabledDays = dayStatuses.some((d) => d?.disabled);
    const baseItems = roomType
      ? [
          { type: 'Scheduling', label: `Scheduling (${roomType})`, colors: roomType.toLowerCase().includes('lab') ? SCHEDULE_TYPE_COLORS.Laboratory : SCHEDULE_TYPE_COLORS.Lecture },
          { type: 'Reservation', label: 'Reservation', colors: SCHEDULE_TYPE_COLORS.Reservation },
          { type: 'Maintenance', label: 'Maintenance', colors: SCHEDULE_TYPE_COLORS.Maintenance },
        ]
      : [
          { type: 'Lecture', label: 'Lecture', colors: SCHEDULE_TYPE_COLORS.Lecture },
          { type: 'Laboratory', label: 'Laboratory', colors: SCHEDULE_TYPE_COLORS.Laboratory },
        ];

    if (hasDisabledDays) {
      baseItems.push({
        type: 'NoClass',
        label: 'Holiday / No Class',
        colors: { bg: '#FEF2F2', border: '#FCA5A5', text: '#991B1B' },
      });
    }

    return baseItems;
  }, [roomType, dayStatuses]);

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

  const blocksByDay = Array.from({ length: 7 }, (_, day) => filteredBlocks.filter((block) => block.day === day));

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
      <div className="mb-4 space-y-3 print:hidden">
        <div>
          <h3 className="font-bold text-base" style={{ color: '#2B3235' }}>{title}</h3>
        </div>
        <div className="grid w-full items-start gap-x-4 gap-y-3 print:hidden md:grid-cols-[auto_minmax(0,1fr)]">
          <p className="flex items-center gap-1.5 text-xs font-bold text-[#7A0808] md:col-start-1 md:row-start-1 md:self-center">
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
          {showControls && (
            <div className="inline-flex w-fit max-w-full items-center gap-1 rounded-2xl border border-gray-200 bg-white p-1 shadow-2xs md:col-start-1 md:row-start-2">
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

          {scheduleTab === 'regular' && courseChecklist.length > 0 && (
            <div className="min-w-0 w-full rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2 md:col-start-2 md:row-span-2 md:row-start-1">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-700">Course checklist</span>
                <span className="text-[9px] font-bold text-gray-500">
                  {courseChecklist.filter((course) => course.status === 'complete').length}/{courseChecklist.length} plotted
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
                {courseChecklist.map((course, courseIndex) => (
                  <div
                    key={`${course.code}-${courseIndex}`}
                    className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold ${
                      course.status === 'complete'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : course.status === 'partial'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-red-200 bg-white text-[#7A0808]'
                    }`}
                    title={`${course.code} — ${course.title}: ${course.status === 'complete' ? 'Fully plotted' : course.status === 'partial' ? 'Partially plotted' : 'Not yet plotted'}`}
                  >
                    <span aria-hidden="true">{course.status === 'complete' ? '✓' : course.status === 'partial' ? '◐' : '○'}</span>
                    <span className="truncate">{course.code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showControls && (
        <div className="flex items-center gap-3 mb-3 flex-wrap print:hidden">
          {schoolYearOptions.length > 0 && onSchoolYearChange ? (
            <div className="w-44">
              <CustomSelect
                size="sm"
                value={schoolYearLabel}
                onChange={(e) => onSchoolYearChange(e.target.value)}
                options={schoolYearOptions}
                placeholder="School Year"
                disabled
              />
            </div>
          ) : (
            <span className="text-xs font-bold px-3 py-2 rounded-lg border border-gray-200" style={{ color: '#2B3235' }}>{schoolYearLabel}</span>
          )}
          <div className="inline-flex w-fit items-center p-1 gap-1 shadow-sm flex-wrap" style={{ background: '#F9FAFB', borderRadius: 10 }}>
            {activeSemesterOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => !lockSemester && onSemesterChange?.(opt.value)}
                disabled={lockSemester}
                className="px-4 py-1.5 text-xs font-bold transition-all disabled:opacity-60"
                style={semester === opt.value ? { background: '#7A0808', color: 'white', borderRadius: 10 } : { background: 'transparent', color: '#2B3235', borderRadius: 10 }}
              >
                {opt.label}
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
          {onAddBlock && (
            <div className="group/add-schedule relative ml-auto shrink-0">
              <button
                type="button"
                className={`whitespace-nowrap text-xs gap-1.5 py-2 px-4 shadow-sm font-bold flex items-center ${
                  canPlot ? 'btn-maroon cursor-pointer' : 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                }`}
                onClick={onAddBlock}
                disabled={!canPlot}
                aria-describedby={!canPlot ? 'add-schedule-disabled-reason' : undefined}
              >
                <Plus size={14} /> Add schedule
              </button>
              {!canPlot && (
                <div
                  id="add-schedule-disabled-reason"
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-64 rounded-xl border border-red-200 bg-white px-3 py-2 text-left text-[10px] font-semibold leading-relaxed text-gray-700 shadow-xl group-hover/add-schedule:block group-focus-within/add-schedule:block"
                >
                  <span className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-red-200 bg-white" />
                  <span className="relative block font-black text-[#7A0808]">Add Schedule is unavailable</span>
                  <span className="relative mt-0.5 block">{addScheduleDisabledReason}</span>
                </div>
              )}
            </div>
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

      <div className={`w-full rounded-xl border border-gray-300 ${drag?.active ? 'select-none' : ''}`}>
        <div className="w-full">
          {/* Header Row */}
          <div
            className="grid sticky bg-gray-50 z-10 border-b-2 border-gray-400 print:bg-[#7A0808] print:text-white print:border print:border-black"
            style={{
              gridTemplateColumns: '92px repeat(7, minmax(94px, 1fr))',
              top: typeof stickyHeaderOffset === 'number' ? `${stickyHeaderOffset}px` : stickyHeaderOffset,
            }}
          >
            <div className="py-2 text-[10px] font-black text-gray-700 uppercase text-center border-r border-gray-400 print:bg-[#7A0808] print:text-white print:font-extrabold print:text-xs print:border-r print:border-black flex items-center justify-center">
              TIME
            </div>
            {SCHEDULE_DAYS.map((day, i) => {
              const status = dayStatuses[i];
              const disabled = status?.disabled;
              const shortDay = day.substring(0, 3).toUpperCase();
              return (
                <div
                  key={day}
                  className={`py-2 text-center border-r border-gray-300 print:bg-[#7A0808] print:text-white print:border-r print:border-black flex flex-col justify-center transition-all ${
                    disabled ? 'bg-red-50/70 border-b-2 border-red-300' : ''
                  }`}
                >
                  <p className="text-[11px] font-black uppercase text-gray-700 print:text-white print:font-extrabold print:text-xs">
                    <span className="print:hidden">{day}</span>
                    <span className="hidden print:inline">{shortDay}</span>
                  </p>
                  {showDayDates && (
                    <p className="text-sm font-black print:hidden" style={{ color: disabled ? '#B91C1C' : '#2B3235' }}>
                      {dayDates[i]}
                    </p>
                  )}
                  {disabled && (
                    <div className="print:hidden px-1 mt-0.5">
                      <span className="text-[8px] font-black uppercase tracking-wider text-red-700 bg-red-100/90 border border-red-200 px-1 py-0.5 rounded leading-none inline-block">
                        {status?.badge || 'NO CLASS'}
                      </span>
                      {status?.reason && (
                        <p className="text-[8px] font-bold leading-tight mt-0.5 text-red-800 line-clamp-1" title={status.reason}>
                          {status.reason}
                        </p>
                      )}
                    </div>
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
                    gridTemplateColumns: '92px repeat(7, minmax(94px, 1fr))',
                    height: `var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px)`,
                    top: `calc(${slotIndex} * var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px))`
                  }}
                >
                  <div className="border-t border-r border-gray-300 px-1 flex items-center justify-center bg-white z-[1] print:border-r print:border-l print:border-black">
                    <span className="text-[9px] text-gray-700 font-bold print:hidden select-none whitespace-nowrap">
                      {intervalLabel}
                    </span>
                    <span className="hidden print:inline text-[9px] font-bold text-gray-900">{intervalLabel}</span>
                  </div>
                  {SCHEDULE_DAYS.map((_, dayIndex) => {
                    const disabled = dayStatuses[dayIndex]?.disabled;
                    const selected = isSlotSelected(dayIndex, slotIndex);
                    return (
                      <div
                        key={dayIndex}
                        className="border-t border-r border-gray-300 print:border-r print:border-black"
                        style={{
                          height: `var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px)`,
                          background: disabled
                            ? 'repeating-linear-gradient(45deg, #FEF2F2, #FEF2F2 10px, #FFF5F5 10px, #FFF5F5 20px)'
                            : selected
                            ? '#FEE2E2'
                            : 'transparent',
                          cursor: canPlot && !disabled ? 'crosshair' : disabled ? 'not-allowed' : 'default',
                        }}
                        onMouseDown={(e) => {
                          if (canPlot && !disabled) {
                            e.preventDefault();
                            handleSlotMouseDown(dayIndex, slotIndex, disabled, dayStatuses[dayIndex]?.date);
                          }
                        }}
                        onMouseEnter={() => handleSlotMouseEnter(dayIndex, slotIndex, disabled)}
                        role="presentation"
                      />
                    );
                  })}
                </div>
              );
            })}

            {/* Bottom border line */}
            <div
              className="grid absolute left-0 right-0 pointer-events-none"
              style={{
                gridTemplateColumns: '92px repeat(7, minmax(94px, 1fr))',
                top: `calc(${SCHEDULE_SLOT_COUNT} * var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px))`
              }}
            >
              <div className="border-t border-gray-100" />
              {SCHEDULE_DAYS.map((_, dayIndex) => (
                <div key={dayIndex} className="border-t border-gray-100" />
              ))}
            </div>

            <div
              className="absolute top-0 grid pointer-events-none"
              style={{ left: 92, right: 0, height: `calc(${SCHEDULE_SLOT_COUNT} * var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px))`, gridTemplateColumns: 'repeat(7, minmax(94px, 1fr))' }}
            >
              {blocksByDay.map((dayBlocks, dayIndex) => {
                const dayStatus = dayStatuses[dayIndex];
                const isDisabledDay = Boolean(dayStatus?.disabled);

                return (
                  <div key={dayIndex} className="relative h-full" style={{ minHeight: `calc(${SCHEDULE_SLOT_COUNT} * var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px))` }}>
                    {/* Blocked Day Vertical Bar Overlay */}
                    {isDisabledDay && (
                      <div
                        className="absolute inset-x-0.5 top-1 bottom-1 z-[6] pointer-events-auto flex flex-col items-center justify-start pt-6 pb-4 px-1.5 text-center rounded-xl border border-red-200/80 select-none shadow-2xs"
                        style={{
                          background: 'rgba(254, 242, 242, 0.65)',
                          backdropFilter: 'blur(0.5px)',
                        }}
                      >
                        <div className="bg-white/95 border border-red-200 shadow-xs px-2.5 py-2.5 rounded-xl text-center w-full max-w-[96%] animate-in fade-in duration-200">
                          <span className="text-[9px] font-black uppercase tracking-wider text-red-700 bg-red-100/90 border border-red-200 px-2 py-0.5 rounded-md inline-block mb-1">
                            {dayStatus?.badge || 'NO CLASS'}
                          </span>
                          <p className="text-xs font-black text-gray-900 leading-snug">
                            {dayStatus?.reason || 'Official School Non-Working Holiday'}
                          </p>
                          {dayStatus?.description && (
                            <p className="text-[10px] text-gray-500 font-medium mt-1 leading-snug">
                              {dayStatus.description}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {dayBlocks.map((sched) => {
                      const isLabRoom = roomType ? roomType.toLowerCase().includes('lab') : false;
                      const colors = SCHEDULE_TYPE_COLORS[sched.type] ||
                        (sched.isCourseSchedule ? (isLabRoom ? SCHEDULE_TYPE_COLORS.Laboratory : SCHEDULE_TYPE_COLORS.Lecture) : null) ||
                        (sched.isReservation || sched.type?.startsWith?.('Reservation') ? SCHEDULE_TYPE_COLORS.Reservation : null) ||
                        (sched.isMaintenance || sched.type === 'Maintenance' ? SCHEDULE_TYPE_COLORS.Maintenance : null) ||
                        SCHEDULE_TYPE_COLORS.Lecture;
                      const slotsFromStart = (sched.start - SCHEDULE_START_HOUR) * 2;
                      const durationSlots = Math.max(1, Math.round((sched.end - sched.start) * 2));
                      const topCalc = `calc(${slotsFromStart} * var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px))`;
                      const heightCalc = `calc(${durationSlots} * var(--cell-height, ${SCHEDULE_CELL_HEIGHT}px))`;
                      const isNonCourse = sched.isReservation || sched.isMaintenance;
                      return (
                        <div
                          key={sched.id}
                          className={`absolute inset-x-0 pointer-events-auto overflow-hidden print:p-0.5 print:border print:border-black flex flex-col justify-center cursor-pointer hover:z-20 hover:shadow-md hover:brightness-95 transition-all group ${
                            isNonCourse ? 'print:hidden' : ''
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onBlockClick?.(sched);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          title={`${sched.title || sched.course || 'Schedule'} | ${formatScheduleHour(sched.start)}–${formatScheduleHour(sched.end)} | ${sched.roomCode || 'No room assigned'} | Click to view details`}
                          style={{
                            top: topCalc,
                            height: heightCalc,
                            background: colors.bg,
                            border: `1.5px solid ${colors.border}`,
                            boxSizing: 'border-box',
                            padding: '5px',
                            borderRadius: '3px',
                          }}
                        >
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <p className="text-[10px] font-black truncate print:text-[8px] print:leading-tight" style={{ color: colors.text }}>{sched.title}</p>
                            {sched.approvalStatus === 'pending' && (
                              <span className="shrink-0 rounded border border-amber-400 bg-amber-100 px-1 text-[7px] font-black uppercase text-amber-900">
                                Pending
                              </span>
                            )}
                            {sched.rotationCycle === 'week_a' && (
                              <span className="text-[8px] font-black uppercase px-1 py-0.2 rounded bg-blue-100 text-blue-900 border border-blue-300 shrink-0">
                                Week A
                              </span>
                            )}
                            {sched.rotationCycle === 'week_b' && (
                              <span className="text-[8px] font-black uppercase px-1 py-0.2 rounded bg-purple-100 text-purple-900 border border-purple-300 shrink-0">
                                Week B
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] font-semibold truncate print:text-[7px] print:leading-tight" style={{ color: colors.text }}>
                            {sched.course}{sched.instructor ? ` · ${sched.instructor}` : ''}
                          </p>
                          {!hideSectionNameInBlocks && (sched.section || sched.sectionName || sched.program) && (
                            <p className="text-[9px] font-bold truncate opacity-90 print:text-[7px] print:leading-tight flex items-center gap-1" style={{ color: colors.text }}>
                              <span>Sec: {sched.section || sched.sectionName || sched.program}</span>
                              {sched.isCombinedSection && (
                                <span className="text-[8px] font-black uppercase px-1 rounded bg-purple-100 text-purple-800 border border-purple-300">
                                  Merged
                                </span>
                              )}
                            </p>
                          )}
                          {sched.roomCode && <p className="text-[9px] truncate print:text-[7px] print:leading-tight" style={{ color: colors.text }}>{sched.roomCode}</p>}
                          <p className="text-[9px] print:text-[7px] print:leading-tight" style={{ color: colors.text }}>
                            {formatScheduleHour(sched.start)} - {formatScheduleHour(sched.end)}
                          </p>
                          <div className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-md bg-white/90 px-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-auto">
                            {onBlockClick && (
                              <button
                                type="button"
                                className="p-0.5 rounded hover:bg-white/60 transition-colors"
                                title="View details"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  onBlockClick(sched);
                                }}
                              >
                                <Eye size={10} style={{ color: colors.text }} />
                              </button>
                            )}
                            {!readOnly && (onEditBlock || onDeleteBlock) && (
                              <>
                                {onEditBlock && (
                                  <button 
                                    type="button" 
                                    className="p-0.5 rounded hover:bg-white/60 transition-colors" 
                                    title="Edit schedule"
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
                                    className="p-0.5 rounded hover:bg-white/60 transition-colors" 
                                    title="Delete schedule"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      onDeleteBlock(sched);
                                    }}
                                  >
                                    <Trash2 size={9} style={{ color: colors.text }} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
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
