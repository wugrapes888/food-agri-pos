// ============================================================
// 食農 POS 系統 — Google Apps Script Web App
// 請將此檔案貼入 Google Apps Script 專案並部署為網路應用程式
//
// 已連結試算表：
// https://docs.google.com/spreadsheets/d/1xV5eoHtW38eBHQLNmu2nuAP4IvcCbp4_yhV2FuZQ5us
// ============================================================

const SPREADSHEET_ID = '1xV5eoHtW38eBHQLNmu2nuAP4IvcCbp4_yhV2FuZQ5us';

// 工作表名稱對照
const SH = {
  PRODUCTS:     '商品設定',   // POS 商品主檔（含條碼、分類、庫存模式）
  DAILY:        '每日庫存',   // 每日開攤 / 即時庫存
  SALES:        '銷售記錄',   // 每筆結帳明細
  ORDERS:       '訂單明細',   // 預購訂單（與群購系統共用）
  GRP_PRODUCTS: '商品清單',   // 群購商品清單（與群購系統共用）
  COSTS:        '成本設定',   // 進貨成本記錄（商品名稱、進貨日期、每單位成本）
  CUSTOMERS:    '客人資料',   // 客人基本資料（姓名、手機）
};

// ── 工具函式 ─────────────────────────────────────────────────

function openSS() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  const ss  = openSS();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    _initHeaders(sheet, name);
  }
  return sheet;
}

function _initHeaders(sheet, name) {
  const h = {
    [SH.PRODUCTS]:     ['商品名稱', '單價', '分類', '條碼', '庫存模式', '已到貨'],
    [SH.DAILY]:        ['日期', '商品名稱', '開攤數量', '售出數量', '剩餘數量', '單價'],
    [SH.SALES]:        ['日期', '時間', '客人姓名', '客人類型', '商品名稱', '數量', '單價', '小計', '付款方式', '員工編號', '員工姓名'],
    [SH.ORDERS]:       ['客人姓名', '商品名稱', '數量', '單價', '小計', '取貨狀態', '建立時間'],
    [SH.GRP_PRODUCTS]: ['商品名稱', '單價', '總訂購量', '剩餘待取量', '類型', '備註', '到貨狀態'],
    [SH.COSTS]:        ['商品名稱', '進貨日期', '每單位成本', '備註'],
    [SH.CUSTOMERS]:    ['客人姓名', '手機'],
  };
  if (h[name]) {
    sheet.appendRow(h[name]);
    sheet.setFrozenRows(1);
  }
}

function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function toDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return '';
}

// ── Web App 入口 ─────────────────────────────────────────────

