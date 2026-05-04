import { useState, useEffect } from 'react'
import {
  getTodayStats, getRevenueByDate, getProductSales,
  getCostRecords, saveCostRecord, deleteCostRecord, getProductProfit,
} from '../services/gasApi'

// ── 日期工具 ────────────────────────────────────────────────────

const fmtDate = d => d.toISOString().slice(0, 10)

function getDimRange(dim, customStart, customEnd) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (dim === 'custom')    return { start: customStart || fmtDate(today), end: customEnd || fmtDate(today) }
  if (dim === 'daily')     return { start: fmtDate(today), end: fmtDate(today) }
  if (dim === 'weekly') {
    const dow = today.getDay()
    const mon = new Date(today); mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
    const sun = new Date(mon);   sun.setDate(mon.getDate() + 6)
    return { start: fmtDate(mon), end: fmtDate(sun) }
  }
  if (dim === 'monthly') {
    const s = new Date(today.getFullYear(), today.getMonth(), 1)
    const e = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { start: fmtDate(s), end: fmtDate(e) }
  }
  if (dim === 'quarterly') {
    const q = Math.floor(today.getMonth() / 3)
    const s = new Date(today.getFullYear(), q * 3, 1)
    const e = new Date(today.getFullYear(), q * 3 + 3, 0)
    return { start: fmtDate(s), end: fmtDate(e) }
  }
  // yearly
  return { start: `${today.getFullYear()}-01-01`, end: `${today.getFullYear()}-12-31` }
}

function getPrevRange({ start, end }) {
  const s = new Date(start), e = new Date(end)
  const days = Math.round((e - s) / 86400000) + 1
  const pe = new Date(s); pe.setDate(pe.getDate() - 1)
  const ps = new Date(pe); ps.setDate(pe.getDate() - days + 1)
  return { start: fmtDate(ps), end: fmtDate(pe) }
}

function sumRows(rows) {
  return rows.reduce((acc, r) => ({
    revenue:  acc.revenue  + r.revenue,
    orders:   acc.orders   + r.orders,
    cash:     acc.cash     + (r.cash     || 0),
    transfer: acc.transfer + (r.transfer || 0),
    linepay:  acc.linepay  + (r.linepay  || 0),
  }), { revenue: 0, orders: 0, cash: 0, transfer: 0, linepay: 0 })
}

function growthPct(curr, prev) {
  if (!prev) return null
  return Math.round((curr - prev) / prev * 100)
}

function groupForChart(rows, dim) {
  if (dim === 'yearly') {
    const map = {}
    rows.forEach(r => {
      const m = r.date.slice(0, 7)
      if (!map[m]) map[m] = { label: r.date.slice(5, 7) + '月', revenue: 0 }
      map[m].revenue += r.revenue
    })
    return Object.values(map).sort((a, b) => a.label.localeCompare(b.label))
  }
  if (dim === 'quarterly') {
    const map = {}
    rows.forEach(r => {
      const d = new Date(r.date)
      const dow = d.getDay()
      const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
      const key = fmtDate(mon)
      if (!map[key]) map[key] = { label: key.slice(5), revenue: 0 }
      map[key].revenue += r.revenue
    })
    return Object.values(map).sort((a, b) => a.label.localeCompare(b.label))
  }
  return rows.map(r => ({ label: r.date.slice(5), revenue: r.revenue }))
}

