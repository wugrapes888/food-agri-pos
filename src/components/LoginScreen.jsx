import { useState } from 'react'

export default function LoginScreen({ onSuccess }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    const saved = localStorage.getItem('pos_password') ?? 'food2024'
    if (input === saved) {
      sessionStorage.setItem('pos_authed', '1')
      onSuccess()
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
        <h2 className="text-center font-bold text-gray-700 text-lg">請輸入密碼</h2>

        <input
          type="password"
          autoFocus
          value={input}
          onChange={e => { setInput(e.target.value); setError(false) }}
          placeholder="密碼"
          className={`w-full border rounded-lg px-4 py-3 text-center text-lg tracking-widest focus:outline-none
            ${error ? 'border-red-400 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-green-400'}`}
        />

        {error && (
          <p className="text-center text-red-500 text-sm">密碼錯誤，請重試</p>
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