// doGet：可直接在瀏覽器開啟 URL 測試（回傳 ok 代表腳本正常）
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, system: '食農POS', ts: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(15000);
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;

    switch (action) {
      case 'pingPOS':
        result = { ok: true, ts: new Date().toISOString() };
        break;
      case 'getProductsForPOS':
        result = getProductsForPOS();
        break;
      case 'getAllCustomers':
        result = getAllCustomers();
        break;
      case 'getCustomerCartForPOS':
        result = getCustomerCartForPOS(body.name);
        break;
      case 'submitCheckout':
        result = submitCheckout(body.payload);
        break;
      case 'setDailyStock':
        result = setDailyStock(body.items, body.costs);
        break;
      case 'getTodayStats':
        result = getTodayStats();
        break;
      case 'getCustomerDetail':
        result = getCustomerDetail(body.customerName);
        break;
      case 'completePickup':
        result = completePickup(body.customerName);
        break;
      case 'undoPickup':
        result = undoPickup(body.customerName);
        break;
      case 'syncFromExternalOrders':
        result = syncFromExternalOrders(body.spreadsheetId);
        break;
      case 'saveProduct':
        result = saveProduct(JSON.parse(body.product));
        break;
      case 'deleteProduct':
        result = deleteProductRecord(body.name);
        break;
      case 'renameProduct':
        result = renameProduct(body.oldName, body.newName);
        break;
      case 'getRevenueByDate':
        result = getRevenueByDate(body.startDate, body.endDate);
        break;
      case 'getProductSales':
        result = getProductSales(body.startDate, body.endDate);
        break;
      case 'getCostRecords':
        result = getCostRecords();
        break;
      case 'saveCostRecord':
        result = saveCostRecord(body.product, body.date, body.cost, body.note);
        break;
      case 'deleteCostRecord':
        result = deleteCostRecord(body.product, body.date);
        break;
      case 'getProductProfit':
        result = getProductProfit(body.startDate, body.endDate);
        break;
      case 'debugSales':
        result = debugSales();
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// ── getProductsForPOS ─────────────────────────────────────────
// 回傳格式: [{name, price, category, barcode, stockMode, arrived, stock, prevStock}]

function getProductsForPOS() {
  const prodSheet  = getSheet(SH.PRODUCTS);
  const dailySheet = getSheet(SH.DAILY);

  const prodData  = prodSheet.getDataRange().getValues();
  const dailyData = dailySheet.getDataRange().getValues();

  if (prodData.length <= 1) return [];

  const today = todayStr();

  // 建立 日期 → 商品 → 庫存資料 的巢狀對應
  const dayMap = {};
  dailyData.slice(1).forEach(r => {
    if (!r[1]) return;
    const d = toDateStr(r[0]);
    if (!dayMap[d]) dayMap[d] = {};
    dayMap[d][String(r[1])] = {
      open: Number(r[2]), sold: Number(r[3]), remain: Number(r[4]), price: Number(r[5])
    };
  });

  const todayMap = dayMap[today] || {};
  const prevDate = Object.keys(dayMap).filter(d => d < today).sort().pop();
  const prevMap  = prevDate ? dayMap[prevDate] : {};

  return prodData.slice(1).filter(r => r[0]).map(r => {
    const name      = String(r[0]);
    const price     = Number(r[1]) || 0;
    const category  = String(r[2] || '其他');
    const barcode   = String(r[3] || '');
    const stockMode = String(r[4] || 'reset');
    const arrived   = r[5] !== 'N' && r[5] !== '否' && r[5] !== false;

    const todayRec = todayMap[name];
    const prevRec  = prevMap[name];

    const stock     = todayRec ? todayRec.remain : (arrived ? 999 : 0);
    const prevStock = prevRec  ? prevRec.remain  : null;

    return { name, price, category, barcode, stockMode, arrived, stock, prevStock };
  });
}

// ── setDailyStock ─────────────────────────────────────────────
// items: [{name, openStock, price}]

function setDailyStock(items, costItems) {
  const dailySheet = getSheet(SH.DAILY);
  const prodSheet  = getSheet(SH.PRODUCTS);
  const today = todayStr();
  const data  = dailySheet.getDataRange().getValues();

  // 刪除今日舊資料（從後往前刪，避免索引錯位）
  for (let i = data.length - 1; i >= 1; i--) {
    if (toDateStr(data[i][0]) === today) dailySheet.deleteRow(i + 1);
  }

  // 寫入今日開攤資料
  items.forEach(it => {
    dailySheet.appendRow([today, it.name, it.openStock || 0, 0, it.openStock || 0, it.price || 0]);
  });

  // 同步更新 商品設定 的單價（若有調整）
  const prodData = prodSheet.getDataRange().getValues();
  items.forEach(it => {
    for (let i = 1; i < prodData.length; i++) {
      if (prodData[i][0] === it.name && it.price !== undefined) {
        prodSheet.getRange(i + 1, 2).setValue(it.price);
        break;
      }
    }
  });

  // 儲存變動的成本記錄
  if (costItems && costItems.length > 0) {
    const costSheet = getSheet(SH.COSTS);
    costItems.forEach(c => {
      if (c.name && Number(c.cost) > 0) {
        costSheet.appendRow([c.name, today, Number(c.cost), '開攤設定']);
      }
    });
  }

  SpreadsheetApp.flush();
  return { success: true };
}

// ── submitCheckout ────────────────────────────────────────────

function submitCheckout(payload) {
  const { customerName, customerType, items, paymentMethod, timestamp,
          staffId = '', staffName = '' } = payload;

  const salesSheet = getSheet(SH.SALES);
  const dailySheet = getSheet(SH.DAILY);
  const today   = todayStr();
  const timeStr = Utilities.formatDate(
    new Date(timestamp || Date.now()), Session.getScriptTimeZone(), 'HH:mm:ss'
  );

  // 寫入銷售記錄（含員工資訊）
  items.forEach(item => {
    if (item.arrived === false) return;
    salesSheet.appendRow([
      today, timeStr, customerName, customerType,
      item.name, item.qty, item.price, item.price * item.qty, paymentMethod,
      staffId, staffName
    ]);
  });

  // 扣減每日庫存
  const dailyData = dailySheet.getDataRange().getValues();
  items.forEach(item => {
    if (item.arrived === false) return;
    for (let i = 1; i < dailyData.length; i++) {
      if (toDateStr(dailyData[i][0]) === today && dailyData[i][1] === item.name) {
        const newSold   = Number(dailyData[i][3]) + item.qty;
        const newRemain = Math.max(0, Number(dailyData[i][4]) - item.qty);
        dailySheet.getRange(i + 1, 4).setValue(newSold);
        dailySheet.getRange(i + 1, 5).setValue(newRemain);
        dailyData[i][3] = newSold;
        dailyData[i][4] = newRemain;
        break;
      }
    }
  });

  // 預購客人：將已結帳的預購品項標記為已取貨
  if (customerType === 'preorder' && customerName !== '散客') {
    const preorderNames = new Set(
      items.filter(i => i.isPreorder && i.arrived !== false).map(i => i.name)
    );
    if (preorderNames.size > 0) _markPickedUp(customerName, preorderNames);
  }

  SpreadsheetApp.flush();
  return { success: true };
}

function _markPickedUp(customerName, itemNames) {
  const sheet = getSheet(SH.ORDERS);
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === customerName && data[i][5] === '未取貨' && itemNames.has(data[i][1])) {
      sheet.getRange(i + 1, 6).setValue('已取貨');
    }
  }
}

