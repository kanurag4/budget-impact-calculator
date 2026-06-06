# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Local development

Serve with any static file server from the project root. The tool is deployed as a subdirectory of the KashVector site, so `../` paths (logo, icons, `kv-theme.js`) won't resolve unless served from `C:\Projects\StockAnalysis\www\`:

```powershell
npx --yes http-server "C:\Projects\StockAnalysis\www" -p 8001 -c-1
# Tool at http://localhost:8001/budget-impact/
```

After changes, sync to the deploy target before testing:
```powershell
Copy-Item -Recurse -Force "C:\Projects\2026-2027 Budget Impact\*" "C:\Projects\StockAnalysis\www\budget-impact\" -Exclude ".git",".Codex","AGENTS.md"
```

Deploy by pushing `C:\Projects\StockAnalysis` (Cloudflare Pages watches that repo):
```powershell
Set-Location "C:\Projects\StockAnalysis"
git add www/budget-impact/
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

**Property negative gearing:** `restricted=true` (established IP post-12-May-2026) quarantines losses from year 2 onwards (`effectivelyRestricted = restricted && yr > 1`). Year 1 losses remain deductible — the restriction only takes effect from 1 July 2027. New builds and grandfathered properties keep full deductions. `property.js` inlines its own `_cgtOld`/`_cgtNew`/`_cgtNewWithCF` helpers rather than importing from `cgt.js`.

**Carry-forward losses (restricted properties):** Quarantined losses accumulate in `carryForward`. Each year the property turns cash-flow positive, carried losses are applied against rental income (`carryApplied * marginalRate` = tax saving). Remaining balance at exit reduces the taxable capital gain via `_cgtNewWithCF(costBase, salePrice, marginalRate, inflationRate, years, carryForward)`. The year-by-year table shows the running `carryForwardBalance`.

**New build CGT — investor's choice:** New build investors can choose between the 50% CGT discount or indexation under the new rules. `app.js` uses `Math.min(proj.cgtOld, proj.cgtNew)` for the impact calculation and shows both options side-by-side in the result cards (with a "Best" badge on the lower value) and as two separate lines in the investment worth chart.

**Grandfathered property in `app.js`:** When `propType === 'grandfathered'`, `cgtNewDisplay = proj.cgtOld` (CGT stays on old 50% discount rules forever) and `cgtImpact = 0`.

**Chart.js layout reflow:** Creating two Chart.js charts synchronously collapses the first chart's canvas. Always wrap the second chart draw in `requestAnimationFrame(() => drawSecondChart(...))`.

**Chart variables:** `etfChart`, `etfWorthChart`, `propChart`, `propWorthChart` — always destroy before recreating.

## Property type classification

| `propType` value | Neg gearing | CGT |
|---|---|---|
| `'grandfathered'` | Full deductions (old rules forever) | 50% discount forever |
| `'newbuild'` | Full deductions (exempt from restriction) | Investor chooses: 50% disc or indexation |
| `'established-new'` | Restricted from 1 July 2027 (yr 2+); losses quarantined + carried forward | Indexation + 30% min; carry-forward reduces gain at exit |

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
- **Reference:** `C:\Projects\Rules\budget26.md` — authoritative rules reference for CGT and negative gearing logic
