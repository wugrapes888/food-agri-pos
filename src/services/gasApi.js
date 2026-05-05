// GAS Web App API 服務層
// 設定 GAS URL 後自動切換為真實模式，否則使用 MOCK 示範資料

export function getGasUrl() {
  return localStorage.getItem('gas_url') || '';
}
export function setGasUrl(url) {
  localStorage.setItem('gas_url', url.trim());
}

export function getSourceSheetId() {
  return localStorage.getItem('source_sheet_id') || '';
}
export function setSourceSheetId(id) {
  localStorage.setItem('source_sheet_id', id.trim());
}

// 從 Google Sheets 完整 URL 擷取試算表 ID
export function extractSheetId(urlOrId) {
  const m = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : urlOrId.trim();
}

// ── 快取工具（localStorage + TTL）────────────────────────────
const CACHE_TTL = 5 * 60 * 1000 // 5 分鐘

function getCached(key) {
  try {
    const item = localStorage.getItem(key)
    if (!item) return null
    const { data, time } = JSON.parse(item)
    if (Date.now() - time > CACHE_TTL) { localStorage.removeItem(key); return null }
    return data
  } catch { return null }
}

function setCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, time: Date.now() })) } catch {}
}

export function clearPOSCache() {
  localStorage.removeItem('cache_products')
  localStorage.removeItem('cache_customers')
}

async function gasCall(action, data = {}) {
  const url = getGasUrl();
  if (!url) throw new Error('NO_GAS_URL');

  const res = await fetch(url, {
    method: 'POST',
    // text/plain 避免 CORS preflight，GAS 側用 JSON.parse 接收
    body: JSON.stringify({ action, ...data }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  console.log('[GAS]', action, json);
  if (json && json.error) throw new Error(json.error);
  return json;
}

// ── Mock 示範資料 ──────────────────────────────────────
let mockProducts = [
  { name: '草莓', price: 150, category: '水果', barcode: '4710000001234', stockMode: 'reset', arrived: true, stock: 20, prevStock: 3 },
  { name: '巨峰葡萄', price: 200, category: '水果', barcode: '4710000005678', stockMode: 'reset', arrived: true, stock: 12, prevStock: 0 },
  { name: '玉米', price: 60, category: '蔬菜', barcode: '', stockMode: 'reset', arrived: true, stock: 3, prevStock: 5 },
  { name: '有機蔬菜箱', price: 500, category: '蔬菜', barcode: '', stockMode: 'carry', arrived: false, stock: 0, prevStock: 2 },
  { name: '溫家韭菜水餃', price: 100, category: '冷凍食品', barcode: '4710000009999', stockMode: 'reset', arrived: true, stock: 8, prevStock: null },
  { name: '溫家高麗菜水餃', price: 100, category: '冷凍食品', barcode: '4710000008888', stockMode: 'reset', arrived: true, stock: 5, prevStock: null },
  { name: '土雞蛋(10入)', price: 80, category: '蛋類', barcode: '', stockMode: 'reset', arrived: true, stock: 15, prevStock: 2 },
  { name: '蜂蜜(500g)', price: 350, category: '加工品', barcode: '', stockMode: 'carry', arrived: true, stock: 7, prevStock: 7 },
];

const MOCK_CUSTOMERS = [
  { name: '小明', phone: '0912345678', orders: [
    { name: '草莓', qty: 2, price: 150, isPreorder: true, arrived: true },
    { name: '溫家韭菜水餃', qty: 1, price: 100, isPreorder: true, arrived: true },
  ]},
  { name: '小美', phone: '0923456789', orders: [
    { name: '巨峰葡萄', qty: 1, price: 200, isPreorder: true, arrived: true },
    { name: '有機蔬菜箱', qty: 1, price: 500, isPreorder: true, arrived: false },
  ]},
  { name: '王大明', phone: '0934567890', orders: [
    { name: '土雞蛋(10入)', qty: 3, price: 80, isPreorder: true, arrived: true },
  ]},
  { name: '陳小花', phone: '0945678901', orders: [
    { name: '蜂蜜(500g)', qty: 2, price: 350, isPreorder: true, arrived: true },
    { name: '玉米', qty: 5, price: 60, isPreorder: true, arrived: true },
  ]},
];

const MOCK_STATS = {
  date: new Date().toLocaleDateString('zh-TW'),
  totalRevenue: 4200,
  cashRevenue: 2800,
  transferRevenue: 900,
  linepayRevenue: 500,
  txCount: 8,
  avgOrder: 525,
  preorderCount: 6,
  walkCount: 2,
  stockSummary: mockProducts.map(p => ({
    name: p.name,
    openStock: p.stock + 3,
    sold: 3,
    remaining: p.stock,
  })),
};

function isMock() {
  return !getGasUrl();
}

// ── Mock 報表資料 ───────────────────────────────────────────────

function _buildMockDailyRevenue() {
  const today = new Date();
  const rows = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 1) continue; // 週日/一休市
    const base    = 3500 + Math.sin(i * 0.4) * 1200;
    const revenue = Math.round(base + (Math.random() * 2000 - 400));
    const orders  = Math.round(6 + Math.random() * 8);
    const cash     = Math.round(revenue * (0.40 + Math.random() * 0.15));
    const transfer = Math.round(revenue * (0.25 + Math.random() * 0.10));
    const linepay  = Math.max(0, revenue - cash - transfer);
    rows.push({ date: d.toISOString().slice(0, 10), revenue, orders, cash, transfer, linepay });
  }
  return rows;
}
const MOCK_DAILY_REVENUE = _buildMockDailyRevenue();

function _buildMockDailyProfit() {
  let seed = 42
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff }
  return MOCK_DAILY_REVENUE.map(r => {
    const margin = 0.28 + rng() * 0.18
    const grossProfit = Math.round(r.revenue * margin)
    const cogs = r.revenue - grossProfit
    return { date: r.date, revenue: r.revenue, cogs, grossProfit, marginPct: Math.round(margin * 100) }
  })
}
const MOCK_DAILY_PROFIT = _buildMockDailyProfit();

