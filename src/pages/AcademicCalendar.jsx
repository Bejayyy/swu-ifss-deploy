import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, CalendarDays, CircleAlert, CalendarClock, Calendar,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useAcademicCalendar } from '../hooks/useAcademicCalendar';
import {
  buildSchoolYearId,
  saveSchoolYearConfig,
  addHoliday,
  deleteHoliday,
  addNoClassPeriod,
  deleteNoClassPeriod,
  saveExamPeriodRange,
} from '../services/academicCalendarService';
import {
  formatDisplayDate,
  formatExamRange,
  normalizeExamPeriods,
  countConfiguredExamPeriods,
} from '../utils/academicCalendarUtils';

const MAROON = '#7A0808';
const TEXT = '#2B3235';
const R = 12;
const compact = { padding: '7px 10px', fontSize: '12.5px' };

/* ─── Card wrapper ─── */
function Card({ title, subtitle, icon: Icon, iconColor, children }) {
  return (
    <div className="bg-white border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col" style={{ borderRadius: R }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100" style={{ background: '#FAFBFC' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${iconColor}12` }}>
          <Icon size={14} style={{ color: iconColor }} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-black leading-tight" style={{ color: TEXT }}>{title}</p>
          {subtitle && <p className="text-[10px] font-semibold" style={{ color: TEXT, opacity: 0.5 }}>{subtitle}</p>}
        </div>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

export default function AcademicCalendar() {
  const { canManageCalendar } = useRolePermissions();
  const isRegistrar = canManageCalendar();

  const {
    schoolYears,
    activeSchoolYearId,
    setActiveSchoolYearId,
    calendarData,
    loading,
    error,
  } = useAcademicCalendar();

  const [syForm, setSyForm] = useState({ label: '', s1s: '', s1e: '', s2s: '', s2e: '' });
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '', desc: '' });
  const [ncForm, setNcForm] = useState({ start: '', end: '', reason: '', desc: '' });
  const [examTab, setExamTab] = useState('1');
  const [examEdit, setExamEdit] = useState(null);
  const [examDraft, setExamDraft] = useState({ start: '', end: '' });
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const { config, holidays, noClassPeriods } = calendarData;
  const examPeriods = useMemo(() => normalizeExamPeriods(config?.examPeriods), [config?.examPeriods]);

  useEffect(() => {
    if (!config) return;
    setSyForm({
      label: config.label || '',
      s1s: config.semester1Start || '',
      s1e: config.semester1End || '',
      s2s: config.semester2Start || '',
      s2e: config.semester2End || '',
    });
  }, [config]);

  const activeSchoolYear = schoolYears.find((sy) => sy.id === activeSchoolYearId);
  const displaySchoolYear = activeSchoolYear?.displayLabel || (syForm.label ? `SY ${syForm.label}` : 'School year');

  /* ── Handlers ── */
  const handleSaveSy = async () => {
    if (!isRegistrar || !syForm.label.trim()) return;
    setSaving(true); setActionError('');
    try {
      const schoolYearId = activeSchoolYearId || buildSchoolYearId(syForm.label);
      await saveSchoolYearConfig(schoolYearId, {
        label: syForm.label.trim(),
        semester1Start: syForm.s1s, semester1End: syForm.s1e,
        semester2Start: syForm.s2s, semester2End: syForm.s2e,
      });
      if (!activeSchoolYearId) setActiveSchoolYearId(schoolYearId);
    } catch (err) { setActionError(err.message || 'Failed to save.'); }
    finally { setSaving(false); }
  };

  const handleAddHoliday = async () => {
    if (!isRegistrar || !activeSchoolYearId || !holidayForm.date || !holidayForm.name.trim()) return;
    setSaving(true); setActionError('');
    try {
      await addHoliday(activeSchoolYearId, holidayForm);
      setHolidayForm({ date: '', name: '', desc: '' });
    } catch (err) { setActionError(err.message || 'Failed to add holiday.'); }
    finally { setSaving(false); }
  };

  const handleDeleteHoliday = async (id) => {
    if (!isRegistrar || !activeSchoolYearId) return;
    setActionError('');
    try { await deleteHoliday(activeSchoolYearId, id); }
    catch (err) { setActionError(err.message || 'Failed to delete holiday.'); }
  };

  const handleAddNoClass = async () => {
    if (!isRegistrar || !activeSchoolYearId || !ncForm.start || !ncForm.end || !ncForm.reason.trim()) return;
    setSaving(true); setActionError('');
    try {
      await addNoClassPeriod(activeSchoolYearId, ncForm);
      setNcForm({ start: '', end: '', reason: '', desc: '' });
    } catch (err) { setActionError(err.message || 'Failed to add no-class period.'); }
    finally { setSaving(false); }
  };

  const handleDeleteNoClass = async (id) => {
    if (!isRegistrar || !activeSchoolYearId) return;
    setActionError('');
    try { await deleteNoClassPeriod(activeSchoolYearId, id); }
    catch (err) { setActionError(err.message || 'Failed to delete.'); }
  };

  const openExamEditor = (semester, periodKey, level) => {
    if (!isRegistrar) return;
    const range = examPeriods[semester]?.[periodKey]?.[level];
    setExamEdit({ semester, periodKey, level });
    setExamDraft({ start: range?.start || '', end: range?.end || '' });
  };

  const handleSaveExamRange = async () => {
    if (!examEdit || !activeSchoolYearId || !examDraft.start || !examDraft.end) return;
    setSaving(true); setActionError('');
    try {
      await saveExamPeriodRange(activeSchoolYearId, examEdit.semester, examEdit.periodKey, examEdit.level, examDraft.start, examDraft.end);
      setExamEdit(null); setExamDraft({ start: '', end: '' });
    } catch (err) { setActionError(err.message || 'Failed to save exam period.'); }
    finally { setSaving(false); }
  };

  const configuredExamCount = countConfiguredExamPeriods(examPeriods, examTab);

  /* ── Exam level renderer ── */
  const renderExamLevel = (semester, periodKey, level, label) => {
    const data = examPeriods[semester]?.[periodKey]?.[level];
    const rangeText = formatExamRange(data);
    const isEditing = examEdit?.semester === semester && examEdit?.periodKey === periodKey && examEdit?.level === level;

    return (
      <div className="bg-white p-2.5" style={{ borderRadius: 8 }}>
        <p className="text-xs font-semibold mb-1" style={{ color: TEXT }}>{label}</p>
        {rangeText && !isEditing && (
          <p className="text-xs font-semibold mb-1.5" style={{ color: '#1E3A8A' }}>{rangeText}</p>
        )}
        {isEditing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="form-input" style={compact} value={examDraft.start} onChange={(e) => setExamDraft((d) => ({ ...d, start: e.target.value }))} />
              <input type="date" className="form-input" style={compact} value={examDraft.end} onChange={(e) => setExamDraft((d) => ({ ...d, end: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <button type="button" className="flex-1 border border-gray-200 text-xs font-bold py-1.5" style={{ borderRadius: 8, color: TEXT }} onClick={() => setExamEdit(null)}>Cancel</button>
              <button type="button" className="flex-1 btn-maroon text-xs justify-center py-1.5" onClick={handleSaveExamRange} disabled={saving}>Save</button>
            </div>
          </div>
        ) : (
          isRegistrar && (
            <button type="button" className="w-full border border-gray-200 text-[11px] font-bold py-1.5 flex items-center justify-center gap-1" style={{ borderRadius: 8, color: TEXT }} onClick={() => openExamEditor(semester, periodKey, level)}>
              <Plus size={12} /> {rangeText ? 'Edit' : 'Set Dates'}
            </button>
          )
        )}
      </div>
    );
  };

  return (
    <Layout title="Academic Calendar" subtitle="Configure school year, holidays, no-class dates, and exam periods">
      {(error || actionError) && (
        <div className="mb-4 p-3 border border-red-200 bg-red-50 text-xs font-semibold text-red-700" style={{ borderRadius: 10 }}>
          {actionError || error}
        </div>
      )}

      {/* School Year Selector */}
      <div className="mb-5 flex items-center gap-3">
        <label className="text-xs font-bold" style={{ color: TEXT }}>School Year:</label>
        <select
          className="form-input appearance-none font-semibold"
          style={{ ...compact, width: 200 }}
          value={activeSchoolYearId || ''}
          onChange={(e) => setActiveSchoolYearId(e.target.value || null)}
          disabled={loading || !schoolYears.length}
        >
          {!schoolYears.length && <option value="">No school years yet</option>}
          {schoolYears.map((sy) => (
            <option key={sy.id} value={sy.id}>{sy.displayLabel || `SY ${sy.label}`}</option>
          ))}
        </select>
        {loading && <span className="text-[10px] font-semibold opacity-60" style={{ color: TEXT }}>Loading…</span>}
      </div>

      {/* ═══ Row 1: School Year Config | Holidays | No-Class Periods ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* School Year Configuration */}
        <Card title="School Year Configuration" subtitle={displaySchoolYear} icon={CalendarDays} iconColor="#7F1D1D">
          <div className="space-y-3">
            <div>
              <label className="form-label">School Year Label</label>
              <input className="form-input" style={compact} placeholder="e.g., 2025-2026" value={syForm.label} onChange={(e) => setSyForm((s) => ({ ...s, label: e.target.value }))} disabled={!isRegistrar} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label">S1 Start</label>
                <input type="date" className="form-input" style={compact} value={syForm.s1s} onChange={(e) => setSyForm((s) => ({ ...s, s1s: e.target.value }))} disabled={!isRegistrar} />
              </div>
              <div>
                <label className="form-label">S1 End</label>
                <input type="date" className="form-input" style={compact} value={syForm.s1e} onChange={(e) => setSyForm((s) => ({ ...s, s1e: e.target.value }))} disabled={!isRegistrar} />
              </div>
              <div>
                <label className="form-label">S2 Start</label>
                <input type="date" className="form-input" style={compact} value={syForm.s2s} onChange={(e) => setSyForm((s) => ({ ...s, s2s: e.target.value }))} disabled={!isRegistrar} />
              </div>
              <div>
                <label className="form-label">S2 End</label>
                <input type="date" className="form-input" style={compact} value={syForm.s2e} onChange={(e) => setSyForm((s) => ({ ...s, s2e: e.target.value }))} disabled={!isRegistrar} />
              </div>
            </div>
            {isRegistrar && (
              <button type="button" className="btn-maroon w-full justify-center text-xs py-2" onClick={handleSaveSy} disabled={saving}>
                Save Configuration
              </button>
            )}
            {/* Saved school years */}
            {schoolYears.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: TEXT, opacity: 0.4 }}>Saved School Years</p>
                {schoolYears.map((row) => (
                  <div key={row.id} className="p-2 border border-gray-100 bg-gray-50/50" style={{ borderRadius: 8 }}>
                    <p className="text-[11px] font-bold" style={{ color: TEXT }}>
                      {row.displayLabel || `SY ${row.label}`}
                    </p>
                    <p className="text-[10px] font-medium" style={{ color: TEXT, opacity: 0.6 }}>
                      S1: {formatDisplayDate(row.semester1Start)} – {formatDisplayDate(row.semester1End)}
                      {row.semester2Start && row.semester2End && (
                        <> · S2: {formatDisplayDate(row.semester2Start)} – {formatDisplayDate(row.semester2End)}</>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Holidays */}
        <Card title="Holidays" subtitle={`${holidays.length} holiday${holidays.length !== 1 ? 's' : ''} configured`} icon={CircleAlert} iconColor="#A16207">
          <div className="space-y-3">
            {/* Add Holiday Form */}
            {isRegistrar && (
              <div className="p-3 border" style={{ borderRadius: 8, background: '#FFFDF5', borderColor: '#F0E8C8' }}>
                <p className="text-[11px] font-black mb-2" style={{ color: TEXT }}>Add Holiday</p>
                <div className="space-y-2">
                  <input type="date" className="form-input" style={compact} value={holidayForm.date} onChange={(e) => setHolidayForm((h) => ({ ...h, date: e.target.value }))} />
                  <input className="form-input" style={compact} placeholder="Holiday name" value={holidayForm.name} onChange={(e) => setHolidayForm((h) => ({ ...h, name: e.target.value }))} />
                  <input className="form-input" style={compact} placeholder="Description (optional)" value={holidayForm.desc} onChange={(e) => setHolidayForm((h) => ({ ...h, desc: e.target.value }))} />
                  <button type="button" className="w-full py-1.5 text-white text-[11px] font-bold flex items-center justify-center gap-1" style={{ borderRadius: 8, background: '#D97706' }} onClick={handleAddHoliday} disabled={saving || !activeSchoolYearId}>
                    <Plus size={12} /> Add Holiday
                  </button>
                </div>
              </div>
            )}
            {/* List */}
            {!holidays.length && <p className="text-[11px] font-semibold text-gray-400">No holidays configured.</p>}
            <div className="space-y-1.5">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 p-2.5 border" style={{ borderRadius: 8, background: '#FFFDF5', borderColor: '#F0E8C8' }}>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: TEXT }}>{h.name}</p>
                    <p className="text-[10px] font-medium" style={{ color: TEXT, opacity: 0.6 }}>{h.date}</p>
                    {h.desc && <p className="text-[10px] truncate" style={{ color: TEXT, opacity: 0.5 }}>{h.desc}</p>}
                  </div>
                  {isRegistrar && (
                    <button type="button" className="p-1 rounded hover:bg-red-50 flex-shrink-0" onClick={() => handleDeleteHoliday(h.id)}>
                      <Trash2 size={13} className="text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* No-Class Periods */}
        <Card title="No-Class Dates" subtitle={`${noClassPeriods.length} period${noClassPeriods.length !== 1 ? 's' : ''} configured`} icon={CalendarClock} iconColor="#1D4ED8">
          <div className="space-y-3">
            {/* Add No-Class Form */}
            {isRegistrar && (
              <div className="p-3 border" style={{ borderRadius: 8, background: '#F8FAFF', borderColor: '#D6E4F8' }}>
                <p className="text-[11px] font-black mb-2" style={{ color: TEXT }}>Add No-Class Period</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className="form-input" style={compact} value={ncForm.start} onChange={(e) => setNcForm((h) => ({ ...h, start: e.target.value }))} />
                    <input type="date" className="form-input" style={compact} value={ncForm.end} onChange={(e) => setNcForm((h) => ({ ...h, end: e.target.value }))} />
                  </div>
                  <input className="form-input" style={compact} placeholder="Reason" value={ncForm.reason} onChange={(e) => setNcForm((h) => ({ ...h, reason: e.target.value }))} />
                  <input className="form-input" style={compact} placeholder="Description (optional)" value={ncForm.desc} onChange={(e) => setNcForm((h) => ({ ...h, desc: e.target.value }))} />
                  <button type="button" className="w-full py-1.5 text-white text-[11px] font-bold flex items-center justify-center gap-1" style={{ borderRadius: 8, background: '#2563EB' }} onClick={handleAddNoClass} disabled={saving || !activeSchoolYearId}>
                    <Plus size={12} /> Add No-Class Period
                  </button>
                </div>
              </div>
            )}
            {/* List */}
            {!noClassPeriods.length && <p className="text-[11px] font-semibold text-gray-400">No no-class periods configured.</p>}
            <div className="space-y-1.5">
              {noClassPeriods.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 p-2.5 border" style={{ borderRadius: 8, background: '#F8FAFF', borderColor: '#D6E4F8' }}>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: TEXT }}>{h.reason}</p>
                    <p className="text-[10px] font-medium" style={{ color: TEXT, opacity: 0.6 }}>{h.start} → {h.end}</p>
                    {h.desc && <p className="text-[10px] truncate" style={{ color: TEXT, opacity: 0.5 }}>{h.desc}</p>}
                  </div>
                  {isRegistrar && (
                    <button type="button" className="p-1 rounded hover:bg-red-50 flex-shrink-0" onClick={() => handleDeleteNoClass(h.id)}>
                      <Trash2 size={13} className="text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ═══ Row 2: Exam Periods (full width) ═══ */}
      <Card title="Exam Period Ranges" subtitle={`Semester ${examTab} · ${configuredExamCount} period${configuredExamCount === 1 ? '' : 's'} configured`} icon={Calendar} iconColor="#7F1D1D">
        {/* Semester tabs */}
        <div className="flex gap-2 mb-4">
          {['1', '2'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setExamTab(t)}
              className="px-5 py-1.5 text-xs font-bold border"
              style={
                examTab === t
                  ? { background: MAROON, color: '#fff', borderRadius: 8, borderColor: MAROON }
                  : { color: TEXT, borderRadius: 8, background: '#fff', borderColor: '#E5E7EB' }
              }
            >
              Semester {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { key: 'p1', label: 'P1 Period', bg: '#FFF5F5', border: '#F3CACA' },
            { key: 'p2', label: 'P2 Period', bg: '#FFFAF0', border: '#F5D5A3' },
            { key: 'p3', label: 'P3 Period', bg: '#FBF5FF', border: '#E9D8FD' },
            { key: 'rbe', label: 'RBE Period', bg: '#F0FFF4', border: '#B7E4C7' },
          ].map((p) => (
            <div key={p.key} className="p-3 border" style={{ borderRadius: 10, background: p.bg, borderColor: p.border }}>
              <h4 className="font-black text-xs mb-2" style={{ color: TEXT }}>{p.label}</h4>
              <div className="space-y-2">
                {renderExamLevel(examTab, p.key, 'fr', 'Freshmen')}
                {renderExamLevel(examTab, p.key, 'up', 'Upperclassmen')}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </Layout>
  );
}
