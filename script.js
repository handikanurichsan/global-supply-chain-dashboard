/**
 * Global Supply Chain & Sales Dashboard — script.js
 * Data source: data.json (fetched via HTTP)
 * Charts: Chart.js 4.x
 * ─────────────────────────────────────────────────────────────
 * Architecture:
 *   1. fetchData()         — load data.json once
 *   2. populateFilters()   — build filter dropdowns from data
 *   3. getFilteredData()   — apply active filters to raw data
 *   4. renderAll()         — update KPIs + all charts
 *   5. Individual chart renderers (destroy-then-create pattern)
 */

'use strict';

/* ═══════════════════════════════════════════
   GLOBAL STATE
════════════════════════════════════════════ */
let rawData = [];           // full 2500-row dataset
let charts = {};            // registry: { chartId: ChartInstance }

/* Active filter values */
const filters = {
  region:    'All',
  category:  'All',
  customer:  'All',
  shipping:  'All',
};

/* ═══════════════════════════════════════════
   COLOUR PALETTE (consistent across charts)
════════════════════════════════════════════ */
const PALETTE = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444',
  '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1',
  '#14b8a6','#a855f7','#eab308','#64748b','#d946ef',
];

/** Returns a colour by cycling through the palette */
function color(i) { return PALETTE[i % PALETTE.length]; }

/** Semi-transparent version of a palette colour */
function colorA(i, a = 0.75) {
  const hex = PALETTE[i % PALETTE.length].replace('#','');
  const r = parseInt(hex.substring(0,2),16);
  const g = parseInt(hex.substring(2,4),16);
  const b = parseInt(hex.substring(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ═══════════════════════════════════════════
   UTILITY HELPERS
════════════════════════════════════════════ */

/** Format number as USD currency string */
function fmtUSD(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

/** Format integer with thousand separators */
function fmtNum(n) { return n.toLocaleString(); }

/** Aggregate array of objects by a key, summing a numeric field */
function groupSum(data, keyField, valueField) {
  const map = new Map();
  for (const row of data) {
    const k = row[keyField] || 'Unknown';
    const v = Number(row[valueField]) || 0;
    map.set(k, (map.get(k) || 0) + v);
  }
  return map;
}

/** Sort map entries descending by value, return [{label, value}] */
function sortedTop(map, n = Infinity) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, value]) => ({ label, value }));
}

/** Destroy an existing chart instance safely */
function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

/* ═══════════════════════════════════════════
   1. DATA LOADING
════════════════════════════════════════════ */
async function fetchData() {
  try {
    const res = await fetch('./data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    rawData = await res.json();

    // Show metadata in header
    const dates = rawData.map(r => r.order_date).sort();
    document.getElementById('last-updated').textContent =
      `${rawData.length.toLocaleString()} records · ${dates[0]} → ${dates[dates.length-1]}`;

    populateFilters();
    renderAll();
  } catch (err) {
    console.error('Failed to load data.json:', err);
    document.getElementById('error-banner').classList.remove('hidden');
    document.getElementById('error-detail').textContent =
      `Error: ${err.message}. Please serve this project via a local HTTP server ` +
      `(e.g., VS Code Live Server, or run "npx serve ." in this folder).`;
  }
}

/* ═══════════════════════════════════════════
   2. POPULATE FILTER DROPDOWNS
════════════════════════════════════════════ */
function populateFilters() {
  const selectors = {
    'filter-region':   'region',
    'filter-category': 'category',
    'filter-customer': 'customer_type',
    'filter-shipping': 'shipping_mode',
  };

  for (const [elId, field] of Object.entries(selectors)) {
    const select = document.getElementById(elId);
    const values = [...new Set(rawData.map(r => r[field]).filter(Boolean))].sort();
    values.forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });
  }
}

/* ═══════════════════════════════════════════
   3. APPLY FILTERS
════════════════════════════════════════════ */
function getFilteredData() {
  return rawData.filter(row => {
    if (filters.region   !== 'All' && row.region        !== filters.region)   return false;
    if (filters.category !== 'All' && row.category      !== filters.category) return false;
    if (filters.customer !== 'All' && row.customer_type !== filters.customer) return false;
    if (filters.shipping !== 'All' && row.shipping_mode !== filters.shipping) return false;
    return true;
  });
}