let MOCK_PURCHASE_BATCHES = [
  { id: 1, product: '草莓',           purchaseDate: '2026-04-01', qty: 50,  unit: '盒', unitCost: 80,  totalCost: 4000, remainingQty: 5,  note: '' },
  { id: 2, product: '草莓',           purchaseDate: '2026-05-01', qty: 60,  unit: '盒', unitCost: 95,  totalCost: 5700, remainingQty: 42, note: '季末漲價' },
  { id: 3, product: '巨峰葡萄',       purchaseDate: '2026-04-01', qty: 40,  unit: '串', unitCost: 120, totalCost: 4800, remainingQty: 10, note: '' },
  { id: 4, product: '土雞蛋(10入)',   purchaseDate: '2026-04-01', qty: 80,  unit: '盒', unitCost: 50,  totalCost: 4000, remainingQty: 20, note: '' },
  { id: 5, product: '蜂蜜(500g)',     purchaseDate: '2026-04-01', qty: 20,  unit: '罐', unitCost: 200, totalCost: 4000, remainingQty: 8,  note: '' },
  { id: 6, product: '溫家韭菜水餃',   purchaseDate: '2026-04-01', qty: 50,  unit: '包', unitCost: 65,  totalCost: 3250, remainingQty: 15, note: '' },
  { id: 7, product: '溫家高麗菜水餃', purchaseDate: '2026-04-01', qty: 40,  unit: '包', unitCost: 65,  totalCost: 2600, remainingQty: 10, note: '' },
  { id: 8, product: '玉米',           purchaseDate: '2026-04-01', qty: 100, unit: '支', unitCost: 28,  totalCost: 2800, remainingQty: 60, note: '' },
]

const MOCK_COST_RECORDS = [
  { product: '草莓',              date: '2026-04-01', cost:  80, note: '' },
  { product: '草莓',              date: '2026-05-01', cost:  95, note: '季末漲價' },
  { product: '巨峰葡萄',          date: '2026-04-01', cost: 120, note: '' },
  { product: '土雞蛋(10入)',      date: '2026-04-01', cost:  50, note: '' },
  { product: '蜂蜜(500g)',        date: '2026-04-01', cost: 200, note: '' },
  { product: '溫家韭菜水餃',      date: '2026-04-01', cost:  65, note: '' },
  { product: '溫家高麗菜水餃',    date: '2026-04-01', cost:  65, note: '' },
  { product: '玉米',              date: '2026-04-01', cost:  28, note: '' },
];

const MOCK_PRODUCT_SALES_DATA = [
  { name: '草莓',              qty: 45, amount: 6750 },
  { name: '巨峰葡萄',          qty: 30, amount: 6000 },
  { name: '土雞蛋(10入)',      qty: 60, amount: 4800 },
  { name: '蜂蜜(500g)',        qty: 12, amount: 4200 },
  { name: '溫家韭菜水餃',      qty: 35, amount: 3500 },
  { name: '溫家高麗菜水餃',    qty: 30, amount: 3000 },
  { name: '有機蔬菜箱',        qty:  5, amount: 2500 },
  { name: '玉米',              qty: 40, amount: 2400 },
];

