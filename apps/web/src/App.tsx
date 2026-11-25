import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { ZoneDetail } from "@/pages/ZoneDetail";
import { HostsPage } from "@/pages/HostsPage";
import { HostDetailPage } from "@/pages/HostDetailPage";
import { AuditPage } from "@/pages/AuditPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="zones/:zoneId" element={<ZoneDetail />} />
        <Route path="hosts" element={<HostsPage />} />
        <Route path="hosts/:hostId" element={<HostDetailPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
