/** Sample schedules for building tables & schedule history */
export const buildingSchedulesById = {
  1: [
    { id: 's1', room: 'ENG-101', course: 'SWU-BSIT-A1', subject: 'Data Structures & Algorithms', day: 'Mon', start: '09:00', end: '11:00', professor: 'Dr. A. Reyes', mode: 'Face-to-Face', type: 'Laboratory' },
    { id: 's2', room: 'ENG-102', course: 'SWU-BSEE-B2', subject: 'Circuits II', day: 'Tue', start: '13:00', end: '15:00', professor: 'Engr. L. Cruz', mode: 'Face-to-Face', type: 'Lecture' },
    { id: 's3', room: 'ENG-201', course: 'SWU-BSIT-A1', subject: 'Database Systems', day: 'Wed', start: '10:00', end: '12:00', professor: 'Dr. M. Santos', mode: 'Hybrid', type: 'Laboratory' },
  ],
  2: [
    { id: 's4', room: 'PH-101', course: 'SWU-BA-A3', subject: 'Business Ethics', day: 'Thu', start: '08:00', end: '09:30', professor: 'Prof. J. Lim', mode: 'Face-to-Face', type: 'Classroom' },
  ],
  3: [
    { id: 's5', room: 'MB-101', course: 'SWU-BSIT-C1', subject: 'Networking', day: 'Fri', start: '14:00', end: '17:00', professor: 'Dr. K. Tan', mode: 'Face-to-Face', type: 'Laboratory' },
  ],
  4: [
    { id: 's6', room: 'BB-101', course: 'SWU-BSA-A2', subject: 'Financial Accounting', day: 'Mon', start: '15:00', end: '16:30', professor: 'Prof. R. Go', mode: 'Face-to-Face', type: 'Classroom' },
  ],
};

/** Each dean/professor is a distinct record for schedule tagging history */
export const deanScheduleHistory = [
  {
    id: 'd1',
    dean: 'Dr. John Mark Somoged',
    role: 'Dean of Engineering',
    avatarInitials: 'JS',
    accent: '#7A0808',
    buildingsTagged: 2,
    schedulesTagged: 5,
    isAdmin: true,
    buildings: [
      {
        name: 'Engineering Building',
        pending: 1,
        approved: 3,
        rejected: 0,
        floors: [
          {
            floor: 1,
            rooms: [
              {
                name: 'Room Lab 101',
                items: [
                  { status: 'Approved', tag: 'Laboratory', course: 'SWU-BSIT-A1', subject: 'Data Structures & Algorithms', when: 'Mon · 09:00 AM – 11:00 AM', professor: 'Dr. A. Reyes', mode: 'Face-to-Face' },
                  { status: 'Pending', tag: 'Laboratory', course: 'SWU-BSIT-B2', subject: 'Web Systems', when: 'Wed · 01:00 PM – 04:00 PM', professor: 'Dr. L. Cruz', mode: 'Face-to-Face' },
                ],
              },
            ],
          },
          {
            floor: 2,
            rooms: [
              {
                name: 'ENG-201',
                items: [
                  { status: 'Approved', tag: 'Laboratory', course: 'SWU-BSIT-A1', subject: 'Database Systems', when: 'Wed · 10:00 AM – 12:00 PM', professor: 'Dr. M. Santos', mode: 'Hybrid' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'd2',
    dean: 'Prof. Maria Santos',
    role: 'Dean of Business',
    avatarInitials: 'MS',
    accent: '#7A0808',
    buildingsTagged: 1,
    schedulesTagged: 2,
    isAdmin: false,
    buildings: [
      {
        name: 'Business Building',
        pending: 0,
        approved: 2,
        rejected: 0,
        floors: [
          {
            floor: 1,
            rooms: [
              {
                name: 'BB-101',
                items: [
                  { status: 'Approved', tag: 'Classroom', course: 'SWU-BSA-A2', subject: 'Financial Accounting', when: 'Mon · 03:00 PM – 04:30 PM', professor: 'Prof. R. Go', mode: 'Face-to-Face' },
                  { status: 'Approved', tag: 'Classroom', course: 'SWU-BSA-B1', subject: 'Management', when: 'Thu · 08:00 AM – 09:30 AM', professor: 'Prof. R. Go', mode: 'Face-to-Face' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'd3',
    dean: 'Dr. Elena Vargas',
    role: 'Program Chair · BSIT',
    avatarInitials: 'EV',
    accent: '#991B1B',
    buildingsTagged: 1,
    schedulesTagged: 3,
    isAdmin: false,
    buildings: [
      {
        name: 'Phinma Hall',
        pending: 1,
        approved: 2,
        rejected: 0,
        floors: [
          {
            floor: 1,
            rooms: [
              {
                name: 'PH-101',
                items: [
                  { status: 'Approved', tag: 'Classroom', course: 'SWU-BA-A3', subject: 'Business Ethics', when: 'Thu · 08:00 AM – 09:30 AM', professor: 'Prof. J. Lim', mode: 'Face-to-Face' },
                  { status: 'Pending', tag: 'Lecture Hall', course: 'SWU-BSIT-C2', subject: 'Capstone', when: 'Fri · 01:00 PM – 04:00 PM', professor: 'Dr. E. Vargas', mode: 'Hybrid' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];
