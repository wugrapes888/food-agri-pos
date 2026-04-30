import { useState, useEffect } from 'react'
import POSPage from './pages/POSPage'
import OrdersPage from './pages/OrdersPage'
import StockSetupPage from './pages/StockSetupPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'
import LoginScreen from './components/LoginScreen'
import { pingPOS, getGasUrl } from './services/gasApi'

const NAV = [
  { id: 'pos',      label: '🛒 收銀'    },
  { id: 'orders',   label: '📋 取貨'    },
  { id: 'stock',    label: '📦 開攤'    },
  { id: 'reports',  label: '📊 報表'    },
  { id: 'settings', label: '⚙️ 設定'   },
]

export default function App() {
  const hasPassword = () => (localStorage.getItem('pos_password') ?? '0980558012') !== ''
  const [authed, setAuthed] = useState(() => !hasPassword() || sessionStorage.getItem('pos_authed') === '1')

  const [page, setPage]                       = useState('pos')
  const [connStatus, setConnStatus]           = useState('checking')
  const [preselectedCustomer, setPreselectedCustomer] = useState(null)

  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />

  const checkConn = () => {
    setConnStatus('checking')
    pingPOS()
      .then(r => setConnStatus(r.mock ? 'mock' : 'ok'))
      .catch(() => setConnStatus('error'))
  }

  useEffect(() => { checkConn() }, [])

  // 每 4 分鐘靜默 ping，避免 GAS 冷啟動造成結帳延遲
  useEffect(() => {
    const id = setInterval(() => {
      if (getGasUrl()) pingPOS().catch(() => {})
    }, 4 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const statusDot = {
    ok:       { color: 'bg-green-400',  label: '已連線 GAS' },
    mock:     { color: 'bg-amber-400',  label: '示範模式'   },
    error:    { color: 'bg-red-400',    label: '連線失敗'   },
    checking: { color: 'bg-gray-400',   label: '連線中…'    },
  }[connStatus]

  // 從取貨管理頁跳轉到收銀並帶入客人
  const handleGoToPOS = (customerName) => {
    setPreselectedCustomer(customerName)
    setPage('pos')
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-100 font-sans">

      {/* ── Header ───────────────────────────── */}
      <header className="h-14 bg-green-700 text-white flex items-center justify-between px-4 flex-shrink-0 shadow-md z-10">
        <div className="flex items-center gap-3">
          <span className="text-xl font-black tracking-wide">食農 POS</span>
          <span className="text-green-200 text-xs hidden sm:block">食農團購發貨系統</span>
        </div>

        {/* 導覽 */}
        <nav className="flex gap-0.5">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors
                ${page === n.id
                  ? 'bg-white text-green-700'
                  : 'text-green-100 hover:bg-green-600'}`}
            >
              {n.label}
            </button>
          ))}
        </nav>

        {/* 連線狀態 */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => setPage('settings')}
          title="點擊前往設定"
        >
          <div className={`w-2.5 h-2.5 rounded-full ${statusDot.color} animate-pulse`} />
          <span className="text-xs text-green-100 hidden sm:block">{statusDot.label}</span>
        </div>
      </header>

      {/* ── 頁面內容 ─────────────────────────── */}
      <main className="flex-1 overflow-hidden">
        {page === 'pos' && (
          <POSPage
            preselectedCustomer={preselectedCustomer}
            onClearPreselect={() => setPreselectedCustomer(null)}
          />
        )}
        {page === 'orders' && (
          <OrdersPage onGoToPOS={handleGoToPOS} />
        )}
        {page === 'stock'   && <StockSetupPage onOpenPOS={() => setPage('pos')} />}
        {page === 'reports' && <ReportsPage />}
        {page === 'settings' && (
          <SettingsPage onSaved={checkConn} />
        )}
      </main>
    </div>
  )
}
