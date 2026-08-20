# SWU-IFSS — Integrated Facility Scheduling System

An integrated web-based facility and scheduling management system for **Southwestern University PHINMA (SWU)**, built as a Capstone project.

---

## Project Description

SWU-IFSS is a web-based **Integrated Facility Scheduling System** for Southwestern University PHINMA. Its primary feature is **Course Scheduling** — enabling academic departments to plot, manage, and publish class schedules across rooms and time slots for each semester.

### Main Feature — Course Scheduling
- Drag-and-drop weekly schedule grid per room and per teacher
- Semester and school year management
- Conflict detection and schedule locking workflows
- Dean and department-level schedule submission and approval
- Schedule history and room schedule viewer

### Sub-Features
- **Room Reservations** — submit, endorse, and approve room booking requests through a multi-tier approval workflow
- **Maintenance Management** — schedule and track room/facility maintenance requests with GSD staff notifications
- **Room Finder** — search and filter available rooms across buildings by type, capacity, and schedule
- **College & Course Inventory** — manage colleges, departments, and course catalog records
- **Academic Calendar** — configure school year dates, holidays, no-class periods, and exam ranges
- **User & Role Management** — create accounts and assign granular page-level permissions per role
- **AI Chatbot Assistant** — real-time chatbot for answering scheduling and system queries

The system is designed for the following roles:

- **Developer** — full system access; manages developer-level configurations and registrar accounts.
- **Registrar / Super Admin** — manages school years, semesters, college/course inventory, user accounts, roles & permissions, and approval workflows.
- **Dean** — submits and oversees course schedules for their college; manages assigned rooms and endorses reservation requests.
- **Teacher** — views personal course schedules and room availability; submits room reservation requests.
- **GSD Head / Facility Manager** — approves room activity requests and oversees maintenance scheduling across buildings.
- **Student Life** — reviews and approves student organization activity requests.
- **Student / General User** — finds available rooms and submits room reservation requests.


---

## Setup Instructions

### Prerequisites

- **Node.js** ≥ 18.x and **npm** ≥ 9.x
- A **Firebase** project (Firestore, Authentication, and Functions enabled)
- A **Google Gemini API** key (for the AI chatbot)

### 1. Clone the Repository

```bash
git clone https://github.com/<your-org>/swu-ifss-deploy.git
cd swu-ifss-deploy
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Developer account credentials
VITE_DEV_EMAIL=developer@swu-ifss.com
VITE_DEV_PASSWORD=yourSecurePassword
```

### 4. Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 5. Run Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### 6. Build for Production

```bash
npm run build
```

Output is in the `dist/` folder. Deploy with:

```bash
firebase deploy --only hosting
```

---

## File Structure

| Path | Description |
|------|-------------|
| `src/` | All application source code |
| `src/App.jsx` | Root component — routing and layout setup |
| `src/main.jsx` | React entry point |
| `src/index.css` | Global styles and Tailwind CSS base |
| `src/pages/` | Top-level page components (one file per page/view) |
| `src/components/` | Reusable UI components (modals, navigation, scheduling grid, etc.) |
| `src/components/ui/` | Base UI primitives (CustomSelect, DatePicker, TimePicker, buttons) |
| `src/components/modals/` | All modal dialog components |
| `src/components/scheduling/` | Weekly schedule grid and room schedule viewer |
| `src/context/` | React context providers (AuthContext, etc.) |
| `src/firebase/` | Firebase initialization, Firestore helpers, and auth utilities |
| `src/hooks/` | Custom React hooks (useModal, useRolePermissions, etc.) |
| `src/services/` | Business logic and Firestore service functions |
| `src/constants/` | Shared constants (schedule grid config, status codes, etc.) |
| `src/utils/` | Utility/helper functions |
| `src/data/` | Static data and seed files |
| `src/assets/` | Static images and media |
| `functions/` | Firebase Cloud Functions (server-side logic) |
| `firestore.rules` | Firestore security rules |
| `firestore.indexes.json` | Firestore composite indexes |
| `firebase.json` | Firebase hosting and deployment configuration |
| `.env.example` | Environment variable template |
| `vite.config.js` | Vite build configuration |
| `tailwind.config.cjs` | Tailwind CSS configuration |
| `dist/` | Production build output (auto-generated) |

---

## Contact

| Name | Role | Contact |
|------|------|---------|
| **Bejayyy** | Lead Developer | GitHub: [@Bejayyy](https://github.com/Bejayyy) |
| **nshriki** | Developer | GitHub: [@nshriki](https://github.com/nshriki) |
| **johnmarksomogod** | Developer | GitHub: [@johnmarksomogod](https://github.com/johnmarksomogod) |

For questions, bug reports, or contributions, open an issue on the [GitHub repository](https://github.com/Bejayyy/swu-ifss-deploy).

---

## License

**Proprietary — All Rights Reserved**

Copyright © 2024–2026 Southwestern University PHINMA.

This software and its source code are proprietary and confidential. No part of this codebase may be copied, modified, distributed, sublicensed, or used in any form — commercial or otherwise — without the express written permission of the copyright holders.

Unauthorized use, reproduction, or distribution of this software is strictly prohibited and may result in legal action.
