import { useState } from 'react'
import {
  getGasUrl, setGasUrl, pingPOS,
  getSourceSheetId, setSourceSheetId, extractSheetId,
  syncFromExternalOrders,
} from '../services/gasApi'
import { getEmployees, DEFAULT_EMPLOYEES } from '../components/LoginScreen'

export default function SettingsPage({ onSaved }) {
  const [url, setUrl]               = useState(getGasUrl)
  const [testing, setTesting]       = useState(false)
  const [result, setResult]         = useState(null) // { ok, msg }

  const [sourceUrl, setSourceUrl]   = useState(getSourceSheetId)
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState(null) // { ok, msg }

  // 員工管理
  const [employees, setEmployees] = useState(() => getEmployees())
  const [newId, setNewId]         = useState('')
  const [newName, setNewName]     = useState('')
  const [empResult, setEmpResult] = useState(null)

  const saveEmployees = (list) => {
    localStorage.setItem('pos_employees', JSON.stringify(list))
    setEmployees(list)
  }

  const addEmployee = () => {
    const id = newId.trim(), name = newName.trim()
    if (!id || !name) { setEmpResult({ ok: false, msg: '請填寫編號和姓名' }); return }
    if (employees.find(e => e.id === id)) { setEmpResult({ ok: false, msg: `編號 ${id} 已存在` }); return }
    saveEmployees([...employees, { id, name, role: 'staff' }])
    setNewId(''); setNewName('')
    setEmpResult({ ok: true, msg: `✅ 已新增：${name}（${id}）` })
  }

  const removeEmployee = (id) => {
    if (id === '316') return
    saveEmployees(employees.filter(e => e.id !== id))
    setEmpResult({ ok: true, msg: `已刪除編號 ${id}` })
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

        {/* 員工管理 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="font-bold text-gray-700">👥 員工管理</h2>
            <p className="text-sm text-gray-500 mt-1">
              員工輸入編號登入後，可使用<span className="font-semibold text-gray-700">收銀、取貨</span>功能。<br/>
              老闆編號 <code className="bg-gray-100 px-1 rounded">316</code> 無法刪除，可使用全部功能。
            </p>
          </div>

          {/* 現有員工列表 */}
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-3 py-2">編號</th>
                  <th className="text-left px-3 py-2">姓名</th>
                  <th className="text-left px-3 py-2">權限</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-mono font-bold text-gray-700">{emp.id}</td>
                    <td className="px-3 py-2 font-semibold text-gray-800">{emp.name}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                        ${emp.role === 'boss' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-50 text-blue-700'}`}>
                        {emp.role === 'boss' ? '👑 老闆' : '👤 員工'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {emp.id !== '316' && (
                        <button
                          onClick={() => removeEmployee(emp.id)}
                          className="text-red-400 hover:text-red-600 text-xs font-semibold"
                        >
                          刪除
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 新增員工 */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-semibold block mb-1">員工編號</label>
              <input
                type="text"
                inputMode="numeric"
                value={newId}
                onChange={e => { setNewId(e.target.value); setEmpResult(null) }}
                placeholder="例如：001"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-semibold block mb-1">姓名</label>
              <input
                type="text"
                value={newName}
                onChange={e => { setNewName(e.target.value); setEmpResult(null) }}
                placeholder="例如：小明"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
              />
            </div>
            <button
              onClick={addEmployee}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 whitespace-nowrap"
            >
              ＋ 新增
            </button>
          </div>

          {empResult && (
            <div className={`px-3 py-2 rounded-lg text-sm font-medium
              ${empResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {empResult.msg}
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
