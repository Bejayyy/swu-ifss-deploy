/**
 * Dashboard analytics service
 * Computes metrics from existing Firestore data (buildings, rooms, reservations)
 * No new Firestore queries — all derived from AppContext data
 */

// ──────────────────────────────────────────────
// Room Stats
// ──────────────────────────────────────────────
export function computeRoomStats(buildingList = []) {
  let total = 0;
  let available = 0;
  let occupied = 0;
  let maintenance = 0;

  for (const building of buildingList) {
    const floors = building.floorData || [];
    for (const floor of floors) {
      const rooms = floor.rooms || [];
      for (const room of rooms) {
        total++;
        const isUnderMaintenance = room.maintenanceStatus === 'under-maintenance';
        if (isUnderMaintenance) {
          maintenance++;
        } else if (room.status === 'Available') {
          available++;
        } else if (room.status === 'Occupied') {
          occupied++;
        }
      }
    }
  }

  return { total, available, occupied, maintenance };
}

// ──────────────────────────────────────────────
// Request / Reservation Stats
// ──────────────────────────────────────────────
export function computeRequestStats(requests = []) {
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let inProgress = 0;
  let draft = 0;

  for (const r of requests) {
    switch (r.status) {
      case 'Pending':
        pending++;
        break;
      case 'Approved':
        approved++;
        break;
      case 'Rejected':
        rejected++;
        break;
      case 'In Progress':
        inProgress++;
        break;
      case 'Draft':
        draft++;
        break;
      default:
        break;
    }
  }

  return { pending, approved, rejected, inProgress, draft, total: requests.length };
}

// ──────────────────────────────────────────────
// Room Utilization per Building
// ──────────────────────────────────────────────
export function computeRoomUtilization(buildingList = [], requests = []) {
  const buildingMap = {};

  for (const building of buildingList) {
    const floors = building.floorData || [];
    let totalRooms = 0;
    let occupiedRooms = 0;

    for (const floor of floors) {
      const rooms = floor.rooms || [];
      for (const room of rooms) {
        totalRooms++;
        if (room.status === 'Occupied' || room.maintenanceStatus === 'under-maintenance') {
          occupiedRooms++;
        }
      }
    }

    // Count reservations for this building
    const buildingReservations = requests.filter(
      (r) =>
        (r.building === building.name || r.buildingId === building.id) &&
        (r.status === 'Approved' || r.status === 'In Progress')
    ).length;

    const utilization = totalRooms > 0
      ? Math.min(100, Math.round(((occupiedRooms + buildingReservations * 0.3) / totalRooms) * 100))
      : 0;

    buildingMap[building.name] = {
      building: building.name,
      totalRooms,
      occupiedRooms,
      reservations: buildingReservations,
      utilization,
    };
  }

  return Object.values(buildingMap).sort((a, b) => b.utilization - a.utilization);
}