// ── Public API ─────────────────────────────────────────

export async function pingPOS() {
  if (isMock()) return { ok: true, mock: true };
  return gasCall('pingPOS');
}

export async function getProductsForPOS() {
  if (isMock()) return [...mockProducts];
  const cached = getCached('cache_products')
  if (cached) return cached
  const data = await gasCall('getProductsForPOS')
  setCache('cache_products', data)
  return data
}

export async function getAllCustomersForPOS() {
  if (isMock()) return MOCK_CUSTOMERS.map(c => ({
    name: c.name,
    phone: c.phone || '',
    qty: c.orders.reduce((s, o) => s + o.qty, 0),
    status: '未取貨',
  }));
  const cached = getCached('cache_customers')
  if (cached) return cached
  const data = await gasCall('getAllCustomers')
  setCache('cache_customers', data)
  return data
}

export async function getCustomerCartForPOS(name) {
  if (isMock()) {
    const c = MOCK_CUSTOMERS.find(x => x.name === name);
    return c ? c.orders : [];
  }
  return gasCall('getCustomerCartForPOS', { name });
}

export async function submitCheckout(payload) {
  if (isMock()) {
    console.log('[MOCK] submitCheckout', payload);
    return { success: true, mock: true };
  }
  return gasCall('submitCheckout', { payload });
}

export async function setDailyStock(items, costItems) {
  if (isMock()) {
    items.forEach(item => {
      const idx = mockProducts.findIndex(p => p.name === item.name);
      if (idx >= 0) {
        mockProducts[idx] = {
          ...mockProducts[idx],
          stock: item.openStock,
          price: item.price !== undefined ? item.price : mockProducts[idx].price,
        };
      }
    });
    // 未列入的商品設 stock 為 0
    const names = new Set(items.map(i => i.name));
    mockProducts = mockProducts.map(p =>
      names.has(p.name) ? p : { ...p, stock: 0 }
    );
    if (costItems && costItems.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      costItems.forEach(c => {
        MOCK_COST_RECORDS.push({ product: c.name, date: today, cost: Number(c.cost), note: '開攤設定' });
      });
    }
    return { success: true, mock: true };
  }
  return gasCall('setDailyStock', { items, costs: costItems || [] });
}

export async function getTodayStats() {
  if (isMock()) return MOCK_STATS;
  return gasCall('getTodayStats');
}

export async function getCustomerDetail(name) {
  if (isMock()) {
    const c = MOCK_CUSTOMERS.find(x => x.name === name);
    if (!c) return null;
    return {
      name,
      items: c.orders.map(o => ({
        product: o.name, qty: o.qty, price: o.price,
        subtotal: o.price * o.qty, status: '未取貨', arrived: o.arrived !== false,
      })),
      arrivedTotal: c.orders.filter(o => o.arrived !== false).reduce((s, o) => s + o.price * o.qty, 0),
      allTotal: c.orders.reduce((s, o) => s + o.price * o.qty, 0),
      picked: false,
    };
  }
  return gasCall('getCustomerDetail', { customerName: name });
}

export async function completePickup(name) {
  if (isMock()) { console.log('[MOCK] completePickup', name); return { success: true }; }
  return gasCall('completePickup', { customerName: name });
}

export async function undoPickup(name) {
  if (isMock()) { console.log('[MOCK] undoPickup', name); return { success: true }; }
  return gasCall('undoPickup', { customerName: name });
}

export async function syncFromExternalOrders(spreadsheetId) {
  if (isMock()) {
    console.log('[MOCK] syncFromExternalOrders', spreadsheetId);
    return { success: true, count: 0, mock: true };
  }
  return gasCall('syncFromExternalOrders', { spreadsheetId });
}

export async function saveProduct(product) {
  if (isMock()) {
    const idx = mockProducts.findIndex(p => p.name === product.name);
    if (idx >= 0) {
      mockProducts[idx] = { ...mockProducts[idx], ...product };
    } else {
      mockProducts = [...mockProducts, {
        name: product.name, price: product.price,
        category: product.category || '其他',
        stockMode: product.stockMode || 'reset',
        arrived: product.arrived !== false,
        barcode: product.barcode || '',
        stock: 999, prevStock: null,
      }];
    }
    return { success: true, action: idx >= 0 ? 'updated' : 'created', mock: true };
  }
  return gasCall('saveProduct', { product: JSON.stringify(product) });
}

