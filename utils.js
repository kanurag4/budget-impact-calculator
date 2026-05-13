// Pure DOM-free helpers — no document/window access allowed here.

function parseMoney(el) {
  return parseInt(String(el.value).replace(/,/g, ''), 10) || 0;
}

function parseMoneyVal(str) {
  return parseInt(String(str).replace(/,/g, ''), 10) || 0;
}

function formatMoneyInput(el) {
  const pos = el.selectionStart;
  const oldVal = el.value;
  const digitsBeforeCursor = (oldVal.slice(0, pos).match(/\d/g) || []).length;
  const raw = oldVal.replace(/[^\d]/g, '');
  if (!raw) { el.value = ''; return; }
  const formatted = Number(raw).toLocaleString('en-AU');
  el.value = formatted;
  let digitCount = 0, newPos = formatted.length;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) digitCount++;
    if (digitCount === digitsBeforeCursor) { newPos = i + 1; break; }
  }
  el.setSelectionRange(newPos, newPos);
}

function formatMoney(n) {
  if (!isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-AU');
}

function fmtDollar(n) {
  const abs = Math.abs(Math.round(n));
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-AU');
}

function fmtPct(rate) {
  return (rate * 100).toFixed(1) + '%';
}

if (typeof module !== 'undefined') module.exports = { parseMoney, parseMoneyVal, formatMoney, fmtDollar, fmtPct };
