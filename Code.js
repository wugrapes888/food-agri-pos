// ============================================================
// 團購發貨系統 - 主入口
// 部署前請在 Script Properties 設定：GEMINI_API_KEY
// ============================================================

// ── 食農 POS 工作表名稱 ───────────────────────────────────────
const POS_SH = {
  PRODUCTS:     '商品設定',   // POS 商品主檔（含條碼、分類、庫存模式）
  DAILY:        '每日庫存',   // 每日開攤 / 即時庫存
  SALES:        '銷售記錄',   // 每筆結帳明細
  ORDERS:       '訂單明細',   // 預購訂單（與群購系統共用）
  GRP_PRODUCTS: '商品清單',   // 群購商品清單（與群購系統共用）
  COSTS:        '成本設定',   // 進貨成本記錄（商品名稱、進貨日期、每單位成本）
  BATCHES:      '進貨批次',   // 批次進貨記錄
};

// ── 別名（供新函式共用）───────────────────────────────────────
const SH = POS_SH;
function getSheet(name)  { return posGetSheet(name); }
function toDateStr(val)  { return posToDateStr(val); }
function todayStr()      { return posTodayStr(); }

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle('團購發貨系統');
}

// ── 食農 POS API 入口（POST）────────────────────────────────
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
        result = posGetProducts();
        break;
      case 'getAllCustomers':
        result = SheetDB.getAllCustomers();
        break;
      case 'getCustomerCartForPOS':
        result = posGetCustomerCart(body.name);
        break;
      case 'submitCheckout':
        result = posSubmitCheckout(body.payload);
        break;
      case 'setDailyStock':
        result = posSetDailyStock(body.items);
        break;
      case 'getTodayStats':
        result = posGetTodayStats();
        break;
      case 'getCustomerDetail':
        result = SheetDB.getCustomerDetail(body.customerName);
        break;
      case 'completePickup':
        result = SheetDB.completePickup(body.customerName);
        break;
      case 'undoPickup':
        result = SheetDB.undoPickup(body.customerName);
        break;
      case 'syncFromExternalOrders':
        result = posSyncFromExternal(body.spreadsheetId);
        break;
      case 'saveProduct':
        result = posSaveProduct(JSON.parse(body.product));
        break;
      case 'deleteProduct':
        result = posDeleteProduct(body.name);
        break;
      case 'renameProduct':
        result = posRenameProduct(body.oldName, body.newName);
        break;
      case 'getRevenueByDate':
        result = posGetRevenueByDate(body.startDate, body.endDate);
        break;
      case 'getProductSales':
        result = posGetProductSales(body.startDate, body.endDate);
        break;
      case 'getCostRecords':
        result = posGetCostRecords();
        break;
      case 'saveCostRecord':
        result = posSaveCostRecord(body.product, body.date, body.cost, body.note);
        break;
      case 'deleteCostRecord':
        result = posDeleteCostRecord(body.product, body.date);
        break;
      case 'getProductProfit':
        result = posGetProductProfit(body.startDate, body.endDate);
        break;
      case 'getTodaySales':
        result = getTodaySales();
        break;
      case 'getPurchaseBatches':
        result = getPurchaseBatches();
        break;
      case 'savePurchaseBatch':
        result = savePurchaseBatch(body.product, body.purchaseDate, body.qty, body.unit, body.unitCost, body.note);
        break;
      case 'deletePurchaseBatch':
        result = deletePurchaseBatch(body.id);
        break;
      case 'updatePurchaseBatch':
        result = updatePurchaseBatch(body.id, body);
        break;
      case 'getProfitByDate':
        result = getProfitByDate(body.startDate, body.endDate);
        break;
      case 'getBatchProfit':
        result = getBatchProfit();
        break;
      case 'getChannelStats':
        result = getChannelStats(body.startDate, body.endDate);
        break;
      case 'debugSales':
        result = posDebugSales();
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

// ── POS 工具函式 ─────────────────────────────────────────────

function posGetSheet(name) {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    posInitHeaders(sheet, name);
  }
  return sheet;
}

function posInitHeaders(sheet, name) {
  const h = {
    [POS_SH.PRODUCTS]:     ['商品名稱', '單價', '分類', '條碼', '庫存模式', '已到貨'],
    [POS_SH.DAILY]:        ['日期', '商品名稱', '開攤數量', '售出數量', '剩餘數量', '單價'],
    [POS_SH.SALES]:        ['日期', '時間', '客人姓名', '客人類型', '商品名稱', '數量', '單價', '小計', '付款方式'],
    [POS_SH.COSTS]:        ['商品名稱', '進貨日期', '每單位成本', '備註'],
    [POS_SH.BATCHES]:      ['ID', '商品名稱', '進貨日期', '數量', '單位', '單位成本', '總成本', '剩餘數量', '備註'],
  };
  if (h[name]) { sheet.appendRow(h[name]); sheet.setFrozenRows(1); }
}

function posTodayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function posToDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return '';
}

// ── POS：取得商品清單 ─────────────────────────────────────────

function posGetProducts() {
  const prodSheet  = posGetSheet(POS_SH.PRODUCTS);
  const dailySheet = posGetSheet(POS_SH.DAILY);

  const prodData  = prodSheet.getDataRange().getValues();
  const dailyData = dailySheet.getDataRange().getValues();
  if (prodData.length <= 1) return [];

  const today = posTodayStr();
  const dayMap = {};
  dailyData.slice(1).forEach(function(r) {
    if (!r[1]) return;
    var d = posToDateStr(r[0]);
    if (!dayMap[d]) dayMap[d] = {};
    dayMap[d][String(r[1])] = { open: Number(r[2]), sold: Number(r[3]), remain: Number(r[4]), price: Number(r[5]) };
  });

  const todayMap = dayMap[today] || {};
  const prevDate = Object.keys(dayMap).filter(function(d){ return d < today; }).sort().pop();
  const prevMap  = prevDate ? dayMap[prevDate] : {};

  return prodData.slice(1).filter(function(r){ return r[0]; }).map(function(r) {
    var name      = String(r[0]);
    var price     = Number(r[1]) || 0;
    var category  = String(r[2] || '其他');
    var barcode   = String(r[3] || '');
    var stockMode = String(r[4] || 'reset');
    var arrived   = r[5] !== 'N' && r[5] !== '否' && r[5] !== false;
    var todayRec  = todayMap[name];
    var prevRec   = prevMap[name];
    var stock     = todayRec ? todayRec.remain : (arrived ? 999 : 0);
    var prevStock = prevRec  ? prevRec.remain  : null;
    return { name: name, price: price, category: category, barcode: barcode,
             stockMode: stockMode, arrived: arrived, stock: stock, prevStock: prevStock };
  });
}

// ── POS：設定每日庫存 ────────────────────────────────────────

function posSetDailyStock(items) {
  var dailySheet = posGetSheet(POS_SH.DAILY);
  var today = posTodayStr();
  var data  = dailySheet.getDataRange().getValues();

  for (var i = data.length - 1; i >= 1; i--) {
    if (posToDateStr(data[i][0]) === today) dailySheet.deleteRow(i + 1);
  }

  items.forEach(function(it) {
    dailySheet.appendRow([today, it.name, it.openStock || 0, 0, it.openStock || 0, it.price || 0]);
  });

  // 更新價格；若品項不存在則自動新增到商品主表
  var prodSheet  = posGetSheet(POS_SH.PRODUCTS);
  var prodData   = prodSheet.getDataRange().getValues();
  var existNames = prodData.slice(1).map(function(r) { return String(r[0]); });

  items.forEach(function(it) {
    var idx = existNames.indexOf(it.name);
    if (idx >= 0) {
      if (it.price !== undefined && it.price > 0) {
        prodSheet.getRange(idx + 2, 2).setValue(it.price);
      }
    } else {
      // 新品項：name, price, category, barcode, stockMode, arrived
      prodSheet.appendRow([it.name, it.price || 0, '其他', '', 'reset', '是']);
      existNames.push(it.name);
    }
  });

  SpreadsheetApp.flush();
  return { success: true };
}

// ── POS：結帳 ───────────────────────────────────────────────

