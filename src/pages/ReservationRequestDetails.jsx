import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Edit3, MapPin, Upload, Trash2, CheckCircle, FileText, Check, Clock, X, AlertTriangle } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { fetchRoomReservation } from '../services/reservationService';
import { RESERVATION_STATUS, isReservationActionable } from '../constants/approvalWorkflow';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useModal } from '../hooks/useModal';
import { ModalRenderer } from '../components/modals/ModalProvider';
import LoadingModal from '../components/modals/LoadingModal';
import { formatCollegeName } from '../constants/colleges';

function formatReadableDate(dateInput) {
  if (!dateInput) return '—';
  const str = String(dateInput).trim();
  if (!str) return '—';

  if (/^[A-Z][a-z]+\s+\d{1,2},\s+\d{4}$/.test(str)) {
    return str;
  }

  let d;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const parts = str.split('/');
    let month = parseInt(parts[0], 10);
    let day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (month > 12) {
      const temp = month;
      month = day;
      day = temp;
    }
    d = new Date(year, month - 1, day);
  } else {
    d = new Date(str.includes('T') ? str : `${str}T00:00:00`);
  }

  if (isNaN(d.getTime())) return str;

  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSingleTime(timeStr) {
  if (!timeStr) return '';
  const s = String(timeStr).trim();
  if (!s) return '';
  if (/am|pm/i.test(s)) return s.toUpperCase();

  const parts = s.split(':');
  if (parts.length < 2) return s;

  let hours = parseInt(parts[0], 10);
  const minutes = parts[1].padStart(2, '0');
  if (isNaN(hours)) return s;

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  const formattedHours = String(hours).padStart(2, '0');
  return `${formattedHours}:${minutes} ${ampm}`;
}

function formatReadableTimeRange(timeStart, timeEnd) {
  if (!timeStart && !timeEnd) return '—';
  if (timeStart && timeEnd) {
    const formattedStart = formatSingleTime(timeStart);
    const formattedEnd = formatSingleTime(timeEnd);
    return `${formattedStart} - ${formattedEnd}`;
  }
  return formatSingleTime(timeStart || timeEnd);
}

function getSavedSignature(profileUser) {
  if (profileUser) {
    const userSig = profileUser.signatureUrl || profileUser.signature || profileUser.eSignature || profileUser.digitalSignature;
    if (userSig) return userSig;
    const localUidSig = profileUser.uid ? localStorage.getItem(`user_signature_${profileUser.uid}`) : null;
    if (localUidSig) return localUidSig;
  }
  return localStorage.getItem('user_saved_signature') || '';
}