// ── getAllCustomers ────────────────────────────────────────────

function getAllCustomers() {
  const orderSheet = getSheet(SH.ORDERS);
  const custSheet  = getSheet(SH.CUSTOMERS);

  const orderData = orderSheet.getDataRange().getValues();
  const custData  = custSheet.getDataRange().getValues();

  // 建立手機查找表：姓名 → 手機
  const phoneMap = {};
  custData.slice(1).forEach(r => {
    if (r[0]) phoneMap[String(r[0])] = String(r[1] || '');
  });

  if (orderData.length <= 1) return [];

  const map = {}, order = [];
  orderData.slice(1).forEach(r => {
    if (!r[0]) return;
    const name = r[0];
    if (!map[name]) { map[name] = { name, qty: 0, status: '已取貨', phone: phoneMap[name] || '' }; order.push(name); }
    map[name].qty += Number(r[2]);
    if (r[5] !== '已取貨') map[name].status = '未取貨';
  });

  return order.map(n => map[n]);
}

// ── getCustomerCartForPOS ─────────────────────────────────────

function getCustomerCartForPOS(customerName) {
  const orderSheet = getSheet(SH.ORDERS);
  const grpSheet   = getSheet(SH.GRP_PRODUCTS);

  const orderData = orderSheet.getDataRange().getValues();
  const grpData   = grpSheet.getDataRange().getValues();

  // 到貨狀態：商品清單第 7 欄（index 6）
  const arrMap = {};
  grpData.slice(1).forEach(r => {
    if (r[0]) arrMap[String(r[0])] = r[6] !== '未到貨';
  });

  return orderData.slice(1)
    .filter(r => r[0] === customerName && r[5] !== '已取貨')
    .map(r => ({
      name:       String(r[1]),
      qty:        Number(r[2]),
      price:      Number(r[3]),
      isPreorder: true,
      arrived:    arrMap[r[1]] !== false,
    }));
}

// ── getCustomerDetail ─────────────────────────────────────────

function getCustomerDetail(customerName) {
  const orderSheet = getSheet(SH.ORDERS);
  const grpSheet   = getSheet(SH.GRP_PRODUCTS);

  const orderData = orderSheet.getDataRange().getValues();
  const grpData   = grpSheet.getDataRange().getValues();

  const arrMap = {};
  grpData.slice(1).forEach(r => {
    if (r[0]) arrMap[String(r[0])] = r[6] !== '未到貨';
  });

  const items = orderData.slice(1)
    .filter(r => r[0] === customerName)
    .map(r => ({
      product:  String(r[1]),
      qty:      Number(r[2]),
      price:    Number(r[3]),
      subtotal: Number(r[4]),
      status:   r[5],
      arrived:  arrMap[r[1]] !== false,
    }));

  if (!items.length) return null;

  const arrivedItems = items.filter(i => i.arrived);
  const arrivedTotal = arrivedItems.reduce((s, i) => s + i.subtotal, 0);
  const allTotal     = items.reduce((s, i) => s + i.subtotal, 0);
  const picked       = arrivedItems.length > 0 && arrivedItems.every(i => i.status === '已取貨');

  return { name: customerName, items, arrivedTotal, allTotal, picked };
}

// ── completePickup ────────────────────────────────────────────