function posSubmitCheckout(payload) {
  var customerName  = payload.customerName;
  var customerType  = payload.customerType;
  var items         = payload.items;
  var paymentMethod = payload.paymentMethod;
  var timestamp     = payload.timestamp;

  var today   = posTodayStr();
  var timeStr = Utilities.formatDate(
    new Date(timestamp || Date.now()), Session.getScriptTimeZone(), 'HH:mm:ss'
  );

  // 篩選有效品項
  var validItems = items.filter(function(i){ return i.arrived !== false; });
  if (validItems.length === 0) return { success: true };

  var salesSheet = posGetSheet(POS_SH.SALES);
  var dailySheet = posGetSheet(POS_SH.DAILY);

  // ① 批次寫入銷售記錄（N 個 appendRow → 1 次 setValues）
  var salesRows = validItems.map(function(item) {
    return [today, timeStr, customerName, customerType,
            item.name, item.qty, item.price, item.price * item.qty, paymentMethod];
  });
  var lastRow = salesSheet.getLastRow();
  salesSheet.getRange(lastRow + 1, 1, salesRows.length, 9).setValues(salesRows);

  // ② 批次更新每日庫存（先建扣減表，再一列一次 setValues 更新 2 欄）
  var deductMap = {};
  validItems.forEach(function(item) {
    deductMap[item.name] = (deductMap[item.name] || 0) + item.qty;
  });

  var dailyData = dailySheet.getDataRange().getValues();
  for (var i = 1; i < dailyData.length; i++) {
    if (posToDateStr(dailyData[i][0]) !== today) continue;
    var pName = dailyData[i][1];
    if (!deductMap[pName]) continue;
    var newSold   = Number(dailyData[i][3]) + deductMap[pName];
    var newRemain = Math.max(0, Number(dailyData[i][4]) - deductMap[pName]);
    dailySheet.getRange(i + 1, 4, 1, 2).setValues([[newSold, newRemain]]);
    delete deductMap[pName];
  }

  // ③ 預購客人：批次標記已取貨
  if (customerType === 'preorder' && customerName !== '散客') {
    var preorderNames = {};
    validItems.filter(function(i){ return i.isPreorder; })
              .forEach(function(i){ preorderNames[i.name] = true; });
    if (Object.keys(preorderNames).length > 0) {
      posMarkPickedUp(customerName, preorderNames);
    }
  }

  SpreadsheetApp.flush();
  return { success: true };
}

function posMarkPickedUp(customerName, itemNames) {
  var sheet = posGetSheet(POS_SH.ORDERS);
  var data  = sheet.getDataRange().getValues();
  // 先收集要改的列號，再批次寫入
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === customerName && data[i][5] === '未取貨' && itemNames[data[i][1]]) {
      rows.push(i + 1);
    }
  }
  rows.forEach(function(r){ sheet.getRange(r, 6).setValue('已取貨'); });
}

// ── POS：取得客人預購購物車 ──────────────────────────────────

function posGetCustomerCart(customerName) {
  var orderSheet = posGetSheet(POS_SH.ORDERS);
  var grpSheet   = posGetSheet(POS_SH.GRP_PRODUCTS);
  var orderData  = orderSheet.getDataRange().getValues();
  var grpData    = grpSheet.getDataRange().getValues();

  var arrMap = {};
  grpData.slice(1).forEach(function(r) {
    if (r[0]) arrMap[String(r[0])] = r[6] !== '未到貨';
  });

  return orderData.slice(1)
    .filter(function(r){ return r[0] === customerName && r[5] !== '已取貨'; })
    .map(function(r) {
      return { name: String(r[1]), qty: Number(r[2]), price: Number(r[3]),
               isPreorder: true, arrived: arrMap[r[1]] !== false };
    });
}

// ── POS：今日報表 ────────────────────────────────────────────

function posGetTodayStats() {
  var salesSheet = posGetSheet(POS_SH.SALES);
  var dailySheet = posGetSheet(POS_SH.DAILY);
  var today      = posTodayStr();

  var salesData = salesSheet.getDataRange().getValues();
  var rows      = salesData.slice(1).filter(function(r){ return posToDateStr(r[0]) === today; });

  var totalRevenue = 0, cashRevenue = 0, transferRevenue = 0, linepayRevenue = 0;
  var txSet = {}, txCount = 0, preorderCount = 0, walkCount = 0;

  rows.forEach(function(r) {
    var amt = Number(r[7]);
    var pay = String(r[8]);
    totalRevenue += amt;
    if (pay === 'cash')          cashRevenue += amt;
    else if (pay === 'transfer') transferRevenue += amt;
    else                         linepayRevenue += amt;

    var txKey = r[1] + '|' + r[2];
    if (!txSet[txKey]) {
      txSet[txKey] = true;
      txCount++;
      if (r[3] === 'preorder') preorderCount++;
      else walkCount++;
    }
  });

  var avgOrder = txCount ? Math.round(totalRevenue / txCount) : 0;
  var dailyData = dailySheet.getDataRange().getValues();
  var stockSummary = dailyData.slice(1)
    .filter(function(r){ return posToDateStr(r[0]) === today; })
    .map(function(r) {
      return { name: String(r[1]), openStock: Number(r[2]), sold: Number(r[3]), remaining: Number(r[4]) };
    });

  return { date: today, totalRevenue: totalRevenue, cashRevenue: cashRevenue,
           transferRevenue: transferRevenue, linepayRevenue: linepayRevenue,
           txCount: txCount, avgOrder: avgOrder,
           preorderCount: preorderCount, walkCount: walkCount,
           stockSummary: stockSummary };
}

