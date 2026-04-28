import { useState, useEffect } from 'react'
import { getTodayStats } from '../services/gasApi'

function StatCard({ label, value, sub, color = 'green' }) {
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

export default function ReportsPage() {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  const load = () => {
    setLoading(true)
    getTodayStats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
      <span className="text-4xl">⚠️</span>
      <p className="text-sm">{error}</p>
      <button onClick={load} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm">重試</button>
    </div>
  )

  if (!stats) return null

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-800">📊 報表中心</h1>
            <p className="text-sm text-gray-400 mt-0.5">{stats.date} 每日報表</p>
          </div>
          <button onClick={load} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50">
            ↺ 重新整理
          </button>
        </div>

        {/* ── 今日收款概況 ──────────────────────────────── */}
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">今日收款</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard label="總收款"   value={`$${(stats.totalRevenue || 0).toLocaleString()}`} color="green" />
          <StatCard label="結帳筆數" value={stats.txCount || 0}    sub="筆" color="blue" />
          <StatCard label="平均客單" value={`$${(stats.avgOrder || 0).toLocaleString()}`}    color="amber" />
          <StatCard
            label="預購 / 散客"
            value={`${stats.preorderCount} / ${stats.walkCount}`}
            sub={`總 ${(stats.preorderCount || 0) + (stats.walkCount || 0)} 筆`}
            color="indigo"
          />
        </div>

        {/* 付款方式 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
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
          <PayBar
            cash={stats.cashRevenue || 0}
            transfer={stats.transferRevenue || 0}
            linepay={stats.linepayRevenue || 0}
            total={stats.totalRevenue || 0}
          />
        </div>

        {/* ── 庫存報表 ──────────────────────────────────── */}
        {stats.stockSummary && stats.stockSummary.length > 0 && (
          <>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">今日庫存</h2>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-bold uppercase">商品</th>
                    <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-bold uppercase">開攤</th>
                    <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-bold uppercase">售出</th>
                    <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-bold uppercase">結餘</th>
                    <th className="px-4 py-2.5 text-center text-xs text-gray-500 font-bold uppercase">狀態</th>
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
                            : <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold">正常</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="text-center text-xs text-gray-300 mt-4 pb-6">
          跨期月報表功能連接 GAS 後可查看歷史資料
        </div>
      </div>
    </div>
  )
}
