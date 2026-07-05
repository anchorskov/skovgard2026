import generatedRubric from '../data/wy-primary-2026-v1.generated.json';

export async function loadActiveRubric(db) {
  if (!db) return generatedRubric;
  try {
    const version = await db.prepare(`
      SELECT rubric_key, title, election_cycle, score_min, score_max,
             unknown_policy, status, source_sha256
      FROM guide_rubric_versions
      WHERE election_cycle = ? AND status = 'active'
      LIMIT 1
    `).bind(generatedRubric.electionCycle).first();
    if (!version) return generatedRubric;

    const { results } = await db.prepare(`
      SELECT category_key, label, description, evidence_guidance, weight, display_order
      FROM guide_rubric_categories
      WHERE rubric_version_id = (
        SELECT id FROM guide_rubric_versions WHERE rubric_key = ?
      ) AND active = 1
      ORDER BY display_order
    `).bind(version.rubric_key).all();
    const keys = new Set(results.map((row) => row.category_key));
    const totalWeight = results.reduce((sum, row) => sum + Number(row.weight), 0);
    if (!results.length || keys.size !== results.length || totalWeight !== 100) return generatedRubric;

    return {
      ...generatedRubric,
      rubricKey: version.rubric_key,
      title: version.title,
      electionCycle: version.election_cycle,
      status: version.status,
      sourceSha256: version.source_sha256,
      scoring: {
        ...generatedRubric.scoring,
        min: version.score_min,
        max: version.score_max,
        unknownPolicy: version.unknown_policy,
      },
      categories: results.map((row, index) => ({
        number: index + 1,
        key: row.category_key,
        label: row.label,
        weight: row.weight,
        displayOrder: row.display_order,
        standard: row.description,
        evidenceGuidance: row.evidence_guidance,
      })),
    };
  } catch {
    return generatedRubric;
  }
}
