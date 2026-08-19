import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../hooks/useModal';
import { ModalRenderer } from './ModalProvider';
import LoadingModal from './LoadingModal';
import DatePicker from '../ui/DatePicker';
import TimePicker from '../ui/TimePicker';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

const academicTypes = [
  { value: 'room-reservation', label: 'Room Reservation', fields: ['courseCode','courseDesc','instructor','semester','numStudents'] },
  { value: 'lab-access', label: 'Lab Access', fields: ['courseCode','courseDesc','instructor','semester','numStudents','labRequirements'] },
  { value: 'exam-room', label: 'Exam Room', fields: ['courseCode','courseDesc','instructor','semester','numStudents','examDate'] },
  { value: 'make-up-class', label: 'Make-up Class', fields: ['courseCode','courseDesc','instructor','semester','numStudents','reason'] },
  { value: 'special-class', label: 'Special Class', fields: ['courseCode','courseDesc','instructor','semester','numStudents','objectives'] },
];

export default function AcademicRequestModal({ onClose }) {
  useBodyScrollLock(true);
  const { addRequest, buildingList } = useApp();
  const { profile } = useAuth();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');
  const [form, setForm] = useState({
    reqType: '', courseCode: '', courseDesc: '', instructor: '', semester: '',
    numStudents: '', building: '', floor: '', room: '', dateOfActivity: '', dateField: '', timeStart: '', timeEnd: '',
    specificVenue: '', dateFiled: new Date().toLocaleDateString('en-GB'), labRequirements: '',
    examDate: '', reason: '', objectives: '',
  });

  const selectedType = academicTypes.find(t => t.value === form.reqType);
  const selectedBuilding = useMemo(
    () => buildingList.find((b) => b.name === form.building),
    [buildingList, form.building]
  );
  const roomsInSelectedBuilding = useMemo(() => {
    if (!selectedBuilding) return [];
    return selectedBuilding.floorData.flatMap((f) =>
      f.rooms.map((r) => ({ id: r.id, docId: r.docId || r.id, floor: f.floor, floorId: f.floorId }))
    );
  }, [selectedBuilding]);

  const selectedRoomObj = useMemo(() => {
    if (!roomsInSelectedBuilding.length || !form.room) return null;
    return roomsInSelectedBuilding.find((r) => r.id === form.room);
  }, [roomsInSelectedBuilding, form.room]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (draft = false) => {
    const isDraft = draft === true;
    const actDate = form.dateOfActivity || form.dateField;
    
    // Validate required fields for submission
    if (!isDraft) {
      if (!form.reqType) {
        showNotification({
          type: 'warning',
          title: 'Missing Request Type',
          message: 'Please select the type of academic request.',
          autoCloseMs: 3000,
        });
        return;
      }
      if (!form.courseCode.trim() || !form.courseDesc.trim()) {
        showNotification({
          type: 'warning',
          title: 'Missing Course Information',
          message: 'Please fill in both Course Code and Course Description.',
          autoCloseMs: 3000,
        });
        return;
      }
      if (!form.building || !form.room) {
        showNotification({
          type: 'warning',
          title: 'Missing Venue',
          message: 'Please select a Building and Room for the activity.',
          autoCloseMs: 3000,
        });
        return;
      }
      if (!actDate) {
        showNotification({
          type: 'warning',
          title: 'Missing Activity Date',
          message: 'Please select the Date of Activity.',
          autoCloseMs: 3000,
        });
        return;
      }
      if (!form.timeStart || !form.timeEnd) {
        showNotification({
          type: 'warning',
          title: 'Missing Activity Times',
          message: 'Please specify both Start Time and End Time for the activity.',
          autoCloseMs: 3000,
        });
        return;
      }
    }

    const confirmed = await showConfirm({
      title: isDraft ? 'Save as draft?' : 'Submit Academic Request?',
      message: isDraft 
        ? 'The request will be saved as a draft and can be submitted later.'
        : 'This will submit the academic request for approval.',
      confirmText: isDraft ? 'Save Draft' : 'Submit Request',
      cancelText: 'Cancel',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage(isDraft ? 'Saving academic draft...' : 'Submitting academic request...');

    try {
      const reqTitle = `${selectedType?.label || 'Academic Request'}: ${form.courseCode ? form.courseCode + ' - ' : ''}${form.courseDesc || 'Untitled Course'}`;
      const userDisplayName = profile?.displayName || profile?.name || profile?.email || 'Academic Requestor';
      const userDepartment = profile?.department || profile?.college || 'Academic Department';

      await addRequest(
        {
          type: 'academic',
          title: reqTitle,
          activity: reqTitle,
          ...form,
          dateOfActivity: actDate,
          requestedBy: userDisplayName,
          requestor: userDisplayName,
          requestorEmail: profile?.email || '',
          createdByUid: profile?.uid || '',
          department: userDepartment,
          nameOfOrg: userDepartment,
          college: profile?.college || profile?.department || '',
          buildingId: selectedBuilding?.id || null,
          roomId: selectedRoomObj?.docId || selectedRoomObj?.id || form.room || null,
          floor: selectedRoomObj?.floor ?? (form.floor ? parseInt(form.floor) : null),
          floorId: selectedRoomObj?.floorId || null,
          status: isDraft ? 'Draft' : 'Pending',
        },
        { draft: isDraft }
      );
      
      setIsLoading(false);
      showNotification({
        type: 'success',
        title: isDraft ? 'Draft Saved Successfully' : 'Submit Successful!',
        message: isDraft 
          ? 'Your academic request has been saved as a draft.'
          : 'Your academic request has been submitted for approval.',
        autoCloseMs: 2500,
      });
      
      setTimeout(() => {
        onClose();
      }, 2200);
    } catch (error) {
      setIsLoading(false);
      showNotification({
        type: 'error',
        title: isDraft ? 'Save Failed' : 'Submission Failed',
        message: error.message || 'An error occurred while submitting your request. Please check details and try again.',
        autoCloseMs: 0,
      });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl relative flex flex-col" style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-8 pt-7 pb-4 border-b border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="absolute right-5 top-5 text-gray-400 hover:text-gray-700"><X size={20} /></button>
          <div className="text-center mb-2">
            <p className="text-sm font-black tracking-widest" style={{ color: '#7A0808' }}>SOUTHWESTERN UNIVERSITY</p>
            <p className="text-xs font-bold tracking-widest" style={{ color: '#7A0808' }}>PHINMA</p>
            <p className="font-bold text-sm mt-1 text-dark">ON-CAMPUS ACTIVITY PERMIT</p>
          </div>

          {/* Request Type Tabs */}
          <div className="flex gap-2 mt-4">
            <div className="flex-1 text-center py-2 rounded-lg font-bold text-sm cursor-default" style={{ background: '#7A0808', color: 'white' }}>Academic</div>
          </div>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-8 py-5">
          {/* Type of Request */}
          <div className="mb-5">
            <h3 className="font-bold text-base mb-3 text-dark">Request Type</h3>
            <div>
              <label className="form-label">Type of Request <span className="text-red-500">*</span></label>
              <select className="form-input" value={form.reqType} onChange={e => set('reqType', e.target.value)}>
                <option value="">Select type of academic request</option>
                {academicTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* General Information */}
          {form.reqType && (
            <>
              <div className="mb-5">
                <h3 className="font-bold text-base mb-3 text-dark">General Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Course Code</label>
                    <input className="form-input" placeholder="e.g., BIO-101" value={form.courseCode} onChange={e => set('courseCode', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Course Description</label>
                    <input className="form-input" placeholder="Course name" value={form.courseDesc} onChange={e => set('courseDesc', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Instructor Name</label>
                    <input className="form-input" placeholder="Full name" value={form.instructor} onChange={e => set('instructor', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Semester</label>
                    <select className="form-input" value={form.semester} onChange={e => set('semester', e.target.value)}>
                      <option value="">Select semester</option>
                      <option>1st Semester</option>
                      <option>2nd Semester</option>
                      <option>Summer</option>
                      <option>Midyear</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="form-label">Number of Students</label>
                    <input className="form-input" type="number" placeholder="e.g., 30" value={form.numStudents} onChange={e => set('numStudents', e.target.value)} />
                  </div>

                  {/* Conditional fields */}
                  {selectedType?.fields.includes('labRequirements') && (
                    <div className="col-span-2">
                      <label className="form-label">Lab Requirements / Equipment Needed</label>
                      <textarea className="form-input resize-none" rows={2} value={form.labRequirements} onChange={e => set('labRequirements', e.target.value)} />
                    </div>
                  )}
                  {selectedType?.fields.includes('examDate') && (
                    <div className="col-span-2">
                      <label className="form-label">Exam Date</label>
                            <DatePicker value={form.examDate} onChange={val => set('examDate', val)} />
                    </div>
                  )}
                  {selectedType?.fields.includes('reason') && (
                    <div className="col-span-2">
                      <label className="form-label">Reason for Make-up Class</label>
                      <textarea className="form-input resize-none" rows={2} value={form.reason} onChange={e => set('reason', e.target.value)} />
                    </div>
                  )}
                  {selectedType?.fields.includes('objectives') && (
                    <div className="col-span-2">
                      <label className="form-label">Objectives</label>
                      <textarea className="form-input resize-none" rows={2} value={form.objectives} onChange={e => set('objectives', e.target.value)} />
                    </div>
                  )}
                </div>
              </div>

              {/* Venue & Schedule */}
              <div className="mb-5">
                <h3 className="font-bold text-base mb-3 text-dark">Venue & Schedule</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Building</label>
                    <select
                      className="form-input"
                      value={form.building}
                      onChange={(e) => {
                        const value = e.target.value;
                        setForm((f) => ({ ...f, building: value, floor: '', room: '' }));
                      }}
                    >
                      <option value="">Select Building</option>
                      {buildingList.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Floor & Room</label>
                    <select
                      className="form-input"
                      value={form.room}
                      onChange={(e) => {
                        const selectedRoom = roomsInSelectedBuilding.find((r) => r.id === e.target.value);
                        setForm((f) => ({
                          ...f,
                          room: e.target.value,
                          floor: selectedRoom ? `Floor ${selectedRoom.floor}` : '',
                        }));
                      }}
                      disabled={!form.building}
                    >
                      <option value="">{form.building ? 'Select Room' : 'Select building first'}</option>
                      {roomsInSelectedBuilding.map((r) => (
                        <option key={r.id} value={r.id}>{`${r.id} (Floor ${r.floor})`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Date of Activity</label>
                                        <DatePicker value={form.dateField} onChange={val => set('dateField', val)} />
                  </div>
                  <div>
                    <label className="form-label">Time of Activity</label>
                    <div className="flex items-center gap-2">
                      <TimePicker value={form.timeStart} onChange={val => set('timeStart', val)} />
                      <span className="text-xs font-semibold text-gray-400">To</span>
                      <TimePicker value={form.timeEnd} onChange={val => set('timeEnd', val)} />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="form-label">Specific Venue Details</label>
                    <textarea className="form-input resize-none" rows={2} placeholder="Additional details" value={form.specificVenue} onChange={e => set('specificVenue', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Date of Filed</label>
                    <input className="form-input" value={new Date().toLocaleDateString()} readOnly style={{ background: '#f9f9f9' }} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={() => handleSubmit(true)} className="btn-outline-maroon flex-1">Save as Draft</button>
          <button onClick={() => handleSubmit(false)} className="btn-maroon flex-1 justify-center">Submit Request</button>
        </div>
      </div>
      
      <LoadingModal isOpen={isLoading} message={loadingMessage} />
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
    </div>
  );
}
