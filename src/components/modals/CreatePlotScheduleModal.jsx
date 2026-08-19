import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  subscribeStaffUsers,
  getActiveDeans,
  getDeanDepartmentOptions,
  findDeansInDepartment,
  formatDeanOptionLabel,
} from '../../services/systemUserService';
import { createAndSendPlotRequest } from '../../services/plotScheduleService';
import { isCasDepartment } from '../../constants/plotScheduling';

const EMPTY_RECIPIENT = { assignType: 'by_name', uid: '', department: '' };

function deanToRecipientPayload(dean, assignType) {
  return {
    assignType,
    uid: dean.uid,
    email: dean.email,
    name: dean.name,
    college: dean.department || '',
    department: dean.department || '',
  };
}

export default function CreatePlotScheduleModal({
  onClose,
  onSent,
  schoolYears,
  defaultSchoolYearId,
  createdBy,
}) {
  const { buildingList } = useApp();
  const [staffUsers, setStaffUsers] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [form, setForm] = useState({
    title: '',
    notes: '',
    schoolYearId: defaultSchoolYearId || '',
    semester: '1',
    restrictRooms: false,
    assignedRoomKeys: [],
    recipients: [{ ...EMPTY_RECIPIENT }],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = subscribeStaffUsers(
      (list) => {
        setStaffUsers(list);
        setStaffLoading(false);
      },
      () => setStaffLoading(false),
    );
    return unsub;
  }, []);

  const deanUsers = useMemo(() => getActiveDeans(staffUsers), [staffUsers]);
  const departmentOptions = useMemo(() => getDeanDepartmentOptions(staffUsers), [staffUsers]);

  const selectedSchoolYear = useMemo(() => {
    return (schoolYears || []).find((sy) => sy.id === form.schoolYearId);
  }, [schoolYears, form.schoolYearId]);

  const semesterOptions = useMemo(() => {
    if (Array.isArray(selectedSchoolYear?.semesters) && selectedSchoolYear.semesters.length > 0) {
      return selectedSchoolYear.semesters.map((s, idx) => ({
        value: String(idx + 1),
        label: s.name || (idx === 2 ? 'Summer' : `Semester ${idx + 1}`),
      }));
    }
    return [
      { value: '1', label: 'Semester 1' },
      { value: '2', label: 'Semester 2' },
    ];
  }, [selectedSchoolYear]);

  const roomOptions = useMemo(() => {
    const opts = [];
    buildingList.forEach((b) => {
      (b.floorData || []).forEach((f) => {
        (f.rooms || []).forEach((r) => {
          const key = `${b.id}|${f.floorId}|${r.docId || r.id}`;
          opts.push({
            key,
            buildingId: b.id,
            floorId: f.floorId,
            roomDocId: r.docId || r.id,
            roomCode: r.roomCode || r.id,
            roomName: r.name || r.roomCode || r.id,
            buildingName: b.name,
            label: `${b.name} · ${r.roomCode || r.id}`,
          });
        });
      });
    });
    return opts;
  }, [buildingList]);

  const selectedSchoolYear = schoolYears.find((sy) => sy.id === form.schoolYearId);

  const getDeansForRecipient = (rcp) => {
    if (rcp.assignType === 'by_name') {
      const dean = deanUsers.find((u) => u.uid === rcp.uid);
      return dean ? [dean] : [];
    }
    return findDeansInDepartment(staffUsers, rcp.department);
  };

  const addRecipient = () => {
    setForm((f) => ({ ...f, recipients: [...f.recipients, { ...EMPTY_RECIPIENT }] }));
  };

  const removeRecipient = (idx) => {
    setForm((f) => ({ ...f, recipients: f.recipients.filter((_, i) => i !== idx) }));
  };

  const updateRecipient = (idx, patch) => {
    setForm((f) => ({
      ...f,
      recipients: f.recipients.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));
  };

  const toggleRoom = (key) => {
    setForm((f) => ({
      ...f,
      assignedRoomKeys: f.assignedRoomKeys.includes(key)
        ? f.assignedRoomKeys.filter((k) => k !== key)
        : [...f.assignedRoomKeys, key],
    }));
  };

  const resolveRecipientPayload = (r) => {
    const matchedDeans = getDeansForRecipient(r);

    if (r.assignType === 'by_name') {
      if (!r.uid) throw new Error('Select a dean by name for each recipient.');
      const dean = deanUsers.find((u) => u.uid === r.uid);
      if (!dean) throw new Error('Selected dean was not found in System Administration.');
      return deanToRecipientPayload(dean, 'by_name');
    }

    if (!r.department) throw new Error('Select a dean department for each recipient.');
    if (!matchedDeans.length) {
      throw new Error(`No active dean found for "${r.department}" in System Administration.`);
    }

    const dean = r.uid
      ? matchedDeans.find((u) => u.uid === r.uid) || matchedDeans[0]
      : matchedDeans[0];

    if (matchedDeans.length > 1 && !r.uid) {
      throw new Error(`Multiple deans in "${r.department}" — select which dean should receive this plot.`);
    }

    return deanToRecipientPayload(dean, 'by_department');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!form.schoolYearId) {
      setError('Select a school year.');
      return;
    }
    if (form.restrictRooms && !form.assignedRoomKeys.length) {
      setError('Select at least one room, or allow plotting in any room.');
      return;
    }
    if (!deanUsers.length) {
      setError('Add at least one active dean in System Administration before sending.');
      return;
    }

    setLoading(true);
    try {
      const recipients = form.recipients.map(resolveRecipientPayload);
      const assignedRooms = form.assignedRoomKeys
        .map((key) => roomOptions.find((o) => o.key === key))
        .filter(Boolean)
        .map((o) => ({
          buildingId: o.buildingId,
          floorId: o.floorId,
          roomDocId: o.roomDocId,
          roomCode: o.roomCode,
          roomName: o.roomName,
          buildingName: o.buildingName,
        }));

      const plotId = await createAndSendPlotRequest({
        title: form.title,
        notes: form.notes,
        schoolYearId: form.schoolYearId,
        schoolYearLabel: selectedSchoolYear?.displayLabel || `SY ${selectedSchoolYear?.label}`,
        semester: form.semester,
        restrictRooms: form.restrictRooms,
        assignedRooms,
        recipients,
        createdBy,
      });
      onSent?.(plotId);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to send plot schedule.');
    } finally {
      setLoading(false);
    }
  };

  const renderRecipientFields = (rcp, idx) => {
    const deptDeans = rcp.department ? findDeansInDepartment(staffUsers, rcp.department) : [];
    const selectedDean = rcp.assignType === 'by_name'
      ? deanUsers.find((u) => u.uid === rcp.uid)
      : deptDeans.find((u) => u.uid === rcp.uid) || (deptDeans.length === 1 ? deptDeans[0] : null);

    return (
      <div key={idx} className="p-3 border border-gray-200 rounded-xl bg-white">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-black" style={{ color: '#2B3235' }}>Recipient {idx + 1}</span>
          {form.recipients.length > 1 && (
            <button type="button" onClick={() => removeRecipient(idx)}>
              <Trash2 size={14} className="text-red-500" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide opacity-50 mb-1 block">Assign by</label>
            <select
              className="form-input text-sm"
              value={rcp.assignType}
              onChange={(e) => updateRecipient(idx, {
                assignType: e.target.value,
                uid: '',
                department: '',
              })}
            >
              <option value="by_name">Dean name (from System Administration)</option>
              <option value="by_department">Dean department / college</option>
            </select>
          </div>

          {rcp.assignType === 'by_name' ? (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide opacity-50 mb-1 block">Dean</label>
              <select
                className="form-input text-sm"
                value={rcp.uid}
                onChange={(e) => updateRecipient(idx, { uid: e.target.value })}
                required
              >
                <option value="">Select dean</option>
                {deanUsers.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {formatDeanOptionLabel(u)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide opacity-50 mb-1 block">Department / college</label>
              <select
                className="form-input text-sm"
                value={rcp.department}
                onChange={(e) => updateRecipient(idx, { department: e.target.value, uid: '' })}
                required
              >
                <option value="">Select department</option>
                {departmentOptions.map((opt) => (
                  <option key={opt.key} value={opt.department}>
                    {opt.department}
                    {isCasDepartment(opt.department) ? ' · plots first' : ''}
                    {opt.deans.length > 1 ? ` · ${opt.deans.length} deans` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {rcp.assignType === 'by_department' && rcp.department && deptDeans.length > 1 && (
          <div className="mt-2">
            <label className="text-[10px] font-bold uppercase tracking-wide opacity-50 mb-1 block">Dean in this department</label>
            <select
              className="form-input text-sm"
              value={rcp.uid}
              onChange={(e) => updateRecipient(idx, { uid: e.target.value })}
              required
            >
              <option value="">Select dean</option>
              {deptDeans.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {formatDeanOptionLabel(u)}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedDean && (
          <div className="mt-2 p-2 rounded-lg text-[11px] font-semibold" style={{ background: '#F9FAFB', color: '#2B3235' }}>
            Will send to: <span className="font-black">{selectedDean.name}</span>
            {selectedDean.department && <> · {selectedDean.department}</>}
            {selectedDean.email && <> · {selectedDean.email}</>}
            {isCasDepartment(selectedDean.department) && (
              <span className="ml-1 font-black" style={{ color: '#7A0808' }}>(CAS · plots first)</span>
            )}
          </div>
        )}

        {rcp.assignType === 'by_department' && rcp.department && !deptDeans.length && (
          <p className="mt-2 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
            No active dean registered for this department in System Administration.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 z-10">
          <X size={20} />
        </button>

        <form onSubmit={handleSubmit} className="p-8 pt-10">
          <h2 className="font-black text-lg mb-1" style={{ color: '#7A0808' }}>Send plot schedule</h2>
          <p className="text-xs font-medium mb-6" style={{ color: '#2B3235', opacity: 0.65 }}>
            Create an Excel-style weekly grid for deans to plot their semester schedules. Recipients are loaded from System Administration.
          </p>

          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <div className="space-y-4">
            <div>
              <label className="form-label">Title</label>
              <input
                className="form-input"
                placeholder="e.g., 1st Semester Plot Scheduling"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="form-label">Notes / comments (optional)</label>
              <textarea
                className="form-input min-h-[72px]"
                placeholder="Instructions or remarks for the recipient deans"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">School year</label>
                <select
                  className="form-input"
                  value={form.schoolYearId}
                  onChange={(e) => setForm((f) => ({ ...f, schoolYearId: e.target.value }))}
                  required
                >
                  <option value="">Select school year</option>
                  {schoolYears.map((sy) => (
                    <option key={sy.id} value={sy.id}>{sy.displayLabel || `SY ${sy.label}`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Semester</label>
                <select
                  className="form-input"
                  value={form.semester}
                  onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))}
                >
                  {semesterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-4 border border-gray-100 rounded-xl" style={{ background: '#FAFAFA' }}>
              <label className="form-label mb-2">Room assignment</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer" style={{ color: '#2B3235' }}>
                  <input
                    type="radio"
                    name="roomMode"
                    checked={!form.restrictRooms}
                    onChange={() => setForm((f) => ({ ...f, restrictRooms: false, assignedRoomKeys: [] }))}
                  />
                  Deans may plot in any room on campus
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer" style={{ color: '#2B3235' }}>
                  <input
                    type="radio"
                    name="roomMode"
                    checked={form.restrictRooms}
                    onChange={() => setForm((f) => ({ ...f, restrictRooms: true }))}
                  />
                  Restrict to specific rooms only
                </label>
              </div>

              {form.restrictRooms && (
                <div className="mt-3 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white space-y-1">
                  {!roomOptions.length && (
                    <p className="text-xs font-semibold opacity-60 p-2">No rooms in building directory yet.</p>
                  )}
                  {roomOptions.map((room) => (
                    <label key={room.key} className="flex items-center gap-2 text-xs font-semibold px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.assignedRoomKeys.includes(room.key)}
                        onChange={() => toggleRoom(room.key)}
                      />
                      {room.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">Send to</label>
                <button type="button" className="text-xs font-bold flex items-center gap-1" style={{ color: '#7A0808' }} onClick={addRecipient}>
                  <Plus size={14} /> Add recipient
                </button>
              </div>
              <p className="text-[11px] font-medium mb-3" style={{ color: '#2B3235', opacity: 0.6 }}>
                Choose deans from{' '}
                <Link to="/system-administration" className="font-bold underline" style={{ color: '#7A0808' }} onClick={onClose}>
                  System Administration
                </Link>
                {' '}by name or by their registered department. CAS deans plot first.
              </p>

              {staffLoading && (
                <p className="text-xs font-semibold opacity-60 mb-3" style={{ color: '#2B3235' }}>Loading users…</p>
              )}

              {!staffLoading && !deanUsers.length && (
                <div className="p-4 border border-amber-200 rounded-xl bg-amber-50 mb-3">
                  <p className="text-xs font-semibold text-amber-900">
                    No active deans found. Add dean accounts with department/college in{' '}
                    <Link to="/system-administration" className="font-black underline" onClick={onClose}>
                      System Administration
                    </Link>
                    .
                  </p>
                </div>
              )}

              {!staffLoading && deanUsers.length > 0 && !departmentOptions.length && (
                <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                  Deans exist but none have a department set. Update departments in System Administration to assign by college.
                </p>
              )}

              <div className="space-y-3">
                {form.recipients.map((rcp, idx) => renderRecipientFields(rcp, idx))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-8">
            <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-maroon flex-1 justify-center py-2.5" disabled={loading || staffLoading || !deanUsers.length}>
              {loading ? 'Sending…' : 'Send plot schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
