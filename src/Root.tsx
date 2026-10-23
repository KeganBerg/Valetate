import type { AuthError, Session } from '@supabase/supabase-js';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import App from './App';
import { alreadyRegistered, authMessage } from './authMessages';
import { useBackToClose } from './dialog';
import { localSource } from './data/local';
import { isNetworkError, withOutbox } from './data/outbox';
import { loadLot } from './lotCache';
import { friendlyError } from './ops';
import { canEditMaps, type DataSource, type Role } from './data/source';
import {
  cloudSource,
  createCompany,
  displayName,
  joinWithCode,
  myMemberships,
  supabase,
  team,
  type Membership,
} from './data/supabase';
import type { LotMap, ParkedCar } from './types';
import { Loading } from './components/Loading';

// opened now and then: loaded the first time they're needed
const TeamDialog = lazy(() => import('./components/TeamDialog').then((m) => ({ default: m.TeamDialog })));

const COMPANY_KEY = 'valetate.company.v1';
const JOIN_KEY = 'valetate.joinCode';

// an invite link (?join=CODE) is remembered until the person has signed in, then used once
function pendingJoinCode(): string | null {
  try {
    const url = new URL(location.href);
    const code = url.searchParams.get('join');
    if (code) {
      localStorage.setItem(JOIN_KEY, code);
      url.searchParams.delete('join');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    return localStorage.getItem(JOIN_KEY);
  } catch {
    return null;
  }
}
function clearJoinCode() {
  try {
    localStorage.removeItem(JOIN_KEY);
  } catch {
    // nothing remembered
  }
}

function Splash({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="screen">
      <div className="screen-card center">
        <span className="logo big">V</span>
        <span className="spinner" aria-hidden="true" />
        <p className="muted" role="status">{text}</p>
      </div>
    </div>
  );
}

/** Loads a company's maps and cars, then shows the app. */
function Workspace({
  source,
  role,
  account,
  cacheKey,
}: {
  source: DataSource;
  role: Role;
  account?: React.ComponentProps<typeof App>['account'];
  cacheKey?: string;
}) {
  const [data, setData] = useState<{ maps: LotMap[]; cars: ParkedCar[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    // no signal (or barely any): open with the lot as this phone last saw it;
    // the app catches up by itself once it reconnects
    const saved = cacheKey ? loadLot(cacheKey) : null;
    let shown = false;
    const show = (d: { maps: LotMap[]; cars: ParkedCar[] }) => {
      if (shown) return;
      shown = true;
      setData(d);
    };
    const fallback = window.setTimeout(() => saved && show(saved), navigator.onLine ? 4000 : 0);
    Promise.all([source.listMaps(), source.listCars()])
      .then(([maps, cars]) => show({ maps, cars }))
      .catch((e) => {
        if (saved && isNetworkError(e)) show(saved);
        else if (!shown) setError(friendlyError(e));
      })
      .finally(() => window.clearTimeout(fallback));
  }, [source, cacheKey]);
  useEffect(load, [load]);

  // valets wait for a map; pick up the first one as soon as it's published
  const waiting = !!data && !data.maps.length && !canEditMaps(role);
  useEffect(() => {
    if (!waiting) return;
    return source.subscribe({ maps: load, cars: () => {} });
  }, [waiting, source, load]);

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
  return <App source={source} role={role} account={account} initialMaps={data.maps} initialCars={data.cars} cacheKey={cacheKey} />;
}

type AuthMode = 'in' | 'up' | 'forgot';
const backHere = () => location.origin + location.pathname;

function Login({ invited }: { invited: boolean }) {
  const [mode, setMode] = useState<AuthMode>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  // an account already exists for the email typed into "Create account"
  const [exists, setExists] = useState(false);

  const go = (m: AuthMode) => {
    setMode(m);
    setMsg(null);
    setExists(false);
  };
  // back from "Create account" or "Reset password" returns to Sign in
  useBackToClose(mode !== 'in', () => go('in'));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setExists(false);
    const auth = supabase!.auth;
    try {
      if (mode === 'forgot') {
        const { error } = await auth.resetPasswordForEmail(email, { redirectTo: backHere() });
        if (error) throw error;
        setMsg({ kind: 'info', text: `Sent. Open the link in the email to ${email} on this phone to pick a new password.` });
      } else if (mode === 'in') {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await auth.signUp({
          email,
          password,
          options: { data: { name: name.trim() }, emailRedirectTo: backHere() },
        });
        if (error && !alreadyRegistered(null, error)) throw error;
        if (alreadyRegistered(data.user, error)) {
          // try the password they just typed: it may be the right one
          const retry = await auth.signInWithPassword({ email, password });
          if (!retry.error) return;
          setMode('in');
          setExists(true);
        } else if (!data.session) {
          setMsg({ kind: 'info', text: `Check ${email} for a link to confirm your account.` });
        }
      }
    } catch (err) {
      setMsg({ kind: 'error', text: authMessage(err as AuthError) });
    } finally {
      setBusy(false);
    }
  };

  const magicLink = async () => {
    if (!email) return setMsg({ kind: 'error', text: 'Enter your email first.' });
    setBusy(true);
    const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: backHere(), shouldCreateUser: false } });
    setBusy(false);
    setMsg(
      error
        ? { kind: 'error', text: /signups not allowed|not found/i.test(error.message) ? `No account for ${email} yet. Create one below.` : authMessage(error) }
        : { kind: 'info', text: `Sign-in link sent to ${email}. Open it on this phone.` },
    );
  };

  const title = mode === 'in' ? 'Sign in to Valetate' : mode === 'up' ? 'Create your account' : 'Reset your password';
  return (
    <div className="screen">
      <form className="screen-card" onSubmit={submit}>
        <span className="logo big">V</span>
        <h1>{title}</h1>
        {mode === 'forgot' ? (
          <p className="muted">We'll email you a link to pick a new password.</p>
        ) : invited ? (
          <p className="info">You've been invited to a team. Sign in, or create an account if you're new, to join.</p>
        ) : (
          <p className="muted">The live lot for your whole valet team.</p>
        )}
        {exists && (
          <p className="info">
            There's already an account for {email}. Sign in with its password, or tap Forgot password to set a new one.
          </p>
        )}
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
        {mode !== 'forgot' && (
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
        )}
        {mode === 'in' && (
          <button type="button" className="link forgot" onClick={() => go('forgot')}>
            Forgot password?
          </button>
        )}
        {msg && <p className={msg.kind === 'error' ? 'error' : 'info'}>{msg.text}</p>}
        <button className="primary wide" disabled={busy}>
          {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Email me a reset link'}
        </button>
        {mode === 'in' && (
          <button type="button" className="link" onClick={magicLink} disabled={busy}>
            Email me a sign-in link instead
          </button>
        )}
        <p className="muted small">
          {mode === 'up' ? 'Already have an account?' : mode === 'in' ? 'New here?' : 'Remembered it?'}{' '}
          <button type="button" className="link" onClick={() => go(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </form>
    </div>
  );
}

/** Opened from a reset email: the link signed them in, now they pick a password. */
function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(authMessage(error));
    onDone();
  };
  return (
    <div className="screen">
      <form className="screen-card" onSubmit={submit}>
        <span className="logo big">V</span>
        <h1>Pick a new password</h1>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary wide" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
        <button type="button" className="link" onClick={onDone}>
          Skip for now
        </button>
      </form>
    </div>
  );
}

