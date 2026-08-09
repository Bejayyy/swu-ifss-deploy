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
  POSTPONED: 'Postponed',
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

export function normalizeCollegeCode(input) {
  if (!input) return '';
  const s = String(input).trim().toLowerCase();

  if (s === 'ceit' || s.includes('engineering') || s.includes('information technology') || s.includes('computer') || s === 'it') {
    return 'ceit';
  }
  if (s === 'cas' || s.includes('arts and sciences') || s.includes('arts & sciences')) {
    return 'cas';
  }
  if (s === 'cams' || s.includes('allied medical') || s.includes('medicine') || s === 'med') {
    return 'medicine';
  }
  if (s === 'cba' || s.includes('business') || s.includes('accountancy')) {
    return 'business';
  }
  if (s === 'cn' || s.includes('nursing')) {
    return 'nursing';
  }
  if (s === 'ced' || s.includes('education')) {
    return 'education';
  }
  if (s === 'col' || s.includes('law')) {
    return 'law';
  }
  return s;
}

export function isCollegeMatch(colA, colB) {
  if (!colA || !colB) return true; // If unspecified/missing, match!
  const normA = normalizeCollegeCode(colA);
  const normB = normalizeCollegeCode(colB);

  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;
  return false;
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
      const pCol = profile.college || profile.department || profile.collegeCode || profile.departmentCode || '';
      const rCol = reservation.college || reservation.department || reservation.requestorCollege || reservation.createdByCollege || '';
      return isCollegeMatch(pCol, rCol);
    }
    return true;
  }

  return false;
}

/**
 * Find the most relevant approval record for a given role/profile.
 * When a user has multiple matching records (e.g. dean is both college dean AND room manager),
 * we return the one with the most actionable status: Pending > Approved/Rejected > Waiting.
 */
function findMyApprovalRecord(approvalRecords, role, profile) {
  if (!approvalRecords || !role || !profile) return null;

  // Collect ALL records that belong to this user/role
  const candidates = [];

  for (const r of approvalRecords) {
    // Direct customManagerUid match
    if (r.customManagerUid && r.customManagerUid === profile.uid) {
      candidates.push(r);
      continue;
    }
    // Exact roleId match
    if (r.roleId === role) {
      candidates.push(r);
      continue;
    }
    // For deans, also include room-manager-dean steps without a specific customManagerUid
    if (role === 'dean' && r.roleId === 'room-manager-dean' && !r.customManagerUid) {
      candidates.push(r);
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Among all candidates, return the most actionable one
  // Priority: Pending (needs action now) > Approved/Rejected (already acted) > Waiting (not yet reached)
  const statusPriority = (status) => {
    if (status === APPROVAL_RECORD_STATUS.PENDING) return 3;
    if (status === APPROVAL_RECORD_STATUS.APPROVED || status === APPROVAL_RECORD_STATUS.REJECTED) return 2;
    return 1; // Waiting, Skipped, Cancelled, etc.
  };

  candidates.sort((a, b) => statusPriority(b.status) - statusPriority(a.status));
  return candidates[0];
}

/**
 * Get status of a reservation specifically from the perspective of an approver role/profile
 * Returns: 'Approved' | 'Rejected' | 'Pending' | 'In Progress' | 'Draft'
 */
export function getApproverSpecificStatus(reservation, role, profile) {
  if (!reservation || !role || !profile) return reservation?.status || 'Pending';

  // 1. Find the best matching approval record for this profile/role (Pending > Approved/Rejected > Waiting)
  const myRecord = findMyApprovalRecord(reservation.approvalRecords, role, profile);

  if (myRecord) {
    if (myRecord.status === APPROVAL_RECORD_STATUS.PENDING) return 'Pending';
    if (myRecord.status === APPROVAL_RECORD_STATUS.REJECTED) return 'Rejected';
    if (myRecord.status === APPROVAL_RECORD_STATUS.APPROVED) return 'Approved';
  }

  // 2. Fallback: check if this specific user signed/acted on any step
  const userRecord = reservation.approvalRecords?.find(
    (r) => r.approvedByUid === profile.uid
  );
  if (userRecord) {
    if (userRecord.status === APPROVAL_RECORD_STATUS.REJECTED) return 'Rejected';
    if (userRecord.status === APPROVAL_RECORD_STATUS.APPROVED) return 'Approved';
  }

  return reservation.status;
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

    // Find the correct approval record for this role/profile (Pending > Approved/Rejected > Waiting)
    const myRecord = findMyApprovalRecord(reservation.approvalRecords, role, profile);

    // If no direct myRecord found, fallback to checking if user previously signed any step
    if (!myRecord) {
      const userSigned = reservation.approvalRecords.some(
        (r) => r.approvedByUid === profile.uid
      );
      if (userSigned) return true;
      return false;
    }

    // For custom manager steps (e.g. room-manager-dean step with customManagerUid)
    if (myRecord.customManagerUid && myRecord.customManagerUid === profile.uid) {
      const keep = myRecord.status === APPROVAL_RECORD_STATUS.PENDING ||
             myRecord.status === APPROVAL_RECORD_STATUS.APPROVED ||
             myRecord.status === APPROVAL_RECORD_STATUS.REJECTED;
      return keep;
    }

    // Show if: 
    // 1. This role is currently pending (needs action)
    // 2. This role has already approved (for tracking)
    // 3. This role has rejected (for tracking)
    const isPending = myRecord.status === APPROVAL_RECORD_STATUS.PENDING;
    const hasActed = myRecord.status === APPROVAL_RECORD_STATUS.APPROVED || 
                     myRecord.status === APPROVAL_RECORD_STATUS.REJECTED;
    
    if (!isPending && !hasActed) {
      // If myRecord is waiting, but user signed an earlier step (e.g. Level 1 Dean signed, Level 3 Room Manager is waiting)
      const userSignedEarlier = reservation.approvalRecords.some((r) => r.approvedByUid === profile.uid);
      if (userSignedEarlier) return true;
      return false; // Still waiting, hasn't reached this role yet
    }
    
    // For deans, check if this is assigned to them specifically (custom manager) or matching college
    if (role === 'dean') {
      // For standard college dean role (not room manager)
      if (myRecord.roleId === 'dean' && !myRecord.customManagerUid) {
        const pCol = profile.college || profile.department || profile.collegeCode || profile.departmentCode || '';
        const rCol = reservation.college || reservation.department || reservation.requestorCollege || reservation.createdByCollege || '';

        return isCollegeMatch(pCol, rCol);
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