/* ═══════════════════════════════════════════
   4. MASTER RENDER — calls all sub-renderers
════════════════════════════════════════════ */
function renderAll() {
  const data = getFilteredData();
  renderKPIs(data);
  renderSalesTrend(data);
  renderRegionChart(data);
  renderMarketChart(data);
  renderCategoryRevenueChart(data);
  renderCategoryQtyChart(data);
  renderCustomerChart(data);
  renderPaymentChart(data);
  renderShippingChart(data);
  renderScatterChart(data);
  renderTopProducts(data);
}

/* ═══════════════════════════════════════════
   5a. KPI CARDS
════════════════════════════════════════════ */
function renderKPIs(data) {
  const totalRevenue     = data.reduce((s, r) => s + (r.sales  || 0), 0);
  const totalProfit      = data.reduce((s, r) => s + (r.profit || 0), 0);
  const totalTransactions = data.length;
  const totalQty         = data.reduce((s, r) => s + (r.quantity || 0), 0);
  const avgDiscount      = data.length
    ? data.reduce((s, r) => s + (r.discount || 0), 0) / data.length
    : 0;

  // Calculate % of total for sub-labels
  const pct = rawData.length ? ((data.length / rawData.length) * 100).toFixed(0) : 100;

  document.getElementById('kpi-revenue').textContent      = fmtUSD(totalRevenue);
  document.getElementById('kpi-revenue-sub').textContent  = `Across ${fmtNum(totalTransactions)} orders`;

  document.getElementById('kpi-profit').textContent       = fmtUSD(totalProfit);
  document.getElementById('kpi-profit-sub').textContent   =
    `Margin: ${totalRevenue ? ((totalProfit/totalRevenue)*100).toFixed(1) : 0}%`;

  document.getElementById('kpi-transactions').textContent     = fmtNum(totalTransactions);
  document.getElementById('kpi-transactions-sub').textContent = `${pct}% of dataset`;

  document.getElementById('kpi-quantity').textContent     = fmtNum(totalQty);
  document.getElementById('kpi-quantity-sub').textContent = `Avg ${(totalQty / (totalTransactions || 1)).toFixed(1)} units/order`;

  document.getElementById('kpi-discount').textContent     = avgDiscount.toFixed(1) + '%';
  document.getElementById('kpi-discount-sub').textContent = `Avg across filtered orders`;
}

/* ═══════════════════════════════════════════
   5b. SALES TREND (Monthly Line Chart)
════════════════════════════════════════════ */
function renderSalesTrend(data) {
  // Aggregate by YYYY-MM
  const monthMap = new Map();
  for (const row of data) {
    const ym = row.order_date.substring(0, 7); // YYYY-MM
    monthMap.set(ym, (monthMap.get(ym) || 0) + (row.sales || 0));
  }

  // Sort chronologically
  const sorted = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => Math.round(v * 100) / 100);

  destroyChart('salesTrend');
  const ctx = document.getElementById('chart-sales-trend').getContext('2d');
  charts.salesTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Monthly Sales (USD)',
        data: values,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        borderWidth: 2.5,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#3b82f6',
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + fmtUSD(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, maxTicksLimit: 24 }
        },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            font: { size: 11 },
            callback: v => fmtUSD(v)
          }
        }
      }
    }
  });
}

/* ═══════════════════════════════════════════
   5c. REVENUE BY REGION (Bar Chart, Top 10)
════════════════════════════════════════════ */
function renderRegionChart(data) {
  const top = sortedTop(groupSum(data, 'region', 'sales'), 10);

  destroyChart('region');
  const ctx = document.getElementById('chart-region').getContext('2d');
  charts.region = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(r => r.label),
      datasets: [{
        label: 'Revenue (USD)',
        data: top.map(r => r.value),
        backgroundColor: top.map((_, i) => colorA(i, 0.8)),
        borderColor:     top.map((_, i) => color(i)),
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + fmtUSD(ctx.parsed.y) } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#f1f5f9' }, ticks: { callback: v => fmtUSD(v), font: { size: 10 } } }
      }
    }
  });
}

