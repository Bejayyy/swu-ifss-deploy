import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, Upload, Trash2, Eye, Calendar, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { APPROVAL_TYPES } from '../../constants/approvalWorkflow';
import { requiresCollege, formatCollegeName } from '../../constants/colleges';
import { subscribeColleges } from '../../services/collegeService';
import { fetchWorkflowLevels } from '../../services/approvalWorkflowService';
import { subscribeAllPlotEntriesForRoom } from '../../services/plotScheduleService';
import { subscribeApprovedReservationsForRoom } from '../../services/reservationService';
import { subscribeMaintenanceSchedules } from '../../services/maintenanceService';
import { useModal } from '../../hooks/useModal';
import { ModalRenderer } from './ModalProvider';
import LoadingModal from './LoadingModal';
import ApprovalTimeline from '../reservations/ApprovalTimeline';
import RoomWeeklyScheduleModal from './RoomWeeklyScheduleModal';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { COLLECTIONS } from '../../firebase/constants';
import DatePicker from '../ui/DatePicker';
import TimePicker from '../ui/TimePicker';
import CustomSelect from '../ui/CustomSelect';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

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

const timeStringToHour = (timeStr) => {
  if (!timeStr) return 0;
  let str = String(timeStr).trim();
  const isPM = str.toLowerCase().includes('pm');
  const isAM = str.toLowerCase().includes('am');
  str = str.replace(/[^\d:]/g, '');
  const [hStr, mStr] = str.split(':');
  let h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h + m / 60;
};

const formatHourDisplay = (h) => {
  const hrs = Math.floor(h);
  const mins = h % 1 !== 0 ? '30' : '00';
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  const displayH = hrs % 12 || 12;
  return `${displayH}:${mins} ${ampm}`;
};

