import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Send, Trash2, Users, MapPin, Clock } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { useAcademicCalendar } from '../hooks/useAcademicCalendar';
import WeeklyScheduleGrid from '../components/scheduling/WeeklyScheduleGrid';
import CreatePlotScheduleModal from '../components/modals/CreatePlotScheduleModal';
import AddPlotEntryModal from '../components/modals/AddPlotEntryModal';
import { addDays } from '../constants/scheduleGrid';
import {
  formatDisplayDate,
  getSemesterBounds,
  getInitialWeekStart,
  getWeekDates,
  getPlotDayStatus,
  parseDateOnly,
} from '../utils/academicCalendarUtils';
import {
  subscribePlotRequests,
  subscribePlotRequestsForUser,
  subscribePlotEntries,
  deletePlotRequest,
  addPlotEntry,
  updatePlotEntry,
  deletePlotEntry,
  completePlotTurn,
  entriesToGridBlocks,
  hourToTimeInput,
} from '../services/plotScheduleService';
import { RECIPIENT_PLOT_STATUS } from '../constants/plotScheduling';
import { SCHEDULE_DAYS } from '../constants/scheduleGrid';

function statusBadgeClass(status) {
  if (status === 'completed') return 'badge-approved';
  if (status === 'sent' || status === 'in_progress') return 'badge-pending';
  return 'badge-pending';
}

