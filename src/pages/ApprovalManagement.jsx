import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ClipboardList, Clock, CheckCircle, XCircle, MoreVertical, MapPin, Users, Calendar, Trash2, Eye, ChevronLeft, ChevronRight, CheckSquare, Plus } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useModal } from '../hooks/useModal';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import ProgressStatCards from '../components/ProgressStatCards';
import { CategoryFilterTabs, StatusFilterRow } from '../components/FilterControls';
import { buildApprovalFlowLabel, RESERVATION_STATUS, APPROVAL_RECORD_STATUS, isReservationActionable, filterReservationsForRole, getApproverSpecificStatus, getActivePendingRecord } from '../constants/approvalWorkflow';

import { ModalRenderer } from '../components/modals/ModalProvider';
import LoadingModal from '../components/modals/LoadingModal';
import DatePicker from '../components/ui/DatePicker';
import CustomSelect from '../components/ui/CustomSelect';
import { formatCollegeName } from '../constants/colleges';
import { deleteRoomReservation } from '../services/reservationService';

function formatReadableDate(dateInput) {
  if (!dateInput) return '—';
  const str = String(dateInput).trim();
  if (!str) return '—';
  if (/^[A-Z][a-z]+\s+\d{1,2},\s+\d{4}$/.test(str)) return str;

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
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatReadableTimeRange(timeStart, timeEnd) {
  if (!timeStart) return '—';
  const formatTime = (t) => {
    if (!t) return '';
    const parts = String(t).split(':');
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1] || '00';
    if (isNaN(hours)) return t;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  };
  const startStr = formatTime(timeStart);
  const endStr = formatTime(timeEnd);
  return endStr ? `${startStr} - ${endStr}` : startStr;
}