function completePickup(customerName) {
  const orderSheet = getSheet(SH.ORDERS);
  const grpSheet   = getSheet(SH.GRP_PRODUCTS);

  const orderData = orderSheet.getDataRange().getValues();
  const grpData   = grpSheet.getDataRange().getValues();

  const arrMap = {};
  grpData.slice(1).forEach(r => {
    if (r[0]) arrMap[String(r[0])] = r[6] !== '未到貨';
  });

  const deduct = {};
  for (let i = 1; i < orderData.length; i++) {
    if (orderData[i][0] === customerName && orderData[i][5] === '未取貨') {
      const p = orderData[i][1];
      if (arrMap[p] === false) continue;
      orderSheet.getRange(i + 1, 6).setValue('已取貨');
      deduct[p] = (deduct[p] || 0) + Number(orderData[i][2]);
    }
  }

  // 扣減群購商品剩餘待取量
  for (let i = 1; i < grpData.length; i++) {
    const p = grpData[i][0];
    if (deduct[p]) {
      grpSheet.getRange(i + 1, 4).setValue(Math.max(0, Number(grpData[i][3]) - deduct[p]));
    }
  }

  SpreadsheetApp.flush();
  return { success: true };
}

// ── undoPickup ────────────────────────────────────────────────

function undoPickup(customerName) {
  const orderSheet = getSheet(SH.ORDERS);
  const grpSheet   = getSheet(SH.GRP_PRODUCTS);

  const orderData = orderSheet.getDataRange().getValues();
  const grpData   = grpSheet.getDataRange().getValues();

  const restore = {};
  for (let i = 1; i < orderData.length; i++) {
    if (orderData[i][0] === customerName && orderData[i][5] === '已取貨') {
      orderSheet.getRange(i + 1, 6).setValue('未取貨');
      const p = orderData[i][1];
      restore[p] = (restore[p] || 0) + Number(orderData[i][2]);
    }
  }

  for (let i = 1; i < grpData.length; i++) {
    const p = grpData[i][0];
    if (restore[p]) {
      grpSheet.getRange(i + 1, 4).setValue(Number(grpData[i][3]) + restore[p]);
    }
  }

  SpreadsheetApp.flush();
  return { success: true };
}

// ── getTodayStats ─────────────────────────────────────────────

function getTodayStats() {
  const salesSheet = getSheet(SH.SALES);
  const dailySheet = getSheet(SH.DAILY);
  const today = todayStr();

  const salesData = salesSheet.getDataRange().getValues();
  const rows      = salesData.slice(1).filter(r => toDateStr(r[0]) === today);

  let totalRevenue = 0, cashRevenue = 0, transferRevenue = 0, linepayRevenue = 0;
  const txSet = new Set();
  let preorderCount = 0, walkCount = 0;

  rows.forEach(r => {
    const amt = Number(r[7]);
    const pay = String(r[8]);
    totalRevenue += amt;
    if (pay === 'cash')          cashRevenue += amt;
    else if (pay === 'transfer') transferRevenue += amt;
    else                         linepayRevenue += amt;

    const txKey = r[1] + '|' + r[2]; // 時間|客人
    if (!txSet.has(txKey)) {
      txSet.add(txKey);
      if (r[3] === 'preorder') preorderCount++;
      else walkCount++;
    }
  });

  const txCount = txSet.size;
  const avgOrder = txCount ? Math.round(totalRevenue / txCount) : 0;

  const dailyData   = dailySheet.getDataRange().getValues();
  const stockSummary = dailyData.slice(1)
    .filter(r => toDateStr(r[0]) === today)
    .map(r => ({
      name:      String(r[1]),
      openStock: Number(r[2]),
      sold:      Number(r[3]),
      remaining: Number(r[4]),
    }));

  return {
    date: today,
    totalRevenue, cashRevenue, transferRevenue, linepayRevenue,
    txCount, avgOrder, preorderCount, walkCount,
    stockSummary,
  };
}

// ── saveProduct ───────────────────────────────────────────────

function saveProduct(product) {
  const sheet = getSheet(SH.PRODUCTS);
  const data  = sheet.getDataRange().getValues();
  const arr   = product.arrived === false ? 'N' : 'Y';

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === product.name) {
      sheet.getRange(i + 1, 2).setValue(product.price);
      sheet.getRange(i + 1, 3).setValue(product.category  || '其他');
      sheet.getRange(i + 1, 4).setValue(product.barcode   || '');
      sheet.getRange(i + 1, 5).setValue(product.stockMode || 'reset');
      sheet.getRange(i + 1, 6).setValue(arr);
      SpreadsheetApp.flush();
      return { success: true, action: 'updated' };
    }
  }

  sheet.appendRow([
    product.name, product.price, product.category || '其他',
    product.barcode || '', product.stockMode || 'reset', arr,
  ]);
  SpreadsheetApp.flush();
  return { success: true, action: 'created' };
}