function recipientStatusLabel(status) {
  if (status === RECIPIENT_PLOT_STATUS.ACTIVE) return 'Plotting now';
  if (status === RECIPIENT_PLOT_STATUS.COMPLETED) return 'Completed';
  return 'Waiting';
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function matchRecipient(recipient, profile) {
  if (!recipient || !profile) return false;
  if (recipient.uid && recipient.uid === profile.uid) return true;
  const rEmail = normalizeEmail(recipient.email);
  const pEmail = normalizeEmail(profile.email);
  return rEmail && pEmail && rEmail === pEmail;
}

function isActivePlotter(plot, profile, myRecipient) {
  if (!plot || !profile) return false;
  if (plot.activeRecipientUid || plot.activeRecipientEmail) {
    if (plot.activeRecipientUid && plot.activeRecipientUid === profile.uid) return true;
    const activeEmail = normalizeEmail(plot.activeRecipientEmail);
    const profileEmail = normalizeEmail(profile.email);
    if (activeEmail && profileEmail && activeEmail === profileEmail) return true;
    return false;
  }
  return myRecipient?.status === RECIPIENT_PLOT_STATUS.ACTIVE;
}

export default function CourseScheduling() {
  const { profile } = useAuth();
  const isRegistrar = profile?.role === ROLES.REGISTRAR;
  const isDean = profile?.role === ROLES.DEAN;

  const {
    schoolYears,
    activeSchoolYearId,
    setActiveSchoolYearId,
    calendarData,
  } = useAcademicCalendar();

  const [plotRequests, setPlotRequests] = useState([]);
  const [selectedPlotId, setSelectedPlotId] = useState(null);
  const [plotEntries, setPlotEntries] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [scheduleTab, setScheduleTab] = useState('regular');
  const [semester, setSemester] = useState('1');
  const [weekStartDate, setWeekStartDate] = useState(() => getInitialWeekStart(null));

  const [entryModal, setEntryModal] = useState(null);
  const [submittingTurn, setSubmittingTurn] = useState(false);

  useEffect(() => {
    setLoading(true);
    const onData = (list) => {
      setPlotRequests(list);
      setLoading(false);
      setError('');
      setSelectedPlotId((prev) => prev || list[0]?.id || null);
    };
    const onErr = (err) => {
      setError(err.message || 'Failed to load plot schedules.');
      setLoading(false);
    };

    if (isRegistrar) return subscribePlotRequests(onData, onErr);
    if (isDean && profile) return subscribePlotRequestsForUser(profile.uid, profile.email, onData, onErr);
    setPlotRequests([]);
    setLoading(false);
    return undefined;
  }, [isRegistrar, isDean, profile]);

  const semesterOptions = useMemo(() => {
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

  const selectedPlot = plotRequests.find((p) => p.id === selectedPlotId);

  useEffect(() => {
    if (selectedPlot?.schoolYearId) {
      setActiveSchoolYearId(selectedPlot.schoolYearId);
    }
  }, [selectedPlot?.schoolYearId, setActiveSchoolYearId]);

  useEffect(() => {
    if (selectedPlot?.semester) {
      setSemester(String(selectedPlot.semester));
    }
  }, [selectedPlot?.semester, selectedPlotId]);

  useEffect(() => {
    const bounds = getSemesterBounds(calendarData.config, semester);
    setWeekStartDate(getInitialWeekStart(bounds.start));
    setScheduleTab('regular');
  }, [semester, selectedPlotId, calendarData.config]);

  useEffect(() => {
    if (!selectedPlotId) {
      setPlotEntries([]);
      return undefined;
    }
    return subscribePlotEntries(selectedPlotId, setPlotEntries, (err) => {
      setError(err.message || 'Failed to load schedule blocks.');
    });
  }, [selectedPlotId]);

  const myRecipient = useMemo(
    () => (selectedPlot?.recipients || []).find((r) => matchRecipient(r, profile)),
    [selectedPlot, profile],
  );

  const canPlot = isDean && isActivePlotter(selectedPlot, profile, myRecipient);

  const semesterBounds = useMemo(
    () => getSemesterBounds(calendarData.config, semester),
    [calendarData.config, semester],
  );

  const weekDates = useMemo(() => getWeekDates(weekStartDate), [weekStartDate]);

  const dayStatuses = useMemo(
    () => weekDates.map((dateStr) => {
      const status = getPlotDayStatus(dateStr, calendarData, semester, scheduleTab);
      return { date: dateStr, ...status };
    }),
    [weekDates, calendarData, semester, scheduleTab],
  );

  const filteredEntries = useMemo(
    () => plotEntries.filter((e) => e.scheduleMode === scheduleTab || (!e.scheduleMode && scheduleTab === 'regular')),
    [plotEntries, scheduleTab],
  );

  const gridBlocks = useMemo(
    () => entriesToGridBlocks(filteredEntries, weekDates),
    [filteredEntries, weekDates],
  );

  const schoolYearOptions = useMemo(
    () => schoolYears.map((sy) => ({
      value: sy.id,
      label: sy.displayLabel || `SY ${sy.label}`,
    })),
    [schoolYears],
  );

  const selectedSchoolYear = schoolYears.find((sy) => sy.id === selectedPlot?.schoolYearId);
  const schoolYearLabel = selectedPlot?.schoolYearLabel
    || selectedSchoolYear?.displayLabel
    || 'School year';

  const semesterRangeLabel = semesterBounds.start && semesterBounds.end
    ? `${formatDisplayDate(semesterBounds.start)} to ${formatDisplayDate(semesterBounds.end)}`
    : 'Dates not configured in Academic Calendar';

  const canPrevWeek = useMemo(() => {
    if (!semesterBounds.start) return true;
    const semStart = parseDateOnly(semesterBounds.start);
    const prevWeekEnd = addDays(weekStartDate, -1);
    return prevWeekEnd >= semStart;
  }, [weekStartDate, semesterBounds.start]);

  const canNextWeek = useMemo(() => {
    if (!semesterBounds.end) return true;
    const semEnd = parseDateOnly(semesterBounds.end);
    const nextWeekStart = addDays(weekStartDate, 7);
    return nextWeekStart <= semEnd;
  }, [weekStartDate, semesterBounds.end]);

  const handleSlotSelect = ({ dayIndex, date, startTime, endTime, fromDrag }) => {
    if (!canPlot || !date) return;
    const status = dayStatuses[dayIndex];
    if (status?.disabled) return;
    setEntryModal({
      mode: 'add',
      date,
      dayLabel: SCHEDULE_DAYS[dayIndex],
      lockTimes: true,
      initial: { startTime, endTime },
      fromDrag,
    });
  };

  const openEditModal = (block) => {
    if (!canPlot) return;
    const dayIdx = block.day;
    setEntryModal({
      mode: 'edit',
      id: block.id,
      date: block.date || weekDates[dayIdx],
      dayLabel: SCHEDULE_DAYS[dayIdx],
      initial: {
        title: block.title,
        courseCode: block.course,
        instructor: block.instructor,
        type: block.type,
        startTime: hourToTimeInput(block.start),
        endTime: hourToTimeInput(block.end),
        roomCode: block.roomCode,
      },
    });
  };

  const handleSaveEntry = async (payload) => {
    if (!selectedPlotId) return;
    const dayIdx = weekDates.indexOf(payload.date);
    const status = getPlotDayStatus(payload.date, calendarData, semester, scheduleTab);
    if (status.disabled) throw new Error(status.reason || 'This date is blocked.');

    const entry = {
      ...payload,
      day: dayIdx,
      semester: Number(semester),
      plottedBy: profile?.uid || null,
      plottedByEmail: normalizeEmail(profile?.email),
    };

    if (entryModal?.mode === 'edit' && entryModal.id) {
      await updatePlotEntry(selectedPlotId, entryModal.id, entry);
    } else {
      await addPlotEntry(selectedPlotId, entry);
    }
  };

  const handleDeleteEntry = async (block) => {
    if (!canPlot || !selectedPlotId) {
      console.warn('Delete blocked:', { canPlot, selectedPlotId });
      return;
    }
    if (!block?.id) {
      setError('Invalid schedule block - missing ID.');
      return;
    }
    if (!window.confirm('Remove this schedule block?')) return;
    
    console.log('Deleting entry:', { plotId: selectedPlotId, entryId: block.id });
    
    try {
      await deletePlotEntry(selectedPlotId, block.id);
      console.log('Delete successful');
      setError(''); // Clear any previous errors
    } catch (err) {
      console.error('Delete failed:', err);
      setError(err.message || 'Failed to delete block.');
    }
  };

  const handleDeletePlot = async (plotId) => {
    if (!window.confirm('Delete this plot schedule request?')) return;
    try {
      await deletePlotRequest(plotId);
      if (selectedPlotId === plotId) setSelectedPlotId(null);
    } catch (err) {
      setError(err.message || 'Failed to delete plot schedule.');
    }
  };

  const handleSubmitTurn = async () => {
    if (!canPlot || !selectedPlotId || !profile) return;
    if (!window.confirm('Submit your plotted schedule to the registrar? The next dean in line will be notified when applicable.')) return;
    setSubmittingTurn(true);
    setError('');
    try {
      await completePlotTurn(selectedPlotId, profile);
    } catch (err) {
      setError(err.message || 'Failed to submit schedule.');
    } finally {
      setSubmittingTurn(false);
    }
  };

  const entryModalDayStatus = entryModal
    ? getPlotDayStatus(entryModal.date, calendarData, semester, scheduleTab)
    : null;

  const subtitle = isRegistrar
    ? 'Send Excel-style weekly grids to deans for semester plotting'
    : 'View and manage plot schedules sent to you';

  return (
    <Layout title="Course Scheduling" subtitle={subtitle}>
      {error && (
        <div className="mb-4 p-3 border border-red-200 bg-red-50 text-sm font-semibold text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-bold text-base flex items-center gap-2" style={{ color: '#2B3235' }}>
            <Calendar size={18} /> Plot schedule requests
          </h2>
          <p className="text-xs font-medium mt-1" style={{ color: '#2B3235', opacity: 0.65 }}>
            {isRegistrar
              ? 'Create a weekly grid and assign it to CAS or college deans in priority order.'
              : 'Plot on enabled days only — holidays, no-class, exam periods, and out-of-semester dates are blocked.'}
          </p>
        </div>
        {isRegistrar && (
          <button type="button" className="btn-maroon text-sm gap-2" onClick={() => setShowCreateModal(true)}>
            <Send size={16} /> Send plot schedule
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
        <div className="space-y-3">
          {loading && <p className="text-sm font-semibold opacity-60" style={{ color: '#2B3235' }}>Loading…</p>}
          {!loading && !plotRequests.length && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
              <p className="text-sm font-semibold" style={{ color: '#2B3235', opacity: 0.6 }}>
                {isRegistrar ? 'No plot schedules sent yet.' : 'No plot schedules assigned to you yet.'}
              </p>
              {isRegistrar && (
                <button type="button" className="btn-maroon text-sm mt-4 gap-2 mx-auto" onClick={() => setShowCreateModal(true)}>
                  <Plus size={16} /> Send first plot schedule
                </button>
              )}
            </div>
          )}

          {plotRequests.map((plot) => {
            const isActive = plot.id === selectedPlotId;
            const activeRecipient = (plot.recipients || []).find((r) => r.status === RECIPIENT_PLOT_STATUS.ACTIVE);
            return (
              <div
                key={plot.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPlotId(plot.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') setSelectedPlotId(plot.id); }}
                className="w-full text-left bg-white border rounded-2xl p-4 transition-shadow hover:shadow-md cursor-pointer"
                style={{
                  borderColor: isActive ? '#7A0808' : '#f0f0f0',
                  boxShadow: isActive ? '0 0 0 1px #7A0808' : undefined,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-black text-sm truncate" style={{ color: '#2B3235' }}>{plot.title}</p>
                    <p className="text-[11px] font-semibold mt-0.5" style={{ color: '#2B3235', opacity: 0.65 }}>
                      {plot.schoolYearLabel} · Semester {plot.semester}
                    </p>
                  </div>
                  {isRegistrar && (
                    <button type="button" className="p-1 shrink-0" onClick={(e) => { e.stopPropagation(); handleDeletePlot(plot.id); }}>
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={statusBadgeClass(plot.status)}>{plot.status}</span>
                  {plot.restrictRooms ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200" style={{ color: '#2B3235' }}>
                      {plot.assignedRooms?.length || 0} rooms
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-200" style={{ color: '#2B3235' }}>Any room</span>
                  )}
                </div>
                {activeRecipient && (
                  <p className="text-[10px] font-semibold mt-2 flex items-center gap-1" style={{ color: '#7A0808' }}>
                    <Clock size={10} /> {activeRecipient.name || activeRecipient.college} — plotting now
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div>
          {selectedPlot ? (
            <div className="space-y-4">
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <h3 className="font-black text-base mb-1" style={{ color: '#2B3235' }}>{selectedPlot.title}</h3>
                {selectedPlot.notes && (
                  <p className="text-xs font-medium mb-3" style={{ color: '#2B3235', opacity: 0.75 }}>{selectedPlot.notes}</p>
                )}
                <div className="flex flex-wrap gap-4 text-xs font-semibold mb-4" style={{ color: '#2B3235' }}>
                  <span className="flex items-center gap-1"><Users size={12} /> {(selectedPlot.recipients || []).length} recipient(s)</span>
                  <span className="flex items-center gap-1">
                    <MapPin size={12} />
                    {selectedPlot.restrictRooms ? `${selectedPlot.assignedRooms?.length || 0} assigned room(s)` : 'Any campus room'}
                  </span>
                </div>
                <div className="space-y-2 mb-2">
                  <p className="text-xs font-black uppercase tracking-wide opacity-50" style={{ color: '#2B3235' }}>Plotting order</p>
                  {(selectedPlot.recipients || []).map((r, idx) => (
                    <div key={r.id || idx} className="flex items-center justify-between text-xs font-semibold py-1.5 px-2 rounded-lg" style={{ background: '#F9FAFB', color: '#2B3235' }}>
                      <span>
                        {idx + 1}. {r.name || r.college}
                        {r.deanTier === 'cas' && <span className="ml-1 text-[10px] font-black" style={{ color: '#7A0808' }}>(CAS · first)</span>}
                      </span>
                      <span className={r.status === RECIPIENT_PLOT_STATUS.ACTIVE ? 'badge-pending' : r.status === RECIPIENT_PLOT_STATUS.COMPLETED ? 'badge-approved' : 'text-[10px] opacity-60'}>
                        {recipientStatusLabel(r.status)}
                      </span>
                    </div>
                  ))}
                </div>
                {isDean && myRecipient && (
                  <div className="mt-3 p-3 rounded-lg border" style={{ background: canPlot ? '#F0FDF4' : '#FFFBEB', borderColor: canPlot ? '#BBF7D0' : '#FDE68A' }}>
                    <p className="text-xs font-bold" style={{ color: '#2B3235' }}>
                      {canPlot
                        ? 'Your turn — click or drag on the grid to plot. Blocked days are greyed out.'
                        : myRecipient.status === RECIPIENT_PLOT_STATUS.COMPLETED
                          ? 'You have completed plotting for this request.'
                          : 'Waiting for earlier deans (CAS plots first) to finish.'}
                    </p>
                    {canPlot && (
                      <button
                        type="button"
                        className="btn-maroon text-xs mt-3 gap-2"
                        onClick={handleSubmitTurn}
                        disabled={submittingTurn}
                      >
                        <Send size={14} />
                        {submittingTurn ? 'Submitting…' : 'Submit schedule to registrar'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <WeeklyScheduleGrid
                title="Weekly Schedule"
                schoolYearLabel={schoolYearLabel}
                schoolYearOptions={schoolYearOptions}
                onSchoolYearChange={(val) => setActiveSchoolYearId(val)}
                semester={semester}
                onSemesterChange={setSemester}
                semesterOptions={semesterOptions}
                lockSemester={false}
                scheduleTab={scheduleTab}
                onScheduleTabChange={setScheduleTab}
                weekStartDate={weekStartDate}
                onPrevWeek={() => setWeekStartDate((d) => addDays(d, -7))}
                onNextWeek={() => setWeekStartDate((d) => addDays(d, 7))}
                canPrevWeek={canPrevWeek}
                canNextWeek={canNextWeek}
                semesterRangeLabel={semesterRangeLabel}
                dayStatuses={dayStatuses}
                blocks={gridBlocks}
                readOnly={!canPlot}
                canPlot={canPlot}
                onAddBlock={() => {
                  const firstOpenIdx = dayStatuses.findIndex((d) => !d.disabled);
                  if (firstOpenIdx >= 0) {
                    handleSlotSelect({
                      dayIndex: firstOpenIdx,
                      date: dayStatuses[firstOpenIdx].date,
                      startTime: '08:00',
                      endTime: '09:00',
                      fromDrag: false,
                    });
                  }
                }}
                onSlotSelect={handleSlotSelect}
                onEditBlock={openEditModal}
                onDeleteBlock={handleDeleteEntry}
                emptyMessage={canPlot ? 'Click or drag on the grid to set a time range, then fill in course details.' : 'No schedule blocks plotted yet.'}
              />
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
              <p className="text-sm font-semibold" style={{ color: '#2B3235', opacity: 0.55 }}>
                {plotRequests.length ? 'Select a plot schedule to view the weekly grid.' : 'Nothing to display yet.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && isRegistrar && (
        <CreatePlotScheduleModal
          onClose={() => setShowCreateModal(false)}
          schoolYears={schoolYears}
          defaultSchoolYearId={activeSchoolYearId}
          createdBy={profile?.uid}
          onSent={(plotId) => setSelectedPlotId(plotId)}
        />
      )}

      {entryModal && (
        <AddPlotEntryModal
          key={`${entryModal.mode}-${entryModal.date}-${entryModal.initial?.startTime}-${entryModal.initial?.endTime}`}
          onClose={() => setEntryModal(null)}
          onSave={handleSaveEntry}
          initial={entryModal.initial}
          date={entryModal.date}
          dayLabel={entryModal.dayLabel}
          scheduleMode={scheduleTab}
          restrictRooms={selectedPlot?.restrictRooms}
          assignedRooms={selectedPlot?.assignedRooms || []}
          dayBlockReason={entryModalDayStatus?.disabled ? entryModalDayStatus.reason : null}
          lockTimes={entryModal.lockTimes}
        />
      )}
    </Layout>
  );
}
