import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { FacebookProvider } from './context/FacebookContext';
import { ContentProvider } from './context/ContentContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ContentListPage } from './pages/ContentListPage';
import { ContentEditorPage } from './pages/ContentEditorPage';
import { ContentDetailPage } from './pages/ContentDetailPage';
import { CalendarPage } from './pages/CalendarPage';
import { LibraryPage } from './pages/LibraryPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FacebookProvider>
          <ContentProvider>
            <Routes>
              {/* Public Auth Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Protected App Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="content" element={<ContentListPage />} />
                <Route path="content/new" element={<ContentEditorPage />} />
                <Route path="content/:id" element={<ContentDetailPage />} />
                <Route path="content/edit/:id" element={<ContentEditorPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="library" element={<LibraryPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </ContentProvider>
        </FacebookProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
