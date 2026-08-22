import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  subscribeToBuildings,
  createBuilding,
  addFloorToBuilding,
  addRoomToFloor,
  updateBuildingRecord,
  deleteBuildingRecord,
  updateRoomRecord,
} from '../services/buildingService';
import {
  subscribeRoomReservations,
  createRoomReservation,
  updateRoomReservation,
  processApprovalAction,
  submitDraftReservation,
} from '../services/reservationService';
import { useAuth } from './AuthContext';

const AppContext = createContext(null);

export const buildings = [
  {
    id: 1, name: 'Engineering Building', code: 'ENG',
    image: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=400&q=80',
    floors: 4, totalRooms: 32, manager: 'Dr. John Mark Somoged',
    contact: '+63-xxx-xxx-xxx', email: 'jace.somoged.edu@phinmail.net',
    floorData: [
      { floor: 1, rooms: [
        { id: 'ENG-101', name: 'ENG-101', type: 'Classroom', status: 'Available', capacity: 50, equipment: ['Projector','Whiteboard','Air Conditioning'] },
        { id: 'ENG-102', name: 'ENG-102', type: 'Classroom', status: 'Occupied', capacity: 50, equipment: ['Projector','Whiteboard'] },
      ]},
      { floor: 2, rooms: [
        { id: 'ENG-201', name: 'ENG-201', type: 'Laboratory', status: 'Available', capacity: 40, equipment: ['Computers','Projector','Air Conditioning'] },
        { id: 'ENG-202', name: 'ENG-202', type: 'Seminar Room', status: 'Maintenance', capacity: 30, equipment: ['Projector','Audio System'] },
      ]},
      { floor: 3, rooms: [
        { id: 'ENG-301', name: 'ENG-301', type: 'Lecture Room', status: 'Available', capacity: 80, equipment: ['Projector','Whiteboard','Audio System','Air Conditioning'] },
      ]},
      { floor: 4, rooms: [
        { id: 'ENG-401', name: 'ENG-401', type: 'Conference Room', status: 'Available', capacity: 20, equipment: ['Projector','Whiteboard','Air Conditioning'] },
      ]},
    ]
  },
  {
    id: 2, name: 'Phinma Hall', code: 'PH',
    image: 'https://images.unsplash.com/photo-1562774053-701939374585?w=400&q=80',
    floors: 6, totalRooms: 148, manager: 'Prof. Maria Santos',
    contact: '+63-xxx-xxx-xxx', email: 'maria.santos@phinmail.net',
    floorData: [
      { floor: 1, rooms: [
        { id: 'PH-101', name: 'PH-101', type: 'Classroom', status: 'Available', capacity: 45, equipment: ['Projector','Whiteboard'] },
        { id: 'PH-102', name: 'PH-102', type: 'Classroom', status: 'Occupied', capacity: 45, equipment: ['Projector','Whiteboard'] },
      ]},
    ]
  },
  {
    id: 3, name: 'Merlo Building', code: 'MB',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80',
    floors: 3, totalRooms: 30, manager: 'Dr. Jose Reyes',
    contact: '+63-xxx-xxx-xxx', email: 'jose.reyes@phinmail.net',
    floorData: [
      { floor: 1, rooms: [
        { id: 'MB-101', name: 'MB-101', type: 'Laboratory', status: 'Available', capacity: 35, equipment: ['Computers','Projector'] },
      ]},
    ]
  },
  {
    id: 4, name: 'Business Building', code: 'BB',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&q=80',
    floors: 2, totalRooms: 20, manager: 'Prof. Ana Cruz',
    contact: '+63-xxx-xxx-xxx', email: 'ana.cruz@phinmail.net',
    floorData: [
      { floor: 1, rooms: [
        { id: 'BB-101', name: 'BB-101', type: 'Classroom', status: 'Available', capacity: 40, equipment: ['Projector','Whiteboard'] },
      ]},
    ]
  },
];

export const defaultAcademicSteps = (gsdApplicable = true) => {
  const base = [
    { role: 'Dean', approvedBy: '', approved: false },
  ];
  if (gsdApplicable) {
    base.push({ role: 'GSD (General Services)', approvedBy: '', approved: false });
  }
  base.push({ role: 'Registrar (Super Admin)', approvedBy: '', approved: false });
  return base;
};

export const defaultNonAcademicSteps = (underMedicine = false) => {
  const base = [
    { role: 'Requestor Signature', name: '', signature: '', signed: false },
    { role: 'Student Life', name: '', signature: '', signed: false },
    { role: 'College Department', name: '', signature: '', signed: false },
  ];
  if (underMedicine) {
    base.push({ role: 'Medicine', name: '', signature: '', signed: false });
  }
  base.push({ role: 'GSD', name: '', signature: '', signed: false });
  base.push({ role: 'Registrar', name: '', signature: '', signed: false });
  return base;
};

