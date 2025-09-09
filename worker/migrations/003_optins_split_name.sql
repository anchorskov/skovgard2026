ALTER TABLE sms_optins ADD COLUMN first_name TEXT;
ALTER TABLE sms_optins ADD COLUMN last_name  TEXT;

CREATE INDEX IF NOT EXISTS ix_sms_optins_last_zip ON sms_optins(last_name, zip);
CREATE INDEX IF NOT EXISTS ix_sms_optins_name_zip ON sms_optins(first_name, last_name, zip);
