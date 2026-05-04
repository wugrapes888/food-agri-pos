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
  { name: '小明', orders: [
    { name: '草莓', qty: 2, price: 150, isPreorder: true, arrived: true },
    { name: '溫家韭菜水餃', qty: 1, price: 100, isPreorder: true, arrived: true },
  ]},
  { name: '小美', orders: [
    { name: '巨峰葡萄', qty: 1, price: 200, isPreorder: true, arrived: true },
    { name: '有機蔬菜箱', qty: 1, price: 500, isPreorder: true, arrived: false },
  ]},
  { name: '王大明', orders: [
    { name: '土雞蛋(10入)', qty: 3, price: 80, isPreorder: true, arrived: true },
  ]},
  { name: '陳小花', orders: [
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
  return gasCall('getProductsForPOS');
}

export async function getAllCustomersForPOS() {
  if (isMock()) return MOCK_CUSTOMERS.map(c => ({
    name: c.name,
    qty: c.orders.reduce((s, o) => s + o.qty, 0),
    status: '未取貨',
  }));
  return gasCall('getAllCustomers');
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

export async function setDailyStock(items) {
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
    return { success: true, mock: true };
  }
  return gasCall('setDailyStock', { items });
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
    const costMap = {};
    MOCK_COST_RECORDS.forEach(r => {
      if (!costMap[r.product]) costMap[r.product] = [];
      costMap[r.product].push({ date: r.date, cost: r.cost });
    });
    Object.values(costMap).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));

    return MOCK_PRODUCT_SALES_DATA.map(p => {
      const records = costMap[p.name];
      let unitCost = null;
      if (records) {
        const valid = records.filter(r => r.date <= endDate);
        if (valid.length > 0) unitCost = valid[valid.length - 1].cost;
      }
      const totalCost   = unitCost !== null ? p.qty * unitCost : null;
      const grossProfit = totalCost !== null ? p.amount - totalCost : null;
      const grossMargin = (grossProfit !== null && p.amount > 0)
        ? Math.round(grossProfit / p.amount * 100) : null;
      return { name: p.name, qty: p.qty, amount: p.amount, totalCost, grossProfit, grossMargin };
    });
  }
  return gasCall('getProductProfit', { startDate, endDate });
}

export async function renameProduct(oldName, newName) {
  if (isMock()) {
    const idx = mockProducts.findIndex(p => p.name === oldName);
    if (idx >= 0) mockProducts[idx] = { ...mockProducts[idx], name: newName };
    return { success: true, mock: true };
  }
  return gasCall('renameProduct', { oldName, newName });
}