export async function deleteProduct(name) {
  if (isMock()) {
    mockProducts = mockProducts.filter(p => p.name !== name);
    return { success: true, mock: true };
  }
  return gasCall('deleteProduct', { name });
}

export async function getRevenueByDate(startDate, endDate) {
  if (isMock()) return MOCK_DAILY_REVENUE.filter(r => r.date >= startDate && r.date <= endDate);
  return gasCall('getRevenueByDate', { startDate, endDate });
}

export async function getProductSales(startDate, endDate) {
  if (isMock()) return MOCK_PRODUCT_SALES_DATA;
  return gasCall('getProductSales', { startDate, endDate });
}

export async function getCostRecords() {
  if (isMock()) return [...MOCK_COST_RECORDS].sort((a, b) => b.date.localeCompare(a.date));
  return gasCall('getCostRecords');
}

export async function saveCostRecord(product, date, cost, note) {
  if (isMock()) {
    MOCK_COST_RECORDS.push({ product, date, cost: Number(cost), note: note || '' });
    return { success: true, mock: true };
  }
  return gasCall('saveCostRecord', { product, date, cost, note });
}

export async function deleteCostRecord(product, date) {
  if (isMock()) {
    const idx = MOCK_COST_RECORDS.findIndex(r => r.product === product && r.date === date);
    if (idx >= 0) MOCK_COST_RECORDS.splice(idx, 1);
    return { success: true, mock: true };
  }
  return gasCall('deleteCostRecord', { product, date });
}

export async function getProductProfit(startDate, endDate) {
  if (isMock()) {
    const costMap = {}
    MOCK_PURCHASE_BATCHES.forEach(b => {
      if (!costMap[b.product]) costMap[b.product] = { total: 0, qty: 0 }
      costMap[b.product].total += b.totalCost
      costMap[b.product].qty   += b.qty
    })
    return MOCK_PRODUCT_SALES_DATA.map(p => {
      const c = costMap[p.name]
      const avgUnitCost = c ? c.total / c.qty : null
      const totalCost   = avgUnitCost !== null ? Math.round(p.qty * avgUnitCost) : null
      const grossProfit = totalCost !== null ? p.amount - totalCost : null
      const grossMargin = (grossProfit !== null && p.amount > 0)
        ? Math.round(grossProfit / p.amount * 100) : null
      return { name: p.name, qty: p.qty, amount: p.amount, totalCost, grossProfit, grossMargin }
    }).sort((a, b) => b.amount - a.amount)
  }
  return gasCall('getProductProfit', { startDate, endDate });
}

export async function getPurchaseBatches() {
  if (isMock()) return [...MOCK_PURCHASE_BATCHES].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
  return gasCall('getPurchaseBatches')
}

export async function savePurchaseBatch(product, purchaseDate, qty, unit, unitCost, note) {
  if (isMock()) {
    const id = Math.max(0, ...MOCK_PURCHASE_BATCHES.map(b => b.id)) + 1
    const q = Number(qty), c = Number(unitCost)
    MOCK_PURCHASE_BATCHES = [...MOCK_PURCHASE_BATCHES, { id, product, purchaseDate, qty: q, unit: unit || '', unitCost: c, totalCost: q * c, remainingQty: q, note: note || '' }]
    return { success: true, mock: true }
  }
  return gasCall('savePurchaseBatch', { product, purchaseDate, qty, unit, unitCost, note })
}

export async function deletePurchaseBatch(id) {
  if (isMock()) {
    MOCK_PURCHASE_BATCHES = MOCK_PURCHASE_BATCHES.filter(b => b.id !== id)
    return { success: true, mock: true }
  }
  return gasCall('deletePurchaseBatch', { id })
}

export async function updatePurchaseBatch(id, updates) {
  if (isMock()) {
    MOCK_PURCHASE_BATCHES = MOCK_PURCHASE_BATCHES.map(b => {
      if (b.id !== id) return b
      const merged = { ...b }
      if (updates.product      !== undefined) merged.product      = updates.product
      if (updates.purchaseDate !== undefined) merged.purchaseDate = updates.purchaseDate
      if (updates.qty          !== undefined) merged.qty          = Number(updates.qty)
      if (updates.unit         !== undefined) merged.unit         = updates.unit
      if (updates.unitCost     !== undefined) merged.unitCost     = Number(updates.unitCost)
      merged.totalCost = merged.qty * merged.unitCost
      return merged
    })
    return { success: true, mock: true }
  }
  return gasCall('updatePurchaseBatch', { id, ...updates })
}