// ── deleteProduct ─────────────────────────────────────────────

function deleteProductRecord(name) {
  const sheet = getSheet(SH.PRODUCTS);
  const data  = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === name) sheet.deleteRow(i + 1);
  }
  SpreadsheetApp.flush();
  return { success: true };
}

// ── renameProduct ─────────────────────────────────────────────

function renameProduct(oldName, newName) {
  const sheet = getSheet(SH.PRODUCTS);
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === oldName) sheet.getRange(i + 1, 1).setValue(newName);
  }
  SpreadsheetApp.flush();
  return { success: true };
}

// ── getCostRecords ────────────────────────────────────────────
// 回傳所有進貨成本記錄，依進貨日期新→舊排序

function getCostRecords() {
  const sheet = getSheet(SH.COSTS);
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1)
    .filter(r => r[0])
    .map(r => ({
      product: String(r[0]),
      date:    toDateStr(r[1]),
      cost:    Number(r[2]),
      note:    String(r[3] || ''),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ── saveCostRecord ────────────────────────────────────────────

function saveCostRecord(product, date, cost, note) {
  const sheet = getSheet(SH.COSTS);
  sheet.appendRow([product, date, Number(cost), note || '']);
  SpreadsheetApp.flush();
  return { success: true };
}

// ── deleteCostRecord ──────────────────────────────────────────
// 刪除指定商品＋日期的成本記錄（可能有多筆，全部刪除）

function deleteCostRecord(product, date) {
  const sheet = getSheet(SH.COSTS);
  const data  = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === product && toDateStr(data[i][1]) === date) {
      sheet.deleteRow(i + 1);
    }
  }
  SpreadsheetApp.flush();
  return { success: true };
}

// ── getProductProfit ──────────────────────────────────────────
// 依日期範圍計算各商品毛利，使用銷售當日最近一筆進貨成本

function getProductProfit(startDate, endDate) {
  const salesSheet = getSheet(SH.SALES);
  const costSheet  = getSheet(SH.COSTS);

  const salesData = salesSheet.getDataRange().getValues();
  const costData  = costSheet.getDataRange().getValues();

  // 建立成本查找表：product → [{date, cost}] 按日期升序
  const costMap = {};
  costData.slice(1).forEach(r => {
    if (!r[0]) return;
    const p = String(r[0]);
    if (!costMap[p]) costMap[p] = [];
    costMap[p].push({ date: toDateStr(r[1]), cost: Number(r[2]) });
  });
  Object.values(costMap).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));

  function lookupCost(product, saleDate) {
    const records = costMap[product];
    if (!records) return null;
    let found = null;
    for (const r of records) {
      if (r.date <= saleDate) found = r.cost;
      else break;
    }
    return found;
  }

  // 彙總銷售並對應成本
  const prodMap = {};
  salesData.slice(1).forEach(r => {
    const d = toDateStr(r[0]);
    if (!d || d < startDate || d > endDate) return;
    const name      = String(r[4]);
    const qty       = Number(r[5]);
    const amount    = Number(r[7]);
    const unitCost  = lookupCost(name, d);

    if (!prodMap[name]) prodMap[name] = { name, qty: 0, amount: 0, totalCost: 0, hasCost: false };
    prodMap[name].qty    += qty;
    prodMap[name].amount += amount;
    if (unitCost !== null) {
      prodMap[name].totalCost += qty * unitCost;
      prodMap[name].hasCost    = true;
    }
  });

  return Object.values(prodMap).map(p => {
    const totalCost   = p.hasCost ? p.totalCost   : null;
    const grossProfit = p.hasCost ? p.amount - p.totalCost : null;
    const grossMargin = (p.hasCost && p.amount > 0)
      ? Math.round((p.amount - p.totalCost) / p.amount * 100)
      : null;
    return { name: p.name, qty: p.qty, amount: p.amount, totalCost, grossProfit, grossMargin };
  }).sort((a, b) => b.amount - a.amount);
}

