import { useCallback, useEffect, useState } from 'react';
import { ROLE_INFO, type Role } from '../data/source';
import { formatCode, inviteLink, team, type Invite, type Member } from '../data/supabase';
import { QrSvg } from './GuestLink';

const ROLES: Role[] = ['admin', 'manager', 'valet'];

/** Text, share, copy or scan one invite link. */
function InviteShare({ invite, companyName }: { invite: Pick<Invite, 'code' | 'role' | 'label'>; companyName: string }) {
  const [copied, setCopied] = useState(false);
  const url = inviteLink(invite.code);
  const text = `Join ${companyName} on Valetate as ${ROLE_INFO[invite.role].name.toLowerCase()}: ${url}`;
  return (
    <div className="invite-share">
      <QrSvg text={url} />
      <p className="hint">
        Text this link{invite.label ? ` to ${invite.label}` : ''}, or let them scan the code. It works once and expires in 14 days.
        Code: <b className="code">{formatCode(invite.code)}</b>
      </p>
      <div className="actions">
        <a className="button primary" href={`sms:${/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(text)}`}>
          Text it
        </a>
        {'share' in navigator && <button onClick={() => navigator.share({ text }).catch(() => {})}>Share…</button>}
        <button
          onClick={() =>
            navigator.clipboard.writeText(url).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

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
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<Pick<Invite, 'code' | 'role' | 'label'> | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
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
            act(async () => {
              const code = await team.invite(companyId, role, label, me);
              setCreated({ code, role, label: label.trim() });
              setLabel('');
            });
          }}
        >
          <input placeholder="Who's it for? (optional)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Who the invite is for" />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].name}
              </option>
            ))}
          </select>
          <button className="primary">Create invite link</button>
        </form>
        {created && <InviteShare invite={created} companyName={companyName} />}
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
                <li key={i.id} className="invite-row">
                  <div className="who">
                    <b>{i.label || 'Invite link'}</b>
                    <small>
                      {formatCode(i.code)} · expires {new Date(i.expires_at).toLocaleDateString()}
                    </small>
                  </div>
                  <span className={`role role-${i.role}`}>{ROLE_INFO[i.role].name}</span>
                  <button onClick={() => setShowing(showing === i.id ? null : i.id)}>{showing === i.id ? 'Hide' : 'Show'}</button>
                  <button onClick={() => act(() => team.revokeInvite(i.id))}>Cancel</button>
                  {showing === i.id && <InviteShare invite={i} companyName={companyName} />}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
