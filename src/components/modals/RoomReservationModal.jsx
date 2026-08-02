import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, Upload, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { APPROVAL_TYPES } from '../../constants/approvalWorkflow';
import { requiresCollege, formatCollegeName } from '../../constants/colleges';
import { subscribeColleges } from '../../services/collegeService';
import { fetchWorkflowLevels } from '../../services/approvalWorkflowService';
import { checkReservationConflict } from '../../services/plotScheduleService';
import { useModal } from '../../hooks/useModal';
import { ModalRenderer } from './ModalProvider';
import LoadingModal from './LoadingModal';
import ApprovalTimeline from '../reservations/ApprovalTimeline';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { COLLECTIONS } from '../../firebase/constants';

const emptyForm = {
  nameOfOrg: '',
  activity: '',
  objectives: '',
  designatedVenue: '',
  dateOfActivity: '',
  timeStart: '',
  timeEnd: '',
  participants: '',
  requestedBy: '',
  contactNumber: '',
  specialRequirements: '',
  college: '',
  requestorSignatureUrl: '',
  signatureUrl: '',
};

function formatContactInput(val) {
  if (!val) return '';
  let str = String(val).trim();
  if (str.startsWith('+63')) {
    str = str.slice(3).trim();
  } else if (str.startsWith('63') && str.length > 10) {
    str = str.slice(2).trim();
  }
  str = str.replace(/\D/g, '');
  if (str.startsWith('0')) {
    return str.slice(0, 11);
  }
  return str.slice(0, 10);
}

function getNormalizedContactNumber(val) {
  const clean = formatContactInput(val);
  if (!clean) return '';
  const digits = clean.startsWith('0') ? clean.slice(1) : clean;
  if (digits.length === 10) {
    return `+63${digits}`;
  }
  return '';
}

function isValidContactNumber(num) {
  return Boolean(getNormalizedContactNumber(num));
}

function getSavedSignature(profileUser) {
  if (!profileUser) return localStorage.getItem('user_saved_signature') || '';
  const userSig = profileUser.signatureUrl || profileUser.signature || profileUser.eSignature || profileUser.digitalSignature;
  if (userSig) return userSig;
  const localUidSig = profileUser.uid ? localStorage.getItem(`user_signature_${profileUser.uid}`) : null;
  if (localUidSig) return localUidSig;
  return localStorage.getItem('user_saved_signature') || '';
}

