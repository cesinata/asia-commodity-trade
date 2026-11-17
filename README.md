# Asia commodity trade

Two dashboards on commodity trade involving Australia and Indonesia, built from official
trade statistics published by UN Comtrade.

| Dashboard | Question |
|---|---|
| Indonesia's wheat trade | How much wheat does Indonesia import, from which countries, and how much flour and noodles does it export? |
| Coal exports: Australia and Indonesia | How do the two countries compare on export volume, average export value and destination markets? |

**Status:** set-up stage. No data has been loaded yet, so this README contains no findings.
Live links, a screenshot and findings are added after the first build.

## How it works
```text
UN Comtrade API -> src/fetch.py -> data/raw/ (stays on your computer)
                -> sql/01_staging.sql, 02_marts.sql, 03_checks.sql (DuckDB, run by src/build.py)
                -> data/marts/*.csv (for Tableau) and docs/data/*.json (for the web pages)
                -> docs/ (GitHub Pages)
```

## Run it
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # then paste your free UN Comtrade key into .env
python tests/smoke_test.py    # checks the SQL logic on simulated data
python src/fetch.py --preview # one test call, no key needed
python src/fetch.py --story all
python src/build.py
python3 -m http.server -d docs 8000   # open http://localhost:8000
```
A free key comes from comtradedeveloper.un.org (product "comtrade - v1").

## Method
- **Source and period:** UN Comtrade, annual data, calendar years from 2015.
- **Products:** wheat (HS 1001), wheat flour (HS 1101), noodles and other prepared pasta
  (HS 190230), coal and lignite (HS 2701 and 2702).
- **Measures:** volume in tonnes; value in US dollars at current prices.
- **Shares:** a partner's tonnes divided by the total of all partner rows in that year.
- **Data checks:** duplicate records, negative values, missing years, missing weights, and
  partner rows compared with the reported world total. A failed check stops the build.
- **Comparison of reported trade:** what one country records is compared with what its partner
  records, in tonnes. Differences above 10% are marked for review.

## Limitations
- The most recent year can be incomplete or revised, because countries report late.
- HS 190230 covers instant noodles together with other prepared pasta.
- The coal data does not separate coal for power generation from coal for steelmaking.
- Values are not adjusted for inflation.
- The dashboards describe what changed. They do not explain why.

## Data and licence
Source: UN Comtrade, United Nations Statistics Division. Raw downloads are not included in
this repository. It contains aggregated tables and charts only.

## AI assistance
An AI assistant (Claude) helped write the pipeline code, the SQL and the page layout. I ran
the pipeline, reviewed the checks and am responsible for the results.

## Origin
This project extends an analysis I made for the Satria Data 2021 statistics competition.
