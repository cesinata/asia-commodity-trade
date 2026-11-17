-- 03_checks.sql: every query below looks for a problem and should return no rows.
-- "fail" stops the build. "warn" is printed and the build continues.
-- Header format (read by build.py):  -- check: <name> | <fail or warn> | <what it means>

-- check: duplicate_keys | fail | The same reporter, flow, product, year and partner appears more than once, so totals would be double counted. Fix the filter in 01_staging.sql.
SELECT query_id, reporter, flow, hs, year, partner_code, COUNT(*) AS copies
FROM stg_trade
GROUP BY query_id, reporter, flow, hs, year, partner_code
HAVING COUNT(*) > 1;

-- check: negative_values | fail | Trade value or weight below zero.
SELECT query_id, year, partner, hs, value_usd, net_kg
FROM stg_trade
WHERE value_usd < 0 OR net_kg < 0;

-- check: empty_staging | fail | A query has no rows at all after loading.
SELECT q.query_id
FROM (SELECT 'wheat_idn_imports' AS query_id UNION ALL SELECT 'wheat_idn_exports'
      UNION ALL SELECT 'wheat_aus_exports_to_idn' UNION ALL SELECT 'coal_aus_exports'
      UNION ALL SELECT 'coal_idn_exports' UNION ALL SELECT 'coal_chn_imports') q
LEFT JOIN (SELECT DISTINCT query_id FROM stg_trade) s ON s.query_id = q.query_id
WHERE s.query_id IS NULL;

-- check: missing_years | warn | A query has no data for a year that other queries cover. Usually a reporting lag in the latest year.
SELECT q.query_id, y.year
FROM (SELECT DISTINCT query_id FROM stg_trade) q
CROSS JOIN (SELECT DISTINCT year FROM stg_trade) y
LEFT JOIN (SELECT DISTINCT query_id, year FROM stg_trade) s
  ON s.query_id = q.query_id AND s.year = y.year
WHERE s.query_id IS NULL
ORDER BY q.query_id, y.year;

-- check: missing_weight | warn | Rows with a trade value but no weight. They count towards value, not towards tonnes or shares.
SELECT query_id, year, COUNT(*) AS rows_without_weight, SUM(value_usd) AS value_usd
FROM stg_trade
WHERE value_usd > 0 AND net_kg IS NULL AND partner_code <> 0
GROUP BY query_id, year;

-- check: world_total_differs | warn | The partner rows add up to a figure more than 5% away from the World total.
SELECT t.query_id, t.year, t.product, t.total_kg, t.partners_kg
FROM int_totals t
WHERE t.partners_kg IS NOT NULL AND t.total_kg > 0
  AND (t.partners_kg - t.total_kg) * 1.0 / t.total_kg NOT BETWEEN -0.05 AND 0.05
  AND t.query_id IN ('wheat_idn_imports', 'wheat_idn_exports', 'coal_aus_exports', 'coal_idn_exports');

-- check: shares_do_not_sum | fail | Supplier shares for a year do not add up to 100%.
SELECT year, SUM(share) AS share_sum
FROM mart_wheat_suppliers
GROUP BY year
HAVING SUM(share) NOT BETWEEN 0.999 AND 1.001;
