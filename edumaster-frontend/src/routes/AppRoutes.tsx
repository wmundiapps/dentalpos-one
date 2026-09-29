import { Navigate, Route, Routes } from "react-router-dom";
import EduMaster from "../pages/EduMaster";
import InstitutionSettings from "../pages/InstitutionSettings";
import Operations from "../pages/Operations";
import Content from "../pages/Content";
import Performance from "../pages/Performance";
import Documents from "../pages/Documents";
import Supply from "../pages/Supply";
import Governance from "../pages/Governance";
import Admission from "../pages/Admission";
import Research from "../pages/Research";
import Legal from "../pages/Legal";
import Forms from "../pages/Forms";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EduMaster />} />
      <Route path="/configuracoes" element={<InstitutionSettings />} />
      <Route path="/operacional" element={<Operations />} />
      <Route path="/conteudo" element={<Content />} />
      <Route path="/desempenho" element={<Performance />} />
      <Route path="/documentos" element={<Documents />} />
      <Route path="/suprimentos" element={<Supply />} />
      <Route path="/governanca" element={<Governance />} />
      <Route path="/captacao" element={<Admission />} />
      <Route path="/pesquisa" element={<Research />} />
      <Route path="/juridico" element={<Legal />} />
      <Route path="/formularios" element={<Forms />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
