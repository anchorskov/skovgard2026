-- worker/migrations/034_consent_status_voter_id.sql
-- Durable local record of which WY_DB voter a /pulse contact was matched
-- to. Previously the only trace of a match was the phone-keyed WY_DB
-- mirror (voter_phones/v_best_phone) -- a different database, keyed by a
-- mutable field, and delivery-gated, none of which make it a reliable
-- "is this contact voter X" lookup for this repo's own tables. Written by
-- POST /api/optin on a fresh match and by the pulse-voter-review
-- resolve/mint-and-send admin actions, always via
-- COALESCE(voter_id, new_value) -- once set, never cleared by a later,
-- less-informative resubmission. Deliberately NOT gated on overwriteProfile
-- the way other consent_status columns are (see upsertConsentStatus in
-- worker/src/telnyx.js) -- a voter match, once made, is a fact that
-- shouldn't be erasable by an "updates only" resubmission that never
-- collected verification fields in the first place.

ALTER TABLE consent_status ADD COLUMN voter_id TEXT;
