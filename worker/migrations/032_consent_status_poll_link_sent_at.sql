-- worker/migrations/032_consent_status_poll_link_sent_at.sql
-- Tracks whether this contact has ever actually been sent a Citizen Poll
-- ballot link (SMS and/or email), independent of the general
-- welcome-text/confirmation-email "first time subscribing" gates
-- (contacts.welcome_sent_at, consent_status wasOptedIn/hadEmailConsent in
-- worker/src/index.js). Those gates exist to avoid re-welcoming an existing
-- subscriber and have nothing to do with poll delivery -- a matched,
-- freshly-minted poll link was previously being silently dropped for
-- anyone who already had welcome_sent_at set or was already opted in with
-- email consent, even though a real new token had just been minted for
-- them on grassmvt_survey. Only set once a send actually succeeds (not
-- merely attempted), so a failed delivery still retries on the next
-- /pulse submission instead of being marked done.

ALTER TABLE consent_status ADD COLUMN poll_link_sent_at TEXT;
