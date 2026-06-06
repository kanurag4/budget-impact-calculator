'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeClassList {
  constructor(initial = '') {
    this.items = new Set(initial ? initial.split(/\s+/).filter(Boolean) : []);
  }

  add(name) { this.items.add(name); }
  remove(name) { this.items.delete(name); }
  contains(name) { return this.items.has(name); }
  toggle(name, force) {
    const shouldAdd = force === undefined ? !this.items.has(name) : Boolean(force);
    if (shouldAdd) this.items.add(name);
    else this.items.delete(name);
    return shouldAdd;
  }

  toString() { return [...this.items].join(' '); }
}

class FakeElement {
  constructor(id, document) {
    this.id = id;
    this.document = document;
    this.value = '';
    this.textContent = '';
    this.style = {};
    this.dataset = {};
    this.listeners = {};
    this.selectionStart = 0;
    this.classList = new FakeClassList();
    this._className = '';
    this._innerHTML = '';
  }

  get className() { return this._className; }
  set className(value) {
    this._className = value;
    this.classList = new FakeClassList(value);
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value);
    const ids = [...this._innerHTML.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
    for (const id of ids) this.document.ensureElement(id);
  }

  addEventListener(type, handler) { this.listeners[type] = handler; }
  setSelectionRange(start) { this.selectionStart = start; }
  scrollIntoView() {}
  resize() {}
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.documentElement = this.ensureElement('html');
    this.documentElement.className = 'dark';

    this.tabButtons = ['etf', 'property'].map(tab => {
      const el = new FakeElement(`tab-${tab}`, this);
      el.dataset.tab = tab;
      if (tab === 'etf') el.className = 'tab-btn active';
      else el.className = 'tab-btn';
      return el;
    });
    this.tabPanels = ['panel-etf', 'panel-property'].map(id => {
      const el = this.ensureElement(id);
      el.className = id === 'panel-etf' ? 'tab-panel' : 'tab-panel hidden';
      return el;
    });
  }

  ensureElement(id) {
    if (!this.elements.has(id)) this.elements.set(id, new FakeElement(id, this));
    return this.elements.get(id);
  }

  getElementById(id) { return this.ensureElement(id); }

  querySelectorAll(selector) {
    if (selector === '.tab-btn') return this.tabButtons;
    if (selector === '.tab-panel') return this.tabPanels;
    return [];
  }
}

function loadApp() {
  const document = new FakeDocument();
  const storage = new Map();
  const chartCalls = [];

  const context = vm.createContext({
    console,
    document,
    window: { kvTheme: { toggle() {} } },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    requestAnimationFrame(fn) { fn(); },
    Chart: function Chart(canvas, config) {
      assert.ok(canvas, 'Chart received canvas');
      for (const dataset of config.data.datasets) {
        for (const point of dataset.data) {
          assert.ok(Number.isFinite(point), `${dataset.label} contains non-finite point ${point}`);
        }
      }
      chartCalls.push(config);
      this.destroy = function destroy() {};
      this.resize = function resize() {};
    },
  });

  const ids = [
    'etfIncome', 'etfMarginalRate', 'etfAcquired', 'etfAcquiredNote', 'etfPurchaseDateField',
    'etfPurchaseMonth', 'etfPurchaseYear', 'etfTransitionNote', 'etfAmount', 'etfGrowth',
    'etfDividend', 'etfFranking', 'etfInflation', 'etfYears', 'etfYearsLabel', 'etfSellYear',
    'btnCalcEtf', 'btnResetEtf', 'etfResults',
    'propIncome', 'propMarginalRate', 'propType', 'propTypeNote', 'propPurchaseDateField',
    'propPurchaseMonth', 'propPurchaseYear', 'propTransitionNote', 'propPrice', 'propRental',
    'propRentalYield', 'propLoan', 'propRate', 'propInterestAmt', 'propMaintenance',
    'propNetPosition', 'propGrowth', 'propInflation', 'propYears', 'propYearsLabel',
    'propSellYear', 'btnCalcProp', 'btnResetProp', 'propResults',
  ];
  for (const id of ids) document.ensureElement(id);

  Object.assign(document.getElementById('etfIncome'), { value: '120,000' });
  Object.assign(document.getElementById('etfAcquired'), { value: 'pre-budget' });
  Object.assign(document.getElementById('etfPurchaseMonth'), { value: '9' });
  Object.assign(document.getElementById('etfPurchaseYear'), { value: '2025' });
  Object.assign(document.getElementById('etfAmount'), { value: '50,000' });
  Object.assign(document.getElementById('etfGrowth'), { value: '7' });
  Object.assign(document.getElementById('etfDividend'), { value: '3' });
  Object.assign(document.getElementById('etfFranking'), { value: '70' });
  Object.assign(document.getElementById('etfInflation'), { value: '2' });
  Object.assign(document.getElementById('etfYears'), { value: '10' });

  Object.assign(document.getElementById('propIncome'), { value: '120,000' });
  Object.assign(document.getElementById('propType'), { value: 'established-new' });
  Object.assign(document.getElementById('propPurchaseMonth'), { value: '1' });
  Object.assign(document.getElementById('propPurchaseYear'), { value: '2020' });
  Object.assign(document.getElementById('propPrice'), { value: '700,000' });
  Object.assign(document.getElementById('propRental'), { value: '24,000' });
  Object.assign(document.getElementById('propLoan'), { value: '560,000' });
  Object.assign(document.getElementById('propRate'), { value: '6.5' });
  Object.assign(document.getElementById('propMaintenance'), { value: '5,000' });
  Object.assign(document.getElementById('propGrowth'), { value: '5' });
  Object.assign(document.getElementById('propInflation'), { value: '2' });
  Object.assign(document.getElementById('propYears'), { value: '10' });

  for (const script of ['utils.js', 'calc/tax.js', 'calc/cgt.js', 'calc/property.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', script), 'utf8'), context, { filename: script });
  }

  return { context, document, chartCalls };
}

