import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import App from './App';
import { TeamDialog } from './components/TeamDialog';
import { localSource } from './data/local';
import { canEditMaps, type DataSource, type Role } from './data/source';
import {
  acceptInvites,
  cloudSource,
  createCompany,
  displayName,
  myMemberships,
  supabase,
  type Membership,
} from './data/supabase';
import type { LotMap, ParkedCar } from './types';

const COMPANY_KEY = 'valetate.company.v1';

function Splash({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="screen">
      <div className="screen-card center">
        <span className="logo big">V</span>
        <p className="muted">{text}</p>
      </div>
    </div>
  );
}

/** Loads a company's maps and cars, then shows the app. */
function Workspace({
  source,
  role,
  account,
}: {
  source: DataSource;
  role: Role;
  account?: React.ComponentProps<typeof App>['account'];
}) {
  const [data, setData] = useState<{ maps: LotMap[]; cars: ParkedCar[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([source.listMaps(), source.listCars()])
      .then(([maps, cars]) => setData({ maps, cars }))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [source]);
  useEffect(load, [load]);

  // valets wait for a map; pick up the first one as soon as it's published
  useEffect(() => {
    if (!data || data.maps.length || canEditMaps(role)) return;
    return source.subscribe({ maps: load, cars: () => {} });
  }, [data, role, source, load]);

  if (error)
    return (
      <div className="screen">
        <div className="screen-card">
          <h1>Couldn't load your lot</h1>
          <p className="muted">{error}</p>
          <button className="primary" onClick={load}>
            Try again
          </button>
        </div>
      </div>
    );
  if (!data) return <Splash />;
  if (!data.maps.length && !canEditMaps(role))
    return (
      <div className="screen">
        <div className="screen-card">
          <span className="logo big">V</span>
          <h1>No lot maps yet</h1>
          <p className="muted">
            An admin or manager at {account?.companyName ?? 'your company'} needs to build the first map. It will show up here
            automatically.
          </p>
          {account && <button onClick={account.onSignOut}>Sign out</button>}
        </div>
      </div>
    );
  return <App source={source} role={role} account={account} initialMaps={data.maps} initialCars={data.cars} />;
}

function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const auth = supabase!.auth;
    const res =
      mode === 'in'
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password, options: { data: { name: name.trim() }, emailRedirectTo: location.origin } });
    setBusy(false);
    if (res.error) return setMsg({ kind: 'error', text: res.error.message });
    if (mode === 'up' && !res.data.session) setMsg({ kind: 'info', text: `Check ${email} for a link to confirm your account.` });
  };

  const magicLink = async () => {
    if (!email) return setMsg({ kind: 'error', text: 'Enter your email first.' });
    setBusy(true);
    const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    setBusy(false);
    setMsg(error ? { kind: 'error', text: error.message } : { kind: 'info', text: `Sign-in link sent to ${email}.` });
  };

  return (
    <div className="screen">
      <form className="screen-card" onSubmit={submit}>
        <span className="logo big">V</span>
        <h1>{mode === 'in' ? 'Sign in to Valetate' : 'Create your account'}</h1>
        <p className="muted">The live lot for your whole valet team.</p>
        {mode === 'up' && (
          <label className="field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </label>
        {msg && <p className={msg.kind === 'error' ? 'error' : 'info'}>{msg.text}</p>}
        <button className="primary wide" disabled={busy}>
          {mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
        {mode === 'in' && (
          <button type="button" className="link" onClick={magicLink} disabled={busy}>
            Email me a sign-in link instead
          </button>
        )}
        <p className="muted small">
          {mode === 'in' ? 'New here?' : 'Already have an account?'}{' '}
          <button type="button" className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </form>
    </div>
  );
}

function Onboarding({ session, onDone }: { session: Session; onDone: () => void }) {
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = session.user.email ?? '';

  return (
    <div className="screen">
      <div className="screen-card">
        <span className="logo big">V</span>
        <h1>Welcome, {displayName(session.user)}</h1>
        <p className="muted">
          Joining a team? Ask your admin to invite <b>{email}</b>, then tap “Check again”.
        </p>
        <button onClick={onDone}>Check again</button>
        <hr />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await createCompany(company, displayName(session.user));
              onDone();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Or start your company</h2>
          <p className="muted small">You'll be its admin and can invite your valets and managers.</p>
          <label className="field">
            <span>Company name</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Broward Key Group" required />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary wide" disabled={busy}>
            Create company
          </button>
        </form>
        <button className="link" onClick={() => supabase!.auth.signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function CompanyPicker({ list, onPick }: { list: Membership[]; onPick: (m: Membership) => void }) {
  return (
    <div className="screen">
      <div className="screen-card">
        <h1>Choose a company</h1>
        <div className="pick-list">
          {list.map((m) => (
            <button key={m.company.id} onClick={() => onPick(m)}>
              <b>{m.company.name}</b>
              <span className={`role role-${m.role}`}>{m.role}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Cloud() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(() => localStorage.getItem(COMPANY_KEY));
  const [picking, setPicking] = useState(false);
  const [showTeam, setShowTeam] = useState(false);

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const refresh = useCallback(async () => {
    if (!session) return;
    setMemberships(null);
    await acceptInvites(displayName(session.user)).catch(() => 0);
    setMemberships(await myMemberships(session.user.id).catch(() => []));
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    refresh();
  }, [refresh]);

  const current = memberships?.find((m) => m.company.id === companyId) ?? (memberships?.length === 1 ? memberships[0] : null);
  const source = useMemo(
    () => (current && userId ? cloudSource(current.company.id, userId) : null),
    [current?.company.id, userId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (session === undefined) return <Splash />;
  if (!session) return <Login />;
  if (!memberships) return <Splash text="Finding your team…" />;
  if (!memberships.length) return <Onboarding session={session} onDone={refresh} />;
  if (!current || picking)
    return (
      <CompanyPicker
        list={memberships}
        onPick={(m) => {
          localStorage.setItem(COMPANY_KEY, m.company.id);
          setCompanyId(m.company.id);
          setPicking(false);
        }}
      />
    );

  const account = {
    name: displayName(session.user),
    email: session.user.email ?? '',
    companyName: current.company.name,
    onSignOut: () => supabase!.auth.signOut(),
    onTeam: current.role === 'admin' ? () => setShowTeam(true) : undefined,
    onSwitchCompany: memberships.length > 1 ? () => setPicking(true) : undefined,
  };
  return (
    <>
      <Workspace key={current.company.id + current.role} source={source!} role={current.role} account={account} />
      {showTeam && (
        <TeamDialog
          companyId={current.company.id}
          companyName={current.company.name}
          me={session.user.id}
          onClose={() => setShowTeam(false)}
          onRolesChanged={refresh}
        />
      )}
    </>
  );
}

export default function Root() {
  if (!supabase) return <Workspace source={localSource} role="admin" />;
  return <Cloud />;
}
