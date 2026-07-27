import React, { useState } from 'react';
import { CheckCircle, XCircle, Upload, Trash2, FileSignature } from 'lucide-react';
import { RESERVATION_STATUS, isReservationActionable } from '../../constants/approvalWorkflow';
import { useModal } from '../../hooks/useModal';
import { ModalRenderer } from '../modals/ModalProvider';
import LoadingModal from '../modals/LoadingModal';

export default function ReservationApprovalActions({
  reservation,
  profile,
  onApprove,
  onReject,
}) {
  const [remarks, setRemarks] = useState('');
  const [signatureUrl, setSignatureUrl] = useState(profile?.signatureUrl || '');
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();

  const canAct = isReservationActionable(reservation, profile?.role, profile);
  const isTerminal = [RESERVATION_STATUS.APPROVED, RESERVATION_STATUS.REJECTED].includes(reservation?.status);

  if (isTerminal || !canAct) return null;

  const handleSignatureUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Signature file must be under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSignatureUrl(ev.target?.result || '');
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleApprove = async () => {
    const confirmed = await showConfirm({
      title: 'Approve reservation?',
      message: 'This will approve the room reservation request and attach your signature to this workflow step.',
      confirmText: 'Approve',
      cancelText: 'Cancel',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Approving reservation...');
    setBusy(true);
    setError('');
    try {
      await onApprove({ remarks, signatureUrl });
      showNotification({
        type: 'success',
        title: 'Reservation approved',
        message: 'The reservation has been approved successfully.',
        autoCloseMs: 2000,
      });
      setRemarks('');
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
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!showReject) {
      setShowReject(true);
      return;
    }
    if (!remarks.trim()) {
      setError('Provide a reason for rejection.');
      showNotification({
        type: 'warning',
        title: 'Reason required',
        message: 'Please provide a reason for rejecting this request.',
        autoCloseMs: 3000,
      });
      return;
    }

    const confirmed = await showConfirm({
      title: 'Reject reservation?',
      message: 'This will reject the room reservation request. The requestor will be notified.',
      confirmText: 'Reject',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Rejecting reservation...');
    setBusy(true);
    setError('');
    try {
      await onReject({ remarks });
      showNotification({
        type: 'success',
        title: 'Reservation rejected',
        message: 'The reservation has been rejected.',
        autoCloseMs: 2000,
      });
      setRemarks('');
      setShowReject(false);
    } catch (err) {
      const errorMessage = err.message || 'Unable to reject request.';
      setError(errorMessage);
      showNotification({
        type: 'error',
        title: 'Rejection failed',
        message: errorMessage,
        autoCloseMs: 0,
      });
    } finally {
      setBusy(false);
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
        <h3 className="font-bold text-sm" style={{ color: '#2B3235' }}>Approval Actions</h3>
        
        {/* Approver Signature Upload */}
        <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#7A0808' }}>
              <FileSignature size={14} /> Approver Signature
            </span>
            {signatureUrl && (
              <button
                type="button"
                onClick={() => setSignatureUrl('')}
                className="text-[11px] font-bold text-red-600 hover:underline flex items-center gap-1"
              >
                <Trash2 size={12} /> Remove
              </button>
            )}
          </div>

          {signatureUrl ? (
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex items-center justify-center">
              <img src={signatureUrl} alt="Signature Preview" className="max-h-16 object-contain" />
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 border border-dashed border-gray-300 bg-white rounded-lg p-3 cursor-pointer hover:border-[#7A0808] transition-colors">
              <Upload size={14} className="text-gray-400" />
              <span className="text-xs text-gray-600 font-semibold">Upload Digital Signature (PNG/JPG)</span>
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                className="hidden"
                onChange={handleSignatureUpload}
              />
            </label>
          )}
          <p className="text-[10px] text-gray-400">
            This signature will be printed on the official permit document upon approval.
          </p>
        </div>

        <textarea
          className="form-input resize-none text-xs"
          rows={3}
          placeholder={showReject ? 'Reason for rejection (required)' : 'Remarks (optional)'}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
        {error && (
          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleApprove}
          disabled={busy}
          className="btn-maroon w-full justify-center py-2.5 rounded-xl text-sm"
        >
          <CheckCircle size={16} /> {busy ? 'Processing...' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border-2 transition-all"
          style={{ borderColor: '#991B1B', color: '#991B1B' }}
        >
          <XCircle size={16} /> {showReject ? (busy ? 'Processing...' : 'Confirm Reject') : 'Reject'}
        </button>
      </div>
      
      <LoadingModal isOpen={isLoading} message={loadingMessage} />
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
    </>
  );
}