// ── POS：商品 CRUD ───────────────────────────────────────────

function posSaveProduct(product) {
  var sheet = posGetSheet(POS_SH.PRODUCTS);
  var data  = sheet.getDataRange().getValues();
  var arr   = product.arrived === false ? 'N' : 'Y';

  for (var i = 1; i < data.length; i++) {
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

  sheet.appendRow([product.name, product.price, product.category || '其他',
                   product.barcode || '', product.stockMode || 'reset', arr]);
  SpreadsheetApp.flush();
  return { success: true, action: 'created' };
}

function posDeleteProduct(name) {
  var sheet = posGetSheet(POS_SH.PRODUCTS);
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === name) sheet.deleteRow(i + 1);
  }
  SpreadsheetApp.flush();
  return { success: true };
}

function posRenameProduct(oldName, newName) {
  var sheet = posGetSheet(POS_SH.PRODUCTS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === oldName) sheet.getRange(i + 1, 1).setValue(newName);
  }
  SpreadsheetApp.flush();
  return { success: true };
}

// ── POS：從外部群購試算表匯入訂單 ───────────────────────────

function posSyncFromExternal(spreadsheetId) {
  try {
    var srcSS  = SpreadsheetApp.openById(spreadsheetId);
    var srcOrd = srcSS.getSheetByName('訂單明細');
    if (!srcOrd) return { success: false, error: '來源試算表找不到「訂單明細」工作表' };

    var srcData  = srcOrd.getDataRange().getValues();
    if (srcData.length <= 1) return { success: true, count: 0 };

    var destOrd  = posGetSheet(POS_SH.ORDERS);
    var destData = destOrd.getDataRange().getValues();

    var existing = {};
    destData.slice(1).forEach(function(r){ existing[r[0] + '|' + r[1]] = true; });

    var count = 0;
    srcData.slice(1).forEach(function(r) {
      if (!r[0] || !r[1]) return;
      var key = r[0] + '|' + r[1];
      if (!existing[key]) {
        destOrd.appendRow([r[0], r[1], r[2], r[3], r[4], r[5] || '未取貨', r[6] || new Date()]);
        existing[key] = true;
        count++;
      }
    });

    var srcProd = srcSS.getSheetByName('商品清單');
    if (srcProd && srcProd.getLastRow() > 1) {
      var srcProdData  = srcProd.getDataRange().getValues();
      var destGrp      = posGetSheet(POS_SH.GRP_PRODUCTS);
      var destProdData = destGrp.getDataRange().getValues();
      var existProds   = {};
      destProdData.slice(1).forEach(function(r){ if (r[0]) existProds[r[0]] = true; });
      srcProdData.slice(1).forEach(function(r) {
        if (!r[0] || existProds[r[0]]) return;
        destGrp.appendRow([r[0], r[1], r[2], r[3], r[4] || '一般', r[5] || '', r[6] || '已到貨']);
        existProds[r[0]] = true;
      });
    }

    SpreadsheetApp.flush();
    return { success: true, count: count };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ── POS 報表：每日收款彙總 ────────────────────────────────────

function posGetRevenueByDate(startDate, endDate) {
  var sheet = posGetSheet(POS_SH.SALES);
  var data  = sheet.getDataRange().getValues();
  var dayMap = {};
  data.slice(1).forEach(function(r) {
    var d = posToDateStr(r[0]);
    if (!d || d < startDate || d > endDate) return;
    if (!dayMap[d]) dayMap[d] = { date: d, revenue: 0, orders: {}, cash: 0, transfer: 0, linepay: 0 };
    var amt = Number(r[7]), pay = String(r[8]);
    dayMap[d].revenue += amt;
    dayMap[d].orders[String(r[1]) + '|' + String(r[2])] = true;
    if (pay === 'cash')          dayMap[d].cash     += amt;
    else if (pay === 'transfer') dayMap[d].transfer += amt;
    else                         dayMap[d].linepay  += amt;
  });
  return Object.values(dayMap)
    .map(function(d) { return { date: d.date, revenue: d.revenue, orders: Object.keys(d.orders).length, cash: d.cash, transfer: d.transfer, linepay: d.linepay }; })
    .sort(function(a, b) { return a.date.localeCompare(b.date); });
}

// ── POS 報表：商品銷售彙總 ────────────────────────────────────

function posGetProductSales(startDate, endDate) {
  var sheet = posGetSheet(POS_SH.SALES);
  var data  = sheet.getDataRange().getValues();
  var prodMap = {};
  data.slice(1).forEach(function(r) {
    var d = posToDateStr(r[0]);
    if (!d || d < startDate || d > endDate) return;
    var name = String(r[4]);
    if (!prodMap[name]) prodMap[name] = { name: name, qty: 0, amount: 0 };
    prodMap[name].qty    += Number(r[5]);
    prodMap[name].amount += Number(r[7]);
  });
  return Object.values(prodMap).sort(function(a, b) { return b.amount - a.amount; });
}

// ── POS 報表：進貨成本記錄 ────────────────────────────────────

function posGetCostRecords() {
  var sheet = posGetSheet(POS_SH.COSTS);
  var data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).filter(function(r) { return r[0]; })
    .map(function(r) { return { product: String(r[0]), date: posToDateStr(r[1]), cost: Number(r[2]), note: String(r[3] || '') }; })
    .sort(function(a, b) { return b.date.localeCompare(a.date); });
}

function posSaveCostRecord(product, date, cost, note) {
  posGetSheet(POS_SH.COSTS).appendRow([product, date, Number(cost), note || '']);
  SpreadsheetApp.flush();
  return { success: true };
}

function posDeleteCostRecord(product, date) {
  var sheet = posGetSheet(POS_SH.COSTS);
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === product && posToDateStr(data[i][1]) === date) sheet.deleteRow(i + 1);
  }
  SpreadsheetApp.flush();
  return { success: true };
}

