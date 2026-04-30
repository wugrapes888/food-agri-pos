import { useState } from 'react'
import {
  getGasUrl, setGasUrl, pingPOS,
  getSourceSheetId, setSourceSheetId, extractSheetId,
  syncFromExternalOrders,
} from '../services/gasApi'

export default function SettingsPage({ onSaved }) {
  const [url, setUrl]               = useState(getGasUrl)
  const [testing, setTesting]       = useState(false)
  const [result, setResult]         = useState(null) // { ok, msg }

  const [sourceUrl, setSourceUrl]   = useState(getSourceSheetId)
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState(null) // { ok, msg }

  const [pwdInput, setPwdInput]     = useState('')
  const [pwdResult, setPwdResult]   = useState(null)

  const handleSavePwd = () => {
    localStorage.setItem('pos_password', pwdInput.trim())
    sessionStorage.setItem('pos_authed', '1')
    setPwdResult({ ok: true, msg: pwdInput.trim() ? '密碼已更新' : '已清除密碼（不需登入）' })
    setPwdInput('')
  }

  const handleTest = async () => {
    if (!url.trim()) { setResult({ ok: false, msg: '請先貼上 GAS Web App URL' }); return }
    setTesting(true)
    setResult(null)
    // 暫存 URL 讓 gasApi 使用
    const prev = getGasUrl()
    setGasUrl(url)
    try {
      const r = await pingPOS()
      setResult({ ok: true, msg: `連線成功 ✅（${r.ts || ''}）` })
    } catch (e) {
      setResult({ ok: false, msg: '連線失敗：' + e.message })
      setGasUrl(prev) // 失敗回復
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    setGasUrl(url)
    setResult({ ok: true, msg: 'GAS URL 已儲存' })
    onSaved?.()
  }

  const handleClear = () => {
    setUrl('')
    setGasUrl('')
    setResult({ ok: true, msg: '已清除，切回示範模式' })
    onSaved?.()
  }

  const handleImport = async () => {
    const raw = sourceUrl.trim()
    if (!raw) { setImportResult({ ok: false, msg: '請先貼上 Google Sheets 連結' }); return }
    const sheetId = extractSheetId(raw)
    setSourceSheetId(sheetId)
    setImporting(true)
    setImportResult(null)
    try {
      const r = await syncFromExternalOrders(sheetId)
      if (r.success) {
        setImportResult({ ok: true, msg: r.count > 0 ? `✅ 成功匯入 ${r.count} 筆新訂單` : '✅ 無新訂單（資料已是最新）' })
      } else {
        setImportResult({ ok: false, msg: '匯入失敗：' + (r.error || '未知錯誤') })
      }
    } catch (e) {
      setImportResult({ ok: false, msg: '匯入失敗：' + e.message })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-800">⚙️ 連線設定</h1>
          <p className="text-sm text-gray-400 mt-1">設定 GAS Web App URL 以連接 Google Sheets 資料</p>
        </div>

        {/* GAS URL 設定 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-gray-700">GAS Web App URL</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            在 Google Apps Script 編輯器中，點選「部署 → 管理部署」，
            複製「網路應用程式」的 URL 貼入下方。
            <br/>
            留白則使用<span className="text-amber-600 font-semibold">示範模式</span>（測試資料，不會寫入 Sheets）。
          </p>

          <textarea
            rows={3}
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-green-400 resize-none"
          />

          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {testing ? '測試中…' : '🔗 測試連線'}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              💾 儲存
            </button>
            {url && (
              <button
                onClick={handleClear}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-500 rounded-lg text-sm font-semibold hover:bg-gray-50"
              >
                清除（示範模式）
              </button>
            )}
          </div>

          {result && (
            <div className={`px-3 py-2 rounded-lg text-sm font-medium
              ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {result.msg}
            </div>
          )}
        </div>

        {/* 團購訂單來源 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="font-bold text-gray-700">📥 團購訂單來源</h2>
            <p className="text-sm text-gray-500 mt-1">
              貼入團購試算表的連結，點「匯入」即可將客人預購資料同步至系統。<br/>
              重複執行不會產生重複資料。
            </p>
          </div>

          <textarea
            rows={2}
            value={sourceUrl}
            onChange={e => setSourceUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…/edit"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-green-400 resize-none"
          />

          <div className="flex gap-2 items-center">
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {importing ? '匯入中…' : '📥 匯入訂單'}
            </button>
            <span className="text-xs text-gray-400">需先設定並儲存 GAS URL</span>
          </div>

          {importResult && (
            <div className={`px-3 py-2 rounded-lg text-sm font-medium
              ${importResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {importResult.msg}
            </div>
          )}
        </div>

        {/* 密碼設定 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="font-bold text-gray-700">🔒 登入密碼</h2>
            <p className="text-sm text-gray-500 mt-1">
              預設密碼為 <code className="bg-gray-100 px-1 rounded">0980558012</code>。
              輸入新密碼後儲存即生效；留白並儲存則取消密碼保護。
            </p>
          </div>

          <input
            type="password"
            value={pwdInput}
            onChange={e => { setPwdInput(e.target.value); setPwdResult(null) }}
            placeholder="輸入新密碼（留白 = 取消密碼保護）"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
          />

          <button
            onClick={handleSavePwd}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
          >
            💾 儲存密碼
          </button>

          {pwdResult && (
            <div className={`px-3 py-2 rounded-lg text-sm font-medium
              ${pwdResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {pwdResult.msg}
            </div>
          )}
        </div>

        {/* 部署步驟說明 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="font-bold text-amber-800 mb-3">🚀 GAS 部署步驟</h2>
          <ol className="text-sm text-amber-700 space-y-2 list-decimal list-inside leading-relaxed">
            <li>開啟 Google Apps Script 專案（群購系統的 GAS 檔案）</li>
            <li>將更新後的 <code className="bg-amber-100 px-1 rounded">Code.gs</code> 和 <code className="bg-amber-100 px-1 rounded">SheetDB.gs</code> 貼入專案</li>
            <li>點選右上角「部署」→「管理部署」→「新增部署」</li>
            <li>類型選「網路應用程式」，執行身分選「我」，存取權限選「任何人」</li>
            <li>複製部署 URL 貼入上方欄位並儲存</li>
          </ol>
        </div>

        {/* 關於 */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="font-bold text-gray-700 mb-2">關於本系統</h2>
          <div className="text-sm text-gray-500 space-y-1">
            <p>食農 POS 現場收銀系統 v1.0</p>
            <p>前端：React + Vite + Tailwind CSS（部署於 GitHub Pages）</p>
            <p>後端：Google Apps Script + Google Sheets</p>
            <p className="text-gray-400 text-xs mt-2">
              現場使用 USB 條碼掃描器（模擬鍵盤），不在輸入框時掃描可直接加入購物車
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