/* ═══════════════════════════════════════════
   5d. REVENUE BY MARKET (Bar Chart)
════════════════════════════════════════════ */
function renderMarketChart(data) {
  const top = sortedTop(groupSum(data, 'market', 'sales'));

  destroyChart('market');
  const ctx = document.getElementById('chart-market').getContext('2d');
  charts.market = new Chart(ctx, {
    type: 'polarArea',
    data: {
      labels: top.map(r => r.label),
      datasets: [{
        label: 'Revenue (USD)',
        data: top.map(r => r.value),
        backgroundColor: top.map((_, i) => colorA(i, 0.75)),
        borderColor:     top.map((_, i) => color(i)),
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 10,
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${fmtUSD(ctx.parsed.r)}`
          }
        }
      },
      scales: {
        r: {
          grid: { color: '#e5e7eb' },
          ticks: {
            backdropColor: 'transparent',
            color: '#6b7280',
            font: { size: 9 },
            callback: v => fmtUSD(v),
            maxTicksLimit: 5,
          },
          pointLabels: { display: false },
        }
      }
    }
  });
}

/* ═══════════════════════════════════════════
   5e. REVENUE BY CATEGORY (Horizontal Bar, Top 10)
════════════════════════════════════════════ */
function renderCategoryRevenueChart(data) {
  const top = sortedTop(groupSum(data, 'category', 'sales'), 10);

  destroyChart('catRevenue');
  const ctx = document.getElementById('chart-category-revenue').getContext('2d');
  charts.catRevenue = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(r => r.label),
      datasets: [{
        label: 'Revenue (USD)',
        data: top.map(r => r.value),
        backgroundColor: top.map((_, i) => colorA(i, 0.8)),
        borderColor:     top.map((_, i) => color(i)),
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',   // ← horizontal bar
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + fmtUSD(ctx.parsed.x) } }
      },
      scales: {
        x: { grid: { color: '#f1f5f9' }, ticks: { callback: v => fmtUSD(v), font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

/* ═══════════════════════════════════════════
   5f. QUANTITY BY CATEGORY (Horizontal Bar, Top 10)
════════════════════════════════════════════ */
function renderCategoryQtyChart(data) {
  const top = sortedTop(groupSum(data, 'category', 'quantity'), 10);

  destroyChart('catQty');
  const ctx = document.getElementById('chart-category-qty').getContext('2d');
  charts.catQty = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(r => r.label),
      datasets: [{
        label: 'Quantity Sold',
        data: top.map(r => r.value),
        backgroundColor: top.map((_, i) => colorA(i + 5, 0.8)),
        borderColor:     top.map((_, i) => color(i + 5)),
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + fmtNum(ctx.parsed.x) + ' units' } }
      },
      scales: {
        x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

/* ═══════════════════════════════════════════
   5g. CUSTOMER TYPE (Doughnut)
════════════════════════════════════════════ */
function renderCustomerChart(data) {
  const agg = sortedTop(groupSum(data, 'customer_type', 'sales'));

  destroyChart('customer');
  const ctx = document.getElementById('chart-customer').getContext('2d');
  charts.customer = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: agg.map(r => r.label),
      datasets: [{
        data: agg.map(r => r.value),
        backgroundColor: agg.map((_, i) => colorA(i, 0.85)),
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtUSD(ctx.parsed)}` } }
      }
    }
  });
}

/* ═══════════════════════════════════════════
   5h. PAYMENT METHOD (Doughnut)
════════════════════════════════════════════ */
function renderPaymentChart(data) {
  const agg = sortedTop(groupSum(data, 'payment_method', 'sales'));

  destroyChart('payment');
  const ctx = document.getElementById('chart-payment').getContext('2d');
  charts.payment = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: agg.map(r => r.label),
      datasets: [{
        data: agg.map(r => r.value),
        backgroundColor: agg.map((_, i) => colorA(i + 3, 0.85)),
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtUSD(ctx.parsed)}` } }
      }
    }
  });
}

/* ═══════════════════════════════════════════
   5i. SHIPPING MODE (Pie)
════════════════════════════════════════════ */
function renderShippingChart(data) {
  const agg = sortedTop(groupSum(data, 'shipping_mode', 'quantity'));

  destroyChart('shipping');
  const ctx = document.getElementById('chart-shipping').getContext('2d');
  charts.shipping = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: agg.map(r => r.label),
      datasets: [{
        data: agg.map(r => r.value),
        backgroundColor: agg.map((_, i) => colorA(i + 7, 0.85)),
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtNum(ctx.parsed)} units` } }
      }
    }
  });
}