const getDayIndexFromDate = (dateStr) => {
  if (!dateStr) return -1;
  let dStr = dateStr;
  if (dateStr.includes('/')) {
    const [d, m, y] = dateStr.split('/');
    dStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dateObj = new Date(dStr + 'T00:00:00');
  if (isNaN(dateObj.getTime())) return -1;
  const day = dateObj.getDay();
  return day === 0 ? 6 : day - 1; // 0 for Monday ... 6 for Sunday
};

export default function RoomReservationModal({ onClose, eventType, prefill = {}, isOpen = true }) {
  useBodyScrollLock(Boolean(isOpen));
  const { addRequest, buildingList } = useApp();
  const { profile } = useAuth();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();

  // Minimum reservation date: block next 6 days (first available is Day 7 from today)
  const minReservationDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

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

  // Pre-fetched room schedule state for instant conflict checking & schedule modal
  const [roomCourseSchedules, setRoomCourseSchedules] = useState([]);
  const [roomApprovedReservations, setRoomApprovedReservations] = useState([]);
  const [roomMaintenanceSchedules, setRoomMaintenanceSchedules] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

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

  const selectedBuilding = useMemo(
    () => buildingList.find((b) => b.name === form.building || String(b.id) === String(prefill.buildingId)),
    [buildingList, form.building, prefill.buildingId],
  );

  const roomsInBuilding = useMemo(() => {
    if (prefill.room && prefill.buildingId) {
      return [{ id: prefill.room, floor: prefill.floor, docId: prefill.roomDocId, capacity: prefill.capacity || 0, type: prefill.roomType || 'Classroom' }];
    }
    if (!selectedBuilding) return [];
    return selectedBuilding.floorData.flatMap((f) => f.rooms.map((r) => ({ id: r.id, name: r.name, floor: f.floor, floorId: f.floorId, docId: r.docId, capacity: r.capacity || 0, type: r.type || 'Classroom', managedBy: r.managedBy, managedByName: r.managedByName })));
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

  const targetRoomCode = form.room || prefill.room || '';
  const targetRoomDocId = resolvedTarget.room?.docId || prefill.roomDocId || form.room || '';

  // 1. Pre-fetch Course Schedules for the selected room
  useEffect(() => {
    if (!targetRoomCode) {
      setRoomCourseSchedules([]);
      return;
    }
    const unsub = subscribeAllPlotEntriesForRoom(
      targetRoomCode,
      '1',
      'regular',
      (scheds) => setRoomCourseSchedules(scheds || []),
      (err) => console.error('[RoomReservationModal] Error loading course schedules:', err)
    );
    return () => unsub();
  }, [targetRoomCode]);

  // 2. Pre-fetch Approved Reservations for the selected room
  useEffect(() => {
    if (!targetRoomDocId && !targetRoomCode) {
      setRoomApprovedReservations([]);
      return;
    }
    const unsub = subscribeApprovedReservationsForRoom(
      targetRoomDocId,
      (resList) => setRoomApprovedReservations(resList || []),
      (err) => {
        console.warn('[RoomReservationModal] Note on reservations listener:', err?.message || err);
        setRoomApprovedReservations([]);
      },
      targetRoomCode
    );
    return () => unsub();
  }, [targetRoomDocId, targetRoomCode]);

  // 3. Pre-fetch Maintenance Schedules for the selected room
  useEffect(() => {
    if (!targetRoomDocId) {
      setRoomMaintenanceSchedules([]);
      return;
    }
    const unsub = subscribeMaintenanceSchedules(
      (mList) => setRoomMaintenanceSchedules(mList || []),
      (err) => console.error('[RoomReservationModal] Error loading maintenance:', err),
      { roomId: targetRoomDocId }
    );
    return () => unsub();
  }, [targetRoomDocId]);

  // Real-time instant in-memory conflict detection
  useEffect(() => {
    if (!form.room || !form.dateOfActivity || !form.timeStart || !form.timeEnd) {
      setScheduleConflicts([]);
      return;
    }

    const reqDayIndex = getDayIndexFromDate(form.dateOfActivity);
    const reqStart = timeStringToHour(form.timeStart);
    const reqEnd = timeStringToHour(form.timeEnd);

    if (reqStart >= reqEnd || reqDayIndex === -1) {
      setScheduleConflicts([]);
      return;
    }

    const conflicts = [];

    // Check Course Schedules
    roomCourseSchedules.forEach((schedule) => {
      const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      let dayIndex = schedule.day;
      if (dayIndex === undefined || dayIndex === null || dayIndex < 0 || dayIndex >= 7) {
        if (schedule.date) {
          const foundIdx = dayNames.indexOf(String(schedule.date).toLowerCase().trim());
          if (foundIdx >= 0) dayIndex = foundIdx;
        }
      }
      if (dayIndex !== reqDayIndex) return;

      let cStart = 0;
      let cEnd = 0;
      if (typeof schedule.startHour === 'number' && typeof schedule.endHour === 'number') {
        cStart = schedule.startHour;
        cEnd = schedule.endHour;
      } else if (schedule.startTime && schedule.endTime) {
        cStart = timeStringToHour(schedule.startTime);
        cEnd = timeStringToHour(schedule.endTime);
      }
      if (cEnd <= cStart) return;

      if (cStart < reqEnd && reqStart < cEnd) {
        conflicts.push({
          type: 'Course Schedule',
          title: schedule.title || schedule.courseCode || 'Class Schedule',
          courseCode: schedule.courseCode || '',
          instructor: schedule.instructor || schedule.deanName || 'Faculty',
          section: schedule.sectionName || schedule.section || '',
          college: schedule.college || '',
          timeStart: formatHourDisplay(cStart),
          timeEnd: formatHourDisplay(cEnd),
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][reqDayIndex],
        });
      }
    });

    // Check Approved Reservations
    let formDateNorm = form.dateOfActivity;
    if (formDateNorm.includes('/')) {
      const [d, m, y] = formDateNorm.split('/');
      formDateNorm = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    roomApprovedReservations.forEach((res) => {
      let resDateNorm = res.dateOfActivity;
      if (resDateNorm && resDateNorm.includes('/')) {
        const [d, m, y] = resDateNorm.split('/');
        resDateNorm = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      if (resDateNorm !== formDateNorm) return;

      const rStart = timeStringToHour(res.timeStart);
      const rEnd = timeStringToHour(res.timeEnd);
      if (rEnd <= rStart) return;

      if (rStart < reqEnd && reqStart < rEnd) {
        conflicts.push({
          type: 'Approved Reservation',
          title: res.activity || res.title || 'Room Reservation',
          courseCode: res.nameOfOrg || res.department || 'Reserved',
          instructor: res.requestedBy || 'Requestor',
          section: res.type === 'academic' ? 'Academic Event' : 'Non-Academic Event',
          college: res.college || '',
          timeStart: formatHourDisplay(rStart),
          timeEnd: formatHourDisplay(rEnd),
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][reqDayIndex],
        });
      }
    });

    // Check Maintenance Schedules
    roomMaintenanceSchedules.forEach((m) => {
      if (m.status === 'cancelled' || m.status === 'completed') return;
      if (!m.startDate || !m.endDate) return;

      if (formDateNorm >= m.startDate && formDateNorm <= m.endDate) {
        const isQuickFix = m.durationType === 'hours' || Boolean(m.isQuickFix) || m.maintenanceType === 'quick_fix';
        if (isQuickFix && (formDateNorm === m.startDate || m.startDate === m.endDate)) {
          const mStart = timeStringToHour(m.startTime) || 8;
          const mDuration = parseFloat(m.durationHours || m.estimatedDurationHours) || 2;
          const mEnd = timeStringToHour(m.endTime) || (mStart + mDuration);
          if (mStart < reqEnd && reqStart < mEnd) {
            conflicts.push({
              type: 'Maintenance',
              title: `Maintenance: ${m.title || m.issueType || 'Facility Repair'}`,
              courseCode: m.assignedTechnicianName || 'Facility Maintenance',
              instructor: m.priority ? `Priority: ${m.priority}` : '',
              section: 'Facility Maintenance',
              college: '',
              timeStart: formatHourDisplay(mStart),
              timeEnd: formatHourDisplay(mEnd),
              dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][reqDayIndex],
            });
          }
        } else {
          conflicts.push({
            type: 'Maintenance',
            title: `Maintenance: ${m.title || m.issueType || 'Facility Repair'} (Whole Day)`,
            courseCode: m.assignedTechnicianName || 'Facility Maintenance',
            instructor: `Priority: ${m.priority || 'Normal'}`,
            section: 'Facility Maintenance',
            college: '',
            timeStart: '6:00 AM',
            timeEnd: '8:00 PM',
            dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][reqDayIndex],
          });
        }
      }
    });

    setScheduleConflicts(conflicts);
  }, [form.room, form.dateOfActivity, form.timeStart, form.timeEnd, roomCourseSchedules, roomApprovedReservations, roomMaintenanceSchedules]);

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

  const roomCapacity = Number(resolvedTarget.room?.capacity || prefill.capacity || 0);
  const isOverCapacity = roomCapacity > 0 && Number(form.participants || 0) > roomCapacity;

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

    // Check minimum 7 days advance notice (blocking next 6 days)
    let actDate = form.dateOfActivity;
    if (actDate.includes('/')) {
      const [d, m, y] = actDate.split('/');
      actDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    if (!isDraft && actDate < minReservationDate) {
      setError('Reservations must be submitted at least 7 days in advance.');
      showNotification({
        type: 'warning',
        title: 'Advance Notice Required',
        message: 'Reservations must be submitted at least 7 days in advance to allow time for processing and registrar approval.',
        autoCloseMs: 4000,
      });
      return;
    }

    // Check room capacity fit
    if (!isDraft && roomCapacity > 0 && Number(form.participants || 0) > roomCapacity) {
      setError(`Number of participants (${form.participants}) exceeds room capacity (${roomCapacity} pax).`);
      showNotification({
        type: 'warning',
        title: 'Capacity Exceeded',
        message: `Number of participants (${form.participants}) exceeds the room maximum capacity (${roomCapacity} pax). Please reduce the number of participants or select a larger venue.`,
        autoCloseMs: 4000,
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
    
    // Check for schedule conflicts (only for non-draft submissions)
    if (!isDraft && scheduleConflicts.length > 0) {
      setError('This time slot conflicts with existing schedules.');
      showNotification({
        type: 'error',
        title: 'Schedule Conflict',
        message: `Cannot reserve: Conflicts detected with ${scheduleConflicts.length} existing class schedule(s), reservation(s), or maintenance.`,
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
      
      setIsLoading(false);
      setBusy(false);

      showNotification({
        type: 'success',
        title: isDraft ? 'Draft Saved Successfully' : 'Submit Successful!',
        message: isDraft 
          ? 'Your room reservation has been saved as a draft.'
          : 'Your room reservation has been submitted for approval.',
        autoCloseMs: 2500,
      });
      
      setTimeout(() => {
        onClose();
      }, 2200);
    } catch (err) {
      setIsLoading(false);
      setBusy(false);
      const errorMessage = err.message || 'Failed to submit reservation.';
      setError(errorMessage);
      showNotification({
        type: 'error',
        title: isDraft ? 'Save Failed' : 'Submission Failed',
        message: errorMessage,
        autoCloseMs: 0,
      });
    }
  };

  const title = eventType === APPROVAL_TYPES.ACADEMIC ? 'Academic Room Reservation' : 'Non-Academic Room Reservation';

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-xl relative flex flex-col"
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-7 pb-4 border-b border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose} className="absolute right-5 top-5 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer">
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

        <div className="px-8 py-6 overflow-y-auto flex-1">
          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs font-semibold mb-4 border border-red-200">{error}</div>}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="col-span-2">
              <label className="form-label">
                Name of Organization / Department <span className="text-red-600">*</span>
              </label>
              <input className="form-input" value={form.nameOfOrg} onChange={(e) => set('nameOfOrg', e.target.value)} required />
            </div>

            <div className="col-span-2">
              <label className="form-label">
                Name of Activity <span className="text-red-600">*</span>
              </label>
              <input className="form-input" value={form.activity} onChange={(e) => set('activity', e.target.value)} required />
            </div>
            <div className="col-span-2">
              <label className="form-label">
                Objectives of the Activity <span className="text-red-600">*</span>
              </label>
              <textarea className="form-input resize-none" rows={3} value={form.objectives} onChange={(e) => set('objectives', e.target.value)} required />
            </div>

            {!isPrefilledRoom && (
              <>
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
                      const room = roomsInBuilding.find((r) => r.id === e.target.value);
                      setForm((f) => ({
                        ...f,
                        room: e.target.value,
                        designatedVenue: room ? `${e.target.value}, ${f.building} Floor ${room.floor}` : f.designatedVenue,
                      }));
                    }}
                    options={roomsInBuilding.map((r) => ({
                      value: r.id,
                      label: `${r.name || r.id} (Floor ${r.floor})`,
                    }))}
                    disabled={!form.building}
                    placeholder={form.building ? 'Select Room' : 'Select building first'}
                    required
                  />
                </div>
              </>
            )}

            {/* Designated Venue with View Schedule Button */}
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
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] font-semibold text-gray-500">
                  {resolvedTarget.room?.type ? `${resolvedTarget.room.type} · ` : ''}
                  {roomCapacity > 0 ? `Capacity: ${roomCapacity} Pax` : ''}
                </span>
                {form.room && (
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(true)}
                    className="text-xs font-extrabold text-[#7A0808] hover:text-[#600000] hover:underline flex items-center gap-1.5 transition-colors cursor-pointer py-0.5"
                  >
                    <Calendar size={13} />
                    View Schedule
                  </button>
                )}
              </div>
            </div>

            {/* Date of Activity (minDate = 7 days in advance) */}
            <div>
              <label className="form-label">
                Date of Activity <span className="text-red-600">*</span>
              </label>
              <DatePicker
                value={form.dateOfActivity}
                onChange={(val) => set('dateOfActivity', val)}
                minDate={minReservationDate}
                required
              />
              <p className="text-[10px] text-gray-400 mt-1">Must be at least 7 days in advance.</p>
            </div>

            {/* Number of Participants (with room capacity fit check) */}
            <div>
              <label className="form-label">
                Number of Participants <span className="text-red-600">*</span>
              </label>
              <input
                className={`form-input ${
                  isOverCapacity
                    ? 'border-red-500 bg-red-50/40 text-red-900 focus:border-red-600 ring-1 ring-red-200'
                    : ''
                }`}
                type="number"
                min="1"
                value={form.participants}
                onChange={(e) => set('participants', e.target.value)}
                required
              />
              {roomCapacity > 0 && (
                <p className={`text-[10px] font-bold mt-1 ${
                  isOverCapacity ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {isOverCapacity
                    ? `⚠️ Exceeds capacity of ${roomCapacity} pax`
                    : `Room Capacity: ${roomCapacity} Pax`}
                </p>
              )}
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
            
            {/* Real-Time Instant Schedule Conflict Warning */}
            {scheduleConflicts.length > 0 && (
              <div className="col-span-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-900">
                      Schedule Conflict Detected
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      This time slot conflicts with {scheduleConflicts.length} existing event(s) or class(es). Please choose another time or view the schedule.
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 space-y-2 max-h-36 overflow-y-auto">
                  {scheduleConflicts.map((conflict, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-2.5 text-xs border border-red-100 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-red-900 truncate">
                          {conflict.title} {conflict.courseCode ? `(${conflict.courseCode})` : ''}
                        </p>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-red-100 text-red-800 flex-shrink-0">
                          {conflict.type}
                        </span>
                      </div>
                      {conflict.section && (
                        <p className="text-gray-700 mt-0.5 font-medium">
                          {conflict.section} {conflict.college ? `• ${conflict.college}` : ''}
                        </p>
                      )}
                      <p className="text-gray-600 mt-0.5">
                        {conflict.dayOfWeek} {conflict.timeStart} - {conflict.timeEnd} {conflict.instructor ? `• ${conflict.instructor}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {scheduleConflicts.length === 0 && form.room && form.dateOfActivity && form.timeStart && form.timeEnd && (
              <div className="col-span-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <span className="text-xs text-green-700 font-bold">✓ Room is available! No conflicts detected.</span>
              </div>
            )}
            
            {/* Contact Number (Normalized to 09XXXXXXXXX format) */}
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
                Enter 10 digits (e.g. 9171234567). Saved in standard local format (090995...).
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
                <div className="flex items-center gap-4 bg-white p-3 rounded-lg border border-gray-200">
                  <div className="h-16 w-32 border border-gray-200 rounded bg-white flex items-center justify-center p-1 overflow-hidden">
                    <img
                      src={form.requestorSignatureUrl || form.signatureUrl}
                      alt="Signature"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="btn-outline text-xs px-3 py-1.5 cursor-pointer flex items-center gap-1.5 text-gray-700 hover:bg-gray-50">
                      <Upload size={13} /> Change Signature
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
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
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
          <button type="button" onClick={() => submit(true)} disabled={busy} className="btn-outline-maroon flex-1 cursor-pointer">
            {busy ? 'Saving...' : 'Save as Draft'}
          </button>
          <button type="button" onClick={() => submit(false)} disabled={busy} className="btn-maroon flex-1 justify-center cursor-pointer">
            {busy ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
      
    {/* Weekly Room Schedule Modal - Isolated from parent overlay */}
    {showScheduleModal && (
      <RoomWeeklyScheduleModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        room={{
          id: form.room || prefill.room,
          roomCode: form.room || prefill.room,
          name: resolvedTarget.room?.name || form.room || prefill.room,
          docId: targetRoomDocId,
          buildingName: form.building || selectedBuilding?.name || prefill.building,
          capacity: resolvedTarget.room?.capacity || prefill.capacity || 0,
          type: resolvedTarget.room?.type || prefill.roomType || 'Classroom',
          floor: resolvedTarget.floor?.floor || prefill.floor,
        }}
        initialDate={form.dateOfActivity}
      />
    )}

    <LoadingModal isOpen={isLoading} message={loadingMessage} />
    <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
  </>
);
}