// ── POS 報表：商品毛利分析 ────────────────────────────────────

function posGetProductProfit(startDate, endDate) {
  var salesData = posGetSheet(POS_SH.SALES).getDataRange().getValues();
  var costData  = posGetSheet(POS_SH.COSTS).getDataRange().getValues();

  var costMap = {};
  costData.slice(1).forEach(function(r) {
    if (!r[0]) return;
    var p = String(r[0]);
    if (!costMap[p]) costMap[p] = [];
    costMap[p].push({ date: posToDateStr(r[1]), cost: Number(r[2]) });
  });
  Object.values(costMap).forEach(function(arr) { arr.sort(function(a, b) { return a.date.localeCompare(b.date); }); });

  function lookupCost(product, saleDate) {
    var records = costMap[product];
    if (!records) return null;
    var found = null;
    for (var i = 0; i < records.length; i++) {
      if (records[i].date <= saleDate) found = records[i].cost;
      else break;
    }
    return found;
  }

  var prodMap = {};
  salesData.slice(1).forEach(function(r) {
    var d = posToDateStr(r[0]);
    if (!d || d < startDate || d > endDate) return;
    var name = String(r[4]), qty = Number(r[5]), amount = Number(r[7]);
    var unitCost = lookupCost(name, d);
    if (!prodMap[name]) prodMap[name] = { name: name, qty: 0, amount: 0, totalCost: 0, hasCost: false };
    prodMap[name].qty    += qty;
    prodMap[name].amount += amount;
    if (unitCost !== null) { prodMap[name].totalCost += qty * unitCost; prodMap[name].hasCost = true; }
  });

  return Object.values(prodMap).map(function(p) {
    var totalCost   = p.hasCost ? p.totalCost : null;
    var grossProfit = p.hasCost ? p.amount - p.totalCost : null;
    var grossMargin = (p.hasCost && p.amount > 0) ? Math.round((p.amount - p.totalCost) / p.amount * 100) : null;
    return { name: p.name, qty: p.qty, amount: p.amount, totalCost: totalCost, grossProfit: grossProfit, grossMargin: grossMargin };
  }).sort(function(a, b) { return b.amount - a.amount; });
}

// ── 診斷：檢查銷售記錄原始資料 ───────────────────────────────────
function posDebugSales() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = ss.getSheets().map(function(s) { return s.getName(); });
  var salesSheet = ss.getSheetByName(POS_SH.SALES);
  if (!salesSheet) return { error: 'Sheet not found', allSheets: sheetNames };
  var data = salesSheet.getDataRange().getValues();
  var samples = data.slice(1, 6).map(function(r) {
    return {
      raw: String(r[0]),
      type: typeof r[0],
      isDate: r[0] instanceof Date,
      parsed: posToDateStr(r[0]),
      subtotal: r[7]
    };
  });
  return {
    spreadsheetUrl: ss.getUrl(),
    allSheets: sheetNames,
    totalRows: data.length - 1,
    samples: samples
  };
}

