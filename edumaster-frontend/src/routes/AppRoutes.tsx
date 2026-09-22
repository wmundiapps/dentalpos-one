import { Navigate, Route, Routes } from "react-router-dom";
import EduMaster from "../pages/EduMaster";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EduMaster />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
