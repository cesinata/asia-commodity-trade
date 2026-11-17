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
    SUM(net_kg)    AS net_kg,
    SUM(value_usd) AS value_usd
FROM stg_trade
GROUP BY query_id, reporter, flow, year,
         CASE WHEN hs IN ('2701', '2702') THEN 'coal' ELSE hs END,
         partner_code, partner, partner_name;

-- Totals per reporter, product and year. The World row is used when present;
-- otherwise the sum of the partner rows.
DROP TABLE IF EXISTS int_totals;
CREATE TABLE int_totals AS
SELECT
    query_id, reporter, flow, year, product,
    COALESCE(MAX(CASE WHEN partner_code = 0 THEN net_kg END),
             SUM(CASE WHEN partner_code <> 0 THEN net_kg END))    AS total_kg,
    COALESCE(MAX(CASE WHEN partner_code = 0 THEN value_usd END),
             SUM(CASE WHEN partner_code <> 0 THEN value_usd END)) AS total_usd,
    SUM(CASE WHEN partner_code <> 0 THEN net_kg END)              AS partners_kg
FROM int_flows
GROUP BY query_id, reporter, flow, year, product;

-- ---------- story 1: wheat ----------

DROP TABLE IF EXISTS mart_wheat_imports_year;
CREATE TABLE mart_wheat_imports_year AS
SELECT
    year,
    total_kg / 1e9                                AS million_tonnes,
    total_usd / 1e6                               AS value_usd_million,
    total_usd / NULLIF(total_kg / 1000.0, 0)      AS usd_per_tonne
FROM int_totals
WHERE query_id = 'wheat_idn_imports' AND product = '1001';

-- Share = a country's tonnes divided by the sum of all country rows that year.
DROP TABLE IF EXISTS mart_wheat_suppliers;
CREATE TABLE mart_wheat_suppliers AS
SELECT
    f.year, f.partner, f.partner_name,
    f.net_kg / 1e9                                              AS million_tonnes,
    f.net_kg * 1.0 / t.partners_kg                              AS share,
    ROW_NUMBER() OVER (PARTITION BY f.year ORDER BY f.net_kg DESC) AS rank_in_year,
    f.value_usd / NULLIF(f.net_kg / 1000.0, 0)                  AS usd_per_tonne
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
    SUM(CASE WHEN rank_in_year <= 3 THEN share ELSE 0 END) AS top3_share,
    SUM(share * share) * 10000                             AS herfindahl_index
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
    ROW_NUMBER() OVER (PARTITION BY f.year, f.product ORDER BY f.value_usd DESC) AS rank_in_year
FROM int_flows f
JOIN int_totals t
  ON t.query_id = f.query_id AND t.year = f.year AND t.product = f.product
WHERE f.query_id = 'wheat_idn_exports' AND f.partner_code <> 0
  AND f.value_usd > 0 AND t.total_usd > 0;

-- Comparison of reported trade, in tonnes (not dollars: importers record value
-- including freight and insurance, exporters without, so dollar gaps are expected).
DROP TABLE IF EXISTS mart_wheat_mirror;
CREATE TABLE mart_wheat_mirror AS
SELECT
    i.year,
    i.net_kg / 1000.0                               AS indonesia_reported_tonnes,
    e.net_kg / 1000.0                               AS australia_reported_tonnes,
    (i.net_kg - e.net_kg) * 1.0 / NULLIF(e.net_kg, 0) AS difference_share
FROM int_flows i
JOIN int_flows e ON e.year = i.year
WHERE i.query_id = 'wheat_idn_imports' AND i.product = '1001' AND i.partner = 'AUS'
  AND e.query_id = 'wheat_aus_exports_to_idn' AND e.product = '1001' AND e.partner = 'IDN';

-- ---------- story 2: coal (HS 2701 coal + HS 2702 lignite) ----------

DROP TABLE IF EXISTS mart_coal_exports_year;
CREATE TABLE mart_coal_exports_year AS
SELECT
    reporter, year,
    total_kg / 1e9                             AS million_tonnes,
    total_usd / 1e9                            AS value_usd_billion,
    total_usd / NULLIF(total_kg / 1000.0, 0)   AS usd_per_tonne
FROM int_totals
WHERE query_id IN ('coal_aus_exports', 'coal_idn_exports') AND product = 'coal';

DROP TABLE IF EXISTS mart_coal_buyers;
CREATE TABLE mart_coal_buyers AS
SELECT
    f.reporter, f.year, f.partner, f.partner_name,
    f.net_kg / 1e9                     AS million_tonnes,
    f.net_kg * 1.0 / t.partners_kg     AS share,
    ROW_NUMBER() OVER (PARTITION BY f.reporter, f.year ORDER BY f.net_kg DESC) AS rank_in_year,
    f.value_usd / NULLIF(f.net_kg / 1000.0, 0) AS usd_per_tonne
FROM int_flows f
JOIN int_totals t
  ON t.query_id = f.query_id AND t.year = f.year AND t.product = f.product
WHERE f.query_id IN ('coal_aus_exports', 'coal_idn_exports') AND f.product = 'coal'
  AND f.partner_code <> 0 AND f.net_kg > 0 AND t.partners_kg > 0;

DROP TABLE IF EXISTS mart_coal_mirror;
CREATE TABLE mart_coal_mirror AS
SELECT
    e.reporter                                       AS exporter,
    e.year,
    e.net_kg / 1000.0                                AS exporter_reported_tonnes,
    c.net_kg / 1000.0                                AS china_reported_tonnes,
    (c.net_kg - e.net_kg) * 1.0 / NULLIF(e.net_kg, 0) AS difference_share
FROM int_flows e
JOIN int_flows c ON c.year = e.year AND c.partner = e.reporter
WHERE e.query_id IN ('coal_aus_exports', 'coal_idn_exports') AND e.product = 'coal' AND e.partner = 'CHN'
  AND c.query_id = 'coal_chn_imports' AND c.product = 'coal';
