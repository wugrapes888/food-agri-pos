import { useState, useEffect, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import {
  getProductsForPOS,
  getAllCustomersForPOS,
  getCustomerCartForPOS,
  submitCheckout,
  clearPOSCache,
} from '../services/gasApi'

// ── Step indicator ────────────────────────────────────────────
function StepBar({ current }) {
  const steps = ['選品', '付款', '明細']
  const idx = { select: 0, payment: 1, receipt: 2 }[current] ?? 0
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full
            ${i < idx  ? 'bg-green-200 text-green-800' :
              i === idx ? 'bg-white text-green-700 shadow-sm' :
                          'bg-green-800/60 text-green-300'}`}>
            {s}
          </span>
          {i < 2 && <div className={`w-3 h-px ${i < idx ? 'bg-green-300' : 'bg-green-700'}`} />}
        </div>
      ))}
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [msg, onClose])
  if (!msg) return null
  const bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-800'
  return (
    <div className={`fixed bottom-6 right-6 ${bg} text-white px-5 py-3 rounded-xl shadow-xl z-50 text-sm font-medium max-w-xs`}>
      {msg}
    </div>
  )
}

// ── Fixed Numpad (not modal) ──────────────────────────────────
function FixedNumpad({ onChange }) {
  const press = (k) => {
    if (k === '⌫') { onChange(p => p.slice(0, -1)); return }
    onChange(p => (p + k).replace(/^0+(\d)/, '$1'))
  }
  const btn = 'h-[52px] rounded-xl text-2xl font-bold select-none transition-all active:scale-95'
  return (
    <div className="grid gap-2">
      {[['7','8','9'],['4','5','6'],['1','2','3']].map((row, ri) => (
        <div key={ri} className="grid grid-cols-3 gap-2">
          {row.map(k => (
            <button key={k} onPointerDown={() => press(k)}
              className={`${btn} bg-gray-100 text-gray-800 hover:bg-gray-200`}>{k}</button>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-3 gap-2">
        <button onPointerDown={() => press('0')}
          className={`col-span-2 ${btn} bg-gray-100 text-gray-800 hover:bg-gray-200`}>0</button>
        <button onPointerDown={() => press('⌫')}
          className={`${btn} bg-red-50 text-red-500 hover:bg-red-100`}>⌫</button>
      </div>
    </div>
  )
}

// ── Barcode Scanner Modal ─────────────────────────────────────
const SCANNER_DIV_ID = 'barcode-camera-reader'

function BarcodeScannerModal({ onDetect, onClose }) {
  const scannerRef = useRef(null)
  const detectedRef = useRef(false)

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_DIV_ID)
    scannerRef.current = scanner

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 110 } },
      (code) => {
        if (detectedRef.current) return
        detectedRef.current = true
        scanner.stop().catch(() => {}).finally(() => onDetect(code.trim()))
      },
      () => {}
    ).catch(() => onClose())

    return () => { scanner.stop().catch(() => {}) }
  }, [onDetect, onClose])

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-black text-gray-800 text-lg">掃描條碼</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div id={SCANNER_DIV_ID} className="w-full overflow-hidden rounded-xl" />
        <p className="text-xs text-gray-400 text-center">將商品條碼對準框內，自動辨識後加入購物車</p>
      </div>
    </div>
  )
}

// ── Custom Item Modal ─────────────────────────────────────────
function CustomItemModal({ onConfirm, onClose }) {
  const [name, setName] = useState('自訂品項')
  const [price, setPrice] = useState('')
  const nameRef = useRef(null)

  useEffect(() => { nameRef.current?.select() }, [])

  const press = (k) => {
    if (k === '⌫') { setPrice(p => p.slice(0, -1)); return }
    setPrice(p => (p + k).replace(/^0+(\d)/, '$1'))
  }

  const handleConfirm = () => {
    const p = Number(price)
    if (!p || p <= 0) return
    onConfirm({ name: name.trim() || '自訂品項', price: p, qty: 1, isPreorder: false, arrived: true, isCustom: true })
  }

  const btn = 'h-[48px] rounded-xl text-xl font-bold select-none transition-all active:scale-95'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-80 p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-black text-gray-800 text-lg">自訂品項</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Name input */}
        <div>
          <label className="text-xs text-gray-500 font-semibold mb-1 block">品名</label>
          <input ref={nameRef} type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            placeholder="自訂品項" />
        </div>

        {/* Price display */}
        <div className="bg-[#F5F5F0] rounded-xl px-4 py-3 text-center">
          <div className="text-xs text-gray-400 mb-0.5">金額</div>
          <div className={`text-3xl font-black ${price ? 'text-gray-800' : 'text-gray-300'}`}>
            ${price ? Number(price).toLocaleString() : '0'}
          </div>
        </div>

        {/* Numpad */}
        <div className="grid gap-2">
          {[['7','8','9'],['4','5','6'],['1','2','3']].map((row, ri) => (
            <div key={ri} className="grid grid-cols-3 gap-2">
              {row.map(k => (
                <button key={k} onPointerDown={() => press(k)}
                  className={`${btn} bg-gray-100 text-gray-800 hover:bg-gray-200`}>{k}</button>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2">
            <button onPointerDown={() => press('0')} className={`col-span-2 ${btn} bg-gray-100 text-gray-800 hover:bg-gray-200`}>0</button>
            <button onPointerDown={() => press('⌫')} className={`${btn} bg-red-50 text-red-500 hover:bg-red-100`}>⌫</button>
          </div>
        </div>

        {/* Confirm */}
        <button onClick={handleConfirm} disabled={!price || Number(price) <= 0}
          className="w-full py-3 rounded-xl bg-[#1D9E75] text-white font-black text-base
            hover:bg-[#0F6E56] active:scale-[0.98] transition-all
            disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed">
          加入購物車
        </button>
      </div>
    </div>
  )
}

// ── Payment config ────────────────────────────────────────────
const PAY_METHODS = [
  { id: 'cash',     label: '💵 現金'     },
  { id: 'mobile',   label: '📱 行動支付' },
  { id: 'transfer', label: '🏦 轉帳'    },
]
const MOBILE_SUB = [
  { id: 'linepay',   label: '💚 LINE Pay'  },
  { id: 'ipass',     label: '🔵 iPass'     },
  { id: 'taiwanpay', label: '🇹🇼 台灣 Pay' },
]

export default function POSPage({ preselectedCustomer, onClearPreselect, currentUser }) {
  const [products, setProducts]   = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading]     = useState(true)

  const [step, setStep]               = useState('select')
  const [receiptData, setReceiptData] = useState(null)

  const [activeCategory, setActiveCategory]     = useState('全部')
  const [customerType, setCustomerType]         = useState('walk')
  const [customerSearch, setCustomerSearch]     = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [cart, setCart]                         = useState([])
  const [barcodeInput, setBarcodeInput]         = useState('')

  const [payMethod, setPayMethod]       = useState('cash')
  const [mobileSubPay, setMobileSubPay] = useState('linepay')
  const [cashIn, setCashIn]             = useState('')

  const [cartLoading, setCartLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [submitError, setSubmitError] = useState(false)
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

  const barcodeBuffer   = useRef('')
  const barcodeTimer    = useRef(null)
  const barcodeInputRef = useRef(null)

  const showToast = useCallback((msg, type = '') => setToast({ msg, type }), [])

  useEffect(() => {
    Promise.all([getProductsForPOS(), getAllCustomersForPOS()])
      .then(([prods, custs]) => { setProducts(prods); setCustomers(custs) })
      .catch(e => showToast(e.message === 'NO_GAS_URL' ? '示範模式：使用測試資料' : '載入失敗：' + e.message))
      .finally(() => setLoading(false))
  }, [showToast])

  useEffect(() => {
    if (!preselectedCustomer) return
    setCustomerType('preorder')
    setSelectedCustomer(preselectedCustomer)
    setCustomerSearch(preselectedCustomer)
    setCart([])
    getCustomerCartForPOS(preselectedCustomer)
      .then(orders => setCart(orders.map(o => ({ ...o }))))
      .catch(() => showToast('取得客人預購資料失敗', 'error'))
    onClearPreselect?.()
  }, [preselectedCustomer]) // eslint-disable-line

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Enter') {
        const code = barcodeBuffer.current.trim()
        barcodeBuffer.current = ''
        clearTimeout(barcodeTimer.current)
        if (code.length >= 4) {
          const p = products.find(x => x.barcode === code)
          if (p) addToCart(p)
          else showToast(`找不到條碼：${code}`, 'error')
        }
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key
        clearTimeout(barcodeTimer.current)
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = '' }, 150)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [products, showToast])

  useEffect(() => {
    if (!loading) barcodeInputRef.current?.focus()
  }, [loading])

  const matchCustomer = (c, q) => {
    if (!q) return true
    if (c.name.includes(q)) return true
    if (/^\d{3}$/.test(q) && c.phone && c.phone.slice(-3) === q) return true
    return false
  }

  const categories = ['全部', ...new Set(products.map(p => p.category).filter(Boolean))]
  const filteredProducts = products.filter(p =>
    activeCategory === '全部' || p.category === activeCategory
  )

  const addToCart = useCallback((product) => {
    if (!product.arrived) { showToast(`${product.name} 尚未到貨`, 'error'); return }
    if (product.stock === 0) { showToast(`${product.name} 庫存為 0`, 'error'); return }
    setCart(prev => {
      const idx = prev.findIndex(i => i.name === product.name && !i.isPreorder)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { name: product.name, price: product.price, qty: 1, isPreorder: false, arrived: true }]
    })
  }, [showToast])

  const handleScanDetect = useCallback((code) => {
    setShowScanner(false)
    if (code.length < 4) return
    const p = products.find(x => x.barcode === code)
    if (p) addToCart(p)
    else showToast(`找不到條碼：${code}`, 'error')
  }, [products, addToCart, showToast])

  const updateQty = (index, delta) => {
    setCart(prev => {
      const next = [...prev]
      const newQty = next[index].qty + delta
      if (newQty <= 0) { next.splice(index, 1); return next }
      next[index] = { ...next[index], qty: newQty }
      return next
    })
  }

  const handleSelectCustomer = async (name) => {
    setSelectedCustomer(name)
    setCustomerSearch(name)
    setCart([])
    setCartLoading(true)
    try {
      const orders = await getCustomerCartForPOS(name)
      setCart(orders.map(o => ({ ...o })))
    } catch {
      showToast('取得客人預購資料失敗', 'error')
    } finally {
      setCartLoading(false)
    }
  }

  const handleWalkIn = () => {
    setCustomerType('walk')
    setSelectedCustomer(null)
    setCustomerSearch('')
    setCart([])
  }

  const arrivedCart = cart.filter(i => i.arrived !== false)
  const total       = arrivedCart.reduce((s, i) => s + i.price * i.qty, 0)
  const cashInNum   = Number(cashIn) || 0
  const change      = payMethod === 'cash' && cashIn && cashInNum >= total ? cashInNum - total : null
  const cashShort   = payMethod === 'cash' && cashIn && cashInNum < total  ? total - cashInNum : null
  const canCheckout = payMethod !== 'cash' || (cashIn !== '' && cashInNum >= total)

  const goToPayment = () => {
    if (!cart.length) { showToast('購物車是空的', 'error'); return }
    if (total === 0)  { showToast('應收金額為 0，請確認商品到貨狀態', 'error'); return }
    setCashIn('')
    setStep('payment')
  }

  const handleCheckout = () => {
    if (!canCheckout) return
    const effectiveMethod = payMethod === 'mobile' ? mobileSubPay : payMethod
    const payload = {
      customerName:  customerType === 'preorder' ? selectedCustomer : '散客',
      customerType,
      items: cart,
      total,
      paymentMethod: effectiveMethod,
      cashIn: payMethod === 'cash' ? cashInNum : total,
      change: payMethod === 'cash' ? (change ?? 0) : 0,
      timestamp: new Date().toISOString(),
      staffId:   currentUser?.id   || '',
      staffName: currentUser?.name || '',
    }

    // 立刻跳明細（樂觀 UI）
    setSubmitError(false)
    setReceiptData({
      items: arrivedCart,
      total,
      payMethod,
      mobileSubPay,
      cashIn: cashInNum,
      change: change ?? 0,
      customerName: customerType === 'preorder' ? selectedCustomer : '散客',
      staffName: currentUser?.name || '',
      time: new Date(),
    })
    setStep('receipt')

    // 預購客人：立即標記為已取貨並清快取，讓下次進頁面拿到最新資料
    if (customerType === 'preorder' && selectedCustomer) {
      setCustomers(prev => prev.map(c =>
        c.name === selectedCustomer ? { ...c, status: '已取貨' } : c
      ))
      clearPOSCache()
    }

    // 背景送出 GAS，失敗才提示
    submitCheckout(payload).catch(e => {
      setSubmitError(true)
      showToast('⚠️ 記錄儲存失敗：' + e.message, 'error')
    })
  }

  const handleNewOrder = () => {
    setCart([])
    setSelectedCustomer(null)
    setCustomerSearch('')
    setCustomerType('walk')
    setCashIn('')
    setStep('select')
    setReceiptData(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-500">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p>載入商品資料中…</p>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════
  // STEP 1 — 選品
  // ══════════════════════════════════════════════════════════
  if (step === 'select') return (
    <div className="h-full flex overflow-hidden">

      {/* Left: Products */}
      <div className="flex flex-col flex-1 overflow-hidden border-r border-gray-200">

        {/* Category tabs */}
        <div className="flex gap-1.5 px-3 py-2 bg-white border-b border-gray-200 overflow-x-auto flex-shrink-0">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors flex-shrink-0
                ${activeCategory === cat ? 'bg-[#1D9E75] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {cat}
            </button>
          ))}
        </div>

        {/* Barcode input */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <span className="text-gray-400 text-lg flex-shrink-0">🔲</span>
          <input
            ref={barcodeInputRef}
            type="text"
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              const code = barcodeInput.trim()
              setBarcodeInput('')
              if (code.length < 4) return
              const p = products.find(x => x.barcode === code)
              if (p) addToCart(p)
              else showToast(`找不到條碼：${code}`, 'error')
            }}
            placeholder="掃描或輸入條碼後按 Enter…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-400 bg-white"
          />
          {barcodeInput
            ? <button onClick={() => setBarcodeInput('')} className="text-gray-400 hover:text-red-400 px-1 text-sm">✕</button>
            : <button onClick={() => setShowScanner(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1D9E75] text-white text-xs font-bold hover:bg-[#0F6E56] active:scale-95 transition-all flex-shrink-0">
                📷 相機
              </button>
          }
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 content-start">
          {filteredProducts.map(p => {
            const isLow  = p.stock > 0 && p.stock <= 3
            const isZero = p.stock === 0
            const isNA   = !p.arrived
            const disabled = isZero || isNA
            return (
              <button key={p.name} onClick={() => !disabled && addToCart(p)} disabled={disabled}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 text-center
                  transition-all min-h-[90px] text-sm font-semibold
                  ${isNA   ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed' :
                    isZero ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed' :
                    isLow  ? 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 active:scale-95' :
                             'border-green-200 bg-white text-gray-800 hover:bg-green-50 hover:border-green-400 active:scale-95'}`}>
                <span className="leading-tight mb-1">{p.name}</span>
                <span className={`text-xs font-bold ${isNA || isZero ? 'text-gray-300' : isLow ? 'text-amber-600' : 'text-[#1D9E75]'}`}>
                  ${p.price}
                </span>
                <span className={`text-[11px] mt-0.5 ${isNA ? 'text-gray-300' : isZero ? 'text-red-400' : isLow ? 'text-amber-500' : 'text-gray-400'}`}>
                  {isNA ? '未到貨' : isZero ? '售完' : `剩 ${p.stock}`}
                </span>
              </button>
            )
          })}
          {/* Custom item button */}
          <button onClick={() => setShowCustomModal(true)}
            className="flex flex-col items-center justify-center p-2 rounded-xl border-2 text-center
              transition-all min-h-[90px] text-sm font-semibold
              border-dashed border-gray-300 bg-gray-50 text-gray-400 hover:bg-orange-50 hover:border-orange-400 hover:text-orange-600 active:scale-95">
            <span className="text-2xl mb-1">✏️</span>
            <span className="leading-tight">自訂品項</span>
          </button>
        </div>
      </div>

      {showScanner && (
        <BarcodeScannerModal
          onDetect={handleScanDetect}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showCustomModal && (
        <CustomItemModal
          onConfirm={item => { setCart(prev => [...prev, item]); setShowCustomModal(false) }}
          onClose={() => setShowCustomModal(false)}
        />
      )}

      {/* Right: Cart */}
      <div className="w-80 xl:w-96 flex flex-col bg-white overflow-hidden flex-shrink-0">

        {/* Customer selection */}
        <div className="p-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex gap-2 mb-2">
            <button onClick={handleWalkIn}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                ${customerType === 'walk' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              散客
            </button>
            <button
              onClick={() => { setCustomerType('preorder'); setCart([]); setSelectedCustomer(null); setCustomerSearch('') }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                ${customerType === 'preorder' ? 'bg-[#1D9E75] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              預購客人
            </button>
          </div>

          {customerType === 'walk' && (
            <p className="text-sm text-blue-600 font-semibold">散客（現場購買）</p>
          )}

          {customerType === 'preorder' && !selectedCustomer && (
            <input type="text" placeholder="🔍 姓名 或 手機後三碼…" value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
          )}

          {customerType === 'preorder' && selectedCustomer && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#1D9E75] font-semibold">👤 {selectedCustomer}</span>
              <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setCart([]) }}
                className="text-gray-400 hover:text-red-500 text-xs ml-auto">✕ 換人</button>
            </div>
          )}
        </div>

        {/* Cart header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-500">
            {customerType === 'preorder' && !selectedCustomer
              ? `${customers.filter(c => c.status !== '已取貨' && matchCustomer(c, customerSearch)).length} 位待取貨`
              : cart.length > 0 ? `${cart.length} 項商品` : '購物車'}
          </span>
          {cart.length > 0 && selectedCustomer && (
            <button onClick={() => { setCart([]); setSelectedCustomer(null); setCustomerSearch('') }}
              className="text-xs text-red-500 hover:text-red-700">清空</button>
          )}
        </div>

        {/* 預購選人 / 購物車 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {customerType === 'preorder' && !selectedCustomer ? (
            // ── 客人清單 ──────────────────────────────────
            customers.filter(c => c.status !== '已取貨' && matchCustomer(c, customerSearch)).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <p className="text-sm">{customerSearch ? '找不到符合的客人' : '所有客人已取貨完畢'}</p>
              </div>
            ) : (
              customers
                .filter(c => c.status !== '已取貨' && matchCustomer(c, customerSearch))
                .map(c => (
                  <button key={c.name} onClick={() => handleSelectCustomer(c.name)}
                    className="w-full text-left px-3 py-3 rounded-xl border border-gray-100 bg-gray-50
                      hover:bg-green-50 hover:border-green-300 active:scale-[0.98] transition-all">
                    <div className="font-semibold text-gray-800 text-sm">{c.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                      <span>{c.qty} 件預購</span>
                      {c.phone && <span className="text-gray-300">· 尾碼 {c.phone.slice(-3)}</span>}
                    </div>
                  </button>
                ))
            )
          ) : cartLoading ? (
            // ── 載入中 ────────────────────────────────────
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
              <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">載入預購品項中…</p>
            </div>
          ) : cart.length === 0 ? (
            // ── 空購物車 ──────────────────────────────────
            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-1">
              <span className="text-4xl mb-1">🛒</span>
              {customerType === 'preorder'
                ? <p className="text-sm text-center px-4">此客人預購品項已全部取貨<br/>或可手動加入商品</p>
                : <p className="text-sm">點商品或掃條碼加入購物車</p>
              }
            </div>
          ) : (
            // ── 購物車品項 ────────────────────────────────
            cart.map((item, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm
                ${item.arrived === false ? 'border-gray-200 bg-gray-50 opacity-50' : 'border-gray-100 bg-gray-50'}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-gray-800">
                    {item.name}
                    {item.isPreorder && <span className="ml-1 text-[10px] text-indigo-500 font-bold">[預]</span>}
                    {item.arrived === false && <span className="ml-1 text-[10px] text-gray-400">[未到]</span>}
                  </div>
                  <div className="text-gray-500 text-xs">${item.price} × {item.qty} = <span className="font-semibold text-gray-700">${(item.price * item.qty).toLocaleString()}</span></div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => updateQty(i, -1)} className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center hover:bg-red-100 hover:text-red-600 font-bold">−</button>
                  <span className="w-5 text-center text-sm font-bold">{item.qty}</span>
                  <button onClick={() => updateQty(i, 1)}  className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center hover:bg-green-100 hover:text-green-600 font-bold">＋</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Total + go to checkout */}
        <div className="p-3 border-t border-gray-200 bg-[#F5F5F0] flex-shrink-0 space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-gray-500">應收金額</span>
            <span className="text-2xl font-black text-[#1D9E75]">${total.toLocaleString()}</span>
          </div>
          <button onClick={goToPayment} disabled={cart.length === 0}
            className="w-full py-3.5 rounded-xl bg-[#1D9E75] text-white font-black text-xl
              hover:bg-[#0F6E56] active:scale-[0.98] transition-all
              disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed">
            去結帳 →
          </button>
        </div>
      </div>

      <Toast msg={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  )

  // ══════════════════════════════════════════════════════════
  // STEP 2 — 付款
  // ══════════════════════════════════════════════════════════
  if (step === 'payment') return (
    <div className="h-full flex overflow-hidden bg-[#F5F5F0]">

      {/* Left: Order summary */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <button onClick={() => setStep('select')}
            className="text-sm text-gray-500 hover:text-gray-800 font-semibold">
            ← 返回
          </button>
          <span className="text-sm font-bold text-gray-700">
            {customerType === 'preorder' && selectedCustomer ? `👤 ${selectedCustomer}` : '散客'}
          </span>
          <StepBar current="payment" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 divide-y divide-gray-100">
          {arrivedCart.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div>
                <div className="font-medium text-gray-800">{item.name}
                  {item.isPreorder && <span className="ml-1 text-[10px] text-indigo-500 font-bold">[預]</span>}
                </div>
                <div className="text-sm text-gray-400">×{item.qty}</div>
              </div>
              <div className="font-semibold text-gray-800">${(item.price * item.qty).toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="px-4 py-4 bg-[#F5F5F0] border-t border-gray-200 flex-shrink-0">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 font-semibold">應付金額</span>
            <span className="text-3xl font-black text-[#1D9E75]">${total.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Right: Payment */}
      <div className="w-80 xl:w-96 flex flex-col bg-white border-l border-gray-200 overflow-hidden flex-shrink-0">

        <div className="p-4 flex-shrink-0 space-y-3">
          {/* Payment method */}
          <div className="flex gap-1.5">
            {PAY_METHODS.map(m => (
              <button key={m.id} onClick={() => { setPayMethod(m.id); setCashIn('') }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors
                  ${payMethod === m.id ? 'bg-[#1D9E75] text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Mobile sub-payment */}
          {payMethod === 'mobile' && (
            <div className="flex gap-1.5">
              {MOBILE_SUB.map(m => (
                <button key={m.id} onClick={() => setMobileSubPay(m.id)}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-colors
                    ${mobileSubPay === m.id ? 'bg-[#185FA5] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Cash info */}
          {payMethod === 'cash' && (
            <div className="bg-[#F5F5F0] rounded-xl p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">收款金額</span>
                <span className={`font-black text-2xl ${cashIn ? 'text-gray-800' : 'text-gray-300'}`}>
                  ${cashIn ? Number(cashIn).toLocaleString() : '0'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">找零</span>
                {!cashIn    && <span className="text-gray-400 text-sm">—</span>}
                {cashShort !== null && <span className="text-[#E24B4A] font-bold text-sm">不足 ${cashShort.toLocaleString()}</span>}
                {change !== null    && <span className="text-[#1D9E75] font-black text-xl">${change.toLocaleString()}</span>}
              </div>
            </div>
          )}

          {/* Non-cash info */}
          {payMethod !== 'cash' && (
            <div className="bg-blue-50 rounded-xl p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">付款金額</span>
                <span className="font-black text-2xl text-[#185FA5]">${total.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Numpad */}
        <div className={`px-4 flex-shrink-0 transition-opacity ${payMethod !== 'cash' ? 'opacity-25 pointer-events-none' : ''}`}>
          <FixedNumpad onChange={setCashIn} />
        </div>

        {/* Checkout button */}
        <div className="p-4 mt-auto flex-shrink-0">
          <button
            onClick={handleCheckout}
            disabled={!canCheckout}
            className={`w-full py-4 rounded-2xl font-black text-xl transition-all active:scale-[0.98]
              ${!canCheckout
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : payMethod === 'cash'
                  ? 'bg-[#1D9E75] text-white hover:bg-[#0F6E56] shadow-md'
                  : 'bg-[#185FA5] text-white hover:bg-blue-800 shadow-md'}`}>
            {!canCheckout ? '請輸入金額' : '完成結帳'}
          </button>
        </div>
      </div>

      <Toast msg={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  )

  // ══════════════════════════════════════════════════════════
  // STEP 3 — 明細
  // ══════════════════════════════════════════════════════════
  if (step === 'receipt' && receiptData) {
    const isCash   = receiptData.payMethod === 'cash'
    const payLabel = receiptData.payMethod === 'cash' ? '現金'
      : receiptData.payMethod === 'mobile'
        ? (MOBILE_SUB.find(m => m.id === receiptData.mobileSubPay)?.label ?? '行動支付')
        : '轉帳'

    return (
      <div className="h-full flex flex-col bg-[#F5F5F0] overflow-hidden">
        <style>{`@media print { .no-print { display:none !important; } .print-card { box-shadow:none !important; } }`}</style>

        {/* Sub-header */}
        <div className="no-print flex justify-between items-center px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
          <span className="text-sm font-bold text-gray-700">銷售明細</span>
          <StepBar current="receipt" />
        </div>

        {/* 背景儲存失敗警告 */}
        {submitError && (
          <div className="no-print bg-red-600 text-white text-sm font-semibold px-4 py-2 flex items-center gap-2 flex-shrink-0">
            ⚠️ 結帳記錄尚未儲存至 Google Sheets，請截圖留存或重新確認網路
          </div>
        )}

        <div className="flex-1 overflow-y-auto flex justify-center py-6 px-4">
          <div className="print-card bg-white rounded-2xl shadow-lg w-full max-w-sm p-6">

            {/* Receipt header */}
            <div className="text-center pb-4 border-b border-gray-200 mb-4">
              <div className="text-lg font-black text-gray-800">銷售明細單</div>
              <div className="text-xs text-gray-400 mt-1">
                {receiptData.time.toLocaleString('zh-TW')}
              </div>
              {receiptData.customerName !== '散客' && (
                <div className="text-sm text-[#1D9E75] font-semibold mt-1">
                  👤 {receiptData.customerName}
                </div>
              )}
              {receiptData.staffName && (
                <div className="text-xs text-gray-400 mt-1">
                  操作員工：{receiptData.staffName}
                </div>
              )}
            </div>

            {/* Items */}
            <div className="space-y-2 mb-4">
              {receiptData.items.map((item, i) => (
                <div key={i} className="flex justify-between text-base">
                  <span className="text-gray-700">{item.name} ×{item.qty}</span>
                  <span className="font-semibold text-gray-800">${(item.price * item.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-gray-300 mb-4" />

            {/* Payment method */}
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>付款方式</span>
              <span className="font-semibold text-gray-700">{payLabel}</span>
            </div>

            {/* Total */}
            <div className="flex justify-between items-baseline mb-3">
              <span className="text-gray-700 font-bold text-lg">合計</span>
              <span className="font-black text-gray-800" style={{ fontSize: '28px' }}>
                ${receiptData.total.toLocaleString()}
              </span>
            </div>

            {/* Cash detail */}
            {isCash && (
              <>
                <div className="flex justify-between text-sm text-gray-400 mb-3">
                  <span>實收</span>
                  <span>${receiptData.cashIn.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center bg-green-50 rounded-2xl px-4 py-4">
                  <span className="text-[#1D9E75] font-bold text-lg">找零</span>
                  <span className="font-black text-[#1D9E75]" style={{ fontSize: '36px' }}>
                    ${receiptData.change.toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="no-print flex gap-3 p-4 bg-white border-t border-gray-200 flex-shrink-0">
          <button onClick={() => window.print()}
            className="flex-1 py-3.5 rounded-xl border-2 border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors">
            🖨️ 列印收據
          </button>
          <button onClick={handleNewOrder}
            className="flex-1 py-3.5 rounded-xl bg-[#1D9E75] text-white font-bold hover:bg-[#0F6E56] transition-colors">
            新的一單 →
          </button>
        </div>

        <Toast msg={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      </div>
    )
  }

  return null
}
