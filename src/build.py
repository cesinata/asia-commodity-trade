"""Build the analysis tables from data/raw/, run the data checks, and write the outputs.

Usage:
    python src/build.py

Outputs:
    data/trade.duckdb          local database (not committed)
    data/marts/*.csv           small aggregated tables, for Tableau and for review
    docs/data/wheat.json       what the wheat dashboard reads
    docs/data/coal.json        what the coal dashboard reads
"""
import csv
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "sql"

# Table name -> columns to sort by, per story.
TABLES = {
    "wheat": {
        "mart_wheat_imports_year": "year",
        "mart_wheat_suppliers": "year, rank_in_year",
        "mart_wheat_concentration": "year",
        "mart_wheat_product_exports": "hs, year",
        "mart_wheat_product_destinations": "hs, year, rank_in_year",
        "mart_wheat_mirror": "year",
    },
    "coal": {
        "mart_coal_exports_year": "reporter, year",
        "mart_coal_buyers": "reporter, year, rank_in_year",
        "mart_coal_mirror": "exporter, year",
    },
}


def strip_comments(sql):
    return "\n".join(re.sub(r"--.*$", "", line) for line in sql.splitlines())


def run_script(con, sql):
    for statement in strip_comments(sql).split(";"):
        if statement.strip():
            con.execute(statement)


def query(con, sql):
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return cols, cur.fetchall()


def run_checks(con, text):
    """Return (failures, warnings). Each item is (name, meaning, columns, rows)."""
    failures, warnings = [], []
    for block in re.split(r"^-- check:", text, flags=re.M)[1:]:
        header, _, body = block.partition("\n")
        name, level, meaning = [part.strip() for part in header.split("|", 2)]
        cols, rows = query(con, strip_comments(body).strip().rstrip(";"))
        if rows:
            (failures if level == "fail" else warnings).append((name, meaning, cols, rows))
    return failures, warnings


def print_findings(title, findings):
    for name, meaning, cols, rows in findings:
        print(f"\n{title}: {name} ({len(rows)} rows)\n  {meaning}")
        print("  " + " | ".join(cols))
        for row in rows[:12]:
            print("  " + " | ".join("" if v is None else str(v) for v in row))
        if len(rows) > 12:
            print(f"  ... and {len(rows) - 12} more")


def clean(value):
    return round(value, 6) if isinstance(value, float) else value


def export(con, marts_dir, docs_data_dir, fetched_at=None):
    marts_dir.mkdir(parents=True, exist_ok=True)
    docs_data_dir.mkdir(parents=True, exist_ok=True)
    for story, tables in TABLES.items():
        out = {}
        for table, order in tables.items():
            cols, rows = query(con, f"SELECT * FROM {table} ORDER BY {order}")
            with open(marts_dir / f"{table}.csv", "w", newline="") as fh:
                writer = csv.writer(fh)
                writer.writerow(cols)
                writer.writerows([list(map(clean, row)) for row in rows])
            out[table] = [dict(zip(cols, map(clean, row))) for row in rows]
        if story == "wheat":
            _, r = query(con, "SELECT MIN(year), MAX(year) FROM mart_wheat_imports_year WHERE million_tonnes IS NOT NULL")
        else:
            # The latest year both exporters have reported.
            _, r = query(con, """SELECT MIN(first_year), MIN(last_year) FROM (
                                   SELECT reporter, MIN(year) AS first_year, MAX(year) AS last_year
                                   FROM mart_coal_exports_year WHERE million_tonnes IS NOT NULL
                                   GROUP BY reporter) AS per_reporter""")
        first_year, latest_year = r[0]
        meta = {
            "story": story,
            "source": "UN Comtrade, United Nations Statistics Division",
            "data_retrieved": fetched_at,
            "page_built": date.today().isoformat(),
            "first_year": first_year,
            "latest_year": latest_year,
        }
        (docs_data_dir / f"{story}.json").write_text(json.dumps({"meta": meta, "tables": out}, indent=1))
        print(f"wrote {story}: {sum(len(v) for v in out.values())} rows, {first_year} to {latest_year}")


def main():
    import duckdb
    raw = ROOT / "data" / "raw"
    if not list(raw.glob("*.csv")):
        sys.exit("No files in data/raw/. Run: python src/fetch.py --story all")
    con = duckdb.connect(str(ROOT / "data" / "trade.duckdb"))
    try:
        run_script(con, (SQL / "01_staging.sql").read_text().replace("{RAW_GLOB}", (raw / "*.csv").as_posix()))
    except Exception as err:
        sys.exit(f"Loading data/raw/ failed: {err}\n"
                 "If a column name is missing, compare the raw file's header with sql/01_staging.sql.")
    _, n = query(con, "SELECT COUNT(*) FROM stg_trade")
    print(f"stg_trade: {n[0][0]} rows")
    run_script(con, (SQL / "02_marts.sql").read_text())
    failures, warnings = run_checks(con, (SQL / "03_checks.sql").read_text())
    print_findings("WARNING", warnings)
    print_findings("FAILED", failures)
    if failures:
        sys.exit("\nBuild stopped: fix the failed checks above. Nothing was exported.")
    manifest = raw / "_manifest.json"
    fetched = None
    if manifest.exists():
        fetched = max(v["fetched_at"] for v in json.loads(manifest.read_text()).values())[:10]
    export(con, ROOT / "data" / "marts", ROOT / "docs" / "data", fetched)
    print(f"\nBuild finished with {len(warnings)} warning(s).")


if __name__ == "__main__":
    main()
