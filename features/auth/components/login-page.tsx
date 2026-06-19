'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AivaLogoImage } from '@/features/platform/components/aiva-logo-image'

const savedUsernameStorageKey = 'aiva-saved-username'

type LoginState = 'idle' | 'submitting'

export function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberUsername, setRememberUsername] = useState(false)
  const [message, setMessage] = useState('')
  const [state, setState] = useState<LoginState>('idle')
  const usernameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const savedUsername = window.sessionStorage.getItem(savedUsernameStorageKey)

    if (savedUsername) {
      setUsername(savedUsername)
      setRememberUsername(true)
    }
  }, [])

  useEffect(() => {
    if (!rememberUsername) {
      window.sessionStorage.removeItem(savedUsernameStorageKey)
    }
  }, [rememberUsername])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!username.trim() || !password) {
      setMessage('아이디와 비밀번호를 입력해주세요.')
      return
    }

    setState('submitting')
    setMessage('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      })
      const data = await response.json().catch(() => null) as { message?: string } | null

      if (!response.ok) {
        setMessage(data?.message || '로그인에 실패했습니다.')
        return
      }

      if (rememberUsername) {
        window.sessionStorage.setItem(savedUsernameStorageKey, username.trim())
      } else {
        window.sessionStorage.removeItem(savedUsernameStorageKey)
      }

      const nextPath = searchParams.get('next')
      router.replace(nextPath && nextPath.startsWith('/') ? nextPath : '/')
      router.refresh()
    } catch {
      setMessage('로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setState('idle')
    }
  }

  const clearUsername = () => {
    setUsername('')
    window.sessionStorage.removeItem(savedUsernameStorageKey)
    usernameInputRef.current?.focus()
  }

  return (
    <main className="min-h-screen bg-[#070a12] text-white">
      <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_26%_18%,rgba(0,200,255,0.22),transparent_32%),radial-gradient(circle_at_78%_30%,rgba(184,54,255,0.25),transparent_36%),linear-gradient(135deg,#080b14_0%,#0b1020_48%,#090713_100%)] px-5 py-10">
        <section className="w-full max-w-md rounded-md border border-white/10 bg-[#090d18]/88 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <AivaLogoImage className="h-12 w-12" />
            <div>
              <p className="text-xl font-black tracking-[0.16em]">AIVA</p>
              <p className="text-xs font-bold text-slate-400">AI Marketing Platform</p>
            </div>
          </div>

          <div className="mt-9 text-center">
            <h1 className="text-3xl font-black tracking-[-0.02em]">로그인</h1>
            <p className="mt-3 break-keep text-sm font-semibold leading-6 text-slate-400">
              AIVA 관리자 전용 화면입니다.
            </p>
          </div>

          <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2">
              <span className="text-xs font-black tracking-[0.08em] text-cyan-100/80">아이디</span>
              <span className="relative block">
                <input
                  ref={usernameInputRef}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  className="h-14 w-full rounded-md border border-white/10 bg-[#070a12] px-4 pr-12 text-base font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
                  placeholder="아이디"
                />
                {username ? (
                  <button
                    type="button"
                    onClick={clearUsername}
                    className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
                    aria-label="아이디 지우기"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-black tracking-[0.08em] text-cyan-100/80">비밀번호</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className="h-14 rounded-md border border-white/10 bg-[#070a12] px-4 text-base font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
                placeholder="비밀번호"
              />
            </label>

            <label className="flex items-center gap-3 text-sm font-bold text-slate-300">
              <input
                type="checkbox"
                checked={rememberUsername}
                onChange={(event) => setRememberUsername(event.target.checked)}
                className="h-5 w-5 accent-cyan-200"
              />
              아이디 저장
            </label>

            {message ? (
              <p className="rounded-md border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={state === 'submitting'}
              className="mt-2 h-14 rounded-md bg-cyan-100 text-base font-black text-[#071018] transition hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-900"
            >
              {state === 'submitting' ? '로그인 중' : '로그인'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
