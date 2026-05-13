// Investment property calculations — pure functions, no DOM access.
// CGT formulas are self-contained here (same logic as cgt.js, no cross-dependency).
//
// Negative gearing restriction (from 1 July 2027):
//   - Established IPs purchased after 12 May 2026 ("restricted"): losses quarantined.
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
  rentalIncome,      // gross annual rental income (year 0 base)
  interestRate,      // decimal e.g. 0.065
  loanAmount,
  maintenance,       // annual $ (fixed)
  marginalRate,
  inflationRate,
  years,
  restricted,        // true = established IP post-12-May-2026 (neg gearing restricted)
  growthRate,        // property capital growth rate p.a.
}) {
  const annualInterest = loanAmount * interestRate;
  const rows = [];
  let cumTaxSavedOld = 0;
  let cumTaxSavedNew = 0;

  for (let yr = 1; yr <= years; yr++) {
    // Rental income grows with inflation from year 1 onwards
    const rentalYr = rentalIncome * Math.pow(1 + inflationRate, yr - 1);
    const ng = calcNegGearing({
      rentalIncome: rentalYr,
      interest: annualInterest,
      maintenance,
      marginalRate,
      restricted,
    });
    cumTaxSavedOld += ng.taxSavingOld;
    cumTaxSavedNew += ng.taxSavingNew;
    rows.push({
      year: yr,
      rentalIncome: rentalYr,
      annualInterest,
      maintenance,
      netPosition: ng.netPosition,
      taxSavingOld: ng.taxSavingOld,
      taxSavingNew: ng.taxSavingNew,
      annualDiff: ng.annualDiff,
      cumTaxSavedOld,
      cumTaxSavedNew,
    });
  }

  const salePrice = purchasePrice * Math.pow(1 + growthRate, years);
  const cgtOld = _cgtOld(purchasePrice, salePrice, marginalRate);
  const cgtNew = _cgtNew(purchasePrice, salePrice, marginalRate, inflationRate, years);

  const taxSavingDiff = cumTaxSavedOld - cumTaxSavedNew; // lost tax savings due to restriction
  const cgtDiff       = cgtNew - cgtOld;                  // extra CGT under new rules
  const totalImpact   = taxSavingDiff + cgtDiff;          // total cost of budget changes

  return {
    annualInterest,
    rows,
    salePrice,
    cgtOld,
    cgtNew,
    totalTaxSavedOld: cumTaxSavedOld,
    totalTaxSavedNew: cumTaxSavedNew,
    taxSavingDiff,
    cgtDiff,
    totalImpact,
  };
}

if (typeof module !== 'undefined') module.exports = {
  calcNegGearing, calcPropertyProjection,
};
