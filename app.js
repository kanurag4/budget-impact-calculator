'use strict';

/* ── Constants ── */
const $ = id => document.getElementById(id);
const STORAGE_KEY   = 'kv-budget-impact';
const CURRENT_YEAR  = new Date().getFullYear();

const DEFAULTS = {
  etfIncome: 120000, etfAcquired: 'pre-budget',
  etfPurchaseMonth: 9, etfPurchaseYear: 2025,
  etfAmount: 50000, etfGrowth: 7, etfDividend: 3, etfFranking: 70,
  etfInflation: 2, etfYears: 10,
  propIncome: 120000, propType: 'established-new',
  propPurchaseMonth: 1, propPurchaseYear: 2020,
  propPrice: 700000, propRental: 24000, propLoan: 560000,
  propRate: 6.5, propMaintenance: 5000,
  propGrowth: 5, propInflation: 2, propYears: 10,
  activeTab: 'etf',
};

let etfChart = null, etfWorthChart = null, propChart = null, propWorthChart = null;

/* ── Theme-aware chart colors ── */
function cc() {
  const dark = document.documentElement.classList.contains('dark');
  return {
    grid:   dark ? '#334155' : '#e2e8f0',
    text:   dark ? '#94a3b8' : '#64748b',
    accent: '#38bdf8',
    muted:  dark ? '#475569' : '#b0bec5',
    pass:   '#22c55e',
    fail:   '#ef4444',
    warn:   '#f59e0b',
  };
}

/* ══════════════════════════════════════════
   TAB MANAGEMENT
══════════════════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  $('panel-' + tab).classList.remove('hidden');
  saveToStorage({ activeTab: tab });
}

/* ══════════════════════════════════════════
   ETF ACQUIRED UI (show/hide purchase date)
══════════════════════════════════════════ */
function updateEtfAcquiredUI() {
  const acquired   = $('etfAcquired').value;
  const dateField  = $('etfPurchaseDateField');
  const note       = $('etfAcquiredNote');
  if (acquired === 'pre-budget') {
    dateField.style.display = '';
    note.textContent = 'Gains to 1 July 2027 keep the 50% discount; gains after that use indexation.';
  } else {
    dateField.style.display = 'none';
    note.textContent = 'Full indexation rules apply from your purchase date.';
  }
  updateEtfTransitionNote();
}

function updateEtfTransitionNote() {
  const el = $('etfTransitionNote');
  if (!el) return;
  if ($('etfAcquired').value !== 'pre-budget') { el.textContent = ''; return; }
  const month = parseInt($('etfPurchaseMonth').value);
  const year  = parseInt($('etfPurchaseYear').value);
  const purchaseDecimal   = year + (month - 1) / 12;
  const yearsToTransition = TRANSITION_YEAR - purchaseDecimal;
  if (yearsToTransition <= 0) {
    el.textContent = 'Purchase is at or after 1 July 2027 — select "After 12 May 2026" instead.';
    el.className = 'derived warn';
    return;
  }
  const yrs  = Math.floor(yearsToTransition);
  const mths = Math.round((yearsToTransition - yrs) * 12);
  const parts = [];
  if (yrs > 0)  parts.push(yrs  + ' yr' + (yrs  !== 1 ? 's' : ''));
  if (mths > 0) parts.push(mths + ' month' + (mths !== 1 ? 's' : ''));
  el.textContent = parts.join(' ') + ' of growth get the 50% discount';
  el.className = 'derived';
}

/* ══════════════════════════════════════════
   PROPERTY TYPE UI (show/hide purchase date)
══════════════════════════════════════════ */
function updatePropTypeUI() {
  const propType  = $('propType').value;
  const dateField = $('propPurchaseDateField');
  const noteEl    = $('propTypeNote');
  const isGF      = propType === 'grandfathered';

  if (dateField) dateField.style.display = isGF ? '' : 'none';
  if (noteEl) {
    noteEl.textContent = isGF
      ? 'Gains to 1 July 2027 keep the 50% discount; gains after that date use indexation.'
      : '';
  }
  updatePropTransitionNote();
}

function updatePropTransitionNote() {
  const el = $('propTransitionNote');
  if (!el) return;
  if ($('propType').value !== 'grandfathered') { el.textContent = ''; return; }
  const month = parseInt($('propPurchaseMonth').value);
  const year  = parseInt($('propPurchaseYear').value);
  if (!year) { el.textContent = ''; return; }
  const purchaseDecimal   = year + (month - 1) / 12;
  const yearsToTransition = 2027.5 - purchaseDecimal;
  if (yearsToTransition <= 0) {
    el.textContent = 'Purchase is at or after 1 July 2027 — select "After 12 May 2026" type instead.';
    el.className = 'derived warn';
    return;
  }
  const yrs  = Math.floor(yearsToTransition);
  const mths = Math.round((yearsToTransition - yrs) * 12);
  const parts = [];
  if (yrs > 0)  parts.push(yrs  + ' yr'    + (yrs  !== 1 ? 's' : ''));
  if (mths > 0) parts.push(mths + ' month' + (mths !== 1 ? 's' : ''));
  el.textContent = parts.join(' ') + ' of growth get the 50% discount';
  el.className = 'derived';
}

