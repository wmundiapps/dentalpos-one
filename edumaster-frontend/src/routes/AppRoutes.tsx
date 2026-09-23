import { Navigate, Route, Routes } from "react-router-dom";
import EduMaster from "../pages/EduMaster";
import InstitutionSettings from "../pages/InstitutionSettings";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EduMaster />} />
      <Route path="/configuracoes" element={<InstitutionSettings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
