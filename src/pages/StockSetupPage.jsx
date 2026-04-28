import { useState, useEffect, useRef } from 'react'
import { getProductsForPOS, setDailyStock, saveProduct, deleteProduct, renameProduct } from '../services/gasApi'

const CATEGORIES = ['水果', '蔬菜', '蛋類', '冷凍食品', '加工品', '其他']

const EMPTY_FORM = { name: '', price: '', openStock: '', category: '其他', stockMode: 'reset', arrived: true }

export default function StockSetupPage({ onOpenPOS }) {
  const [products,   setProducts]   = useState([])
  const [stocks,     setStocks]     = useState({})
  const [prices,     setPrices]     = useState({})
  const [origPrices, setOrigPrices] = useState({})
  const [included,   setIncluded]   = useState({})

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  // 新增品項
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [adding,  setAdding]  = useState(false)

  // 刪除確認
  const [confirmDelete, setConfirmDelete] = useState(null) // product name

  // 名稱內嵌編輯
  const [editingName, setEditingName]   = useState(null)  // 正在編輯的原始名稱
  const [editNameVal, setEditNameVal]   = useState('')
  const nameInputRef = useRef(null)

  useEffect(() => {
    getProductsForPOS()
      .then(prods => {
        setProducts(prods)
        const initStocks = {}, initPrices = {}, initIncluded = {}
        prods.forEach(p => {
          const suggestedQty =
            p.stockMode === 'carry' && p.prevStock !== null ? p.prevStock :
            p.stock !== 999 ? p.stock : 0
          initStocks[p.name]   = suggestedQty
          initPrices[p.name]   = p.price
          initIncluded[p.name] = p.arrived !== false
        })
        setStocks(initStocks)
        setPrices(initPrices)
        setOrigPrices(initPrices)
        setIncluded(initIncluded)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleQty   = (name, val) => setStocks(prev => ({ ...prev, [name]: Math.max(0, parseInt(val) || 0) }))
  const handlePrice = (name, val) => setPrices(prev => ({ ...prev, [name]: Math.max(0, parseInt(val) || 0) }))
  const toggleIncluded = (name) => setIncluded(prev => ({ ...prev, [name]: !prev[name] }))

  // ── 儲存開攤 ──────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const items = products
        .filter(p => included[p.name])
        .map(p => ({ name: p.name, openStock: stocks[p.name] || 0, price: prices[p.name] }))
      await setDailyStock(items)
      setOrigPrices({ ...prices })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError('儲存失敗：' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── 新增品項 ──────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.name.trim()) { setError('請輸入商品名稱'); return }
    if (!form.price)        { setError('請輸入單價');     return }
    setAdding(true)
    setError('')
    try {
      const product = {
        name:      form.name.trim(),
        price:     Number(form.price),
        category:  form.category,
        stockMode: form.stockMode,
        arrived:   form.arrived,
        type:      '一般',
        note:      '',
      }
      await saveProduct(product)
      const newP = { ...product, stock: 999, prevStock: null, barcode: '' }
      setProducts(prev => [...prev, newP])
      setStocks(prev    => ({ ...prev, [product.name]: Number(form.openStock) || 0 }))
      setPrices(prev    => ({ ...prev, [product.name]: product.price }))
      setOrigPrices(prev => ({ ...prev, [product.name]: product.price }))
      setIncluded(prev  => ({ ...prev, [product.name]: true }))
      setForm(EMPTY_FORM)
      setShowAdd(false)
    } catch (e) {
      setError('新增失敗：' + e.message)
    } finally {
      setAdding(false)
    }
  }

  // ── 改名 ──────────────────────────────────────────────────
  const startEditName = (name) => {
    setEditingName(name)
    setEditNameVal(name)
    setTimeout(() => nameInputRef.current?.select(), 0)
  }

  const commitEditName = async () => {
    const newName = editNameVal.trim()
    if (!newName || newName === editingName) { setEditingName(null); return }
    const oldName = editingName
    setEditingName(null)
    try {
      await renameProduct(oldName, newName)
      setProducts(prev => prev.map(p => p.name === oldName ? { ...p, name: newName } : p))
      const rename = (obj) => {
        const n = { ...obj }
        if (oldName in n) { n[newName] = n[oldName]; delete n[oldName] }
        return n
      }
      setStocks(rename)
      setPrices(rename)
      setOrigPrices(rename)
      setIncluded(rename)
    } catch (e) {
      setError('改名失敗：' + e.message)
    }
  }

  // ── 刪除品項 ──────────────────────────────────────────────
  const handleDelete = async (name) => {
    try {
      await deleteProduct(name)
      setProducts(prev => prev.filter(p => p.name !== name))
      setStocks(prev    => { const n = { ...prev }; delete n[name]; return n })
      setPrices(prev    => { const n = { ...prev }; delete n[name]; return n })
      setOrigPrices(prev => { const n = { ...prev }; delete n[name]; return n })
      setIncluded(prev  => { const n = { ...prev }; delete n[name]; return n })
    } catch (e) {
      setError('刪除失敗：' + e.message)
    } finally {
      setConfirmDelete(null)
    }
  }

  const includedCount = Object.values(included).filter(Boolean).length
  const totalStock    = products
    .filter(p => included[p.name])
    .reduce((s, p) => s + (stocks[p.name] || 0), 0)

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const categories = [...new Set(products.map(p => p.category || '其他'))]
  const byCategory  = {}
  categories.forEach(cat => { byCategory[cat] = products.filter(p => (p.category || '其他') === cat) })

  return (
    <div className="h-full overflow-y-auto p-4 max-w-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-gray-800">📦 開攤設定</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            今日上架 <span className="font-bold text-gray-600">{includedCount}</span> 種，
            帶貨 <span className="font-bold text-green-600">{totalStock}</span> 件
          </p>
        </div>
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

      {/* ── 新增品項表單 ── */}
      {showAdd && (
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 mb-5 space-y-3">
          <h2 className="font-bold text-green-800 text-sm">新增品項</h2>

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">商品名稱</label>
              <input
                type="text"
                placeholder="例：玉荷包荔枝"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">單價 $</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">今日帶貨量</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={form.openStock}
                onChange={e => setForm(f => ({ ...f, openStock: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">分類</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">庫存模式</label>
              <select
                value={form.stockMode}
                onChange={e => setForm(f => ({ ...f, stockMode: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white"
              >
                <option value="reset">每日重設</option>
                <option value="carry">跨日累積</option>
              </select>
            </div>
          </div>

          {/* 到貨狀態 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.arrived}
              onChange={e => setForm(f => ({ ...f, arrived: e.target.checked }))}
              className="w-4 h-4 accent-green-600"
            />
            <span className="text-sm text-gray-700">今日已到貨</span>
          </label>

          <button
            onClick={handleAdd}
            disabled={adding}
            className="w-full py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {adding ? '新增中…' : '確認新增'}
          </button>
        </div>
      )}

      {/* ── 商品列表（依分類） ── */}
      {categories.map(cat => (
        <div key={cat} className="mb-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">{cat}</h2>
          <div className="space-y-2">
            {byCategory[cat].map(p => {
              const isOn         = included[p.name]
              const isArrived    = p.arrived !== false
              const priceChanged = prices[p.name] !== origPrices[p.name]
              const isDeleting   = confirmDelete === p.name

              return (
                <div
                  key={p.name}
                  className={`bg-white rounded-xl border px-4 py-3 transition-all
                    ${isOn ? 'border-gray-200 shadow-sm' : 'border-gray-100 opacity-40'}`}
                >
                  {/* 上排：名稱 + 昨日結餘 + 開關 + 刪除 */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {editingName === p.name ? (
                          <input
                            ref={nameInputRef}
                            value={editNameVal}
                            onChange={e => setEditNameVal(e.target.value)}
                            onBlur={commitEditName}
                            onKeyDown={e => { if (e.key === 'Enter') commitEditName(); if (e.key === 'Escape') setEditingName(null) }}
                            className="font-bold text-gray-800 text-sm border-b-2 border-green-400 outline-none bg-transparent w-32"
                          />
                        ) : (
                          <span
                            className="font-bold text-gray-800 text-sm cursor-text hover:text-green-700 border-b border-dashed border-gray-300"
                            onClick={() => startEditName(p.name)}
                            title="點擊修改名稱"
                          >{p.name}</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold
                          ${p.stockMode === 'carry' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                          {p.stockMode === 'carry' ? '跨日' : '每日重設'}
                        </span>
                        {!isArrived && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">未到貨</span>
                        )}
                      </div>
                      {p.prevStock !== null && p.prevStock !== undefined ? (
                        <p className="text-xs text-gray-400 mt-0.5">昨日結餘 <span className="font-semibold text-gray-500">{p.prevStock}</span> 件</p>
                      ) : (
                        <p className="text-xs text-gray-300 mt-0.5">昨日無紀錄</p>
                      )}
                    </div>

                    {/* 今日上架開關 */}
                    <button
                      onClick={() => toggleIncluded(p.name)}
                      className={`mt-0.5 w-12 h-6 rounded-full transition-colors flex-shrink-0 relative
                        ${isOn ? 'bg-green-500' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all
                        ${isOn ? 'left-[26px]' : 'left-0.5'}`} />
                    </button>

                    {/* 刪除按鈕 */}
                    {!isDeleting ? (
                      <button
                        onClick={() => setConfirmDelete(p.name)}
                        className="mt-0.5 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors"
                        title="刪除品項"
                      >
                        🗑
                      </button>
                    ) : (
                      <div className="flex gap-1 flex-shrink-0 mt-0.5">
                        <button
                          onClick={() => handleDelete(p.name)}
                          className="px-2 py-0.5 bg-red-500 text-white rounded-lg text-xs font-bold"
                        >
                          確認刪除
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg text-xs"
                        >
                          取消
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 下排：今日單價 + 今日帶貨量 */}
                  {isOn && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-1 flex-1">
                        <span className="text-xs text-gray-400 whitespace-nowrap">單價 $</span>
                        <input
                          type="number"
                          min="0"
                          value={prices[p.name] ?? ''}
                          onChange={e => handlePrice(p.name, e.target.value)}
                          className="w-20 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold focus:outline-none focus:border-green-400"
                        />
                        {priceChanged && (
                          <span className="text-[10px] text-amber-500 font-semibold">已改</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">帶貨</span>
                        <button
                          onClick={() => handleQty(p.name, (stocks[p.name] || 0) - 1)}
                          className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 font-bold flex items-center justify-center text-base"
                        >−</button>
                        <input
                          type="number"
                          min="0"
                          value={stocks[p.name] ?? ''}
                          onChange={e => handleQty(p.name, e.target.value)}
                          className="w-14 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold focus:outline-none focus:border-green-400"
                        />
                        <button
                          onClick={() => handleQty(p.name, (stocks[p.name] || 0) + 1)}
                          className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-600 font-bold flex items-center justify-center text-base"
                        >＋</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* ── 底部確認按鈕 ── */}
      <div className="sticky bottom-4 pt-2">
        {saved ? (
          <div className="flex gap-2">
            <div className="flex-1 py-4 rounded-2xl bg-green-500 text-white font-black text-lg text-center shadow-lg">
              ✅ 開攤設定完成！
            </div>
            <button
              onClick={onOpenPOS}
              className="px-5 py-4 rounded-2xl bg-green-700 text-white font-black text-lg shadow-lg hover:bg-green-800 active:scale-[0.98] transition-all whitespace-nowrap"
            >
              前往收銀 →
            </button>
          </div>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 rounded-2xl font-black text-lg shadow-lg bg-green-600 text-white hover:bg-green-700 active:scale-[0.98] transition-all disabled:bg-gray-200 disabled:text-gray-400"
          >
            {saving ? '儲存中…' : '💾 確認開攤'}
          </button>
        )}
      </div>

    </div>
  )
}
