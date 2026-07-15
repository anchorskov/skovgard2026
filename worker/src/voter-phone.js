function normalizePhoneE164(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

/**
 * Promote a voter-entered opt-in phone after delivery has proved the number
 * can receive campaign texts. Existing voter phone rows are retained as
 * history; only the current best-phone pointer changes.
 */
export async function promoteDeliveredOptInPhone(wyDb, { voterId, phoneE164 }) {
  const normalizedPhone = normalizePhoneE164(phoneE164);
  const phone10 = normalizedPhone.replace(/^\+1/, "");
  const normalizedVoterId = String(voterId || "").trim();
  if (!wyDb || !normalizedVoterId || phone10.length !== 10) {
    return { promoted: false, reason: "invalid_input" };
  }

  const conflicts = await wyDb.prepare(
    `SELECT DISTINCT voter_id
       FROM (
         SELECT voter_id FROM v_best_phone WHERE phone_e164 = ?1
         UNION ALL
         SELECT voter_id FROM voter_phones WHERE phone_e164 = ?1
       )
      LIMIT 2`
  )
    .bind(normalizedPhone)
    .all()
    .then((result) => result?.results || [])
    .catch(() => []);

  if (conflicts.some((row) => String(row?.voter_id || "").trim() !== normalizedVoterId)) {
    return { promoted: false, reason: "phone_belongs_to_other_voter" };
  }

  const priorBest = await wyDb.prepare(
    `SELECT phone_e164 FROM v_best_phone WHERE voter_id = ?1`
  ).bind(normalizedVoterId).first().catch(() => null);

  const isWyArea = phone10.startsWith("307") ? 1 : 0;
  const confidenceCode = 5;
  const source = "skovgard_optin_delivered";

  await wyDb.prepare(
    `INSERT INTO voter_phones
       (voter_id, phone10, phone_e164, confidence_code, is_wy_area, source, imported_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
     ON CONFLICT(voter_id, phone10) DO UPDATE SET
       phone_e164 = excluded.phone_e164,
       confidence_code = MAX(COALESCE(voter_phones.confidence_code, 0), excluded.confidence_code),
       is_wy_area = excluded.is_wy_area,
       source = excluded.source,
       imported_at = datetime('now')`
  )
    .bind(normalizedVoterId, phone10, normalizedPhone, confidenceCode, isWyArea, source)
    .run();

  await wyDb.prepare(
    `INSERT INTO v_best_phone
       (voter_id, phone_e164, confidence_code, is_wy_area, imported_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'))
     ON CONFLICT(voter_id) DO UPDATE SET
       phone_e164 = excluded.phone_e164,
       confidence_code = excluded.confidence_code,
       is_wy_area = excluded.is_wy_area,
       imported_at = datetime('now')`
  )
    .bind(normalizedVoterId, normalizedPhone, confidenceCode, isWyArea)
    .run();

  return {
    promoted: true,
    changed: String(priorBest?.phone_e164 || "") !== normalizedPhone,
    previousPhone: priorBest?.phone_e164 || null,
    phoneE164: normalizedPhone,
  };
}
