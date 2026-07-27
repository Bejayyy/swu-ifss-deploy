import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, ClipboardList, Clock, CheckCircle, XCircle, MoreVertical, MapPin, Users, Calendar, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import { useModal } from '../hooks/useModal';
import ProgressStatCards from '../components/ProgressStatCards';
import { CategoryFilterTabs, StatusFilterRow } from '../components/FilterControls';
import { buildApprovalFlowLabel, RESERVATION_STATUS, APPROVAL_RECORD_STATUS } from '../constants/approvalWorkflow';
import { ModalRenderer } from '../components/modals/ModalProvider';
import LoadingModal from '../components/modals/LoadingModal';
import { deleteRoomReservation } from '../services/reservationService';

import { TableSkeleton } from '../components/SkeletonLoader';

export default function ApprovalManagement() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { requests, requestsLoading } = useApp();
  const { profile } = useAuth();
  const {
    role,
    roleLabel,
    canSubmitReservation,
    canCreateRequestType,
    filterRequests,
    filterMyRequests,
    canEndorseActivity,
    canManageRoomActivityApproval,
    canManageStudentActivityApproval,
    isRegistrar,
  } = useRolePermissions();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();

  const showAcademicTab = isRegistrar || canEndorseActivity() || canCreateRequestType('academic');
  const showNonAcademicTab = isRegistrar || canSubmitReservation() || canManageRoomActivityApproval() || canManageStudentActivityApproval();

  // Get initial values from navigation state (from notifications)
  const initialTab = state?.tab || (showNonAcademicTab && !showAcademicTab ? 'non-academic' : 'academic');
  const initialSection = state?.section || 'approvals';

  const [tab, setTab] = useState(initialTab);
  const [filter, setFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionMenuOpen, setActionMenuOpen] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');
  const [showSection, setShowSection] = useState(initialSection); // 'approvals' or 'my-requests'
  const { openReservation, modals } = useRoomReservationFlow();

  // Requests that need my approval
  const roleRequests = filterRequests(requests);
  
  // My own requests (for tracking)
  const myRequests = filterMyRequests(requests);

  // Update tab visibility based on actual requests
  // Show academic tab if user has permission OR has academic requests
  const hasAcademicRequests = myRequests.some(r => r.type === 'academic');
  const hasNonAcademicRequests = myRequests.some(r => r.type === 'non-academic');
  
  const showAcademicTabFinal = showAcademicTab || hasAcademicRequests;
  const showNonAcademicTabFinal = showNonAcademicTab || hasNonAcademicRequests;

  // Helper function to get role-specific status
  const getRoleSpecificStatus = (reservation) => {
    if (!reservation.approvalRecords || !role) return reservation.status;
    
    const myRecord = reservation.approvalRecords.find((r) => r.roleId === role);
    if (!myRecord) return reservation.status;
    
    // If this role has approved/rejected, show that status for this role
    if (myRecord.status === APPROVAL_RECORD_STATUS.APPROVED) return 'Approved';
    if (myRecord.status === APPROVAL_RECORD_STATUS.REJECTED) return 'Rejected';
    if (myRecord.status === APPROVAL_RECORD_STATUS.PENDING) return 'Pending';
    
    // If waiting, still show as pending since it hasn't reached this role
    return 'Pending';
  };

  const filtered = roleRequests.filter((r) => {
    const typeMatch = tab === 'academic' ? r.type === 'academic' : r.type === 'non-academic';
    
    // Use role-specific status for filtering
    const roleStatus = getRoleSpecificStatus(r);
    const statusMatch = filter === 'All' || 
                       roleStatus === filter || 
                       (filter === 'Pending' && roleStatus === 'Pending');
    
    // Date range filter
    let dateMatch = true;
    if (dateFrom || dateTo) {
      const activityDate = r.dateOfActivity || r.dateStart || '';
      if (activityDate) {
        // Convert DD/MM/YYYY to YYYY-MM-DD for comparison
        const parts = activityDate.split('/');
        const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : activityDate;
        
        if (dateFrom && isoDate < dateFrom) dateMatch = false;
        if (dateTo && isoDate > dateTo) dateMatch = false;
      }
    }
    
    // Search filter
    let searchMatch = true;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      searchMatch = 
        (r.title || '').toLowerCase().includes(query) ||
        (r.department || '').toLowerCase().includes(query) ||
        (r.requestor || '').toLowerCase().includes(query) ||
        (r.venue || r.designatedVenue || '').toLowerCase().includes(query);
    }
    
    return typeMatch && statusMatch && dateMatch && searchMatch;
  });

  const myFiltered = myRequests.filter((r) => {
    const typeMatch = tab === 'academic' ? r.type === 'academic' : r.type === 'non-academic';
    const normalizedStatus = r.status === RESERVATION_STATUS.IN_PROGRESS ? 'Pending' : r.status;
    const statusMatch = filter === 'All' || r.status === filter || (filter === 'Pending' && normalizedStatus === 'Pending');
    
    // Debug logging
    if (showSection === 'my-requests') {
      console.log('[ApprovalManagement] myFiltered check:', {
        id: r.id,
        title: r.title,
        type: r.type,
        status: r.status,
        currentTab: tab,
        typeMatch,
        statusMatch,
        filter
      });
    }
    
    // Date range filter
    let dateMatch = true;
    if (dateFrom || dateTo) {
      const activityDate = r.dateOfActivity || r.dateStart || '';
      if (activityDate) {
        // Convert DD/MM/YYYY to YYYY-MM-DD for comparison
        const parts = activityDate.split('/');
        const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : activityDate;
        
        if (dateFrom && isoDate < dateFrom) dateMatch = false;
        if (dateTo && isoDate > dateTo) dateMatch = false;
      }
    }
    
    // Search filter
    let searchMatch = true;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      searchMatch = 
        (r.title || '').toLowerCase().includes(query) ||
        (r.department || '').toLowerCase().includes(query) ||
        (r.requestor || '').toLowerCase().includes(query) ||
        (r.venue || r.designatedVenue || '').toLowerCase().includes(query);
    }
    
    return typeMatch && statusMatch && dateMatch && searchMatch;
  });

  // Separate counts for each section
  const academicReqs = showSection === 'approvals' 
    ? roleRequests.filter((r) => r.type === 'academic')
    : myRequests.filter((r) => r.type === 'academic');
    
  const nonAcademicReqs = showSection === 'approvals'
    ? roleRequests.filter((r) => r.type === 'non-academic')
    : myRequests.filter((r) => r.type === 'non-academic');

  const canCreateAny = canCreateRequestType('academic') || canCreateRequestType('non-academic');
  const subtitle = isRegistrar
    ? 'Review and approve schedules and room utilization requests'
    : `${roleLabel} — view and manage requests within your role`;

  // Debug log the state
  console.log('[ApprovalManagement] State:', {
    showSection,
    tab,
    filter,
    myRequestsCount: myRequests.length,
    myFilteredCount: myFiltered.length,
    showAcademicTab,
    showNonAcademicTab,
    role,
    roleLabel
  });

  // Stats for approvals section - use role-specific status
  const counts = {
    total: filtered.length,
    pending: filtered.filter((r) => getRoleSpecificStatus(r) === 'Pending').length,
    approved: filtered.filter((r) => getRoleSpecificStatus(r) === 'Approved').length,
    rejected: filtered.filter((r) => getRoleSpecificStatus(r) === 'Rejected').length,
  };

  // Stats for my requests section
  const myCounts = {
    total: myFiltered.length,
    pending: myFiltered.filter((r) => r.status === 'Pending' || r.status === RESERVATION_STATUS.IN_PROGRESS).length,
    approved: myFiltered.filter((r) => r.status === 'Approved').length,
    rejected: myFiltered.filter((r) => r.status === 'Rejected').length,
  };

  const displayCounts = showSection === 'approvals' ? counts : myCounts;
  const displayRequests = showSection === 'approvals' ? filtered : myFiltered;

  const stats = [
    { label: 'Total Request', value: displayCounts.total, icon: ClipboardList, accent: 'total' },
    { label: 'Pending', value: displayCounts.pending, icon: Clock, accent: 'pending' },
    { label: 'Approved', value: displayCounts.approved, icon: CheckCircle, accent: 'approved' },
    { label: 'Rejected', value: displayCounts.rejected, icon: XCircle, accent: 'rejected' },
  ];

  const handleDeleteReservation = async (reservation) => {
    // Check if user can delete (only own reservations or registrar)
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
      message: `Are you sure you want to delete "${reservation.title}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Deleting reservation...');
    setActionMenuOpen(null);

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

  return (
    <Layout title="Approval Management" subtitle={subtitle}>
      {canCreateAny && (
      <div className="flex justify-end mb-5 relative">
        <button className="btn-maroon" onClick={() => openReservation()}>
          <Plus size={16} /> New Reservation
        </button>
      </div>
      )}

      <div className="mb-6">
        <ProgressStatCards items={stats} />
      </div>

      {/* Section Toggle */}
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => { setShowSection('approvals'); setFilter('All'); }}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
            showSection === 'approvals'
              ? 'bg-[#800000] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Requests to Approve ({roleRequests.length})
        </button>
        <button
          type="button"
          onClick={() => { setShowSection('my-requests'); setFilter('All'); }}
          className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
            showSection === 'my-requests'
              ? 'bg-[#800000] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          My Requests ({myRequests.length})
        </button>
      </div>

      {/* Request History */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <h2 className="font-bold text-base mb-4" style={{ color: '#2B3235' }}>
          {showSection === 'approvals' ? 'Requests Requiring Approval' : 'My Request History'}
        </h2>

        <div className="flex flex-col gap-3 mb-5 w-fit max-w-full">
          {(showAcademicTabFinal || showNonAcademicTabFinal) && (
            <CategoryFilterTabs
              value={tab}
              onChange={(v) => { setTab(v); setFilter('All'); }}
              academicCount={showAcademicTabFinal ? academicReqs.length : 0}
              nonAcademicCount={showNonAcademicTabFinal ? nonAcademicReqs.length : 0}
              hideAcademic={!showAcademicTabFinal}
              hideNonAcademic={!showNonAcademicTabFinal}
            />
          )}
          <StatusFilterRow value={filter} onChange={setFilter} />
        </div>

        {/* Additional Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <label className="text-xs font-bold text-gray-600">From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#800000]/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <label className="text-xs font-bold text-gray-600">To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#800000]/20"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by title, department, requestor, or venue..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#800000]/20"
            />
          </div>
          {(dateFrom || dateTo || searchQuery) && (
            <button
              type="button"
              onClick={() => { setDateFrom(''); setDateTo(''); setSearchQuery(''); }}
              className="px-3 py-1.5 text-xs font-bold text-[#800000] hover:bg-red-50 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Request Cards */}
        {requestsLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : displayRequests.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {showSection === 'approvals' ? 'No requests awaiting your approval.' : 'You have not created any requests yet.'}
          </div>
        ) : (
          displayRequests.map(req => {
            const canDelete = isRegistrar || req.createdByUid === profile?.uid;
            
            // Get role-specific status for display
            const roleStatus = showSection === 'approvals' ? getRoleSpecificStatus(req) : req.status;
            
            return (
            <div key={req.id} className="request-card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={req.priority === 'High' ? 'priority-high' : 'priority-medium'}>
                    {req.priority || 'Medium'} Priority
                  </span>
                  <span className={`badge-${roleStatus?.toLowerCase()}`}>{roleStatus}</span>
                  {showSection === 'approvals' && req.status !== roleStatus && (
                    <span className="text-[10px] font-bold text-gray-400 px-2 py-0.5 bg-gray-50 rounded">
                      Overall: {req.status}
                    </span>
                  )}
                </div>
                
                {/* Action Menu */}
                <div className="relative">
                  <button 
                    type="button" 
                    className="p-1 rounded-lg hover:bg-gray-100" 
                    style={{ color: '#2B3235', opacity: 0.4 }}
                    onClick={() => setActionMenuOpen(actionMenuOpen === req.id ? null : req.id)}
                  >
                    <MoreVertical size={16} />
                  </button>
                  
                  {actionMenuOpen === req.id && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setActionMenuOpen(null)}
                      />
                      <div 
                        className="absolute right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20"
                        style={{ minWidth: '160px' }}
                      >
                        {canDelete && (
                          <button
                            type="button"
                            className="w-full px-4 py-2 text-left text-sm font-semibold hover:bg-red-50 flex items-center gap-2 transition-colors"
                            style={{ color: '#991B1B' }}
                            onClick={() => handleDeleteReservation(req)}
                          >
                            <Trash2 size={14} />
                            Delete Reservation
                          </button>
                        )}
                        {!canDelete && (
                          <div className="px-4 py-2 text-xs text-gray-400">
                            No actions available
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <h3 className="font-bold text-sm mb-0.5" style={{ color: '#2B3235' }}>{req.title}</h3>
              <p className="text-xs font-medium mb-3" style={{ color: '#2B3235', opacity: 0.65 }}>{req.department}</p>
              <p className="text-xs font-semibold mb-3" style={{ color: '#2B3235', opacity: 0.75 }}>A &nbsp; {req.requestor}</p>
              <p className="text-[11px] font-bold mb-3" style={{ color: '#800000' }}>
                Approval flow: {buildApprovalFlowLabel(req.approvalRecords || req.approvalSteps || []) || 'Not configured'}
              </p>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#2B3235', opacity: 0.55 }}>Objectives</p>
                  <p className="text-xs line-clamp-2" style={{ color: '#2B3235', opacity: 0.85 }}>{req.objectives || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#2B3235', opacity: 0.55 }}>Venue & Participation</p>
                  <div className="flex items-center gap-1 mb-0.5">
                    <MapPin size={10} style={{ color: '#2B3235', opacity: 0.45 }} />
                    <span className="text-xs" style={{ color: '#2B3235' }}>{req.venue || req.designatedVenue || 'TBD'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users size={10} style={{ color: '#2B3235', opacity: 0.45 }} />
                    <span className="text-xs" style={{ color: '#2B3235' }}>{req.participants || req.numStudents || 0} Students</span>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#2B3235', opacity: 0.55 }}>Date & Schedule</p>
                  <div className="flex items-center gap-1 mb-0.5">
                    <Calendar size={10} style={{ color: '#2B3235', opacity: 0.45 }} />
                    <span className="text-xs" style={{ color: '#2B3235' }}>{req.dateStart || req.dateOfActivity || req.dateField || 'TBD'}</span>
                  </div>
                  <span className="text-xs" style={{ color: '#2B3235', opacity: 0.7 }}>{req.timeStart} - {req.timeEnd}</span>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  className="btn-maroon text-xs py-1.5 px-4"
                  onClick={() => {
                    if (req.type === 'non-academic') {
                      navigate(`/request/${req.id}`, { state: { request: req } });
                    } else {
                      navigate(`/academic-request/${req.id}`, { state: { request: req } });
                    }
                  }}
                >
                  Review Details
                </button>
              </div>
            </div>
            );
          })
        )}
      </div>

      {modals}
      <LoadingModal isOpen={isLoading} message={loadingMessage} />
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
    </Layout>
  );
}
