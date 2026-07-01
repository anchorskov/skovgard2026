-- Add docs_json to candidates for campaign-provided supporting documents.
-- Stores a JSON array: [{"title": "Position Statement", "path": "candidates/jane-doe/docs/position.pdf", "type": "pdf"}]
-- "path" is relative to media.skovgard2026.org — construct the full URL at render time.
-- Separate from external_links_json (external web links). This column is for locally-hosted files.
ALTER TABLE candidates ADD COLUMN docs_json TEXT;
