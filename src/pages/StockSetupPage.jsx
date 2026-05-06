import { useState, useEffect, useRef } from 'react'
import {
  getProductsForPOS, setDailyStock, saveProduct, deleteProduct, renameProduct, getCostRecords,
  getPurchaseBatches, savePurchaseBatch, deletePurchaseBatch, updatePurchaseBatch, clearPOSCache,
} from '../services/gasApi'

const CATEGORIES = ['水果', '蔬菜', '蛋類', '冷凍食品', '加工品', '其他']
const EMPTY_FORM  = { name: '', price: '', openStock: '', category: '其他', stockMode: 'reset', arrived: true }

const fmtDate = d => d.toISOString().slice(0, 10)

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="w-7 h-7 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function MiniStat({ label, value, sub, color = 'green' }) {
  const colors = {
    green:  'bg-green-50  border-green-200  text-green-700',
    blue:   'bg-blue-50   border-blue-200   text-blue-700',
    amber:  'bg-amber-50  border-amber-200  text-amber-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">{label}</div>
      <div className="text-3xl font-black">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── 進貨管理 ────────────────────────────────────────────────────
function PurchaseSection({ onOpenPOS }) {
  const today = fmtDate(new Date())
  const EMPTY_PURCHASE = { product: '', purchaseDate: today, qty: '', unit: '', unitCost: '', sellingPrice: '', note: '' }

  const [batches,      setBatches]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState('')
  const [sortBy,       setSortBy]       = useState('date')
  const [filterProd,   setFilterProd]   = useState('')
  const [pendingEdits, setPendingEdits] = useState({})
  const [form, setForm] = useState(EMPTY_PURCHASE)

  const load = (quiet = false) => {
    if (!quiet) setLoading(true)
    getPurchaseBatches()
      .then(data => setBatches(Array.isArray(data) ? data : []))
      .finally(() => { if (!quiet) setLoading(false) })
  }
  useEffect(() => { load() }, [])

  // 毛利試算
  const fc = Number(form.unitCost)    || 0
  const fp = Number(form.sellingPrice) || 0
  const fProfit = fc > 0 && fp > 0 ? fp - fc : null
  const fMargin = fProfit !== null && fp > 0 ? Math.round(fProfit / fp * 100) : null

  const [openStalling, setOpenStalling] = useState(false)
  const [openError,    setOpenError]    = useState('')
  const [opened,       setOpened]       = useState(false)

  const handleSave = async () => {
    if (!form.product.trim() || !form.purchaseDate || !form.qty || !form.unitCost) return
    setSaving(true)
    setSaveError('')
    try {
      await savePurchaseBatch(
        form.product.trim(), form.purchaseDate,
        Number(form.qty), form.unit, Number(form.unitCost), form.note,
        Number(form.sellingPrice) || 0
      )
      setForm({ ...EMPTY_PURCHASE, purchaseDate: form.purchaseDate })
      load(true)
    } catch (e) {
      setSaveError(e.message || '儲存失敗，請確認 GAS 設定')
    } finally { setSaving(false) }
  }

  const handleOpenStall = async () => {
    setOpenStalling(true)
    setOpenError('')
    try {
      // 同一商品取最新那筆的售價；開攤數量 = 各批次 remainingQty 加總
      const productMap = {}
      ;[...batches].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate)).forEach(b => {
        if (!productMap[b.product]) productMap[b.product] = { openStock: 0, price: 0 }
        productMap[b.product].openStock += b.remainingQty
        if (b.sellingPrice > 0) productMap[b.product].price = b.sellingPrice
      })
      const items = Object.entries(productMap)
        .filter(([, v]) => v.openStock > 0)
        .map(([name, v]) => ({ name, openStock: v.openStock, price: v.price }))
      if (items.length === 0) { setOpenError('沒有可開攤的品項'); return }
      await setDailyStock(items, [])
      clearPOSCache()
      setOpened(true)
    } catch (e) {
      setOpenError(e.message || '開攤失敗')
    } finally { setOpenStalling(false) }
  }

  const handleDelete = async (id) => { await deletePurchaseBatch(id); load(true) }

  const handleFieldChange = (id, field, value) =>
    setPendingEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }))

  const handleFieldBlur = async (b, field) => {
    const pending = pendingEdits[b.id]
    if (!pending || pending[field] === undefined) return
    const value = pending[field]
    setPendingEdits(prev => {
      const updated = { ...(prev[b.id] || {}) }; delete updated[field]
      return { ...prev, [b.id]: updated }
    })
    if (field === 'product'      && (!value.trim() || value.trim() === b.product)) return
    if (field === 'purchaseDate' && (!value || value === b.purchaseDate)) return
    if (field === 'unit'         && value === b.unit) return
    if (field === 'qty')          { const n = Number(value); if (!value || isNaN(n) || n <= 0 || n === b.qty)          return }
    if (field === 'unitCost')     { const n = Number(value); if (!value || isNaN(n) || n <= 0 || n === b.unitCost)     return }
    if (field === 'sellingPrice') { const n = Number(value); if (isNaN(n) || n === b.sellingPrice) return }
    const isStr = field === 'product' || field === 'purchaseDate' || field === 'unit'
    await updatePurchaseBatch(b.id, { [field]: isStr ? (value.trim?.() ?? value) : Number(value) })
    load(true)
  }

  const displayField = (b, field) =>
    pendingEdits[b.id]?.[field] !== undefined ? pendingEdits[b.id][field] : b[field]
  const displayTotalCost = b => {
    const q = pendingEdits[b.id]?.qty      !== undefined ? Number(pendingEdits[b.id].qty)      : b.qty
    const c = pendingEdits[b.id]?.unitCost !== undefined ? Number(pendingEdits[b.id].unitCost) : b.unitCost
    return (isNaN(q) || q <= 0 || isNaN(c) || c <= 0) ? b.totalCost : q * c
  }

  const canSave     = form.product.trim() && form.purchaseDate && form.qty && form.unitCost
  const products        = [...new Set(batches.map(b => b.product))]
  const totalInvestment = batches.reduce((s, b) => s + displayTotalCost(b), 0)
  const filtered        = batches.filter(b => !filterProd || b.product === filterProd)
  const sorted          = [...filtered].sort((a, b) => {
    if (sortBy === 'product') return a.product.localeCompare(b.product)
    if (sortBy === 'cost')    return b.unitCost - a.unitCost
    return b.purchaseDate.localeCompare(a.purchaseDate)
  })
  const cellCls = "border-b border-transparent hover:border-gray-300 focus:border-green-500 outline-none bg-transparent py-0.5 transition-colors"

  return (
    <div>
      {/* ── 統計卡片 ── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <MiniStat label="進貨批次"   value={batches.length}                         sub="筆" color="blue"  />
        <MiniStat label="品項種類"   value={products.length}                        sub="種" color="amber" />
        <MiniStat label="總進貨金額" value={`$${totalInvestment.toLocaleString()}`}          color="green" />
      </div>

      {/* ── 固定輸入區（常駐在上方）── */}
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 mb-5">
        <div className="text-xs font-bold text-green-700 mb-3 uppercase tracking-wide">新增進貨</div>

        {saveError && (
          <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">{saveError}</div>
        )}

        {/* Row 1：商品 + 進貨日 */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">商品名稱 *</label>
            <input
              value={form.product}
              onChange={e => setForm(f => ({ ...f, product: e.target.value }))}
              placeholder="例：脆梅"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 bg-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">進貨日 *</label>
            <input
              type="date"
              value={form.purchaseDate}
              onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 bg-white"
            />
          </div>
        </div>

        {/* Row 2：數量 + 單位 + 單位成本 + 售價 */}
        <div className="grid grid-cols-4 gap-2 mb-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">數量 *</label>
            <input
              type="number" min="0" placeholder="0"
              value={form.qty}
              onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 bg-white text-right"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">單位</label>
            <input
              placeholder="個/盒"
              value={form.unit}
              onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 bg-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">單位成本 *</label>
            <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden focus-within:border-amber-400">
              <span className="px-2 text-gray-400 text-sm">$</span>
              <input
                type="number" min="0" placeholder="0"
                value={form.unitCost}
                onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))}
                className="flex-1 py-2 pr-3 text-sm outline-none text-right"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">售價</label>
            <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden focus-within:border-green-400">
              <span className="px-2 text-gray-400 text-sm">$</span>
              <input
                type="number" min="0" placeholder="0"
                value={form.sellingPrice}
                onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))}
                className="flex-1 py-2 pr-3 text-sm outline-none text-right"
              />
            </div>
          </div>
        </div>

        {/* 毛利試算結果 */}
        {fProfit !== null && (
          <div className={`flex items-center gap-3 mb-2 px-3 py-2 rounded-lg text-sm font-bold
            ${fMargin >= 30 ? 'bg-green-100 text-green-700' : fMargin >= 15 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
            <span>毛利：${fProfit} / 件</span>
            <span className="opacity-70">毛利率：{fMargin}%</span>
            {form.qty && <span className="opacity-70">總毛利：${fProfit * (Number(form.qty) || 0)}</span>}
          </div>
        )}

        {/* Row 3：備註 + 儲存 */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">備註</label>
            <input
              placeholder="選填"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 bg-white"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors whitespace-nowrap"
          >
            {saving ? '儲存中…' : '＋ 新增'}
          </button>
        </div>
      </div>

      {/* ── 已記錄批次表格 ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <select value={filterProd} onChange={e => setFilterProd(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none bg-white">
              <option value="">全部商品</option>
              {products.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {[{id:'date',label:'日期'},{id:'product',label:'商品'},{id:'cost',label:'成本'}].map(s => (
                <button key={s.id} onClick={() => setSortBy(s.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${sortBy === s.id ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? <Spinner /> : sorted.length === 0 ? (
          <div className="text-center py-10 text-gray-300 text-sm">尚未記錄任何進貨批次</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2.5 text-left   text-xs text-gray-500 font-bold">商品</th>
                  <th className="px-3 py-2.5 text-left   text-xs text-gray-500 font-bold">進貨日</th>
                  <th className="px-3 py-2.5 text-right  text-xs text-gray-500 font-bold">數量</th>
                  <th className="px-3 py-2.5 text-left   text-xs text-gray-500 font-bold">單位</th>
                  <th className="px-3 py-2.5 text-right  text-xs text-gray-500 font-bold">成本</th>
                  <th className="px-3 py-2.5 text-right  text-xs text-gray-500 font-bold">售價</th>
                  <th className="px-3 py-2.5 text-center text-xs text-gray-500 font-bold">毛利率</th>
                  <th className="px-3 py-2.5 text-center text-xs text-gray-500 font-bold">剩餘</th>
                  <th className="px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((b, i) => {
                  const pct      = b.qty > 0 ? Math.round(b.remainingQty / b.qty * 100) : 0
                  const isOut    = b.remainingQty === 0
                  const isLow    = !isOut && pct <= 20
                  const sp       = Number(displayField(b, 'sellingPrice')) || 0
                  const uc       = Number(displayField(b, 'unitCost'))     || 0
                  const margin   = sp > 0 && uc > 0 ? Math.round((sp - uc) / sp * 100) : null
                  const mColor   = margin === null ? 'text-gray-300' : margin >= 30 ? 'text-green-600 bg-green-50' : margin >= 15 ? 'text-amber-600 bg-amber-50' : 'text-red-500 bg-red-50'
                  return (
                    <tr key={b.id ?? i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-1.5">
                        <input value={displayField(b, 'product')}
                          onChange={e => handleFieldChange(b.id, 'product', e.target.value)}
                          onBlur={() => handleFieldBlur(b, 'product')}
                          onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                          className={`w-full font-medium text-gray-800 text-sm ${cellCls}`} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="date" value={displayField(b, 'purchaseDate')}
                          onChange={e => handleFieldChange(b.id, 'purchaseDate', e.target.value)}
                          onBlur={() => handleFieldBlur(b, 'purchaseDate')}
                          className={`text-gray-500 text-xs ${cellCls}`} />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input type="number" value={displayField(b, 'qty')}
                          onChange={e => handleFieldChange(b.id, 'qty', e.target.value)}
                          onBlur={() => handleFieldBlur(b, 'qty')}
                          onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                          className={`w-14 text-right text-gray-600 ${cellCls}`} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input value={displayField(b, 'unit')}
                          onChange={e => handleFieldChange(b.id, 'unit', e.target.value)}
                          onBlur={() => handleFieldBlur(b, 'unit')}
                          onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                          className={`w-8 text-gray-500 text-xs ${cellCls}`} />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="text-gray-400 text-xs">$</span>
                          <input type="number" value={displayField(b, 'unitCost')}
                            onChange={e => handleFieldChange(b.id, 'unitCost', e.target.value)}
                            onBlur={() => handleFieldBlur(b, 'unitCost')}
                            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                            className={`w-14 text-right font-semibold text-gray-700 ${cellCls}`} />
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="text-gray-400 text-xs">$</span>
                          <input type="number" value={displayField(b, 'sellingPrice') || ''}
                            onChange={e => handleFieldChange(b.id, 'sellingPrice', e.target.value)}
                            onBlur={() => handleFieldBlur(b, 'sellingPrice')}
                            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                            placeholder="0"
                            className={`w-14 text-right font-bold text-green-700 ${cellCls}`} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {margin !== null
                          ? <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${mColor}`}>{margin}%</span>
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <div className="w-8 bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${isOut ? 'bg-red-300' : isLow ? 'bg-amber-400' : 'bg-green-400'}`}
                                 style={{ width: pct + '%' }} />
                          </div>
                          <span className={`text-xs font-bold w-5 text-right ${isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-gray-600'}`}>
                            {b.remainingQty}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button onClick={() => handleDelete(b.id ?? i)}
                          className="text-red-300 hover:text-red-500 text-xs leading-none" title="刪除">✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 確認開攤 ── */}
      {batches.length > 0 && (
        <div className="sticky bottom-4 pt-3">
          {openError && (
            <div className="mb-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm text-center">{openError}</div>
          )}
          {opened ? (
            <div className="flex gap-2">
              <div className="flex-1 py-4 rounded-2xl bg-green-500 text-white font-black text-lg text-center shadow-lg">
                ✅ 開攤完成！
              </div>
              <button onClick={onOpenPOS}
                className="px-5 py-4 rounded-2xl bg-green-700 text-white font-black text-lg shadow-lg hover:bg-green-800 active:scale-[0.98] transition-all whitespace-nowrap">
                前往收銀 →
              </button>
            </div>
          ) : (
            <button onClick={handleOpenStall} disabled={openStalling}
              className="w-full py-4 rounded-2xl font-black text-lg shadow-lg bg-green-600 text-white hover:bg-green-700 active:scale-[0.98] transition-all disabled:bg-gray-200 disabled:text-gray-400">
              {openStalling ? '開攤中…' : '💾 確認開攤'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── 品項設定 ────────────────────────────────────────────────────
function SetupSection({ onOpenPOS }) {
  const [products,   setProducts]   = useState([])
  const [stocks,     setStocks]     = useState({})
  const [prices,     setPrices]     = useState({})
  const [origPrices, setOrigPrices] = useState({})
  const [costs,      setCosts]      = useState({})
  const [origCosts,  setOrigCosts]  = useState({})
  const [included,   setIncluded]   = useState({})

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [adding,  setAdding]  = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editingName,   setEditingName]   = useState(null)
  const [editNameVal,   setEditNameVal]   = useState('')
  const nameInputRef = useRef(null)

  useEffect(() => {
    Promise.all([getProductsForPOS(), getCostRecords()])
      .then(([prods, costRecords]) => {
        setProducts(prods)
        const latestCostMap = {}
        costRecords.forEach(r => { if (!(r.product in latestCostMap)) latestCostMap[r.product] = r.cost })
        const initStocks = {}, initPrices = {}, initIncluded = {}, initCosts = {}
        prods.forEach(p => {
          const suggestedQty =
            p.stockMode === 'carry' && p.prevStock !== null ? p.prevStock :
            p.stock !== 999 ? p.stock : 0
          initStocks[p.name]   = suggestedQty
          initPrices[p.name]   = p.price
          initIncluded[p.name] = p.arrived !== false
          initCosts[p.name]    = latestCostMap[p.name] ?? 0
        })
        setStocks(initStocks); setPrices(initPrices); setOrigPrices(initPrices)
        setCosts(initCosts);   setOrigCosts({ ...initCosts }); setIncluded(initIncluded)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleQty   = (name, val) => setStocks(prev => ({ ...prev, [name]: Math.max(0, parseInt(val) || 0) }))
  const handlePrice = (name, val) => setPrices(prev => ({ ...prev, [name]: Math.max(0, parseInt(val) || 0) }))
  const handleCost  = (name, val) => setCosts(prev  => ({ ...prev, [name]: Math.max(0, parseInt(val) || 0) }))
  const toggleIncluded = name => setIncluded(prev => ({ ...prev, [name]: !prev[name] }))

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    try {
      const items = products
        .filter(p => included[p.name])
        .map(p => ({ name: p.name, openStock: stocks[p.name] || 0, price: prices[p.name] }))
      const costItems = products
        .filter(p => included[p.name] && costs[p.name] > 0 && costs[p.name] !== origCosts[p.name])
        .map(p => ({ name: p.name, cost: costs[p.name] }))
      await setDailyStock(items, costItems)
      setOrigPrices({ ...prices }); setOrigCosts({ ...costs })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError('儲存失敗：' + e.message)
    } finally { setSaving(false) }
  }

  const handleAdd = async () => {
    if (!form.name.trim()) { setError('請輸入商品名稱'); return }
    if (!form.price)        { setError('請輸入單價');     return }
    setAdding(true); setError('')
    try {
      const product = { name: form.name.trim(), price: Number(form.price), category: form.category, stockMode: form.stockMode, arrived: form.arrived, type: '一般', note: '' }
      await saveProduct(product)
      const newP = { ...product, stock: 999, prevStock: null, barcode: '' }
      setProducts(prev => [...prev, newP])
      setStocks(prev    => ({ ...prev, [product.name]: Number(form.openStock) || 0 }))
      setPrices(prev    => ({ ...prev, [product.name]: product.price }))
      setOrigPrices(prev => ({ ...prev, [product.name]: product.price }))
      setIncluded(prev  => ({ ...prev, [product.name]: true }))
      setForm(EMPTY_FORM); setShowAdd(false)
    } catch (e) { setError('新增失敗：' + e.message) }
    finally { setAdding(false) }
  }

  const startEditName = name => {
    setEditingName(name); setEditNameVal(name)
    setTimeout(() => nameInputRef.current?.select(), 0)
  }
  const commitEditName = async () => {
    const newName = editNameVal.trim()
    if (!newName || newName === editingName) { setEditingName(null); return }
    const oldName = editingName; setEditingName(null)
    try {
      await renameProduct(oldName, newName)
      setProducts(prev => prev.map(p => p.name === oldName ? { ...p, name: newName } : p))
      const rename = obj => { const n = { ...obj }; if (oldName in n) { n[newName] = n[oldName]; delete n[oldName] }; return n }
      setStocks(rename); setPrices(rename); setOrigPrices(rename); setIncluded(rename)
    } catch (e) { setError('改名失敗：' + e.message) }
  }

  const handleDelete = async name => {
    try {
      await deleteProduct(name)
      setProducts(prev => prev.filter(p => p.name !== name))
      const drop = obj => { const n = { ...obj }; delete n[name]; return n }
      setStocks(drop); setPrices(drop); setOrigPrices(drop); setIncluded(drop)
    } catch (e) { setError('刪除失敗：' + e.message) }
    finally { setConfirmDelete(null) }
  }

  const includedCount = Object.values(included).filter(Boolean).length
  const totalStock    = products.filter(p => included[p.name]).reduce((s, p) => s + (stocks[p.name] || 0), 0)

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const categories = [...new Set(products.map(p => p.category || '其他'))]
  const byCategory  = {}
  categories.forEach(cat => { byCategory[cat] = products.filter(p => (p.category || '其他') === cat) })

  return (
    <div>
      {/* 概覽 */}
      <p className="text-sm text-gray-400 mb-4">
        今日上架 <span className="font-bold text-gray-600">{includedCount}</span> 種，
        帶貨 <span className="font-bold text-green-600">{totalStock}</span> 件
      </p>

      {/* 新增品項按鈕 */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => { setShowAdd(v => !v); setError('') }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors
            ${showAdd ? 'bg-gray-200 text-gray-600' : 'bg-green-600 text-white hover:bg-green-700'}`}
        >
          {showAdd ? '✕ 取消' : '＋ 新增品項'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
      )}

      {/* 新增品項表單 */}
      {showAdd && (
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 mb-5 space-y-3">
          <h2 className="font-bold text-green-800 text-sm">新增品項</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">商品名稱</label>
              <input type="text" placeholder="例：玉荷包荔枝" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">單價 $</label>
              <input type="number" min="0" placeholder="0" value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">今日帶貨量</label>
              <input type="number" min="0" placeholder="0" value={form.openStock}
                onChange={e => setForm(f => ({ ...f, openStock: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">分類</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">庫存模式</label>
              <select value={form.stockMode} onChange={e => setForm(f => ({ ...f, stockMode: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white">
                <option value="reset">每日重設</option>
                <option value="carry">跨日累積</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.arrived} onChange={e => setForm(f => ({ ...f, arrived: e.target.checked }))}
              className="w-4 h-4 accent-green-600" />
            <span className="text-sm text-gray-700">今日已到貨</span>
          </label>
          <button onClick={handleAdd} disabled={adding}
            className="w-full py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400">
            {adding ? '新增中…' : '確認新增'}
          </button>
        </div>
      )}

      {/* 商品列表 */}
      {categories.map(cat => (
        <div key={cat} className="mb-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">{cat}</h2>
          <div className="space-y-2">
            {byCategory[cat].map(p => {
              const isOn         = included[p.name]
              const isArrived    = p.arrived !== false
              const priceChanged = prices[p.name] !== origPrices[p.name]
              const isDeleting   = confirmDelete === p.name
              const price  = Number(prices[p.name]) || 0
              const cost   = Number(costs[p.name])  || 0
              const profit = price > 0 && cost > 0 ? price - cost : null
              const margin = profit !== null ? Math.round(profit / price * 100) : null
              const marginColor = margin === null ? '' :
                margin >= 30 ? 'text-green-600 bg-green-50 border-green-200' :
                margin >= 15 ? 'text-amber-600 bg-amber-50 border-amber-200' :
                               'text-red-500 bg-red-50 border-red-200'
              return (
                <div key={p.name}
                  className={`bg-white rounded-xl border px-4 py-3 transition-all ${isOn ? 'border-gray-200 shadow-sm' : 'border-gray-100 opacity-40'}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {editingName === p.name ? (
                          <input ref={nameInputRef} value={editNameVal}
                            onChange={e => setEditNameVal(e.target.value)}
                            onBlur={commitEditName}
                            onKeyDown={e => { if (e.key === 'Enter') commitEditName(); if (e.key === 'Escape') setEditingName(null) }}
                            className="font-bold text-gray-800 text-sm border-b-2 border-green-400 outline-none bg-transparent w-32" />
                        ) : (
                          <span className="font-bold text-gray-800 text-sm cursor-text hover:text-green-700 border-b border-dashed border-gray-300"
                            onClick={() => startEditName(p.name)} title="點擊修改名稱">{p.name}</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${p.stockMode === 'carry' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                          {p.stockMode === 'carry' ? '跨日' : '每日重設'}
                        </span>
                        {!isArrived && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">未到貨</span>}
                      </div>
                      {p.prevStock !== null && p.prevStock !== undefined
                        ? <p className="text-xs text-gray-400 mt-0.5">昨日結餘 <span className="font-semibold text-gray-500">{p.prevStock}</span> 件</p>
                        : <p className="text-xs text-gray-300 mt-0.5">昨日無紀錄</p>}
                    </div>

                    <button onClick={() => toggleIncluded(p.name)}
                      className={`mt-0.5 w-12 h-6 rounded-full transition-colors flex-shrink-0 relative ${isOn ? 'bg-green-500' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${isOn ? 'left-[26px]' : 'left-0.5'}`} />
                    </button>

                    {!isDeleting ? (
                      <button onClick={() => setConfirmDelete(p.name)}
                        className="mt-0.5 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors" title="刪除品項">🗑</button>
                    ) : (
                      <div className="flex gap-1 flex-shrink-0 mt-0.5">
                        <button onClick={() => handleDelete(p.name)} className="px-2 py-0.5 bg-red-500 text-white rounded-lg text-xs font-bold">確認刪除</button>
                        <button onClick={() => setConfirmDelete(null)} className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg text-xs">取消</button>
                      </div>
                    )}
                  </div>

                  {isOn && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 whitespace-nowrap">成本 $</span>
                          <input type="number" min="0" value={costs[p.name] || ''} onChange={e => handleCost(p.name, e.target.value)} placeholder="0"
                            className="w-16 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold focus:outline-none focus:border-amber-400" />
                        </div>
                        <span className="text-gray-300 text-xs">→</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 whitespace-nowrap">售價 $</span>
                          <input type="number" min="0" value={prices[p.name] ?? ''} onChange={e => handlePrice(p.name, e.target.value)}
                            className="w-16 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold focus:outline-none focus:border-green-400" />
                          {priceChanged && <span className="text-[10px] text-amber-500 font-semibold">已改</span>}
                        </div>
                        {margin !== null && (
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold ${marginColor}`}>
                            <span>毛利 ${profit}</span>
                            <span className="font-normal opacity-80">({margin}%)</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">帶貨</span>
                        <button onClick={() => handleQty(p.name, (stocks[p.name] || 0) - 1)}
                          className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 font-bold flex items-center justify-center text-base">−</button>
                        <input type="number" min="0" value={stocks[p.name] ?? ''} onChange={e => handleQty(p.name, e.target.value)}
                          className="w-14 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold focus:outline-none focus:border-green-400" />
                        <button onClick={() => handleQty(p.name, (stocks[p.name] || 0) + 1)}
                          className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-600 font-bold flex items-center justify-center text-base">＋</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* 確認開攤按鈕 */}
      <div className="sticky bottom-4 pt-2">
        {saved ? (
          <div className="flex gap-2">
            <div className="flex-1 py-4 rounded-2xl bg-green-500 text-white font-black text-lg text-center shadow-lg">
              ✅ 開攤設定完成！
            </div>
            <button onClick={onOpenPOS}
              className="px-5 py-4 rounded-2xl bg-green-700 text-white font-black text-lg shadow-lg hover:bg-green-800 active:scale-[0.98] transition-all whitespace-nowrap">
              前往收銀 →
            </button>
          </div>
        ) : (
          <button onClick={handleSave} disabled={saving}
            className="w-full py-4 rounded-2xl font-black text-lg shadow-lg bg-green-600 text-white hover:bg-green-700 active:scale-[0.98] transition-all disabled:bg-gray-200 disabled:text-gray-400">
            {saving ? '儲存中…' : '💾 確認開攤'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── 主頁面 ──────────────────────────────────────────────────────
export default function StockSetupPage({ onOpenPOS }) {
  const [tab, setTab] = useState('purchase')

  return (
    <div className="h-full overflow-y-auto p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-gray-800">📦 開攤設定</h1>
      </div>

      {/* 分頁切換 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {[{id:'purchase',label:'進貨管理'},{id:'setup',label:'品項設定'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.id ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'purchase' && <PurchaseSection onOpenPOS={onOpenPOS} />}
      {tab === 'setup'    && <SetupSection onOpenPOS={onOpenPOS} />}
    </div>
  )
}
