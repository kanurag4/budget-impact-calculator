// Investment property calculations — pure functions, no DOM access.
// CGT formulas are self-contained here (same logic as cgt.js, no cross-dependency).
//
// Negative gearing restriction (from 1 July 2027):
//   - Established IPs purchased after 12 May 2026 ("restricted"):
//     • Year 1: losses still deductible (before 1 July 2027 transition date)
//     • Year 2+: losses quarantined; carried forward to offset future rental income
//   - New builds and pre-12-May-2026 IPs: old rules apply (full deduction against salary).

function _cgtOld(costBase, salePrice, marginalRate) {
  const gain = salePrice - costBase;
  if (gain <= 0) return 0;
  return gain * 0.5 * marginalRate;
}

function _cgtNew(costBase, salePrice, marginalRate, inflationRate, years) {
  const indexedBase = costBase * Math.pow(1 + inflationRate, years);
  const gain = Math.max(salePrice - indexedBase, 0);
  return gain * Math.max(0.30, marginalRate);
}

// Like _cgtNew but reduces the indexed gain by any unused carry-forward losses.
// Carry-forward losses can be applied against the capital gain on exit.
//
// Legislative assumption: quarantined rental losses reduce the *taxable indexed gain*
// dollar-for-dollar before the 30% minimum rate is applied. This matches the stated intent
// that losses offset "capital gains on the property when sold" (Budget measure, May 2026).
// Treat as an estimate until the ATO publishes final determination.
function _cgtNewWithCF(costBase, salePrice, marginalRate, inflationRate, years, carryForward) {
  const indexedBase = costBase * Math.pow(1 + inflationRate, years);
  const gain = Math.max(salePrice - indexedBase, 0);
  const reducedGain = Math.max(0, gain - carryForward);
  return reducedGain * Math.max(0.30, marginalRate);
}

// ── Split CGT for grandfathered properties (purchased before 12 May 2026) ──
// Assets sold after 1 July 2027: gains split at the transition date.
//   Pre-transition  (purchase → 1 Jul 2027): 50% discount
//   Post-transition (1 Jul 2027 → sale):     indexation from transition-date value
// Mirror of calcCgtSplit in cgt.js, inlined here to keep property.js self-contained.
const _PROP_TRANSITION_YEAR = 2027.5; // 1 July 2027 as decimal year

function _cgtSplitDetail(costBase, salePrice, marginalRate, inflationRate, growthRate, purchaseYear, purchaseMonth, totalYears) {
  const purchaseDecimal  = purchaseYear + (purchaseMonth - 1) / 12;
  const saleDecimalYear  = purchaseDecimal + totalYears;

  // Selling before or on transition — pure 50% discount, no split
  if (saleDecimalYear <= _PROP_TRANSITION_YEAR) {
    const liability = _cgtOld(costBase, salePrice, marginalRate);
    return {
      split: false,
      cgtLiability:       liability,
      yearsToTransition:  _PROP_TRANSITION_YEAR - purchaseDecimal,
      yearsAfterTransition: 0,
      valueAtTransition:  null,
      preTransitionGain:  Math.max(salePrice - costBase, 0),
      preTransitionCgt:   liability,
      postTransitionGain: 0,
      postTransitionCgt:  0,
    };
  }

  const yearsToTransition    = _PROP_TRANSITION_YEAR - purchaseDecimal;
  const yearsAfterTransition = saleDecimalYear - _PROP_TRANSITION_YEAR;
  const valueAtTransition    = costBase * Math.pow(1 + growthRate, yearsToTransition);

  const preTransitionGain = Math.max(valueAtTransition - costBase, 0);
  const preTransitionCgt  = preTransitionGain * 0.5 * marginalRate;

  const indexedTransitionBase = valueAtTransition * Math.pow(1 + inflationRate, yearsAfterTransition);
  const postTransitionGain    = Math.max(salePrice - indexedTransitionBase, 0);
  const postTransitionCgt     = postTransitionGain * Math.max(0.30, marginalRate);

  return {
    split: true,
    cgtLiability:       preTransitionCgt + postTransitionCgt,
    yearsToTransition,
    yearsAfterTransition,
    valueAtTransition,
    preTransitionGain,
    preTransitionCgt,
    postTransitionGain,
    postTransitionCgt,
  };
}

function _cgtSplit(costBase, salePrice, marginalRate, inflationRate, growthRate, purchaseYear, purchaseMonth, totalYears) {
  return _cgtSplitDetail(costBase, salePrice, marginalRate, inflationRate, growthRate, purchaseYear, purchaseMonth, totalYears).cgtLiability;
}

// Annual negative gearing tax saving for a single year.
// restricted = true  → losses quarantined; taxSavingNew = 0
// restricted = false → full deduction under old and new rules (e.g. new build or grandfathered)
function calcNegGearing({ rentalIncome, interest, maintenance, marginalRate, restricted }) {
  const totalDeductions = interest + maintenance;
  const netPosition = rentalIncome - totalDeductions; // negative = loss

  let taxSavingOld = 0;
  let taxSavingNew = 0;

  if (netPosition < 0) {
    taxSavingOld = Math.abs(netPosition) * marginalRate;
    taxSavingNew = restricted ? 0 : taxSavingOld;
  }

  return {
    totalDeductions,
    netPosition,
    isNegativelyGeared: netPosition < 0,
    taxSavingOld,
    taxSavingNew,
    annualDiff: taxSavingOld - taxSavingNew,
  };
}

