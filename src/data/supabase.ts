import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AreaKind, LotMap, MapBackdrop, MapItem, Site } from '../types';
import { MapConflict, type DataSource, type Role } from './source';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

function db() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export interface Company {
  id: string;
  name: string;
}

export interface Membership {
  company: Company;
  role: Role;
}

export interface Member {
  user_id: string;
  role: Role;
  display_name: string;
  email: string;
}

export interface Invite {
  id: string;
  /** who the link is for, as the admin typed it */
  label: string;
  role: Role;
  code: string;
  created_at: string;
  expires_at: string;
}

/** The link an admin texts to a new teammate. */
export const inviteLink = (code: string) => `${location.origin}${location.pathname}?join=${code}`;

/** "A1B2C3D4E5F6" -> "A1B2-C3D4-E5F6", easier to read out loud */
export const formatCode = (code: string) => code.match(/.{1,4}/g)?.join('-') ?? code;

// ---------- rows <-> app types ----------

interface MapRow {
  id: string;
  company_id: string;
  name: string;
  width: number;
  height: number;
  surface: string;
  items: MapItem[];
  backdrop?: MapBackdrop | null;
  site_id?: string | null;
  area_kind?: AreaKind | null;
  position?: number | null;
  updated_at: string;
  updated_by: string | null;
  version: number;
}

const toMap = (r: MapRow): LotMap => ({
  id: r.id,
  name: r.name,
  width: r.width,
  height: r.height,
  surface: r.surface,
  items: Array.isArray(r.items) ? r.items : [],
  ...(r.backdrop && { backdrop: r.backdrop }),
  ...(r.site_id && { siteId: r.site_id }),
  ...(r.area_kind && { areaKind: r.area_kind }),
  position: r.position ?? 0,
  updatedAt: Date.parse(r.updated_at),
  version: r.version,
});

interface SiteRow {
  id: string;
  name: string;
  address: string;
  updated_at: string;
}

const toSite = (r: SiteRow): Site => ({
  id: r.id,
  name: r.name,
  ...(r.address && { address: r.address }),
  updatedAt: Date.parse(r.updated_at),
});

// ---------- account ----------

export function displayName(user: { email?: string; user_metadata?: Record<string, unknown> } | null): string {
  const n = user?.user_metadata?.name;
  return typeof n === 'string' && n.trim() ? n.trim() : (user?.email ?? '').split('@')[0];
}

export async function myMemberships(userId: string): Promise<Membership[]> {
  const rows = check(
    await db().from('members').select('role, companies(id, name)').eq('user_id', userId),
  ) as unknown as { role: Role; companies: Company | null }[];
  return rows.filter((r) => r.companies).map((r) => ({ role: r.role, company: r.companies! }));
}

/** Join the company behind an invite link or code; returns its id. */
export async function joinWithCode(code: string, name: string): Promise<string> {
  return check(await db().rpc('join_with_code', { invite_code: code, my_name: name })) as string;
}

export async function createCompany(companyName: string, myName: string): Promise<string> {
  return check(await db().rpc('create_company', { company_name: companyName, my_name: myName })) as string;
}

// ---------- team (admins) ----------