/* ══════════════════════════════════════════
   DERIVED DISPLAYS
══════════════════════════════════════════ */
function updateEtfDerived() {
  const income = parseMoney($('etfIncome'));
  const rate   = marginalRate2627(income);
  $('etfMarginalRate').textContent = `Marginal rate (2026-27): ${(rate * 100).toFixed(0)}%`;

  const holdingYears = parseInt($('etfYears').value);
  const acquired     = $('etfAcquired').value;
  const baseYear     = acquired === 'pre-budget'
    ? parseInt($('etfPurchaseYear').value)
    : CURRENT_YEAR;
  const etfSellYear = baseYear + holdingYears;
  $('etfYearsLabel').textContent = holdingYears + (holdingYears === 1 ? ' year' : ' years');
  $('etfSellYear').textContent   = 'Selling in ' + etfSellYear +
    (etfSellYear < CURRENT_YEAR ? ' (historical)' : '');

  updateEtfTransitionNote();
}

function updatePropDerived() {
  const income      = parseMoney($('propIncome'));
  const rate        = marginalRate2627(income);
  $('propMarginalRate').textContent = `Marginal rate (2026-27): ${(rate * 100).toFixed(0)}%`;

  const price       = parseMoney($('propPrice'));
  const rental      = parseMoney($('propRental'));
  const loan        = parseMoney($('propLoan'));
  const loanRate    = (parseFloat($('propRate').value) || 0) / 100;
  const maintenance = parseMoney($('propMaintenance'));
  const holdingYears= parseInt($('propYears').value);

  const annualInterest = loan * loanRate;
  const netPos         = rental - annualInterest - maintenance;
  const yieldPct       = price > 0 ? (rental / price * 100).toFixed(1) : '—';

  $('propInterestAmt').textContent = `Annual interest: $${formatMoney(annualInterest)}`;
  $('propRentalYield').textContent = `Gross rental yield: ${yieldPct}%`;

  const posEl = $('propNetPosition');
  posEl.textContent = netPos >= 0
    ? `Net: +$${formatMoney(netPos)}/yr (positively geared)`
    : `Net: -$${formatMoney(Math.abs(netPos))}/yr (negatively geared)`;
  posEl.className = 'derived ' + (netPos >= 0 ? 'pass' : 'warn');

  const propType     = $('propType').value;
  const propBaseYear = propType === 'grandfathered'
    ? (parseInt($('propPurchaseYear').value) || CURRENT_YEAR)
    : CURRENT_YEAR;
  const propSellYear = propBaseYear + holdingYears;
  $('propYearsLabel').textContent = holdingYears + (holdingYears === 1 ? ' year' : ' years');
  $('propSellYear').textContent   = 'Selling in ' + propSellYear +
    (propSellYear < CURRENT_YEAR ? ' (historical)' : '');
  updatePropTransitionNote();
}

function updateDerived() {
  updateEtfDerived();
  updatePropDerived();
}

/* ══════════════════════════════════════════
   MONEY INPUT FORMATTING
══════════════════════════════════════════ */
function bindMoneyInputs() {
  ['etfIncome','etfAmount','propIncome','propPrice','propRental','propLoan','propMaintenance']
    .forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', () => { formatMoneyInput(el); updateDerived(); });
    });
}

/* ══════════════════════════════════════════
   ETF CALCULATION
══════════════════════════════════════════ */
function calcEtf(silent = false) {
  const income        = parseMoney($('etfIncome'));
  const acquired      = $('etfAcquired').value;
  const purchaseMonth = parseInt($('etfPurchaseMonth').value);
  const purchaseYear  = parseInt($('etfPurchaseYear').value);
  const costBase      = parseMoney($('etfAmount'));
  const growthRate    = (parseFloat($('etfGrowth').value)    || 0) / 100;
  const dividendYield = (parseFloat($('etfDividend').value)  || 0) / 100;
  const frankingPct   = (parseFloat($('etfFranking').value)  || 0) / 100;
  const inflationRate = (parseFloat($('etfInflation').value) || 0) / 100;
  const holdingYears  = parseInt($('etfYears').value);
  const marginalRate  = marginalRate2627(income);
  const salePrice     = costBase * Math.pow(1 + growthRate, holdingYears);

  /* What would have happened without budget change */
  const cgtHyp = calcCgtOld({ costBase, salePrice, marginalRate });

  /* What actually happens */
  let cgtActual;
  if (acquired === 'post-budget') {
    cgtActual = calcCgtNew({ costBase, salePrice, marginalRate, inflationRate, years: holdingYears });
  } else {
    cgtActual = calcCgtSplit({
      costBase, salePrice, marginalRate, inflationRate,
      purchaseYear, purchaseMonth, totalYears: holdingYears, growthRate,
    });
  }

  /* 30-year series for chart */
  const rows = cgtByYear({
    costBase, growthRate, marginalRate, inflationRate,
    maxYears: 30, mode: acquired, purchaseYear, purchaseMonth,
  });

  renderEtfResults({
    costBase, growthRate, holdingYears, marginalRate, inflationRate,
    salePrice, dividendYield, frankingPct, acquired,
    purchaseYear, purchaseMonth, cgtActual, cgtHyp, rows,
  });

  if (!silent) $('etfResults').scrollIntoView({ behavior: 'smooth', block: 'start' });

  saveToStorage({
    etfIncome: income, etfAcquired: acquired,
    etfPurchaseMonth: purchaseMonth, etfPurchaseYear: purchaseYear,
    etfAmount: costBase, etfGrowth: parseFloat($('etfGrowth').value) || 0,
    etfDividend: parseFloat($('etfDividend').value) || 0,
    etfFranking: parseFloat($('etfFranking').value) || 0,
    etfInflation: parseFloat($('etfInflation').value) || 0,
    etfYears: holdingYears,
  });
}

