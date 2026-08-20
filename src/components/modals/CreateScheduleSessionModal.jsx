import React, { useState, useMemo } from 'react';
import { X, Plus, Trash2, Users, ArrowUp, ArrowDown } from 'lucide-react';
import { getDeanDepartmentOptions } from '../../services/systemUserService';
import CustomSelect from '../ui/CustomSelect';

export default function CreateScheduleSessionModal({
  onClose,
  onSave,
  schoolYears,
  defaultSchoolYearId,
  staffUsers,
  createdBy,
}) {
  const [title, setTitle] = useState('');
  const [schoolYearId, setSchoolYearId] = useState(defaultSchoolYearId || '');
  const [semester, setSemester] = useState('1');
  const [baseCreatorUid, setBaseCreatorUid] = useState('');
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Get dean options from staff users
  const deanOptions = useMemo(() => {
    const departments = getDeanDepartmentOptions(staffUsers);
    return departments.flatMap((dept) =>
      dept.deans.map((dean) => ({
        ...dean,
        collegeName: dept.department,
        tier: dept.tier,
      }))
    );
  }, [staffUsers]);

  const selectedSchoolYear = schoolYears.find((sy) => sy.id === schoolYearId);
  const schoolYearLabel = selectedSchoolYear?.displayLabel || selectedSchoolYear?.label || '';

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

  const selectedBaseCreator = deanOptions.find((d) => d.uid === baseCreatorUid);

  const handleAddParticipant = (deanUid) => {
    if (!deanUid) return;
    
    // Check if already added
    if (participants.some((p) => p.uid === deanUid)) {
      setError('This dean is already in the participants list.');
      return;
    }

    const dean = deanOptions.find((d) => d.uid === deanUid);
    if (!dean) return;

    setParticipants((prev) => [
      ...prev,
      {
        uid: dean.uid,
        name: dean.name,
        email: dean.email,
        college: dean.collegeName,
        department: dean.department,
      },
    ]);
    setError('');
  };

  const handleRemoveParticipant = (uid) => {
    setParticipants((prev) => prev.filter((p) => p.uid !== uid));
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newParticipants = [...participants];
    [newParticipants[index - 1], newParticipants[index]] = [
      newParticipants[index],
      newParticipants[index - 1],
    ];
    setParticipants(newParticipants);
  };

  const handleMoveDown = (index) => {
    if (index === participants.length - 1) return;
    const newParticipants = [...participants];
    [newParticipants[index], newParticipants[index + 1]] = [
      newParticipants[index + 1],
      newParticipants[index],
    ];
    setParticipants(newParticipants);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please enter a session title.');
      return;
    }

    if (!schoolYearId) {
      setError('Please select a school year.');
      return;
    }

    if (!baseCreatorUid) {
      setError('Please select a base template creator.');
      return;
    }

    if (participants.length === 0) {
      setError('Please add at least one participant.');
      return;
    }

    setSaving(true);

    try {
      await onSave({
        title: title.trim(),
        schoolYearId,
        schoolYearLabel,
        semester: Number(semester),
        baseCreatorUid: selectedBaseCreator.uid,
        baseCreatorName: selectedBaseCreator.name,
        baseCreatorEmail: selectedBaseCreator.email,
        baseCreatorCollege: selectedBaseCreator.collegeName,
        participants,
        createdBy,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create session.');
      setSaving(false);
    }
  };

  const availableParticipants = deanOptions.filter(
    (dean) =>
      dean.uid !== baseCreatorUid &&
      !participants.some((p) => p.uid === dean.uid)
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div>
              <h3 className="font-black text-xl" style={{ color: '#2B3235' }}>
                Create Controlled Schedule Session
              </h3>
              <p className="text-xs mt-1 text-gray-500">
                Set up a managed workflow: base template → sequential adoption
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-semibold text-red-700">{error}</p>
              </div>
            )}

            {/* Session Details */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                  Session Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Semester 1 2025-2026 Course Scheduling"
                  className="form-input w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                    School Year <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={schoolYearId}
                    onChange={(e) => setSchoolYearId(e.target.value)}
                    options={schoolYears.map((sy) => ({
                      value: sy.id,
                      label: sy.displayLabel || `SY ${sy.label}`,
                    }))}
                    placeholder="Select school year"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
                    Semester <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    options={semesterOptions}
                    placeholder="Select semester"
                  />
                </div>
              </div>
            </div>

            {/* Base Template Creator */}
            <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center">
                  <Users size={16} className="text-yellow-900" />
                </div>
                <div>
                  <h4 className="font-black text-sm" style={{ color: '#2B3235' }}>
                    Base Template Creator
                  </h4>
                  <p className="text-[10px] text-gray-600">
                    This dean creates the template schedule that others will adopt
                  </p>
                </div>
              </div>

              <CustomSelect
                value={baseCreatorUid}
                onChange={(e) => setBaseCreatorUid(e.target.value)}
                options={deanOptions.map((dean) => ({
                  value: dean.uid,
                  label: `${dean.name} - ${dean.collegeName}`,
                }))}
                placeholder="Select base template creator"
              />
            </div>

            {/* Participants */}
            <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50/50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-black text-sm" style={{ color: '#2B3235' }}>
                    Participants (Adoption Order)
                  </h4>
                  <p className="text-[10px] text-gray-600">
                    Add deans in the order they should input their schedules
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-200 text-blue-900">
                  {participants.length} participant{participants.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Add Participant Dropdown */}
              {availableParticipants.length > 0 && (
                <div className="mb-3">
                  <CustomSelect
                    onChange={(e) => handleAddParticipant(e.target.value)}
                    value=""
                    options={availableParticipants.map((dean) => ({
                      value: dean.uid,
                      label: `${dean.name} - ${dean.collegeName}`,
                    }))}
                    placeholder="+ Add participant..."
                  />
                </div>
              )}

              {/* Participants List */}
              {participants.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <p className="text-xs font-semibold">No participants added yet</p>
                  <p className="text-[10px] mt-1">Select deans from the dropdown above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {participants.map((participant, index) => (
                    <div
                      key={participant.uid}
                      className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3"
                    >
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
                          title="Move up"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === participants.length - 1}
                          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
                          title="Move down"
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                            #{index + 1}
                          </span>
                          <span className="font-bold text-sm" style={{ color: '#2B3235' }}>
                            {participant.name}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {participant.college} · {participant.email}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(participant.uid)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <h5 className="font-bold text-xs mb-2" style={{ color: '#1E40AF' }}>
                📋 How It Works:
              </h5>
              <ol className="text-[11px] space-y-1 text-gray-700 list-decimal list-inside">
                <li>Base creator develops the template schedule</li>
                <li>Registrar reviews and approves the template</li>
                <li>Participants get sequential access in the order listed above</li>
                <li>Each participant can copy the template and customize it</li>
                <li>After completion, all schedules are finalized</li>
              </ol>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-lg text-sm font-bold bg-[#7A0808] text-white hover:bg-[#600000] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Plus size={16} />
              {saving ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
