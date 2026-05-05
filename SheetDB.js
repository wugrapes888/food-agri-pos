// ============================================================
// 團購發貨系統 - Google Sheets 資料庫操作
// Sheets: 「商品清單」、「訂單明細」
// ============================================================

const SheetDB = (() => {
  const SHEET = { PRODUCTS: '商品清單', ORDERS: '訂單明細' };

  // ── 工具函式 ──────────────────────────────────────────────

  function ss() {
    return SpreadsheetApp.getActiveSpreadsheet();
  }

  function getSheet(name) {
    let sheet = ss().getSheetByName(name);
    if (!sheet) {
      sheet = ss().insertSheet(name);
      _initHeaders(sheet, name);
    } else {
      // 確保標題列存在（第一欄不是預期的標題時補上）
      const firstCell = sheet.getRange(1, 1).getValue();
      const needsHeader = (name === SHEET.ORDERS && firstCell !== '客人姓名')
                       || (name === SHEET.PRODUCTS && firstCell !== '商品名稱');
      if (needsHeader) {
        sheet.insertRowBefore(1);
        if (name === SHEET.ORDERS) {
          sheet.getRange(1, 1, 1, 7).setValues([['客人姓名','商品名稱','數量','單價','小計','取貨狀態','建立時間']]);
        } else {
          sheet.getRange(1, 1, 1, 6).setValues([['商品名稱','單價','總訂購量','剩餘待取量','類型','備註']]);
        }
        sheet.setFrozenRows(1);
      }
    }
    return sheet;
  }

  function _initHeaders(sheet, name) {
    if (name === SHEET.PRODUCTS) {
      sheet.appendRow(['商品名稱', '單價', '總訂購量', '剩餘待取量']);
      sheet.setFrozenRows(1);
    } else if (name === SHEET.ORDERS) {
      sheet.appendRow(['客人姓名', '商品名稱', '數量', '單價', '小計', '取貨狀態', '建立時間']);
      sheet.setFrozenRows(1);
    }
  }

  // ── 商品清單（含群組合併）────────────────────────────────

  function getProducts() {
    const sheet = getSheet(SHEET.PRODUCTS);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const rows = data.slice(1).filter(r => r[0]).map(r => ({
      name: r[0], price: r[1], totalQty: r[2], remainingQty: r[3],
      type: r[4] || '一般', group: r[5] || '', arrived: r[6] !== '未到貨'
    }));

    // 有群組名稱的商品合併成一個群組項目
    const groupMap = {};
    const standalone = [];

    rows.forEach(r => {
      if (r.group) {
        if (!groupMap[r.group]) {
          groupMap[r.group] = { name: r.group, isGroup: true, totalQty: 0, remainingQty: 0, price: null, arrived: true };
        }
        groupMap[r.group].totalQty += r.totalQty;
        groupMap[r.group].remainingQty += r.remainingQty;
        if (!r.arrived) groupMap[r.group].arrived = false;
      } else {
        standalone.push({ ...r, isGroup: false });
      }
    });

    return [...standalone, ...Object.values(groupMap)]
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
  }

  // ── 依商品／群組查買家 ────────────────────────────────────

  function getBuyersByProduct(productNameOrGroup) {
    const productSheet = getSheet(SHEET.PRODUCTS);
    const ordersSheet = getSheet(SHEET.ORDERS);

    // 找出所有屬於此群組的商品名稱
    const productData = productSheet.getDataRange().getValues();
    const matchProducts = new Set();
    productData.slice(1).forEach(r => {
      if (!r[0]) return;
      if (r[5] === productNameOrGroup) matchProducts.add(r[0]); // 群組
    });
    // 若沒有群組符合，當作單一商品名稱
    if (matchProducts.size === 0) matchProducts.add(productNameOrGroup);

    const data = ordersSheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const map = {};
    const order = [];
    data.slice(1).forEach(r => {
      if (!matchProducts.has(r[1])) return;
      const name = r[0];
      if (!map[name]) { map[name] = { name, qty: 0, status: r[5] }; order.push(name); }
      map[name].qty += r[2];
      if (r[5] !== '已取貨') map[name].status = '未取貨';
    });

    return order.map(n => map[n]);
  }

  // ── 客人明細 ──────────────────────────────────────────────

  function getCustomerDetail(customerName) {
    const ordersSheet = getSheet(SHEET.ORDERS);
    const productsSheet = getSheet(SHEET.PRODUCTS);

    const orderData = ordersSheet.getDataRange().getValues();
    const productData = productsSheet.getDataRange().getValues();

    if (orderData.length <= 1) return null;

    const arrivalMap = {};
    productData.slice(1).forEach(r => {
      if (r[0]) arrivalMap[r[0]] = r[6] !== '未到貨';
    });

    const items = orderData.slice(1)
      .filter(r => r[0] === customerName)
      .map(r => ({
        product: r[1],
        qty: r[2],
        price: r[3],
        subtotal: r[4],
        status: r[5],
        arrived: arrivalMap[r[1]] !== false
      }));

    if (items.length === 0) return null;

    const arrivedItems = items.filter(i => i.arrived);
    const arrivedTotal = arrivedItems.reduce((s, i) => s + i.subtotal, 0);
    const allTotal = items.reduce((s, i) => s + i.subtotal, 0);
    const picked = arrivedItems.length > 0 && arrivedItems.every(i => i.status === '已取貨');

    return { name: customerName, items, arrivedTotal, allTotal, picked };
  }

  // ── 完成取貨（同步扣庫存）────────────────────────────────

  function completePickup(customerName) {
    const ordersSheet = getSheet(SHEET.ORDERS);
    const productsSheet = getSheet(SHEET.PRODUCTS);

    const orderData = ordersSheet.getDataRange().getValues();
    const productData = productsSheet.getDataRange().getValues();

    const arrivalMap = {};
    productData.slice(1).forEach(r => {
      if (r[0]) arrivalMap[r[0]] = r[6] !== '未到貨';
    });

    const deduct = {};

    for (let i = 1; i < orderData.length; i++) {
      if (orderData[i][0] === customerName && orderData[i][5] === '未取貨') {
        const p = orderData[i][1];
        if (arrivalMap[p] === false) continue; // 未到貨的品項跳過
        ordersSheet.getRange(i + 1, 6).setValue('已取貨');
        const q = orderData[i][2];
        deduct[p] = (deduct[p] || 0) + q;
      }
    }

    for (let i = 1; i < productData.length; i++) {
      const p = productData[i][0];
      if (deduct[p]) {
        const cur = Number(productData[i][3]);
        productsSheet.getRange(i + 1, 4).setValue(Math.max(0, cur - deduct[p]));
      }
    }

    SpreadsheetApp.flush();
    return { success: true };
  }

  // ── 取消取貨（退還庫存）──────────────────────────────────

  function undoPickup(customerName) {
    const ordersSheet = getSheet(SHEET.ORDERS);
    const productsSheet = getSheet(SHEET.PRODUCTS);

    const orderData = ordersSheet.getDataRange().getValues();
    const productData = productsSheet.getDataRange().getValues();

    const restore = {};

    for (let i = 1; i < orderData.length; i++) {
      if (orderData[i][0] === customerName && orderData[i][5] === '已取貨') {
        ordersSheet.getRange(i + 1, 6).setValue('未取貨');
        const p = orderData[i][1], q = orderData[i][2];
        restore[p] = (restore[p] || 0) + q;
      }
    }

    for (let i = 1; i < productData.length; i++) {
      const p = productData[i][0];
      if (restore[p]) {
        const cur = Number(productData[i][3]);
        productsSheet.getRange(i + 1, 4).setValue(cur + restore[p]);
      }
    }

    SpreadsheetApp.flush();
    return { success: true };
  }

  // ── 匯入 OCR 解析的訂單 ───────────────────────────────────

  function importOrders(orders) {
    // orders: [{ customer, product, qty, price }]
    const ordersSheet = getSheet(SHEET.ORDERS);
    const productsSheet = getSheet(SHEET.PRODUCTS);

    const productData = productsSheet.getDataRange().getValues();
    const priceMap = {};
    productData.slice(1).forEach(r => { if (r[0]) priceMap[r[0]] = r[1]; });

    const productSet = new Set(productData.slice(1).map(r => r[0]).filter(Boolean));
    const now = new Date();

    orders.forEach(o => {
      const price = o.price || priceMap[o.product] || 0;
      const subtotal = price * o.qty;
      ordersSheet.appendRow([o.customer, o.product, o.qty, price, subtotal, '未取貨', now]);

      if (!productSet.has(o.product)) {
        // group 欄位放到備註（第6欄），作為群組名稱
        productsSheet.appendRow([o.product, price, 0, 0, '規格', o.group || '']);
        productSet.add(o.product);
        priceMap[o.product] = price;
      }
    });

    SpreadsheetApp.flush();
    _recalcStock();
    return { success: true, count: orders.length };
  }

  // ── 重算庫存（依訂單狀態）────────────────────────────────

  function _recalcStock() {
    const ordersSheet = getSheet(SHEET.ORDERS);
    const productsSheet = getSheet(SHEET.PRODUCTS);

    const orderData = ordersSheet.getDataRange().getValues();
    const productData = productsSheet.getDataRange().getValues();

    const total = {}, picked = {};
    orderData.slice(1).forEach(r => {
      if (!r[1]) return;
      const p = r[1], q = Number(r[2]);
      total[p] = (total[p] || 0) + q;
      if (r[5] === '已取貨') picked[p] = (picked[p] || 0) + q;
    });

    for (let i = 1; i < productData.length; i++) {
      const p = productData[i][0];
      if (!p) continue;
      const t = total[p] || 0;
      const k = picked[p] || 0;
      productsSheet.getRange(i + 1, 3).setValue(t);
      productsSheet.getRange(i + 1, 4).setValue(t - k);
    }

    SpreadsheetApp.flush();
  }

  // ── 統計資料 ──────────────────────────────────────────────

  function getStats() {
    const sheet = getSheet(SHEET.ORDERS);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { total: 0, picked: 0, pending: 0, revenue: 0 };

    const rows = data.slice(1).filter(r => r[0]);
    const customers = new Set(rows.map(r => r[0]));
    const pickedCustomers = new Set(
      rows.filter(r => r[5] === '已取貨').map(r => r[0])
    );

    // 全單都已取貨的客人算已完成
    const fullyPicked = [...customers].filter(c => {
      const cRows = rows.filter(r => r[0] === c);
      return cRows.every(r => r[5] === '已取貨');
    });

    const revenue = rows
      .filter(r => r[5] === '已取貨')
      .reduce((s, r) => s + Number(r[4]), 0);

    return {
      total: customers.size,
      picked: fullyPicked.length,
      pending: customers.size - fullyPicked.length,
      revenue
    };
  }

  // ── 清除所有資料（重新開團用）────────────────────────────

  function clearAllData() {
    const ordersSheet = getSheet(SHEET.ORDERS);
    const productsSheet = getSheet(SHEET.PRODUCTS);

    const oRows = ordersSheet.getLastRow();
    if (oRows > 1) ordersSheet.deleteRows(2, oRows - 1);

    const pRows = productsSheet.getLastRow();
    if (pRows > 1) productsSheet.deleteRows(2, pRows - 1);

    return { success: true };
  }

  // ── 刪除訂單 ─────────────────────────────────────────────

  function deleteOrderRow(customerName, productName) {
    const ordersSheet = getSheet(SHEET.ORDERS);
    const productsSheet = getSheet(SHEET.PRODUCTS);
    const orderData = ordersSheet.getDataRange().getValues();

    let deletedQty = 0, wasPicked = false;

    for (let i = orderData.length - 1; i >= 1; i--) {
      if (orderData[i][0] === customerName && orderData[i][1] === productName) {
        deletedQty = Number(orderData[i][2]);
        wasPicked = orderData[i][5] === '已取貨';
        ordersSheet.deleteRow(i + 1);
        break;
      }
    }

    // 若尚未取貨，將總訂購量與剩餘量各減少
    if (deletedQty > 0) {
      const productData = productsSheet.getDataRange().getValues();
      for (let i = 1; i < productData.length; i++) {
        if (productData[i][0] === productName) {
          const newTotal = Math.max(0, Number(productData[i][2]) - deletedQty);
          const newRemain = wasPicked
            ? Number(productData[i][3])
            : Math.max(0, Number(productData[i][3]) - deletedQty);
          productsSheet.getRange(i + 1, 3).setValue(newTotal);
          productsSheet.getRange(i + 1, 4).setValue(newRemain);
          break;
        }
      }
    }

    SpreadsheetApp.flush();
    return { success: true };
  }

  function renameCustomer(oldName, newName) {
    const sheet = getSheet(SHEET.ORDERS);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === oldName) sheet.getRange(i + 1, 1).setValue(newName);
    }
    SpreadsheetApp.flush();
    return { success: true };
  }

  function deleteCustomerAllOrders(customerName) {
    const ordersSheet = getSheet(SHEET.ORDERS);
    const orderData = ordersSheet.getDataRange().getValues();

    // 收集要還原的庫存
    const restore = {}, deductTotal = {};
    for (let i = orderData.length - 1; i >= 1; i--) {
      if (orderData[i][0] === customerName) {
        const p = orderData[i][1], q = Number(orderData[i][2]);
        deductTotal[p] = (deductTotal[p] || 0) + q;
        if (orderData[i][5] !== '已取貨') restore[p] = (restore[p] || 0) + q;
        ordersSheet.deleteRow(i + 1);
      }
    }

    const productsSheet = getSheet(SHEET.PRODUCTS);
    const productData = productsSheet.getDataRange().getValues();
    for (let i = 1; i < productData.length; i++) {
      const p = productData[i][0];
      if (deductTotal[p]) {
        productsSheet.getRange(i + 1, 3).setValue(Math.max(0, Number(productData[i][2]) - deductTotal[p]));
        productsSheet.getRange(i + 1, 4).setValue(Math.max(0, Number(productData[i][3]) - (restore[p] || 0)));
      }
    }

    SpreadsheetApp.flush();
    return { success: true };
  }

  // ── 商品管理 CRUD ─────────────────────────────────────────

  function getProductsForManagement() {
    const sheet = getSheet(SHEET.PRODUCTS);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).filter(r => r[0]).map(r => ({
      name: r[0],
      price: r[1],
      type: r[4] || '一般',
      note: r[5] || '',
      arrived: r[6] !== '未到貨'
    }));
  }

  function saveProduct(product) {
    // product: { name, price, type, note, arrived }
    const sheet = getSheet(SHEET.PRODUCTS);
    const data = sheet.getDataRange().getValues();

    if (data[0].length < 6) {
      sheet.getRange(1, 5).setValue('類型');
      sheet.getRange(1, 6).setValue('備註');
    }
    if (data[0].length < 7) sheet.getRange(1, 7).setValue('到貨狀態');

    const arrivedVal = product.arrived === false ? '未到貨' : '已到貨';

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === product.name) {
        sheet.getRange(i + 1, 2).setValue(product.price);
        sheet.getRange(i + 1, 5).setValue(product.type || '一般');
        sheet.getRange(i + 1, 6).setValue(product.note || '');
        sheet.getRange(i + 1, 7).setValue(arrivedVal);
        SpreadsheetApp.flush();
        return { success: true, action: 'updated' };
      }
    }

    sheet.appendRow([product.name, product.price, 0, 0, product.type || '一般', product.note || '', arrivedVal]);
    SpreadsheetApp.flush();
    return { success: true, action: 'created' };
  }

  function toggleProductArrival(productName) {
    const sheet = getSheet(SHEET.PRODUCTS);
    const data = sheet.getDataRange().getValues();
    if (data[0].length < 7) sheet.getRange(1, 7).setValue('到貨狀態');
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === productName) {
        const cur = data[i][6] || '已到貨';
        sheet.getRange(i + 1, 7).setValue(cur === '未到貨' ? '已到貨' : '未到貨');
      }
    }
    SpreadsheetApp.flush();
    return { success: true };
  }

  function deleteProduct(name) {
    const sheet = getSheet(SHEET.PRODUCTS);
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === name) {
        sheet.deleteRow(i + 1);
      }
    }
    SpreadsheetApp.flush();
    return { success: true };
  }

  function batchSaveProducts(products) {
    // products: [{ name, price, type, note }]
    products.forEach(p => saveProduct(p));
    return { success: true, count: products.length };
  }

  function getOrdersForExport(productNameOrGroup) {
    const productSheet = getSheet(SHEET.PRODUCTS);
    const ordersSheet = getSheet(SHEET.ORDERS);

    // 找出所有屬於此群組或品項的商品名稱
    const productData = productSheet.getDataRange().getValues();
    const matchProducts = new Set();
    if (productNameOrGroup === '__ALL__') {
      productData.slice(1).forEach(r => { if (r[0]) matchProducts.add(r[0]); });
    } else {
      productData.slice(1).forEach(r => {
        if (!r[0]) return;
        if (r[5] === productNameOrGroup) matchProducts.add(r[0]);
      });
      if (matchProducts.size === 0) matchProducts.add(productNameOrGroup);
    }

    const orderData = ordersSheet.getDataRange().getValues();
    const rows = orderData.slice(1).filter(r => r[0] && matchProducts.has(r[1]));

    return rows.map(r => ({
      customer: r[0],
      product: r[1],
      qty: r[2],
      price: r[3],
      subtotal: r[4],
      status: r[5]
    }));
  }

  function getOrderSummary() {
    const productSheet = getSheet(SHEET.PRODUCTS);
    const ordersSheet = getSheet(SHEET.ORDERS);

    const productData = productSheet.getDataRange().getValues();
    const orderData = ordersSheet.getDataRange().getValues();

    // 計算每個品項的總訂購量
    const totalQty = {};
    orderData.slice(1).forEach(r => {
      if (!r[1]) return;
      totalQty[r[1]] = (totalQty[r[1]] || 0) + Number(r[2]);
    });

    // 建立群組結構
    const groupMap = {};
    const standalone = [];

    productData.slice(1).forEach(r => {
      if (!r[0]) return;
      const name = r[0], price = r[1], group = r[5] || '';
      const qty = totalQty[name] || 0;
      if (qty === 0) return; // 沒有訂單的品項略過

      if (group) {
        if (!groupMap[group]) groupMap[group] = { groupName: group, total: 0, variants: [] };
        groupMap[group].variants.push({ name, price, qty });
        groupMap[group].total += qty;
      } else {
        standalone.push({ name, price, qty });
      }
    });

    return {
      groups: Object.values(groupMap).sort((a, b) => a.groupName.localeCompare(b.groupName, 'zh-TW')),
      standalone: standalone.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
    };
  }

  function getAllCustomers() {
    const sheet = getSheet(SHEET.ORDERS);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const map = {};
    const order = [];
    data.slice(1).forEach(r => {
      if (!r[0]) return;
      const name = r[0];
      if (!map[name]) { map[name] = { name, qty: 0, status: '已取貨' }; order.push(name); }
      map[name].qty += Number(r[2]);
      if (r[5] !== '已取貨') map[name].status = '未取貨';
    });

    return order.map(n => map[n]);
  }

  return {
    getProducts,
    getOrderSummary,
    getAllCustomers,
    getBuyersByProduct,
    getCustomerDetail,
    completePickup,
    undoPickup,
    importOrders,
    getStats,
    clearAllData,
    getProductsForManagement,
    saveProduct,
    deleteProduct,
    batchSaveProducts,
    deleteOrderRow,
    deleteCustomerAllOrders,
    getOrdersForExport,
    toggleProductArrival,
    renameCustomer
  };
})();
