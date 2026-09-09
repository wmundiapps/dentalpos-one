-- DentalPos One — Piloto 5787 — preflight SOMENTE LEITURA
-- Não altera schema, dados, migrations ou segredos.

SELECT current_database() AS database_name, current_schema() AS schema_name;

SELECT
  expected.name,
  to_regclass(format('"%s"', expected.name)) AS relation
FROM (
  VALUES
    ('SalesProduct'),
    ('SalesLead'),
    ('SalesLeadEvent'),
    ('TenantFeatureFlag'),
    ('Supplier'),
    ('IntegrationWebhookEvent'),
    ('PasswordResetToken'),
    ('PatientClinicalRecord'),
    ('PatientClinicalRecordRevision'),
    ('ClinicalCustomFieldDefinition'),
    ('SpecializedClinicalRecord'),
    ('SpecializedClinicalEvolution'),
    ('SpecializedClinicalAttachment'),
    ('DentalChartEntry'),
    ('DentalFindingDefinition'),
    ('PeriodontalExam'),
    ('PeriodontalSiteRecord'),
    ('TreatmentPlanRevision'),
    ('BudgetRevision'),
    ('FinancialAlertResolution'),
    ('OperationalAlertResolution'),
    ('ClinicalDocumentTemplate'),
    ('ClinicalDocument'),
    ('ClinicalDocumentHistory'),
    ('ClinicalFileCategory'),
    ('ClinicalFile'),
    ('SurgeryCase'),
    ('SurgeryFollowUp'),
    ('ImplantRecord'),
    ('ProsthesisCase'),
    ('ProsthesisHistory')
) AS expected(name)
ORDER BY expected.name;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND (
    (table_name = 'TreatmentItem' AND column_name IN ('planningData'))
    OR
    (table_name = 'Budget' AND column_name IN (
      'acceptedAt','acceptedByName','acceptedByDocument','acceptanceEvidence'
    ))
    OR
    (table_name = 'ClinicalEvolution' AND column_name IN (
      'appointmentId','teeth','regions','anesthetic','materials',
      'complications','guidance','attachments','authoredBy'
    ))
  )
ORDER BY table_name, ordinal_position;

SELECT to_regclass('"_prisma_migrations"') AS prisma_migrations_table;