// ──────────────────────────────────────────────
// Scheduling Conflicts
// ──────────────────────────────────────────────
export function computeConflicts(requests = []) {
  let doubleBookings = 0;
  let scheduleOverlaps = 0;
  let capacityConflicts = 0;
  let unauthorizedUsage = 0;

  // Filter to active reservations
  const active = requests.filter(
    (r) => r.status === 'Approved' || r.status === 'In Progress' || r.status === 'Pending'
  );

  // Group by venue/room
  const byRoom = {};
  for (const r of active) {
    const venue = r.venue || r.room || r.specificVenue || 'Unknown';
    if (!byRoom[venue]) byRoom[venue] = [];
    byRoom[venue].push(r);
  }

  // Detect overlaps within same room
  for (const [, roomReqs] of Object.entries(byRoom)) {
    if (roomReqs.length < 2) continue;
    for (let i = 0; i < roomReqs.length; i++) {
      for (let j = i + 1; j < roomReqs.length; j++) {
        const a = roomReqs[i];
        const b = roomReqs[j];
        // Same date check
        const dateA = a.dateStart || a.dateField;
        const dateB = b.dateStart || b.dateField;
        if (dateA && dateB && dateA === dateB) {
          // Time overlap check
          if (a.timeStart && a.timeEnd && b.timeStart && b.timeEnd) {
            if (a.timeStart < b.timeEnd && b.timeStart < a.timeEnd) {
              if (a.status === 'Approved' && b.status === 'Approved') {
                doubleBookings++;
              } else {
                scheduleOverlaps++;
              }
            }
          } else {
            scheduleOverlaps++;
          }
        }
      }
    }
  }

  // Capacity conflicts — requests where participants exceed venue capacity info (if available)
  for (const r of active) {
    if (r.participants && r.roomCapacity && r.participants > r.roomCapacity) {
      capacityConflicts++;
    }
  }

  // Check for unauthorized room usage (requests without proper approval trying to use rooms)
  for (const r of requests) {
    if (r.status === 'Rejected' && r.venue) {
      const stillActive = active.some(
        (a) =>
          a.id !== r.id &&
          a.requestor === r.requestor &&
          (a.venue === r.venue || a.room === r.room) &&
          a.dateStart === r.dateStart
      );
      if (stillActive) unauthorizedUsage++;
    }
  }

  const total = doubleBookings + scheduleOverlaps + capacityConflicts + unauthorizedUsage;

  return {
    doubleBookings,
    scheduleOverlaps,
    capacityConflicts,
    unauthorizedUsage,
    total,
    chartData: [
      { category: 'Double Bookings', count: doubleBookings, color: '#DC2626' },
      { category: 'Schedule Overlaps', count: scheduleOverlaps, color: '#EA580C' },
      { category: 'Capacity Conflicts', count: capacityConflicts, color: '#CA8A04' },
      { category: 'Unauthorized Usage', count: unauthorizedUsage, color: '#7C3AED' },
    ],
  };
}

// ──────────────────────────────────────────────
// Approval Workflow Funnel
// ──────────────────────────────────────────────
export function computeApprovalFunnel(requests = []) {
  const stages = {
    'Requestor': 0,
    'Dean': 0,
    'Student Life': 0,
    'Registrar': 0,
    'GSD': 0,
  };

  const activeRequests = requests.filter(
    (r) => r.status === 'Pending' || r.status === 'In Progress'
  );

  for (const r of activeRequests) {
    const records = r.approvalRecords || r.approvalSteps || [];
    // Find the current pending step
    const pendingRecord = records.find((rec) => rec.status === 'Pending');

    if (pendingRecord) {
      const role = (pendingRecord.role || '').toLowerCase();
      if (role.includes('dean') || role.includes('college')) {
        stages['Dean']++;
      } else if (role.includes('student life')) {
        stages['Student Life']++;
      } else if (role.includes('registrar') || role.includes('super admin')) {
        stages['Registrar']++;
      } else if (role.includes('gsd') || role.includes('general services')) {
        stages['GSD']++;
      } else if (role.includes('requestor')) {
        stages['Requestor']++;
      } else {
        // Default — count as Requestor stage if unmatched
        stages['Requestor']++;
      }
    } else {
      // No pending record yet, count as at Requestor stage
      stages['Requestor']++;
    }
  }

  return [
    { stage: 'Requestor', count: stages['Requestor'], color: '#64748B' },
    { stage: 'Dean', count: stages['Dean'], color: '#2563EB' },
    { stage: 'Student Life', count: stages['Student Life'], color: '#7C3AED' },
    { stage: 'GSD', count: stages['GSD'], color: '#CA8A04' },
    { stage: 'Registrar', count: stages['Registrar'], color: '#800000' },
  ];
}

