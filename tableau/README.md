# Tableau Public guide

Build one workbook per story from the CSV files in `data/marts/`. The SQL has already
calculated shares and differences, so Tableau is used for layout and interaction.

## Before you start
1. Run the pipeline so `data/marts/` holds real data.
2. Install Tableau Public (free, Mac app) from public.tableau.com and create a profile.

## Connect
1. Connect > Text file > choose a CSV. Add each other CSV as its own data source.
2. Set `year` to a discrete dimension. Set `partner` (three-letter code) to the
   geographic role Country/Region if you want a map.
3. Rename fields to plain words, for example "Million tonnes" and "Share".

## Wheat workbook
| Sheet | Data source | Build |
|---|---|---|
| Key figures | `mart_wheat_imports_year`, `mart_wheat_concentration` | Text tiles filtered to the latest year |
| Import volume | `mart_wheat_imports_year` | Bars: year by million tonnes |
| Supplier shares | `mart_wheat_suppliers` | Horizontal bars for one year, sorted by share, top 6 |
| Australia and United States | `mart_wheat_suppliers` | Lines: year by share, filtered to AUS and USA |
| Product exports | `mart_wheat_product_exports` | Bars: year by value, one sheet per product |
| Reported trade | `mart_wheat_mirror` | Table; colour the difference when above 10% |

## Coal workbook
| Sheet | Data source | Build |
|---|---|---|
| Key figures | `mart_coal_exports_year` | Text tiles for the latest year |
| Export volume | `mart_coal_exports_year` | Lines: year by million tonnes, colour by reporter |
| Average export value | `mart_coal_exports_year` | Lines: year by US$ per tonne, colour by reporter |
| Destinations | `mart_coal_buyers` | Horizontal bars for one year, one sheet per exporter |
| Share to China | `mart_coal_buyers` | Lines: filter partner = CHN, year by share |
| Reported trade | `mart_coal_mirror` | Table; colour the difference when above 10% |

## Calculated fields worth knowing
```text
Year-on-year change   (SUM([Million Tonnes]) - LOOKUP(SUM([Million Tonnes]), -1)) / ABS(LOOKUP(SUM([Million Tonnes]), -1))
Share (check)         SUM([Million Tonnes]) / TOTAL(SUM([Million Tonnes]))
Needs review          ABS([Difference Share]) > 0.1
```
"Share (check)" should match the `share` column from SQL when all partners are shown.

## Dashboard
- Size: fixed, 1200 px wide. White background. Add a Phone layout.
- Colours: Australia `#2B50AA`; United States `#EE5A3B`; Indonesia `#C27F0A`; other `#7C8299`.
- Same titles as the web pages: the headline states the finding; the subtitle says what,
  where, when and the unit.
- One Year filter that applies to every sheet using that data source.

## Publish
1. File > Save to Tableau Public As.
2. On your profile, add the description "Source: UN Comtrade. Aggregated tables only." and
   switch off "Allow others to download".
3. Paste the link into the README.
