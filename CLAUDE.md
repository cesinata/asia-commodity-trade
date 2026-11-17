# Project rules for AI assistants

This is a public portfolio repository. Read this file before doing anything.

## What this project is
Two dashboards built from UN Comtrade data: Indonesia's wheat trade, and coal exports
from Australia and Indonesia. Pipeline: `src/fetch.py` (download) -> `sql/` run by
`src/build.py` (DuckDB) -> `data/marts/*.csv` and `docs/data/*.json` -> web pages in `docs/`.

## Rules that are never broken
1. **Secrets.** Never open, print, copy or commit `.env`. Do not run `cat .env`, `echo $COMTRADE_KEY`
   or anything that would show the key. The scripts load it themselves.
2. **Raw data stays local.** Nothing in `data/raw/` and no `.duckdb` file is ever committed.
   UN Comtrade does not allow raw data to be re-shared; aggregated tables are fine.
3. **No invented numbers.** Every figure in the README, the pages and any summary must come from
   `data/marts/` or `docs/data/` after a real build. The smoke test uses simulated data: never
   publish or quote it.
4. **Describe, do not explain.** The data shows what changed, not why. Do not write causes,
   forecasts or advice unless a cited source says so.
5. **The owner commits.** Do not run `git add`, `git commit` or `git push`. At the end of each
   stage, print the exact commands for the owner to run and wait.
6. **Privacy.** Do not add names of other people, employers, scholarships or private details.

## Method (do not change without asking)
- Calendar years, annual data, one source (UN Comtrade).
- Volume in tonnes; value in current US dollars, not adjusted for inflation.
- Shares = a partner's tonnes / the sum of all partner rows that year. The "World" row
  (partner code 0) is a check total and is never added to partner rows.
- Reported-trade comparisons use tonnes, because importers record value with freight and
  insurance and exporters without.
- HS 1001 wheat, 1101 wheat flour, 190230 noodles and other prepared pasta, 2701 + 2702 coal and lignite.
- The latest year can be incomplete. Say so; do not fill gaps.

## Wording on the pages
Formal and plain, in the style of a national statistics office. Chart headline states the
finding in about ten words; the subtitle says what, where, when and the unit. Australian
spelling. No abbreviations such as "Mt". No marketing words.

## Checks before a stage is called done
- `python tests/smoke_test.py` passes.
- `python src/build.py` finishes with no failed checks; warnings are read and explained.
- `git status` shows no `.env`, nothing under `data/raw/`, no `.duckdb`.
