-- worker/migrations/017_sms_optins_is_volunteer.sql
ALTER TABLE sms_optins
  ADD COLUMN is_volunteer INTEGER NOT NULL DEFAULT 0 CHECK (is_volunteer IN (0, 1));
