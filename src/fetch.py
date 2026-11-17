"""Download UN Comtrade data for both stories into data/raw/ (one CSV per query and year).

Usage:
    python src/fetch.py --preview            # no key needed: one small test call
    python src/fetch.py --story wheat        # needs COMTRADE_KEY in .env
    python src/fetch.py --story all --refresh

The key is read from .env and is never printed or written to any file.
"""
import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
MANIFEST = RAW / "_manifest.json"
PAUSE_SECONDS = 1.5


def load_key():
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    key = os.environ.get("COMTRADE_KEY", "").strip()
    if not key or key.startswith("paste"):
        sys.exit("No key found. Put COMTRADE_KEY=<your primary key> in the .env file in the repo's top folder.")
    return key


def call(api, key, q, year):
    common = dict(typeCode="C", freqCode="A", clCode="HS", period=str(year), reporterCode=q["reporter"],
                  cmdCode=q["hs"], flowCode=q["flow"], partnerCode=q.get("partner"), partner2Code=None,
                  customsCode=None, motCode=None, format_output="JSON", aggregateBy=None,
                  breakdownMode="classic", countOnly=None, includeDesc=True)
    if key is None:
        return api.previewFinalData(maxRecords=500, **common)
    return api.getFinalData(key, maxRecords=100000, **common)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--story", choices=["wheat", "coal", "all"], default="all")
    ap.add_argument("--first-year", type=int)
    ap.add_argument("--last-year", type=int, default=date.today().year - 1)
    ap.add_argument("--refresh", action="store_true", help="download again even if the file exists")
    ap.add_argument("--preview", action="store_true", help="one test call without a key, nothing saved")
    args = ap.parse_args()

    import comtradeapicall as api
    cfg = json.loads((ROOT / "config" / "queries.json").read_text())
    queries = [q for q in cfg["queries"] if args.story in ("all", q["story"])]

    if args.preview:
        q = queries[0]
        df = call(api, None, q, args.last_year - 1)
        if df is None or len(df) == 0:
            sys.exit("Preview returned no rows. Check your internet connection and try an earlier year.")
        print(f"Preview OK: {len(df)} rows for {q['id']} {args.last_year - 1}")
        print("Columns:", ", ".join(df.columns))
        return

    key = load_key()
    RAW.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    first = args.first_year or cfg["first_year"]
    for q in queries:
        for year in range(first, args.last_year + 1):
            out = RAW / f"{q['id']}_{year}.csv"
            name = f"{q['id']}_{year}"
            if out.exists() and not args.refresh:
                print(f"skip  {name} (already downloaded)")
                continue
            df = None
            for attempt in range(3):
                try:
                    df = call(api, key, q, year)
                    break
                except Exception as err:  # network errors: wait and retry
                    print(f"retry {name}: {type(err).__name__}")
                    time.sleep(10)
            rows = 0 if df is None else len(df)
            if rows:
                df.insert(0, "query_id", q["id"])
                df.to_csv(out, index=False)
            if rows >= 100000:
                print(f"WARNING {name}: hit the 100,000 row limit, the file may be cut off")
            manifest[name] = {"rows": rows, "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            print(f"saved {name}: {rows} rows")
            MANIFEST.write_text(json.dumps(manifest, indent=1))
            time.sleep(PAUSE_SECONDS)
    empty = sorted(k for k, v in manifest.items() if v["rows"] == 0)
    if empty:
        print("\nNo rows returned for:", ", ".join(empty))
        print("An empty recent year is normal (countries report late). An empty older year needs a look.")


if __name__ == "__main__":
    main()
