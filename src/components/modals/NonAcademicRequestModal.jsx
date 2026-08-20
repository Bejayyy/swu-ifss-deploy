import React, { useEffect, useMemo, useState } from 'react';
import { X, Upload, Trash2 } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { COLLECTIONS } from '../../firebase/constants';
import { useApp, defaultNonAcademicSteps } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../hooks/useModal';
import { formatCollegeName } from '../../constants/colleges';
import { ModalRenderer } from './ModalProvider';
import LoadingModal from './LoadingModal';
import DatePicker from '../ui/DatePicker';
import TimePicker from '../ui/TimePicker';
import CustomSelect from '../ui/CustomSelect';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

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
    return `0${digits}`;
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

export default function NonAcademicRequestModal({ onClose }) {
  useBodyScrollLock(true);
  const { addRequest, buildingList } = useApp();
  const { profile } = useAuth();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');
  const userAutoOrg = profile?.college || profile?.department || profile?.nameOfOrg || profile?.orgName || profile?.roleLabel || '';
  const initialSignature = useMemo(() => getSavedSignature(profile), [profile]);

  const [form, setForm] = useState({
    nameOfOrg: userAutoOrg,
    requestedBy: profile?.displayName || profile?.email || '',
    activity: '',
    dateOfActivity: '',
    timeStart: '',
    timeEnd: '',
    participants: '',
    building: '',
    room: '',
    designatedVenue: '',
    objectives: '',
    specialRequirements: '',
    contactNumber: '',
    requestorSignatureUrl: initialSignature,
    signatureUrl: initialSignature,
    dateFiled: new Date().toLocaleDateString('en-GB'),
    utilityUnderMedicine: false,
    approvalSteps: defaultNonAcademicSteps(false),
  });

  useEffect(() => {
    const savedSig = getSavedSignature(profile);
    if (userAutoOrg || profile || savedSig) {
      setForm((prev) => ({
        ...prev,
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
      showNotification({
        type: 'warning',
        title: 'Invalid File',
        message: 'Please upload an image file (PNG, JPG, or WEBP).',
        autoCloseMs: 3000,
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
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

  const handleSubmit = async (draft = false) => {
    const isDraft = draft === true;
    const rawOrg = form.nameOfOrg || userAutoOrg || 'General';
    const resolvedOrg = formatCollegeName(rawOrg);
    const resolvedRequestedBy = profile?.displayName || profile?.name || profile?.email || form.requestedBy || 'Requestor';
    
    // Validate required fields for submission
    if (!isDraft && !form.activity.trim()) {
      showNotification({
        type: 'warning',
        title: 'Missing Activity Name',
        message: 'Please provide the name of the activity.',
        autoCloseMs: 3000,
      });
      return;
    }

    if (!isDraft && (!form.dateOfActivity || !form.timeStart || !form.timeEnd)) {
      showNotification({
        type: 'warning',
        title: 'Missing Date or Time',
        message: 'Please specify the Date of Activity, Start Time, and End Time.',
        autoCloseMs: 3000,
      });
      return;
    }

    if (!isDraft && (!form.building || !form.room)) {
      showNotification({
        type: 'warning',
        title: 'Missing Venue',
        message: 'Please select both Building and Room.',
        autoCloseMs: 3000,
      });
      return;
    }

    const normalizedContact = getNormalizedContactNumber(form.contactNumber);
    if (!isDraft && !normalizedContact) {
      showNotification({
        type: 'warning',
        title: 'Invalid Contact Number',
        message: 'Contact number must be 10 digits (e.g. 9171234567) or 11 digits starting with 0 (e.g. 09171234567).',
        autoCloseMs: 3000,
      });
      return;
    }

    const activeSig = form.requestorSignatureUrl || form.signatureUrl;
    if (!isDraft && !activeSig) {
      showNotification({
        type: 'warning',
        title: 'Missing Signature',
        message: 'Digital E-Signature is required to submit a request.',
        autoCloseMs: 3000,
      });
      return;
    }

    const confirmed = await showConfirm({
      title: isDraft ? 'Save as draft?' : 'Submit Non-Academic Request?',
      message: isDraft 
        ? 'The request will be saved as a draft and can be submitted later.'
        : 'This will submit the non-academic request for approval.',
      confirmText: isDraft ? 'Save Draft' : 'Submit Request',
      cancelText: 'Cancel',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage(isDraft ? 'Saving non-academic draft...' : 'Submitting non-academic request...');

    try {
      await addRequest(
        {
          type: 'non-academic',
          title: form.activity,
          department: resolvedOrg,
          nameOfOrg: resolvedOrg,
          requestedBy: resolvedRequestedBy,
          requestor: resolvedRequestedBy,
          requestorEmail: profile?.email || '',
          createdByUid: profile?.uid || '',
          ...form,
          buildingId: selectedBuilding?.id || null,
          roomId: selectedRoomObj?.docId || selectedRoomObj?.id || form.room || null,
          floor: selectedRoomObj?.floor ?? null,
          floorId: selectedRoomObj?.floorId || null,
          contactNumber: normalizedContact || form.contactNumber,
          requestorSignatureUrl: activeSig || null,
          signatureUrl: activeSig || null,
          college: profile?.college || profile?.department || resolvedOrg,
          status: isDraft ? 'Draft' : 'Pending',
        },
        { draft: isDraft }
      );
      
      setIsLoading(false);
      showNotification({
        type: 'success',
        title: isDraft ? 'Draft Saved Successfully' : 'Submit Successful!',
        message: isDraft 
          ? 'Your non-academic request has been saved as a draft.'
          : 'Your non-academic request has been submitted for approval.',
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
        <div className="px-8 pt-7 pb-4 border-b border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="absolute right-5 top-5 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
          <div className="text-center mb-2">
            <p className="text-sm font-black tracking-widest" style={{ color: '#7A0808' }}>SOUTHWESTERN UNIVERSITY</p>
            <p className="text-xs font-bold tracking-widest" style={{ color: '#7A0808' }}>PHINMA</p>
            <p className="font-bold text-sm mt-1 text-dark">ON-CAMPUS ACTIVITY PERMIT</p>
          </div>
          <div className="flex gap-2 mt-4">
            <div className="flex-1 text-center py-2 rounded-lg font-bold text-sm cursor-default" style={{ background: '#7A0808', color: 'white' }}>Non-Academic</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-5">
          <div className="bg-red-50/40 rounded-xl p-4 mb-5">
            <h4 className="font-bold text-xs uppercase tracking-wider mb-1" style={{ color: '#7A0808' }}>Procedure:</h4>
            <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
              <li>Secure a permit from the Student Life Office.</li>
              <li>Make sure all entries are completely filled out.</li>
              <li>Permit must be filed One (1) week before the scheduled date.</li>
            </ol>
          </div>

          <h3 className="font-bold text-base mb-4 text-dark">Requestor's Information</h3>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="col-span-2">
              <label className="form-label">
                Name of Activity <span className="text-red-600">*</span>
              </label>
              <input className="form-input" placeholder="Activity name" value={form.activity} onChange={e => set('activity', e.target.value)} required />
            </div>
            <div>
              <label className="form-label">
                Date of Activity <span className="text-red-600">*</span>
              </label>
              <DatePicker value={form.dateOfActivity} onChange={val => set('dateOfActivity', val)} required />
            </div>
            <div>
              <label className="form-label">
                No. of Participants <span className="text-red-600">*</span>
              </label>
              <input className="form-input" type="number" placeholder="e.g., 100" value={form.participants} onChange={e => set('participants', e.target.value)} required />
            </div>
            <div>
              <label className="form-label">
                Time Start <span className="text-red-600">*</span>
              </label>
              <TimePicker value={form.timeStart} onChange={(val) => set('timeStart', val)} required />
            </div>
            <div>
              <label className="form-label">
                Time End <span className="text-red-600">*</span>
              </label>
              <TimePicker value={form.timeEnd} onChange={(val) => set('timeEnd', val)} required />
            </div>
            <div className="col-span-2">
              <label className="form-label">
                Building <span className="text-red-600">*</span>
              </label>
              <CustomSelect
                value={form.building}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) => ({ ...f, building: value, room: '', designatedVenue: '' }));
                }}
                options={buildingList.map((b) => ({ value: b.name, label: b.name }))}
                placeholder="Select Building"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="form-label">
                Room <span className="text-red-600">*</span>
              </label>
              <CustomSelect
                value={form.room}
                onChange={(e) => {
                  const selectedRoom = roomsInSelectedBuilding.find((r) => r.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    room: e.target.value,
                    designatedVenue: selectedRoom ? `${e.target.value}, ${f.building} Floor ${selectedRoom.floor}` : '',
                  }));
                }}
                options={roomsInSelectedBuilding.map((r) => ({
                  value: r.id,
                  label: `${r.id} (Floor ${r.floor})`,
                }))}
                disabled={!form.building}
                placeholder={form.building ? 'Select Room' : 'Select building first'}
                required
              />
            </div>
            <div className="col-span-2">
              <label className="form-label">
                Designated Venue <span className="text-red-600">*</span>
              </label>
              <input className="form-input" placeholder="e.g., Gymnasium, Main Campus" value={form.designatedVenue} onChange={e => set('designatedVenue', e.target.value)} required />
            </div>
            <div className="col-span-2">
              <label className="form-label">
                Objectives of the Activity <span className="text-red-600">*</span>
              </label>
              <textarea className="form-input resize-none" rows={3} placeholder="Describe the objectives..." value={form.objectives} onChange={e => set('objectives', e.target.value)} required />
            </div>
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
              <textarea className="form-input resize-none" rows={2} placeholder="e.g., Sound system, stage, etc." value={form.specialRequirements} onChange={e => set('specialRequirements', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer" style={{ color: '#2B3235' }}>
                <input
                  type="checkbox"
                  checked={form.utilityUnderMedicine}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((f) => ({
                      ...f,
                      utilityUnderMedicine: checked,
                      approvalSteps: defaultNonAcademicSteps(checked),
                    }));
                  }}
                  className="accent-[#7A0808]"
                />
                Utility is under Medicine (adds Medicine approver before GSD)
              </label>
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

          {/* Approval Steps Preview */}
          <div className="mb-4">
            <h3 className="font-bold text-base mb-3 text-dark">Approval Signatories</h3>
            <p className="text-xs text-gray-400 mb-3">The following officials must sign this permit for approval.</p>
            <div className="space-y-2">
              {form.approvalSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black" style={{ background: '#7A0808', color: 'white' }}>{i+1}</div>
                  <div>
                    <p className="text-xs font-bold text-dark">{step.role}</p>
                    <p className="text-[11px] text-gray-400">Pending signature</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

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
