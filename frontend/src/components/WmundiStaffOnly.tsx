import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { readSessionUser } from "../services/DemoAccess";

/** A lista de e-mails da equipe vive só no servidor (WMUNDI_STAFF_EMAILS); aqui só lemos o resultado do login. */
export function isWmundiStaff(): boolean {
  return readSessionUser()?.isWmundiStaff === true;
}

export default function WmundiStaffOnly({ children }: { children: ReactNode }) {
  if (!isWmundiStaff()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