// ── getRevenueByDate ──────────────────────────────────────────
// 回傳指定日期範圍的每日收款彙總（供報表用）
// startDate / endDate：YYYY-MM-DD

function getRevenueByDate(startDate, endDate) {
  const sheet = getSheet(SH.SALES);
  const data  = sheet.getDataRange().getValues();

  const dayMap = {};
  data.slice(1).forEach(r => {
    const d = toDateStr(r[0]);
    if (!d || d < startDate || d > endDate) return;
    if (!dayMap[d]) dayMap[d] = { date: d, revenue: 0, orders: new Set(), cash: 0, transfer: 0, linepay: 0 };
    const amt = Number(r[7]);
    const pay = String(r[8]);
    const txKey = String(r[1]) + '|' + String(r[2]);
    dayMap[d].revenue += amt;
    dayMap[d].orders.add(txKey);
    if (pay === 'cash')          dayMap[d].cash     += amt;
    else if (pay === 'transfer') dayMap[d].transfer += amt;
    else                         dayMap[d].linepay  += amt;
  });

  return Object.values(dayMap)
    .map(d => ({ date: d.date, revenue: d.revenue, orders: d.orders.size,
                 cash: d.cash, transfer: d.transfer, linepay: d.linepay }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── getProductSales ───────────────────────────────────────────
// 回傳指定日期範圍的商品銷售彙總

function getProductSales(startDate, endDate) {
  const sheet = getSheet(SH.SALES);
  const data  = sheet.getDataRange().getValues();

  const prodMap = {};
  data.slice(1).forEach(r => {
    const d = toDateStr(r[0]);
    if (!d || d < startDate || d > endDate) return;
    const name = String(r[4]);
    if (!prodMap[name]) prodMap[name] = { name, qty: 0, amount: 0 };
    prodMap[name].qty    += Number(r[5]);
    prodMap[name].amount += Number(r[7]);
  });

  return Object.values(prodMap).sort((a, b) => b.amount - a.amount);
}

// ── syncFromExternalOrders ────────────────────────────────────
// 從外部群購試算表匯入訂單（若與本試算表相同則為無操作）

function syncFromExternalOrders(spreadsheetId) {
  try {
    const srcSS    = SpreadsheetApp.openById(spreadsheetId);
    const srcOrder = srcSS.getSheetByName('訂單明細');
    if (!srcOrder) return { success: false, error: '來源試算表找不到「訂單明細」工作表' };

    const srcData = srcOrder.getDataRange().getValues();
    if (srcData.length <= 1) return { success: true, count: 0 };

    const destOrder  = getSheet(SH.ORDERS);
    const destData   = destOrder.getDataRange().getValues();

    // 以「客人姓名|商品名稱」為唯一鍵，避免重複匯入
    const existing = new Set(destData.slice(1).map(r => r[0] + '|' + r[1]));
    let count = 0;

    srcData.slice(1).forEach(r => {
      if (!r[0] || !r[1]) return;
      const key = r[0] + '|' + r[1];
      if (!existing.has(key)) {
        destOrder.appendRow([r[0], r[1], r[2], r[3], r[4], r[5] || '未取貨', r[6] || new Date()]);
        existing.add(key);
        count++;
      }
    });

    // 同步商品到貨資訊
    const srcProd = srcSS.getSheetByName('商品清單');
    if (srcProd && srcProd.getLastRow() > 1) {
      const srcProdData   = srcProd.getDataRange().getValues();
      const destGrpSheet  = getSheet(SH.GRP_PRODUCTS);
      const destProdData  = destGrpSheet.getDataRange().getValues();
      const existingProds = new Set(destProdData.slice(1).map(r => r[0]).filter(Boolean));

      srcProdData.slice(1).forEach(r => {
        if (!r[0] || existingProds.has(r[0])) return;
        destGrpSheet.appendRow([r[0], r[1], r[2], r[3], r[4] || '一般', r[5] || '', r[6] || '已到貨']);
        existingProds.add(r[0]);
      });
    }

    SpreadsheetApp.flush();
    return { success: true, count };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ── debugSales ────────────────────────────────────────────────
// 診斷用：回傳銷售記錄的基本統計，協助排查報表空資料問題

function debugSales() {
  const sheet = getSheet(SH.SALES);
  const data  = sheet.getDataRange().getValues();
  const total = data.length - 1;
  const sample = data.slice(1, 4).map(r => ({
    date: toDateStr(r[0]), time: r[1], customer: r[2], product: r[4], amount: r[7]
  }));
  return { totalRows: total, sample };
}
