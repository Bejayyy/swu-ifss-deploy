export const APPROVAL_TYPES = {
  ACADEMIC: 'academic',
  NON_ACADEMIC: 'non-academic',
  DEAN_MANAGED_ACADEMIC: 'dean-managed-academic', // For academic rooms managed by specific deans
  DEAN_MANAGED_NON_ACADEMIC: 'dean-managed-non-academic', // For non-academic rooms managed by specific deans
};

export const RESERVATION_STATUS = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const APPROVAL_RECORD_STATUS = {
  WAITING: 'Waiting',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SKIPPED: 'Skipped',
  CANCELLED: 'Cancelled',
};

export function getActivePendingRecord(approvalRecords = []) {
  return approvalRecords.find((r) => r.status === APPROVAL_RECORD_STATUS.PENDING) || null;
}

export function isReservationActionable(reservation, role, profile) {
  if (!reservation || !role || !profile) return false;
  if ([RESERVATION_STATUS.APPROVED, RESERVATION_STATUS.REJECTED, RESERVATION_STATUS.DRAFT].includes(reservation.status)) {
    return false;
  }
  const pending = getActivePendingRecord(reservation.approvalRecords);
  if (!pending) return false;

  // If this pending step is assigned to a specific customManagerUid (e.g. Dean room manager)
  if (pending.customManagerUid) {
    return profile.uid === pending.customManagerUid;
  }

  // If pending step role is 'room-manager-dean'
  if (pending.roleId === 'room-manager-dean') {
    if (pending.customManagerUid) {
      return profile.uid === pending.customManagerUid;
    }
    return role === 'dean';
  }

  // If role matches pending step roleId directly
  if (pending.roleId === role) {
    // For deans without customManagerUid, check college matching
    if (role === 'dean' && !pending.customManagerUid) {
      if (profile.college && reservation.college) {
        const normalizedProfileCollege = (profile.college || '').trim().toLowerCase();
        const normalizedReservationCollege = (reservation.college || '').trim().toLowerCase();
        return normalizedProfileCollege === normalizedReservationCollege;
      }
    }
    return true;
  }

  return false;
}

/**
 * Filter reservations that this role has interacted with (pending, approved, or rejected)
 * Includes requests where user needs to approve OR has already approved/rejected
 */
export function filterReservationsForRole(reservations, role, profile) {
  if (!role || !profile) return [];

  return reservations.filter((reservation) => {
    // Skip user's own reservations - they should be in "My Requests" section
    if (reservation.createdByUid === profile.uid) {
      return false;
    }

    // Skip reservations without proper approval workflow
    if (!Array.isArray(reservation.approvalRecords) || !reservation.approvalRecords.length) {
      return false;
    }

    // Check if this role or custom manager is in the approval workflow
    const myRecord = reservation.approvalRecords.find(
      (r) => r.roleId === role || r.roleId === 'room-manager-dean' || (r.customManagerUid && r.customManagerUid === profile.uid)
    );
    if (!myRecord) {
      return false; // This role is not part of the approval workflow
    }

    // For custom manager steps (e.g. room-manager-dean step with customManagerUid)
    const roomManagerStep = reservation.approvalRecords.find((r) => r.customManagerUid || r.roleId === 'room-manager-dean');
    if (roomManagerStep && roomManagerStep.customManagerUid === profile.uid) {
      return roomManagerStep.status === APPROVAL_RECORD_STATUS.PENDING ||
             roomManagerStep.status === APPROVAL_RECORD_STATUS.APPROVED ||
             roomManagerStep.status === APPROVAL_RECORD_STATUS.REJECTED;
    }

    // Show if: 
    // 1. This role is currently pending (needs action)
    // 2. This role has already approved (for tracking)
    // 3. This role has rejected (for tracking)
    const isPending = myRecord.status === APPROVAL_RECORD_STATUS.PENDING;
    const hasActed = myRecord.status === APPROVAL_RECORD_STATUS.APPROVED || 
                     myRecord.status === APPROVAL_RECORD_STATUS.REJECTED;
    
    if (!isPending && !hasActed) {
      return false; // Still waiting, hasn't reached this role yet
    }
    
    // For deans, check if this is assigned to them specifically (custom manager)
    if (role === 'dean') {
      // Check if this dean is the room manager for this reservation
      const roomManagerRecord = myRecord.customManagerUid ? myRecord : null;
      if (roomManagerRecord && roomManagerRecord.customManagerUid === profile.uid) {
        return true; // This dean is the room manager
      }
      
      // For standard college dean role (not room manager)
      if (myRecord.roleId === 'dean' && !myRecord.customManagerUid) {
        if (profile.college && reservation.college) {
          const normalizedProfileCollege = (profile.college || '').trim().toLowerCase();
          const normalizedReservationCollege = (reservation.college || '').trim().toLowerCase();
          return normalizedProfileCollege === normalizedReservationCollege;
        }
        return true; // No college filter
      }
    }
    
    return true;
  });
}

/**
 * Filter reservations created by this user (for tracking their own requests)
 */
export function filterMyReservations(reservations, profile) {
  if (!profile) {
    console.log('[filterMyReservations] No profile provided');
    return [];
  }
  
  console.log('[filterMyReservations] Filtering for user:', {
    uid: profile.uid,
    email: profile.email,
    role: profile.role,
    totalReservations: reservations.length
  });
  
  const filtered = reservations.filter((reservation) => {
    const match = reservation.createdByUid === profile.uid;
    if (!match) {
      console.log('[filterMyReservations] No match:', {
        reservationId: reservation.id,
        reservationCreatedBy: reservation.createdByUid,
        profileUid: profile.uid,
        title: reservation.title
      });
    }
    return match;
  });
  
  console.log('[filterMyReservations] Filtered result:', filtered.length, 'reservations');
  return filtered;
}

export function buildApprovalFlowLabel(approvalRecords = []) {
  return approvalRecords.map((r) => r.roleLabel || r.roleId).join(' → ');
}