export default function ApprovalManagement() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { requests, requestsLoading, buildingList = [] } = useApp();
  const { profile } = useAuth();

  const handleNavigateToRoom = (req) => {
    if (!req) return;

    const rawRoomId = req.roomId || req.designatedVenueId || req.venueId || req.roomCode;
    let targetRoom = null;
    let targetBuildingId = req.buildingId;
    let targetBuildingName = req.buildingName || '';
    let targetFloor = req.floor || 1;
    let targetFloorId = req.floorId;

    const venueClean = String(req.designatedVenue || req.specificVenue || req.venue || '').trim();

    if (buildingList && buildingList.length > 0) {
      for (const b of buildingList) {
        for (const f of b.floorData || []) {
          for (const r of f.rooms || []) {
            const rId = String(r.id || '').toLowerCase();
            const rCode = String(r.roomCode || r.code || r.name || '').toLowerCase();
            const rNumber = String(r.number || '').toLowerCase();
            const targetStr = String(rawRoomId || '').toLowerCase();
            const vStr = venueClean.toLowerCase();

            if (
              (targetStr && (rId === targetStr || rCode === targetStr)) ||
              (vStr && (vStr.includes(rCode) || vStr.includes(rNumber) || rCode.includes(vStr)))
            ) {
              targetRoom = r;
              targetBuildingId = b.id;
              targetBuildingName = b.name;
              targetFloor = f.floor;
              targetFloorId = f.floorId;
              break;
            }
          }
          if (targetRoom) break;
        }
        if (targetRoom) break;
      }
    }

    if (targetRoom) {
      navigate(`/room/${targetRoom.id || targetRoom.roomCode}`, {
        state: {
          room: targetRoom,
          buildingId: targetBuildingId,
          buildingName: targetBuildingName,
          floor: targetFloor,
          floorId: targetFloorId,
        },
      });
    } else if (rawRoomId) {
      navigate(`/room/${rawRoomId}`);
    } else {
      const isAcademic = req.type === 'academic' || req.reservationType === 'academic';
      navigate(isAcademic ? `/academic-request/${req.id}` : `/request/${req.id}`);
    }
  };
  const {
    role,
    roleLabel,
    canSubmitReservation,
    canEndorseActivity,
    canManageRoomActivityApproval,
    canManageStudentActivityApproval,
    canApproveAny,
    isRegistrar,
  } = useRolePermissions();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();
  const { startNewReservation, modals: reservationModals } = useRoomReservationFlow();

  const hasApprovalPermission = isRegistrar || (typeof canApproveAny === 'function' ? canApproveAny() : false);

  const initialTab = state?.tab || 'academic';
  const initialSection = (!hasApprovalPermission || state?.section === 'my-requests') ? 'my-requests' : (state?.section || 'approvals');

  const [tab, setTab] = useState(initialTab);
  const [filter, setFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');
  const [showSection, setShowSection] = useState(initialSection);
  const [selectedRequestIds, setSelectedRequestIds] = useState([]);

  useEffect(() => {
    setSelectedRequestIds([]);
  }, [showSection, tab, filter, dateFrom, dateTo, searchQuery]);

  useEffect(() => {
    if (!hasApprovalPermission && showSection !== 'my-requests') {
      setShowSection('my-requests');
    }
  }, [hasApprovalPermission, showSection]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const actionableRoleRequests = useMemo(() => {
    if (!hasApprovalPermission || !requests?.length || !profile || !role) return [];
    return filterReservationsForRole(requests, role, profile);
  }, [hasApprovalPermission, requests, role, profile]);

  const myRequests = useMemo(() => {
    if (!requests?.length || !profile) return [];
    return requests.filter((r) => {
      const userUid = profile.uid;
      const userEmail = (profile.email || '').toLowerCase();
      return (
        r.createdByUid === userUid ||
        (r.requestorEmail && r.requestorEmail.toLowerCase() === userEmail) ||
        (r.createdByEmail && r.createdByEmail.toLowerCase() === userEmail)
      );
    });
  }, [requests, profile]);

  const activeCategoryRequests = (hasApprovalPermission && showSection === 'approvals') ? actionableRoleRequests : myRequests;

  const academicReqs = useMemo(
    () => activeCategoryRequests.filter((r) => r.type === 'academic'),
    [activeCategoryRequests],
  );
  const nonAcademicReqs = useMemo(
    () => activeCategoryRequests.filter((r) => r.type === 'non-academic'),
    [activeCategoryRequests],
  );

  const filteredRequests = useMemo(() => {
    return activeCategoryRequests.filter((r) => {
      const typeMatch = tab === 'academic' ? r.type === 'academic' : r.type === 'non-academic';

      const effectiveStatus = (hasApprovalPermission && showSection === 'approvals')
        ? getApproverSpecificStatus(r, role, profile)
        : r.status;

      const statusMatch =
        filter === 'All' ||
        effectiveStatus === filter ||
        (filter === 'Pending' && (effectiveStatus === 'Pending' || effectiveStatus === 'In Progress' || effectiveStatus === 'Draft'));

      let dateMatch = true;
      if (dateFrom || dateTo) {
        const activityDate = r.dateOfActivity || r.dateStart || r.dateField || '';
        if (activityDate) {
          const parts = activityDate.split('/');
          const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : activityDate;
          if (dateFrom && isoDate < dateFrom) dateMatch = false;
          if (dateTo && isoDate > dateTo) dateMatch = false;
        }
      }

      let searchMatch = true;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        searchMatch =
          (r.title || r.activity || '').toLowerCase().includes(query) ||
          (r.department || r.nameOfOrg || '').toLowerCase().includes(query) ||
          (r.requestor || r.requestedBy || '').toLowerCase().includes(query) ||
          (r.venue || r.designatedVenue || r.specificVenue || '').toLowerCase().includes(query);
      }

      return typeMatch && statusMatch && dateMatch && searchMatch;
    });
  }, [activeCategoryRequests, tab, filter, dateFrom, dateTo, searchQuery, hasApprovalPermission, showSection, role, profile]);

  useEffect(() => {
    setCurrentPage(1);
  }, [tab, filter, dateFrom, dateTo, searchQuery, showSection]);

  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage) || 1;

  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRequests.slice(start, start + itemsPerPage);
  }, [filteredRequests, currentPage, itemsPerPage]);

  const startIndex = filteredRequests.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, filteredRequests.length);

  const counts = useMemo(() => {
    if (hasApprovalPermission && showSection === 'approvals') {
      let pendingCount = 0;
      let approvedCount = 0;
      let rejectedCount = 0;

      activeCategoryRequests.forEach((r) => {
        const st = getApproverSpecificStatus(r, role, profile);
        if (st === 'Approved') approvedCount += 1;
        else if (st === 'Rejected') rejectedCount += 1;
        else pendingCount += 1;
      });

      return {
        total: activeCategoryRequests.length,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      };
    }

    return {
      total: activeCategoryRequests.length,
      pending: activeCategoryRequests.filter((r) => r.status === 'Pending' || r.status === 'In Progress' || r.status === 'Draft').length,
      approved: activeCategoryRequests.filter((r) => r.status === 'Approved').length,
      rejected: activeCategoryRequests.filter((r) => r.status === 'Rejected').length,
    };
  }, [activeCategoryRequests, hasApprovalPermission, showSection, role, profile]);

  const stats = [
    { label: 'Total Requests', value: counts.total, icon: ClipboardList, accent: 'total' },
    { label: 'Pending Action', value: counts.pending, icon: Clock, accent: 'pending' },
    { label: 'Approved', value: counts.approved, icon: CheckCircle, accent: 'approved' },
    { label: 'Rejected', value: counts.rejected, icon: XCircle, accent: 'rejected' },
  ];

  const handleDeleteReservation = async (reservation) => {
    const canDelete = isRegistrar || reservation.createdByUid === profile?.uid;

    if (!canDelete) {
      showNotification({
        type: 'warning',
        title: 'Not authorized',
        message: 'You can only delete your own reservations.',
        autoCloseMs: 3000,
      });
      return;
    }

    const confirmed = await showConfirm({
      title: 'Delete reservation?',
      message: `Are you sure you want to delete "${reservation.title || reservation.activity}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Deleting reservation...');

    try {
      await deleteRoomReservation(reservation.id);
      showNotification({
        type: 'success',
        title: 'Reservation deleted',
        message: 'The reservation has been deleted successfully.',
        autoCloseMs: 2000,
      });
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Delete failed',
        message: error.message || 'Failed to delete reservation.',
        autoCloseMs: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deletableRequests = useMemo(() => {
    return filteredRequests.filter((r) => isRegistrar || r.createdByUid === profile?.uid);
  }, [filteredRequests, isRegistrar, profile]);

  const isAllSelected =
    deletableRequests.length > 0 &&
    deletableRequests.every((r) => selectedRequestIds.includes(r.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRequestIds([]);
    } else {
      setSelectedRequestIds(deletableRequests.map((r) => r.id));
    }
  };

  const toggleSelectRequest = (id) => {
    setSelectedRequestIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedRequestIds.length === 0) return;

    const confirmed = await showConfirm({
      title: 'Delete selected requests?',
      message: `Are you sure you want to delete ${selectedRequestIds.length} selected request(s)? This action cannot be undone.`,
      confirmText: 'Delete All',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage(`Deleting ${selectedRequestIds.length} request(s)...`);

    try {
      await Promise.all(selectedRequestIds.map((id) => deleteRoomReservation(id)));
      showNotification({
        type: 'success',
        title: 'Requests deleted',
        message: `Successfully deleted ${selectedRequestIds.length} request(s).`,
        autoCloseMs: 2500,
      });
      setSelectedRequestIds([]);
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Delete failed',
        message: error.message || 'Failed to delete some requests.',
        autoCloseMs: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const subtitle = (hasApprovalPermission && showSection === 'approvals')
    ? 'Requests requiring your role signature'
    : 'Track your submitted room reservation requests';

  return (
    <Layout title="Approval Management" subtitle={subtitle}>
      <div className="mb-6">
        <ProgressStatCards items={stats} />
      </div>

      {/* Section Toggle & Create Request Button Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {hasApprovalPermission ? (
          <div className="inline-flex p-1 bg-white rounded-2xl border border-gray-200 shadow-2xs gap-1 items-center">
            <button
              type="button"
              onClick={() => {
                setShowSection('approvals');
                setFilter('All');
              }}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
                showSection === 'approvals'
                  ? 'bg-[#7A0808] text-white shadow-2xs'
                  : 'bg-transparent text-gray-700 hover:bg-gray-100/70'
              }`}
            >
              <span>Requests to Approve</span>
              <span className="min-w-[20px] h-[20px] px-1.5 rounded-lg bg-[#F59E0B] text-white font-black text-[10px] inline-flex items-center justify-center leading-none shadow-2xs">
                {actionableRoleRequests.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSection('my-requests');
                setFilter('All');
              }}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
                showSection === 'my-requests'
                  ? 'bg-[#7A0808] text-white shadow-2xs'
                  : 'bg-transparent text-gray-700 hover:bg-gray-100/70'
              }`}
            >
              <span>My Requests</span>
              <span className="min-w-[20px] h-[20px] px-1.5 rounded-lg bg-[#F59E0B] text-white font-black text-[10px] inline-flex items-center justify-center leading-none shadow-2xs">
                {myRequests.length}
              </span>
            </button>
          </div>
        ) : <div />}

        <button
          type="button"
          onClick={() => startNewReservation()}
          className="btn-maroon font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-2xs whitespace-nowrap cursor-pointer"
        >
          <Plus size={15} className="flex-shrink-0" />
          <span>New Request</span>
        </button>
      </div>

      {/* Main Request Table Card */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h2 className="font-black text-base text-dark">
            {(hasApprovalPermission && showSection === 'approvals') ? 'Requests Awaiting Your Role Signature' : 'My Submitted Requests'}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-500">
              Showing {filteredRequests.length} of {activeCategoryRequests.length} requests
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 w-fit max-w-full">
          <CategoryFilterTabs
            value={tab}
            onChange={(v) => {
              setTab(v);
              setFilter('All');
            }}
            academicCount={academicReqs.length}
            nonAcademicCount={nonAcademicReqs.length}
          />
          <StatusFilterRow value={filter} onChange={setFilter} />
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5 min-w-[150px]">
            <label className="text-xs font-bold text-gray-600 shrink-0">From:</label>
            <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="dd/mm/yyyy" />
          </div>
          <div className="flex items-center gap-1.5 min-w-[150px]">
            <label className="text-xs font-bold text-gray-600 shrink-0">To:</label>
            <DatePicker value={dateTo} onChange={setDateTo} placeholder="dd/mm/yyyy" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <input
              type="text"
              placeholder="Search by title, department, requestor, or venue..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-1.5 text-xs border border-gray-200 rounded-xl focus:border-[#7A0808] focus:bg-white focus:outline-none bg-white font-medium"
            />
          </div>
          {(dateFrom || dateTo || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setSearchQuery('');
              }}
              className="px-3 py-1.5 text-xs font-bold text-[#7A0808] hover:bg-red-50 rounded-xl transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Multi-Selection Bulk Delete Action Bar */}
        {selectedRequestIds.length > 0 && (
          <div className="bg-[#7A0808] text-white px-4 py-3 rounded-2xl flex items-center justify-between shadow-lg animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-xs font-bold">
              <CheckSquare size={16} />
              <span>{selectedRequestIds.length} request(s) selected</span>
            </div>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="px-3.5 py-1.5 bg-white text-[#7A0808] rounded-xl text-xs font-black hover:bg-red-50 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Trash2 size={14} /> Delete Selected ({selectedRequestIds.length})
            </button>
          </div>
        )}

        {requestsLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {showSection === 'approvals'
              ? 'No requests currently awaiting your approval turn.'
              : 'You have not submitted any room reservation requests yet.'}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50/90 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        disabled={deletableRequests.length === 0}
                        className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                        title="Select all deletable requests"
                      />
                    </th>
                    <th className="py-3 px-4">ACTIVITY & REQUESTOR</th>
                    <th className="py-3 px-4">VENUE & DETAILS</th>
                    <th className="py-3 px-4">SCHEDULE & DATE FILED</th>
                    <th className="py-3 px-4">APPROVAL STATUS / STEP</th>
                    <th className="py-3 px-4 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {paginatedRequests.map((req) => {
                    const canDelete = isRegistrar || req.createdByUid === profile?.uid;
                    const isSelected = selectedRequestIds.includes(req.id);
                    const activePending = getActivePendingRecord(req.approvalRecords || req.approvalSteps || []);
                    const activeStepLabel = activePending ? (activePending.roleLabel || activePending.roleId) : req.status;

                    return (
                      <tr key={req.id} className={`hover:bg-gray-50/70 transition-colors ${isSelected ? 'bg-red-50/40' : ''}`}>
                        <td className="py-3.5 px-4 align-top text-center">
                          {canDelete && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRequest(req.id)}
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer mt-1"
                            />
                          )}
                        </td>
                        <td className="py-3.5 px-4 align-top">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleNavigateToRoom(req)}
                                className="font-black text-sm text-[#7A0808] hover:underline text-left cursor-pointer transition-colors"
                                title="Click to view reserved room details & schedule matrix"
                              >
                                {req.activity || req.title || 'Untitled Activity'}
                              </button>
                              <span className={`inline-flex items-center justify-center text-[11px] font-bold px-3 py-1 rounded-full leading-none ${
                                req.type === 'academic' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {req.type === 'academic' ? 'Academic' : 'Non-Academic'}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-gray-600">
                              {formatCollegeName(req.college || req.nameOfOrg || req.department) || '—'}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              Requested by: <span className="font-bold text-gray-700">{req.requestedBy || req.requestor || '—'}</span>
                            </p>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-top">
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              onClick={() => handleNavigateToRoom(req)}
                              className="flex items-center gap-1.5 font-bold text-gray-800 hover:text-[#7A0808] hover:underline text-left cursor-pointer transition-colors group"
                              title="Click to view reserved room details & schedule matrix"
                            >
                              <MapPin size={14} className="text-red-700 group-hover:scale-110 flex-shrink-0 transition-transform" />
                              <span>{req.designatedVenue || req.specificVenue || req.venue || '—'}</span>
                            </button>
                            <div className="text-[11px] text-gray-500">
                              <span className="font-semibold text-gray-700">Participants:</span> {req.participants || req.numStudents || '—'}
                            </div>
                            {req.objectives && (
                              <p className="text-[11px] text-gray-400 line-clamp-1 italic">
                                "{req.objectives}"
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-top">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-bold text-gray-900">
                              <Calendar size={13} className="text-gray-400" />
                              <span>{formatReadableDate(req.dateOfActivity || req.dateStart || req.dateField)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                              <Clock size={13} className="text-gray-400" />
                              <span>{formatReadableTimeRange(req.timeStart, req.timeEnd)}</span>
                            </div>
                            <p className="text-[10px] text-gray-400 pt-0.5">
                              Filed: {formatReadableDate(req.dateFiled || req.createdAt)}
                            </p>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-top">
                          <div className="space-y-1.5">
                            {(() => {
                              const effectiveStatus = (hasApprovalPermission && showSection === 'approvals')
                                ? getApproverSpecificStatus(req, role, profile)
                                : req.status;

                              const isAppr = effectiveStatus === 'Approved';
                              const isRej = effectiveStatus === 'Rejected';

                              return (
                                <>
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                    isAppr ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    isRej ? 'bg-red-50 text-red-700 border border-red-200' :
                                    'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}>
                                    {isAppr ? <CheckCircle size={12} /> : isRej ? <XCircle size={12} /> : <Clock size={12} />}
                                    {isAppr ? 'Approved' : isRej ? 'Rejected' : 'Pending Action'}
                                  </span>

                                  {isAppr && req.status !== 'Approved' && (
                                    <div className="text-[10px] text-emerald-700 font-semibold bg-emerald-50/60 p-1.5 rounded-lg border border-emerald-100 flex items-center gap-1">
                                      <span>✓ Approved on your side</span>
                                      {activePending && (
                                        <span className="text-gray-500 font-normal">· Pending {activeStepLabel}</span>
                                      )}
                                    </div>
                                  )}

                                  {isRej && (
                                    <div className="text-[10px] text-red-700 font-semibold bg-red-50/60 p-1.5 rounded-lg border border-red-100">
                                      ✕ Rejected on your side
                                    </div>
                                  )}

                                  {!isAppr && !isRej && activePending && (
                                    <div className="text-[11px] text-gray-600 font-semibold bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                                      Pending Step: <span className="font-bold text-[#7A0808]">{activeStepLabel}</span>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (req.type === 'non-academic') {
                                  navigate(`/request/${req.id}`, { state: { request: req } });
                                } else {
                                  navigate(`/academic-request/${req.id}`, { state: { request: req } });
                                }
                              }}
                              className="btn-table-action btn-table-action-maroon"
                            >
                              <Eye size={13} /> View Details
                            </button>

                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeleteReservation(req)}
                                className="p-2 rounded-xl text-red-600 hover:bg-red-50 border border-gray-200 transition-colors"
                                title="Delete Request"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredRequests.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-500 font-semibold">
                  Showing <span className="font-bold text-gray-800">{startIndex}</span> to{' '}
                  <span className="font-bold text-gray-800">{endIndex}</span> of{' '}
                  <span className="font-bold text-gray-800">{filteredRequests.length}</span> requests
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                    <span>Show</span>
                    <div className="w-[125px]">
                      <CustomSelect
                        value={`${itemsPerPage} per page`}
                        onChange={(e) => {
                          const val = Number(String(e.target.value).split(' ')[0]);
                          if (val) setItemsPerPage(val);
                          setCurrentPage(1);
                        }}
                        options={[
                          { value: '5 per page', label: '5 per page' },
                          { value: '10 per page', label: '10 per page' },
                          { value: '20 per page', label: '20 per page' },
                          { value: '50 per page', label: '50 per page' },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition-colors"
                    >
                      <ChevronLeft size={15} /> Prev
                    </button>

                    {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .map((p, i, arr) => {
                        const prev = arr[i - 1];
                        const showEllipsis = prev && p - prev > 1;

                        return (
                          <React.Fragment key={p}>
                            {showEllipsis && <span className="px-1 text-xs text-gray-400 font-bold">…</span>}
                            <button
                              type="button"
                              onClick={() => setCurrentPage(p)}
                              className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                                currentPage === p
                                  ? 'bg-[#7A0808] text-white shadow-2xs'
                                  : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
                              }`}
                            >
                              {p}
                            </button>
                          </React.Fragment>
                        );
                      })}

                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition-colors"
                    >
                      Next <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <LoadingModal isOpen={isLoading} message={loadingMessage} />
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
      {reservationModals}
    </Layout>
  );
}