function Onboarding({
  session,
  onDone,
  joinError,
}: {
  session: Session;
  onDone: (companyId?: string) => void;
  joinError: string | null;
}) {
  const [company, setCompany] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(joinError);
  const [path, setPath] = useState<'choose' | 'join' | 'start'>(joinError ? 'join' : 'choose');
  useBackToClose(path !== 'choose', () => setPath('choose'));
  const first = displayName(session.user).split(/[\s@]/)[0];

  return (
    <div className="screen">
      <div className="screen-card">
        <span className="logo big">V</span>
        <h1>Welcome, {first}</h1>
        {path === 'choose' && (
          <>
            <p className="muted">How are you using Valetate?</p>
            <div className="choice-tiles">
              <button className="choice-tile" onClick={() => setPath('join')}>
                <span className="choice-icon" aria-hidden="true">🔑</span>
                <b>Join my team</b>
                <span className="muted small">I have an invite link or code from my admin.</span>
              </button>
              <button className="choice-tile" onClick={() => setPath('start')}>
                <span className="choice-icon" aria-hidden="true">🅿️</span>
                <b>Start a company</b>
                <span className="muted small">Set up your lot and invite your valets.</span>
              </button>
            </div>
          </>
        )}
        {path === 'join' && (
          <form
            className="rise"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setCodeError(null);
              try {
                onDone(await joinWithCode(code, displayName(session.user)));
              } catch (err) {
                setCodeError(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Join my team</h2>
            <p className="muted small">Open the invite link your admin sent you, or type its code here.</p>
            <label className="field">
              <span>Invite code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="A1B2-C3D4-E5F6"
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus
                required
              />
            </label>
            {codeError && <p className="error">{codeError}</p>}
            <button className="primary wide" disabled={busy}>
              {busy ? 'Joining…' : 'Join team'}
            </button>
          </form>
        )}
        {path === 'start' && (
          <form
            className="rise"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                onDone(await createCompany(company, displayName(session.user)));
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Start a company</h2>
            <p className="muted small">You'll be its admin. Next you'll pick a map for your lot and invite your team.</p>
            <label className="field">
              <span>Company name</span>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Broward Key Group" autoFocus required />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary wide" disabled={busy}>
              {busy ? 'Creating…' : 'Create company'}
            </button>
          </form>
        )}
        {path !== 'choose' ? (
          <button className="link" onClick={() => setPath('choose')}>
            Back
          </button>
        ) : (
          <button className="link" onClick={() => supabase!.auth.signOut()}>
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

function CompanyPicker({ list, onPick, onCancel }: { list: Membership[]; onPick: (m: Membership) => void; onCancel?: () => void }) {
  useBackToClose(true, onCancel);
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
        {onCancel && (
          <button className="link" onClick={onCancel}>
            Cancel
          </button>
        )}
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
  const [joinCode] = useState(pendingJoinCode);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [teamSize, setTeamSize] = useState<number | undefined>(undefined);

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase!.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const refresh = useCallback(async () => {
    if (!session) return;
    setMemberships(null);
    const code = localStorage.getItem(JOIN_KEY);
    if (code) {
      clearJoinCode();
      try {
        const joined = await joinWithCode(code, displayName(session.user));
        localStorage.setItem(COMPANY_KEY, joined);
        setCompanyId(joined);
      } catch (e) {
        setJoinError(e instanceof Error ? e.message : String(e));
      }
    }
    // remembered so the app still opens to the right company with no signal
    const key = `valetate.teams.${session.user.id}`;
    let saved: Membership[] | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    } catch {
      // nothing usable saved
    }
    const fallback = window.setTimeout(() => saved?.length && setMemberships((m) => m ?? saved), navigator.onLine ? 4000 : 0);
    try {
      const list = await myMemberships(session.user.id);
      localStorage.setItem(key, JSON.stringify(list));
      setMemberships(list);
    } catch (e) {
      setMemberships((m) => m ?? (isNetworkError(e) && saved ? saved : []));
    } finally {
      window.clearTimeout(fallback);
    }
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCompany = (id?: string) => {
    if (id) {
      localStorage.setItem(COMPANY_KEY, id);
      setCompanyId(id);
    }
    refresh();
  };
  useEffect(() => {
    refresh();
  }, [refresh]);

  const current = memberships?.find((m) => m.company.id === companyId) ?? (memberships?.length === 1 ? memberships[0] : null);
  const source = useMemo(
    () =>
      current && userId
        ? withOutbox(cloudSource(current.company.id, userId, displayName(session!.user)), `valetate.outbox.${current.company.id}.${userId}`)
        : null,
    [current?.company.id, userId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // how many people are on the team, for the admin's setup steps
  const adminOf = current?.role === 'admin' ? current.company.id : null;
  useEffect(() => {
    if (!adminOf || showTeam) return;
    team.members(adminOf).then((m) => setTeamSize(m.length), () => {});
  }, [adminOf, showTeam]);

  if (session === undefined) return <Splash />;
  if (!session) return <Login invited={!!joinCode} />;
  if (recovering) return <NewPassword onDone={() => setRecovering(false)} />;
  if (!memberships) return <Splash text="Finding your team…" />;
  if (!memberships.length) return <Onboarding session={session} onDone={openCompany} joinError={joinError} />;
  if (!current || picking)
    return (
      <CompanyPicker
        list={memberships}
        onPick={(m) => {
          localStorage.setItem(COMPANY_KEY, m.company.id);
          setCompanyId(m.company.id);
          setPicking(false);
        }}
        onCancel={current ? () => setPicking(false) : undefined}
      />
    );

  const account = {
    teamSize: current.role === 'admin' ? teamSize : undefined,
    name: displayName(session.user),
    email: session.user.email ?? '',
    companyName: current.company.name,
    onSignOut: () => supabase!.auth.signOut(),
    onTeam: current.role === 'admin' ? () => setShowTeam(true) : undefined,
    onSwitchCompany: memberships.length > 1 ? () => setPicking(true) : undefined,
  };
  return (
    <>
      <Workspace
        key={current.company.id + current.role}
        source={source!}
        role={current.role}
        account={account}
        cacheKey={`valetate.lot.${current.company.id}.${userId}`}
      />
      {showTeam && (
        <Suspense fallback={<Loading />}>
          <TeamDialog
            companyId={current.company.id}
            companyName={current.company.name}
            me={session.user.id}
            onClose={() => setShowTeam(false)}
            onRolesChanged={refresh}
          />
        </Suspense>
      )}
    </>
  );
}

export default function Root() {
  if (!supabase) return <Workspace source={localSource} role="admin" />;
  return <Cloud />;
}