// ── 共用元件 ────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'green', growth }) {
  const colors = {
    green:  'bg-green-50  border-green-200  text-green-700',
    blue:   'bg-blue-50   border-blue-200   text-blue-700',
    amber:  'bg-amber-50  border-amber-200  text-amber-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">{label}</div>
      <div className="text-3xl font-black">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
      {growth != null && (
        <div className={`text-xs font-bold mt-1.5 ${growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {growth >= 0 ? '▲' : '▼'} {Math.abs(growth)}% vs 上期
        </div>
      )}
    </div>
  )
}

function PayBar({ cash, transfer, linepay, total }) {
  if (!total) return null
  const pct = v => Math.round(v / total * 100)
  return (
    <div className="mt-4">
      <div className="text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wide">付款方式分佈</div>
      <div className="flex rounded-full overflow-hidden h-5 text-xs font-bold text-white">
        {cash     > 0 && <div style={{ width: pct(cash)     + '%' }} className="bg-green-500  flex items-center justify-center">{pct(cash)}%</div>}
        {transfer > 0 && <div style={{ width: pct(transfer) + '%' }} className="bg-blue-500   flex items-center justify-center">{pct(transfer)}%</div>}
        {linepay  > 0 && <div style={{ width: pct(linepay)  + '%' }} className="bg-emerald-400 flex items-center justify-center">{pct(linepay)}%</div>}
      </div>
      <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
        <span>💵 現金 ${cash.toLocaleString()}</span>
        <span>🏦 轉帳 ${transfer.toLocaleString()}</span>
        <span>💚 Line Pay ${linepay.toLocaleString()}</span>
      </div>
    </div>
  )
}

function TrendChart({ bars }) {
  if (!bars || bars.length === 0) return null
  const maxRev = Math.max(...bars.map(b => b.revenue), 1)
  const every  = bars.length <= 7 ? 1 : bars.length <= 14 ? 2 : 5
  return (
    <div>
      <div className="flex items-end gap-px h-28">
        {bars.map((b, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col justify-end"
            title={`${b.label}：$${b.revenue.toLocaleString()}`}
          >
            <div
              className="w-full bg-green-400 rounded-t-sm transition-all hover:bg-green-500"
              style={{ height: `${Math.max(b.revenue > 0 ? (b.revenue / maxRev * 100) : 0, b.revenue > 0 ? 2 : 0)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-px mt-1">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 text-center text-gray-400 overflow-hidden" style={{ fontSize: '10px' }}>
            {i % every === 0 ? b.label : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

const DIMS = [
  { id: 'daily',     label: '日' },
  { id: 'weekly',    label: '週' },
  { id: 'monthly',   label: '月' },
  { id: 'quarterly', label: '季' },
  { id: 'yearly',    label: '年' },
  { id: 'custom',    label: '自訂' },
]

function TimePicker({ dim, setDim, customStart, setCustomStart, customEnd, setCustomEnd }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
        {DIMS.map(d => (
          <button
            key={d.id}
            onClick={() => setDim(d.id)}
            className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${
              dim === d.id ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      {dim === 'custom' && (
        <div className="flex items-center gap-1.5 text-sm">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
          <span className="text-gray-400">—</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="w-7 h-7 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ── 今日概況 Tab ────────────────────────────────────────────────

function TodayTab() {
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = () => {
    setLoading(true); setError('')
    getTodayStats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  if (loading) return <Spinner />
  if (error)   return (
    <div className="text-center py-8 text-gray-400 text-sm">
      {error}
      <button onClick={load} className="ml-2 text-green-600 underline">重試</button>
    </div>
  )
  if (!stats) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-gray-400">{stats.date}</div>
        <button onClick={load} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50">
          ↺ 重新整理
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="總收款"      value={`$${(stats.totalRevenue || 0).toLocaleString()}`} color="green" />
        <StatCard label="結帳筆數"    value={stats.txCount || 0} sub="筆" color="blue" />
        <StatCard label="平均客單"    value={`$${(stats.avgOrder || 0).toLocaleString()}`} color="amber" />
        <StatCard label="預購 / 散客" value={`${stats.preorderCount} / ${stats.walkCount}`}
          sub={`總 ${(stats.preorderCount || 0) + (stats.walkCount || 0)} 筆`} color="indigo" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5">
        <div className="text-sm font-bold text-gray-700 mb-3">付款方式明細</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-green-50 rounded-lg py-3">
            <div className="text-lg font-black text-green-700">${(stats.cashRevenue || 0).toLocaleString()}</div>
            <div className="text-xs text-green-500">💵 現金</div>
          </div>
          <div className="bg-blue-50 rounded-lg py-3">
            <div className="text-lg font-black text-blue-700">${(stats.transferRevenue || 0).toLocaleString()}</div>
            <div className="text-xs text-blue-500">🏦 轉帳</div>
          </div>
          <div className="bg-emerald-50 rounded-lg py-3">
            <div className="text-lg font-black text-emerald-700">${(stats.linepayRevenue || 0).toLocaleString()}</div>
            <div className="text-xs text-emerald-500">💚 Line Pay</div>
          </div>
        </div>
        <PayBar cash={stats.cashRevenue||0} transfer={stats.transferRevenue||0} linepay={stats.linepayRevenue||0} total={stats.totalRevenue||0} />
      </div>

      {stats.stockSummary?.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">今日庫存</h2>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left   text-xs text-gray-500 font-bold">商品</th>
                  <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-bold">開攤</th>
                  <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-bold">售出</th>
                  <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-bold">結餘</th>
                  <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-bold">狀態</th>
                </tr>
              </thead>
              <tbody>
                {stats.stockSummary.map((row, i) => {
                  const isSoldOut = row.remaining === 0
                  const isLow     = row.remaining > 0 && row.remaining <= 3
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{row.name}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{row.openStock}</td>
                      <td className="px-4 py-2.5 text-center text-gray-700 font-semibold">{row.sold}</td>
                      <td className="px-4 py-2.5 text-center font-bold">
                        <span className={isSoldOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-green-600'}>
                          {row.remaining}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isSoldOut
                          ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">售罄</span>
                          : isLow
                          ? <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold">偏低</span>
                          : <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold">正常</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── 營收總覽 Tab ────────────────────────────────────────────────

function RevenueTab() {
  const today = fmtDate(new Date())
  const [dim,         setDim]         = useState('yearly')
  const [customStart, setCustomStart] = useState(today)
  const [customEnd,   setCustomEnd]   = useState(today)
  const [loading,     setLoading]     = useState(false)
  const [currRows,    setCurrRows]    = useState([])
  const [prevRows,    setPrevRows]    = useState([])
  const [gasError,    setGasError]    = useState('')

  useEffect(() => {
    if (dim === 'custom' && (!customStart || !customEnd || customStart > customEnd)) return
    let cancelled = false
    setLoading(true)
    setGasError('')
    const range = getDimRange(dim, customStart, customEnd)
    const prev  = getPrevRange(range)
    Promise.all([
      getRevenueByDate(range.start, range.end),
      getRevenueByDate(prev.start,  prev.end),
    ]).then(([c, p]) => {
      if (!cancelled) { setCurrRows(Array.isArray(c) ? c : []); setPrevRows(Array.isArray(p) ? p : []) }
    }).catch(err => {
      if (!cancelled) { setCurrRows([]); setPrevRows([]); setGasError(err.message) }
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dim, customStart, customEnd])

  const range = getDimRange(dim, customStart, customEnd)
  const curr  = sumRows(currRows)
  const prev  = sumRows(prevRows)
  const aov   = curr.orders ? Math.round(curr.revenue / curr.orders) : 0
  const paov  = prev.orders ? Math.round(prev.revenue / prev.orders) : 0
  const bars  = groupForChart(currRows, dim)

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <TimePicker dim={dim} setDim={setDim}
          customStart={customStart} setCustomStart={setCustomStart}
          customEnd={customEnd}     setCustomEnd={setCustomEnd} />
      </div>
      <div className="text-xs text-gray-400 mb-4">{range.start} ～ {range.end}</div>

      {loading ? <Spinner /> : gasError ? (
        <div className="text-center py-8 text-red-400 text-sm bg-red-50 rounded-xl p-4">
          <div className="font-bold mb-1">GAS 回應錯誤</div>
          <div className="font-mono text-xs">{gasError}</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
            <StatCard label="總收款"   value={`$${curr.revenue.toLocaleString()}`}  color="green" growth={growthPct(curr.revenue, prev.revenue)} />
            <StatCard label="結帳筆數" value={curr.orders} sub="筆"                 color="blue"  growth={growthPct(curr.orders,  prev.orders)}  />
            <StatCard label="平均客單" value={`$${aov.toLocaleString()}`}           color="amber" growth={growthPct(aov, paov)} />
          </div>

          {bars.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5">
              <div className="text-sm font-bold text-gray-700 mb-3">收款趨勢</div>
              <TrendChart bars={bars} />
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="text-sm font-bold text-gray-700 mb-3">付款方式明細</div>
            <div className="grid grid-cols-3 gap-3 text-center mb-1">
              <div className="bg-green-50 rounded-lg py-3">
                <div className="text-lg font-black text-green-700">${curr.cash.toLocaleString()}</div>
                <div className="text-xs text-green-500">💵 現金</div>
              </div>
              <div className="bg-blue-50 rounded-lg py-3">
                <div className="text-lg font-black text-blue-700">${curr.transfer.toLocaleString()}</div>
                <div className="text-xs text-blue-500">🏦 轉帳</div>
              </div>
              <div className="bg-emerald-50 rounded-lg py-3">
                <div className="text-lg font-black text-emerald-700">${curr.linepay.toLocaleString()}</div>
                <div className="text-xs text-emerald-500">💚 Line Pay</div>
              </div>
            </div>
            <PayBar cash={curr.cash} transfer={curr.transfer} linepay={curr.linepay} total={curr.revenue} />
          </div>
        </>
      )}
    </div>
  )
}

// ── 產品銷售 Tab ────────────────────────────────────────────────

function ProductTab() {
  const today = fmtDate(new Date())
  const [dim,         setDim]         = useState('yearly')
  const [customStart, setCustomStart] = useState(today)
  const [customEnd,   setCustomEnd]   = useState(today)
  const [loading,     setLoading]     = useState(false)
  const [products,    setProducts]    = useState([])
  const [topN,        setTopN]        = useState(10)
  const [sortBy,      setSortBy]      = useState('amount')
  const [gasError,    setGasError]    = useState('')

  useEffect(() => {
    if (dim === 'custom' && (!customStart || !customEnd || customStart > customEnd)) return
    let cancelled = false
    setLoading(true)
    setGasError('')
    const range = getDimRange(dim, customStart, customEnd)
    getProductSales(range.start, range.end)
      .then(data => { if (!cancelled) setProducts(Array.isArray(data) ? data : []) })
      .catch(err => { if (!cancelled) { setProducts([]); setGasError(err.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dim, customStart, customEnd])

  const range       = getDimRange(dim, customStart, customEnd)
  const totalRev    = products.reduce((s, p) => s + p.amount, 0)
  const sorted      = [...products].sort((a, b) => sortBy === 'amount' ? b.amount - a.amount : b.qty - a.qty)
  const displayed   = sorted.slice(0, topN)
  const maxAmount   = displayed[0]?.amount || 1

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <TimePicker dim={dim} setDim={setDim}
          customStart={customStart} setCustomStart={setCustomStart}
          customEnd={customEnd}     setCustomEnd={setCustomEnd} />
      </div>
      <div className="text-xs text-gray-400 mb-4">{range.start} ～ {range.end}</div>

      {loading ? <Spinner /> : (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {[5, 10, 20].map(n => (
                <button key={n} onClick={() => setTopN(n)}
                  className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${topN === n ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Top {n}
                </button>
              ))}
            </div>
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              <button onClick={() => setSortBy('amount')}
                className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${sortBy === 'amount' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                依金額
              </button>
              <button onClick={() => setSortBy('qty')}
                className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${sortBy === 'qty' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                依數量
              </button>
            </div>
          </div>

          {gasError ? (
            <div className="text-center py-8 text-red-400 text-sm bg-red-50 rounded-xl p-4">
              <div className="font-bold mb-1">GAS 回應錯誤</div>
              <div className="font-mono text-xs">{gasError}</div>
            </div>
          ) : displayed.length === 0
            ? <div className="text-center py-10 text-gray-300 text-sm">此期間無銷售資料</div>
            : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2.5 text-left   text-xs text-gray-500 font-bold w-8">#</th>
                      <th className="px-3 py-2.5 text-left   text-xs text-gray-500 font-bold">商品名稱</th>
                      <th className="px-3 py-2.5 text-right  text-xs text-gray-500 font-bold">數量</th>
                      <th className="px-3 py-2.5 text-right  text-xs text-gray-500 font-bold">金額</th>
                      <th className="px-3 py-2.5 text-left   text-xs text-gray-500 font-bold w-32">佔比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((p, i) => {
                      const share = totalRev ? Math.round(p.amount / totalRev * 100) : 0
                      const barW  = Math.round(p.amount / maxAmount * 100)
                      return (
                        <tr key={p.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-gray-400 font-bold text-xs">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-gray-800">{p.name}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{p.qty.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-gray-800">${p.amount.toLocaleString()}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                <div className="bg-green-400 h-1.5 rounded-full" style={{ width: barW + '%' }} />
                              </div>
                              <span className="text-xs text-gray-400 w-7 text-right">{share}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </>
      )}
    </div>
  )
}

// ── 毛利分析 Tab ────────────────────────────────────────────────

function ProfitTab() {
  const today = fmtDate(new Date())
  const [dim,         setDim]         = useState('yearly')
  const [customStart, setCustomStart] = useState(today)
  const [customEnd,   setCustomEnd]   = useState(today)
  const [loading,     setLoading]     = useState(false)
  const [profitData,  setProfitData]  = useState([])
  const [costRecords, setCostRecords] = useState([])
  const [showForm,    setShowForm]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [gasError,    setGasError]    = useState('')
  const [form, setForm] = useState({ product: '', date: today, cost: '', note: '' })

  const reloadCosts = () => getCostRecords().then(setCostRecords)

  const reloadProfit = (d, cs, ce) => {
    const range = getDimRange(d, cs, ce)
    return getProductProfit(range.start, range.end).then(setProfitData)
  }

  useEffect(() => { reloadCosts() }, [])

  useEffect(() => {
    if (dim === 'custom' && (!customStart || !customEnd || customStart > customEnd)) return
    let cancelled = false
    setLoading(true)
    setGasError('')
    const range = getDimRange(dim, customStart, customEnd)
    getProductProfit(range.start, range.end)
      .then(data => { if (!cancelled) setProfitData(Array.isArray(data) ? data : []) })
      .catch(err => { if (!cancelled) { setProfitData([]); setGasError(err.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dim, customStart, customEnd])

  const handleSave = async () => {
    if (!form.product.trim() || !form.date || !form.cost) return
    setSaving(true)
    try {
      await saveCostRecord(form.product.trim(), form.date, Number(form.cost), form.note)
      await reloadCosts()
      await reloadProfit(dim, customStart, customEnd)
      setShowForm(false)
      setForm({ product: '', date: today, cost: '', note: '' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (product, date) => {
    await deleteCostRecord(product, date)
    await reloadCosts()
    await reloadProfit(dim, customStart, customEnd)
  }

  const range = getDimRange(dim, customStart, customEnd)
  const withCost    = profitData.filter(p => p.grossMargin !== null)
  const totalRev    = withCost.reduce((s, p) => s + p.amount, 0)
  const totalProfit = withCost.reduce((s, p) => s + p.grossProfit, 0)
  const overallMargin = totalRev > 0 ? Math.round(totalProfit / totalRev * 100) : null

  return (
    <div>
      {/* ── 進貨成本記錄 ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-700">進貨成本記錄</div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
          >
            + 新增進貨
          </button>
        </div>

        {showForm && (
          <div className="bg-gray-50 rounded-xl p-4 mb-4 grid grid-cols-2 gap-2">
            <input
              placeholder="商品名稱"
              value={form.product}
              onChange={e => setForm(f => ({ ...f, product: e.target.value }))}
              className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            />
            <div>
              <div className="text-xs text-gray-400 mb-1">進貨日期</div>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">每單位成本（$）</div>
              <input
                type="number" placeholder="80"
                value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
              />
            </div>
            <input
              placeholder="備註（選用）"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            />
            <div className="col-span-2 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">取消</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.product.trim() || !form.cost}
                className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40"
              >
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        )}

        {costRecords.length === 0 ? (
          <div className="text-center py-5 text-gray-300 text-sm">尚未新增任何進貨成本記錄</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400">
                <th className="pb-2 text-left font-semibold">商品</th>
                <th className="pb-2 text-left font-semibold">進貨日期</th>
                <th className="pb-2 text-right font-semibold">每單位成本</th>
                <th className="pb-2 text-left font-semibold pl-3">備註</th>
                <th className="pb-2 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {costRecords.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="py-2 font-medium text-gray-800">{r.product}</td>
                  <td className="py-2 text-gray-500">{r.date}</td>
                  <td className="py-2 text-right font-bold text-gray-800">${r.cost}</td>
                  <td className="py-2 pl-3 text-gray-400 text-xs">{r.note}</td>
                  <td className="py-2 text-center">
                    <button
                      onClick={() => handleDelete(r.product, r.date)}
                      className="text-red-300 hover:text-red-500 text-xs leading-none"
                      title="刪除"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 毛利分析 ── */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <TimePicker dim={dim} setDim={setDim}
          customStart={customStart} setCustomStart={setCustomStart}
          customEnd={customEnd}     setCustomEnd={setCustomEnd} />
      </div>
      <div className="text-xs text-gray-400 mb-4">{range.start} ～ {range.end}</div>

      {loading ? <Spinner /> : gasError ? (
        <div className="text-center py-8 text-red-400 text-sm bg-red-50 rounded-xl p-4">
          <div className="font-bold mb-1">GAS 回應錯誤</div>
          <div className="font-mono text-xs">{gasError}</div>
        </div>
      ) : profitData.length === 0 ? (
        <div className="text-center py-8 text-gray-300 text-sm">此期間無銷售資料</div>
      ) : (
        <>
          {overallMargin !== null && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatCard label="整體銷售額" value={`$${totalRev.toLocaleString()}`}    color="blue"  />
              <StatCard label="整體毛利"   value={`$${totalProfit.toLocaleString()}`} color="green" />
              <StatCard label="整體毛利率" value={`${overallMargin}%`}
                color={overallMargin < 20 ? 'amber' : 'green'} />
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2.5 text-left   text-xs text-gray-500 font-bold">商品</th>
                  <th className="px-3 py-2.5 text-right  text-xs text-gray-500 font-bold">數量</th>
                  <th className="px-3 py-2.5 text-right  text-xs text-gray-500 font-bold">銷售額</th>
                  <th className="px-3 py-2.5 text-right  text-xs text-gray-500 font-bold">估算成本</th>
                  <th className="px-3 py-2.5 text-right  text-xs text-gray-500 font-bold">毛利</th>
                  <th className="px-3 py-2.5 text-center text-xs text-gray-500 font-bold">毛利率</th>
                </tr>
              </thead>
              <tbody>
                {profitData.map((p, i) => {
                  const low = p.grossMargin !== null && p.grossMargin < 20
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-800">{p.name}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500">{p.qty}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">${p.amount.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right text-gray-400">
                        {p.totalCost !== null ? `$${p.totalCost.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold">
                        {p.grossProfit !== null
                          ? <span className={p.grossProfit < 0 ? 'text-red-500' : 'text-gray-800'}>${p.grossProfit.toLocaleString()}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {p.grossMargin !== null
                          ? <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${low ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                              {p.grossMargin}%
                            </span>
                          : <span className="text-gray-300 text-xs">未設定</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── 毛利試算 Tab ────────────────────────────────────────────────

function CalculatorTab() {
  const [price,        setPrice]        = useState('')
  const [cost,         setCost]         = useState('')
  const [qty,          setQty]          = useState('')
  const [targetMargin, setTargetMargin] = useState('')

  const p  = parseFloat(price)  || 0
  const c  = parseFloat(cost)   || 0
  const q  = parseInt(qty)      || 0
  const tm = parseFloat(targetMargin) || 0

  const unitProfit    = p > 0 && c > 0 ? p - c : null
  const margin        = p > 0 && c > 0 ? (p - c) / p * 100 : null
  const totalProfit   = unitProfit !== null && q > 0 ? unitProfit * q : null
  const suggestedPrice = c > 0 && tm > 0 && tm < 100 ? Math.ceil(c / (1 - tm / 100)) : null

  const hasResult = p > 0 && c > 0

  return (
    <div className="max-w-lg">
      {/* 輸入區 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
        <div className="text-sm font-bold text-gray-700 mb-4">輸入資料</div>
        <div className="grid gap-3">
          {[
            { label: '售價', value: price, set: setPrice, placeholder: '150', prefix: '$' },
            { label: '進貨成本', value: cost, set: setCost, placeholder: '80',  prefix: '$' },
          ].map(({ label, value, set, placeholder, prefix }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-20 flex-shrink-0">{label}</span>
              <div className="flex-1 flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-r border-gray-200">{prefix}</span>
                <input
                  type="number" placeholder={placeholder} value={value}
                  onChange={e => set(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-20 flex-shrink-0">數量（選用）</span>
            <input
              type="number" placeholder="10" value={qty}
              onChange={e => setQty(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>
      </div>

      {/* 計算結果 */}
      {hasResult && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">單件毛利</div>
            <div className="text-2xl font-black text-green-700">${unitProfit}</div>
          </div>
          <div className={`border rounded-xl p-4 text-center ${margin < 20 ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
            <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${margin < 20 ? 'text-red-500' : 'text-blue-600'}`}>毛利率</div>
            <div className={`text-2xl font-black ${margin < 20 ? 'text-red-600' : 'text-blue-700'}`}>
              {margin.toFixed(1)}%
            </div>
            {margin < 20 && <div className="text-xs text-red-400 mt-1">偏低</div>}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">
              {q > 0 ? `總毛利 ×${q}` : '總毛利'}
            </div>
            <div className="text-2xl font-black text-amber-700">
              {totalProfit !== null ? `$${totalProfit.toLocaleString()}` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* 反推售價 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="text-sm font-bold text-gray-700 mb-3">目標毛利率 → 建議售價</div>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-600 w-20 flex-shrink-0">目標毛利率</span>
          <div className="flex-1 flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <input
              type="number" placeholder="40" value={targetMargin}
              onChange={e => setTargetMargin(e.target.value)}
              className="flex-1 px-3 py-2 text-sm outline-none"
            />
            <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-l border-gray-200">%</span>
          </div>
        </div>
        {suggestedPrice ? (
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <div className="text-xs text-green-600 font-semibold mb-1">建議售價（無條件進位）</div>
            <div className="text-3xl font-black text-green-700">${suggestedPrice}</div>
            {c > 0 && (
              <div className="text-xs text-green-500 mt-1.5">
                成本 ${c} ÷ (1 − {targetMargin}%) = ${suggestedPrice}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-3 text-gray-300 text-sm">
            輸入進貨成本與目標毛利率後顯示建議售價
          </div>
        )}
      </div>
    </div>
  )
}

// ── 主頁面 ──────────────────────────────────────────────────────

const TABS = [
  { id: 'today',      label: '今日概況' },
  { id: 'revenue',    label: '營收總覽' },
  { id: 'product',    label: '產品銷售' },
  { id: 'profit',     label: '毛利分析' },
  { id: 'calculator', label: '毛利試算' },
]

export default function ReportsPage() {
  const [tab, setTab] = useState('today')

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-black text-gray-800 mb-4">📊 報表中心</h1>

        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.id ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'today'      && <TodayTab />}
        {tab === 'revenue'    && <RevenueTab />}
        {tab === 'product'    && <ProductTab />}
        {tab === 'profit'     && <ProfitTab />}
        {tab === 'calculator' && <CalculatorTab />}
      </div>
    </div>
  )
}
