import { Wordmark } from '@/components/brand'
import { Button, Card } from '@/components/ui'
import { useAuth } from '@/lib/auth'

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-paper px-4"><Card className="w-full max-w-lg space-y-4 p-6"><Wordmark dark={false} />{children}</Card></div>
}

export function SetupRequired() {
  return (
    <Shell>
      <h1 className="font-serif text-xl text-navy-900">Supabase is not configured yet</h1>
      <p className="text-sm text-slate-600">The app needs a Supabase project to store data. Create <code className="rounded bg-slate-100 px-1">.env.local</code> with:</p>
      <pre className="overflow-x-auto rounded bg-navy-900 p-3 text-xs text-gold-100">VITE_SUPABASE_URL=https://xxxx.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=your-anon-public-key</pre>
      <p className="text-sm text-slate-600">Then run the SQL files in <code className="rounded bg-slate-100 px-1">supabase/migrations</code> and restart the app. See README for step-by-step setup.</p>
      <a href="/" className="inline-block text-sm text-gold-700 hover:underline">← Back to home</a>
    </Shell>
  )
}

export function PendingApproval() {
  const { profile, signOut, refreshProfile } = useAuth()
  return (
    <Shell>
      <h1 className="font-serif text-xl text-navy-900">Waiting for approval</h1>
      <p className="text-sm text-slate-600">Your account (<b>{profile?.email}</b>) was created. An Admin must activate it and assign you properties in <b>Settings → Users</b> before you can see any data.</p>
      <div className="flex gap-2"><Button onClick={refreshProfile}>Check again</Button><Button variant="outline" onClick={signOut}>Sign out</Button></div>
    </Shell>
  )
}