function renderEtfResults({
  costBase, growthRate, holdingYears, marginalRate, inflationRate,
  salePrice, dividendYield, frankingPct, acquired,
  purchaseYear, purchaseMonth, cgtActual, cgtHyp, rows,
}) {
  const diff       = cgtActual.cgtLiability - cgtHyp.cgtLiability;
  const isBetter   = diff < -1;
  const isWorse    = diff > 1;
  const isNoChange = acquired === 'pre-budget' && cgtActual.split === false;

  /* ── Split breakdown banner (pre-budget, selling after transition) ── */
  const postTransitionNote = (cgtActual.split && cgtActual.postTransitionGain === 0)
    ? ' <span class="muted" style="font-size:0.82rem">(indexation fully offsets post-transition growth)</span>'
    : '';
  const splitHTML = (acquired === 'pre-budget' && cgtActual.split) ? `
    <div class="breakeven-row">
      <strong>How your gain is split at 1 July 2027</strong>
      <span class="muted" style="font-size:0.82rem;margin-left:8px">based on ${(growthRate * 100).toFixed(1)}% p.a. assumed growth</span><br>
      Growth to 1 Jul 2027&nbsp;(${cgtActual.yearsToTransition.toFixed(1)} yrs):
        <strong>$${formatMoney(cgtActual.preTransitionGain)}</strong> →
        50% discount → <strong>$${formatMoney(cgtActual.preTransitionCgt)}&nbsp;CGT</strong><br>
      Growth after 1 Jul 2027&nbsp;(${cgtActual.yearsAfterTransition.toFixed(1)} yrs):
        <strong>$${formatMoney(cgtActual.postTransitionGain)}</strong> →
        indexation → <strong>$${formatMoney(cgtActual.postTransitionCgt)}&nbsp;CGT</strong>${postTransitionNote}
    </div>` : '';

  /* ── Grandfathered / no-change notice ── */
  const noChangeHTML = isNoChange ? `
    <div class="notice-banner">
      ✓ Your holding period ends before 1&nbsp;July 2027 — the full 50% CGT discount applies.
      No CGT impact from the budget for this scenario.
    </div>` : '';

  /* ── Summary cards ── */
  const oldLabel    = acquired === 'post-budget' ? 'Old rules (50% discount)' : 'Without budget change';
  const newLabel    = acquired === 'post-budget' ? 'New CGT (indexation)'     : 'Actual CGT (split rules)';
  const impactClass = isNoChange ? '' : isBetter ? 'card-better' : isWorse ? 'card-worse' : '';
  const impactVal   = isNoChange
    ? 'No change'
    : (isBetter ? '−$' : '+$') + formatMoney(Math.abs(diff));
  const impactSub   = isNoChange
    ? 'Selling before 1 Jul 2027'
    : isBetter ? 'CGT saving from indexation' : 'Extra CGT under new rules';

  const oldEffRate = (cgtHyp.effectiveRate * 100).toFixed(1);
  const newEffRate = ((cgtActual.effectiveRate || 0) * 100).toFixed(1);

  /* ── Taxable gain row ── */
  const taxableGainNew = acquired === 'post-budget'
    ? '$' + formatMoney(cgtActual.indexedGain || 0)
    : (cgtActual.split
        ? '$' + formatMoney((cgtActual.preTransitionGain || 0) * 0.5 + (cgtActual.postTransitionGain || 0)) + ' (split)'
        : '$' + formatMoney((cgtHyp.taxableGain || 0)));

  const html = `
    ${noChangeHTML}${splitHTML}
    <div class="summary-cards cols-3">
      <div class="summary-card card-old">
        <div class="card-label">${oldLabel}</div>
        <div class="card-value">$${formatMoney(cgtHyp.cgtLiability)}</div>
        <div class="card-sub">Eff. rate ${oldEffRate}% of gain</div>
      </div>
      <div class="summary-card card-new">
        <div class="card-label">${newLabel}</div>
        <div class="card-value">$${formatMoney(cgtActual.cgtLiability)}</div>
        <div class="card-sub">Eff. rate ${newEffRate}% of gain</div>
      </div>
      <div class="summary-card ${impactClass}">
        <div class="card-label">Budget impact</div>
        <div class="card-value">${impactVal}</div>
        <div class="card-sub">${impactSub}</div>
      </div>
    </div>

    <div class="chart-card">
      <h3>CGT liability by holding period — old rules vs. actual</h3>
      <canvas id="etfChartCanvas"></canvas>
    </div>

    <div class="chart-card">
      <h3>Investment value after CGT — old rules vs. actual</h3>
      <canvas id="etfWorthChartCanvas"></canvas>
    </div>

    <div class="rate-table-card">
      <h3>At ${holdingYears}-year exit — key figures</h3>
      <table class="kv-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th class="num">Old rules</th>
            <th class="num">Budget rules</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Sale price</td>
              <td class="num">$${formatMoney(salePrice)}</td>
              <td class="num">$${formatMoney(salePrice)}</td></tr>
          <tr><td>Nominal gain</td>
              <td class="num">$${formatMoney(cgtHyp.nominalGain)}</td>
              <td class="num">$${formatMoney(cgtActual.nominalGain || cgtHyp.nominalGain)}</td></tr>
          <tr><td>Taxable / indexed gain</td>
              <td class="num">$${formatMoney(cgtHyp.taxableGain || 0)}</td>
              <td class="num">${taxableGainNew}</td></tr>
          <tr><td>CGT payable</td>
              <td class="num">$${formatMoney(cgtHyp.cgtLiability)}</td>
              <td class="num ${isWorse ? 'fail' : isBetter ? 'pass' : ''}">
                $${formatMoney(cgtActual.cgtLiability)}</td></tr>
          <tr><td>Effective rate on gain</td>
              <td class="num">${oldEffRate}%</td>
              <td class="num">${newEffRate}%</td></tr>
          <tr><td>Marginal tax rate</td>
              <td class="num muted">${(marginalRate * 100).toFixed(0)}%</td>
              <td class="num muted">${(marginalRate * 100).toFixed(0)}%</td></tr>
        </tbody>
      </table>
    </div>`;

  $('etfResults').innerHTML = html;
  drawEtfChart(rows, acquired, purchaseYear, holdingYears);
  requestAnimationFrame(() => drawEtfWorthChart(rows, acquired));
}