// ──────────────────────────────────────────────
// Department Scheduling Activity
// ──────────────────────────────────────────────
export function computeDepartmentActivity(requests = []) {
  const deptCounts = {};

  for (const r of requests) {
    const dept = r.college || r.department || r.nameOfOrg || 'Unassigned';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  }

  return Object.entries(deptCounts)
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// ──────────────────────────────────────────────
// Subject-to-Room Assignment Table
// ──────────────────────────────────────────────
export function computeSubjectRoomAssignments(buildingList = [], requests = []) {
  const assignments = [];

  // Build a room lookup
  const roomLookup = {};
  for (const building of buildingList) {
    for (const floor of building.floorData || []) {
      for (const room of floor.rooms || []) {
        roomLookup[room.id] = {
          ...room,
          buildingName: building.name,
        };
      }
    }
  }

  // Extract subject assignments from academic reservations
  const academic = requests.filter((r) => r.type === 'academic');
  for (const r of academic) {
    const roomId = r.venue || r.room;
    const roomInfo = roomLookup[roomId] || {};

    assignments.push({
      subject: r.courseCode || r.courseDesc || r.title || 'N/A',
      room: roomId || 'Unassigned',
      capacity: roomInfo.capacity || r.roomCapacity || '—',
      type: roomInfo.type || 'N/A',
      facilities: (roomInfo.equipment || []).join(', ') || '—',
      status: r.status || 'Unknown',
      building: roomInfo.buildingName || r.building || '',
    });
  }

  return assignments;
}

// ──────────────────────────────────────────────
// Recent Activity Timeline
// ──────────────────────────────────────────────
export function buildRecentActivity(requests = [], limit = 15) {
  const activities = [];

  for (const r of requests) {
    const timestamp = r.updatedAt || r.createdAt;
    const timeMs = timestamp?.seconds
      ? timestamp.seconds * 1000
      : timestamp?.toMillis
        ? timestamp.toMillis()
        : timestamp
          ? new Date(timestamp).getTime()
          : 0;

    // Map status to activity type
    let activityType = 'info';
    let actionText = '';

    switch (r.status) {
      case 'Approved':
        activityType = 'approved';
        actionText = `${r.title || r.courseDesc || 'Request'} approved`;
        break;
      case 'Rejected':
        activityType = 'rejected';
        actionText = `${r.title || r.courseDesc || 'Request'} rejected`;
        break;
      case 'Pending':
        activityType = 'pending';
        actionText = `New request: ${r.title || r.courseDesc || 'Room reservation'}`;
        break;
      case 'In Progress':
        activityType = 'in-progress';
        actionText = `${r.title || r.courseDesc || 'Request'} in review`;
        break;
      case 'Draft':
        activityType = 'draft';
        actionText = `Draft saved: ${r.title || r.courseDesc || 'Request'}`;
        break;
      case 'Postponed':
        activityType = 'postponed';
        actionText = `${r.title || r.courseDesc || 'Request'} postponed`;
        break;
      default:
        activityType = 'info';
        actionText = `${r.title || r.courseDesc || 'Request'} updated`;
    }

    const venue = r.venue || r.room || r.specificVenue || '';
    const building = r.building || '';
    const sub = [venue, building].filter(Boolean).join(' · ');

    activities.push({
      id: r.id,
      text: actionText,
      sub: sub || 'System',
      type: activityType,
      timeMs,
      timestamp,
    });
  }

  // Sort by most recent first
  activities.sort((a, b) => b.timeMs - a.timeMs);

  return activities.slice(0, limit);
}

// ──────────────────────────────────────────────
// Room Availability Grid Data
// ──────────────────────────────────────────────
export function computeRoomAvailabilityGrid(buildingList = [], requests = [], selectedBuilding = null) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const timeSlots = [];
  for (let h = 7; h <= 19; h++) {
    const label = h <= 12 ? `${h}:00 ${h < 12 ? 'AM' : 'PM'}` : `${h - 12}:00 PM`;
    timeSlots.push({ hour: h, label });
  }

  // Collect rooms
  let rooms = [];
  for (const building of buildingList) {
    if (selectedBuilding && building.id !== selectedBuilding && building.name !== selectedBuilding) continue;
    for (const floor of building.floorData || []) {
      for (const room of floor.rooms || []) {
        rooms.push({
          id: room.id,
          name: room.name || room.id,
          buildingName: building.name,
          status: room.status,
          maintenanceStatus: room.maintenanceStatus,
        });
      }
    }
  }

  // Limit to first 12 rooms for display
  rooms = rooms.slice(0, 12);

  // Build grid
  const grid = rooms.map((room) => {
    const slots = {};
    for (const day of days) {
      for (const slot of timeSlots) {
        const key = `${day}-${slot.hour}`;
        if (room.maintenanceStatus === 'under-maintenance') {
          slots[key] = 'maintenance';
        } else if (room.status === 'Occupied') {
          slots[key] = 'occupied';
        } else {
          slots[key] = 'available';
        }
      }
    }

    // Overlay reservation data
    const roomReservations = requests.filter(
      (r) =>
        (r.venue === room.id || r.room === room.id) &&
        (r.status === 'Approved' || r.status === 'In Progress')
    );

    for (const res of roomReservations) {
      // Try to match day
      if (res.dateStart) {
        try {
          const date = new Date(res.dateStart);
          const dayIndex = date.getDay(); // 0=Sun
          if (dayIndex >= 1 && dayIndex <= 6) {
            const dayName = days[dayIndex - 1];
            // Parse time
            const startHour = parseTimeToHour(res.timeStart);
            const endHour = parseTimeToHour(res.timeEnd);
            if (startHour !== null && endHour !== null) {
              for (let h = startHour; h < endHour && h <= 19; h++) {
                slots[`${dayName}-${h}`] = 'reserved';
              }
            }
          }
        } catch {
          // Skip invalid dates
        }
      }
    }

    return { room, slots };
  });

  return { days, timeSlots, grid };
}

