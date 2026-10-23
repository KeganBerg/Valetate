import { useCallback, useEffect, useState } from 'react';
import { ROLE_INFO, type Role } from '../data/source';
import { team, type Invite, type Member } from '../data/supabase';

const ROLES: Role[] = ['admin', 'manager', 'valet'];

interface Props {
  companyId: string;
  companyName: string;
  me: string;
  onClose: () => void;
  /** my own role changed, so permissions need reloading */
  onRolesChanged: () => void;
}

export function TeamDialog({ companyId, companyName, me, onClose, onRolesChanged }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('valet');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([team.members(companyId), team.invites(companyId)]);
      setMembers(m);
      setInvites(i);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [companyId]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice(ok);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog team" role="dialog" aria-label="Team">
        <header>
          <h2>{companyName} team</h2>
          <div className="grow" />
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <form
          className="invite"
          onSubmit={(e) => {
            e.preventDefault();
            const em = email.trim().toLowerCase();
            act(async () => {
              await team.invite(companyId, em, role, me);
              setEmail('');
            }, `Invited ${em}. They join as soon as they sign in with that email.`);
          }}
        >
          <input type="email" placeholder="Invite by email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].name}
              </option>
            ))}
          </select>
          <button className="primary">Invite</button>
        </form>
        {notice && <p className="info">{notice}</p>}
        {error && <p className="error">{error}</p>}

        <div className="role-legend">
          {ROLES.map((r) => (
            <div key={r}>
              <span className={`role role-${r}`}>{ROLE_INFO[r].name}</span> {ROLE_INFO[r].can}
            </div>
          ))}
        </div>

        <h3>Members</h3>
        {!members && <p className="muted">Loading…</p>}
        <ul className="people">
          {members?.map((m) => (
            <li key={m.user_id}>
              <div className="who">
                <b>
                  {m.display_name || m.email.split('@')[0]}
                  {m.user_id === me && <span className="muted"> (you)</span>}
                </b>
                <small>{m.email}</small>
              </div>
              <select
                value={m.role}
                aria-label={`Role for ${m.email}`}
                onChange={(e) =>
                  act(async () => {
                    await team.setRole(companyId, m.user_id, e.target.value as Role);
                    if (m.user_id === me) onRolesChanged();
                  })
                }
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_INFO[r].name}
                  </option>
                ))}
              </select>
              {m.user_id !== me && (
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm(`Remove ${m.email} from ${companyName}?`)) act(() => team.remove(companyId, m.user_id));
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        {invites.length > 0 && (
          <>
            <h3>Waiting to join</h3>
            <ul className="people">
              {invites.map((i) => (
                <li key={i.id}>
                  <div className="who">
                    <b>{i.email}</b>
                    <small>Invited {new Date(i.created_at).toLocaleDateString()}</small>
                  </div>
                  <span className={`role role-${i.role}`}>{ROLE_INFO[i.role].name}</span>
                  <button onClick={() => act(() => team.revokeInvite(i.id))}>Cancel</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