// ── getTodaySales ─────────────────────────────────────────────

function getTodaySales() {
  const sheet = getSheet(SH.SALES);
  const data  = sheet.getDataRange().getValues();
  const today = todayStr();
  const todayRows = data.slice(1).filter(r => toDateStr(r[0]) === today);
  const txMap = {};
  todayRows.forEach(r => {
    const key = r[1] + '__' + r[2] + '__' + r[8];
    if (!txMap[key]) {
      txMap[key] = { time: r[1] || '', customerName: r[2] || '', customerType: r[3] || '',
                     paymentMethod: r[8] || '', staffName: r[10] || '', items: [], total: 0 };
    }
    txMap[key].items.push({ name: String(r[4]), qty: Number(r[5]), price: Number(r[6]), subtotal: Number(r[7]) });
    txMap[key].total += Number(r[7]);
  });
  return Object.values(txMap).sort((a, b) => a.time.localeCompare(b.time));
}

// ── getPurchaseBatches ────────────────────────────────────────

function getPurchaseBatches() {
  const sheet = getSheet(SH.BATCHES);
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).filter(r => r[0]).map(r => ({
    id:           Number(r[0]),
    product:      String(r[1]),
    purchaseDate: toDateStr(r[2]),
    qty:          Number(r[3]),
    unit:         String(r[4] || ''),
    unitCost:     Number(r[5]),
    totalCost:    Number(r[6]),
    remainingQty: Number(r[7]),
    note:         String(r[8] || ''),
    sellingPrice: Number(r[9] || 0),
  })).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
}

// ── savePurchaseBatch ─────────────────────────────────────────

function savePurchaseBatch(product, purchaseDate, qty, unit, unitCost, note, sellingPrice) {
  const sheet = getSheet(SH.BATCHES);
  const data  = sheet.getDataRange().getValues();
  const maxId = data.slice(1).reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0);
  const id    = maxId + 1;
  const qtyN  = Number(qty);
  const costN = Number(unitCost);
  const spN   = Number(sellingPrice) || 0;
  sheet.appendRow([id, product, purchaseDate, qtyN, unit || '', costN, qtyN * costN, qtyN, note || '', spN]);
  SpreadsheetApp.flush();
  return { success: true, id };
}

// ── updatePurchaseBatch ───────────────────────────────────────

function updatePurchaseBatch(id, updates) {
  const sheet = getSheet(SH.BATCHES);
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][0]) === Number(id)) {
      if (updates.product      !== undefined) sheet.getRange(i + 1, 2).setValue(updates.product);
      if (updates.purchaseDate !== undefined) sheet.getRange(i + 1, 3).setValue(updates.purchaseDate);
      if (updates.qty          !== undefined) sheet.getRange(i + 1, 4).setValue(Number(updates.qty));
      if (updates.unit         !== undefined) sheet.getRange(i + 1, 5).setValue(updates.unit);
      if (updates.sellingPrice !== undefined) sheet.getRange(i + 1, 10).setValue(Number(updates.sellingPrice));
      const qty      = updates.qty      !== undefined ? Number(updates.qty)      : Number(data[i][3]);
      const unitCost = updates.unitCost !== undefined ? Number(updates.unitCost) : Number(data[i][5]);
      if (updates.unitCost !== undefined) sheet.getRange(i + 1, 6).setValue(unitCost);
      sheet.getRange(i + 1, 7).setValue(qty * unitCost);
      SpreadsheetApp.flush();
      return { success: true };
    }
  }
  return { success: false, error: 'Batch not found' };
}

// ── deletePurchaseBatch ───────────────────────────────────────

function deletePurchaseBatch(id) {
  const sheet = getSheet(SH.BATCHES);
  const data  = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (Number(data[i][0]) === Number(id)) sheet.deleteRow(i + 1);
  }
  SpreadsheetApp.flush();
  return { success: true };
}

// ── getProfitByDate ───────────────────────────────────────────