export default function RoomReservationModal({ onClose, eventType, prefill = {} }) {
  const { addRequest, buildingList } = useApp();
  const { profile } = useAuth();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();

  const userAutoOrg = useMemo(() => {
    return profile?.college || profile?.department || profile?.nameOfOrg || profile?.orgName || profile?.roleLabel || '';
  }, [profile]);

  const initialSignature = useMemo(() => getSavedSignature(profile), [profile]);

  const [form, setForm] = useState({
    ...emptyForm,
    nameOfOrg: userAutoOrg,
    requestedBy: profile?.displayName || profile?.email || '',
    college: profile?.college || profile?.department || userAutoOrg,
    dateFiled: new Date().toLocaleDateString('en-GB'),
    building: prefill.building || '',
    room: prefill.room || '',
    designatedVenue: prefill.designatedVenue || '',
    contactNumber: '',
    requestorSignatureUrl: initialSignature,
    signatureUrl: initialSignature,
  });

  useEffect(() => {
    const savedSig = getSavedSignature(profile);
    if (userAutoOrg || profile || savedSig) {
      setForm((prev) => ({
        ...prev,
        nameOfOrg: userAutoOrg || prev.nameOfOrg,
        college: profile?.college || profile?.department || userAutoOrg || prev.college,
        requestedBy: profile?.displayName || profile?.email || prev.requestedBy,
        requestorSignatureUrl: prev.requestorSignatureUrl || savedSig,
        signatureUrl: prev.signatureUrl || savedSig,
      }));
    }
    // Auto-sync existing localStorage signature to Firestore user profile (one-time migration)
    if (savedSig && profile?.uid) {
      const userRef = doc(db, COLLECTIONS.USERS, profile.uid);
      setDoc(userRef, { signatureUrl: savedSig, updatedAt: serverTimestamp() }, { merge: true })
        .catch((err) => console.warn('Auto-sync signature to Firestore failed:', err));
    }
  }, [userAutoOrg, profile]);

  const handleSignatureFileUpload = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (PNG, JPG, or WEBP).');
      showNotification({
        type: 'warning',
        title: 'Invalid File',
        message: 'Please upload an image file (PNG, JPG, or WEBP).',
        autoCloseMs: 3000,
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Signature image file size must be under 5MB.');
      showNotification({
        type: 'warning',
        title: 'File Too Large',
        message: 'Signature image must be under 5MB.',
        autoCloseMs: 3000,
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      setForm((prev) => ({
        ...prev,
        requestorSignatureUrl: dataUrl,
        signatureUrl: dataUrl,
      }));
      if (profile?.uid) {
        localStorage.setItem(`user_signature_${profile.uid}`, dataUrl);
        // Persist signature to Firestore user profile so approvers can see it
        try {
          const userRef = doc(db, COLLECTIONS.USERS, profile.uid);
          await setDoc(userRef, { signatureUrl: dataUrl, updatedAt: serverTimestamp() }, { merge: true });
        } catch (err) {
          console.warn('Failed to persist signature to user profile:', err);
        }
      }
      localStorage.setItem('user_saved_signature', dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleClearSignature = () => {
    setForm((prev) => ({
      ...prev,
      requestorSignatureUrl: '',
      signatureUrl: '',
    }));
    if (profile?.uid) {
      localStorage.removeItem(`user_signature_${profile.uid}`);
    }
    localStorage.removeItem('user_saved_signature');
  };

  const [colleges, setColleges] = useState([]);
  const [workflowPreview, setWorkflowPreview] = useState([]);
  const [scheduleConflicts, setScheduleConflicts] = useState([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Subscribe to colleges from Firestore
  useEffect(() => {
    return subscribeColleges(
      (data) => setColleges(data),
      (err) => console.error('Error loading colleges:', err)
    );
  }, []);

  // Check for course schedule conflicts when date/time/room changes
  useEffect(() => {
    if (!form.room || !form.dateOfActivity || !form.timeStart || !form.timeEnd) {
      setScheduleConflicts([]);
      return;
    }

    const checkConflicts = async () => {
      setCheckingConflicts(true);
      try {
        const result = await checkReservationConflict(
          form.room,
          form.dateOfActivity,
          form.timeStart,
          form.timeEnd,
          '1' // TODO: Get actual semester from academic calendar
        );
        
        setScheduleConflicts(result.conflicts || []);
      } catch (err) {
        console.error('Error checking conflicts:', err);
        setScheduleConflicts([]);
      } finally {
        setCheckingConflicts(false);
      }
    };

    // Debounce the conflict check
    const timer = setTimeout(checkConflicts, 500);
    return () => clearTimeout(timer);
  }, [form.room, form.dateOfActivity, form.timeStart, form.timeEnd]);

  const selectedBuilding = useMemo(
    () => buildingList.find((b) => b.name === form.building || String(b.id) === String(prefill.buildingId)),
    [buildingList, form.building, prefill.buildingId],
  );

  const roomsInBuilding = useMemo(() => {
    if (prefill.room && prefill.buildingId) {
      return [{ id: prefill.room, floor: prefill.floor, docId: prefill.roomDocId }];
    }
    if (!selectedBuilding) return [];
    return selectedBuilding.floorData.flatMap((f) => f.rooms.map((r) => ({ id: r.id, floor: f.floor, floorId: f.floorId, docId: r.docId, managedBy: r.managedBy, managedByName: r.managedByName })));
  }, [selectedBuilding, prefill]);

  // Resolve target building, floor, and room from buildingList for dynamic workflow preview & submit
  const resolvedTarget = useMemo(() => {
    const targetBuilding = selectedBuilding || buildingList.find((b) => b.name === form.building);
    if (!targetBuilding?.floorData?.length) {
      return { building: targetBuilding, floor: null, room: null };
    }

    for (const f of targetBuilding.floorData) {
      const foundRoom = f.rooms?.find(
        (r) => r.id === form.room || r.docId === prefill.roomDocId || r.name === form.room
      );
      if (foundRoom) {
        return { building: targetBuilding, floor: f, room: foundRoom };
      }
    }
    return { building: targetBuilding, floor: null, room: null };
  }, [selectedBuilding, buildingList, form.building, form.room, prefill.roomDocId]);

  useEffect(() => {
    let cancelled = false;
    
    const loadWorkflowPreview = async () => {
      try {
        const { building: tBuilding, floor: tFloor, room: tRoom } = resolvedTarget;
        
        let roomManager = tRoom?.managedBy || tFloor?.managedBy || prefill.roomManager || null;
        let roomManagerName = tRoom?.managedByName || tFloor?.managedByName || prefill.roomManagerName || null;
        
        // If roomManager is missing but we have buildingId, floorId, roomDocId, fetch from Firestore
        const bId = tBuilding?.id || prefill.buildingId;
        const fId = tFloor?.floorId || prefill.floorId;
        const rId = tRoom?.docId || prefill.roomDocId;
        
        if (!roomManager && bId && fId && rId) {
          try {
            const buildingRef = doc(db, COLLECTIONS.BUILDINGS, String(bId));
            const floorRef = doc(buildingRef, COLLECTIONS.FLOORS, String(fId));
            const roomRef = doc(floorRef, COLLECTIONS.ROOMS, String(rId));
            
            const roomSnap = await getDoc(roomRef);
            if (roomSnap.exists()) {
              const roomData = roomSnap.data();
              roomManager = roomData.managedBy;
              roomManagerName = roomData.managedByName;
              
              if (!roomManager) {
                const floorSnap = await getDoc(floorRef);
                if (floorSnap.exists()) {
                  const floorData = floorSnap.data();
                  roomManager = floorData.managedBy;
                  roomManagerName = floorData.managedByName;
                }
              }
            }
          } catch (e) {
            console.error('Workflow preview manager fetch error:', e);
          }
        }
        
        // Determine which workflow to use
        let workflowType = eventType;
        if (roomManager && roomManagerName) {
          workflowType = eventType === APPROVAL_TYPES.ACADEMIC 
            ? APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC 
            : APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC;
        }
        
        let levels = await fetchWorkflowLevels(workflowType);
        
        if (cancelled) return;
        
        if ((workflowType === APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC || 
             workflowType === APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC) && 
            (!levels || levels.length === 0)) {
          // Fallback if Registrar has not custom-ordered the dean-managed workflow
          levels = eventType === APPROVAL_TYPES.ACADEMIC
            ? [
                { levelNumber: 1, roleId: 'dean', roleLabel: 'College Dean' },
                { levelNumber: 2, roleId: 'gsd', roleLabel: 'GSD' },
                { levelNumber: 3, roleId: 'room-manager-dean', roleLabel: `${roomManagerName} (Room Manager)` },
              ]
            : [
                { levelNumber: 1, roleId: 'student_life', roleLabel: 'Student Life' },
                { levelNumber: 2, roleId: 'gsd', roleLabel: 'GSD' },
                { levelNumber: 3, roleId: 'room-manager-dean', roleLabel: `${roomManagerName} (Room Manager)` },
              ];
        }
        
        // Map levels to preview records
        let previewRecords = levels.map((level, index) => ({
          id: level.id || `preview_${index}`,
          levelNumber: level.levelNumber,
          roleId: level.roleId,
          roleLabel: level.roleLabel,
          status: index === 0 ? 'Pending' : 'Waiting',
        }));
        
        // Replace room-manager-dean placeholder with real manager name
        if (roomManager && roomManagerName) {
          previewRecords = previewRecords.map(record => {
            if (record.roleId === 'room-manager-dean') {
              return {
                ...record,
                roleLabel: `${roomManagerName} (Room Manager)`,
              };
            }
            return record;
          });
        }
        
        setWorkflowPreview(previewRecords);
      } catch (err) {
        console.error('Error loading workflow preview:', err);
        if (!cancelled) setWorkflowPreview([]);
      }
    };
    
    loadWorkflowPreview();
    
    return () => { cancelled = true; };
  }, [eventType, form.building, form.room, prefill, resolvedTarget]);

  const isPrefilledRoom = Boolean(prefill.room && prefill.buildingId);

  const submit = async (draft = false) => {
    const isDraft = draft === true;
    
    setError('');

    const rawOrg = form.nameOfOrg || userAutoOrg || 'General';
    const resolvedOrg = formatCollegeName(rawOrg);
    const resolvedCollege = formatCollegeName(profile?.college || profile?.department || rawOrg);
    const resolvedRequestedBy = profile?.displayName || profile?.email || form.requestedBy || 'Requestor';
    
    if (!form.activity.trim() || !form.dateOfActivity) {
      setError('Activity name and date of activity are required.');
      showNotification({
        type: 'warning',
        title: 'Missing information',
        message: 'Please provide activity name and date of activity.',
        autoCloseMs: 3000,
      });
      return;
    }

    const normalizedContact = getNormalizedContactNumber(form.contactNumber);
    if (!isDraft && !normalizedContact) {
      setError('Contact number must be 10 digits (e.g., 9171234567) or 11 digits starting with 0 (e.g., 09171234567).');
      showNotification({
        type: 'warning',
        title: 'Invalid Contact Number',
        message: 'Contact number must be 10 digits (e.g., 9171234567) or 11 digits starting with 0 (e.g., 09171234567).',
        autoCloseMs: 3000,
      });
      return;
    }
    
    const activeSig = form.requestorSignatureUrl || form.signatureUrl;
    if (!isDraft && !activeSig) {
      setError('Digital E-Signature is required. Please upload your signature.');
      showNotification({
        type: 'warning',
        title: 'Missing Signature',
        message: 'Digital E-Signature is required to submit a reservation request.',
        autoCloseMs: 3000,
      });
      return;
    }
    
    // Check for course schedule conflicts (only for non-draft submissions)
    if (!isDraft && scheduleConflicts.length > 0) {
      setError('This time slot conflicts with existing course schedules.');
      showNotification({
        type: 'error',
        title: 'Schedule conflict',
        message: `Cannot reserve: ${scheduleConflicts.length} course schedule${scheduleConflicts.length > 1 ? 's' : ''} already scheduled at this time.`,
        autoCloseMs: 0,
      });
      return;
    }
    
    if (!isDraft && !workflowPreview.length) {
      setError('No approval workflow configured. Contact the Registrar.');
      showNotification({
        type: 'error',
        title: 'No workflow configured',
        message: 'Contact the Registrar to configure the approval workflow.',
        autoCloseMs: 0,
      });
      return;
    }

    const confirmed = await showConfirm({
      title: isDraft ? 'Save as draft?' : 'Submit reservation?',
      message: isDraft 
        ? 'The reservation will be saved as a draft and can be submitted later.'
        : 'This will submit the room reservation request for approval.',
      confirmText: isDraft ? 'Save Draft' : 'Submit',
      cancelText: 'Cancel',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage(isDraft ? 'Saving draft...' : 'Submitting reservation...');
    setBusy(true);
    try {
      const { building: tBuilding, floor: tFloor, room: tRoom } = resolvedTarget;

      await addRequest(
        {
          type: eventType,
          ...form,
          contactNumber: normalizedContact || form.contactNumber,
          requestorSignatureUrl: activeSig || null,
          signatureUrl: activeSig || null,
          nameOfOrg: resolvedOrg,
          department: resolvedOrg,
          college: resolvedCollege,
          requestedBy: resolvedRequestedBy,
          requestor: resolvedRequestedBy,
          buildingId: tBuilding?.id || prefill.buildingId || null,
          roomId: tRoom?.docId || prefill.roomDocId || null,
          floor: tFloor?.floor ?? prefill.floor ?? null,
          floorId: tFloor?.floorId || prefill.floorId || null,
          customManagerUid: tRoom?.managedBy || tFloor?.managedBy || prefill.roomManager || null,
          customManagerName: tRoom?.managedByName || tFloor?.managedByName || prefill.roomManagerName || null,
          requestorEmail: profile?.email,
          createdByUid: profile?.uid,
        },
        { draft: isDraft },
      );
      
      showNotification({
        type: 'success',
        title: isDraft ? 'Draft saved' : 'Reservation submitted',
        message: isDraft 
          ? 'Your room reservation has been saved as a draft.'
          : 'Your room reservation has been submitted for approval.',
        autoCloseMs: 2000,
      });
      
      onClose();
    } catch (err) {
      const errorMessage = err.message || 'Failed to submit reservation.';
      setError(errorMessage);
      showNotification({
        type: 'error',
        title: isDraft ? 'Save failed' : 'Submit failed',
        message: errorMessage,
        autoCloseMs: 0,
      });
    } finally {
      setBusy(false);
      setIsLoading(false);
    }
  };

  const title = eventType === APPROVAL_TYPES.ACADEMIC ? 'Academic Room Reservation' : 'Non-Academic Room Reservation';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-xl relative flex flex-col"
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-7 pb-4 border-b border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose} className="absolute right-5 top-5 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
          <div className="text-center mb-2">
            <p className="text-sm font-black tracking-widest" style={{ color: '#7A0808' }}>SOUTHWESTERN UNIVERSITY</p>
            <p className="text-xs font-bold tracking-widest" style={{ color: '#7A0808' }}>PHINMA</p>
            <p className="font-bold text-sm mt-1 text-dark">ROOM RESERVATION REQUEST</p>
          </div>
          <div className="flex gap-2 mt-4">
            <div
              className="flex-1 text-center py-2 rounded-lg font-bold text-sm"
              style={{ background: '#7A0808', color: 'white' }}
            >
              {title}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-5">
          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <h3 className="font-bold text-base mb-4 text-dark">Reservation Details</h3>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="col-span-2">
              <label className="form-label">
                Name of Activity <span className="text-red-600">*</span>
              </label>
              <input className="form-input" value={form.activity} onChange={(e) => set('activity', e.target.value)} required />
            </div>
            <div className="col-span-2">
              <label className="form-label">
                Objective of the Activity <span className="text-red-600">*</span>
              </label>
              <textarea className="form-input resize-none" rows={3} value={form.objectives} onChange={(e) => set('objectives', e.target.value)} required />
            </div>
            {!isPrefilledRoom && (
              <>
                <div className="col-span-2">
                  <label className="form-label">
                    Building <span className="text-red-600">*</span>
                  </label>
                  <select
                    className="form-input"
                    value={form.building}
                    onChange={(e) => setForm((f) => ({ ...f, building: e.target.value, room: '', designatedVenue: '' }))}
                    required
                  >
                    <option value="">Select Building</option>
                    {buildingList.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="form-label">
                    Room <span className="text-red-600">*</span>
                  </label>
                  <select
                    className="form-input"
                    value={form.room}
                    onChange={(e) => {
                      const room = roomsInBuilding.find((r) => r.id === e.target.value);
                      setForm((f) => ({
                        ...f,
                        room: e.target.value,
                        designatedVenue: room ? `${e.target.value}, ${f.building} Floor ${room.floor}` : f.designatedVenue,
                      }));
                    }}
                    disabled={!form.building}
                    required
                  >
                    <option value="">{form.building ? 'Select Room' : 'Select building first'}</option>
                    {roomsInBuilding.map((r) => (
                      <option key={r.id} value={r.id}>{`${r.id} (Floor ${r.floor})`}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className="form-label">
                Designated Venue <span className="text-red-600">*</span>
              </label>
              <input
                className="form-input"
                value={form.designatedVenue}
                onChange={(e) => set('designatedVenue', e.target.value)}
                readOnly={isPrefilledRoom}
                style={isPrefilledRoom ? { background: '#f9f9f9' } : undefined}
                required
              />
            </div>
            <div>
              <label className="form-label">
                Date of Activity <span className="text-red-600">*</span>
              </label>
              <input className="form-input" type="date" value={form.dateOfActivity} onChange={(e) => set('dateOfActivity', e.target.value)} required />
            </div>
            <div>
              <label className="form-label">
                Number of Participants <span className="text-red-600">*</span>
              </label>
              <input className="form-input" type="number" value={form.participants} onChange={(e) => set('participants', e.target.value)} required />
            </div>
            <div>
              <label className="form-label">
                Time Start <span className="text-red-600">*</span>
              </label>
              <input className="form-input" type="time" value={form.timeStart} onChange={(e) => set('timeStart', e.target.value)} required />
            </div>
            <div>
              <label className="form-label">
                Time End <span className="text-red-600">*</span>
              </label>
              <input className="form-input" type="time" value={form.timeEnd} onChange={(e) => set('timeEnd', e.target.value)} required />
            </div>
            
            {/* Course Schedule Conflict Warning */}
            {checkingConflicts && (
              <div className="col-span-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-600">Checking for course schedule conflicts...</p>
              </div>
            )}
            
            {!checkingConflicts && scheduleConflicts.length > 0 && (
              <div className="col-span-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-900">
                      Schedule Conflict Detected
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      This time slot conflicts with {scheduleConflicts.length} existing course schedule{scheduleConflicts.length > 1 ? 's' : ''}. 
                      Please choose a different time or room.
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2 max-h-32 overflow-y-auto">
                  {scheduleConflicts.map((conflict, idx) => (
                    <div key={idx} className="bg-white rounded px-3 py-2 text-xs">
                      <p className="font-bold text-red-900">
                        {conflict.title} ({conflict.courseCode})
                      </p>
                      <p className="text-gray-700 mt-0.5">
                        {conflict.section} • {conflict.college}
                      </p>
                      <p className="text-gray-600 mt-0.5">
                        {conflict.dayOfWeek} {conflict.timeStart} - {conflict.timeEnd} • {conflict.instructor}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {!checkingConflicts && scheduleConflicts.length === 0 && form.room && form.dateOfActivity && form.timeStart && form.timeEnd && (
              <div className="col-span-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                <p className="text-xs text-green-700 font-medium">✓ No course schedule conflicts detected</p>
              </div>
            )}
            
            <div className="col-span-2">
              <label className="form-label">
                Contact Number <span className="text-red-600">*</span>
              </label>
              <div className="flex items-stretch rounded-lg overflow-hidden border border-gray-300 focus-within:border-[#7A0808] focus-within:ring-1 focus-within:ring-[#7A0808]">
                <span className="px-3.5 bg-gray-100 border-r border-gray-300 text-xs font-bold text-gray-700 select-none flex items-center justify-center">
                  +63
                </span>
                <input
                  className="w-full px-3 py-2 text-sm bg-white text-gray-800 outline-none border-none"
                  placeholder="9171234567"
                  value={form.contactNumber}
                  onChange={(e) => set('contactNumber', formatContactInput(e.target.value))}
                  required
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Enter 10 digits (e.g. 9171234567). Typing 0 (e.g. 09171234567) is automatically adapted.
              </p>
            </div>
            <div className="col-span-2">
              <label className="form-label">
                Special Requirements <span className="text-xs text-gray-400 font-normal">(Optional)</span>
              </label>
              <textarea className="form-input resize-none" rows={2} value={form.specialRequirements} onChange={(e) => set('specialRequirements', e.target.value)} placeholder="e.g., Audio Visual System, Air Conditioning, Podium" />
            </div>
            <div>
              <label className="form-label">Date Filed</label>
              <input className="form-input" value={form.dateFiled} readOnly style={{ background: '#f9f9f9' }} />
            </div>

            {/* Upload E-Signature Section */}
            <div className="col-span-2 bg-gray-50/90 border border-gray-200 rounded-xl p-4 mt-1">
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0 text-dark font-bold flex items-center gap-1.5">
                  Digital E-Signature <span className="text-red-600">*</span>
                </label>
                {(form.requestorSignatureUrl || form.signatureUrl) && (
                  <span className="text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    ✓ Saved Signature Loaded
                  </span>
                )}
              </div>

              {(form.requestorSignatureUrl || form.signatureUrl) ? (
                <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-28 bg-gray-50 border border-dashed border-gray-300 rounded flex items-center justify-center p-1">
                      <img
                        src={form.requestorSignatureUrl || form.signatureUrl}
                        alt="E-Signature Preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-800">Your E-Signature</p>
                      <p className="text-[11px] text-gray-500">Automatically overprinted on permit</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-xs font-bold text-gray-700 flex items-center gap-1 shadow-sm transition-colors">
                      <Upload size={13} />
                      <span>Change</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => handleSignatureFileUpload(e.target.files?.[0])}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleClearSignature}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove Signature"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleSignatureFileUpload(file);
                  }}
                  className="border-2 border-dashed border-gray-300 hover:border-[#7A0808] bg-white rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center group"
                >
                  <Upload size={22} className="text-gray-400 group-hover:text-[#7A0808] mb-1.5 transition-colors" />
                  <p className="text-xs font-bold text-gray-700 group-hover:text-[#7A0808]">
                    Click to upload or drag & drop E-Signature image
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Make sure background is removed/transparent. PNG, JPG, WEBP accepted (max 5MB).
                  </p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleSignatureFileUpload(e.target.files?.[0])}
                  />
                </label>
              )}
              <p className="text-[11px] text-gray-500 mt-2">
                💡 Saved so you don't need to upload again for future reservations.
              </p>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="font-bold text-base mb-3 text-dark">Approval Workflow Preview</h3>
            <p className="text-xs text-gray-400 mb-3">Configured by the Registrar — only Level 1 will be pending on submit.</p>
            <ApprovalTimeline approvalRecords={workflowPreview} compact />
          </div>
        </div>

        <div className="px-8 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button type="button" onClick={() => submit(true)} disabled={busy} className="btn-outline-maroon flex-1">
            {busy ? 'Saving...' : 'Save as Draft'}
          </button>
          <button type="button" onClick={() => submit(false)} disabled={busy} className="btn-maroon flex-1 justify-center">
            {busy ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
      
      <LoadingModal isOpen={isLoading} message={loadingMessage} />
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
    </div>
  );
}
