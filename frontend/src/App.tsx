import Layout from "./components/Layout";
import AppRoutes from "./routes/AppRoutes";
import Login from "./pages/Login";
import PublicBooking from "./pages/PublicBooking";

function currentAppPath() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathname = window.location.pathname;
  if (base && pathname.startsWith(base)) {
    return pathname.slice(base.length) || "/";
  }
  return pathname;
}

export default function App() {
  const appPath = currentAppPath().replace(/\/$/, "") || "/";

  if (appPath === "/agendamento-online") {
    return <PublicBooking />;
  }

  const token = localStorage.getItem("dentalpos.token");
  if (!token) return <Login />;

  return (
    <Layout>
      <AppRoutes />
    </Layout>
  );
}