function parseTimeToHour(timeStr) {
  if (!timeStr) return null;
  // Handle "7:00 AM", "12:00 PM", "04:00 PM" etc.
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const ampm = (match[3] || '').toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour;
}

// ──────────────────────────────────────────────
// Format relative time for activity timeline
// ──────────────────────────────────────────────
export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const ms = timestamp?.seconds
    ? timestamp.seconds * 1000
    : timestamp?.toMillis
      ? timestamp.toMillis()
      : typeof timestamp === 'number'
        ? timestamp
        : new Date(timestamp).getTime();

  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

// ──────────────────────────────────────────────
// Hourly Demand Analysis (7 AM - 7 PM)
// ──────────────────────────────────────────────
export function computeHourlyDemand(requests = []) {
  const hours = [];
  const hourCounts = {};

  for (let h = 7; h <= 19; h++) {
    const label = h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    hours.push(label);
    hourCounts[label] = 0;
  }

  for (const r of requests) {
    if (r.status === 'Approved' || r.status === 'In Progress' || r.status === 'Pending') {
      const startHour = parseTimeToHour(r.timeStart);
      const endHour = parseTimeToHour(r.timeEnd);

      if (startHour !== null && endHour !== null) {
        for (let h = startHour; h < endHour && h <= 19; h++) {
          if (h >= 7) {
            const label = h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
            if (hourCounts[label] !== undefined) {
              hourCounts[label]++;
            }
          }
        }
      }
    }
  }

  return hours.map((hour) => ({
    hour,
    demand: hourCounts[hour] || 0,
  }));
}

// ──────────────────────────────────────────────
// Facility Type Distribution
// ──────────────────────────────────────────────
export function computeFacilityTypeDistribution(buildingList = []) {
  const typeMap = {};

  for (const building of buildingList) {
    for (const floor of building.floorData || []) {
      for (const room of floor.rooms || []) {
        const type = room.type || 'Standard Room';
        typeMap[type] = (typeMap[type] || 0) + 1;
      }
    }
  }

  const colors = ['#800000', '#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777'];

  return Object.entries(typeMap).map(([name, value], idx) => ({
    name,
    value,
    color: colors[idx % colors.length],
  }));
}