export const team = {
  async members(companyId: string): Promise<Member[]> {
    return check(
      await db().from('members').select('user_id, role, display_name, email').eq('company_id', companyId).order('created_at'),
    ) as Member[];
  },
  async invites(companyId: string): Promise<Invite[]> {
    return check(
      await db()
        .from('invites')
        .select('id, label, role, code, created_at, expires_at')
        .eq('company_id', companyId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at'),
    ) as Invite[];
  },
  /** a new one-time invite link; returns its code */
  async invite(companyId: string, role: Role, label: string, by: string): Promise<string> {
    const row = check(
      await db()
        .from('invites')
        .insert({ company_id: companyId, role, label: label.trim(), invited_by: by })
        .select('code')
        .single(),
    ) as { code: string };
    return row.code;
  },
  async revokeInvite(id: string) {
    check(await db().from('invites').delete().eq('id', id));
  },
  async setRole(companyId: string, userId: string, role: Role) {
    check(await db().from('members').update({ role }).eq('company_id', companyId).eq('user_id', userId));
  },
  async remove(companyId: string, userId: string) {
    check(await db().from('members').delete().eq('company_id', companyId).eq('user_id', userId));
  },
};

// ---------- shared maps ----------

export function cloudSource(companyId: string, userId: string): DataSource {
  let noVersions = false;
  // before the sites migration: areas save without their site fields
  let noSites = false;
  const siteFields = (m: LotMap) =>
    noSites ? {} : { site_id: m.siteId ?? null, area_kind: m.areaKind ?? 'lot', position: m.position ?? 0 };
  return {
    kind: 'cloud',
    async listSites() {
      const res = await db().from('sites').select('id, name, address, updated_at').eq('company_id', companyId).order('created_at');
      if (res.error && /sites/.test(res.error.message) && /does not exist|could not find/i.test(res.error.message)) {
        noSites = true;
        return [];
      }
      return (check(res) as SiteRow[]).map(toSite);
    },
    async saveSite(s) {
      check(
        await db()
          .from('sites')
          .upsert({
            id: s.id,
            company_id: companyId,
            name: s.name,
            address: s.address ?? '',
            updated_at: new Date(s.updatedAt).toISOString(),
            updated_by: userId,
          }),
      );
    },
    async deleteSite(id) {
      check(await db().from('sites').delete().eq('id', id));
    },
    async listMaps() {
      const rows = check(
        await db().from('lot_maps').select('*').eq('company_id', companyId).order('updated_at', { ascending: false }),
      ) as MapRow[];
      return rows.map(toMap);
    },
    async saveMap(m, baseVersion) {
      const row = {
        name: m.name,
        width: Math.round(m.width),
        height: Math.round(m.height),
        surface: m.surface,
        items: m.items,
        backdrop: m.backdrop ?? null,
        ...siteFields(m),
        updated_at: new Date(m.updatedAt).toISOString(),
        updated_by: userId,
      };
      const plain = async () => {
        check(await db().from('lot_maps').upsert({ id: m.id, company_id: companyId, ...row }));
        return undefined;
      };
      // before the map_versions migration: save the old way
      if (noVersions) return plain();
      const missing = (e: { message: string } | null) => !!e && /version/.test(e.message) && /does not exist|could not find/i.test(e.message);
      if (baseVersion === undefined) {
        const { data, error } = await db()
          .from('lot_maps')
          .insert({ id: m.id, company_id: companyId, ...row })
          .select('version')
          .maybeSingle();
        if (!error) return (data as { version: number } | null)?.version;
        if (missing(error)) {
          noVersions = true;
          return plain();
        }
        // already there: an earlier try got through, or another device made it
        if (!/lot_maps_pkey/.test(error.message)) check({ data, error });
      } else {
        // the server bumps the version; no row back means someone else saved first
        const res = await db().from('lot_maps').update(row).eq('id', m.id).eq('version', baseVersion).select('version');
        if (missing(res.error)) {
          noVersions = true;
          return plain();
        }
        const saved = check(res) as { version: number }[];
        if (saved.length) return saved[0].version;
      }
      const theirs = check(await db().from('lot_maps').select('*').eq('id', m.id).maybeSingle()) as MapRow | null;
      // our own save whose reply was lost
      if (theirs && theirs.updated_by === userId && Date.parse(theirs.updated_at) === m.updatedAt) return theirs.version;
      throw new MapConflict(theirs && toMap(theirs));
    },
    async deleteMap(id) {
      check(await db().from('lot_maps').delete().eq('id', id));
    },
    subscribe(on) {
      const ch = db()
        .channel(`company-${companyId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lot_maps', filter: `company_id=eq.${companyId}` }, on.maps)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sites', filter: `company_id=eq.${companyId}` }, on.maps)
        .subscribe((status) => {
          // changes made while disconnected are not replayed, so reload after every (re)join
          if (status === 'SUBSCRIBED') {
            on.live?.(true);
            on.maps();
          } else on.live?.(false);
        });
      return () => {
        db().removeChannel(ch);
      };
    },
  };
}
