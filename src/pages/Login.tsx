import { useState } from 'react'
import { toast } from 'sonner'
import { supabase, friendlyError } from '@/lib/supabase'
import { Button, Field, Input } from '@/components/ui'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Wordmark } from '@/components/brand'

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error('Enter a valid email address')
    if (mode !== 'reset' && password.length < 8) return toast.error('Password must be at least 8 characters')
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
        if (error) throw error
        if (!data.session) toast.success('Check your email to confirm your account, then sign in.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        toast.success('Password reset email sent.')
        setMode('signin')
      }
    } catch (err) { toast.error(friendlyError(err)) } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="hidden flex-col justify-between bg-navy-900 p-10 lg:flex">
        <Link to="/" aria-label="AM Infra home"><Wordmark /></Link>
        <div>
          <p className="font-serif text-4xl leading-tight text-white">Your properties.<br /><span className="text-gold-400">One platform.</span></p>
          <p className="mt-4 max-w-md text-sm text-slate-400">Properties, tenants, agreements, rent collection, receipts, maintenance and documents, managed in one secure workspace.</p>
        </div>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} AM Infra · Private business system</p>
      </div>
      <div className="flex items-center justify-center bg-paper px-4 py-10">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-900"><ArrowLeft className="h-4 w-4" />Back to home</Link>
          <div className="lg:hidden"><Wordmark dark={false} /></div>
          <div>
            <h1 className="font-serif text-2xl text-navy-900">{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}</h1>
            <p className="mt-1 text-sm text-slate-500">{mode === 'signup' ? 'The first account becomes the Admin. Later accounts need Admin approval.' : 'AM Infra PropertyOS'}</p>
          </div>
          {mode === 'signup' && <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
          {mode !== 'reset' && <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required /></Field>}
          <Button type="submit" className="w-full" size="lg" loading={busy}>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</Button>
          <div className="flex justify-between text-sm">
            {mode === 'signin' ? <>
              <button type="button" className="text-gold-700 hover:underline" onClick={() => setMode('signup')}>Create an account</button>
              <button type="button" className="text-slate-500 hover:underline" onClick={() => setMode('reset')}>Forgot password?</button>
            </> : <button type="button" className="text-gold-700 hover:underline" onClick={() => setMode('signin')}>Back to sign in</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