/* ═══════════════════════════════════════════
   5j. DISCOUNT vs SALES (Scatter)
   — cap at 500 random points for performance
════════════════════════════════════════════ */
function renderScatterChart(data) {
  // Sample max 500 points to keep the browser light
  let sample = data;
  if (data.length > 500) {
    // Deterministic subsample (every Nth row)
    const step = Math.floor(data.length / 500);
    sample = data.filter((_, i) => i % step === 0).slice(0, 500);
  }

  const points = sample.map(r => ({ x: r.discount || 0, y: r.sales || 0 }));

  destroyChart('scatter');
  const ctx = document.getElementById('chart-scatter').getContext('2d');
  charts.scatter = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Orders',
        data: points,
        backgroundColor: 'rgba(99, 102, 241, 0.45)',
        pointRadius: 4,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `Discount: ${ctx.parsed.x}% | Sales: ${fmtUSD(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Discount Rate (%)', font: { size: 12 } },
          grid: { color: '#f1f5f9' },
          ticks: { font: { size: 10 } }
        },
        y: {
          title: { display: true, text: 'Sales (USD)', font: { size: 12 } },
          grid: { color: '#f1f5f9' },
          ticks: { callback: v => fmtUSD(v), font: { size: 10 } }
        }
      }
    }
  });
}

/* ═══════════════════════════════════════════
   5k. TOP 10 PRODUCTS TABLE
════════════════════════════════════════════ */
function renderTopProducts(data) {
  // Sort by sales descending, take top 10
  const sorted = [...data]
    .sort((a, b) => (b.sales || 0) - (a.sales || 0))
    .slice(0, 10);

  const maxSales = sorted[0]?.sales || 1;
  const tbody = document.getElementById('top-products-body');

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-gray-400">No data for selected filters</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map((row, i) => {
    const pct = ((row.sales / maxSales) * 100).toFixed(1);
    const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
    return `
      <tr>
        <td class="py-2 pr-3">
          <span class="rank-badge ${rankClass}">${i + 1}</span>
        </td>
        <td class="py-2 pr-4 font-medium text-gray-800 max-w-xs" title="${escHtml(row.product_name || '')}">
          ${escHtml(truncate(row.product_name || '—', 42))}
        </td>
        <td class="py-2 pr-4 text-gray-500 text-xs">${escHtml(row.region || '—')}</td>
        <td class="py-2 pr-4 text-gray-500 text-xs">${escHtml(row.market || '—')}</td>
        <td class="py-2">
          <div class="sales-bar-wrap">
            <div class="sales-bar-bg">
              <div class="sales-bar-fill" style="width:${pct}%"></div>
            </div>
            <span class="sales-value">${fmtUSD(row.sales)}</span>
          </div>
        </td>
      </tr>`;
  }).join('');
}

/* ── Small helpers ── */
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function truncate(str, max) {
  return str.length > max ? str.substring(0, max) + '…' : str;
}

/* ═══════════════════════════════════════════
   6. FILTER EVENT LISTENERS
════════════════════════════════════════════ */
document.getElementById('filter-region').addEventListener('change', e => {
  filters.region = e.target.value;
  renderAll();
});
document.getElementById('filter-category').addEventListener('change', e => {
  filters.category = e.target.value;
  renderAll();
});
document.getElementById('filter-customer').addEventListener('change', e => {
  filters.customer = e.target.value;
  renderAll();
});
document.getElementById('filter-shipping').addEventListener('change', e => {
  filters.shipping = e.target.value;
  renderAll();
});

/* Reset all filters to "All" */
document.getElementById('reset-filters').addEventListener('click', () => {
  filters.region = filters.category = filters.customer = filters.shipping = 'All';
  document.getElementById('filter-region').value   = 'All';
  document.getElementById('filter-category').value = 'All';
  document.getElementById('filter-customer').value = 'All';
  document.getElementById('filter-shipping').value = 'All';
  renderAll();
});

/* ═══════════════════════════════════════════
   BOOTSTRAP — start everything
════════════════════════════════════════════ */
fetchData();
