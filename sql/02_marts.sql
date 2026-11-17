-- 02_marts.sql: the small tables the dashboards and Tableau read.
-- Written in plain SQL that runs on DuckDB (and on SQLite, used by the smoke test).
-- Partner code 0 is "World", the reporter's own total. It is never added to
-- the country rows.

-- ---------- shared building blocks ----------

DROP TABLE IF EXISTS int_flows;
CREATE TABLE int_flows AS
SELECT
    query_id, reporter, flow, year,
    CASE WHEN hs IN ('2701', '2702') THEN 'coal' ELSE hs END AS product,
    partner_code, partner, partner_name,
    -- Coal adds HS 2701 and 2702. If the World row of either code has no weight,
    -- the World weight is left empty (not a part-sum), so int_totals falls back
    -- to the partner rows instead of reporting lignite alone as the total.
    CASE WHEN partner_code = 0 AND COUNT(net_kg) < COUNT(*) THEN NULL
         ELSE SUM(net_kg) END                                  AS net_kg,
    SUM(value_usd)                                             AS value_usd,
    -- Value of the rows that do have a weight, for US dollars per tonne.
    SUM(CASE WHEN net_kg IS NOT NULL THEN value_usd END)       AS value_with_kg_usd
FROM stg_trade
GROUP BY query_id, reporter, flow, year,
         CASE WHEN hs IN ('2701', '2702') THEN 'coal' ELSE hs END,
         partner_code, partner, partner_name;

-- Totals per reporter, product and year. The World row is used when present;
-- otherwise the sum of the partner rows.
DROP TABLE IF EXISTS int_totals_base;
CREATE TABLE int_totals_base AS
SELECT
    query_id, reporter, flow, year, product,
    MAX(CASE WHEN partner_code = 0 THEN net_kg END)                AS world_kg,
    MAX(CASE WHEN partner_code = 0 THEN value_usd END)             AS world_usd,
    SUM(CASE WHEN partner_code <> 0 THEN net_kg END)               AS partners_kg,
    SUM(CASE WHEN partner_code <> 0 THEN value_usd END)            AS partners_usd,
    SUM(CASE WHEN partner_code <> 0 THEN value_with_kg_usd END)    AS partners_usd_with_kg
FROM int_flows
GROUP BY query_id, reporter, flow, year, product;

DROP TABLE IF EXISTS int_totals;
CREATE TABLE int_totals AS
SELECT
    query_id, reporter, flow, year, product,
    COALESCE(world_kg, partners_kg)                                AS total_kg,
    COALESCE(world_usd, partners_usd)                              AS total_usd,
    partners_kg,
    -- US dollars per tonne from matching value and weight: the World row when it
    -- has a weight, otherwise only the partner rows that have a weight.
    CASE WHEN world_kg IS NOT NULL THEN world_usd / NULLIF(world_kg / 1000.0, 0)
         ELSE partners_usd_with_kg / NULLIF(partners_kg / 1000.0, 0) END AS usd_per_tonne,
    -- When the World row has no weight, tonnes are the partner sum and miss any
    -- partner row without a weight. This is the share of value in such rows
    -- (0 when the World weight is used). The gap is reported, never filled.
    CASE WHEN world_kg IS NOT NULL THEN 0.0
         ELSE (partners_usd - COALESCE(partners_usd_with_kg, 0)) * 1.0 / NULLIF(partners_usd, 0)
    END                                                            AS value_share_without_weight,
    -- 1 when more than 1% of the value has no weight. Tonnes and shares for that
    -- year are then shown as not available rather than as an understated figure.
    CASE WHEN world_kg IS NULL
          AND (partners_usd - COALESCE(partners_usd_with_kg, 0)) > 0.01 * partners_usd
         THEN 1 ELSE 0 END                                         AS weight_incomplete
FROM int_totals_base;

-- ---------- story 1: wheat ----------

DROP TABLE IF EXISTS mart_wheat_imports_year;
CREATE TABLE mart_wheat_imports_year AS
SELECT
    year,
    CASE WHEN weight_incomplete = 1 THEN NULL ELSE total_kg / 1e9 END AS million_tonnes,
    total_usd / 1e6                               AS value_usd_million,
    usd_per_tonne,
    value_share_without_weight
FROM int_totals
WHERE query_id = 'wheat_idn_imports' AND product = '1001';

-- Share = a country's tonnes divided by the sum of all country rows that year.
DROP TABLE IF EXISTS mart_wheat_suppliers;
CREATE TABLE mart_wheat_suppliers AS
SELECT
    f.year, f.partner, f.partner_name,
    f.net_kg / 1e9                                              AS million_tonnes,
    CASE WHEN t.weight_incomplete = 1 THEN NULL
         ELSE f.net_kg * 1.0 / t.partners_kg END                AS share,
    ROW_NUMBER() OVER (PARTITION BY f.year ORDER BY f.net_kg DESC, f.partner) AS rank_in_year,
    f.value_with_kg_usd / NULLIF(f.net_kg / 1000.0, 0)          AS usd_per_tonne
FROM int_flows f
JOIN int_totals t
  ON t.query_id = f.query_id AND t.year = f.year AND t.product = f.product
WHERE f.query_id = 'wheat_idn_imports' AND f.product = '1001'
  AND f.partner_code <> 0 AND f.net_kg > 0 AND t.partners_kg > 0;

-- Concentration: share of the three largest suppliers, and the Herfindahl index
-- (sum of squared shares x 10,000; above 2,500 is usually called concentrated).
DROP TABLE IF EXISTS mart_wheat_concentration;
CREATE TABLE mart_wheat_concentration AS
SELECT
    year,
    COUNT(*)                                               AS supplier_count,
    -- Not available when the year's shares are not available.
    CASE WHEN COUNT(share) < COUNT(*) THEN NULL
         ELSE SUM(CASE WHEN rank_in_year <= 3 THEN share ELSE 0 END) END AS top3_share,
    CASE WHEN COUNT(share) < COUNT(*) THEN NULL
         ELSE SUM(share * share) * 10000 END                AS herfindahl_index
