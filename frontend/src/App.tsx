import Layout from "./components/Layout";
import AppRoutes from "./routes/AppRoutes";
import Login from "./pages/Login";
import PublicBooking from "./pages/PublicBooking";
export default function App() {
  if(window.location.pathname==="/agendamento-online") return <PublicBooking/>;
  const token=localStorage.getItem('dentalpos.token');
  if(!token) return <Login/>;
  return <Layout><AppRoutes /></Layout>;
}
