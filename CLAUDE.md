# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Local development

Serve with any static file server from the project root. The tool is deployed as a subdirectory of the KashVector site, so `../` paths (logo, icons, `kv-theme.js`) won't resolve unless served from `C:\Projects\StockAnalysis\www\`:

```powershell
npx --yes http-server "C:\Projects\StockAnalysis\www" -p 8001 -c-1
# Tool at http://localhost:8001/budget-impact/
```

After changes, sync to the deploy target before testing:
```powershell
Copy-Item -Recurse -Force "C:\Projects\2026-2027 Budget Impact\*" "C:\Projects\StockAnalysis\www\budget-impact\" -Exclude ".git",".claude","CLAUDE.md"
```

Deploy by pushing `C:\Projects\StockAnalysis` (Cloudflare Pages watches that repo):
```powershell
Set-Location "C:\Projects\StockAnalysis"
git add www/budget-impact/ www/budget-impact-icon.svg www/index.html www/sitemap.xml
git commit -m "..."
git push
```

## Architecture

**Strict separation:** `calc/*.js` are pure functions with zero DOM access. `app.js` owns all DOM reads, writes, and Chart.js rendering. `utils.js` has shared formatting helpers.

```
calc/tax.js       — marginalRate2627(), marginalRate2425(), effectiveTax*()
calc/cgt.js       — calcCgtOld(), calcCgtNew(), calcCgtSplit(), cgtByYear(), findBreakevenYear()
calc/property.js  — calcNegGearing(), calcPropertyProjection()
utils.js          — parseMoney(), formatMoneyInput(), formatMoney()
app.js            — all DOM, events, chart rendering, localStorage
```

Scripts are loaded in that order at the end of `<body>`. `cgt.js` exports `TRANSITION_YEAR = 2027.5` (1 July 2027 as decimal year) as a global that `app.js` references directly.

## Key business logic

**Three CGT scenarios for ETFs/shares:**
- `calcCgtNew` — post-budget assets (acquired after 12 May 2026): indexation + 30% minimum rate for the full holding period
- `calcCgtOld` — pre-budget assets sold before 1 July 2027: 50% discount on entire gain
- `calcCgtSplit` — pre-budget assets sold after 1 July 2027: gains split at the transition date. Pre-transition portion uses 50% discount; post-transition portion uses indexation from the transition-date value. Uses `toDecimalYear(year, month)` for month-precise `yearsToTransition`.

**Property negative gearing:** `restricted=true` (established IP post-12-May-2026) quarantines losses — `taxSavingNew = 0`. New builds and grandfathered properties keep full deductions. `property.js` inlines its own `_cgtOld`/`_cgtNew` helpers rather than importing from `cgt.js`.

**Grandfathered property in `app.js`:** When `propType === 'grandfathered'`, `cgtNewDisplay = proj.cgtOld` (CGT stays on old 50% discount rules forever) and `cgtImpact = 0`.

## Marginal rates (2026-27, including 2% Medicare levy)

| Income | Rate |
|--------|------|
| ≤ $18,200 | 0% |
| ≤ $45,000 | 17% |
| ≤ $135,000 | 32% |
| ≤ $190,000 | 39% |
| > $190,000 | 47% |

## Deployment context

- **Source:** `C:\Projects\2026-2027 Budget Impact\` → GitHub: `github.com/kanurag4/budget-impact-calculator`
- **Deploy target:** `C:\Projects\StockAnalysis\www\budget-impact\` → `github.com/kanurag4/stock-evaluator` → Cloudflare Pages → `kashvector.com/budget-impact/`
- **Icon:** lives at `www/budget-impact-icon.svg` (i.e. `../budget-impact-icon.svg` relative to the tool)
- **Shared assets** (`kv-theme.js`, `logo.svg`, `style` vars) come from the KashVector root — they are not in this repo
