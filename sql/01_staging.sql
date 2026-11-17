-- 01_staging.sql (DuckDB): load every raw CSV into one clean table.
-- {RAW_GLOB} is replaced by build.py with the path to data/raw/*.csv.
--
-- Every column is read as text first, then cast, so a file with an empty
-- column cannot change the types.
--
-- TO VERIFY ON REAL DATA (stage 2 of the build): the WHERE clause keeps only
-- the totals across second partner, customs procedure and transport mode.
-- If the API returns different codes for those totals, the duplicate-key
-- check in 03_checks.sql fails and this filter must be corrected.

DROP TABLE IF EXISTS stg_trade;

CREATE TABLE stg_trade AS
SELECT
    query_id,
    TRY_CAST(refYear AS INTEGER)                AS year,
    reporterISO                                 AS reporter,
    reporterDesc                                AS reporter_name,
    flowCode                                    AS flow,
    TRY_CAST(partnerCode AS INTEGER)            AS partner_code,
    partnerISO                                  AS partner,
    partnerDesc                                 AS partner_name,
    cmdCode                                     AS hs,
    TRY_CAST(primaryValue AS DOUBLE)            AS value_usd,
    -- Weight in kilograms: net weight first; if it is missing, the quantity
    -- when its unit is kilograms (unit code 8).
    COALESCE(
        NULLIF(TRY_CAST(netWgt AS DOUBLE), 0),
        CASE WHEN TRY_CAST(qtyUnitCode AS INTEGER) = 8 THEN NULLIF(TRY_CAST(qty AS DOUBLE), 0) END
    )                                           AS net_kg
FROM read_csv('{RAW_GLOB}', union_by_name = true, all_varchar = true)
WHERE TRY_CAST(partner2Code AS INTEGER) = 0
  AND customsCode = 'C00'
  AND TRY_CAST(motCode AS INTEGER) = 0
  AND flowCode IN ('M', 'X');