function drawEtfChart(rows, acquired, purchaseYear, holdingYears) {
  if (etfChart) etfChart.destroy();
  const canvas = $('etfChartCanvas');
  if (!canvas) return;
  const c      = cc();
  const labels = rows.map(r => 'Yr ' + r.year);

  etfChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Old rules (50% discount)',
          data: rows.map(r => Math.round(r.cgtHypothetical)),
          borderColor: c.muted,
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: acquired === 'pre-budget' ? 'Actual (split at 1 Jul 2027)' : 'New rules (indexation)',
          data: rows.map(r => Math.round(r.cgtActual)),
          borderColor: c.accent,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: c.text, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString('en-AU')}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: c.text, maxTicksLimit: 10 }, grid: { color: c.grid } },
        y: {
          afterFit: scale => { scale.width = 88; },
          ticks: {
            color: c.text, maxTicksLimit: 6,
            callback: v => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v),
          },
          grid: { color: c.grid },
        },
      },
    },
  });
}

function drawEtfWorthChart(rows, acquired) {
  if (etfWorthChart) etfWorthChart.destroy();
  const canvas = $('etfWorthChartCanvas');
  if (!canvas) return;
  const c      = cc();
  const labels = rows.map(r => 'Yr ' + r.year);

  etfWorthChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Old rules (50% discount)',
          data: rows.map(r => Math.round(r.salePrice - r.cgtHypothetical)),
          borderColor: c.muted,
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: acquired === 'pre-budget' ? 'Actual (split at 1 Jul 2027)' : 'New rules (indexation)',
          data: rows.map(r => Math.round(r.salePrice - r.cgtActual)),
          borderColor: c.accent,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: c.text, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString('en-AU')}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: c.text, maxTicksLimit: 10 }, grid: { color: c.grid } },
        y: {
          afterFit: scale => { scale.width = 88; },
          ticks: {
            color: c.text, maxTicksLimit: 6,
            callback: v => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v),
          },
          grid: { color: c.grid },
        },
      },
    },
  });
}