function assertNoBadRenderedNumbers(html, label) {
  assert.equal(/(?:NaN|Infinity|undefined)/.test(html), false, `${label} rendered a bad numeric token`);
}

function setValues(document, values) {
  for (const [id, value] of Object.entries(values)) {
    document.getElementById(id).value = String(value);
  }
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

test('app initializes and default calculations render finite chart data', () => {
  const { context, document, chartCalls } = loadApp();
  context.calcEtf(true);
  context.calcProperty(true);
  assertNoBadRenderedNumbers(document.getElementById('etfResults').innerHTML, 'ETF default results');
  assertNoBadRenderedNumbers(document.getElementById('propResults').innerHTML, 'property default results');
  assert.ok(chartCalls.length >= 4);
});

test('ETF UI calculation handles min/max and transition boundary scenarios', () => {
  const { context, document } = loadApp();

  setValues(document, {
    etfIncome: '18,200',
    etfAcquired: 'post-budget',
    etfAmount: '0',
    etfGrowth: '0',
    etfInflation: '10',
    etfYears: '1',
  });
  context.calcEtf(true);
  assertNoBadRenderedNumbers(document.getElementById('etfResults').innerHTML, 'ETF zero-cost scenario');

  setValues(document, {
    etfIncome: '190,001',
    etfAcquired: 'pre-budget',
    etfPurchaseMonth: '7',
    etfPurchaseYear: '2026',
    etfAmount: '1,000,000',
    etfGrowth: '30',
    etfInflation: '0',
    etfYears: '1',
  });
  context.calcEtf(true);
  const html = document.getElementById('etfResults').innerHTML;
  assertNoBadRenderedNumbers(html, 'ETF transition sale scenario');
  assert.match(html, /No change|Selling before 1 Jul 2027/);
});

test('property UI calculation handles each property type and extreme inputs', () => {
  const { context, document } = loadApp();

  for (const propType of ['established-new', 'newbuild', 'grandfathered']) {
    setValues(document, {
      propIncome: '190,001',
      propType,
      propPurchaseMonth: '1',
      propPurchaseYear: '2020',
      propPrice: '0',
      propRental: '0',
      propLoan: '0',
      propRate: '20',
      propMaintenance: '0',
      propGrowth: '0',
      propInflation: '10',
      propYears: '1',
    });
    context.updatePropTypeUI();
    context.calcProperty(true);
    assertNoBadRenderedNumbers(document.getElementById('propResults').innerHTML, `${propType} zero scenario`);
  }

  setValues(document, {
    propType: 'established-new',
    propPrice: '1,000,000',
    propRental: '1,000',
    propLoan: '1,000,000',
    propRate: '20',
    propMaintenance: '100,000',
    propGrowth: '20',
    propInflation: '0',
    propYears: '30',
  });
  context.calcProperty(true);
  assertNoBadRenderedNumbers(document.getElementById('propResults').innerHTML, 'property max-risk scenario');
});

console.log('All app smoke tests passed');
