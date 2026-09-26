import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { LiveProvider } from './live.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DeviceDetail from './pages/DeviceDetail.jsx';
import DeviceSettings from './pages/DeviceSettings.jsx';
import AddDevice from './pages/AddDevice.jsx';
import Alerts from './pages/Alerts.jsx';
import Account from './pages/Account.jsx';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash"><img src="/icon.svg" alt="Ginhawa" width="72" height="72" /></div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <LiveProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="devices/new" element={user.role === 'dev' ? <AddDevice /> : <Navigate to="/" replace />} />
          <Route path="devices/:id" element={<DeviceDetail />} />
          <Route path="devices/:id/settings" element={<DeviceSettings />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="account" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </LiveProvider>
  );
}