/* ══════════════════════════════════════════
   PROPERTY CALCULATION
══════════════════════════════════════════ */
function calcProperty(silent = false) {
  const income        = parseMoney($('propIncome'));
  const propType      = $('propType').value;
  const purchasePrice = parseMoney($('propPrice'));
  const rentalIncome  = parseMoney($('propRental'));
  const loanAmount    = parseMoney($('propLoan'));
  const interestRate  = (parseFloat($('propRate').value)       || 0) / 100;
  const maintenance   = parseMoney($('propMaintenance'));
  const growthRate    = (parseFloat($('propGrowth').value)     || 0) / 100;
  const inflationRate = (parseFloat($('propInflation').value)  || 0) / 100;
  const holdingYears  = parseInt($('propYears').value);
  const marginalRate  = marginalRate2627(income);
  const purchaseMonth = parseInt($('propPurchaseMonth').value) || 1;
  const purchaseYear  = parseInt($('propPurchaseYear').value)  || 2020;

  const restricted    = propType === 'established-new';
  const grandfathered = propType === 'grandfathered';

  const proj = calcPropertyProjection({
    purchasePrice, rentalIncome, interestRate, loanAmount,
    maintenance, marginalRate, inflationRate, years: holdingYears,
    restricted, growthRate, grandfathered, purchaseYear, purchaseMonth,
  });

  /* Grandfathered: split CGT (50% disc to Jul 2027, indexation after).
     New build: investor can choose 50% discount OR indexation — use whichever is lower.
     Established: indexation + 30% min (carry-forward reduces the gain). */
  const isNewbuild    = propType === 'newbuild';
  const cgtNewDisplay = grandfathered
    ? (proj.cgtSplitDetail?.cgtLiability ?? proj.cgtOld)
    : isNewbuild ? Math.min(proj.cgtOld, proj.cgtNew)
    :              proj.cgtNew;

  renderPropertyResults({
    propType, purchasePrice, rentalIncome, loanAmount, interestRate,
    maintenance, growthRate, inflationRate, holdingYears, marginalRate,
    restricted, grandfathered, isNewbuild, proj, cgtNewDisplay,
  });

  if (!silent) $('propResults').scrollIntoView({ behavior: 'smooth', block: 'start' });

  saveToStorage({
    propIncome: income, propType,
    propPurchaseMonth: purchaseMonth, propPurchaseYear: purchaseYear,
    propPrice: purchasePrice, propRental: rentalIncome, propLoan: loanAmount,
    propRate:   parseFloat($('propRate').value)      || 0,
    propMaintenance: maintenance,
    propGrowth:      parseFloat($('propGrowth').value)    || 0,
    propInflation:   parseFloat($('propInflation').value) || 0,
    propYears: holdingYears,
  });
}