export const sampleRequests = [
  {
    id: 1, type: 'academic', reqType: 'Lab Access',
    title: 'Lab Access: Bio-Genetics 101', department: 'Biology Department',
    requestor: 'Dr. Elias Thoma', venue: 'Bio Lab 4', participants: 25,
    dateStart: 'April 12, 2025', timeStart: '12:00 PM', timeEnd: '04:00 PM',
    status: 'Pending', priority: 'High',
    objectives: 'Doctoral laboratory session for senior genetics coursework.',
    courseCode: 'BIO-101', courseDesc: 'Bio-Genetics 101', semester: '2nd Semester',
    instructor: 'Dr. Elias Thoma', numStudents: 25,
    building: 'Engineering Building', floor: 'Floor 1', room: 'Bio Lab 4',
    dateField: '2025-04-12', specificVenue: 'Lab 4, Engineering Building Floor 1',
    dateFiled: '2025-04-04',
    gsdApplicable: true,
    deliveryMode: 'Face-to-Face',
    approvalSteps: defaultAcademicSteps(true),
  },
  {
    id: 2, type: 'academic', reqType: 'Room Reservation',
    title: 'IT Days: UI/UX Session', department: 'BS Information Technology',
    requestor: 'Dr. John Marl', venue: 'PH 130', participants: 80,
    dateStart: 'April 5, 2026', timeStart: '07:00 AM', timeEnd: '04:00 PM',
    status: 'Approved', priority: 'Medium',
    objectives: 'Doctoral laboratory session for senior genetics coursework.',
    courseCode: 'IT-401', courseDesc: 'UI/UX Design', semester: '1st Semester',
    instructor: 'Dr. John Marl', numStudents: 80,
    building: 'Phinma Hall', floor: 'Floor 1', room: 'PH 130',
    dateField: '2025-04-05', specificVenue: 'Phinma Hall 1st Floor',
    dateFiled: '2025-04-01',
    gsdApplicable: false,
    deliveryMode: 'Hybrid',
    approvalSteps: defaultAcademicSteps(false).map((s, i, arr) =>
      i < arr.length - 1 ? { ...s, signed: true, name: 'Approver', signature: 'Approver' } : { ...s, signed: true, name: 'Registrar Office', signature: 'Registrar Office' }
    ),
  },
  {
    id: 3, type: 'non-academic',
    title: 'SWU Annual Foundation Week', department: 'Student Life Office',
    requestor: 'Ryan Mendoza', venue: 'Gymnasium', participants: 500,
    dateStart: 'April 20, 2026', timeStart: '08:00 AM', timeEnd: '06:00 PM',
    status: 'Pending', priority: 'High',
    nameOfOrg: 'Student Life Office', activity: 'SWU Annual Foundation Week',
    objectives: 'Stanford boundary journey for cancer genetics coursework.',
    designatedVenue: 'Gymnasium, Main Campus',
    specialRequirements: 'Sound System, Stage, Chairs',
    dateFiled: '2025-04-04',
    approvalSteps: [
      { role: 'Requestor Signature', name: '', signature: '', signed: false },
      { role: 'Student Life', name: '', signature: '', signed: false },
      { role: 'College Department', name: '', signature: '', signed: false },
      { role: 'GSD', name: '', signature: '', signed: false },
      { role: 'Registrar', name: '', signature: '', signed: false },
    ]
  },
];

const sampleUsers = [
  { id: 1, name: 'Kint Lataza', email: 'kint.lataza@swu.edu.ph', role: 'Head of Registrar', department: 'Registrar', status: 'Active', initials: 'KL' },
  { id: 2, name: 'Dr. John Mark Somoged', email: 'jace.somoged.edu@phinmail.net', role: 'Dean', department: 'Engineering', status: 'Active', initials: 'JS' },
  { id: 3, name: 'Prof. Maria Santos', email: 'maria.santos@phinmail.net', role: 'Department Head', department: 'Business', status: 'Active', initials: 'MS' },
  { id: 4, name: 'Ana Cruz', email: 'ana.cruz@phinmail.net', role: 'Teacher', department: 'Business', status: 'Inactive', initials: 'AC' },
  { id: 5, name: 'Ryan Mendoza', email: 'ryan.m@swu.edu.ph', role: 'Organization Head', department: 'Student Life', status: 'Active', initials: 'RM' },
];