// Full projection over holding period.
// Rental income grows with inflation each year; interest and maintenance are fixed.
// Returns year-by-year breakdown and exit CGT under old and new rules.
function calcPropertyProjection({
  purchasePrice,
  rentalIncome,        // gross annual rental income (year 0 base)
  interestRate,        // decimal e.g. 0.065
  loanAmount,
  maintenance,         // annual $ (fixed)
  marginalRate,
  inflationRate,
  years,
  restricted,          // true = established IP post-12-May-2026 (neg gearing restricted from yr 2)
  growthRate,          // property capital growth rate p.a.
  grandfathered = false,    // true = purchased before 12 May 2026 (split CGT after 1 Jul 2027)
  purchaseYear  = 2020,     // calendar year of purchase (used for split CGT only)
  purchaseMonth = 1,        // calendar month 1-12 of purchase
}) {
  const annualInterest = loanAmount * interestRate;
  const rows = [];
  let cumTaxSavedOld = 0;
  let cumTaxSavedNew = 0;
  let carryForward = 0; // accumulated quarantined losses (restricted properties only)

  for (let yr = 1; yr <= years; yr++) {
    // Rental income grows with inflation from year 1 onwards
    const rentalYr = rentalIncome * Math.pow(1 + inflationRate, yr - 1);

    // Fix: year 1 is before 1 July 2027 — losses still fully deductible against all income.
    // From year 2 the restriction applies (losses quarantined, carried forward).
    const effectivelyRestricted = restricted && yr > 1;

    const ng = calcNegGearing({
      rentalIncome: rentalYr,
      interest: annualInterest,
      maintenance,
      marginalRate,
      restricted: effectivelyRestricted,
    });

    // Apply carry-forward logic for restricted years
    let taxSavingNew = ng.taxSavingNew;
    let carryApplied = 0;

    if (effectivelyRestricted) {
      if (ng.netPosition < 0) {
        // Quarantine this year's loss — accumulate carry-forward balance
        carryForward += Math.abs(ng.netPosition);
        taxSavingNew = 0;
      } else if (ng.netPosition > 0 && carryForward > 0) {
        // Property turned positive — apply carry-forward to reduce taxable rental income
        carryApplied = Math.min(carryForward, ng.netPosition);
        carryForward -= carryApplied;
        // Tax saving = the offset rental income that is no longer taxable
        taxSavingNew = carryApplied * marginalRate;
      }
    }

    cumTaxSavedOld += ng.taxSavingOld;
    cumTaxSavedNew += taxSavingNew;

    const salePriceYr = purchasePrice * Math.pow(1 + growthRate, yr);
    rows.push({
      year: yr,
      rentalIncome: rentalYr,
      annualInterest,
      maintenance,
      netPosition: ng.netPosition,
      taxSavingOld: ng.taxSavingOld,
      taxSavingNew,
      carryApplied,
      carryForwardBalance: carryForward,
      annualDiff: ng.taxSavingOld - taxSavingNew,
      cumTaxSavedOld,
      cumTaxSavedNew,
      salePrice: salePriceYr,
      cgtOld: _cgtOld(purchasePrice, salePriceYr, marginalRate),
      // Per-year cgtNew applies remaining carry-forward balance at point of hypothetical exit
      cgtNew: restricted
        ? _cgtNewWithCF(purchasePrice, salePriceYr, marginalRate, inflationRate, yr, carryForward)
        : _cgtNew(purchasePrice, salePriceYr, marginalRate, inflationRate, yr),
      // Grandfathered: split CGT (50% disc to Jul 2027, indexation after)
      cgtSplit: grandfathered
        ? _cgtSplit(purchasePrice, salePriceYr, marginalRate, inflationRate, growthRate, purchaseYear, purchaseMonth, yr)
        : undefined,
    });
  }

  const salePrice = purchasePrice * Math.pow(1 + growthRate, years);
  const cgtOld = _cgtOld(purchasePrice, salePrice, marginalRate);
  // Apply remaining carry-forward balance against the capital gain at exit
  const cgtNew = restricted
    ? _cgtNewWithCF(purchasePrice, salePrice, marginalRate, inflationRate, years, carryForward)
    : _cgtNew(purchasePrice, salePrice, marginalRate, inflationRate, years);

  // Grandfathered: split CGT detail for the exit year (used by app.js for display and impact)
  const cgtSplitDetail = grandfathered
    ? _cgtSplitDetail(purchasePrice, salePrice, marginalRate, inflationRate, growthRate, purchaseYear, purchaseMonth, years)
    : null;

  const taxSavingDiff = cumTaxSavedOld - cumTaxSavedNew; // lost tax savings due to restriction
  const cgtDiff       = cgtNew - cgtOld;                  // extra CGT under new rules
  const totalImpact   = taxSavingDiff + cgtDiff;          // total cost of budget changes

  return {
    annualInterest,
    rows,
    salePrice,
    cgtOld,
    cgtNew,
    cgtSplitDetail,
    carryForwardBalance: carryForward,
    totalTaxSavedOld: cumTaxSavedOld,
    totalTaxSavedNew: cumTaxSavedNew,
    taxSavingDiff,
    cgtDiff,
    totalImpact,
  };
}

if (typeof module !== 'undefined') module.exports = {
  calcNegGearing, calcPropertyProjection, _cgtSplitDetail,
};
