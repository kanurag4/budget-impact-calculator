// CGT calculations — pure functions, no DOM access.
//
// THREE scenarios for ETF/shares:
//
// 1. POST-BUDGET (acquired on/after 12 May 2026):
//    Full new rules from day one — indexation + 30% minimum rate.
//    calcCgtNew()
//
// 2. PRE-BUDGET, sold by 30 June 2027:
//    50% discount applies to entire gain (grandfathered, transition hasn't hit yet).
//    calcCgtOld()
//
// 3. PRE-BUDGET, sold after 1 July 2027 (the common case for 2024/2025 purchases held long-term):
//    SPLIT GAIN — gains are apportioned at the transition date:
//      • Gains accrued UP TO 1 July 2027    → 50% discount (old rules)
//      • Gains accrued AFTER 1 July 2027    → indexation from transition-date value (new rules)
//    calcCgtSplit()
//
// The "old rules forever" comparison used in charts represents the hypothetical world where
// the budget change never happened — useful to show the cost of the policy change.

const TRANSITION_YEAR = 2027.5; // 1 July 2027 expressed as a decimal year

// Convert a calendar month (1-12) and year to a decimal year.
// January 2025 → 2025.0,  July 2025 → 2025.5,  December 2025 → 2025.917
function toDecimalYear(year, month) {
  return year + (month - 1) / 12;
}

// ── Old rules: 50% CGT discount on entire nominal gain ──
function calcCgtOld({ costBase, salePrice, marginalRate }) {
  const nominalGain = salePrice - costBase;
  if (nominalGain <= 0) {
    return { nominalGain, taxableGain: 0, cgtLiability: 0, effectiveRate: 0 };
  }
  const taxableGain = nominalGain * 0.5;
  const cgtLiability = taxableGain * marginalRate;
  const effectiveRate = cgtLiability / nominalGain;
  return { nominalGain, taxableGain, cgtLiability, effectiveRate };
}

// ── New rules: indexation + 30% minimum (post-budget assets, full holding period) ──
function calcCgtNew({ costBase, salePrice, marginalRate, inflationRate, years }) {
  const nominalGain = salePrice - costBase;
  const indexedCostBase = costBase * Math.pow(1 + inflationRate, years);
  const indexedGain = Math.max(salePrice - indexedCostBase, 0);
  const rate = Math.max(0.30, marginalRate);
  const cgtLiability = indexedGain * rate;
  const effectiveRate = nominalGain > 0 ? cgtLiability / nominalGain : 0;
  return { nominalGain, indexedCostBase, indexedGain, cgtLiability, effectiveRate, rate };
}

// ── Split rules: for pre-budget assets held past 1 July 2027 ──
// Gains are split at the transition date:
//   - Pre-transition gain (purchase → 1 July 2027): 50% discount
//   - Post-transition gain (1 July 2027 → sale): indexation from transition-date value
//
// purchaseYear:  calendar year of purchase (e.g. 2025)
// purchaseMonth: calendar month 1-12 (e.g. 9 for September). Defaults to 1 (January).
// totalYears:    total holding period in years from purchase to sale
// growthRate:    capital growth rate p.a.
function calcCgtSplit({ costBase, salePrice, marginalRate, inflationRate, purchaseYear, purchaseMonth = 1, totalYears, growthRate }) {
  const purchaseDecimal = toDecimalYear(purchaseYear, purchaseMonth);
  const saleYear = purchaseDecimal + totalYears;

  // If selling before or at the transition date — pure 50% discount, no split needed
  if (saleYear <= TRANSITION_YEAR) {
    const r = calcCgtOld({ costBase, salePrice, marginalRate });
    return {
      ...r,
      split: false,
      valueAtTransition: null,
      preTransitionGain: r.nominalGain,
      preTransitionCgt: r.cgtLiability,
      postTransitionGain: 0,
      postTransitionCgt: 0,
    };
  }

  const yearsToTransition    = TRANSITION_YEAR - purchaseDecimal; // purchase → 1 July 2027
  const yearsAfterTransition = saleYear - TRANSITION_YEAR;       // 1 July 2027 → sale

  // Value at the transition date using the growth rate
  const valueAtTransition = costBase * Math.pow(1 + growthRate, yearsToTransition);

  // Pre-transition portion: gains from purchase to 1 July 2027 → 50% discount
  const preTransitionGain = Math.max(valueAtTransition - costBase, 0);
  const preTransitionCgt  = preTransitionGain * 0.5 * marginalRate;

  // Post-transition portion: gains from 1 July 2027 to sale → indexation from transition value
  const indexedTransitionBase = valueAtTransition * Math.pow(1 + inflationRate, yearsAfterTransition);
  const postTransitionGain    = Math.max(salePrice - indexedTransitionBase, 0);
  const postTransitionCgt     = postTransitionGain * Math.max(0.30, marginalRate);

  const totalCgt   = preTransitionCgt + postTransitionCgt;
  const nominalGain = salePrice - costBase;

  return {
    split: true,
    nominalGain,
    valueAtTransition,
    yearsToTransition,
    yearsAfterTransition,
    preTransitionGain,
    preTransitionCgt,
    indexedTransitionBase,
    postTransitionGain,
    postTransitionCgt,
    cgtLiability: totalCgt,
    effectiveRate: nominalGain > 0 ? totalCgt / nominalGain : 0,
  };
}

// ── Year-by-year CGT series for chart (years 1 to maxYears) ──
// mode: 'post-budget'  → compare calcCgtNew vs calcCgtOld (hypothetical)
// mode: 'pre-budget'   → compare calcCgtSplit (actual) vs calcCgtOld (hypothetical "no change")
// Returns array of { year, salePrice, cgtActual, cgtHypothetical, diff }.
function cgtByYear({ costBase, growthRate, marginalRate, inflationRate, maxYears, mode, purchaseYear, purchaseMonth = 1 }) {
  const rows = [];
  for (let year = 1; year <= maxYears; year++) {
    const salePrice = costBase * Math.pow(1 + growthRate, year);
    // Hypothetical: what if the budget never changed (50% discount forever)
    const hypothetical = calcCgtOld({ costBase, salePrice, marginalRate });

    let actual;
    if (mode === 'post-budget') {
      actual = calcCgtNew({ costBase, salePrice, marginalRate, inflationRate, years: year });
    } else {
      // pre-budget: split at 1 July 2027 using precise purchase month
      actual = calcCgtSplit({ costBase, salePrice, marginalRate, inflationRate, purchaseYear, purchaseMonth, totalYears: year, growthRate });
    }

    rows.push({
      year,
      salePrice,
      cgtActual:       actual.cgtLiability,
      cgtHypothetical: hypothetical.cgtLiability,
      diff: actual.cgtLiability - hypothetical.cgtLiability, // positive = budget made things worse
    });
  }
  return rows;
}

// Find the first year where actual CGT exceeds hypothetical (budget becomes a net cost).
function findBreakevenYear({ costBase, growthRate, marginalRate, inflationRate, maxYears, mode, purchaseYear, purchaseMonth = 1 }) {
  const rows = cgtByYear({ costBase, growthRate, marginalRate, inflationRate, maxYears, mode, purchaseYear, purchaseMonth });
  const crossover = rows.find(r => r.diff > 0);
  return crossover ? crossover.year : null;
}

if (typeof module !== 'undefined') module.exports = {
  calcCgtOld, calcCgtNew, calcCgtSplit, cgtByYear, findBreakevenYear, TRANSITION_YEAR,
};
