/**
 * Data Preparation Script
 * Reads DataCoSupplyChainDataset.csv, cleans, samples 2500 rows,
 * maps columns, and writes data.json
 */

const fs = require('fs');

// Read CSV with latin1 encoding
const raw = fs.readFileSync('DataCoSupplyChainDataset.csv', { encoding: 'latin1' });
const lines = raw.split('\n');

// Parse header row
const header = lines[0].split(',').map(h => h.trim().replace(/\r/g, ''));

// Helper: parse CSV line handling quoted fields
function parseLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Column index map
const idx = {};
header.forEach((col, i) => { idx[col] = i; });

// Required column names
const REQ = {
  order_date:      'order date (DateOrders)',
  sales:           'Sales',
  profit:          'Benefit per order',
  quantity:        'Order Item Quantity',
  discount:        'Order Item Discount Rate',
  region:          'Order Region',
  category:        'Category Name',
  customer_type:   'Customer Segment',
  payment_method:  'Type',
  shipping_mode:   'Shipping Mode',
  delivery_status: 'Delivery Status',
  market:          'Market',
  product_name:    'Product Name',
};

// Verify required columns exist
Object.entries(REQ).forEach(([key, col]) => {
  if (idx[col] === undefined) {
    console.warn(`WARNING: Column not found: "${col}" (mapped to ${key})`);
  }
});

// Parse all data rows (skip header)
const rows = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].replace(/\r/g, '').trim();
  if (!line) continue; // skip empty lines

  const cols = parseLine(line);

  // Extract values
  const orderDateRaw    = cols[idx[REQ.order_date]]    || '';
  const salesRaw        = cols[idx[REQ.sales]]         || '';
  const profitRaw       = cols[idx[REQ.profit]]        || '';
  const quantityRaw     = cols[idx[REQ.quantity]]      || '';
  const discountRaw     = cols[idx[REQ.discount]]      || '';
  const regionRaw       = cols[idx[REQ.region]]        || '';
  const categoryRaw     = cols[idx[REQ.category]]      || '';
  const customerTypeRaw = cols[idx[REQ.customer_type]] || '';
  const paymentRaw      = cols[idx[REQ.payment_method]]|| '';
  const shippingRaw     = cols[idx[REQ.shipping_mode]] || '';
  const deliveryRaw     = cols[idx[REQ.delivery_status]]|| '';
  const marketRaw       = cols[idx[REQ.market]]        || '';
  const productRaw      = cols[idx[REQ.product_name]]  || '';

  // Drop rows with any critical missing values (dropna equivalent)
  if (!orderDateRaw || !salesRaw || !quantityRaw || !regionRaw || !categoryRaw) {
    continue;
  }

  // Parse and validate types
  const salesVal    = parseFloat(salesRaw);
  const profitVal   = parseFloat(profitRaw);
  const quantityVal = parseInt(quantityRaw, 10);
  const discountVal = parseFloat(discountRaw);

  if (isNaN(salesVal) || isNaN(quantityVal)) continue;

  // Parse date — format is typically M/D/YYYY H:MM
  let order_date = '';
  const datePart = orderDateRaw.split(' ')[0]; // take date part only
  const dParts = datePart.split('/');
  if (dParts.length === 3) {
    const [m, d, y] = dParts;
    order_date = `${y.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  } else {
    continue; // skip unparseable dates
  }

  rows.push({
    order_date,
    sales:           Math.round(salesVal * 100) / 100,
    profit:          isNaN(profitVal) ? null : Math.round(profitVal * 100) / 100,
    quantity:        quantityVal,
    discount:        isNaN(discountVal) ? 0 : Math.round(discountVal * 100 * 10) / 10,
    region:          regionRaw,
    category:        categoryRaw,
    customer_type:   customerTypeRaw,
    payment_method:  paymentRaw,
    shipping_mode:   shippingRaw,
    delivery_status: deliveryRaw,
    market:          marketRaw,
    product_name:    productRaw,
  });
}

console.log(`Total clean rows parsed: ${rows.length}`);

// Stable random sample of 2500 rows (seeded shuffle equivalent to random_state=42)
// Using a seeded LCG PRNG for reproducibility
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const rng = seededRandom(42);
const SAMPLE_SIZE = Math.min(2500, rows.length);

// Fisher-Yates partial shuffle (sample without replacement)
const indices = Array.from({ length: rows.length }, (_, i) => i);
for (let i = 0; i < SAMPLE_SIZE; i++) {
  const j = i + Math.floor(rng() * (indices.length - i));
  [indices[i], indices[j]] = [indices[j], indices[i]];
}
const sampled = indices.slice(0, SAMPLE_SIZE).map(i => rows[i]);

// Sort chronologically by order_date
sampled.sort((a, b) => a.order_date.localeCompare(b.order_date));

console.log(`Sampled: ${sampled.length} rows`);
console.log(`Date range: ${sampled[0].order_date} -> ${sampled[sampled.length-1].order_date}`);

// Write data.json
fs.writeFileSync('data.json', JSON.stringify(sampled, null, 2), 'utf8');
console.log('data.json written successfully!');