FROM mart_wheat_suppliers
GROUP BY year;

DROP TABLE IF EXISTS mart_wheat_product_exports;
CREATE TABLE mart_wheat_product_exports AS
SELECT
    year, product AS hs,
    CASE product WHEN '1101' THEN 'Wheat flour'
                 WHEN '190230' THEN 'Noodles and other prepared pasta' END AS product_name,
    total_usd / 1e6   AS value_usd_million,
    total_kg / 1e6    AS thousand_tonnes
FROM int_totals
WHERE query_id = 'wheat_idn_exports' AND product IN ('1101', '190230');

DROP TABLE IF EXISTS mart_wheat_product_destinations;
CREATE TABLE mart_wheat_product_destinations AS
SELECT
    f.year, f.product AS hs, f.partner, f.partner_name,
    f.value_usd / 1e6                 AS value_usd_million,
    f.value_usd * 1.0 / t.total_usd   AS share_of_value,
    ROW_NUMBER() OVER (PARTITION BY f.year, f.product ORDER BY f.value_usd DESC, f.partner) AS rank_in_year
FROM int_flows f
JOIN int_totals t
  ON t.query_id = f.query_id AND t.year = f.year AND t.product = f.product
WHERE f.query_id = 'wheat_idn_exports' AND f.partner_code <> 0
  AND f.value_usd > 0 AND t.total_usd > 0;

-- Comparison of reported trade, in tonnes (not dollars: importers record value
-- including freight and insurance, exporters without, so dollar gaps are expected).
DROP TABLE IF EXISTS mart_wheat_mirror;
-- Every year that either side recorded. A year recorded by one side only is kept,
-- with the other side and the difference left empty, so it is not hidden.
CREATE TABLE mart_wheat_mirror AS
WITH i AS (SELECT year, net_kg FROM int_flows
           WHERE query_id = 'wheat_idn_imports' AND product = '1001' AND partner = 'AUS'),
     e AS (SELECT year, net_kg FROM int_flows
           WHERE query_id = 'wheat_aus_exports_to_idn' AND product = '1001' AND partner = 'IDN'),
     k AS (SELECT year FROM i UNION SELECT year FROM e)
SELECT
    k.year,
    i.net_kg / 1000.0                                 AS indonesia_reported_tonnes,
    e.net_kg / 1000.0                                 AS australia_reported_tonnes,
    (i.net_kg - e.net_kg) * 1.0 / NULLIF(e.net_kg, 0) AS difference_share
FROM k
LEFT JOIN i ON i.year = k.year
LEFT JOIN e ON e.year = k.year;

-- ---------- story 2: coal (HS 2701 coal + HS 2702 lignite) ----------

DROP TABLE IF EXISTS mart_coal_exports_year;
CREATE TABLE mart_coal_exports_year AS
SELECT
    reporter, year,
    CASE WHEN weight_incomplete = 1 THEN NULL ELSE total_kg / 1e9 END AS million_tonnes,
    total_usd / 1e9                            AS value_usd_billion,
    usd_per_tonne,
    value_share_without_weight
FROM int_totals
WHERE query_id IN ('coal_aus_exports', 'coal_idn_exports') AND product = 'coal';

DROP TABLE IF EXISTS mart_coal_buyers;
CREATE TABLE mart_coal_buyers AS
SELECT
    f.reporter, f.year, f.partner, f.partner_name,
    f.net_kg / 1e9                     AS million_tonnes,
    CASE WHEN t.weight_incomplete = 1 THEN NULL
         ELSE f.net_kg * 1.0 / t.partners_kg END AS share,
    ROW_NUMBER() OVER (PARTITION BY f.reporter, f.year ORDER BY f.net_kg DESC, f.partner) AS rank_in_year,
    f.value_with_kg_usd / NULLIF(f.net_kg / 1000.0, 0) AS usd_per_tonne
FROM int_flows f
JOIN int_totals t
  ON t.query_id = f.query_id AND t.year = f.year AND t.product = f.product
WHERE f.query_id IN ('coal_aus_exports', 'coal_idn_exports') AND f.product = 'coal'
  AND f.partner_code <> 0 AND f.net_kg > 0 AND t.partners_kg > 0;

DROP TABLE IF EXISTS mart_coal_mirror;
-- As for wheat: a year recorded by only one side is kept, not dropped.
CREATE TABLE mart_coal_mirror AS
WITH e AS (SELECT reporter AS exporter, year, net_kg FROM int_flows
           WHERE query_id IN ('coal_aus_exports', 'coal_idn_exports') AND product = 'coal' AND partner = 'CHN'),
     c AS (SELECT partner AS exporter, year, net_kg FROM int_flows
           WHERE query_id = 'coal_chn_imports' AND product = 'coal' AND partner IN ('AUS', 'IDN')),
     k AS (SELECT exporter, year FROM e UNION SELECT exporter, year FROM c)
SELECT
    k.exporter,
    k.year,
    e.net_kg / 1000.0                                 AS exporter_reported_tonnes,
    c.net_kg / 1000.0                                 AS china_reported_tonnes,
    (c.net_kg - e.net_kg) * 1.0 / NULLIF(e.net_kg, 0) AS difference_share
FROM k
LEFT JOIN e ON e.exporter = k.exporter AND e.year = k.year
LEFT JOIN c ON c.exporter = k.exporter AND c.year = k.year;
