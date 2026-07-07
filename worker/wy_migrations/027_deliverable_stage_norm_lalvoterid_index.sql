-- worker/wy_migrations/027_deliverable_stage_norm_lalvoterid_index.sql
-- deliverable_stage_norm has zero indexes, so v_unique_name_email_all's
-- stage_name/stage_email CTEs force SQLite to build an ephemeral index on
-- lalvoterid from scratch on every single call (confirmed via
-- EXPLAIN QUERY PLAN: "AUTOMATIC PARTIAL COVERING INDEX (lalvoterid=?)",
-- twice per query). A persistent index removes that repeated cost.
--
-- This does NOT speed up county/house_district/senate_district filtering --
-- those are MAX()-aggregated in a GROUP BY, so the final step is always a
-- full SCAN of the view's output regardless of indexes on the base tables.

CREATE INDEX IF NOT EXISTS idx_deliverable_stage_norm_lalvoterid
  ON deliverable_stage_norm(lalvoterid);