function renderPropertyResults({
  propType, purchasePrice, rentalIncome, loanAmount, interestRate,
  maintenance, growthRate, inflationRate, holdingYears, marginalRate,
  restricted, grandfathered, isNewbuild, proj, cgtNewDisplay,
}) {
  const annualInterest    = loanAmount * interestRate;
  const netPos            = rentalIncome - annualInterest - maintenance;
  const isNegGeared       = netPos < 0;
  const annualTaxSavingOld= isNegGeared ? Math.abs(netPos) * marginalRate : 0;
  const annualTaxSavingNew= (isNegGeared && restricted) ? 0 : annualTaxSavingOld;

  const negGearingImpact  = proj.taxSavingDiff;
  const cgtSplitDetail    = proj.cgtSplitDetail;
  const hasSplit          = grandfathered && cgtSplitDetail?.split;
  // Grandfathered: impact = split CGT minus what 50% discount would have been (0 before Jul 2027)
  // New build: investor picks cheaper option, never worse off
  const cgtImpact = grandfathered
    ? (cgtSplitDetail?.cgtLiability ?? proj.cgtOld) - proj.cgtOld
    : isNewbuild ? Math.min(0, proj.cgtDiff)
    :              proj.cgtDiff;
  const totalImpact = negGearingImpact + cgtImpact;

  /* ── Split breakdown banner for grandfathered properties ── */
  const postTransitionNote = (hasSplit && cgtSplitDetail.postTransitionGain === 0)
    ? ' <span class="muted" style="font-size:0.82rem">(indexation fully offsets post-transition growth)</span>'
    : '';
  const propSplitHTML = hasSplit ? `
    <div class="breakeven-row">
      <strong>How your gain is split at 1 July 2027</strong>
      <span class="muted" style="font-size:0.82rem;margin-left:8px">based on ${(growthRate * 100).toFixed(1)}% p.a. assumed growth</span><br>
      Growth to 1 Jul 2027&nbsp;(${cgtSplitDetail.yearsToTransition.toFixed(1)} yrs):
        <strong>$${formatMoney(cgtSplitDetail.preTransitionGain)}</strong> →
        50% discount → <strong>$${formatMoney(cgtSplitDetail.preTransitionCgt)}&nbsp;CGT</strong><br>
      Growth after 1 Jul 2027&nbsp;(${cgtSplitDetail.yearsAfterTransition.toFixed(1)} yrs):
        <strong>$${formatMoney(cgtSplitDetail.postTransitionGain)}</strong> →
        indexation → <strong>$${formatMoney(cgtSplitDetail.postTransitionCgt)}&nbsp;CGT</strong>${postTransitionNote}
    </div>` : '';

  /* ── Banners ── */
  const banner = grandfathered
    ? `<div class="notice-banner${hasSplit ? ' warn' : ''}">
        ${hasSplit
          ? '⚠ Grandfathered property — full negative gearing deductions retained. CGT uses split rules: 50% discount on gains to 1 July 2027, then indexation on gains after.'
          : '✓ Grandfathered property — full negative gearing deductions retained. Selling before 1 July 2027: full 50% CGT discount applies, no budget impact.'}
       </div>`
    : propType === 'newbuild'
    ? `<div class="notice-banner warn">
        ⚠ New builds are exempt from the negative gearing restriction — full deductions retained.
        On exit you can choose between the 50% CGT discount or indexation — this calculator shows both options below.
       </div>`
    : `<div class="notice-banner warn">
        ⚠ Established property purchased after 12 May 2026 — rental losses cannot be offset against
        salary from 1 July 2027. Losses are quarantined until property is sold.
       </div>`;

  /* ── Card classes ── */
  const ngNewClass  = (isNegGeared && restricted) ? 'card-worse' : 'card-new';
  const cgtNewClass = cgtImpact > 0 && !isNewbuild ? 'card-worse' : 'card-new';

  /* ── Sub-text for cards ── */
  const ngNewSub = restricted && isNegGeared
    ? 'Yr 1 deductible; losses carried forward'
    : grandfathered ? 'Grandfathered' : 'Full deduction retained';
  const cgtNewSub = grandfathered
    ? (hasSplit ? 'Split: 50% disc. to Jul 2027, indexation after' : 'Selling before Jul 2027 — 50% discount')
    : isNewbuild
      ? (proj.cgtNew <= proj.cgtOld ? 'Indexation chosen (better)' : '50% discount chosen (better)')
      : 'Indexation + carry-fwd offset';

  const html = `
    ${banner}${propSplitHTML}
    <div class="summary-cards cols-4">
      <div class="summary-card card-old">
        <div class="card-label">Annual tax saving (old)</div>
        <div class="card-value">$${formatMoney(annualTaxSavingOld)}</div>
        <div class="card-sub">${isNegGeared ? 'Neg. gearing benefit' : 'Positively geared'}</div>
      </div>
      <div class="summary-card ${ngNewClass}">
        <div class="card-label">${restricted && isNegGeared ? 'Yr 2+ tax saving (new)' : 'Annual tax saving (new)'}
          ${restricted && isNegGeared ? `<span class="tip" data-tip="Year 1: losses are still deductible against all income (before 1 July 2027). From year 2, losses are quarantined and carried forward to offset future rental income or the capital gain on exit.">?</span>` : ''}
        </div>
        <div class="card-value">$${formatMoney(annualTaxSavingNew)}</div>
        <div class="card-sub">${ngNewSub}</div>
      </div>
      ${isNewbuild ? `
      <div class="summary-card ${proj.cgtOld <= proj.cgtNew ? 'card-new' : 'card-old'}">
        <div class="card-label">CGT: 50% discount${proj.cgtOld <= proj.cgtNew ? ' <span class="best-badge">Best</span>' : ''}</div>
        <div class="card-value">$${formatMoney(proj.cgtOld)}</div>
        <div class="card-sub">${holdingYears}-yr hold</div>
      </div>
      <div class="summary-card ${proj.cgtNew < proj.cgtOld ? 'card-new' : 'card-old'}">
        <div class="card-label">CGT: indexation${proj.cgtNew < proj.cgtOld ? ' <span class="best-badge">Best</span>' : ''}</div>
        <div class="card-value">$${formatMoney(proj.cgtNew)}</div>
        <div class="card-sub">${holdingYears}-yr hold</div>
      </div>` : `
      <div class="summary-card card-old">
        <div class="card-label">CGT on exit (old)</div>
        <div class="card-value">$${formatMoney(proj.cgtOld)}</div>
        <div class="card-sub">50% discount, ${holdingYears}-yr hold</div>
      </div>
      <div class="summary-card ${cgtNewClass}">
        <div class="card-label">CGT on exit (new)</div>
        <div class="card-value">$${formatMoney(cgtNewDisplay)}</div>
        <div class="card-sub">${cgtNewSub}</div>
      </div>`}
    </div>

    ${(!grandfathered || hasSplit) ? `
    <div class="impact-banner">
      <div class="impact-label">Total budget impact over ${holdingYears} years</div>
      <div class="impact-total${totalImpact <= 0 ? ' positive' : ''}">
        ${totalImpact > 0 ? '+$' : totalImpact < 0 ? '−$' : '$'}${formatMoney(Math.abs(totalImpact))}
        ${totalImpact > 0 ? 'worse off' : totalImpact < 0 ? 'better off' : 'no change'}
      </div>
      <div class="impact-detail">
        Lost tax savings: $${formatMoney(negGearingImpact)}
        &nbsp;|&nbsp;
        Extra CGT on exit: $${formatMoney(Math.max(0, cgtImpact))}
      </div>
    </div>` : ''}

    ${!grandfathered && !isNewbuild ? `
    <div class="chart-card">
      <h3>Cumulative tax savings — old rules vs. new rules</h3>
      <canvas id="propChartCanvas"></canvas>
    </div>` : ''}

    <div class="chart-card">
      <h3>${isNewbuild ? 'Investment value after CGT — 50% discount vs. indexation' : 'Investment value after CGT — old rules vs. actual'}</h3>
      <canvas id="propWorthChartCanvas"></canvas>
    </div>

    <details class="year-details" id="propYearDetails">
      <summary>Year-by-year breakdown</summary>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th>Rental income</th>
              <th>Interest</th>
              <th>Net position</th>
              <th>Tax saving (old)</th>
              <th>Tax saving (new)</th>
              <th>Annual diff</th>
              ${restricted ? '<th>Carry-forward</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${proj.rows.map(r => `
              <tr>
                <td>${r.year}</td>
                <td>$${formatMoney(r.rentalIncome)}</td>
                <td>$${formatMoney(r.annualInterest)}</td>
                <td class="${r.netPosition < 0 ? 'fail-cell' : 'pass-cell'}">
                  ${r.netPosition < 0 ? '-' : '+'}$${formatMoney(Math.abs(r.netPosition))}
                </td>
                <td class="pass-cell">$${formatMoney(r.taxSavingOld)}</td>
                <td class="${r.taxSavingNew === 0 && restricted ? 'fail-cell' : 'pass-cell'}">
                  $${formatMoney(r.taxSavingNew)}
                </td>
                <td class="${r.annualDiff > 0 ? 'fail-cell' : ''}">
                  ${r.annualDiff > 0 ? '-$' : '$'}${formatMoney(Math.abs(r.annualDiff))}
                </td>
                ${restricted ? `<td class="${r.carryForwardBalance > 0 ? 'warn-cell' : ''}">${r.carryForwardBalance > 0 ? '$' + formatMoney(r.carryForwardBalance) : '—'}</td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>`;

  $('propResults').innerHTML = html;
  if (!grandfathered && !isNewbuild) {
    drawPropChart(proj, restricted, grandfathered);
    requestAnimationFrame(() => drawPropWorthChart(proj, grandfathered, isNewbuild));
  } else {
    if (propChart) { propChart.destroy(); propChart = null; }
    drawPropWorthChart(proj, grandfathered, isNewbuild);
  }

  const det = $('propYearDetails');
  if (det) det.addEventListener('toggle', () => {
    if (propChart)      propChart.resize();
    if (propWorthChart) propWorthChart.resize();
  });
}

function drawPropChart(proj, restricted, grandfathered) {
  if (propChart) propChart.destroy();
  const canvas = $('propChartCanvas');
  if (!canvas) return;
  const c = cc();

  propChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: proj.rows.map(r => 'Yr ' + r.year),
      datasets: [
        {
          label: 'Old rules (full deduction)',
          data: proj.rows.map(r => Math.round(r.cumTaxSavedOld)),
          borderColor: c.muted,
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: grandfathered ? 'New rules (same — grandfathered)' : 'New rules (budget)',
          data: proj.rows.map(r => Math.round(r.cumTaxSavedNew)),
          borderColor: grandfathered ? c.pass : c.accent,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: c.text, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString('en-AU')}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: c.text, maxTicksLimit: 10 }, grid: { color: c.grid } },
        y: {
          afterFit: scale => { scale.width = 88; },
          ticks: {
            color: c.text, maxTicksLimit: 6,
            callback: v => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v),
          },
          grid: { color: c.grid },
        },
      },
    },
  });
}