export function AppProvider({ children }) {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [buildingList, setBuildingList] = useState([]);
  const [buildingsLoading, setBuildingsLoading] = useState(true);
  const [buildingsError, setBuildingsError] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState(null);
  const [users, setUsers] = useState(sampleUsers);
  const [expandedBuildings, setExpandedBuildings] = useState({});
  const [expandedFloors, setExpandedFloors] = useState({});

  // Wait for both auth and profile to be ready before fetching data
  const isReady = !authLoading && firebaseUser && profile;

  useEffect(() => {
    // Don't fetch buildings until user profile is loaded
    // Developer doesn't need buildings data (and doesn't have Firestore access)
    if (!isReady || profile?.role === 'developer') {
      setBuildingsLoading(authLoading);
      return undefined;
    }

    setBuildingsLoading(true);
    setBuildingsError(null);
    
    const unsub = subscribeToBuildings(
      (list) => {
        setBuildingList(list);
        setBuildingsLoading(false);
        setBuildingsError(null);
      },
      (err) => {
        console.error('Buildings subscription error:', err);
        setBuildingsError(err.message || 'Failed to load buildings.');
        setBuildingsLoading(false);
      },
    );
    return unsub;
  }, [isReady, authLoading, firebaseUser, profile]);

  useEffect(() => {
    // Don't fetch reservations until user profile is loaded
    // Developer doesn't need reservations data (and doesn't have Firestore access)
    if (!isReady || profile?.role === 'developer') {
      setRequestsLoading(authLoading);
      return undefined;
    }

    setRequestsLoading(true);
    setRequestsError(null);
    
    const unsub = subscribeRoomReservations(
      (list) => {
        setRequests(list);
        setRequestsLoading(false);
        setRequestsError(null);
      },
      (err) => {
        console.error('Reservations subscription error:', err);
        setRequestsError(err.message || 'Failed to load reservations.');
        setRequestsLoading(false);
      },
      profile, // Pass user profile for role-based filtering
    );
    return unsub;
  }, [isReady, authLoading, firebaseUser, profile]);

  const addBuilding = async (b) => {
    await createBuilding({
      name: b.name,
      prefix: b.prefix,
      numFloors: b.numFloors,
      roomsPerFloor: b.roomsPerFloor,
      floorNames: b.floorNames,
      image: b.image,
      contact: b.contact,
      email: b.email,
    });
  };

  const addFloor = async (buildingId, label) => addFloorToBuilding(buildingId, label);

  const addRoom = async (buildingId, floorId, floorNumber, room) => {
    await addRoomToFloor(buildingId, floorId, floorNumber, room);
  };

  const updateRoom = async (buildingId, floorId, roomDocId, patch) => {
    await updateRoomRecord(buildingId, floorId, roomDocId, patch);
  };
  const addRequest = useCallback(async (r, { draft = false } = {}) => {
    const created = await createRoomReservation(
      {
        ...r,
        createdByUid: firebaseUser?.uid || r.createdByUid,
        requestorEmail: r.requestorEmail || firebaseUser?.email,
      },
      { draft },
    );
    return created;
  }, [firebaseUser]);

  const updateRequest = useCallback(async (id, updates) => {
    await updateRoomReservation(id, updates);
  }, []);

  const approveReservation = useCallback(async (reservationId, { action, remarks, approverUid, approverName, approverRole, signatureUrl }) => {
    await processApprovalAction({
      reservationId,
      action,
      remarks,
      approverUid,
      approverName,
      approverRole,
      signatureUrl,
    });
  }, []);

  const submitReservation = useCallback(async (reservationId) => {
    await submitDraftReservation(reservationId);
  }, []);
  const addUser = (u) => {
    const parts = (u.name || '').trim().split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0]?.[0] || '?');
    setUsers(prev => [...prev, { ...u, id: Date.now(), status: 'Active', initials: initials.toUpperCase() }]);
  };
  const toggleBuilding = (id) => setExpandedBuildings(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleFloor = (key) => setExpandedFloors(prev => ({ ...prev, [key]: !prev[key] }));
  const updateBuilding = async (buildingId, patch) => {
    await updateBuildingRecord(buildingId, patch);
  };
  const deleteBuilding = async (buildingId) => {
    await deleteBuildingRecord(buildingId);
  };

  return (
    <AppContext.Provider value={{
      buildingList,
      buildingsLoading,
      buildingsError,
      requests,
      requestsLoading,
      requestsError,
      users,
      expandedBuildings,
      expandedFloors,
      addBuilding,
      addFloor,
      addRoom,
      updateRoom,
      addRequest,
      updateRequest,
      approveReservation,
      submitReservation,
      addUser,
      updateBuilding,
      deleteBuilding,
      toggleBuilding,
      toggleFloor,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