function getProfitByDate(startDate, endDate) {
  const salesData = getSheet(SH.SALES).getDataRange().getValues();
  const costData  = getSheet(SH.COSTS).getDataRange().getValues();
  const costMap = {};
  costData.slice(1).forEach(r => {
    if (!r[0]) return;
    const p = String(r[0]);
    if (!costMap[p]) costMap[p] = [];
    costMap[p].push({ date: toDateStr(r[1]), cost: Number(r[2]) });
  });
  Object.values(costMap).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));
  function lookupCost(product, saleDate) {
    const records = costMap[product]; if (!records) return null;
    let found = null;
    for (const r of records) { if (r.date <= saleDate) found = r.cost; else break; }
    return found;
  }
  const dayMap = {};
  salesData.slice(1).forEach(r => {
    const d = toDateStr(r[0]);
    if (!d || d < startDate || d > endDate) return;
    if (!dayMap[d]) dayMap[d] = { date: d, revenue: 0, cogs: 0, hasCost: false };
    const unitCost = lookupCost(String(r[4]), d);
    dayMap[d].revenue += Number(r[7]);
    if (unitCost !== null) { dayMap[d].cogs += Number(r[5]) * unitCost; dayMap[d].hasCost = true; }
  });
  return Object.values(dayMap).map(d => {
    const grossProfit = d.hasCost ? d.revenue - d.cogs : null;
    const marginPct   = (grossProfit !== null && d.revenue > 0) ? Math.round(grossProfit / d.revenue * 100) : null;
    return { date: d.date, revenue: d.revenue, cogs: d.cogs, grossProfit, marginPct };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

// ── getBatchProfit ────────────────────────────────────────────

function getBatchProfit() {
  const batchData = getSheet(SH.BATCHES).getDataRange().getValues();
  const salesData = getSheet(SH.SALES).getDataRange().getValues();
  if (batchData.length <= 1) return [];
  const priceMap = {};
  salesData.slice(1).forEach(r => {
    const name = String(r[4]), qty = Number(r[5]), amount = Number(r[7]);
    if (!priceMap[name]) priceMap[name] = { revenue: 0, qty: 0 };
    priceMap[name].revenue += amount;
    priceMap[name].qty     += qty;
  });
  return batchData.slice(1).filter(r => r[0]).map(r => {
    const product      = String(r[1]);
    const batchQty     = Number(r[3]);
    const unitCost     = Number(r[5]);
    const remainingQty = Number(r[7]);
    const soldQty      = Math.max(0, batchQty - remainingQty);
    const pData        = priceMap[product];
    const avgPrice     = pData && pData.qty > 0 ? pData.revenue / pData.qty : 0;
    const batchRev     = Math.round(soldQty * avgPrice);
    const profit       = avgPrice > 0 ? batchRev - soldQty * unitCost : null;
    const margin       = (profit !== null && batchRev > 0) ? Math.round(profit / batchRev * 100) : null;
    return { id: Number(r[0]), product, purchaseDate: toDateStr(r[2]), batchQty, soldQty, remainingQty,
             unitCost, batchCost: batchQty * unitCost, soldCost: soldQty * unitCost,
             batchRevenue: batchRev, grossProfit: profit, grossMargin: margin };
  });
}

// ── getChannelStats ───────────────────────────────────────────

function getChannelStats(startDate, endDate) {
  const data = getSheet(SH.SALES).getDataRange().getValues();
  const map = {};
  data.slice(1).forEach(r => {
    const d = toDateStr(r[0]);
    if (!d || d < startDate || d > endDate) return;
    const channel = String(r[3]) === 'preorder' ? 'pre' : 'pos';
    if (!map[channel]) map[channel] = { revenue: 0, txSet: new Set() };
    map[channel].revenue += Number(r[7]);
    map[channel].txSet.add(r[1] + '|' + r[2] + '|' + r[8]);
  });
  const LABEL = { pos: '現場POS', pre: '預購', line: 'LINE' };
  return Object.entries(map).map(([ch, d]) => ({
    channel: ch, channelLabel: LABEL[ch] || ch,
    revenue: d.revenue, orders: d.txSet.size,
    avgOrder: d.txSet.size > 0 ? Math.round(d.revenue / d.txSet.size) : 0,
  }));
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- 前端呼叫的 API ---

function getProducts() {
  return SheetDB.getProducts();
}

function getAllCustomers() {
  return SheetDB.getAllCustomers();
}

function getOrderSummary() {
  return SheetDB.getOrderSummary();
}

function getOrdersForExport(productNameOrGroup) {
  return SheetDB.getOrdersForExport(productNameOrGroup);
}

function createExportFile(rows, title) {
  const ss = SpreadsheetApp.create(title || '訂單匯出');
  const sheet = ss.getActiveSheet();
  sheet.setName('訂單');
  sheet.getRange(1, 1, 1, 6).setValues([['客人姓名','商品','數量','單價','小計','取貨狀態']]);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  if (rows.length > 0) {
    const data = rows.map(r => [r.customer, r.product, r.qty, r.price||0, r.subtotal||0, r.status]);
    sheet.getRange(2, 1, data.length, 6).setValues(data);

    // ── 品項彙整區 ──
    const summaryStartRow = data.length + 3;

    // 標題
    sheet.getRange(summaryStartRow, 1, 1, 4).setValues([['品項彙整', '', '', '']]);
    sheet.getRange(summaryStartRow, 1).setFontWeight('bold').setFontSize(12);

    // 小標題
    sheet.getRange(summaryStartRow + 1, 1, 1, 4).setValues([['商品', '訂購總數', '單價', '小計']]);
    sheet.getRange(summaryStartRow + 1, 1, 1, 4).setFontWeight('bold').setBackground('#e8eaf6');

    // 統計每個品項（排除「總計」等彙整列）
    const productMap = {};
    const productOrder = [];
    rows.filter(r => r.customer !== '總計').forEach(r => {
      if (!productMap[r.product]) {
        productMap[r.product] = { qty: 0, price: r.price || 0 };
        productOrder.push(r.product);
      }
      productMap[r.product].qty += r.qty;
    });

    const summaryData = productOrder.map(name => {
      const p = productMap[name];
      return [name, p.qty, p.price, p.qty * p.price];
    });
    sheet.getRange(summaryStartRow + 2, 1, summaryData.length, 4).setValues(summaryData);

    // 合計列
    const grandTotal = summaryData.reduce((s, r) => s + r[3], 0);
    const totalQty = summaryData.reduce((s, r) => s + r[1], 0);
    const totalRow = summaryStartRow + 2 + summaryData.length;
    sheet.getRange(totalRow, 1, 1, 4).setValues([['合計', totalQty, '', grandTotal]]);
    sheet.getRange(totalRow, 1, 1, 4).setFontWeight('bold').setBackground('#c5cae9');
  }
  sheet.autoResizeColumns(1, 6);
  return 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
}

function getBuyersByProduct(productName) {
  return SheetDB.getBuyersByProduct(productName);
}

function getCustomerDetail(customerName) {
  return SheetDB.getCustomerDetail(customerName);
}

function completePickup(customerName) {
  return SheetDB.completePickup(customerName);
}

function undoPickup(customerName) {
  return SheetDB.undoPickup(customerName);
}

function parseLineScreenshot(base64Image) {
  return OCR.parseImage(base64Image);
}

function importOrders(orders) {
  return SheetDB.importOrders(orders);
}

function clearAllData() {
  return SheetDB.clearAllData();
}

function getStats() {
  return SheetDB.getStats();
}

function getProductsForManagement() {
  return SheetDB.getProductsForManagement();
}

function saveProduct(product) {
  return SheetDB.saveProduct(product);
}

function deleteProduct(name) {
  return SheetDB.deleteProduct(name);
}

function batchSaveProducts(products) {
  return SheetDB.batchSaveProducts(products);
}

function toggleProductArrival(productName) {
  return SheetDB.toggleProductArrival(productName);
}

function renameCustomer(oldName, newName) {
  return SheetDB.renameCustomer(oldName, newName);
}

function parseTextOrders(text) {
  return OCR.parseText(text);
}

function deleteOrderRow(customerName, productName) {
  return SheetDB.deleteOrderRow(customerName, productName);
}

function deleteCustomerAllOrders(customerName) {
  return SheetDB.deleteCustomerAllOrders(customerName);
}

function setupApiKey() {
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', 'AIzaSyChXpE3FYQdMgwy4x3eabMla1sNaGF_Si0');
  return 'API Key 設定完成';
}

// ── 報表：密碼驗證後回傳所有統計資料 ─────────────────────────
function getReportData(password) {
  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty('REPORT_PASSWORD');
  if (!stored) stored = '316'; // 初次使用的預設密碼
  if (password !== stored) return { error: '密碼錯誤' };

  return {
    success: true,
    groupStats: SheetDB.getStats(),
    orderSummary: SheetDB.getOrderSummary(),
    todayStats: posGetTodayStats(),
    allCustomers: SheetDB.getAllCustomers()
  };
}

function setReportPassword(newPassword) {
  PropertiesService.getScriptProperties().setProperty('REPORT_PASSWORD', newPassword);
  return { success: true };
}
