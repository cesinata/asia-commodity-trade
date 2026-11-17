"""Smoke test for the SQL in sql/02_marts.sql and sql/03_checks.sql.

It uses SIMULATED numbers (made up, clearly not real trade data) in an
in-memory SQLite database, so it runs without DuckDB, a key, or the internet.
It checks the logic only. It does not test sql/01_staging.sql.

Usage:
    python tests/smoke_test.py            # run the checks
    python tests/smoke_test.py <folder>   # also write the simulated outputs into <folder>
"""
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
import build  # noqa: E402

YEARS = range(2015, 2025)


def simulated_rows():
    rows = []

    def add(qid, reporter, flow, year, pcode, piso, pname, hs, usd, kg):
        rows.append((qid, year, reporter, reporter, flow, pcode, piso, pname, hs, usd, kg))

    def with_world(qid, reporter, flow, year, hs, partners, price):
        total = 0
        for i, (code, iso, name, base) in enumerate(partners):
            kg = base * 1e9 * (1 + 0.04 * ((year + i * 3) % 5) - 0.02 * i * (year - 2015) / 9)
            total += kg
            add(qid, reporter, flow, year, code, iso, name, hs, kg / 1000 * price, kg)
        add(qid, reporter, flow, year, 0, "W00", "World", hs, total / 1000 * price, total)

    wheat = [(36, "AUS", "Australia", 3.6), (124, "CAN", "Canada", 2.2), (32, "ARG", "Argentina", 1.6),
             (842, "USA", "USA", 1.0), (804, "UKR", "Ukraine", 1.3), (643, "RUS", "Russian Federation", 0.6),
             (76, "BRA", "Brazil", 0.3), (100, "BGR", "Bulgaria", 0.2)]
    flour = [(598, "PNG", "Papua New Guinea", 0.03), (626, "TLS", "Timor-Leste", 0.02), (608, "PHL", "Philippines", 0.01)]
    noodles = [(458, "MYS", "Malaysia", 0.05), (36, "AUS", "Australia", 0.03), (682, "SAU", "Saudi Arabia", 0.03)]
    aus_coal = [(392, "JPN", "Japan", 110), (156, "CHN", "China", 80), (699, "IND", "India", 60),
                (410, "KOR", "Rep. of Korea", 55), (490, "S19", "Other Asia, nes", 40), (704, "VNM", "Viet Nam", 15)]
    idn_coal = [(156, "CHN", "China", 190), (699, "IND", "India", 110), (608, "PHL", "Philippines", 35),
                (392, "JPN", "Japan", 28), (410, "KOR", "Rep. of Korea", 26), (458, "MYS", "Malaysia", 25)]
    for y in YEARS:
        with_world("wheat_idn_imports", "IDN", "M", y, "1001", wheat, 280 + 8 * (y - 2015))
        with_world("wheat_idn_exports", "IDN", "X", y, "1101", flour, 450)
        with_world("wheat_idn_exports", "IDN", "X", y, "190230", noodles, 1600)
        with_world("coal_aus_exports", "AUS", "X", y, "2701", aus_coal, 150 + 10 * (y % 4))
        with_world("coal_idn_exports", "IDN", "X", y, "2701", [(c, i, n, b * 0.9) for c, i, n, b in idn_coal], 60 + 5 * (y % 3))
        with_world("coal_idn_exports", "IDN", "X", y, "2702", [(c, i, n, b * 0.1) for c, i, n, b in idn_coal], 35)
    # Mirror flows: the partner's own record, a few per cent away from the reporter's.
    by_key = {(r[0], r[1], r[6], r[8]): r for r in rows}
    for y in YEARS:
        kg = by_key[("wheat_idn_imports", y, "AUS", "1001")][10] * 0.96
        add("wheat_aus_exports_to_idn", "AUS", "X", y, 360, "IDN", "Indonesia", "1001", kg * 0.27, kg)
        kg = by_key[("coal_aus_exports", y, "CHN", "2701")][10] * 1.03
        add("coal_chn_imports", "CHN", "M", y, 36, "AUS", "Australia", "2701", kg * 0.17, kg)
        kg = (by_key[("coal_idn_exports", y, "CHN", "2701")][10] + by_key[("coal_idn_exports", y, "CHN", "2702")][10]) * 1.14
        add("coal_chn_imports", "CHN", "M", y, 360, "IDN", "Indonesia", "2701", kg * 0.07, kg)
    return rows


def main():
    con = sqlite3.connect(":memory:")
    con.execute("""CREATE TABLE stg_trade (query_id TEXT, year INTEGER, reporter TEXT, reporter_name TEXT, flow TEXT,
                   partner_code INTEGER, partner TEXT, partner_name TEXT, hs TEXT, value_usd REAL, net_kg REAL)""")
    con.executemany("INSERT INTO stg_trade VALUES (?,?,?,?,?,?,?,?,?,?,?)", simulated_rows())
    build.run_script(con, (ROOT / "sql" / "02_marts.sql").read_text())
    failures, warnings = build.run_checks(con, (ROOT / "sql" / "03_checks.sql").read_text())
    build.print_findings("WARNING", warnings)
    build.print_findings("FAILED", failures)
    assert not failures, "a fail-level check found rows in clean simulated data"

    _, r = build.query(con, "SELECT COUNT(*), MIN(share), MAX(share) FROM mart_wheat_suppliers")
    assert r[0][0] == 8 * len(YEARS) and 0 < r[0][1] < r[0][2] < 1, r
    _, r = build.query(con, "SELECT MIN(difference_share), MAX(difference_share) FROM mart_wheat_mirror")
    assert abs(r[0][0] - (1 / 0.96 - 1)) < 1e-9 and abs(r[0][1] - (1 / 0.96 - 1)) < 1e-9, r
    _, r = build.query(con, "SELECT exporter, ROUND(MIN(difference_share), 4) FROM mart_coal_mirror GROUP BY exporter ORDER BY exporter")
    assert r == [("AUS", 0.03), ("IDN", 0.14)], r
    _, r = build.query(con, "SELECT COUNT(*) FROM mart_coal_exports_year")
    assert r[0][0] == 2 * len(YEARS), r

    # A duplicated row must trip the duplicate check.
    con.execute("INSERT INTO stg_trade SELECT * FROM stg_trade WHERE query_id = 'wheat_idn_imports' AND year = 2020 AND partner = 'AUS'")
    failures, _ = build.run_checks(con, (ROOT / "sql" / "03_checks.sql").read_text())
    assert any(name == "duplicate_keys" for name, *_ in failures), "duplicate check did not fire"
    con.execute("DELETE FROM stg_trade WHERE rowid = (SELECT MAX(rowid) FROM stg_trade)")

    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    build.export(con, target / "marts", target / "data", fetched_at="SIMULATED")
    print("\nSmoke test passed (simulated data).")


if __name__ == "__main__":
    main()
