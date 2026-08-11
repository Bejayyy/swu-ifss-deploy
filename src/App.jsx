import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { RoleConfigProvider } from './context/RoleConfigContext';
import { DeveloperRoute, PasswordSetupRoute, PublicOnlyRoute, RegistrarRoute } from './components/auth/ProtectedRoute';

import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import DeveloperDashboard from './pages/developer/DeveloperDashboard';
import PasswordSetup from './pages/PasswordSetup';
import Dashboard from './pages/Dashboard';
import ApprovalManagement from './pages/ApprovalManagement';
import BuildingManagement from './pages/BuildingManagement';
import AssignedRoomsManagement from './pages/AssignedRoomsManagement';
import BuildingDetails from './pages/BuildingDetails';
import RoomDetails from './pages/RoomDetails';
import NonAcademicRequestDetails from './pages/NonAcademicRequestDetails';
import AcademicRequestDetails from './pages/AcademicRequestDetails';
import CourseScheduling from './pages/CourseSchedulingNew';
import RoomAvailability from './pages/RoomAvailability';
import RoomFinder from './pages/RoomFinder';
import ScheduleHistory from './pages/ScheduleHistory';
import AcademicCalendar from './pages/AcademicCalendar';
import SystemSettings from './pages/SystemSettings';
import ProfileSettings from './pages/ProfileSettings';

import SystemAdministration from './pages/SystemAdministration';

import ApprovalWorkflowManagement from './pages/ApprovalWorkflowManagement';
import MaintenanceDashboard from './pages/MaintenanceDashboard';
import CollegeInventory from './pages/CollegeInventory';
import TeachersDirectory from './pages/TeachersDirectory';
import CourseInventory from './pages/CourseInventory';
import RescheduleReservation from './pages/RescheduleReservation';

function RegistrarPage({ children }) {
  return <RegistrarRoute>{children}</RegistrarRoute>;
}

export default function App() {
  return (
    <AuthProvider>
      <RoleConfigProvider>
        <AppProvider>
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <Login />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <PublicOnlyRoute>
                  <ForgotPassword />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/set-password"
              element={(
                <PasswordSetupRoute>
                  <PasswordSetup />
                </PasswordSetupRoute>
              )}
            />
            <Route
              path="/developer"
              element={
                <DeveloperRoute>
                  <DeveloperDashboard />
                </DeveloperRoute>
              }
            />
            <Route path="/dashboard" element={<RegistrarPage><Dashboard /></RegistrarPage>} />
            <Route path="/approvals" element={<RegistrarPage><ApprovalManagement /></RegistrarPage>} />
            <Route path="/approval-workflow" element={<RegistrarPage><ApprovalWorkflowManagement /></RegistrarPage>} />
            <Route path="/course-scheduling" element={<RegistrarPage><CourseScheduling /></RegistrarPage>} />
            <Route path="/room-availability" element={<RegistrarPage><RoomAvailability /></RegistrarPage>} />
            <Route path="/room-finder" element={<RegistrarPage><RoomFinder /></RegistrarPage>} />
            <Route path="/schedule-history" element={<RegistrarPage><ScheduleHistory /></RegistrarPage>} />
            <Route path="/building-management" element={<RegistrarPage><BuildingManagement /></RegistrarPage>} />
            <Route path="/assigned-rooms" element={<RegistrarPage><AssignedRoomsManagement /></RegistrarPage>} />
            <Route path="/academic-calendar" element={<RegistrarPage><AcademicCalendar /></RegistrarPage>} />
            <Route path="/system-settings" element={<RegistrarPage><SystemSettings /></RegistrarPage>} />
            <Route path="/profile-settings" element={<RegistrarPage><ProfileSettings /></RegistrarPage>} />


            <Route path="/system-administration" element={<RegistrarPage><SystemAdministration /></RegistrarPage>} />
            <Route path="/college-inventory" element={<RegistrarPage><CollegeInventory /></RegistrarPage>} />
            <Route path="/teachers" element={<RegistrarPage><TeachersDirectory /></RegistrarPage>} />
            <Route path="/courses" element={<RegistrarPage><CourseInventory /></RegistrarPage>} />
            <Route path="/building/:id" element={<RegistrarPage><BuildingDetails /></RegistrarPage>} />
            <Route path="/room/:id" element={<RegistrarPage><RoomDetails /></RegistrarPage>} />
            <Route path="/request/:id" element={<RegistrarPage><NonAcademicRequestDetails /></RegistrarPage>} />
            <Route path="/academic-request/:id" element={<RegistrarPage><AcademicRequestDetails /></RegistrarPage>} />
            <Route path="/maintenance-dashboard" element={<RegistrarPage><MaintenanceDashboard /></RegistrarPage>} />
            <Route path="/reschedule/:reservationId" element={<RegistrarPage><RescheduleReservation /></RegistrarPage>} />
          </Routes>
        </BrowserRouter>
        </AppProvider>
      </RoleConfigProvider>
    </AuthProvider>
  );
}
