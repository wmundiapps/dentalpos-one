export type ClinicalRecordStatus = "DRAFT" | "ACTIVE" | "CLOSED";
export type HabitStatus = "NO" | "YES" | "FORMER" | "NOT_INFORMED";

export interface ClinicalRecordData {
  mainComplaint:string; currentDiseaseHistory:string; dentalHistory:string; medicalHistory:string;
  systemicDiseases:string[]; medications:string[]; allergies:string[]; previousSurgeries:string[]; hospitalizations:string[];
  pregnancy:{applicable:boolean;status:"NO"|"YES"|"SUSPECTED"|"NOT_INFORMED";weeks?:number};
  smoking:{status:"NEVER"|"CURRENT"|"FORMER"|"NOT_INFORMED";details:string}; alcohol:{status:HabitStatus;details:string};
  parafunctionalHabits:string[]; relevantFamilyHistory:string;
  vitalSigns:{systolic?:number;diastolic?:number;glucoseMgDl?:number;measuredAt?:string};
  riskConditions:string[]; clinicalAlerts:string[]; observations:string; diagnosticHypothesis:string; diagnosis:string;
  extraoralExam:string; intraoralExam:string; softTissues:string; tmj:string; occlusion:string; periodontalCondition:string;
  generalDentalCondition:string; initialClinicalPlan:string;
  customFields:Record<string,string|number|boolean|string[]|null>;
}

export interface ClinicalRecordRevision { id:string; revisionNumber:number; dataSnapshot:ClinicalRecordData; riskFlags:string[]; alertSummary?:string|null; changeReason:string; changedFields:string[]; authorId:string; authorName:string; createdAt:string }
export interface ClinicalCustomField { id:string; key:string; label:string; section:string; fieldType:"TEXT"|"TEXTAREA"|"NUMBER"|"BOOLEAN"|"SELECT"|"MULTISELECT"|"DATE"; options:string[]; required:boolean; sensitive:boolean; displayOrder:number; isActive:boolean }
export interface ClinicalPatient { id:string; fullName:string; phone:string; email?:string|null; cpf?:string|null; birthDate?:string|null; gender?:string|null }
export interface PatientClinicalRecord { id?:string; patientId:string; revisionNumber:number; status:ClinicalRecordStatus; data:ClinicalRecordData; riskFlags:string[]; alertSummary?:string|null; responsibleProfessionalId?:string|null; responsibleProfessionalName:string; createdAt?:string; updatedAt?:string }
export interface ClinicalEvolutionSummary { id:string; professionalId?:string|null; professionalName:string; procedure:string; notes:string; nextProcedure:string; nextAppointmentCreated:boolean; createdAt:string }
export interface ClinicalRecordBundle { patient:ClinicalPatient; record:PatientClinicalRecord; revisions:ClinicalRecordRevision[]; customFields:ClinicalCustomField[]; evolutions:ClinicalEvolutionSummary[] }
