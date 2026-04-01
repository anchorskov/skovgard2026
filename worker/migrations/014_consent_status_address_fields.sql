-- worker/migrations/014_consent_status_address_fields.sql
ALTER TABLE consent_status ADD COLUMN address1 TEXT;
ALTER TABLE consent_status ADD COLUMN address2 TEXT;
ALTER TABLE consent_status ADD COLUMN city TEXT;
ALTER TABLE consent_status ADD COLUMN state TEXT;
ALTER TABLE consent_status ADD COLUMN country TEXT;
ALTER TABLE consent_status ADD COLUMN state_house_district TEXT;
ALTER TABLE consent_status ADD COLUMN state_senate_district TEXT;