export default function ReservationRequestDetails({ defaultType = 'non-academic' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const { requests, approveReservation } = useApp();
  const { profile } = useAuth();
  const { canManageBuildings } = useRolePermissions();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();

  const fromState = state?.request;
  const fromList = requests.find((r) => String(r.id) === String(id));
  const [request, setRequest] = useState(fromState || fromList || null);
  const [loading, setLoading] = useState(!fromState && !fromList);

  // Digital Signature Card state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [adminPrintedName, setAdminPrintedName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isLoadingModal, setIsLoadingModal] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');
  const [isDragging, setIsDragging] = useState(false);
  const [fetchedSignatures, setFetchedSignatures] = useState({});

  useEffect(() => {
    if (fromState || fromList) {
      setRequest(fromState || fromList);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchRoomReservation(id)
      .then((data) => {
        if (!cancelled) {
          setRequest(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, fromState, fromList]);

  // Fetch missing signatures for requestor and approvers from Firestore users collection
  useEffect(() => {
    if (!request) return;
    let isMounted = true;

    async function loadSignatures() {
      const sigs = {};
      const uids = new Set();

      if (request.createdByUid) uids.add(request.createdByUid);

      const records = request.approvalRecords || request.approvalSteps || [];
      records.forEach((r) => {
        if (r.approvedByUid) uids.add(r.approvedByUid);
      });

      for (const uid of uids) {
        try {
          const userRef = doc(db, COLLECTIONS.USERS || 'users', uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const uData = userSnap.data();
            const userSig = uData.signatureUrl || uData.signature || uData.eSignature || uData.digitalSignature;
            if (userSig) {
              sigs[uid] = userSig;
            }
          }
        } catch (err) {
          console.warn('Error fetching signature for uid:', uid, err);
        }
      }

      if (isMounted && Object.keys(sigs).length > 0) {
        setFetchedSignatures(sigs);
      }
    }

    loadSignatures();

    return () => {
      isMounted = false;
    };
  }, [request]);

  useEffect(() => {
    if (profile) {
      if (!adminPrintedName) {
        setAdminPrintedName(profile.displayName || profile.name || '');
      }
      const saved = getSavedSignature(profile);
      if (saved && !signatureUrl) {
        setSignatureUrl(saved);
      }
      // Auto-sync existing localStorage signature to Firestore user profile
      if (saved && profile.uid) {
        const userRef = doc(db, COLLECTIONS.USERS, profile.uid);
        setDoc(userRef, { signatureUrl: saved, updatedAt: serverTimestamp() }, { merge: true })
          .catch((err) => console.warn('Auto-sync signature to Firestore failed:', err));
      }
    }
  }, [profile]);

  if (loading) {
    return (
      <Layout title="Reservation Details">
        <p className="text-sm text-gray-500 py-12 text-center">Loading reservation…</p>
      </Layout>
    );
  }

  if (!request || (defaultType && request.type !== defaultType)) {
    return (
      <Layout title="Reservation Details" subtitle="Request not found">
        <button type="button" className="btn-maroon text-sm" onClick={() => navigate('/approvals')}>
          Back to approvals
        </button>
      </Layout>
    );
  }

  const approvalRecords = request.approvalRecords || request.approvalSteps || [];
  const isAcademic = request.type === 'academic';
  const subtitle = isAcademic ? 'Academic · Room Reservation' : 'Non-Academic · Room Reservation';

  const canAct = isReservationActionable(request, profile?.role, profile);
  const isTerminal = [RESERVATION_STATUS.APPROVED, RESERVATION_STATUS.REJECTED].includes(request?.status);

  const step1Rec = approvalRecords.find((r) => r.roleId === 'dean' || r.roleId === 'room-manager-dean' || r.roleId === 'department-head') || approvalRecords[0] || null;
  const isStep1Role = profile?.role === 'dean' || profile?.role === 'room-manager-dean' || profile?.role === 'department-head';

  const step2Rec = approvalRecords.find((r) => r.roleId === 'gsd') || approvalRecords[1] || null;
  const isStep2Role = profile?.role === 'gsd';

  const step3Rec = approvalRecords.find((r) => r.roleId === 'student-life' || r.roleId === 'registrar' || r.roleId === 'sfo') || approvalRecords[2] || approvalRecords[approvalRecords.length - 1] || null;
  const isStep3Role = profile?.role === 'student-life' || profile?.role === 'registrar' || profile?.role === 'sfo';

  const activeUserSig = signatureUrl || getSavedSignature(profile);

  const getStepSignature = (stepRec, isRoleMatch) => {
    if (!stepRec) return isRoleMatch ? activeUserSig : null;
    if (stepRec.signatureUrl) return stepRec.signatureUrl;
    if (stepRec.approvedByUid && fetchedSignatures[stepRec.approvedByUid]) {
      return fetchedSignatures[stepRec.approvedByUid];
    }
    if (stepRec.approvedByUid && profile?.uid === stepRec.approvedByUid) {
      return activeUserSig || null;
    }
    if (isRoleMatch && (stepRec.status === 'Pending' || stepRec.status === 'Approved')) {
      return activeUserSig || null;
    }
    return null;
  };

  const resolvePersonName = (approvedByName, isRoleMatch, fallbackDefault = '') => {
    const isGenericRole = !approvedByName || ['Dean', 'GSD', 'GSD Head', 'Registrar', 'Student Life', 'SFO', 'Approver', 'Registrar Office', 'GSD HEAD', 'GENERAL SERVICES HEAD', 'COLLEGE DEAN'].includes(String(approvedByName).trim());
    if (!isGenericRole) return approvedByName;
    if (isRoleMatch && (adminPrintedName || profile?.displayName || profile?.name)) {
      return adminPrintedName || profile?.displayName || profile?.name;
    }
    return fallbackDefault;
  };

  const isRequestor = profile?.uid === request.createdByUid || profile?.email === request.createdByEmail;
  const reqSig =
    request.requestorSignatureUrl ||
    request.signatureUrl ||
    (request.createdByUid ? fetchedSignatures[request.createdByUid] : null) ||
    (isRequestor ? activeUserSig : null);
  const reqName = request.requestedBy || request.requestor || (isRequestor ? (adminPrintedName || profile?.displayName || profile?.name) : 'Requestor');

  const step1Sig = getStepSignature(step1Rec, isStep1Role);
  const step1Name = resolvePersonName(step1Rec?.approvedByName, isStep1Role, step1Rec?.status === 'Approved' ? (step1Rec.approvedByName || '') : '');

  const step2Sig = getStepSignature(step2Rec, isStep2Role);
  const step2Name = resolvePersonName(step2Rec?.approvedByName, isStep2Role, step2Rec?.status === 'Approved' ? (step2Rec.approvedByName || '') : '');

  const step3Sig = getStepSignature(step3Rec, isStep3Role);
  const step3Name = resolvePersonName(step3Rec?.approvedByName, isStep3Role, step3Rec?.status === 'Approved' ? (step3Rec.approvedByName || '') : '');

  const handleSignatureFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (PNG, JPG, WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Signature file must be under 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result || '';
      setSignatureUrl(dataUrl);
      setError('');
      if (profile?.uid) {
        localStorage.setItem(`user_signature_${profile.uid}`, dataUrl);
        // Persist signature to Firestore user profile so all viewers can see it
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
    setSignatureUrl('');
    if (profile?.uid) {
      localStorage.removeItem(`user_signature_${profile.uid}`);
    }
    localStorage.removeItem('user_saved_signature');
  };

  const handleApproveConfirm = async () => {
    const confirmed = await showConfirm({
      title: 'Approve & Confirm Reservation?',
      message: 'This will approve the room reservation request and embed your digital signature onto the permit document.',
      confirmText: 'Approve & Confirm',
      cancelText: 'Cancel',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsLoadingModal(true);
    setLoadingMessage('Approving reservation...');
    setBusy(true);
    setError('');
    try {
      await approveReservation(request.id, {
        action: 'approve',
        remarks,
        approverUid: profile.uid,
        approverName: adminPrintedName || profile.displayName || profile.email,
        approverRole: profile.role,
        signatureUrl,
      });
      showNotification({
        type: 'success',
        title: 'Reservation Approved',
        message: 'The permit has been signed and approved.',
        autoCloseMs: 2000,
      });
      navigate('/approvals');
    } catch (err) {
      const errorMessage = err.message || 'Unable to approve request.';
      setError(errorMessage);
      showNotification({
        type: 'error',
        title: 'Approval failed',
        message: errorMessage,
        autoCloseMs: 0,
      });
    } finally {
      setBusy(false);
      setIsLoadingModal(false);
    }
  };

  const handleRequestModification = async () => {
    if (!remarks.trim()) {
      setError('Please provide a reason or remarks for rejecting this reservation request.');
      return;
    }

    const confirmed = await showConfirm({
      title: 'Reject Request?',
      message: 'This will reject the room reservation request and notify the requestor.',
      confirmText: 'Reject Request',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoadingModal(true);
    setLoadingMessage('Rejecting reservation...');
    setBusy(true);
    setError('');
    try {
      await approveReservation(request.id, {
        action: 'reject',
        remarks,
        approverUid: profile.uid,
        approverName: adminPrintedName || profile.displayName || profile.email,
        approverRole: profile.role,
      });
      showNotification({
        type: 'success',
        title: 'Reservation Rejected',
        message: 'The reservation request has been rejected.',
        autoCloseMs: 2000,
      });
      navigate('/approvals');
    } catch (err) {
      const errorMessage = err.message || 'Unable to reject request.';
      setError(errorMessage);
      showNotification({
        type: 'error',
        title: 'Action failed',
        message: errorMessage,
        autoCloseMs: 0,
      });
    } finally {
      setBusy(false);
      setIsLoadingModal(false);
    }
  };

  const requirementsList = typeof request.specialRequirements === 'string'
    ? request.specialRequirements.split(',').map((s) => s.trim()).filter(Boolean)
    : Array.isArray(request.specialRequirements)
    ? request.specialRequirements
    : ['Audio Visual System', 'Air Conditioning', 'Podium'];

  return (
    <Layout title="Room Reservation" subtitle={subtitle}>
      <style>{`
        .permit-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 32px;
        }

        @media print {
          @page {
            size: letter portrait;
            margin: 5mm 8mm;
          }
          html, body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          header, nav, footer, .print\\:hidden, button, a {
            display: none !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-permit, #printable-permit * {
            visibility: visible !important;
          }
          #printable-permit img {
            visibility: visible !important;
            display: block !important;
            opacity: 1 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #printable-permit {
            position: absolute !important;
            left: 0 !important;
            right: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 auto !important;
            box-sizing: border-box !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            transform: scale(0.92);
            transform-origin: top center;
          }
          .permit-grid-2 {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            column-gap: 28px !important;
            row-gap: 6px !important;
          }
        }
      `}</style>

      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-xs font-bold transition-colors"
          style={{ color: '#2B3235' }}
        >
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 shadow-sm hover:bg-gray-100 transition-colors">
            <ArrowLeft size={15} />
            <span className="font-bold">Back</span>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-outline-maroon text-xs flex items-center gap-2 rounded-xl px-4 py-2"
          >
            <Printer size={15} /> Print Permit
          </button>
          {canManageBuildings() && (
            <button
              type="button"
              onClick={() => navigate(`/building/${request.buildingId}`)}
              className="btn-maroon text-xs flex items-center gap-2 rounded-xl px-4 py-2"
            >
              <Edit3 size={15} /> Edit Permit
            </button>
          )}
        </div>
      </div>

      {/* Rejection / Modification Remarks Banner */}
      {(request.rejectReason || request.approvalRecords?.some((r) => (r.status === 'rejected' || r.status === 'cancelled') && r.remarks)) && (
        <div className="max-w-4xl mx-auto mb-6 print:hidden">
          <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-5 shadow-2xs space-y-2">
            <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
              <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
              <span>Modification Required / Rejection Reason</span>
            </div>
            <p className="text-xs font-semibold text-red-800 leading-relaxed pl-6">
              {request.rejectReason || request.approvalRecords?.find((r) => (r.status === 'rejected' || r.status === 'cancelled') && r.remarks)?.remarks}
            </p>
          </div>
        </div>
      )}

      {/* TOP HORIZONTAL APPROVAL PROGRESS BAR */}
      <div className="max-w-4xl mx-auto mb-6 print:hidden">
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="font-black text-base text-dark">Approval Progress</h3>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-md text-white" style={{ background: '#7A0808' }}>
              {isAcademic ? 'Academic Request' : 'Non-Academic Request'}
            </span>
          </div>

          <div className="relative pt-2 pb-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
              {[
                {
                  label: 'Requestor',
                  status: request.status === 'Draft' ? 'PENDING REVIEW' : 'APPROVED',
                  active: true,
                  name: request.requestedBy || request.requestor,
                },
                ...approvalRecords.map((rec) => {
                  let statusText = 'AWAITING PREVIOUS';
                  if (rec.status === 'Approved') statusText = 'APPROVED';
                  else if (rec.status === 'Pending') statusText = 'PENDING REVIEW';
                  else if (rec.status === 'Rejected') statusText = 'REJECTED';
                  else if (rec.status === 'Cancelled') statusText = 'CANCELLED';

                  return {
                    label: rec.roleLabel || rec.roleId,
                    status: statusText,
                    active: rec.status === 'Pending' || rec.status === 'Approved',
                    name: rec.approvedByName,
                  };
                }),
              ].map((st, i, arr) => {
                const isApproved = st.status === 'APPROVED';
                const isPending = st.status === 'PENDING REVIEW';
                const isRejected = st.status === 'REJECTED';

                return (
                  <div key={i} className="flex flex-col items-center text-center space-y-2 relative group">
                    {/* Connecting horizontal line for desktop */}
                    {i < arr.length - 1 && (
                      <div className="hidden sm:block absolute left-[50%] right-[-50%] top-4 h-0.5 bg-gray-100 -z-0" />
                    )}

                    {/* Circular Badge Node Icon */}
                    <div className="flex-shrink-0 relative z-10">
                      {isApproved ? (
                        <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-2xs ring-4 ring-emerald-100/80 transition-all">
                          <Check size={16} strokeWidth={3} />
                        </div>
                      ) : isPending ? (
                        <div className="w-8 h-8 rounded-full bg-amber-400 text-white flex items-center justify-center shadow-2xs ring-4 ring-amber-100 transition-all">
                          <Clock size={15} strokeWidth={2.5} />
                        </div>
                      ) : isRejected ? (
                        <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xs ring-4 ring-red-100 transition-all">
                          <X size={15} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-200 text-gray-300 flex items-center justify-center transition-all">
                          <Clock size={15} strokeWidth={2} />
                        </div>
                      )}
                    </div>

                    {/* Labels */}
                    <div className="space-y-0.5">
                      <p className={`text-xs font-bold leading-snug ${st.active ? 'text-dark' : 'text-gray-400'}`}>
                        {st.label} {st.name ? <span className="text-gray-500 font-normal block text-[11px]">({st.name})</span> : ''}
                      </p>
                      <p className={`text-[10px] font-extrabold tracking-wider uppercase ${
                        isApproved ? 'text-emerald-600' : isPending ? 'text-amber-600 font-black' : isRejected ? 'text-red-600' : 'text-gray-400'
                      }`}>
                        {st.status}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Permit Document Container */}
      <div className="max-w-4xl mx-auto space-y-6">
        <div id="printable-permit" className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm font-sans space-y-3.5">
          {/* Header */}
          <div className="text-center pb-2">
            <h1 className="text-2xl font-black tracking-wide" style={{ color: '#7A0808' }}>SOUTHWESTERN UNIVERSITY</h1>
            <h2 className="text-sm font-bold tracking-widest -mt-0.5" style={{ color: '#7A0808' }}>PHINMA</h2>
            <h3 className="font-extrabold text-sm mt-3 text-dark tracking-wider uppercase">ON-CAMPUS ACTIVITY PERMIT</h3>
          </div>

          {/* Procedure */}
          <div className="text-xs text-gray-800 space-y-1">
            <p className="font-extrabold text-xs text-dark">Procedure:</p>
            <p className="text-gray-700 leading-tight">1. Secure a permit from the Student Life Office. Make sure all entries are completely filled out.</p>
            <p className="text-gray-700 leading-tight">2. Permit must be filed One (1) week before the scheduled date of the proposed activity.</p>
          </div>

          {/* Requestor's Information */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-sm text-dark">Requestor's Information</h4>
            <div className="permit-grid-2 text-xs">
              <div className="space-y-3">
                <div>
                  <span className="font-bold text-gray-700 block">Name of Organization/College/Department:</span>
                  <span className="font-semibold text-gray-900 border-b border-gray-200 block pb-0.5 mt-0.5">{formatCollegeName(request.college || request.nameOfOrg || request.department) || '—'}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700 block">Name of Activity:</span>
                  <span className="font-semibold text-gray-900 border-b border-gray-200 block pb-0.5 mt-0.5">{request.activity || request.title || '—'}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700 block">Objective of the Activity:</span>
                  <span className="font-semibold text-gray-900 border-b border-gray-200 block pb-0.5 mt-0.5">{request.objectives || '—'}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="font-bold text-gray-700 block">Date of Activity: <span className="font-semibold text-gray-900">{formatReadableDate(request.dateOfActivity || request.dateStart || request.dateField)}</span></span>
                </div>
                <div>
                  <span className="font-bold text-gray-700 block">Time of Activity: <span className="font-semibold text-gray-900">{formatReadableTimeRange(request.timeStart, request.timeEnd)}</span></span>
                </div>
                <div>
                  <span className="font-bold text-gray-700 block">No. of Participants: <span className="font-semibold text-gray-900">{request.participants || '—'}</span></span>
                </div>
                <div>
                  <span className="font-bold text-gray-700 block">Requested by: <span className="font-semibold text-gray-900">{request.requestedBy || request.requestor || '—'}</span></span>
                </div>
                <div>
                  <span className="font-bold text-gray-700 block">Contact Number: <span className="font-semibold text-gray-900">{request.contactNumber || '—'}</span></span>
                </div>
                <div>
                  <span className="font-bold text-gray-700 block">Date Field: <span className="font-semibold text-gray-900">{formatReadableDate(request.dateFiled || request.createdAt)}</span></span>
                </div>
              </div>
            </div>

            {/* Designated Venue & Special Requirements */}
            <div className="permit-grid-2 pt-2 text-xs border-t border-gray-100">
              <div>
                <span className="font-bold text-gray-700 block mb-1">Designated Venue</span>
                <span className="flex items-center gap-1.5 font-semibold text-dark">
                  <MapPin size={14} className="text-red-700 flex-shrink-0" />
                  {request.designatedVenue || request.specificVenue || '—'}
                </span>
              </div>
              <div>
                <span className="font-bold text-gray-700 block mb-1">Special Requirements</span>
                <div className="flex flex-wrap gap-1.5">
                  {requirementsList.map((req, i) => (
                    <span key={i} className="px-2.5 py-0.5 rounded-md bg-gray-100 text-gray-700 text-[10px] font-semibold border border-gray-200">
                      {req}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Workflow Approval Boxes */}
          <div className="space-y-3 pt-1">
            {/* Step 1 Box */}
            <div className="border border-gray-400 rounded-xl p-3.5 bg-white">
              <h5 className="font-bold text-xs text-dark mb-3">Step 1: Noted By:</h5>
              <div className="grid grid-cols-2 gap-8 text-center items-end">
                {/* Requestor */}
                <div className="flex flex-col items-center justify-end min-h-[55px] relative">
                  {reqSig ? (
                    <div className="flex flex-col items-center">
                      <img
                        src={reqSig}
                        alt="Requestor Signature"
                        className="h-10 object-contain -mb-2.5 z-10 relative"
                      />
                      <p className="font-bold text-xs uppercase text-dark -mb-0.5">{reqName || request.requestedBy || request.requestor || '—'}</p>
                    </div>
                  ) : (
                    <p className="font-bold text-xs uppercase text-dark mb-1">{reqName || request.requestedBy || request.requestor || '—'}</p>
                  )}
                  <div className="w-full border-t border-gray-400 pt-1">
                    <span className="text-[8.5px] font-extrabold uppercase tracking-tight text-gray-600 block whitespace-nowrap">NAME & SIGNATURE OF REQUESTOR</span>
                  </div>
                </div>

                {/* Step 1 Approver (Dean/Adviser) */}
                <div className="flex flex-col items-center justify-end min-h-[55px] relative">
                  {step1Sig ? (
                    <div className="flex flex-col items-center">
                      <img
                        src={step1Sig}
                        alt="Dean Signature"
                        className="h-10 object-contain -mb-2.5 z-10 relative"
                      />
                      <p className="font-bold text-xs uppercase text-dark -mb-0.5">{step1Name || '____________________'}</p>
                    </div>
                  ) : (
                    <p className="font-bold text-xs uppercase text-dark mb-1">{step1Name || '____________________'}</p>
                  )}
                  <div className="w-full border-t border-gray-400 pt-1">
                    <span className="text-[8.5px] font-extrabold uppercase tracking-tight text-gray-600 block whitespace-nowrap">COLLEGE DEAN / DEPARTMENT HEAD / ORG ADVISER</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 Box */}
            <div className="border border-gray-400 rounded-xl p-3.5 bg-white">
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-bold text-xs text-dark">Step 2: Approve Use & Availability of Venue</h5>
                <span className="text-[10px] font-semibold text-gray-600">Date: {step2Rec?.approvedAt ? formatReadableDate(step2Rec.approvedAt) : '________________'}</span>
              </div>
              <div className="flex flex-col items-center justify-end min-h-[55px] max-w-sm mx-auto text-center relative">
                {step2Sig ? (
                  <div className="flex flex-col items-center">
                    <img
                      src={step2Sig}
                      alt="Venue Manager Signature"
                      className="h-10 object-contain -mb-2.5 z-10 relative"
                    />
                    <p className="font-bold text-xs uppercase text-dark -mb-0.5">{step2Name || '____________________'}</p>
                  </div>
                ) : (
                  <p className="font-bold text-xs uppercase text-dark mb-1">{step2Name || '____________________'}</p>
                )}
                <div className="w-full border-t border-gray-400 pt-1">
                  <span className="text-[8.5px] font-extrabold uppercase tracking-tight text-gray-600 block whitespace-nowrap">GENERAL SERVICES DEPARTMENT HEAD</span>
                </div>
              </div>
            </div>

            {/* Step 3 Box */}
            <div className="border border-gray-400 rounded-xl p-3.5 bg-white">
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-bold text-xs text-dark">Step 3: Conduct of Activity Approval</h5>
                <span className="text-[10px] font-semibold text-gray-600">Date: {step3Rec?.approvedAt ? formatReadableDate(step3Rec.approvedAt) : '________________'}</span>
              </div>
              <div className="flex flex-col items-center justify-end min-h-[55px] max-w-sm mx-auto text-center relative">
                {step3Sig ? (
                  <div className="flex flex-col items-center">
                    <img
                      src={step3Sig}
                      alt="SFO Signature"
                      className="h-10 object-contain -mb-2.5 z-10 relative"
                    />
                    <p className="font-bold text-xs uppercase text-dark -mb-0.5">{step3Name || '____________________'}</p>
                  </div>
                ) : (
                  <p className="font-bold text-xs uppercase text-dark mb-1">{step3Name || '____________________'}</p>
                )}
                <div className="w-full border-t border-gray-400 pt-1">
                  <span className="text-[8.5px] font-extrabold uppercase tracking-tight text-gray-600 block whitespace-nowrap">Student Formation Officer</span>
                </div>
              </div>
            </div>
          </div>

          {/* Note Displayed Below the Bottom Line of Step 3 Box */}
          <p className="text-[9px] italic text-gray-600 leading-tight pt-1.5 px-1">
            After the Student Formation Officer's approval, please provide two (2) photocopies of this permit: one for your personal copy, one for the General Services Department. Lastly, submit the original copy to the Student Life Office.
          </p>
        </div>

        {/* Bottom Card: Apply Digital Signature */}
        <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm space-y-6 print:hidden">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="font-black text-lg text-dark">Apply Digital Signature</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Provide your printed name and digital signature to validate and authorize this permit document.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Left Panel: Admin Printed Name & Action Buttons */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                  ADMIN PRINTED NAME <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  className="form-input text-xs rounded-xl py-2.5 px-3.5 border-gray-200 w-full focus:ring-2 focus:ring-[#7A0808]/20 focus:border-[#7A0808]"
                  value={adminPrintedName}
                  onChange={(e) => setAdminPrintedName(e.target.value)}
                  placeholder="e.g. DEAN MARCUS STERLING"
                />
                <p className="text-[11px] text-gray-400">
                  This name will be overprinted on the permit above your designated role line.
                </p>
              </div>

              {/* Remarks / Reason for Rejection Textarea - Shown ONLY when rejecting */}
              {showRejectForm && (
                <div className="space-y-1.5 p-3.5 bg-red-50/80 border border-red-200 rounded-2xl animate-fade-in">
                  <label className="text-xs font-bold text-red-900 uppercase tracking-wider block">
                    REMARKS / REASON FOR REJECTION <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    rows={3}
                    className="form-input text-xs rounded-xl py-2.5 px-3.5 border-red-300 w-full focus:ring-2 focus:ring-red-500/20 focus:border-red-600 bg-white"
                    value={remarks}
                    onChange={(e) => {
                      setRemarks(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Enter specific reasons or feedback for rejecting this request..."
                    autoFocus
                  />
                  <p className="text-[11px] text-red-700 font-medium">
                    Provide specific comments or reasons for rejecting this request.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
                  {error}
                </p>
              )}

              {/* Action Buttons */}
              {canAct && !isTerminal && (
                <div className="space-y-2.5 pt-2">
                  {!showRejectForm ? (
                    <>
                      <button
                        type="button"
                        onClick={handleApproveConfirm}
                        disabled={busy}
                        className="btn-maroon w-full justify-center py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm"
                      >
                        {busy ? 'Processing…' : 'APPROVE & CONFIRM'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowRejectForm(true);
                          setError('');
                        }}
                        disabled={busy}
                        className="w-full flex items-center justify-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-red-600 text-red-700 hover:bg-red-50 transition-colors"
                      >
                        REJECT REQUEST
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleRequestModification}
                        disabled={busy}
                        className="w-full flex items-center justify-center py-3 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-700 text-white hover:bg-red-800 transition-colors shadow-sm"
                      >
                        {busy ? 'Processing…' : 'CONFIRM REJECT REQUEST'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowRejectForm(false);
                          setError('');
                        }}
                        disabled={busy}
                        className="w-full flex items-center justify-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        CANCEL
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Right Panel: E-Signature Upload / Dropzone */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                DIGITAL E-SIGNATURE IMAGE
              </label>

              {signatureUrl ? (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center relative space-y-3">
                  <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs w-full flex items-center justify-center min-h-[85px]">
                    <img src={signatureUrl} alt="E-Signature Preview" className="h-16 object-contain" />
                  </div>
                  <div className="flex items-center gap-4 pt-0.5">
                    <label className="text-xs font-bold text-[#7A0808] hover:underline cursor-pointer flex items-center gap-1.5">
                      <Edit3 size={14} /> Change Signature
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        className="hidden"
                        onChange={(e) => handleSignatureFile(e.target.files?.[0])}
                      />
                    </label>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={handleClearSignature}
                      className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1.5"
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium text-center">
                    Saved signature will automatically overprint above your name on future requests.
                  </p>
                </div>
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(true);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    const file = e.dataTransfer?.files?.[0];
                    if (file) handleSignatureFile(file);
                  }}
                  className={`border-2 border-dashed ${
                    isDragging ? 'border-[#7A0808] bg-red-50/40 ring-4 ring-red-100' : 'border-gray-300 hover:border-[#7A0808] bg-gray-50/60'
                  } rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all text-center space-y-2`}
                >
                  <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[#7A0808] shadow-2xs">
                    <Upload size={20} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
                      DROP E-SIGNATURE FILE HERE
                    </span>
                    <span className="text-[11px] text-gray-500 mt-0.5 block">or click to browse from device</span>
                  </div>

                  <div className="pt-2 border-t border-gray-200/80 w-full space-y-1.5 text-center">
                    <p className="text-[10.5px] font-semibold text-gray-600">
                      Accepted formats: <span className="font-bold text-gray-800">PNG, JPG, WEBP</span> (Max 5MB)
                    </p>
                    <div className="bg-amber-50 border border-amber-200/80 rounded-lg p-2 text-left">
                      <p className="text-[10.5px] font-bold text-amber-800 flex items-start gap-1">
                        <span>⚠️</span>
                        <span>Note: Please ensure the background of your signature image is removed / transparent (PNG recommended) for best print results.</span>
                      </p>
                    </div>
                  </div>

                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    className="hidden"
                    onChange={(e) => handleSignatureFile(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      </div>

      <LoadingModal isOpen={isLoadingModal} message={loadingMessage} />
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
    </Layout>
  );
}
