// Income tax calculations — pure functions, no DOM access.
// All rates include the 2% Medicare levy as stated in the 2026-27 Budget.

// 2024-25 marginal rates (Stage 3, incl. Medicare)
// Brackets: $0 | $18,200 | $45,000 | $120,000 | $180,000
function marginalRate2425(income) {
  if (income <= 18200)  return 0;
  if (income <= 45000)  return 0.21;
  if (income <= 120000) return 0.345;
  if (income <= 180000) return 0.39;
  return 0.47;
}

// 2026-27 marginal rates (Budget announcement, incl. Medicare)
// Brackets: $0 | $18,200 | $45,000 | $135,000 | $190,000
function marginalRate2627(income) {
  if (income <= 18200)  return 0;
  if (income <= 45000)  return 0.17;
  if (income <= 135000) return 0.32;
  if (income <= 190000) return 0.39;
  return 0.47;
}

// Total tax payable under 2024-25 brackets
function effectiveTax2425(income) {
  if (income <= 18200) return 0;
  let tax = 0;
  if (income > 18200)  tax += Math.min(income - 18200,  45000 - 18200)  * 0.21;
  if (income > 45000)  tax += Math.min(income - 45000,  120000 - 45000) * 0.345;
  if (income > 120000) tax += Math.min(income - 120000, 180000 - 120000) * 0.39;
  if (income > 180000) tax += (income - 180000) * 0.47;
  return tax;
}

// Total tax payable under 2026-27 brackets
function effectiveTax2627(income) {
  if (income <= 18200) return 0;
  let tax = 0;
  if (income > 18200)  tax += Math.min(income - 18200,  45000 - 18200)  * 0.17;
  if (income > 45000)  tax += Math.min(income - 45000,  135000 - 45000) * 0.32;
  if (income > 135000) tax += Math.min(income - 135000, 190000 - 135000) * 0.39;
  if (income > 190000) tax += (income - 190000) * 0.47;
  return tax;
}

// Take-home pay difference: positive = better off under new brackets
function incomeTaxDiff(income) {
  return effectiveTax2425(income) - effectiveTax2627(income);
}

if (typeof module !== 'undefined') module.exports = {
  marginalRate2425, marginalRate2627,
  effectiveTax2425, effectiveTax2627,
  incomeTaxDiff,
};
