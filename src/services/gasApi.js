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
  return res.json();
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

export async function renameProduct(oldName, newName) {
  if (isMock()) {
    const idx = mockProducts.findIndex(p => p.name === oldName);
    if (idx >= 0) mockProducts[idx] = { ...mockProducts[idx], name: newName };
    return { success: true, mock: true };
  }
  return gasCall('renameProduct', { oldName, newName });
}
