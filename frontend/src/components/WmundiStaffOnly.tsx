import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { readSessionUser } from "../services/DemoAccess";

const WMUNDI_STAFF_EMAILS = ["contato@dentalpos.com.br"];

export function isWmundiStaff(): boolean {
  const user = readSessionUser();
  const email = (user?.email || "").toLowerCase();
  return WMUNDI_STAFF_EMAILS.includes(email);
}

export default function WmundiStaffOnly({ children }: { children: ReactNode }) {
  if (!isWmundiStaff()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