function drawPropWorthChart(proj, grandfathered, isNewbuild) {
  if (propWorthChart) propWorthChart.destroy();
  const canvas = $('propWorthChartCanvas');
  if (!canvas) return;
  const c = cc();

  propWorthChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: proj.rows.map(r => 'Yr ' + r.year),
      datasets: [
        {
          label: isNewbuild ? '50% Discount option' : 'Old rules (50% discount)',
          data: proj.rows.map(r => Math.round(r.salePrice - r.cgtOld)),
          borderColor: c.muted,
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: isNewbuild ? 'Indexation option' : (grandfathered ? 'Actual (split at 1 Jul 2027)' : 'New rules (indexation)'),
          data: proj.rows.map(r => Math.round(r.salePrice - (grandfathered ? (r.cgtSplit ?? r.cgtOld) : r.cgtNew))),
          borderColor: c.accent,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: c.text, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString('en-AU')}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: c.text, maxTicksLimit: 10 }, grid: { color: c.grid } },
        y: {
          afterFit: scale => { scale.width = 88; },
          ticks: {
            color: c.text, maxTicksLimit: 6,
            callback: v => '$' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v),
          },
          grid: { color: c.grid },
        },
      },
    },
  });
}

/* ══════════════════════════════════════════
   LOCAL STORAGE
══════════════════════════════════════════ */
function saveToStorage(patch) {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...patch }));
  } catch (e) {}
}

function loadFromStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch (e) { return {}; }
}

function applyStoredValues(s) {
  const money = new Set(['etfIncome','etfAmount','propIncome','propPrice','propRental','propLoan','propMaintenance']);
  Object.entries(s).forEach(([k, v]) => {
    const el = $(k);
    if (!el || v == null) return;
    el.value = money.has(k) ? Number(v).toLocaleString('en-AU') : v;
  });
}

/* ══════════════════════════════════════════
   RESET
══════════════════════════════════════════ */
const MONEY_IDS = new Set(['etfIncome','etfAmount','propIncome','propPrice','propRental','propLoan','propMaintenance']);

function resetEtf() {
  Object.keys(DEFAULTS).filter(k => k.startsWith('etf')).forEach(k => {
    const el = $(k);
    if (el) el.value = MONEY_IDS.has(k) ? Number(DEFAULTS[k]).toLocaleString('en-AU') : DEFAULTS[k];
  });
  updateEtfAcquiredUI();
  updateDerived();
  if (etfChart) { etfChart.destroy(); etfChart = null; }
  if (etfWorthChart) { etfWorthChart.destroy(); etfWorthChart = null; }
  $('etfResults').innerHTML = '<div class="results-placeholder"><p>Enter your details and click <strong>Calculate Impact</strong> to see how the 2026-27 Budget affects your CGT liability.</p></div>';
}

function resetProp() {
  Object.keys(DEFAULTS).filter(k => k.startsWith('prop')).forEach(k => {
    const el = $(k);
    if (el) el.value = MONEY_IDS.has(k) ? Number(DEFAULTS[k]).toLocaleString('en-AU') : DEFAULTS[k];
  });
  updatePropTypeUI();
  updateDerived();
  if (propChart) { propChart.destroy(); propChart = null; }
  if (propWorthChart) { propWorthChart.destroy(); propWorthChart = null; }
  $('propResults').innerHTML = '<div class="results-placeholder"><p>Enter your property details and click <strong>Calculate Impact</strong> to see how the 2026-27 Budget affects your investment returns.</p></div>';
}

/* ══════════════════════════════════════════
   EVENT BINDING
══════════════════════════════════════════ */
function bindEvents() {
  /* Tabs */
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  /* Money inputs */
  bindMoneyInputs();

  /* Number inputs → derived update only */
  ['etfGrowth','etfDividend','etfFranking','etfInflation',
   'propRate','propGrowth','propInflation'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', updateDerived);
  });

  /* Acquired select → show/hide date field */
  $('etfAcquired').addEventListener('change', () => {
    updateEtfAcquiredUI();
    updateDerived();
  });

  /* Purchase date fields */
  $('etfPurchaseMonth').addEventListener('change', () => {
    updateEtfTransitionNote(); updateDerived();
  });
  $('etfPurchaseYear').addEventListener('input', () => {
    updateEtfTransitionNote(); updateDerived();
  });

  /* Sliders */
  $('etfYears').addEventListener('input', updateDerived);
  $('propYears').addEventListener('input', updateDerived);

  /* Property type + purchase date (grandfathered) */
  $('propType').addEventListener('change', () => { updatePropTypeUI(); updateDerived(); });
  $('propPurchaseMonth').addEventListener('change', () => { updatePropTransitionNote(); updateDerived(); });
  $('propPurchaseYear').addEventListener('input',  () => { updatePropTransitionNote(); updateDerived(); });

  /* Calculate */
  $('btnCalcEtf').addEventListener('click',  () => calcEtf());
  $('btnCalcProp').addEventListener('click', () => calcProperty());

  /* Reset */
  $('btnResetEtf').addEventListener('click',  resetEtf);
  $('btnResetProp').addEventListener('click', resetProp);
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
function init() {
  const stored = loadFromStorage();
  applyStoredValues(stored);
  if (stored.activeTab) switchTab(stored.activeTab);

  updateEtfAcquiredUI();
  updatePropTypeUI();
  updateDerived();
  bindEvents();

  /* Auto-calculate on return visit if stored state exists */
  if (Object.keys(stored).length > 2) {
    calcEtf(true);
    calcProperty(true);
  }
}

init();
