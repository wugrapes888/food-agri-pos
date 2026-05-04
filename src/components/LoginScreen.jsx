import { useState } from 'react'

export const DEFAULT_EMPLOYEES = [{ id: '316', name: '老闆', role: 'boss' }]

export function getEmployees() {
  try { return JSON.parse(localStorage.getItem('pos_employees')) || DEFAULT_EMPLOYEES }
  catch { return DEFAULT_EMPLOYEES }
}

export default function LoginScreen({ onSuccess }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    const user = getEmployees().find(u => u.id === input.trim())
    if (user) {
      sessionStorage.setItem('pos_authed', '1')
      sessionStorage.setItem('pos_user', JSON.stringify(user))
      onSuccess(user)
    } else {
      setError(true)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      setInput('')
    }
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-green-700 gap-6">
      <div className="text-center text-white">
        <div className="text-4xl font-black tracking-wide mb-1">食農 POS</div>
        <div className="text-green-200 text-sm">食農團購發貨系統</div>
      </div>

      <form
        onSubmit={handleSubmit}
        className={`bg-white rounded-2xl shadow-xl p-8 w-80 space-y-4 ${shake ? 'animate-shake' : ''}`}
      >
        <h2 className="text-center font-bold text-gray-700 text-lg">請輸入員工編號</h2>

        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={input}
          onChange={e => { setInput(e.target.value); setError(false) }}
          placeholder="員工編號"
          className={`w-full border rounded-lg px-4 py-3 text-center text-2xl tracking-widest focus:outline-none
            ${error ? 'border-red-400 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-green-400'}`}
        />

        {error && (
          <p className="text-center text-red-500 text-sm">找不到此編號，請確認後重試</p>
        )}

        <button
          type="submit"
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"
        >
          進入系統
        </button>
      </form>

      <p className="text-green-300 text-xs">v1.0</p>
    </div>
  )
}
