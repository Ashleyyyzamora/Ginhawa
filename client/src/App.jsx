import { Navigate, Route, Routes } from 'react-router-dom';
import { LiveProvider } from './live.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DeviceDetail from './pages/DeviceDetail.jsx';
import DeviceSettings from './pages/DeviceSettings.jsx';
import Alerts from './pages/Alerts.jsx';
import Settings from './pages/Settings.jsx';
import AdminLogin from './pages/AdminLogin.jsx';

// No sign-in needed: the app opens straight to the stations.
export default function App() {
  return (
    <LiveProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="devices/:id" element={<DeviceDetail />} />
          <Route path="devices/:id/settings" element={<DeviceSettings />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="settings" element={<Settings />} />
          <Route path="admin" element={<AdminLogin />} />
          <Route path="account" element={<Navigate to="/settings" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </LiveProvider>
  );
}