export async function getProfitByDate(startDate, endDate) {
  if (isMock()) return MOCK_DAILY_PROFIT.filter(r => r.date >= startDate && r.date <= endDate)
  return gasCall('getProfitByDate', { startDate, endDate })
}

export async function getBatchProfit() {
  if (isMock()) {
    const priceMap = {}
    MOCK_PRODUCT_SALES_DATA.forEach(p => { priceMap[p.name] = p.qty > 0 ? p.amount / p.qty : 0 })
    return MOCK_PURCHASE_BATCHES.map(b => {
      const soldQty  = b.qty - b.remainingQty
      const avgPrice = priceMap[b.product] || 0
      const batchRev = Math.round(soldQty * avgPrice)
      const soldCost = soldQty * b.unitCost
      const profit   = avgPrice > 0 ? batchRev - soldCost : null
      const margin   = (profit !== null && batchRev > 0) ? Math.round(profit / batchRev * 100) : null
      return {
        id: b.id, product: b.product, purchaseDate: b.purchaseDate,
        batchQty: b.qty, soldQty, remainingQty: b.remainingQty,
        unitCost: b.unitCost, batchCost: b.qty * b.unitCost, soldCost,
        batchRevenue: batchRev, grossProfit: profit, grossMargin: margin,
      }
    })
  }
  return gasCall('getBatchProfit')
}

export async function getChannelStats(startDate, endDate) {
  if (isMock()) {
    const total   = MOCK_PRODUCT_SALES_DATA.reduce((s, p) => s + p.amount, 0)
    const posRev  = Math.round(total * 0.45)
    const preRev  = Math.round(total * 0.38)
    const lineRev = Math.round(total * 0.17)
    return [
      { channel: 'pos',  channelLabel: '現場POS', revenue: posRev,  orders: 48, avgOrder: Math.round(posRev  / 48) },
      { channel: 'pre',  channelLabel: '預購',     revenue: preRev,  orders: 35, avgOrder: Math.round(preRev  / 35) },
      { channel: 'line', channelLabel: 'LINE',     revenue: lineRev, orders: 22, avgOrder: Math.round(lineRev / 22) },
    ]
  }
  return gasCall('getChannelStats', { startDate, endDate })
}

export async function debugSales() {
  if (isMock()) return { mock: true };
  return gasCall('debugSales');
}

export async function getTodaySales() {
  if (isMock()) return [
    { time: '09:30:00', customerName: '小明', customerType: 'preorder', paymentMethod: 'cash',     staffName: '小美', total: 400, items: [{ name: '草莓', qty: 2, price: 150, subtotal: 300 }, { name: '溫家韭菜水餃', qty: 1, price: 100, subtotal: 100 }] },
    { time: '10:15:00', customerName: '散客', customerType: 'walk',     paymentMethod: 'linepay',  staffName: '小美', total: 180, items: [{ name: '玉米', qty: 3, price: 60, subtotal: 180 }] },
    { time: '10:50:00', customerName: '王大明', customerType: 'preorder', paymentMethod: 'transfer', staffName: '老闆', total: 240, items: [{ name: '土雞蛋(10入)', qty: 3, price: 80, subtotal: 240 }] },
    { time: '11:20:00', customerName: '散客', customerType: 'walk',     paymentMethod: 'cash',     staffName: '小美', total: 700, items: [{ name: '巨峰葡萄', qty: 2, price: 200, subtotal: 400 }, { name: '蜂蜜(500g)', qty: 1, price: 350, subtotal: 350 }] },
    { time: '13:05:00', customerName: '陳小花', customerType: 'preorder', paymentMethod: 'cash',    staffName: '老闆', total: 1000, items: [{ name: '蜂蜜(500g)', qty: 2, price: 350, subtotal: 700 }, { name: '玉米', qty: 5, price: 60, subtotal: 300 }] },
  ];
  return gasCall('getTodaySales');
}

export async function renameProduct(oldName, newName) {
  if (isMock()) {
    const idx = mockProducts.findIndex(p => p.name === oldName);
    if (idx >= 0) mockProducts[idx] = { ...mockProducts[idx], name: newName };
    return { success: true, mock: true };
  }
  return gasCall('renameProduct', { oldName, newName });
}
