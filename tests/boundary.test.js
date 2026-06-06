'use strict';

const assert = require('node:assert/strict');

const {
  marginalRate2425,
  marginalRate2627,
  effectiveTax2425,
  effectiveTax2627,
  incomeTaxDiff,
} = require('../calc/tax');
const {
  calcCgtOld,
  calcCgtNew,
  calcCgtSplit,
  cgtByYear,
  findBreakevenYear,
  TRANSITION_YEAR,
} = require('../calc/cgt');
const {
  calcNegGearing,
  calcPropertyProjection,
  _cgtSplitDetail,
} = require('../calc/property');
const { parseMoneyVal, formatMoney, fmtDollar, fmtPct } = require('../utils');

const EPS = 1e-6;

function approx(actual, expected, msg, eps = EPS) {
  assert.ok(Math.abs(actual - expected) <= eps, `${msg}: expected ${expected}, got ${actual}`);
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

test('2026-27 marginal rates switch exactly above bracket boundaries', () => {
  assert.equal(marginalRate2627(0), 0);
  assert.equal(marginalRate2627(18200), 0);
  assert.equal(marginalRate2627(18201), 0.17);
  assert.equal(marginalRate2627(45000), 0.17);
  assert.equal(marginalRate2627(45001), 0.32);
  assert.equal(marginalRate2627(135000), 0.32);
  assert.equal(marginalRate2627(135001), 0.39);
  assert.equal(marginalRate2627(190000), 0.39);
  assert.equal(marginalRate2627(190001), 0.47);
});

test('2024-25 marginal rates switch exactly above bracket boundaries', () => {
  assert.equal(marginalRate2425(18200), 0);
  assert.equal(marginalRate2425(18201), 0.21);
  assert.equal(marginalRate2425(45000), 0.21);
  assert.equal(marginalRate2425(45001), 0.345);
  assert.equal(marginalRate2425(120000), 0.345);
  assert.equal(marginalRate2425(120001), 0.39);
  assert.equal(marginalRate2425(180000), 0.39);
  assert.equal(marginalRate2425(180001), 0.47);
});

test('effective tax totals are continuous at 2026-27 thresholds', () => {
  approx(effectiveTax2627(18200), 0, 'tax-free threshold');
  approx(effectiveTax2627(45000), (45000 - 18200) * 0.17, '$45k tax');
  approx(
    effectiveTax2627(135000),
    (45000 - 18200) * 0.17 + (135000 - 45000) * 0.32,
    '$135k tax',
  );
  approx(
    effectiveTax2627(190000),
    (45000 - 18200) * 0.17 + (135000 - 45000) * 0.32 + (190000 - 135000) * 0.39,
    '$190k tax',
  );
  assert.equal(incomeTaxDiff(18200), 0);
  assert.ok(incomeTaxDiff(120000) > 0);
  assert.ok(effectiveTax2425(250000) > effectiveTax2627(250000));
});

test('old CGT handles gains, zero gains, and capital losses', () => {
  assert.deepEqual(calcCgtOld({ costBase: 100000, salePrice: 100000, marginalRate: 0.32 }), {
    nominalGain: 0,
    taxableGain: 0,
    cgtLiability: 0,
    effectiveRate: 0,
  });
  assert.equal(calcCgtOld({ costBase: 100000, salePrice: 90000, marginalRate: 0.32 }).cgtLiability, 0);
  approx(calcCgtOld({ costBase: 100000, salePrice: 150000, marginalRate: 0.32 }).cgtLiability, 8000, 'old CGT');
});

test('new CGT indexes cost base and applies 30 percent floor', () => {
  const lowIncome = calcCgtNew({
    costBase: 100000,
    salePrice: 150000,
    marginalRate: 0.17,
    inflationRate: 0.02,
    years: 5,
  });
  approx(lowIncome.indexedCostBase, 110408.08032, 'indexed cost base');
  approx(lowIncome.rate, 0.30, '30% floor');
  approx(lowIncome.cgtLiability, (150000 - 110408.08032) * 0.30, 'floor liability');

  const highIncome = calcCgtNew({
    costBase: 100000,
    salePrice: 150000,
    marginalRate: 0.47,
    inflationRate: 0.02,
    years: 5,
  });
  approx(highIncome.rate, 0.47, 'marginal rate above floor');
});

test('new CGT is zero when indexation fully absorbs nominal growth', () => {
  const r = calcCgtNew({
    costBase: 100000,
    salePrice: 110000,
    marginalRate: 0.32,
    inflationRate: 0.05,
    years: 3,
  });
  assert.equal(r.indexedGain, 0);
  assert.equal(r.cgtLiability, 0);
  assert.equal(r.effectiveRate, 0);
});

test('pre-budget CGT remains old rules when sale is on or before transition', () => {
  const before = calcCgtSplit({
    costBase: 100000,
    salePrice: 110000,
    marginalRate: 0.32,
    inflationRate: 0.02,
    purchaseYear: 2026,
    purchaseMonth: 7,
    totalYears: 1,
    growthRate: 0.10,
  });
  assert.equal(before.split, false);
  approx(before.cgtLiability, 1600, 'pre-transition old CGT');

  const exact = calcCgtSplit({
    costBase: 100000,
    salePrice: 125000,
    marginalRate: 0.32,
    inflationRate: 0.02,
    purchaseYear: 2025,
    purchaseMonth: 1,
    totalYears: TRANSITION_YEAR - 2025,
    growthRate: 0.10,
  });
  assert.equal(exact.split, false);
});

test('pre-budget CGT split uses month-precise transition value', () => {
  const r = calcCgtSplit({
    costBase: 100000,
    salePrice: 100000 * Math.pow(1.08, 5),
    marginalRate: 0.32,
    inflationRate: 0.02,
    purchaseYear: 2025,
    purchaseMonth: 9,
    totalYears: 5,
    growthRate: 0.08,
  });

  const purchaseDecimal = 2025 + 8 / 12;
  const yearsToTransition = 2027.5 - purchaseDecimal;
  const yearsAfterTransition = purchaseDecimal + 5 - 2027.5;
  const valueAtTransition = 100000 * Math.pow(1.08, yearsToTransition);
  const preTransitionCgt = (valueAtTransition - 100000) * 0.5 * 0.32;
  const indexedTransitionBase = valueAtTransition * Math.pow(1.02, yearsAfterTransition);
  const postTransitionCgt = (100000 * Math.pow(1.08, 5) - indexedTransitionBase) * 0.32;

  assert.equal(r.split, true);
  approx(r.yearsToTransition, yearsToTransition, 'years to transition');
  approx(r.yearsAfterTransition, yearsAfterTransition, 'years after transition');
  approx(r.valueAtTransition, valueAtTransition, 'transition value');
  approx(r.preTransitionCgt, preTransitionCgt, 'pre-transition CGT');
  approx(r.postTransitionCgt, postTransitionCgt, 'post-transition CGT');
  approx(r.cgtLiability, preTransitionCgt + postTransitionCgt, 'split total');
});

test('CGT chart rows cover every year and breakeven detection is stable', () => {
  const rows = cgtByYear({
    costBase: 50000,
    growthRate: 0.07,
    marginalRate: 0.32,
    inflationRate: 0.02,
    maxYears: 30,
    mode: 'post-budget',
    purchaseYear: 2026,
    purchaseMonth: 6,
  });
  assert.equal(rows.length, 30);
  assert.equal(rows[0].year, 1);
  assert.equal(rows[29].year, 30);
  assert.equal(findBreakevenYear({
    costBase: 50000,
    growthRate: 0.07,
    marginalRate: 0.32,
    inflationRate: 0.02,
    maxYears: 30,
    mode: 'post-budget',
    purchaseYear: 2026,
    purchaseMonth: 6,
  }), rows.find(r => r.diff > 0).year);
});

test('negative gearing caps restricted salary-offset saving but preserves unrestricted saving', () => {
  const unrestricted = calcNegGearing({
    rentalIncome: 20000,
    interest: 30000,
    maintenance: 5000,
    marginalRate: 0.32,
    restricted: false,
  });
  assert.equal(unrestricted.netPosition, -15000);
  approx(unrestricted.taxSavingOld, 4800, 'old saving');
  approx(unrestricted.taxSavingNew, 4800, 'unrestricted new saving');

  const restricted = calcNegGearing({
    rentalIncome: 20000,
    interest: 30000,
    maintenance: 5000,
    marginalRate: 0.32,
    restricted: true,
  });
  assert.equal(restricted.netPosition, -15000);
  approx(restricted.taxSavingOld, 4800, 'restricted old saving');
  assert.equal(restricted.taxSavingNew, 0);
  approx(restricted.annualDiff, 4800, 'restricted lost saving');
});

test('restricted property keeps year 1 deduction and quarantines year 2 losses', () => {
  const proj = calcPropertyProjection({
    purchasePrice: 700000,
    rentalIncome: 24000,
    interestRate: 0.065,
    loanAmount: 560000,
    maintenance: 5000,
    marginalRate: 0.32,
    inflationRate: 0.02,
    years: 2,
    restricted: true,
    growthRate: 0.05,
  });

  approx(proj.rows[0].taxSavingOld, 5568, 'year 1 old saving');
  approx(proj.rows[0].taxSavingNew, 5568, 'year 1 new saving');
  assert.equal(proj.rows[0].carryForwardBalance, 0);
  assert.equal(proj.rows[1].taxSavingNew, 0);
  assert.ok(proj.rows[1].carryForwardBalance > 0);
  approx(proj.taxSavingDiff, proj.rows[1].taxSavingOld, 'only year 2 lost saving');
});

test('restricted property applies carry-forward losses against future positive rent', () => {
  const proj = calcPropertyProjection({
    purchasePrice: 500000,
    rentalIncome: 28000,
    interestRate: 0.055,
    loanAmount: 700000,
    maintenance: 1000,
    marginalRate: 0.32,
    inflationRate: 0.20,
    years: 4,
    restricted: true,
    growthRate: 0.04,
  });

  assert.ok(proj.rows[1].carryForwardBalance > 0);
  assert.ok(proj.rows.some(r => r.carryApplied > 0));
  for (const row of proj.rows) {
    assert.ok(row.carryForwardBalance >= 0);
  }
});

test('remaining restricted carry-forward reduces exit indexed capital gain', () => {
  const withoutCarry = calcPropertyProjection({
    purchasePrice: 700000,
    rentalIncome: 100000,
    interestRate: 0,
    loanAmount: 0,
    maintenance: 0,
    marginalRate: 0.32,
    inflationRate: 0.02,
    years: 10,
    restricted: false,
    growthRate: 0.05,
  });
  const withCarry = calcPropertyProjection({
    purchasePrice: 700000,
    rentalIncome: 1000,
    interestRate: 0.10,
    loanAmount: 700000,
    maintenance: 5000,
    marginalRate: 0.32,
    inflationRate: 0.02,
    years: 10,
    restricted: true,
    growthRate: 0.05,
  });

  assert.ok(withCarry.carryForwardBalance > 0);
  assert.ok(withCarry.cgtNew < withoutCarry.cgtNew);
});

test('grandfathered property split logic matches ETF split logic', () => {
  const args = {
    costBase: 700000,
    salePrice: 700000 * Math.pow(1.05, 8),
    marginalRate: 0.39,
    inflationRate: 0.02,
    growthRate: 0.05,
    purchaseYear: 2020,
    purchaseMonth: 1,
    totalYears: 8,
  };
  const etf = calcCgtSplit(args);
  const prop = _cgtSplitDetail(
    args.costBase,
    args.salePrice,
    args.marginalRate,
    args.inflationRate,
    args.growthRate,
    args.purchaseYear,
    args.purchaseMonth,
    args.totalYears,
  );
  approx(prop.cgtLiability, etf.cgtLiability, 'property/ETF split parity');
  approx(prop.preTransitionCgt, etf.preTransitionCgt, 'property/ETF pre-transition parity');
  approx(prop.postTransitionCgt, etf.postTransitionCgt, 'property/ETF post-transition parity');
});

test('property projection computes CGT on full property value, not loan or equity', () => {
  const proj = calcPropertyProjection({
    purchasePrice: 800000,
    rentalIncome: 50000,
    interestRate: 0.06,
    loanAmount: 100000,
    maintenance: 5000,
    marginalRate: 0.32,
    inflationRate: 0.02,
    years: 5,
    restricted: false,
    growthRate: 0.05,
  });

  const salePrice = 800000 * Math.pow(1.05, 5);
  approx(proj.salePrice, salePrice, 'full property sale price');
  approx(proj.cgtOld, (salePrice - 800000) * 0.5 * 0.32, 'full property old CGT');
});

test('utility helpers tolerate malformed, empty, negative, and infinite values', () => {
  assert.equal(parseMoneyVal('1,234,567'), 1234567);
  assert.equal(parseMoneyVal('abc'), 0);
  assert.equal(parseMoneyVal(''), 0);
  assert.equal(parseMoneyVal('-1,234'), -1234);
  assert.equal(formatMoney(Number.POSITIVE_INFINITY), '0');
  assert.equal(fmtDollar(-1234.4), '-$1,234');
  assert.equal(fmtPct(0.32), '32.0%');
});

console.log('All boundary tests passed');
