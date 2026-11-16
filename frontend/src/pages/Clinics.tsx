import { EDU_ONLY } from "../config/appMode";
export default function Clinics() {
  return (
    <div>
      <h1>{EDU_ONLY ? "Unidades e polos" : "Clínicas"}</h1>
    </div>
  );
}