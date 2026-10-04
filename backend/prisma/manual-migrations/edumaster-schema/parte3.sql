-- EduMaster Pro: schema isolado "edumaster" (nao toca no schema public). Parte 3 de 3. Rode as partes em ordem.
BEGIN;
SET LOCAL search_path TO edumaster;

-- CreateIndex
CREATE UNIQUE INDEX "TenantStorageConfig_clinicId_provider_key" ON "TenantStorageConfig"("clinicId", "provider");

-- CreateIndex
CREATE INDEX "TenantFeatureFlag_tenantId_idx" ON "TenantFeatureFlag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantFeatureFlag_clinicId_key_key" ON "TenantFeatureFlag"("clinicId", "key");

-- CreateIndex
CREATE INDEX "RevahSender_tenantId_idx" ON "RevahSender"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RevahSender_clinicId_channel_address_key" ON "RevahSender"("clinicId", "channel", "address");

-- CreateIndex
CREATE INDEX "LeadImport_clinicId_source_idx" ON "LeadImport"("clinicId", "source");

-- CreateIndex
CREATE INDEX "LeadImport_tenantId_idx" ON "LeadImport"("tenantId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_clinicId_createdAt_idx" ON "IntegrationWebhookEvent"("clinicId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebhookEvent_provider_externalEventId_key" ON "IntegrationWebhookEvent"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "BankConnection_clinicId_isActive_idx" ON "BankConnection"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "BankConnection_tenantId_idx" ON "BankConnection"("tenantId");

-- CreateIndex
CREATE INDEX "ExpenseImportRule_clinicId_isActive_idx" ON "ExpenseImportRule"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "FinancialDocument_clinicId_status_idx" ON "FinancialDocument"("clinicId", "status");

-- CreateIndex
CREATE INDEX "FinancialDocument_tenantId_idx" ON "FinancialDocument"("tenantId");

-- CreateIndex
CREATE INDEX "RevahAutomation_clinicId_isActive_idx" ON "RevahAutomation"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "RevahAutomation_tenantId_idx" ON "RevahAutomation"("tenantId");

-- CreateIndex
CREATE INDEX "SalesLeadEvent_clinicId_leadId_createdAt_idx" ON "SalesLeadEvent"("clinicId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesLeadEvent_tenantId_idx" ON "SalesLeadEvent"("tenantId");

-- CreateIndex
CREATE INDEX "RevahConversation_clinicId_status_lastMessageAt_idx" ON "RevahConversation"("clinicId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "RevahConversation_tenantId_idx" ON "RevahConversation"("tenantId");

-- CreateIndex
CREATE INDEX "RevahConversationMessage_clinicId_conversationId_createdAt_idx" ON "RevahConversationMessage"("clinicId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "RevahConversationMessage_tenantId_idx" ON "RevahConversationMessage"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SmartSchedulingPolicy_clinicId_key" ON "SmartSchedulingPolicy"("clinicId");

-- CreateIndex
CREATE INDEX "SmartSchedulingPolicy_tenantId_idx" ON "SmartSchedulingPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "SmartProcedureRule_clinicId_isActive_idx" ON "SmartProcedureRule"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "SmartProcedureRule_tenantId_idx" ON "SmartProcedureRule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SmartProcedureRule_clinicId_procedureKey_key" ON "SmartProcedureRule"("clinicId", "procedureKey");

-- CreateIndex
CREATE INDEX "SmartLaboratoryRule_clinicId_isActive_idx" ON "SmartLaboratoryRule"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "SmartLaboratoryRule_tenantId_idx" ON "SmartLaboratoryRule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SmartLaboratoryRule_clinicId_laboratoryName_serviceKey_key" ON "SmartLaboratoryRule"("clinicId", "laboratoryName", "serviceKey");

-- CreateIndex
CREATE INDEX "PatientSchedulingPreference_tenantId_idx" ON "PatientSchedulingPreference"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientSchedulingPreference_clinicId_patientId_key" ON "PatientSchedulingPreference"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "SmartSchedulingDecision_clinicId_patientId_createdAt_idx" ON "SmartSchedulingDecision"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "SmartSchedulingDecision_clinicId_status_idx" ON "SmartSchedulingDecision"("clinicId", "status");

-- CreateIndex
CREATE INDEX "SmartSchedulingDecision_appointmentId_idx" ON "SmartSchedulingDecision"("appointmentId");

-- CreateIndex
CREATE INDEX "SmartSchedulingDecision_tenantId_idx" ON "SmartSchedulingDecision"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalDocumentTemplate_clinicId_documentType_idx" ON "ClinicalDocumentTemplate"("clinicId", "documentType");

-- CreateIndex
CREATE INDEX "ClinicalDocumentTemplate_tenantId_idx" ON "ClinicalDocumentTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalDocument_clinicId_patientId_idx" ON "ClinicalDocument"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "ClinicalDocument_tenantId_idx" ON "ClinicalDocument"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalDocument_documentType_status_idx" ON "ClinicalDocument"("documentType", "status");

-- CreateIndex
CREATE INDEX "ClinicalDocumentHistory_clinicId_documentId_idx" ON "ClinicalDocumentHistory"("clinicId", "documentId");

-- CreateIndex
CREATE INDEX "ClinicalDocumentHistory_tenantId_idx" ON "ClinicalDocumentHistory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalDocumentHistory_documentId_version_key" ON "ClinicalDocumentHistory"("documentId", "version");

-- CreateIndex
CREATE INDEX "ClinicalFileCategory_clinicId_kind_idx" ON "ClinicalFileCategory"("clinicId", "kind");

-- CreateIndex
CREATE INDEX "ClinicalFileCategory_tenantId_idx" ON "ClinicalFileCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalFileCategory_clinicId_name_key" ON "ClinicalFileCategory"("clinicId", "name");

-- CreateIndex
CREATE INDEX "ClinicalFile_clinicId_patientId_createdAt_idx" ON "ClinicalFile"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalFile_tenantId_idx" ON "ClinicalFile"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicalFile_patientId_kind_idx" ON "ClinicalFile"("patientId", "kind");

-- CreateIndex
CREATE INDEX "ClinicalFile_categoryId_idx" ON "ClinicalFile"("categoryId");

-- CreateIndex
CREATE INDEX "ClinicalFile_treatmentItemId_idx" ON "ClinicalFile"("treatmentItemId");

-- CreateIndex
CREATE INDEX "ClinicalFile_clinicalEvolutionId_idx" ON "ClinicalFile"("clinicalEvolutionId");

-- CreateIndex
CREATE INDEX "ClinicalFile_storageStatus_idx" ON "ClinicalFile"("storageStatus");

-- CreateIndex
CREATE INDEX "SpecializedClinicalRecord_clinicId_patientId_specialty_idx" ON "SpecializedClinicalRecord"("clinicId", "patientId", "specialty");

-- CreateIndex
CREATE INDEX "SpecializedClinicalRecord_clinicId_specialty_status_idx" ON "SpecializedClinicalRecord"("clinicId", "specialty", "status");

-- CreateIndex
CREATE INDEX "SpecializedClinicalRecord_tenantId_idx" ON "SpecializedClinicalRecord"("tenantId");

-- CreateIndex
CREATE INDEX "SpecializedClinicalEvolution_clinicId_patientId_occurredAt_idx" ON "SpecializedClinicalEvolution"("clinicId", "patientId", "occurredAt");

-- CreateIndex
CREATE INDEX "SpecializedClinicalEvolution_clinicId_recordId_occurredAt_idx" ON "SpecializedClinicalEvolution"("clinicId", "recordId", "occurredAt");

-- CreateIndex
CREATE INDEX "SpecializedClinicalEvolution_tenantId_idx" ON "SpecializedClinicalEvolution"("tenantId");

-- CreateIndex
CREATE INDEX "SpecializedClinicalAttachment_clinicId_patientId_category_idx" ON "SpecializedClinicalAttachment"("clinicId", "patientId", "category");

-- CreateIndex
CREATE INDEX "SpecializedClinicalAttachment_clinicId_recordId_idx" ON "SpecializedClinicalAttachment"("clinicId", "recordId");

-- CreateIndex
CREATE INDEX "SpecializedClinicalAttachment_tenantId_idx" ON "SpecializedClinicalAttachment"("tenantId");

-- CreateIndex
CREATE INDEX "SpecializedClinicalAttachment_clinicalFileId_idx" ON "SpecializedClinicalAttachment"("clinicalFileId");

-- CreateIndex
CREATE INDEX "FinancialAlertResolution_tenantId_status_idx" ON "FinancialAlertResolution"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FinancialAlertResolution_patientId_idx" ON "FinancialAlertResolution"("patientId");

-- CreateIndex
CREATE INDEX "FinancialAlertResolution_supplierId_idx" ON "FinancialAlertResolution"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAlertResolution_clinicId_sourceEntityType_sourceEn_key" ON "FinancialAlertResolution"("clinicId", "sourceEntityType", "sourceEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAlertResolution_sequence_key" ON "OperationalAlertResolution"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAlertResolution_protocol_key" ON "OperationalAlertResolution"("protocol");

-- CreateIndex
CREATE INDEX "OperationalAlertResolution_clinicId_tenantId_resolvedAt_idx" ON "OperationalAlertResolution"("clinicId", "tenantId", "resolvedAt");

-- CreateIndex
CREATE INDEX "OperationalAlertResolution_clinicId_alertKey_idx" ON "OperationalAlertResolution"("clinicId", "alertKey");

-- CreateIndex
CREATE INDEX "OperationalAlertResolution_clinicId_sourceEntityType_source_idx" ON "OperationalAlertResolution"("clinicId", "sourceEntityType", "sourceEntityId");

-- CreateIndex
CREATE INDEX "PlatformFeedback_clinicId_idx" ON "PlatformFeedback"("clinicId");

-- CreateIndex
CREATE INDEX "PlatformFeedback_status_idx" ON "PlatformFeedback"("status");

-- CreateIndex
CREATE INDEX "PlatformFeedback_createdAt_idx" ON "PlatformFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "DoctorDocument_doctorId_idx" ON "DoctorDocument"("doctorId");

-- CreateIndex
CREATE INDEX "DoctorDocument_clinicId_idx" ON "DoctorDocument"("clinicId");

-- CreateIndex
CREATE INDEX "DoctorDocument_expiresAt_idx" ON "DoctorDocument"("expiresAt");

-- CreateIndex
CREATE INDEX "PaymentAccount_clinicId_idx" ON "PaymentAccount"("clinicId");

-- CreateIndex
CREATE INDEX "PaymentAccount_doctorId_idx" ON "PaymentAccount"("doctorId");

-- CreateIndex
CREATE INDEX "PaymentAccount_tenantId_clinicId_idx" ON "PaymentAccount"("tenantId", "clinicId");

-- CreateIndex
CREATE INDEX "PartnershipAgreement_clinicId_idx" ON "PartnershipAgreement"("clinicId");

-- CreateIndex
CREATE INDEX "PartnershipAgreement_doctorId_idx" ON "PartnershipAgreement"("doctorId");

-- CreateIndex
CREATE INDEX "PartnershipAgreement_tenantId_clinicId_idx" ON "PartnershipAgreement"("tenantId", "clinicId");

-- CreateIndex
CREATE INDEX "AgreementProcedurePrice_agreementId_idx" ON "AgreementProcedurePrice"("agreementId");

-- CreateIndex
CREATE INDEX "SingleChargeTerm_clinicId_idx" ON "SingleChargeTerm"("clinicId");

-- CreateIndex
CREATE INDEX "SingleChargeTerm_agreementId_idx" ON "SingleChargeTerm"("agreementId");

-- CreateIndex
CREATE INDEX "ChargeGroup_clinicId_idx" ON "ChargeGroup"("clinicId");

-- CreateIndex
CREATE INDEX "ChargeGroup_patientId_idx" ON "ChargeGroup"("patientId");

-- CreateIndex
CREATE INDEX "ChargeGroup_tenantId_clinicId_idx" ON "ChargeGroup"("tenantId", "clinicId");

-- CreateIndex
CREATE INDEX "BeneficiaryCharge_clinicId_idx" ON "BeneficiaryCharge"("clinicId");

-- CreateIndex
CREATE INDEX "BeneficiaryCharge_chargeGroupId_idx" ON "BeneficiaryCharge"("chargeGroupId");

-- CreateIndex
CREATE INDEX "BeneficiaryCharge_doctorId_idx" ON "BeneficiaryCharge"("doctorId");

-- CreateIndex
CREATE INDEX "BeneficiaryCharge_status_dueDate_idx" ON "BeneficiaryCharge"("status", "dueDate");

-- CreateIndex
CREATE INDEX "BeneficiaryCharge_tenantId_clinicId_idx" ON "BeneficiaryCharge"("tenantId", "clinicId");

-- CreateIndex
CREATE INDEX "ChargeCalculation_chargeId_idx" ON "ChargeCalculation"("chargeId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_status_idx" ON "PaymentWebhookEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CreditWallet_clinicId_kind_key" ON "CreditWallet"("clinicId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_idempotencyKey_key" ON "CreditLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditLedger_walletId_createdAt_idx" ON "CreditLedger"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_clinicId_kind_createdAt_idx" ON "CreditLedger"("clinicId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "CreditPurchase_clinicId_status_idx" ON "CreditPurchase"("clinicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlanAllowance_plan_kind_key" ON "PlanAllowance"("plan", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_financialEntryId_key" ON "FiscalDocument"("financialEntryId");

-- CreateIndex
CREATE INDEX "FiscalDocument_clinicId_status_idx" ON "FiscalDocument"("clinicId", "status");

-- CreateIndex
CREATE INDEX "FiscalSendRecord_fiscalDocumentId_idx" ON "FiscalSendRecord"("fiscalDocumentId");

-- CreateIndex
CREATE INDEX "FiscalSendRecord_clinicId_status_idx" ON "FiscalSendRecord"("clinicId", "status");

-- CreateIndex
CREATE INDEX "FiscalAlert_clinicId_resolved_idx" ON "FiscalAlert"("clinicId", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalAlert_fiscalDocumentId_code_key" ON "FiscalAlert"("fiscalDocumentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalRule_clinicId_key" ON "FiscalRule"("clinicId");

-- CreateIndex
CREATE INDEX "RecurringBill_clinicId_isActive_idx" ON "RecurringBill"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "RecurringBill_tenantId_idx" ON "RecurringBill"("tenantId");

-- CreateIndex
CREATE INDEX "TeamMember_clinicId_idx" ON "TeamMember"("clinicId");

-- CreateIndex
CREATE INDEX "TeamMember_tenantId_idx" ON "TeamMember"("tenantId");

-- CreateIndex
CREATE INDEX "LabNotification_clinicId_workRef_idx" ON "LabNotification"("clinicId", "workRef");

-- CreateIndex
CREATE INDEX "LabNotification_status_scheduledFor_idx" ON "LabNotification"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "LabOrder_clinicId_deletedAt_idx" ON "LabOrder"("clinicId", "deletedAt");

-- CreateIndex
CREATE INDEX "LabOrder_tenantId_idx" ON "LabOrder"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LabOrder_clinicId_localId_key" ON "LabOrder"("clinicId", "localId");

-- CreateIndex
CREATE INDEX "ReceivableCharge_financialEntryId_idx" ON "ReceivableCharge"("financialEntryId");

-- CreateIndex
CREATE INDEX "ReceivableCharge_clinicId_status_idx" ON "ReceivableCharge"("clinicId", "status");

-- CreateIndex
CREATE INDEX "ReceivableCharge_tenantId_idx" ON "ReceivableCharge"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivableCharge_clinicId_externalId_key" ON "ReceivableCharge"("clinicId", "externalId");

-- CreateIndex
CREATE INDEX "PaymentSplitLine_clinicId_doctorId_idx" ON "PaymentSplitLine"("clinicId", "doctorId");

-- CreateIndex
CREATE INDEX "PaymentSplitLine_chargeId_idx" ON "PaymentSplitLine"("chargeId");

-- CreateIndex
CREATE INDEX "PaymentSplitLine_tenantId_idx" ON "PaymentSplitLine"("tenantId");

-- CreateIndex
CREATE INDEX "DunningNotice_clinicId_status_scheduledFor_idx" ON "DunningNotice"("clinicId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "DunningNotice_clinicId_createdAt_idx" ON "DunningNotice"("clinicId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DunningNotice_financialEntryId_stage_channel_key" ON "DunningNotice"("financialEntryId", "stage", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "EduInstitution_tenantId_key" ON "EduInstitution"("tenantId");

-- CreateIndex
CREATE INDEX "EduBrandAsset_tenantId_kind_idx" ON "EduBrandAsset"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "EduBrandAsset_tenantId_campusId_idx" ON "EduBrandAsset"("tenantId", "campusId");

-- CreateIndex
CREATE INDEX "EduSpace_tenantId_tipo_idx" ON "EduSpace"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "EduSpace_tenantId_campusId_idx" ON "EduSpace"("tenantId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "EduSpace_tenantId_codigo_key" ON "EduSpace"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "EduReminder_tenantId_status_remindAt_idx" ON "EduReminder"("tenantId", "status", "remindAt");

-- CreateIndex
CREATE INDEX "EduReminder_tenantId_refType_refId_idx" ON "EduReminder"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "EduReminder_tenantId_assigneeUserId_status_idx" ON "EduReminder"("tenantId", "assigneeUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EduReminder_tenantId_dedupeKey_key" ON "EduReminder"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "EduNotification_tenantId_status_agendadoPara_idx" ON "EduNotification"("tenantId", "status", "agendadoPara");

-- CreateIndex
CREATE INDEX "EduNotification_tenantId_userId_status_idx" ON "EduNotification"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "EduNotification_tenantId_studentId_idx" ON "EduNotification"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "EduAuditEvent_tenantId_modulo_createdAt_idx" ON "EduAuditEvent"("tenantId", "modulo", "createdAt");

-- CreateIndex
CREATE INDEX "EduAuditEvent_tenantId_refType_refId_idx" ON "EduAuditEvent"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "Campus_tenantId_idx" ON "Campus"("tenantId");

-- CreateIndex
CREATE INDEX "AcademicProgram_tenantId_idx" ON "AcademicProgram"("tenantId");

-- CreateIndex
CREATE INDEX "Discipline_tenantId_idx" ON "Discipline"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumDiscipline_programId_disciplineId_key" ON "CurriculumDiscipline"("programId", "disciplineId");

-- CreateIndex
CREATE INDEX "AcademicTerm_tenantId_idx" ON "AcademicTerm"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_ra_key" ON "Student"("ra");

-- CreateIndex
CREATE INDEX "Student_tenantId_idx" ON "Student"("tenantId");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_idx" ON "Enrollment"("studentId");

-- CreateIndex
CREATE INDEX "Enrollment_programId_idx" ON "Enrollment"("programId");

-- CreateIndex
CREATE INDEX "ClassSection_tenantId_idx" ON "ClassSection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSectionEnrollment_enrollmentId_classSectionId_key" ON "ClassSectionEnrollment"("enrollmentId", "classSectionId");

-- CreateIndex
CREATE INDEX "ClassSession_classSectionId_idx" ON "ClassSession"("classSectionId");

-- CreateIndex
CREATE INDEX "ClassSession_dataHoraInicio_idx" ON "ClassSession"("dataHoraInicio");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSessionBooking_classSessionId_studentId_key" ON "ClassSessionBooking"("classSessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_classSessionId_studentId_key" ON "Attendance"("classSessionId", "studentId");

-- CreateIndex
CREATE INDEX "ContentItem_disciplineId_idx" ON "ContentItem"("disciplineId");

-- CreateIndex
CREATE INDEX "Assessment_disciplineId_idx" ON "Assessment"("disciplineId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_studentId_idx" ON "AssessmentAttempt"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerSubmission_attemptId_questionId_key" ON "AnswerSubmission"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "Certificate_studentId_idx" ON "Certificate"("studentId");

-- CreateIndex
CREATE INDEX "EduCostCenter_tenantId_idx" ON "EduCostCenter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_tenantId_codigo_key" ON "ChartOfAccount"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "AccountPayable_tenantId_status_idx" ON "AccountPayable"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AccountReceivable_tenantId_status_idx" ON "AccountReceivable"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AccountReceivable_studentId_idx" ON "AccountReceivable"("studentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_tenantId_idx" ON "PaymentTransaction"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEntry_paymentTransactionId_key" ON "AccountingEntry"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "AccountingEntry_tenantId_data_idx" ON "AccountingEntry"("tenantId", "data");

-- CreateIndex
CREATE INDEX "FiscalInvoice_tenantId_status_idx" ON "FiscalInvoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StudentFlashcardState_studentId_proximaRevisao_idx" ON "StudentFlashcardState"("studentId", "proximaRevisao");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFlashcardState_studentId_flashcardId_key" ON "StudentFlashcardState"("studentId", "flashcardId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentProgress_studentId_contentItemId_key" ON "ContentProgress"("studentId", "contentItemId");

-- CreateIndex
CREATE INDEX "LibraryProvider_tenantId_idx" ON "LibraryProvider"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentLibraryAccess_studentId_libraryProviderId_key" ON "StudentLibraryAccess"("studentId", "libraryProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "GradingRubric_questionId_key" ON "GradingRubric"("questionId");

-- CreateIndex
CREATE INDEX "GradingRubric_questionId_idx" ON "GradingRubric"("questionId");

-- CreateIndex
CREATE INDEX "AIGenerationLog_tenantId_idx" ON "AIGenerationLog"("tenantId");

-- CreateIndex
CREATE INDEX "AdmProcessoSeletivo_tenantId_status_idx" ON "AdmProcessoSeletivo"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdmProcessoSeletivo_tenantId_codigo_key" ON "AdmProcessoSeletivo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "AdmOferta_tenantId_processoId_idx" ON "AdmOferta"("tenantId", "processoId");

-- CreateIndex
CREATE INDEX "AdmCampanha_tenantId_status_idx" ON "AdmCampanha"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AdmCampanha_tenantId_utmCampaign_idx" ON "AdmCampanha"("tenantId", "utmCampaign");

-- CreateIndex
CREATE INDEX "AdmCampanhaGasto_tenantId_campanhaId_idx" ON "AdmCampanhaGasto"("tenantId", "campanhaId");

-- CreateIndex
CREATE INDEX "AdmCandidato_tenantId_status_idx" ON "AdmCandidato"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AdmCandidato_tenantId_processoId_status_idx" ON "AdmCandidato"("tenantId", "processoId", "status");

-- CreateIndex
CREATE INDEX "AdmCandidato_tenantId_cpf_idx" ON "AdmCandidato"("tenantId", "cpf");

-- CreateIndex
CREATE INDEX "AdmCandidato_tenantId_proximoContatoEm_idx" ON "AdmCandidato"("tenantId", "proximoContatoEm");

-- CreateIndex
CREATE UNIQUE INDEX "AdmCandidato_tenantId_protocolo_key" ON "AdmCandidato"("tenantId", "protocolo");

-- CreateIndex
CREATE INDEX "AdmInteracao_tenantId_candidatoId_idx" ON "AdmInteracao"("tenantId", "candidatoId");

-- CreateIndex
CREATE INDEX "AdmResultadoProva_tenantId_candidatoId_idx" ON "AdmResultadoProva"("tenantId", "candidatoId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmResultadoProva_candidatoId_componente_key" ON "AdmResultadoProva"("candidatoId", "componente");

-- CreateIndex
CREATE INDEX "AdmChamada_tenantId_processoId_idx" ON "AdmChamada"("tenantId", "processoId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmChamada_processoId_numero_key" ON "AdmChamada"("processoId", "numero");

-- CreateIndex
CREATE INDEX "AdmConvocacao_tenantId_chamadaId_idx" ON "AdmConvocacao"("tenantId", "chamadaId");

-- CreateIndex
CREATE INDEX "AdmConvocacao_tenantId_candidatoId_idx" ON "AdmConvocacao"("tenantId", "candidatoId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmDocumentoTipo_tenantId_codigo_key" ON "AdmDocumentoTipo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "AdmDocumentoCandidato_tenantId_candidatoId_idx" ON "AdmDocumentoCandidato"("tenantId", "candidatoId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmDocumentoCandidato_candidatoId_codigo_key" ON "AdmDocumentoCandidato"("candidatoId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "AdmMatricula_candidatoId_key" ON "AdmMatricula"("candidatoId");

-- CreateIndex
CREATE INDEX "AdmMatricula_tenantId_status_idx" ON "AdmMatricula"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AdmBolsa_tenantId_ativo_idx" ON "AdmBolsa"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "AdmBolsaConcessao_tenantId_bolsaId_idx" ON "AdmBolsaConcessao"("tenantId", "bolsaId");

-- CreateIndex
CREATE INDEX "AdmBolsaConcessao_tenantId_candidatoId_idx" ON "AdmBolsaConcessao"("tenantId", "candidatoId");

-- CreateIndex
CREATE INDEX "AdmRematriculaCampanha_tenantId_status_idx" ON "AdmRematriculaCampanha"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AdmRematricula_tenantId_campanhaId_status_idx" ON "AdmRematricula"("tenantId", "campanhaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdmRematricula_campanhaId_studentId_key" ON "AdmRematricula"("campanhaId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoContador_tenantId_chave_key" ON "ApoContador"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "ApoAndamento_tenantId_refType_refId_idx" ON "ApoAndamento"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "ApoAtendimento_tenantId_studentId_idx" ON "ApoAtendimento"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoAtendimento_tenantId_profissionalId_dataHora_idx" ON "ApoAtendimento"("tenantId", "profissionalId", "dataHora");

-- CreateIndex
CREATE INDEX "ApoAtendimento_tenantId_status_dataHora_idx" ON "ApoAtendimento"("tenantId", "status", "dataHora");

-- CreateIndex
CREATE INDEX "ApoPlanoAee_tenantId_studentId_idx" ON "ApoPlanoAee"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoPlanoAee_tenantId_status_vigenciaFim_idx" ON "ApoPlanoAee"("tenantId", "status", "vigenciaFim");

-- CreateIndex
CREATE INDEX "ApoAdaptacao_tenantId_planoId_idx" ON "ApoAdaptacao"("tenantId", "planoId");

-- CreateIndex
CREATE INDEX "ApoAdaptacao_tenantId_professorUserId_idx" ON "ApoAdaptacao"("tenantId", "professorUserId");

-- CreateIndex
CREATE INDEX "ApoProgramaBolsa_tenantId_ativo_idx" ON "ApoProgramaBolsa"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "ApoInscricaoBolsa_tenantId_programaId_status_idx" ON "ApoInscricaoBolsa"("tenantId", "programaId", "status");

-- CreateIndex
CREATE INDEX "ApoInscricaoBolsa_tenantId_studentId_idx" ON "ApoInscricaoBolsa"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoInscricaoBolsa_tenantId_programaId_studentId_key" ON "ApoInscricaoBolsa"("tenantId", "programaId", "studentId");

-- CreateIndex
CREATE INDEX "ApoConcessaoBolsa_tenantId_studentId_idx" ON "ApoConcessaoBolsa"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoConcessaoBolsa_tenantId_programaId_status_idx" ON "ApoConcessaoBolsa"("tenantId", "programaId", "status");

-- CreateIndex
CREATE INDEX "ApoConcessaoBolsa_tenantId_status_fim_idx" ON "ApoConcessaoBolsa"("tenantId", "status", "fim");

-- CreateIndex
CREATE INDEX "ApoMonitoriaVaga_tenantId_status_idx" ON "ApoMonitoriaVaga"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ApoMonitoriaCandidatura_tenantId_studentId_idx" ON "ApoMonitoriaCandidatura"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoMonitoriaCandidatura_tenantId_vagaId_studentId_key" ON "ApoMonitoriaCandidatura"("tenantId", "vagaId", "studentId");

-- CreateIndex
CREATE INDEX "ApoMonitor_tenantId_studentId_idx" ON "ApoMonitor"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoMonitor_tenantId_vagaId_studentId_key" ON "ApoMonitor"("tenantId", "vagaId", "studentId");

-- CreateIndex
CREATE INDEX "ApoMonitoriaFrequencia_tenantId_monitorId_data_idx" ON "ApoMonitoriaFrequencia"("tenantId", "monitorId", "data");

-- CreateIndex
CREATE INDEX "ApoTurmaApoio_tenantId_tipo_status_idx" ON "ApoTurmaApoio"("tenantId", "tipo", "status");

-- CreateIndex
CREATE INDEX "ApoTurmaApoioParticipante_tenantId_studentId_idx" ON "ApoTurmaApoioParticipante"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoTurmaApoioParticipante_tenantId_turmaId_studentId_key" ON "ApoTurmaApoioParticipante"("tenantId", "turmaId", "studentId");

-- CreateIndex
CREATE INDEX "ApoMentoria_tenantId_status_idx" ON "ApoMentoria"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ApoMentoria_tenantId_menteeStudentId_idx" ON "ApoMentoria"("tenantId", "menteeStudentId");

-- CreateIndex
CREATE INDEX "ApoMentoria_tenantId_menteeUserId_idx" ON "ApoMentoria"("tenantId", "menteeUserId");

-- CreateIndex
CREATE INDEX "ApoMentoriaEncontro_tenantId_mentoriaId_idx" ON "ApoMentoriaEncontro"("tenantId", "mentoriaId");

-- CreateIndex
CREATE INDEX "ApoEmpresa_tenantId_status_idx" ON "ApoEmpresa"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApoEmpresa_tenantId_cnpj_key" ON "ApoEmpresa"("tenantId", "cnpj");

-- CreateIndex
CREATE INDEX "ApoVaga_tenantId_status_tipo_idx" ON "ApoVaga"("tenantId", "status", "tipo");

-- CreateIndex
CREATE INDEX "ApoCandidaturaVaga_tenantId_vagaId_idx" ON "ApoCandidaturaVaga"("tenantId", "vagaId");

-- CreateIndex
CREATE INDEX "ApoCandidaturaVaga_tenantId_studentId_idx" ON "ApoCandidaturaVaga"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoCandidaturaVaga_tenantId_egressoId_idx" ON "ApoCandidaturaVaga"("tenantId", "egressoId");

-- CreateIndex
CREATE INDEX "ApoTermoEstagio_tenantId_studentId_idx" ON "ApoTermoEstagio"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoTermoEstagio_tenantId_status_fim_idx" ON "ApoTermoEstagio"("tenantId", "status", "fim");

-- CreateIndex
CREATE UNIQUE INDEX "ApoTermoEstagio_tenantId_numero_key" ON "ApoTermoEstagio"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ApoRelatorioEstagio_tenantId_termoId_idx" ON "ApoRelatorioEstagio"("tenantId", "termoId");

-- CreateIndex
CREATE INDEX "ApoRelatorioEstagio_tenantId_status_prazoEm_idx" ON "ApoRelatorioEstagio"("tenantId", "status", "prazoEm");

-- CreateIndex
CREATE INDEX "ApoOcorrencia_tenantId_studentId_idx" ON "ApoOcorrencia"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoOcorrencia_tenantId_status_idx" ON "ApoOcorrencia"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApoOcorrencia_tenantId_numero_key" ON "ApoOcorrencia"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ApoRiscoSnapshot_tenantId_studentId_calculadoEm_idx" ON "ApoRiscoSnapshot"("tenantId", "studentId", "calculadoEm");

-- CreateIndex
CREATE INDEX "ApoRiscoSnapshot_tenantId_nivel_calculadoEm_idx" ON "ApoRiscoSnapshot"("tenantId", "nivel", "calculadoEm");

-- CreateIndex
CREATE INDEX "ApoPlanoAcao_tenantId_studentId_idx" ON "ApoPlanoAcao"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoPlanoAcao_tenantId_status_proximoContatoEm_idx" ON "ApoPlanoAcao"("tenantId", "status", "proximoContatoEm");

-- CreateIndex
CREATE INDEX "ApoContatoEvasao_tenantId_planoId_idx" ON "ApoContatoEvasao"("tenantId", "planoId");

-- CreateIndex
CREATE INDEX "ApoFormacao_tenantId_status_inicio_idx" ON "ApoFormacao"("tenantId", "status", "inicio");

-- CreateIndex
CREATE INDEX "ApoFormacaoInscricao_tenantId_userId_idx" ON "ApoFormacaoInscricao"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoFormacaoInscricao_tenantId_formacaoId_userId_key" ON "ApoFormacaoInscricao"("tenantId", "formacaoId", "userId");

-- CreateIndex
CREATE INDEX "ApoMaterial_tenantId_status_idx" ON "ApoMaterial"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ApoMaterial_tenantId_disciplineId_idx" ON "ApoMaterial"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "ApoChamado_tenantId_status_prazoEm_idx" ON "ApoChamado"("tenantId", "status", "prazoEm");

-- CreateIndex
CREATE INDEX "ApoChamado_tenantId_solicitanteUserId_idx" ON "ApoChamado"("tenantId", "solicitanteUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoChamado_tenantId_numero_key" ON "ApoChamado"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ApoInstrumento_tenantId_finalidade_idx" ON "ApoInstrumento"("tenantId", "finalidade");

-- CreateIndex
CREATE INDEX "ApoAplicacao_tenantId_status_fechamento_idx" ON "ApoAplicacao"("tenantId", "status", "fechamento");

-- CreateIndex
CREATE INDEX "ApoAplicacao_tenantId_professorUserId_idx" ON "ApoAplicacao"("tenantId", "professorUserId");

-- CreateIndex
CREATE INDEX "ApoParticipacao_tenantId_respondenteId_idx" ON "ApoParticipacao"("tenantId", "respondenteId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoParticipacao_aplicacaoId_respondenteId_key" ON "ApoParticipacao"("aplicacaoId", "respondenteId");

-- CreateIndex
CREATE INDEX "ApoResposta_tenantId_aplicacaoId_idx" ON "ApoResposta"("tenantId", "aplicacaoId");

-- CreateIndex
CREATE INDEX "ApoDevolutiva_tenantId_professorUserId_idx" ON "ApoDevolutiva"("tenantId", "professorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoSetorOuvidoria_tenantId_codigo_key" ON "ApoSetorOuvidoria"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ApoManifestacao_tenantId_status_prazoEm_idx" ON "ApoManifestacao"("tenantId", "status", "prazoEm");

-- CreateIndex
CREATE INDEX "ApoManifestacao_tenantId_tipo_idx" ON "ApoManifestacao"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "ApoManifestacao_tenantId_protocolo_key" ON "ApoManifestacao"("tenantId", "protocolo");

-- CreateIndex
CREATE INDEX "ApoEncaminhamento_tenantId_manifestacaoId_idx" ON "ApoEncaminhamento"("tenantId", "manifestacaoId");

-- CreateIndex
CREATE INDEX "ApoEncaminhamento_tenantId_status_prazoEm_idx" ON "ApoEncaminhamento"("tenantId", "status", "prazoEm");

-- CreateIndex
CREATE INDEX "ApoEgresso_tenantId_programId_anoConclusao_idx" ON "ApoEgresso"("tenantId", "programId", "anoConclusao");

-- CreateIndex
CREATE UNIQUE INDEX "ApoEgresso_tenantId_studentId_key" ON "ApoEgresso"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ApoEgressoTrajetoria_tenantId_egressoId_idx" ON "ApoEgressoTrajetoria"("tenantId", "egressoId");

-- CreateIndex
CREATE INDEX "ApoEventoEgresso_tenantId_status_dataHora_idx" ON "ApoEventoEgresso"("tenantId", "status", "dataHora");

-- CreateIndex
CREATE INDEX "ApoEventoParticipante_tenantId_egressoId_idx" ON "ApoEventoParticipante"("tenantId", "egressoId");

-- CreateIndex
CREATE UNIQUE INDEX "ApoEventoParticipante_eventoId_egressoId_key" ON "ApoEventoParticipante"("eventoId", "egressoId");

-- CreateIndex
CREATE UNIQUE INDEX "BibConfig_tenantId_key" ON "BibConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BibPolitica_tenantId_perfil_key" ON "BibPolitica"("tenantId", "perfil");

-- CreateIndex
CREATE INDEX "BibObra_tenantId_titulo_idx" ON "BibObra"("tenantId", "titulo");

-- CreateIndex
CREATE INDEX "BibObra_tenantId_isbn_idx" ON "BibObra"("tenantId", "isbn");

-- CreateIndex
CREATE INDEX "BibObra_tenantId_tipo_idx" ON "BibObra"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "BibExemplar_tenantId_obraId_status_idx" ON "BibExemplar"("tenantId", "obraId", "status");

-- CreateIndex
CREATE INDEX "BibExemplar_tenantId_codigoBarras_idx" ON "BibExemplar"("tenantId", "codigoBarras");

-- CreateIndex
CREATE INDEX "BibExemplar_tenantId_spaceId_estante_idx" ON "BibExemplar"("tenantId", "spaceId", "estante");

-- CreateIndex
CREATE UNIQUE INDEX "BibExemplar_tenantId_tombo_key" ON "BibExemplar"("tenantId", "tombo");

-- CreateIndex
CREATE INDEX "BibLeitor_tenantId_perfil_idx" ON "BibLeitor"("tenantId", "perfil");

-- CreateIndex
CREATE INDEX "BibLeitor_tenantId_studentId_idx" ON "BibLeitor"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "BibLeitor_tenantId_userId_idx" ON "BibLeitor"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "BibLeitor_tenantId_documento_idx" ON "BibLeitor"("tenantId", "documento");

-- CreateIndex
CREATE INDEX "BibEmprestimo_tenantId_status_dataPrevista_idx" ON "BibEmprestimo"("tenantId", "status", "dataPrevista");

-- CreateIndex
CREATE INDEX "BibEmprestimo_tenantId_leitorId_status_idx" ON "BibEmprestimo"("tenantId", "leitorId", "status");

-- CreateIndex
CREATE INDEX "BibEmprestimo_tenantId_obraId_idx" ON "BibEmprestimo"("tenantId", "obraId");

-- CreateIndex
CREATE INDEX "BibEmprestimo_tenantId_exemplarId_idx" ON "BibEmprestimo"("tenantId", "exemplarId");

-- CreateIndex
CREATE INDEX "BibReserva_tenantId_obraId_status_createdAt_idx" ON "BibReserva"("tenantId", "obraId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BibReserva_tenantId_leitorId_status_idx" ON "BibReserva"("tenantId", "leitorId", "status");

-- CreateIndex
CREATE INDEX "BibReserva_tenantId_status_expiraEm_idx" ON "BibReserva"("tenantId", "status", "expiraEm");

-- CreateIndex
CREATE INDEX "BibMulta_tenantId_status_idx" ON "BibMulta"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BibMulta_tenantId_leitorId_status_idx" ON "BibMulta"("tenantId", "leitorId", "status");

-- CreateIndex
CREATE INDEX "BibMulta_tenantId_emprestimoId_idx" ON "BibMulta"("tenantId", "emprestimoId");

-- CreateIndex
CREATE INDEX "BibInventario_tenantId_status_idx" ON "BibInventario"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BibInventarioItem_tenantId_inventarioId_situacao_idx" ON "BibInventarioItem"("tenantId", "inventarioId", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "BibInventarioItem_inventarioId_tombo_key" ON "BibInventarioItem"("inventarioId", "tombo");

-- CreateIndex
CREATE INDEX "BibBibliografia_tenantId_disciplineId_tipo_idx" ON "BibBibliografia"("tenantId", "disciplineId", "tipo");

-- CreateIndex
CREATE INDEX "BibBibliografia_tenantId_obraId_idx" ON "BibBibliografia"("tenantId", "obraId");

-- CreateIndex
CREATE UNIQUE INDEX "BibBibliografia_tenantId_disciplineId_obraId_key" ON "BibBibliografia"("tenantId", "disciplineId", "obraId");

-- CreateIndex
CREATE INDEX "BibSugestaoAquisicao_tenantId_status_idx" ON "BibSugestaoAquisicao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BibSugestaoAquisicao_tenantId_disciplineId_idx" ON "BibSugestaoAquisicao"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "BibRecursoVirtual_tenantId_tipo_idx" ON "BibRecursoVirtual"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "BibRecursoVirtual_tenantId_obraId_idx" ON "BibRecursoVirtual"("tenantId", "obraId");

-- CreateIndex
CREATE INDEX "BibAcessoVirtual_tenantId_recursoId_createdAt_idx" ON "BibAcessoVirtual"("tenantId", "recursoId", "createdAt");

-- CreateIndex
CREATE INDEX "BibAcessoVirtual_tenantId_createdAt_idx" ON "BibAcessoVirtual"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "BibRepositorioItem_tenantId_status_tipo_idx" ON "BibRepositorioItem"("tenantId", "status", "tipo");

-- CreateIndex
CREATE INDEX "BibRepositorioItem_tenantId_programId_idx" ON "BibRepositorioItem"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "BibRepositorioItem_tenantId_autorStudentId_idx" ON "BibRepositorioItem"("tenantId", "autorStudentId");

-- CreateIndex
CREATE UNIQUE INDEX "BibRepositorioItem_tenantId_handle_key" ON "BibRepositorioItem"("tenantId", "handle");

-- CreateIndex
CREATE INDEX "CalCategoria_tenantId_idx" ON "CalCategoria"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CalCategoria_tenantId_nome_key" ON "CalCategoria"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "CalEvento_tenantId_inicio_idx" ON "CalEvento"("tenantId", "inicio");

-- CreateIndex
CREATE INDEX "CalEvento_tenantId_termId_idx" ON "CalEvento"("tenantId", "termId");

-- CreateIndex
CREATE INDEX "CalEvento_tenantId_tipo_idx" ON "CalEvento"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "CalEvento_tenantId_origemKey_key" ON "CalEvento"("tenantId", "origemKey");

-- CreateIndex
CREATE INDEX "CalHorario_tenantId_idx" ON "CalHorario"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CalHorario_tenantId_turno_ordem_key" ON "CalHorario"("tenantId", "turno", "ordem");

-- CreateIndex
CREATE INDEX "CalDisponibilidade_tenantId_userId_idx" ON "CalDisponibilidade"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "CalDisponibilidade_tenantId_termId_idx" ON "CalDisponibilidade"("tenantId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "CalProfessorPerfil_tenantId_userId_key" ON "CalProfessorPerfil"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalDisciplinaConfig_tenantId_disciplineId_key" ON "CalDisciplinaConfig"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "CalTurmaConfig_tenantId_grupo_idx" ON "CalTurmaConfig"("tenantId", "grupo");

-- CreateIndex
CREATE UNIQUE INDEX "CalTurmaConfig_tenantId_classSectionId_key" ON "CalTurmaConfig"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "CalSlot_tenantId_termId_diaSemana_idx" ON "CalSlot"("tenantId", "termId", "diaSemana");

-- CreateIndex
CREATE INDEX "CalSlot_tenantId_professorUserId_idx" ON "CalSlot"("tenantId", "professorUserId");

-- CreateIndex
CREATE INDEX "CalSlot_tenantId_spaceId_idx" ON "CalSlot"("tenantId", "spaceId");

-- CreateIndex
CREATE INDEX "CalSlot_tenantId_classSectionId_idx" ON "CalSlot"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "CalSlot_tenantId_geracaoId_idx" ON "CalSlot"("tenantId", "geracaoId");

-- CreateIndex
CREATE INDEX "CalGeracao_tenantId_termId_idx" ON "CalGeracao"("tenantId", "termId");

-- CreateIndex
CREATE INDEX "CalReserva_tenantId_spaceId_inicio_idx" ON "CalReserva"("tenantId", "spaceId", "inicio");

-- CreateIndex
CREATE INDEX "CalReserva_tenantId_status_idx" ON "CalReserva"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CalReserva_tenantId_serieId_idx" ON "CalReserva"("tenantId", "serieId");

-- CreateIndex
CREATE INDEX "CalReserva_tenantId_solicitanteId_idx" ON "CalReserva"("tenantId", "solicitanteId");

-- CreateIndex
CREATE INDEX "CalExame_tenantId_termId_inicio_idx" ON "CalExame"("tenantId", "termId", "inicio");

-- CreateIndex
CREATE INDEX "CalExame_tenantId_classSectionId_idx" ON "CalExame"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "CalExame_tenantId_spaceId_inicio_idx" ON "CalExame"("tenantId", "spaceId", "inicio");

-- CreateIndex
CREATE INDEX "CalExameFiscal_tenantId_userId_idx" ON "CalExameFiscal"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalExameFiscal_exameId_userId_key" ON "CalExameFiscal"("exameId", "userId");

-- CreateIndex
CREATE INDEX "CalPrazoNotas_tenantId_termId_idx" ON "CalPrazoNotas"("tenantId", "termId");

-- CreateIndex
CREATE INDEX "CalPrazoNotas_tenantId_prazo_idx" ON "CalPrazoNotas"("tenantId", "prazo");

-- CreateIndex
CREATE UNIQUE INDEX "CalPrazoExcecao_prazoId_userId_key" ON "CalPrazoExcecao"("prazoId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalPrazoConclusao_prazoId_userId_key" ON "CalPrazoConclusao"("prazoId", "userId");

-- CreateIndex
CREATE INDEX "CalConflito_tenantId_status_idx" ON "CalConflito"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CalConflito_tenantId_termId_idx" ON "CalConflito"("tenantId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "CalConflito_tenantId_chave_key" ON "CalConflito"("tenantId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "CalFeed_token_key" ON "CalFeed"("token");

-- CreateIndex
CREATE INDEX "CalFeed_tenantId_escopo_idx" ON "CalFeed"("tenantId", "escopo");

-- CreateIndex
CREATE INDEX "ComCanal_tenantId_tipo_ativo_idx" ON "ComCanal"("tenantId", "tipo", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ComCanal_tenantId_tipo_nome_key" ON "ComCanal"("tenantId", "tipo", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "ComConfig_tenantId_key" ON "ComConfig"("tenantId");

-- CreateIndex
CREATE INDEX "ComContato_tenantId_tipo_idx" ON "ComContato"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "ComContato_tenantId_telefone_idx" ON "ComContato"("tenantId", "telefone");

-- CreateIndex
CREATE INDEX "ComContato_tenantId_email_idx" ON "ComContato"("tenantId", "email");

-- CreateIndex
CREATE INDEX "ComContato_tenantId_studentId_idx" ON "ComContato"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ComContato_tenantId_telegramChatId_idx" ON "ComContato"("tenantId", "telegramChatId");

-- CreateIndex
CREATE INDEX "ComPreferencia_tenantId_contatoId_idx" ON "ComPreferencia"("tenantId", "contatoId");

-- CreateIndex
CREATE UNIQUE INDEX "ComPreferencia_tenantId_contatoId_canal_finalidade_key" ON "ComPreferencia"("tenantId", "contatoId", "canal", "finalidade");

-- CreateIndex
CREATE INDEX "ComTemplate_tenantId_categoria_idx" ON "ComTemplate"("tenantId", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "ComTemplate_tenantId_chave_key" ON "ComTemplate"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "ComConversa_tenantId_status_ultimaMensagemEm_idx" ON "ComConversa"("tenantId", "status", "ultimaMensagemEm");

-- CreateIndex
CREATE INDEX "ComConversa_tenantId_atribuidoAId_status_idx" ON "ComConversa"("tenantId", "atribuidoAId", "status");

-- CreateIndex
CREATE INDEX "ComConversa_tenantId_contatoId_idx" ON "ComConversa"("tenantId", "contatoId");

-- CreateIndex
CREATE INDEX "ComConversa_tenantId_canalTipo_chaveExterna_idx" ON "ComConversa"("tenantId", "canalTipo", "chaveExterna");

-- CreateIndex
CREATE INDEX "ComMensagem_tenantId_conversaId_createdAt_idx" ON "ComMensagem"("tenantId", "conversaId", "createdAt");

-- CreateIndex
CREATE INDEX "ComMensagem_tenantId_notificationId_idx" ON "ComMensagem"("tenantId", "notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "ComMensagem_tenantId_conversaId_externalId_key" ON "ComMensagem"("tenantId", "conversaId", "externalId");

-- CreateIndex
CREATE INDEX "ComCampanha_tenantId_status_agendadaPara_idx" ON "ComCampanha"("tenantId", "status", "agendadaPara");

-- CreateIndex
CREATE INDEX "ComCampanhaDestinatario_tenantId_campanhaId_resultado_idx" ON "ComCampanhaDestinatario"("tenantId", "campanhaId", "resultado");

-- CreateIndex
CREATE INDEX "ComCampanhaDestinatario_tenantId_notificationId_idx" ON "ComCampanhaDestinatario"("tenantId", "notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "ComCampanhaDestinatario_campanhaId_chave_key" ON "ComCampanhaDestinatario"("campanhaId", "chave");

-- CreateIndex
CREATE INDEX "ComRegua_tenantId_ativa_idx" ON "ComRegua"("tenantId", "ativa");

-- CreateIndex
CREATE INDEX "ComReguaEtapa_tenantId_reguaId_idx" ON "ComReguaEtapa"("tenantId", "reguaId");

-- CreateIndex
CREATE INDEX "ComReguaExecucao_tenantId_receivableId_idx" ON "ComReguaExecucao"("tenantId", "receivableId");

-- CreateIndex
CREATE INDEX "ComReguaExecucao_tenantId_reguaId_createdAt_idx" ON "ComReguaExecucao"("tenantId", "reguaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComReguaExecucao_etapaId_receivableId_key" ON "ComReguaExecucao"("etapaId", "receivableId");

-- CreateIndex
CREATE INDEX "ComBotFluxo_tenantId_ativo_idx" ON "ComBotFluxo"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "ComBotFluxo_tenantId_intencao_idx" ON "ComBotFluxo"("tenantId", "intencao");

-- CreateIndex
CREATE INDEX "ComFaq_tenantId_ativo_categoria_idx" ON "ComFaq"("tenantId", "ativo", "categoria");

-- CreateIndex
CREATE INDEX "ComSocialConta_tenantId_rede_idx" ON "ComSocialConta"("tenantId", "rede");

-- CreateIndex
CREATE INDEX "ComSocialPost_tenantId_status_agendadoPara_idx" ON "ComSocialPost"("tenantId", "status", "agendadoPara");

-- CreateIndex
CREATE INDEX "ComSocialPost_tenantId_contaId_idx" ON "ComSocialPost"("tenantId", "contaId");

-- CreateIndex
CREATE INDEX "ComSocialMetrica_tenantId_contaId_data_idx" ON "ComSocialMetrica"("tenantId", "contaId", "data");

-- CreateIndex
CREATE INDEX "ComSocialMetrica_tenantId_postId_idx" ON "ComSocialMetrica"("tenantId", "postId");

-- CreateIndex
CREATE INDEX "ComSocialInteracao_tenantId_status_createdAt_idx" ON "ComSocialInteracao"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComSocialInteracao_tenantId_contaId_externalId_key" ON "ComSocialInteracao"("tenantId", "contaId", "externalId");

-- CreateIndex
CREATE INDEX "ComChamada_tenantId_inicioEm_idx" ON "ComChamada"("tenantId", "inicioEm");

-- CreateIndex
CREATE INDEX "ComChamada_tenantId_provedorSid_idx" ON "ComChamada"("tenantId", "provedorSid");

-- CreateIndex
CREATE INDEX "ComWebhookLog_canalId_createdAt_idx" ON "ComWebhookLog"("canalId", "createdAt");

-- CreateIndex
CREATE INDEX "DesExame_tenantId_tipo_idx" ON "DesExame"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "DesExame_tenantId_codigo_key" ON "DesExame"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "DesEixo_tenantId_exameId_idx" ON "DesEixo"("tenantId", "exameId");

-- CreateIndex
CREATE UNIQUE INDEX "DesEixo_exameId_codigo_key" ON "DesEixo"("exameId", "codigo");

-- CreateIndex
CREATE INDEX "DesEdicao_tenantId_exameId_idx" ON "DesEdicao"("tenantId", "exameId");

-- CreateIndex
CREATE INDEX "DesEdicao_tenantId_dataProva_idx" ON "DesEdicao"("tenantId", "dataProva");

-- CreateIndex
CREATE UNIQUE INDEX "DesEdicao_exameId_ano_titulo_key" ON "DesEdicao"("exameId", "ano", "titulo");

-- CreateIndex
CREATE INDEX "DesInscricao_tenantId_edicaoId_situacao_idx" ON "DesInscricao"("tenantId", "edicaoId", "situacao");

-- CreateIndex
CREATE INDEX "DesInscricao_tenantId_studentId_idx" ON "DesInscricao"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "DesInscricao_edicaoId_studentId_key" ON "DesInscricao"("edicaoId", "studentId");

-- CreateIndex
CREATE INDEX "DesMetaCurso_tenantId_exameId_idx" ON "DesMetaCurso"("tenantId", "exameId");

-- CreateIndex
CREATE UNIQUE INDEX "DesMetaCurso_tenantId_programId_exameId_ano_key" ON "DesMetaCurso"("tenantId", "programId", "exameId", "ano");

-- CreateIndex
CREATE INDEX "DesQuestao_tenantId_exameId_status_idx" ON "DesQuestao"("tenantId", "exameId", "status");

-- CreateIndex
CREATE INDEX "DesQuestao_tenantId_eixoId_idx" ON "DesQuestao"("tenantId", "eixoId");

-- CreateIndex
CREATE INDEX "DesQuestao_tenantId_disciplineId_idx" ON "DesQuestao"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "DesSimulado_tenantId_exameId_status_idx" ON "DesSimulado"("tenantId", "exameId", "status");

-- CreateIndex
CREATE INDEX "DesSimuladoQuestao_tenantId_simuladoId_idx" ON "DesSimuladoQuestao"("tenantId", "simuladoId");

-- CreateIndex
CREATE UNIQUE INDEX "DesSimuladoQuestao_simuladoId_questaoId_key" ON "DesSimuladoQuestao"("simuladoId", "questaoId");

-- CreateIndex
CREATE INDEX "DesSimuladoAlvo_tenantId_simuladoId_idx" ON "DesSimuladoAlvo"("tenantId", "simuladoId");

-- CreateIndex
CREATE INDEX "DesSimuladoAlvo_tenantId_studentId_idx" ON "DesSimuladoAlvo"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "DesSimuladoAlvo_tenantId_classSectionId_idx" ON "DesSimuladoAlvo"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "DesTentativa_tenantId_studentId_idx" ON "DesTentativa"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "DesTentativa_tenantId_simuladoId_status_idx" ON "DesTentativa"("tenantId", "simuladoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DesTentativa_simuladoId_studentId_key" ON "DesTentativa"("simuladoId", "studentId");

-- CreateIndex
CREATE INDEX "DesResposta_tenantId_questaoId_idx" ON "DesResposta"("tenantId", "questaoId");

-- CreateIndex
CREATE UNIQUE INDEX "DesResposta_tentativaId_questaoId_key" ON "DesResposta"("tentativaId", "questaoId");

-- CreateIndex
CREATE INDEX "DesKit_tenantId_disciplineId_idx" ON "DesKit"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "DesKit_tenantId_visibilidade_idx" ON "DesKit"("tenantId", "visibilidade");

-- CreateIndex
CREATE INDEX "DesKit_tenantId_autorUserId_idx" ON "DesKit"("tenantId", "autorUserId");

-- CreateIndex
CREATE INDEX "DesAtribuicao_tenantId_classSectionId_idx" ON "DesAtribuicao"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "DesAtribuicao_tenantId_professorUserId_status_idx" ON "DesAtribuicao"("tenantId", "professorUserId", "status");

-- CreateIndex
CREATE INDEX "DesAtribuicao_tenantId_prazo_idx" ON "DesAtribuicao"("tenantId", "prazo");

-- CreateIndex
CREATE INDEX "DesEntrega_tenantId_studentId_idx" ON "DesEntrega"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "DesEntrega_atribuicaoId_studentId_key" ON "DesEntrega"("atribuicaoId", "studentId");

-- CreateIndex
CREATE INDEX "DesTrilha_tenantId_studentId_status_idx" ON "DesTrilha"("tenantId", "studentId", "status");

-- CreateIndex
CREATE INDEX "DesTrilha_tenantId_exameId_idx" ON "DesTrilha"("tenantId", "exameId");

-- CreateIndex
CREATE INDEX "DesTrilhaItem_tenantId_trilhaId_idx" ON "DesTrilhaItem"("tenantId", "trilhaId");

-- CreateIndex
CREATE INDEX "DesTrilhaItem_tenantId_dataPrevista_status_idx" ON "DesTrilhaItem"("tenantId", "dataPrevista", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GovSequencia_tenantId_chave_ano_key" ON "GovSequencia"("tenantId", "chave", "ano");

-- CreateIndex
CREATE INDEX "GovPdi_tenantId_status_idx" ON "GovPdi"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GovPdiEixo_tenantId_pdiId_idx" ON "GovPdiEixo"("tenantId", "pdiId");

-- CreateIndex
CREATE INDEX "GovPdiObjetivo_tenantId_eixoId_idx" ON "GovPdiObjetivo"("tenantId", "eixoId");

-- CreateIndex
CREATE INDEX "GovPdiMeta_tenantId_objetivoId_idx" ON "GovPdiMeta"("tenantId", "objetivoId");

-- CreateIndex
CREATE INDEX "GovPdiMeta_tenantId_proximaColetaEm_idx" ON "GovPdiMeta"("tenantId", "proximaColetaEm");

-- CreateIndex
CREATE INDEX "GovPdiMedicao_tenantId_metaId_dataReferencia_idx" ON "GovPdiMedicao"("tenantId", "metaId", "dataReferencia");

-- CreateIndex
CREATE INDEX "GovPdiAcao_tenantId_metaId_idx" ON "GovPdiAcao"("tenantId", "metaId");

-- CreateIndex
CREATE INDEX "GovPdiAcao_tenantId_status_prazo_idx" ON "GovPdiAcao"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "GovDocumento_tenantId_tipo_idx" ON "GovDocumento"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "GovDocumento_tenantId_programId_idx" ON "GovDocumento"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "GovDocumentoVersao_tenantId_status_idx" ON "GovDocumentoVersao"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GovDocumentoVersao_documentoId_versao_key" ON "GovDocumentoVersao"("documentoId", "versao");

-- CreateIndex
CREATE INDEX "GovCpa_tenantId_idx" ON "GovCpa"("tenantId");

-- CreateIndex
CREATE INDEX "GovCpaMembro_tenantId_cpaId_idx" ON "GovCpaMembro"("tenantId", "cpaId");

-- CreateIndex
CREATE INDEX "GovCpaMembro_tenantId_fimMandato_idx" ON "GovCpaMembro"("tenantId", "fimMandato");

-- CreateIndex
CREATE INDEX "GovCpaCiclo_tenantId_status_idx" ON "GovCpaCiclo"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GovCpaQuestionario_tenantId_cicloId_idx" ON "GovCpaQuestionario"("tenantId", "cicloId");

-- CreateIndex
CREATE UNIQUE INDEX "GovCpaModeloQuestionario_tenantId_chave_key" ON "GovCpaModeloQuestionario"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "GovCpaPergunta_tenantId_questionarioId_idx" ON "GovCpaPergunta"("tenantId", "questionarioId");

-- CreateIndex
CREATE UNIQUE INDEX "GovCpaConvite_tokenHash_key" ON "GovCpaConvite"("tokenHash");

-- CreateIndex
CREATE INDEX "GovCpaConvite_tenantId_questionarioId_usado_idx" ON "GovCpaConvite"("tenantId", "questionarioId", "usado");

-- CreateIndex
CREATE INDEX "GovCpaResposta_tenantId_cicloId_segmento_idx" ON "GovCpaResposta"("tenantId", "cicloId", "segmento");

-- CreateIndex
CREATE INDEX "GovCpaRespostaItem_tenantId_respostaId_idx" ON "GovCpaRespostaItem"("tenantId", "respostaId");

-- CreateIndex
CREATE INDEX "GovCpaRespostaItem_tenantId_perguntaId_idx" ON "GovCpaRespostaItem"("tenantId", "perguntaId");

-- CreateIndex
CREATE INDEX "GovCpaRelatorio_tenantId_cicloId_idx" ON "GovCpaRelatorio"("tenantId", "cicloId");

-- CreateIndex
CREATE INDEX "GovCpaPlanoAcao_tenantId_cicloId_status_idx" ON "GovCpaPlanoAcao"("tenantId", "cicloId", "status");

-- CreateIndex
CREATE INDEX "GovNde_tenantId_programId_idx" ON "GovNde"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "GovNdeMembro_tenantId_ndeId_idx" ON "GovNdeMembro"("tenantId", "ndeId");

-- CreateIndex
CREATE INDEX "GovNdeMembro_tenantId_docenteId_idx" ON "GovNdeMembro"("tenantId", "docenteId");

-- CreateIndex
CREATE INDEX "GovNdeReuniao_tenantId_ndeId_data_idx" ON "GovNdeReuniao"("tenantId", "ndeId", "data");

-- CreateIndex
CREATE INDEX "GovOrgao_tenantId_tipo_idx" ON "GovOrgao"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "GovOrgaoMembro_tenantId_orgaoId_idx" ON "GovOrgaoMembro"("tenantId", "orgaoId");

-- CreateIndex
CREATE INDEX "GovOrgaoMembro_tenantId_fimMandato_idx" ON "GovOrgaoMembro"("tenantId", "fimMandato");

-- CreateIndex
CREATE INDEX "GovReuniao_tenantId_orgaoId_data_idx" ON "GovReuniao"("tenantId", "orgaoId", "data");

-- CreateIndex
CREATE INDEX "GovPauta_tenantId_reuniaoId_idx" ON "GovPauta"("tenantId", "reuniaoId");

-- CreateIndex
CREATE UNIQUE INDEX "GovPautaModelo_tenantId_chave_key" ON "GovPautaModelo"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "GovDeliberacao_tenantId_orgaoId_status_idx" ON "GovDeliberacao"("tenantId", "orgaoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GovDeliberacao_tenantId_ano_numero_key" ON "GovDeliberacao"("tenantId", "ano", "numero");

-- CreateIndex
CREATE INDEX "GovVotoRegistro_tenantId_deliberacaoId_idx" ON "GovVotoRegistro"("tenantId", "deliberacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "GovVotoRegistro_deliberacaoId_membroId_key" ON "GovVotoRegistro"("deliberacaoId", "membroId");

-- CreateIndex
CREATE INDEX "GovCipaGestao_tenantId_status_idx" ON "GovCipaGestao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GovCipaMembro_tenantId_gestaoId_idx" ON "GovCipaMembro"("tenantId", "gestaoId");

-- CreateIndex
CREATE INDEX "GovCipaReuniao_tenantId_gestaoId_competencia_idx" ON "GovCipaReuniao"("tenantId", "gestaoId", "competencia");

-- CreateIndex
CREATE INDEX "GovCipaRisco_tenantId_nivel_status_idx" ON "GovCipaRisco"("tenantId", "nivel", "status");

-- CreateIndex
CREATE INDEX "GovCipaInspecao_tenantId_data_idx" ON "GovCipaInspecao"("tenantId", "data");

-- CreateIndex
CREATE INDEX "GovCipaAcidente_tenantId_data_idx" ON "GovCipaAcidente"("tenantId", "data");

-- CreateIndex
CREATE INDEX "GovCipaAcidente_tenantId_catObrigatoria_catEmitida_idx" ON "GovCipaAcidente"("tenantId", "catObrigatoria", "catEmitida");

-- CreateIndex
CREATE INDEX "GovCipaSipat_tenantId_ano_idx" ON "GovCipaSipat"("tenantId", "ano");

-- CreateIndex
CREATE INDEX "GovCipaPlanoAcao_tenantId_status_prazo_idx" ON "GovCipaPlanoAcao"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "GovCarreiraPlano_tenantId_tipo_idx" ON "GovCarreiraPlano"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "GovCarreiraNivel_tenantId_planoId_idx" ON "GovCarreiraNivel"("tenantId", "planoId");

-- CreateIndex
CREATE UNIQUE INDEX "GovCarreiraNivel_planoId_ordem_key" ON "GovCarreiraNivel"("planoId", "ordem");

-- CreateIndex
CREATE INDEX "GovCarreiraEnquadramento_tenantId_planoId_idx" ON "GovCarreiraEnquadramento"("tenantId", "planoId");

-- CreateIndex
CREATE INDEX "GovCarreiraEnquadramento_tenantId_docenteId_idx" ON "GovCarreiraEnquadramento"("tenantId", "docenteId");

-- CreateIndex
CREATE INDEX "GovCarreiraProgressao_tenantId_status_idx" ON "GovCarreiraProgressao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GovCarreiraProgressao_tenantId_enquadramentoId_idx" ON "GovCarreiraProgressao"("tenantId", "enquadramentoId");

-- CreateIndex
CREATE UNIQUE INDEX "InfSequencia_tenantId_chave_key" ON "InfSequencia"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "InfCategoriaBem_tenantId_idx" ON "InfCategoriaBem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InfCategoriaBem_tenantId_codigo_key" ON "InfCategoriaBem"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "InfBem_tenantId_categoriaId_idx" ON "InfBem"("tenantId", "categoriaId");

-- CreateIndex
CREATE INDEX "InfBem_tenantId_spaceId_idx" ON "InfBem"("tenantId", "spaceId");

-- CreateIndex
CREATE INDEX "InfBem_tenantId_status_idx" ON "InfBem"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InfBem_tenantId_tombamento_key" ON "InfBem"("tenantId", "tombamento");

-- CreateIndex
CREATE INDEX "InfMovimentacaoBem_tenantId_bemId_createdAt_idx" ON "InfMovimentacaoBem"("tenantId", "bemId", "createdAt");

-- CreateIndex
CREATE INDEX "InfInventario_tenantId_status_idx" ON "InfInventario"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfInventarioItem_tenantId_inventarioId_idx" ON "InfInventarioItem"("tenantId", "inventarioId");

-- CreateIndex
CREATE INDEX "InfInventarioItem_tenantId_bemId_idx" ON "InfInventarioItem"("tenantId", "bemId");

-- CreateIndex
CREATE INDEX "InfPlanoPreventivo_tenantId_ativo_proximaExecucao_idx" ON "InfPlanoPreventivo"("tenantId", "ativo", "proximaExecucao");

-- CreateIndex
CREATE INDEX "InfOrdemServico_tenantId_status_prazoSla_idx" ON "InfOrdemServico"("tenantId", "status", "prazoSla");

-- CreateIndex
CREATE INDEX "InfOrdemServico_tenantId_bemId_idx" ON "InfOrdemServico"("tenantId", "bemId");

-- CreateIndex
CREATE INDEX "InfOrdemServico_tenantId_spaceId_idx" ON "InfOrdemServico"("tenantId", "spaceId");

-- CreateIndex
CREATE INDEX "InfOrdemServico_tenantId_planoId_idx" ON "InfOrdemServico"("tenantId", "planoId");

-- CreateIndex
CREATE UNIQUE INDEX "InfOrdemServico_tenantId_numero_key" ON "InfOrdemServico"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "InfOsPeca_tenantId_osId_idx" ON "InfOsPeca"("tenantId", "osId");

-- CreateIndex
CREATE INDEX "InfChamado_tenantId_status_idx" ON "InfChamado"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfChamado_tenantId_solicitanteUserId_idx" ON "InfChamado"("tenantId", "solicitanteUserId");

-- CreateIndex
CREATE UNIQUE INDEX "InfChamado_tenantId_numero_key" ON "InfChamado"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "InfChamadoComentario_tenantId_chamadoId_idx" ON "InfChamadoComentario"("tenantId", "chamadoId");

-- CreateIndex
CREATE INDEX "InfProjeto_tenantId_status_idx" ON "InfProjeto"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfProjetoEtapa_tenantId_projetoId_idx" ON "InfProjetoEtapa"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "InfAreaEstacionamento_tenantId_idx" ON "InfAreaEstacionamento"("tenantId");

-- CreateIndex
CREATE INDEX "InfVaga_tenantId_areaId_idx" ON "InfVaga"("tenantId", "areaId");

-- CreateIndex
CREATE UNIQUE INDEX "InfVaga_tenantId_areaId_codigo_key" ON "InfVaga"("tenantId", "areaId", "codigo");

-- CreateIndex
CREATE INDEX "InfVeiculo_tenantId_credencialStatus_idx" ON "InfVeiculo"("tenantId", "credencialStatus");

-- CreateIndex
CREATE UNIQUE INDEX "InfVeiculo_tenantId_placa_key" ON "InfVeiculo"("tenantId", "placa");

-- CreateIndex
CREATE INDEX "InfAcessoEstacionamento_tenantId_areaId_saidaEm_idx" ON "InfAcessoEstacionamento"("tenantId", "areaId", "saidaEm");

-- CreateIndex
CREATE INDEX "InfAcessoEstacionamento_tenantId_placa_idx" ON "InfAcessoEstacionamento"("tenantId", "placa");

-- CreateIndex
CREATE INDEX "InfAcessoEstacionamento_tenantId_entradaEm_idx" ON "InfAcessoEstacionamento"("tenantId", "entradaEm");

-- CreateIndex
CREATE INDEX "InfOcorrenciaEstacionamento_tenantId_status_idx" ON "InfOcorrenciaEstacionamento"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfOcorrenciaEstacionamento_tenantId_placa_idx" ON "InfOcorrenciaEstacionamento"("tenantId", "placa");

-- CreateIndex
CREATE INDEX "InfReservaArea_tenantId_spaceId_inicio_fim_idx" ON "InfReservaArea"("tenantId", "spaceId", "inicio", "fim");

-- CreateIndex
CREATE INDEX "InfReservaArea_tenantId_status_idx" ON "InfReservaArea"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfRegraUso_tenantId_spaceId_idx" ON "InfRegraUso"("tenantId", "spaceId");

-- CreateIndex
CREATE INDEX "InfPontoLuz_tenantId_status_idx" ON "InfPontoLuz"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InfPontoLuz_tenantId_codigo_key" ON "InfPontoLuz"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "InfMedidor_tenantId_tipo_idx" ON "InfMedidor"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "InfMedidor_tenantId_codigo_key" ON "InfMedidor"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "InfLeitura_tenantId_medidorId_dataLeitura_idx" ON "InfLeitura"("tenantId", "medidorId", "dataLeitura");

-- CreateIndex
CREATE INDEX "InfAcaoEficiencia_tenantId_status_idx" ON "InfAcaoEficiencia"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InfRequisitoCurso_tenantId_programId_idx" ON "InfRequisitoCurso"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "JorTemplate_tenantId_persona_status_idx" ON "JorTemplate"("tenantId", "persona", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JorTemplate_tenantId_chave_versao_key" ON "JorTemplate"("tenantId", "chave", "versao");

-- CreateIndex
CREATE INDEX "JorNo_tenantId_templateId_idx" ON "JorNo"("tenantId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "JorNo_templateId_chave_key" ON "JorNo"("templateId", "chave");

-- CreateIndex
CREATE INDEX "JorTransicao_tenantId_templateId_idx" ON "JorTransicao"("tenantId", "templateId");

-- CreateIndex
CREATE INDEX "JorTransicao_templateId_deChave_idx" ON "JorTransicao"("templateId", "deChave");

-- CreateIndex
CREATE INDEX "JorInstancia_tenantId_status_idx" ON "JorInstancia"("tenantId", "status");

-- CreateIndex
CREATE INDEX "JorInstancia_tenantId_personType_personId_idx" ON "JorInstancia"("tenantId", "personType", "personId");

-- CreateIndex
CREATE INDEX "JorInstancia_tenantId_templateId_status_idx" ON "JorInstancia"("tenantId", "templateId", "status");

-- CreateIndex
CREATE INDEX "JorEtapa_tenantId_status_prazoEm_idx" ON "JorEtapa"("tenantId", "status", "prazoEm");

-- CreateIndex
CREATE INDEX "JorEtapa_instanciaId_status_idx" ON "JorEtapa"("instanciaId", "status");

-- CreateIndex
CREATE INDEX "JorEtapa_tenantId_papel_status_idx" ON "JorEtapa"("tenantId", "papel", "status");

-- CreateIndex
CREATE INDEX "JorEtapa_tenantId_noChave_idx" ON "JorEtapa"("tenantId", "noChave");

-- CreateIndex
CREATE INDEX "JorHistorico_tenantId_instanciaId_createdAt_idx" ON "JorHistorico"("tenantId", "instanciaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModConfig_tenantId_key" ON "ModConfig"("tenantId");

-- CreateIndex
CREATE INDEX "ModVerificacao_tenantId_programId_idx" ON "ModVerificacao"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "ModOferta_tenantId_programId_idx" ON "ModOferta"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "ModOferta_tenantId_classSectionId_idx" ON "ModOferta"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "ModEncontro_tenantId_inicio_idx" ON "ModEncontro"("tenantId", "inicio");

-- CreateIndex
CREATE INDEX "ModEncontro_ofertaId_idx" ON "ModEncontro"("ofertaId");

-- CreateIndex
CREATE INDEX "ModAulaLive_tenantId_inicio_idx" ON "ModAulaLive"("tenantId", "inicio");

-- CreateIndex
CREATE INDEX "ModLiveEvento_liveId_studentId_idx" ON "ModLiveEvento"("liveId", "studentId");

-- CreateIndex
CREATE INDEX "ModLiveEvento_tenantId_idx" ON "ModLiveEvento"("tenantId");

-- CreateIndex
CREATE INDEX "ModLivePresenca_tenantId_idx" ON "ModLivePresenca"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ModLivePresenca_liveId_studentId_key" ON "ModLivePresenca"("liveId", "studentId");

-- CreateIndex
CREATE INDEX "ModPolo_tenantId_statusCredenciamento_idx" ON "ModPolo"("tenantId", "statusCredenciamento");

-- CreateIndex
CREATE UNIQUE INDEX "ModPolo_tenantId_codigo_key" ON "ModPolo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ModPoloChecklistItem_tenantId_idx" ON "ModPoloChecklistItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPoloChecklistItem_poloId_chave_key" ON "ModPoloChecklistItem"("poloId", "chave");

-- CreateIndex
CREATE INDEX "ModPoloOferta_tenantId_programId_idx" ON "ModPoloOferta"("tenantId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPoloOferta_poloId_programId_termId_key" ON "ModPoloOferta"("poloId", "programId", "termId");

-- CreateIndex
CREATE INDEX "ModPoloAluno_tenantId_studentId_idx" ON "ModPoloAluno"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPoloAluno_poloId_studentId_key" ON "ModPoloAluno"("poloId", "studentId");

-- CreateIndex
CREATE INDEX "ModTutor_tenantId_ativo_idx" ON "ModTutor"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "ModTutorAlocacao_tenantId_tutorId_idx" ON "ModTutorAlocacao"("tenantId", "tutorId");

-- CreateIndex
CREATE INDEX "ModTutorAlocacao_tenantId_classSectionId_idx" ON "ModTutorAlocacao"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "ModAtendimento_tenantId_status_slaLimite_idx" ON "ModAtendimento"("tenantId", "status", "slaLimite");

-- CreateIndex
CREATE INDEX "ModAtendimento_tenantId_tutorId_idx" ON "ModAtendimento"("tenantId", "tutorId");

-- CreateIndex
CREATE INDEX "ModAtendimento_tenantId_studentId_idx" ON "ModAtendimento"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ModAtendimentoMensagem_atendimentoId_idx" ON "ModAtendimentoMensagem"("atendimentoId");

-- CreateIndex
CREATE INDEX "ModTutorAvaliacao_tenantId_tutorId_idx" ON "ModTutorAvaliacao"("tenantId", "tutorId");

-- CreateIndex
CREATE INDEX "ModEngajamentoEvento_tenantId_studentId_ocorridoEm_idx" ON "ModEngajamentoEvento"("tenantId", "studentId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "ModEngajamentoEvento_tenantId_classSectionId_ocorridoEm_idx" ON "ModEngajamentoEvento"("tenantId", "classSectionId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "ModEngajamentoResumo_tenantId_nivel_idx" ON "ModEngajamentoResumo"("tenantId", "nivel");

-- CreateIndex
CREATE UNIQUE INDEX "ModEngajamentoResumo_tenantId_studentId_key" ON "ModEngajamentoResumo"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ModAlertaInatividade_tenantId_status_idx" ON "ModAlertaInatividade"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ModAlertaInatividade_tenantId_studentId_idx" ON "ModAlertaInatividade"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ModAgendaPratica_tenantId_inicio_idx" ON "ModAgendaPratica"("tenantId", "inicio");

-- CreateIndex
CREATE INDEX "ModAgendaPratica_tenantId_poloId_idx" ON "ModAgendaPratica"("tenantId", "poloId");

-- CreateIndex
CREATE INDEX "ModPraticaInscricao_tenantId_studentId_idx" ON "ModPraticaInscricao"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPraticaInscricao_agendaId_studentId_key" ON "ModPraticaInscricao"("agendaId", "studentId");

-- CreateIndex
CREATE INDEX "ModEstagio_tenantId_studentId_idx" ON "ModEstagio"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ModHoraPratica_tenantId_studentId_idx" ON "ModHoraPratica"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ModPosPrograma_tenantId_nivel_idx" ON "ModPosPrograma"("tenantId", "nivel");

-- CreateIndex
CREATE UNIQUE INDEX "ModPosPrograma_tenantId_codigo_key" ON "ModPosPrograma"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ModPosArea_tenantId_posId_idx" ON "ModPosArea"("tenantId", "posId");

-- CreateIndex
CREATE INDEX "ModPosLinha_tenantId_posId_idx" ON "ModPosLinha"("tenantId", "posId");

-- CreateIndex
CREATE INDEX "ModPosModulo_tenantId_posId_idx" ON "ModPosModulo"("tenantId", "posId");

-- CreateIndex
CREATE INDEX "ModPosTurma_tenantId_idx" ON "ModPosTurma"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPosTurma_posId_codigo_key" ON "ModPosTurma"("posId", "codigo");

-- CreateIndex
CREATE INDEX "ModPosDocente_tenantId_posId_idx" ON "ModPosDocente"("tenantId", "posId");

-- CreateIndex
CREATE INDEX "ModPosDisciplina_tenantId_idx" ON "ModPosDisciplina"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPosDisciplina_posId_codigo_key" ON "ModPosDisciplina"("posId", "codigo");

-- CreateIndex
CREATE INDEX "ModPosColegiado_tenantId_posId_idx" ON "ModPosColegiado"("tenantId", "posId");

-- CreateIndex
CREATE INDEX "ModPosAluno_tenantId_status_idx" ON "ModPosAluno"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ModPosAluno_tenantId_orientadorId_idx" ON "ModPosAluno"("tenantId", "orientadorId");

-- CreateIndex
CREATE UNIQUE INDEX "ModPosAluno_posId_studentId_key" ON "ModPosAluno"("posId", "studentId");

-- CreateIndex
CREATE INDEX "ModPosBanca_tenantId_dataHora_idx" ON "ModPosBanca"("tenantId", "dataHora");

-- CreateIndex
CREATE INDEX "ModPosBolsa_tenantId_status_fim_idx" ON "ModPosBolsa"("tenantId", "status", "fim");

-- CreateIndex
CREATE INDEX "ModPosOferta_tenantId_status_idx" ON "ModPosOferta"("tenantId", "status");

-- CreateIndex
CREATE INDEX "NtRegraAvaliacao_tenantId_escopo_idx" ON "NtRegraAvaliacao"("tenantId", "escopo");

-- CreateIndex
CREATE INDEX "NtRegraAvaliacao_tenantId_programId_idx" ON "NtRegraAvaliacao"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "NtRegraAvaliacao_tenantId_classSectionId_idx" ON "NtRegraAvaliacao"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "NtComponente_tenantId_classSectionId_idx" ON "NtComponente"("tenantId", "classSectionId");

-- CreateIndex
CREATE UNIQUE INDEX "NtComponente_classSectionId_codigo_key" ON "NtComponente"("classSectionId", "codigo");

-- CreateIndex
CREATE INDEX "NtLancamento_tenantId_classSectionId_idx" ON "NtLancamento"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "NtLancamento_tenantId_studentId_idx" ON "NtLancamento"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "NtLancamento_componenteId_studentId_key" ON "NtLancamento"("componenteId", "studentId");

-- CreateIndex
CREATE INDEX "NtLancamentoHistorico_tenantId_lancamentoId_idx" ON "NtLancamentoHistorico"("tenantId", "lancamentoId");

-- CreateIndex
CREATE INDEX "NtLancamentoHistorico_tenantId_classSectionId_idx" ON "NtLancamentoHistorico"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "NtDiario_tenantId_status_idx" ON "NtDiario"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NtDiario_classSectionId_key" ON "NtDiario"("classSectionId");

-- CreateIndex
CREATE INDEX "NtResultado_tenantId_studentId_idx" ON "NtResultado"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "NtResultado_tenantId_termId_idx" ON "NtResultado"("tenantId", "termId");

-- CreateIndex
CREATE INDEX "NtResultado_tenantId_situacao_idx" ON "NtResultado"("tenantId", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "NtResultado_classSectionId_studentId_key" ON "NtResultado"("classSectionId", "studentId");

-- CreateIndex
CREATE INDEX "NtRevisao_tenantId_status_idx" ON "NtRevisao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "NtRevisao_tenantId_studentId_idx" ON "NtRevisao"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "NtRevisao_tenantId_classSectionId_idx" ON "NtRevisao"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "PesPublicacao_tenantId_tipo_ano_idx" ON "PesPublicacao"("tenantId", "tipo", "ano");

-- CreateIndex
CREATE INDEX "PesPublicacao_tenantId_programId_idx" ON "PesPublicacao"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "PesPublicacao_tenantId_grupoId_idx" ON "PesPublicacao"("tenantId", "grupoId");

-- CreateIndex
CREATE INDEX "PesPublicacao_tenantId_doi_idx" ON "PesPublicacao"("tenantId", "doi");

-- CreateIndex
CREATE UNIQUE INDEX "PesPublicacao_tenantId_hashDedupe_key" ON "PesPublicacao"("tenantId", "hashDedupe");

-- CreateIndex
CREATE INDEX "PesPublicacaoAutor_tenantId_userId_idx" ON "PesPublicacaoAutor"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PesPublicacaoAutor_tenantId_studentId_idx" ON "PesPublicacaoAutor"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "PesPublicacaoAutor_publicacaoId_idx" ON "PesPublicacaoAutor"("publicacaoId");

-- CreateIndex
CREATE INDEX "PesGrupo_tenantId_ativo_idx" ON "PesGrupo"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "PesGrupo_tenantId_liderUserId_idx" ON "PesGrupo"("tenantId", "liderUserId");

-- CreateIndex
CREATE INDEX "PesGrupoLinha_tenantId_grupoId_idx" ON "PesGrupoLinha"("tenantId", "grupoId");

-- CreateIndex
CREATE INDEX "PesGrupoMembro_tenantId_grupoId_idx" ON "PesGrupoMembro"("tenantId", "grupoId");

-- CreateIndex
CREATE INDEX "PesGrupoMembro_tenantId_userId_idx" ON "PesGrupoMembro"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PesGrupoMembro_tenantId_studentId_idx" ON "PesGrupoMembro"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "PesProjeto_tenantId_status_idx" ON "PesProjeto"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PesProjeto_tenantId_coordenadorUserId_idx" ON "PesProjeto"("tenantId", "coordenadorUserId");

-- CreateIndex
CREATE INDEX "PesProjeto_tenantId_grupoId_idx" ON "PesProjeto"("tenantId", "grupoId");

-- CreateIndex
CREATE INDEX "PesProjeto_tenantId_programId_idx" ON "PesProjeto"("tenantId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "PesProjeto_tenantId_codigo_key" ON "PesProjeto"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "PesProjetoMembro_tenantId_projetoId_idx" ON "PesProjetoMembro"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoMembro_tenantId_studentId_idx" ON "PesProjetoMembro"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "PesProjetoMembro_tenantId_userId_idx" ON "PesProjetoMembro"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PesProjetoEtapa_tenantId_projetoId_idx" ON "PesProjetoEtapa"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoRubrica_tenantId_projetoId_idx" ON "PesProjetoRubrica"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoLancamento_tenantId_projetoId_idx" ON "PesProjetoLancamento"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoLancamento_rubricaId_idx" ON "PesProjetoLancamento"("rubricaId");

-- CreateIndex
CREATE INDEX "PesProjetoEntregavel_tenantId_projetoId_idx" ON "PesProjetoEntregavel"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoEntregavel_tenantId_status_prazo_idx" ON "PesProjetoEntregavel"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "PesProjetoRelatorio_tenantId_projetoId_idx" ON "PesProjetoRelatorio"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesProjetoRelatorio_tenantId_status_prazo_idx" ON "PesProjetoRelatorio"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "PesEdital_tenantId_status_idx" ON "PesEdital"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PesEdital_tenantId_numero_key" ON "PesEdital"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "PesEditalInscricao_tenantId_editalId_status_idx" ON "PesEditalInscricao"("tenantId", "editalId", "status");

-- CreateIndex
CREATE INDEX "PesEditalInscricao_tenantId_proponenteUserId_idx" ON "PesEditalInscricao"("tenantId", "proponenteUserId");

-- CreateIndex
CREATE INDEX "PesEditalAvaliacao_tenantId_avaliadorUserId_concluida_idx" ON "PesEditalAvaliacao"("tenantId", "avaliadorUserId", "concluida");

-- CreateIndex
CREATE UNIQUE INDEX "PesEditalAvaliacao_inscricaoId_avaliadorUserId_key" ON "PesEditalAvaliacao"("inscricaoId", "avaliadorUserId");

-- CreateIndex
CREATE INDEX "PesBolsa_tenantId_status_idx" ON "PesBolsa"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PesBolsa_tenantId_studentId_idx" ON "PesBolsa"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "PesBolsa_tenantId_projetoId_idx" ON "PesBolsa"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "PesBolsaPagamento_tenantId_status_competencia_idx" ON "PesBolsaPagamento"("tenantId", "status", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "PesBolsaPagamento_bolsaId_competencia_key" ON "PesBolsaPagamento"("bolsaId", "competencia");

-- CreateIndex
CREATE INDEX "PesTrabalho_tenantId_status_idx" ON "PesTrabalho"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PesTrabalho_tenantId_studentId_idx" ON "PesTrabalho"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "PesTrabalho_tenantId_orientadorUserId_idx" ON "PesTrabalho"("tenantId", "orientadorUserId");

-- CreateIndex
CREATE INDEX "PesTrabalho_tenantId_programId_idx" ON "PesTrabalho"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "PesTrabalhoBanca_tenantId_trabalhoId_idx" ON "PesTrabalhoBanca"("tenantId", "trabalhoId");

-- CreateIndex
CREATE INDEX "PesTrabalhoBanca_tenantId_userId_idx" ON "PesTrabalhoBanca"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PesTrabalhoVersao_tenantId_trabalhoId_idx" ON "PesTrabalhoVersao"("tenantId", "trabalhoId");

-- CreateIndex
CREATE UNIQUE INDEX "PesTrabalhoVersao_trabalhoId_numero_key" ON "PesTrabalhoVersao"("trabalhoId", "numero");

-- CreateIndex
CREATE INDEX "PesTrabalhoEvento_tenantId_trabalhoId_idx" ON "PesTrabalhoEvento"("tenantId", "trabalhoId");

-- CreateIndex
CREATE INDEX "PesTrabalhoOrientacao_tenantId_trabalhoId_idx" ON "PesTrabalhoOrientacao"("tenantId", "trabalhoId");

-- CreateIndex
CREATE INDEX "PesPeriodico_tenantId_ativo_idx" ON "PesPeriodico"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "PesPeriodico_tenantId_slug_key" ON "PesPeriodico"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "PesPeriodicoEquipe_tenantId_periodicoId_papel_idx" ON "PesPeriodicoEquipe"("tenantId", "periodicoId", "papel");

-- CreateIndex
CREATE INDEX "PesPeriodicoEquipe_tenantId_userId_idx" ON "PesPeriodicoEquipe"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PesEdicao_tenantId_periodicoId_status_idx" ON "PesEdicao"("tenantId", "periodicoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PesEdicao_periodicoId_volume_numero_ano_key" ON "PesEdicao"("periodicoId", "volume", "numero", "ano");

-- CreateIndex
CREATE INDEX "PesSecao_tenantId_periodicoId_idx" ON "PesSecao"("tenantId", "periodicoId");

-- CreateIndex
CREATE INDEX "PesSubmissao_tenantId_periodicoId_status_idx" ON "PesSubmissao"("tenantId", "periodicoId", "status");

-- CreateIndex
CREATE INDEX "PesSubmissao_tenantId_edicaoId_idx" ON "PesSubmissao"("tenantId", "edicaoId");

-- CreateIndex
CREATE INDEX "PesSubmissao_tenantId_submissorUserId_idx" ON "PesSubmissao"("tenantId", "submissorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PesSubmissao_tenantId_codigo_key" ON "PesSubmissao"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "PesSubmissaoVersao_tenantId_submissaoId_idx" ON "PesSubmissaoVersao"("tenantId", "submissaoId");

-- CreateIndex
CREATE UNIQUE INDEX "PesSubmissaoVersao_submissaoId_numero_key" ON "PesSubmissaoVersao"("submissaoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "PesRevisao_token_key" ON "PesRevisao"("token");

-- CreateIndex
CREATE INDEX "PesRevisao_tenantId_submissaoId_rodada_idx" ON "PesRevisao"("tenantId", "submissaoId", "rodada");

-- CreateIndex
CREATE INDEX "PesRevisao_tenantId_revisorUserId_status_idx" ON "PesRevisao"("tenantId", "revisorUserId", "status");

-- CreateIndex
CREATE INDEX "PesRevisao_tenantId_status_prazo_idx" ON "PesRevisao"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "PesDecisao_tenantId_submissaoId_idx" ON "PesDecisao"("tenantId", "submissaoId");

-- CreateIndex
CREATE INDEX "PesEvento_tenantId_status_idx" ON "PesEvento"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PesEvento_tenantId_slug_key" ON "PesEvento"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "PesEventoTrabalho_tenantId_eventoId_status_idx" ON "PesEventoTrabalho"("tenantId", "eventoId", "status");

-- CreateIndex
CREATE INDEX "PesEventoTrabalho_tenantId_submissorUserId_idx" ON "PesEventoTrabalho"("tenantId", "submissorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PesEventoTrabalho_tenantId_codigo_key" ON "PesEventoTrabalho"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "PesEventoAvaliacao_tenantId_avaliadorUserId_concluida_idx" ON "PesEventoAvaliacao"("tenantId", "avaliadorUserId", "concluida");

-- CreateIndex
CREATE UNIQUE INDEX "PesEventoAvaliacao_trabalhoId_avaliadorUserId_key" ON "PesEventoAvaliacao"("trabalhoId", "avaliadorUserId");

-- CreateIndex
CREATE INDEX "RegProcesso_tenantId_etapa_idx" ON "RegProcesso"("tenantId", "etapa");

-- CreateIndex
CREATE INDEX "RegProcesso_tenantId_tipo_idx" ON "RegProcesso"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "RegProcesso_tenantId_programId_idx" ON "RegProcesso"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "RegProcessoHistorico_tenantId_processoId_idx" ON "RegProcessoHistorico"("tenantId", "processoId");

-- CreateIndex
CREATE INDEX "RegDiligencia_tenantId_status_prazoResposta_idx" ON "RegDiligencia"("tenantId", "status", "prazoResposta");

-- CreateIndex
CREATE INDEX "RegDiligencia_tenantId_processoId_idx" ON "RegDiligencia"("tenantId", "processoId");

-- CreateIndex
CREATE INDEX "RegAto_tenantId_vencimento_idx" ON "RegAto"("tenantId", "vencimento");

-- CreateIndex
CREATE INDEX "RegAto_tenantId_programId_idx" ON "RegAto"("tenantId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "RegAto_tenantId_tipo_numero_key" ON "RegAto"("tenantId", "tipo", "numero");

-- CreateIndex
CREATE INDEX "RegChecklistModelo_tenantId_tipoProcesso_idx" ON "RegChecklistModelo"("tenantId", "tipoProcesso");

-- CreateIndex
CREATE UNIQUE INDEX "RegChecklistModelo_tenantId_chave_key" ON "RegChecklistModelo"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "RegChecklistModeloItem_tenantId_modeloId_idx" ON "RegChecklistModeloItem"("tenantId", "modeloId");

-- CreateIndex
CREATE INDEX "RegChecklist_tenantId_processoId_idx" ON "RegChecklist"("tenantId", "processoId");

-- CreateIndex
CREATE INDEX "RegChecklist_tenantId_programId_idx" ON "RegChecklist"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "RegChecklistItem_tenantId_checklistId_idx" ON "RegChecklistItem"("tenantId", "checklistId");

-- CreateIndex
CREATE INDEX "RegChecklistItem_tenantId_status_prazo_idx" ON "RegChecklistItem"("tenantId", "status", "prazo");

-- CreateIndex
CREATE INDEX "RegIndicador_tenantId_instrumento_dimensao_idx" ON "RegIndicador"("tenantId", "instrumento", "dimensao");

-- CreateIndex
CREATE INDEX "RegIndicador_tenantId_programId_idx" ON "RegIndicador"("tenantId", "programId");

-- CreateIndex
CREATE INDEX "RegSimulacao_tenantId_tipo_createdAt_idx" ON "RegSimulacao"("tenantId", "tipo", "createdAt");

-- CreateIndex
CREATE INDEX "RegAnaliseDocumento_tenantId_processoId_idx" ON "RegAnaliseDocumento"("tenantId", "processoId");

-- CreateIndex
CREATE INDEX "RegAnaliseDocumento_tenantId_createdAt_idx" ON "RegAnaliseDocumento"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ReiObjetivo_tenantId_ciclo_status_idx" ON "ReiObjetivo"("tenantId", "ciclo", "status");

-- CreateIndex
CREATE INDEX "ReiObjetivo_tenantId_programId_idx" ON "ReiObjetivo"("tenantId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "ReiObjetivo_tenantId_codigo_key" ON "ReiObjetivo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ReiResultadoChave_tenantId_objetivoId_idx" ON "ReiResultadoChave"("tenantId", "objetivoId");

-- CreateIndex
CREATE INDEX "ReiResultadoChave_tenantId_indicadorChave_idx" ON "ReiResultadoChave"("tenantId", "indicadorChave");

-- CreateIndex
CREATE INDEX "ReiCheckin_tenantId_resultadoId_createdAt_idx" ON "ReiCheckin"("tenantId", "resultadoId", "createdAt");

-- CreateIndex
CREATE INDEX "ReiSnapshot_tenantId_dia_idx" ON "ReiSnapshot"("tenantId", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "ReiSnapshot_tenantId_chave_dia_key" ON "ReiSnapshot"("tenantId", "chave", "dia");

-- CreateIndex
CREATE INDEX "ReiRelatorio_tenantId_createdAt_idx" ON "ReiRelatorio"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ReiConsultaIA_tenantId_createdAt_idx" ON "ReiConsultaIA"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecContador_tenantId_chave_key" ON "SecContador"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "SecTipoRequerimento_tenantId_ativo_idx" ON "SecTipoRequerimento"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "SecTipoRequerimento_tenantId_codigo_key" ON "SecTipoRequerimento"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SecProtocolo_tenantId_status_idx" ON "SecProtocolo"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SecProtocolo_tenantId_studentId_idx" ON "SecProtocolo"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecProtocolo_tenantId_prazoEm_idx" ON "SecProtocolo"("tenantId", "prazoEm");

-- CreateIndex
CREATE UNIQUE INDEX "SecProtocolo_tenantId_ano_seq_key" ON "SecProtocolo"("tenantId", "ano", "seq");

-- CreateIndex
CREATE INDEX "SecTramite_tenantId_protocoloId_createdAt_idx" ON "SecTramite"("tenantId", "protocoloId", "createdAt");

-- CreateIndex
CREATE INDEX "SecAnexo_tenantId_protocoloId_idx" ON "SecAnexo"("tenantId", "protocoloId");

-- CreateIndex
CREATE INDEX "SecChecklistModelo_tenantId_processo_idx" ON "SecChecklistModelo"("tenantId", "processo");

-- CreateIndex
CREATE UNIQUE INDEX "SecChecklistModelo_tenantId_codigo_key" ON "SecChecklistModelo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SecChecklistItemModelo_tenantId_modeloId_idx" ON "SecChecklistItemModelo"("tenantId", "modeloId");

-- CreateIndex
CREATE INDEX "SecConferencia_tenantId_status_idx" ON "SecConferencia"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SecConferencia_tenantId_protocoloId_idx" ON "SecConferencia"("tenantId", "protocoloId");

-- CreateIndex
CREATE INDEX "SecConferencia_tenantId_studentId_idx" ON "SecConferencia"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecConferencia_tenantId_refType_refId_idx" ON "SecConferencia"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "SecConferenciaItem_tenantId_conferenciaId_idx" ON "SecConferenciaItem"("tenantId", "conferenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "SecDocumentoEmitido_codigo_key" ON "SecDocumentoEmitido"("codigo");

-- CreateIndex
CREATE INDEX "SecDocumentoEmitido_tenantId_tipo_idx" ON "SecDocumentoEmitido"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "SecDocumentoEmitido_tenantId_studentId_idx" ON "SecDocumentoEmitido"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecCertModelo_tenantId_tipo_idx" ON "SecCertModelo"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "SecCertModelo_tenantId_codigo_key" ON "SecCertModelo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SecCertLote_tenantId_modeloId_idx" ON "SecCertLote"("tenantId", "modeloId");

-- CreateIndex
CREATE UNIQUE INDEX "SecCertificado_codigo_key" ON "SecCertificado"("codigo");

-- CreateIndex
CREATE INDEX "SecCertificado_tenantId_status_idx" ON "SecCertificado"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SecCertificado_tenantId_studentId_idx" ON "SecCertificado"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecCertificado_tenantId_modeloId_idx" ON "SecCertificado"("tenantId", "modeloId");

-- CreateIndex
CREATE UNIQUE INDEX "SecCertificado_tenantId_numero_key" ON "SecCertificado"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SecLivro_tenantId_tipo_aberto_idx" ON "SecLivro"("tenantId", "tipo", "aberto");

-- CreateIndex
CREATE UNIQUE INDEX "SecLivro_tenantId_tipo_numero_key" ON "SecLivro"("tenantId", "tipo", "numero");

-- CreateIndex
CREATE INDEX "SecAta_tenantId_tipo_idx" ON "SecAta"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "SecAta_tenantId_colacaoId_idx" ON "SecAta"("tenantId", "colacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "SecDiploma_codigoVerificacao_key" ON "SecDiploma"("codigoVerificacao");

-- CreateIndex
CREATE INDEX "SecDiploma_tenantId_status_idx" ON "SecDiploma"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SecDiploma_tenantId_studentId_idx" ON "SecDiploma"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecDiploma_tenantId_colacaoId_idx" ON "SecDiploma"("tenantId", "colacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "SecDiploma_livroId_numeroRegistro_key" ON "SecDiploma"("livroId", "numeroRegistro");

-- CreateIndex
CREATE INDEX "SecColacao_tenantId_status_data_idx" ON "SecColacao"("tenantId", "status", "data");

-- CreateIndex
CREATE INDEX "SecColacaoFormando_tenantId_studentId_idx" ON "SecColacaoFormando"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SecColacaoFormando_colacaoId_studentId_key" ON "SecColacaoFormando"("colacaoId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SecTemporalidade_tenantId_codigo_key" ON "SecTemporalidade"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SecArquivoItem_tenantId_status_idx" ON "SecArquivoItem"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SecArquivoItem_tenantId_eliminarApos_idx" ON "SecArquivoItem"("tenantId", "eliminarApos");

-- CreateIndex
CREATE INDEX "SecArquivoItem_tenantId_studentId_idx" ON "SecArquivoItem"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SecDescarte_tenantId_status_idx" ON "SecDescarte"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SecDescarte_tenantId_numero_key" ON "SecDescarte"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupFornecedor_tenantId_status_idx" ON "SupFornecedor"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupFornecedor_tenantId_cnpj_key" ON "SupFornecedor"("tenantId", "cnpj");

-- CreateIndex
CREATE INDEX "SupFornecedorDocumento_tenantId_validade_idx" ON "SupFornecedorDocumento"("tenantId", "validade");

-- CreateIndex
CREATE INDEX "SupFornecedorDocumento_fornecedorId_idx" ON "SupFornecedorDocumento"("fornecedorId");

-- CreateIndex
CREATE INDEX "SupFornecedorAvaliacao_tenantId_fornecedorId_idx" ON "SupFornecedorAvaliacao"("tenantId", "fornecedorId");

-- CreateIndex
CREATE INDEX "SupCategoria_tenantId_idx" ON "SupCategoria"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupCategoria_tenantId_nome_key" ON "SupCategoria"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "SupItem_tenantId_categoriaId_idx" ON "SupItem"("tenantId", "categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "SupItem_tenantId_codigo_key" ON "SupItem"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SupAlmoxarifado_tenantId_idx" ON "SupAlmoxarifado"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupAlmoxarifado_tenantId_codigo_key" ON "SupAlmoxarifado"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SupSaldo_tenantId_itemId_idx" ON "SupSaldo"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "SupSaldo_almoxarifadoId_itemId_key" ON "SupSaldo"("almoxarifadoId", "itemId");

-- CreateIndex
CREATE INDEX "SupLote_tenantId_validade_idx" ON "SupLote"("tenantId", "validade");

-- CreateIndex
CREATE UNIQUE INDEX "SupLote_almoxarifadoId_itemId_numero_key" ON "SupLote"("almoxarifadoId", "itemId", "numero");

-- CreateIndex
CREATE INDEX "SupMovimentacao_tenantId_itemId_createdAt_idx" ON "SupMovimentacao"("tenantId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "SupMovimentacao_tenantId_cursoId_idx" ON "SupMovimentacao"("tenantId", "cursoId");

-- CreateIndex
CREATE INDEX "SupMovimentacao_tenantId_origemTipo_origemId_idx" ON "SupMovimentacao"("tenantId", "origemTipo", "origemId");

-- CreateIndex
CREATE INDEX "SupInventario_tenantId_status_idx" ON "SupInventario"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SupInventarioItem_tenantId_idx" ON "SupInventarioItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupInventarioItem_inventarioId_itemId_key" ON "SupInventarioItem"("inventarioId", "itemId");

-- CreateIndex
CREATE INDEX "SupAlcada_tenantId_idx" ON "SupAlcada"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupAlcada_tenantId_nivel_key" ON "SupAlcada"("tenantId", "nivel");

-- CreateIndex
CREATE INDEX "SupRequisicao_tenantId_status_idx" ON "SupRequisicao"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupRequisicao_tenantId_numero_key" ON "SupRequisicao"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupRequisicaoItem_tenantId_requisicaoId_idx" ON "SupRequisicaoItem"("tenantId", "requisicaoId");

-- CreateIndex
CREATE INDEX "SupAprovacao_tenantId_status_papel_idx" ON "SupAprovacao"("tenantId", "status", "papel");

-- CreateIndex
CREATE UNIQUE INDEX "SupAprovacao_requisicaoId_nivel_key" ON "SupAprovacao"("requisicaoId", "nivel");

-- CreateIndex
CREATE INDEX "SupCotacao_tenantId_status_idx" ON "SupCotacao"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupCotacao_tenantId_numero_key" ON "SupCotacao"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupCotacaoProposta_tenantId_idx" ON "SupCotacaoProposta"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupCotacaoProposta_cotacaoId_fornecedorId_key" ON "SupCotacaoProposta"("cotacaoId", "fornecedorId");

-- CreateIndex
CREATE INDEX "SupCotacaoPreco_tenantId_idx" ON "SupCotacaoPreco"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupCotacaoPreco_propostaId_requisicaoItemId_key" ON "SupCotacaoPreco"("propostaId", "requisicaoItemId");

-- CreateIndex
CREATE INDEX "SupPedido_tenantId_status_idx" ON "SupPedido"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SupPedido_tenantId_fornecedorId_idx" ON "SupPedido"("tenantId", "fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "SupPedido_tenantId_numero_key" ON "SupPedido"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupPedidoItem_tenantId_pedidoId_idx" ON "SupPedidoItem"("tenantId", "pedidoId");

-- CreateIndex
CREATE INDEX "SupRecebimento_tenantId_pedidoId_idx" ON "SupRecebimento"("tenantId", "pedidoId");

-- CreateIndex
CREATE INDEX "SupRecebimentoItem_tenantId_recebimentoId_idx" ON "SupRecebimentoItem"("tenantId", "recebimentoId");

-- CreateIndex
CREATE INDEX "SupContrato_tenantId_status_vigenciaFim_idx" ON "SupContrato"("tenantId", "status", "vigenciaFim");

-- CreateIndex
CREATE UNIQUE INDEX "SupContrato_tenantId_numero_key" ON "SupContrato"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupKit_tenantId_disciplineId_idx" ON "SupKit"("tenantId", "disciplineId");

-- CreateIndex
CREATE INDEX "SupKitItem_tenantId_idx" ON "SupKitItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupKitItem_kitId_itemId_key" ON "SupKitItem"("kitId", "itemId");

-- CreateIndex
CREATE INDEX "SupKitConsumo_tenantId_classSectionId_idx" ON "SupKitConsumo"("tenantId", "classSectionId");

-- CreateIndex
CREATE INDEX "SupKitConsumo_tenantId_kitId_idx" ON "SupKitConsumo"("tenantId", "kitId");

-- CreateIndex
CREATE INDEX "SupProduto_tenantId_canal_idx" ON "SupProduto"("tenantId", "canal");

-- CreateIndex
CREATE UNIQUE INDEX "SupProduto_tenantId_itemId_almoxarifadoId_key" ON "SupProduto"("tenantId", "itemId", "almoxarifadoId");

-- CreateIndex
CREATE INDEX "SupCaixa_tenantId_status_idx" ON "SupCaixa"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SupCaixaMov_tenantId_caixaId_idx" ON "SupCaixaMov"("tenantId", "caixaId");

-- CreateIndex
CREATE INDEX "SupVenda_tenantId_createdAt_idx" ON "SupVenda"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SupVenda_tenantId_studentId_idx" ON "SupVenda"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SupVenda_tenantId_numero_key" ON "SupVenda"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "SupVendaItem_tenantId_vendaId_idx" ON "SupVendaItem"("tenantId", "vendaId");

-- CreateIndex
CREATE INDEX "SupDevolucao_tenantId_vendaId_idx" ON "SupDevolucao"("tenantId", "vendaId");

-- CreateIndex
CREATE UNIQUE INDEX "SupSequencia_tenantId_chave_key" ON "SupSequencia"("tenantId", "chave");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentHistory" ADD CONSTRAINT "AppointmentHistory_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentHistory" ADD CONSTRAINT "AppointmentHistory_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentHistory" ADD CONSTRAINT "AppointmentHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentReminder" ADD CONSTRAINT "AppointmentReminder_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentReminder" ADD CONSTRAINT "AppointmentReminder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_accountingAccountId_fkey" FOREIGN KEY ("accountingAccountId") REFERENCES "AccountingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_recurringBillId_fkey" FOREIGN KEY ("recurringBillId") REFERENCES "RecurringBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderConfig" ADD CONSTRAINT "PaymentProviderConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingAccount" ADD CONSTRAINT "AccountingAccount_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxObligation" ADD CONSTRAINT "TaxObligation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxObligation" ADD CONSTRAINT "TaxObligation_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountantPortalAccess" ADD CONSTRAINT "AccountantPortalAccess_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEvolution" ADD CONSTRAINT "ClinicalEvolution_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientClinicalRecord" ADD CONSTRAINT "PatientClinicalRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientClinicalRecordRevision" ADD CONSTRAINT "PatientClinicalRecordRevision_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientClinicalRecordRevision" ADD CONSTRAINT "PatientClinicalRecordRevision_clinicalRecordId_fkey" FOREIGN KEY ("clinicalRecordId") REFERENCES "PatientClinicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdontogramMark" ADD CONSTRAINT "OdontogramMark_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OdontogramMark" ADD CONSTRAINT "OdontogramMark_sourceEvolutionId_fkey" FOREIGN KEY ("sourceEvolutionId") REFERENCES "ClinicalEvolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanRevision" ADD CONSTRAINT "TreatmentPlanRevision_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaboratoryWork" ADD CONSTRAINT "LaboratoryWork_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaboratoryWork" ADD CONSTRAINT "LaboratoryWork_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaboratoryWorkHistory" ADD CONSTRAINT "LaboratoryWorkHistory_laboratoryWorkId_fkey" FOREIGN KEY ("laboratoryWorkId") REFERENCES "LaboratoryWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalDesignCase" ADD CONSTRAINT "DentalDesignCase_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalDesignCase" ADD CONSTRAINT "DentalDesignCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalDesignCase" ADD CONSTRAINT "DentalDesignCase_laboratoryWorkId_fkey" FOREIGN KEY ("laboratoryWorkId") REFERENCES "LaboratoryWork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessProfile" ADD CONSTRAINT "AccessProfile_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessProfilePermission" ADD CONSTRAINT "AccessProfilePermission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AccessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessProfilePermission" ADD CONSTRAINT "AccessProfilePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessProfile" ADD CONSTRAINT "UserAccessProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessProfile" ADD CONSTRAINT "UserAccessProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AccessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HREmployee" ADD CONSTRAINT "HREmployee_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRAttendance" ADD CONSTRAINT "HRAttendance_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRAttendance" ADD CONSTRAINT "HRAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HREmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRPayrollEntry" ADD CONSTRAINT "HRPayrollEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRPayrollEntry" ADD CONSTRAINT "HRPayrollEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HREmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRPayrollClosing" ADD CONSTRAINT "HRPayrollClosing_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRVacation" ADD CONSTRAINT "HRVacation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRVacation" ADD CONSTRAINT "HRVacation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HREmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRDocument" ADD CONSTRAINT "HRDocument_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRDocument" ADD CONSTRAINT "HRDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HREmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRDisciplinaryAction" ADD CONSTRAINT "HRDisciplinaryAction_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRDisciplinaryAction" ADD CONSTRAINT "HRDisciplinaryAction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HREmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevahContact" ADD CONSTRAINT "RevahContact_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevahCampaign" ADD CONSTRAINT "RevahCampaign_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevahCampaign" ADD CONSTRAINT "RevahCampaign_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "RevahSender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevahMessage" ADD CONSTRAINT "RevahMessage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevahMessage" ADD CONSTRAINT "RevahMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "RevahCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevahMessage" ADD CONSTRAINT "RevahMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "RevahSender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLead" ADD CONSTRAINT "SalesLead_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProduct" ADD CONSTRAINT "SalesProduct_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicUnit" ADD CONSTRAINT "ClinicUnit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantStorageConfig" ADD CONSTRAINT "TenantStorageConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFeatureFlag" ADD CONSTRAINT "TenantFeatureFlag_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevahSender" ADD CONSTRAINT "RevahSender_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevahSender" ADD CONSTRAINT "RevahSender_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ClinicUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadImport" ADD CONSTRAINT "LeadImport_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevahConversation" ADD CONSTRAINT "RevahConversation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevahConversationMessage" ADD CONSTRAINT "RevahConversationMessage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevahConversationMessage" ADD CONSTRAINT "RevahConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "RevahConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecializedClinicalRecord" ADD CONSTRAINT "SpecializedClinicalRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecializedClinicalRecord" ADD CONSTRAINT "SpecializedClinicalRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecializedClinicalEvolution" ADD CONSTRAINT "SpecializedClinicalEvolution_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecializedClinicalEvolution" ADD CONSTRAINT "SpecializedClinicalEvolution_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecializedClinicalEvolution" ADD CONSTRAINT "SpecializedClinicalEvolution_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "SpecializedClinicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecializedClinicalAttachment" ADD CONSTRAINT "SpecializedClinicalAttachment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecializedClinicalAttachment" ADD CONSTRAINT "SpecializedClinicalAttachment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecializedClinicalAttachment" ADD CONSTRAINT "SpecializedClinicalAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "SpecializedClinicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAlertResolution" ADD CONSTRAINT "FinancialAlertResolution_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAlertResolution" ADD CONSTRAINT "FinancialAlertResolution_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAlertResolution" ADD CONSTRAINT "FinancialAlertResolution_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAlertResolution" ADD CONSTRAINT "FinancialAlertResolution_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorDocument" ADD CONSTRAINT "DoctorDocument_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementProcedurePrice" ADD CONSTRAINT "AgreementProcedurePrice_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "PartnershipAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeGroup" ADD CONSTRAINT "ChargeGroup_singleChargeTermId_fkey" FOREIGN KEY ("singleChargeTermId") REFERENCES "SingleChargeTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryCharge" ADD CONSTRAINT "BeneficiaryCharge_chargeGroupId_fkey" FOREIGN KEY ("chargeGroupId") REFERENCES "ChargeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryCharge" ADD CONSTRAINT "BeneficiaryCharge_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryCharge" ADD CONSTRAINT "BeneficiaryCharge_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "PartnershipAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeCalculation" ADD CONSTRAINT "ChargeCalculation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "BeneficiaryCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSplitLine" ADD CONSTRAINT "PaymentSplitLine_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "ReceivableCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumDiscipline" ADD CONSTRAINT "CurriculumDiscipline_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumDiscipline" ADD CONSTRAINT "CurriculumDiscipline_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_termId_fkey" FOREIGN KEY ("termId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSectionEnrollment" ADD CONSTRAINT "ClassSectionEnrollment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSectionEnrollment" ADD CONSTRAINT "ClassSectionEnrollment_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSessionBooking" ADD CONSTRAINT "ClassSessionBooking_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "ClassSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSessionBooking" ADD CONSTRAINT "ClassSessionBooking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "ClassSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSubmission" ADD CONSTRAINT "AnswerSubmission_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSubmission" ADD CONSTRAINT "AnswerSubmission_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "EduCostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_accountPayableId_fkey" FOREIGN KEY ("accountPayableId") REFERENCES "AccountPayable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_accountReceivableId_fkey" FOREIGN KEY ("accountReceivableId") REFERENCES "AccountReceivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_contaDebitoId_fkey" FOREIGN KEY ("contaDebitoId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_contaCreditoId_fkey" FOREIGN KEY ("contaCreditoId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalInvoice" ADD CONSTRAINT "FiscalInvoice_accountReceivableId_fkey" FOREIGN KEY ("accountReceivableId") REFERENCES "AccountReceivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLibraryAccess" ADD CONSTRAINT "StudentLibraryAccess_libraryProviderId_fkey" FOREIGN KEY ("libraryProviderId") REFERENCES "LibraryProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmOferta" ADD CONSTRAINT "AdmOferta_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "AdmProcessoSeletivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmCampanhaGasto" ADD CONSTRAINT "AdmCampanhaGasto_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "AdmCampanha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmCandidato" ADD CONSTRAINT "AdmCandidato_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "AdmProcessoSeletivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmCandidato" ADD CONSTRAINT "AdmCandidato_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "AdmCampanha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmInteracao" ADD CONSTRAINT "AdmInteracao_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "AdmCandidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmResultadoProva" ADD CONSTRAINT "AdmResultadoProva_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "AdmCandidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmChamada" ADD CONSTRAINT "AdmChamada_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "AdmProcessoSeletivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmConvocacao" ADD CONSTRAINT "AdmConvocacao_chamadaId_fkey" FOREIGN KEY ("chamadaId") REFERENCES "AdmChamada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmConvocacao" ADD CONSTRAINT "AdmConvocacao_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "AdmCandidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmDocumentoCandidato" ADD CONSTRAINT "AdmDocumentoCandidato_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "AdmCandidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmMatricula" ADD CONSTRAINT "AdmMatricula_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "AdmCandidato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmBolsaConcessao" ADD CONSTRAINT "AdmBolsaConcessao_bolsaId_fkey" FOREIGN KEY ("bolsaId") REFERENCES "AdmBolsa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmRematricula" ADD CONSTRAINT "AdmRematricula_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "AdmRematriculaCampanha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoAdaptacao" ADD CONSTRAINT "ApoAdaptacao_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "ApoPlanoAee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoMonitoriaCandidatura" ADD CONSTRAINT "ApoMonitoriaCandidatura_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "ApoMonitoriaVaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoMonitor" ADD CONSTRAINT "ApoMonitor_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "ApoMonitoriaVaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoMonitoriaFrequencia" ADD CONSTRAINT "ApoMonitoriaFrequencia_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "ApoMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoTurmaApoioParticipante" ADD CONSTRAINT "ApoTurmaApoioParticipante_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "ApoTurmaApoio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoMentoriaEncontro" ADD CONSTRAINT "ApoMentoriaEncontro_mentoriaId_fkey" FOREIGN KEY ("mentoriaId") REFERENCES "ApoMentoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoVaga" ADD CONSTRAINT "ApoVaga_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "ApoEmpresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoCandidaturaVaga" ADD CONSTRAINT "ApoCandidaturaVaga_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "ApoVaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoTermoEstagio" ADD CONSTRAINT "ApoTermoEstagio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "ApoEmpresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoRelatorioEstagio" ADD CONSTRAINT "ApoRelatorioEstagio_termoId_fkey" FOREIGN KEY ("termoId") REFERENCES "ApoTermoEstagio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoContatoEvasao" ADD CONSTRAINT "ApoContatoEvasao_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "ApoPlanoAcao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoFormacaoInscricao" ADD CONSTRAINT "ApoFormacaoInscricao_formacaoId_fkey" FOREIGN KEY ("formacaoId") REFERENCES "ApoFormacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoAplicacao" ADD CONSTRAINT "ApoAplicacao_instrumentoId_fkey" FOREIGN KEY ("instrumentoId") REFERENCES "ApoInstrumento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoParticipacao" ADD CONSTRAINT "ApoParticipacao_aplicacaoId_fkey" FOREIGN KEY ("aplicacaoId") REFERENCES "ApoAplicacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoResposta" ADD CONSTRAINT "ApoResposta_aplicacaoId_fkey" FOREIGN KEY ("aplicacaoId") REFERENCES "ApoAplicacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoDevolutiva" ADD CONSTRAINT "ApoDevolutiva_aplicacaoId_fkey" FOREIGN KEY ("aplicacaoId") REFERENCES "ApoAplicacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoEncaminhamento" ADD CONSTRAINT "ApoEncaminhamento_manifestacaoId_fkey" FOREIGN KEY ("manifestacaoId") REFERENCES "ApoManifestacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoEgressoTrajetoria" ADD CONSTRAINT "ApoEgressoTrajetoria_egressoId_fkey" FOREIGN KEY ("egressoId") REFERENCES "ApoEgresso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoEventoParticipante" ADD CONSTRAINT "ApoEventoParticipante_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "ApoEventoEgresso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApoEventoParticipante" ADD CONSTRAINT "ApoEventoParticipante_egressoId_fkey" FOREIGN KEY ("egressoId") REFERENCES "ApoEgresso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibExemplar" ADD CONSTRAINT "BibExemplar_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "BibObra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibEmprestimo" ADD CONSTRAINT "BibEmprestimo_leitorId_fkey" FOREIGN KEY ("leitorId") REFERENCES "BibLeitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibEmprestimo" ADD CONSTRAINT "BibEmprestimo_exemplarId_fkey" FOREIGN KEY ("exemplarId") REFERENCES "BibExemplar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibReserva" ADD CONSTRAINT "BibReserva_leitorId_fkey" FOREIGN KEY ("leitorId") REFERENCES "BibLeitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibReserva" ADD CONSTRAINT "BibReserva_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "BibObra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibMulta" ADD CONSTRAINT "BibMulta_leitorId_fkey" FOREIGN KEY ("leitorId") REFERENCES "BibLeitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibInventarioItem" ADD CONSTRAINT "BibInventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "BibInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BibAcessoVirtual" ADD CONSTRAINT "BibAcessoVirtual_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES "BibRecursoVirtual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalExameFiscal" ADD CONSTRAINT "CalExameFiscal_exameId_fkey" FOREIGN KEY ("exameId") REFERENCES "CalExame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalPrazoExcecao" ADD CONSTRAINT "CalPrazoExcecao_prazoId_fkey" FOREIGN KEY ("prazoId") REFERENCES "CalPrazoNotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalPrazoConclusao" ADD CONSTRAINT "CalPrazoConclusao_prazoId_fkey" FOREIGN KEY ("prazoId") REFERENCES "CalPrazoNotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComPreferencia" ADD CONSTRAINT "ComPreferencia_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "ComContato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComConversa" ADD CONSTRAINT "ComConversa_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "ComContato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComMensagem" ADD CONSTRAINT "ComMensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "ComConversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComCampanhaDestinatario" ADD CONSTRAINT "ComCampanhaDestinatario_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "ComCampanha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComReguaEtapa" ADD CONSTRAINT "ComReguaEtapa_reguaId_fkey" FOREIGN KEY ("reguaId") REFERENCES "ComRegua"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComReguaExecucao" ADD CONSTRAINT "ComReguaExecucao_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "ComReguaEtapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComSocialPost" ADD CONSTRAINT "ComSocialPost_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ComSocialConta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComSocialMetrica" ADD CONSTRAINT "ComSocialMetrica_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ComSocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComSocialInteracao" ADD CONSTRAINT "ComSocialInteracao_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ComSocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesEixo" ADD CONSTRAINT "DesEixo_exameId_fkey" FOREIGN KEY ("exameId") REFERENCES "DesExame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesEdicao" ADD CONSTRAINT "DesEdicao_exameId_fkey" FOREIGN KEY ("exameId") REFERENCES "DesExame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesInscricao" ADD CONSTRAINT "DesInscricao_edicaoId_fkey" FOREIGN KEY ("edicaoId") REFERENCES "DesEdicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesSimuladoQuestao" ADD CONSTRAINT "DesSimuladoQuestao_simuladoId_fkey" FOREIGN KEY ("simuladoId") REFERENCES "DesSimulado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesSimuladoAlvo" ADD CONSTRAINT "DesSimuladoAlvo_simuladoId_fkey" FOREIGN KEY ("simuladoId") REFERENCES "DesSimulado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesTentativa" ADD CONSTRAINT "DesTentativa_simuladoId_fkey" FOREIGN KEY ("simuladoId") REFERENCES "DesSimulado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesResposta" ADD CONSTRAINT "DesResposta_tentativaId_fkey" FOREIGN KEY ("tentativaId") REFERENCES "DesTentativa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesAtribuicao" ADD CONSTRAINT "DesAtribuicao_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "DesKit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesEntrega" ADD CONSTRAINT "DesEntrega_atribuicaoId_fkey" FOREIGN KEY ("atribuicaoId") REFERENCES "DesAtribuicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesTrilhaItem" ADD CONSTRAINT "DesTrilhaItem_trilhaId_fkey" FOREIGN KEY ("trilhaId") REFERENCES "DesTrilha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPdiEixo" ADD CONSTRAINT "GovPdiEixo_pdiId_fkey" FOREIGN KEY ("pdiId") REFERENCES "GovPdi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPdiObjetivo" ADD CONSTRAINT "GovPdiObjetivo_eixoId_fkey" FOREIGN KEY ("eixoId") REFERENCES "GovPdiEixo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPdiMeta" ADD CONSTRAINT "GovPdiMeta_objetivoId_fkey" FOREIGN KEY ("objetivoId") REFERENCES "GovPdiObjetivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPdiMedicao" ADD CONSTRAINT "GovPdiMedicao_metaId_fkey" FOREIGN KEY ("metaId") REFERENCES "GovPdiMeta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPdiAcao" ADD CONSTRAINT "GovPdiAcao_metaId_fkey" FOREIGN KEY ("metaId") REFERENCES "GovPdiMeta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovDocumentoVersao" ADD CONSTRAINT "GovDocumentoVersao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "GovDocumento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaMembro" ADD CONSTRAINT "GovCpaMembro_cpaId_fkey" FOREIGN KEY ("cpaId") REFERENCES "GovCpa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaQuestionario" ADD CONSTRAINT "GovCpaQuestionario_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "GovCpaCiclo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaPergunta" ADD CONSTRAINT "GovCpaPergunta_questionarioId_fkey" FOREIGN KEY ("questionarioId") REFERENCES "GovCpaQuestionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaConvite" ADD CONSTRAINT "GovCpaConvite_questionarioId_fkey" FOREIGN KEY ("questionarioId") REFERENCES "GovCpaQuestionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaResposta" ADD CONSTRAINT "GovCpaResposta_questionarioId_fkey" FOREIGN KEY ("questionarioId") REFERENCES "GovCpaQuestionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaRespostaItem" ADD CONSTRAINT "GovCpaRespostaItem_respostaId_fkey" FOREIGN KEY ("respostaId") REFERENCES "GovCpaResposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaRelatorio" ADD CONSTRAINT "GovCpaRelatorio_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "GovCpaCiclo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCpaPlanoAcao" ADD CONSTRAINT "GovCpaPlanoAcao_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "GovCpaCiclo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovNdeMembro" ADD CONSTRAINT "GovNdeMembro_ndeId_fkey" FOREIGN KEY ("ndeId") REFERENCES "GovNde"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovNdeReuniao" ADD CONSTRAINT "GovNdeReuniao_ndeId_fkey" FOREIGN KEY ("ndeId") REFERENCES "GovNde"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovOrgaoMembro" ADD CONSTRAINT "GovOrgaoMembro_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "GovOrgao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovReuniao" ADD CONSTRAINT "GovReuniao_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "GovOrgao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovPauta" ADD CONSTRAINT "GovPauta_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "GovReuniao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovDeliberacao" ADD CONSTRAINT "GovDeliberacao_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "GovReuniao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovVotoRegistro" ADD CONSTRAINT "GovVotoRegistro_deliberacaoId_fkey" FOREIGN KEY ("deliberacaoId") REFERENCES "GovDeliberacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCipaMembro" ADD CONSTRAINT "GovCipaMembro_gestaoId_fkey" FOREIGN KEY ("gestaoId") REFERENCES "GovCipaGestao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCipaReuniao" ADD CONSTRAINT "GovCipaReuniao_gestaoId_fkey" FOREIGN KEY ("gestaoId") REFERENCES "GovCipaGestao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCarreiraNivel" ADD CONSTRAINT "GovCarreiraNivel_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "GovCarreiraPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovCarreiraProgressao" ADD CONSTRAINT "GovCarreiraProgressao_enquadramentoId_fkey" FOREIGN KEY ("enquadramentoId") REFERENCES "GovCarreiraEnquadramento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfBem" ADD CONSTRAINT "InfBem_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "InfCategoriaBem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfMovimentacaoBem" ADD CONSTRAINT "InfMovimentacaoBem_bemId_fkey" FOREIGN KEY ("bemId") REFERENCES "InfBem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfInventarioItem" ADD CONSTRAINT "InfInventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InfInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfOsPeca" ADD CONSTRAINT "InfOsPeca_osId_fkey" FOREIGN KEY ("osId") REFERENCES "InfOrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfChamadoComentario" ADD CONSTRAINT "InfChamadoComentario_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "InfChamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfProjetoEtapa" ADD CONSTRAINT "InfProjetoEtapa_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "InfProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfVaga" ADD CONSTRAINT "InfVaga_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "InfAreaEstacionamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfLeitura" ADD CONSTRAINT "InfLeitura_medidorId_fkey" FOREIGN KEY ("medidorId") REFERENCES "InfMedidor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JorNo" ADD CONSTRAINT "JorNo_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JorTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JorTransicao" ADD CONSTRAINT "JorTransicao_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JorTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JorInstancia" ADD CONSTRAINT "JorInstancia_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JorTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JorEtapa" ADD CONSTRAINT "JorEtapa_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "JorInstancia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JorHistorico" ADD CONSTRAINT "JorHistorico_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "JorInstancia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModEncontro" ADD CONSTRAINT "ModEncontro_ofertaId_fkey" FOREIGN KEY ("ofertaId") REFERENCES "ModOferta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModAulaLive" ADD CONSTRAINT "ModAulaLive_ofertaId_fkey" FOREIGN KEY ("ofertaId") REFERENCES "ModOferta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModLiveEvento" ADD CONSTRAINT "ModLiveEvento_liveId_fkey" FOREIGN KEY ("liveId") REFERENCES "ModAulaLive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModLivePresenca" ADD CONSTRAINT "ModLivePresenca_liveId_fkey" FOREIGN KEY ("liveId") REFERENCES "ModAulaLive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPoloChecklistItem" ADD CONSTRAINT "ModPoloChecklistItem_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES "ModPolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPoloOferta" ADD CONSTRAINT "ModPoloOferta_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES "ModPolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPoloAluno" ADD CONSTRAINT "ModPoloAluno_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES "ModPolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModTutorAlocacao" ADD CONSTRAINT "ModTutorAlocacao_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "ModTutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModAtendimentoMensagem" ADD CONSTRAINT "ModAtendimentoMensagem_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "ModAtendimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModTutorAvaliacao" ADD CONSTRAINT "ModTutorAvaliacao_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "ModTutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPraticaInscricao" ADD CONSTRAINT "ModPraticaInscricao_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "ModAgendaPratica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModHoraPratica" ADD CONSTRAINT "ModHoraPratica_estagioId_fkey" FOREIGN KEY ("estagioId") REFERENCES "ModEstagio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosArea" ADD CONSTRAINT "ModPosArea_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosLinha" ADD CONSTRAINT "ModPosLinha_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosLinha" ADD CONSTRAINT "ModPosLinha_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "ModPosArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosModulo" ADD CONSTRAINT "ModPosModulo_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosTurma" ADD CONSTRAINT "ModPosTurma_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosDocente" ADD CONSTRAINT "ModPosDocente_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosDisciplina" ADD CONSTRAINT "ModPosDisciplina_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosColegiado" ADD CONSTRAINT "ModPosColegiado_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosAluno" ADD CONSTRAINT "ModPosAluno_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosBanca" ADD CONSTRAINT "ModPosBanca_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "ModPosAluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosBolsa" ADD CONSTRAINT "ModPosBolsa_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "ModPosAluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModPosOferta" ADD CONSTRAINT "ModPosOferta_posId_fkey" FOREIGN KEY ("posId") REFERENCES "ModPosPrograma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NtLancamento" ADD CONSTRAINT "NtLancamento_componenteId_fkey" FOREIGN KEY ("componenteId") REFERENCES "NtComponente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NtLancamentoHistorico" ADD CONSTRAINT "NtLancamentoHistorico_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "NtLancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesPublicacaoAutor" ADD CONSTRAINT "PesPublicacaoAutor_publicacaoId_fkey" FOREIGN KEY ("publicacaoId") REFERENCES "PesPublicacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesGrupoLinha" ADD CONSTRAINT "PesGrupoLinha_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "PesGrupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesGrupoMembro" ADD CONSTRAINT "PesGrupoMembro_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "PesGrupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoMembro" ADD CONSTRAINT "PesProjetoMembro_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoEtapa" ADD CONSTRAINT "PesProjetoEtapa_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoRubrica" ADD CONSTRAINT "PesProjetoRubrica_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoLancamento" ADD CONSTRAINT "PesProjetoLancamento_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoLancamento" ADD CONSTRAINT "PesProjetoLancamento_rubricaId_fkey" FOREIGN KEY ("rubricaId") REFERENCES "PesProjetoRubrica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoEntregavel" ADD CONSTRAINT "PesProjetoEntregavel_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesProjetoRelatorio" ADD CONSTRAINT "PesProjetoRelatorio_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "PesProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesEditalInscricao" ADD CONSTRAINT "PesEditalInscricao_editalId_fkey" FOREIGN KEY ("editalId") REFERENCES "PesEdital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesEditalAvaliacao" ADD CONSTRAINT "PesEditalAvaliacao_inscricaoId_fkey" FOREIGN KEY ("inscricaoId") REFERENCES "PesEditalInscricao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesBolsaPagamento" ADD CONSTRAINT "PesBolsaPagamento_bolsaId_fkey" FOREIGN KEY ("bolsaId") REFERENCES "PesBolsa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesTrabalhoBanca" ADD CONSTRAINT "PesTrabalhoBanca_trabalhoId_fkey" FOREIGN KEY ("trabalhoId") REFERENCES "PesTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesTrabalhoVersao" ADD CONSTRAINT "PesTrabalhoVersao_trabalhoId_fkey" FOREIGN KEY ("trabalhoId") REFERENCES "PesTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesTrabalhoEvento" ADD CONSTRAINT "PesTrabalhoEvento_trabalhoId_fkey" FOREIGN KEY ("trabalhoId") REFERENCES "PesTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesTrabalhoOrientacao" ADD CONSTRAINT "PesTrabalhoOrientacao_trabalhoId_fkey" FOREIGN KEY ("trabalhoId") REFERENCES "PesTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesPeriodicoEquipe" ADD CONSTRAINT "PesPeriodicoEquipe_periodicoId_fkey" FOREIGN KEY ("periodicoId") REFERENCES "PesPeriodico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesEdicao" ADD CONSTRAINT "PesEdicao_periodicoId_fkey" FOREIGN KEY ("periodicoId") REFERENCES "PesPeriodico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesSecao" ADD CONSTRAINT "PesSecao_periodicoId_fkey" FOREIGN KEY ("periodicoId") REFERENCES "PesPeriodico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesSubmissao" ADD CONSTRAINT "PesSubmissao_periodicoId_fkey" FOREIGN KEY ("periodicoId") REFERENCES "PesPeriodico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesSubmissao" ADD CONSTRAINT "PesSubmissao_edicaoId_fkey" FOREIGN KEY ("edicaoId") REFERENCES "PesEdicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesSubmissao" ADD CONSTRAINT "PesSubmissao_secaoId_fkey" FOREIGN KEY ("secaoId") REFERENCES "PesSecao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesSubmissaoVersao" ADD CONSTRAINT "PesSubmissaoVersao_submissaoId_fkey" FOREIGN KEY ("submissaoId") REFERENCES "PesSubmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesRevisao" ADD CONSTRAINT "PesRevisao_submissaoId_fkey" FOREIGN KEY ("submissaoId") REFERENCES "PesSubmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesDecisao" ADD CONSTRAINT "PesDecisao_submissaoId_fkey" FOREIGN KEY ("submissaoId") REFERENCES "PesSubmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesEventoTrabalho" ADD CONSTRAINT "PesEventoTrabalho_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "PesEvento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesEventoAvaliacao" ADD CONSTRAINT "PesEventoAvaliacao_trabalhoId_fkey" FOREIGN KEY ("trabalhoId") REFERENCES "PesEventoTrabalho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegProcessoHistorico" ADD CONSTRAINT "RegProcessoHistorico_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "RegProcesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegDiligencia" ADD CONSTRAINT "RegDiligencia_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "RegProcesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegChecklistModeloItem" ADD CONSTRAINT "RegChecklistModeloItem_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "RegChecklistModelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegChecklist" ADD CONSTRAINT "RegChecklist_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "RegProcesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegChecklistItem" ADD CONSTRAINT "RegChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "RegChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReiResultadoChave" ADD CONSTRAINT "ReiResultadoChave_objetivoId_fkey" FOREIGN KEY ("objetivoId") REFERENCES "ReiObjetivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReiCheckin" ADD CONSTRAINT "ReiCheckin_resultadoId_fkey" FOREIGN KEY ("resultadoId") REFERENCES "ReiResultadoChave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecProtocolo" ADD CONSTRAINT "SecProtocolo_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "SecTipoRequerimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecTramite" ADD CONSTRAINT "SecTramite_protocoloId_fkey" FOREIGN KEY ("protocoloId") REFERENCES "SecProtocolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecAnexo" ADD CONSTRAINT "SecAnexo_protocoloId_fkey" FOREIGN KEY ("protocoloId") REFERENCES "SecProtocolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecChecklistItemModelo" ADD CONSTRAINT "SecChecklistItemModelo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "SecChecklistModelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecConferenciaItem" ADD CONSTRAINT "SecConferenciaItem_conferenciaId_fkey" FOREIGN KEY ("conferenciaId") REFERENCES "SecConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecCertLote" ADD CONSTRAINT "SecCertLote_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "SecCertModelo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecCertificado" ADD CONSTRAINT "SecCertificado_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "SecCertModelo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecCertificado" ADD CONSTRAINT "SecCertificado_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "SecCertLote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecAta" ADD CONSTRAINT "SecAta_livroId_fkey" FOREIGN KEY ("livroId") REFERENCES "SecLivro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecDiploma" ADD CONSTRAINT "SecDiploma_livroId_fkey" FOREIGN KEY ("livroId") REFERENCES "SecLivro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecColacaoFormando" ADD CONSTRAINT "SecColacaoFormando_colacaoId_fkey" FOREIGN KEY ("colacaoId") REFERENCES "SecColacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupFornecedorDocumento" ADD CONSTRAINT "SupFornecedorDocumento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "SupFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupFornecedorAvaliacao" ADD CONSTRAINT "SupFornecedorAvaliacao_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "SupFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupItem" ADD CONSTRAINT "SupItem_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "SupCategoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupSaldo" ADD CONSTRAINT "SupSaldo_almoxarifadoId_fkey" FOREIGN KEY ("almoxarifadoId") REFERENCES "SupAlmoxarifado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupSaldo" ADD CONSTRAINT "SupSaldo_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SupItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupLote" ADD CONSTRAINT "SupLote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SupItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupMovimentacao" ADD CONSTRAINT "SupMovimentacao_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SupItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupInventarioItem" ADD CONSTRAINT "SupInventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "SupInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupRequisicaoItem" ADD CONSTRAINT "SupRequisicaoItem_requisicaoId_fkey" FOREIGN KEY ("requisicaoId") REFERENCES "SupRequisicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupAprovacao" ADD CONSTRAINT "SupAprovacao_requisicaoId_fkey" FOREIGN KEY ("requisicaoId") REFERENCES "SupRequisicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupCotacao" ADD CONSTRAINT "SupCotacao_requisicaoId_fkey" FOREIGN KEY ("requisicaoId") REFERENCES "SupRequisicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupCotacaoProposta" ADD CONSTRAINT "SupCotacaoProposta_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "SupCotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupCotacaoPreco" ADD CONSTRAINT "SupCotacaoPreco_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "SupCotacaoProposta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupPedido" ADD CONSTRAINT "SupPedido_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "SupFornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupPedidoItem" ADD CONSTRAINT "SupPedidoItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "SupPedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupRecebimento" ADD CONSTRAINT "SupRecebimento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "SupPedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupRecebimentoItem" ADD CONSTRAINT "SupRecebimentoItem_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "SupRecebimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupContrato" ADD CONSTRAINT "SupContrato_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "SupFornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupKitItem" ADD CONSTRAINT "SupKitItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "SupKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupKitConsumo" ADD CONSTRAINT "SupKitConsumo_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "SupKit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupCaixaMov" ADD CONSTRAINT "SupCaixaMov_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "SupCaixa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupVenda" ADD CONSTRAINT "SupVenda_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "SupCaixa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupVendaItem" ADD CONSTRAINT "SupVendaItem_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "SupVenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupDevolucao" ADD CONSTRAINT "SupDevolucao_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "SupVenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
