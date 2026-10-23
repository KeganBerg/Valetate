import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CarRequest, LotMap, MapItem, ParkedCar } from '../types';
import type { CarDetails, DataSource, Role } from './source';

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
  email: string;
  role: Role;
  created_at: string;
}

// ---------- rows <-> app types ----------

interface MapRow {
  id: string;
  company_id: string;
  name: string;
  width: number;
  height: number;
  surface: string;
  items: MapItem[];
  updated_at: string;
}

interface CarRow {
  id: string;
  company_id: string;
  map_id: string;
  spot_key: string;
  spot_label: string;
  plate: string;
  color: string;
  make: string;
  vehicle: string;
  owner_name: string;
  owner_phone: string;
  ticket: string;
  notes: string;
  parked_at: string;
  guest_token?: string;
}

const toMap = (r: MapRow): LotMap => ({
  id: r.id,
  name: r.name,
  width: r.width,
  height: r.height,
  surface: r.surface,
  items: Array.isArray(r.items) ? r.items : [],
  updatedAt: Date.parse(r.updated_at),
});

const toCar = (r: CarRow): ParkedCar => ({
  id: r.id,
  mapId: r.map_id,
  spotKey: r.spot_key,
  spotLabel: r.spot_label,
  plate: r.plate,
  color: r.color ?? '',
  make: r.make ?? '',
  vehicle: r.vehicle,
  ownerName: r.owner_name,
  ownerPhone: r.owner_phone,
  ticket: r.ticket,
  notes: r.notes,
  guestToken: r.guest_token,
  parkedAt: Date.parse(r.parked_at),
});

interface RequestRow {
  id: string;
  map_id: string;
  car_id: string;
  status: 'open' | 'claimed' | 'ready';
  source: 'staff' | 'guest' | 'sms';
  note: string;
  created_at: string;
  created_by_name: string;
  claimed_by: string | null;
  claimed_by_name: string;
  claimed_at: string | null;
  ready_at: string | null;
}

const toRequest = (r: RequestRow): CarRequest => ({
  id: r.id,
  carId: r.car_id,
  mapId: r.map_id,
  status: r.status,
  source: r.source ?? 'staff',
  note: r.note,
  createdAt: Date.parse(r.created_at),
  createdByName: r.created_by_name,
  claimedBy: r.claimed_by ?? '',
  claimedByName: r.claimed_by_name,
  claimedAt: r.claimed_at ? Date.parse(r.claimed_at) : null,
  readyAt: r.ready_at ? Date.parse(r.ready_at) : null,
});

const DETAIL_COLUMNS: Record<keyof CarDetails, string> = {
  plate: 'plate',
  color: 'color',
  make: 'make',
  vehicle: 'vehicle',
  ownerName: 'owner_name',
  ownerPhone: 'owner_phone',
  ticket: 'ticket',
  notes: 'notes',
};

function carDetailsRow(patch: CarDetails) {
  const row: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    const col = DETAIL_COLUMNS[k as keyof CarDetails];
    if (col && typeof v === 'string') row[col] = v;
  }
  return row;
}

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

export async function acceptInvites(name: string): Promise<number> {
  return check(await db().rpc('accept_invites', { my_name: name })) as number;
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
        .select('id, email, role, created_at')
        .eq('company_id', companyId)
        .is('accepted_at', null)
        .order('created_at'),
    ) as Invite[];
  },
  async invite(companyId: string, email: string, role: Role, by: string) {
    check(
      await db()
        .from('invites')
        .upsert(
          { company_id: companyId, email: email.trim().toLowerCase(), role, invited_by: by, accepted_at: null },
          { onConflict: 'company_id,email' },
        ),
    );
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

// ---------- shared maps and cars ----------

export function cloudSource(companyId: string, userId: string, userName: string): DataSource {
  return {
    kind: 'cloud',
    me: { id: userId, name: userName },
    async listMaps() {
      const rows = check(
        await db().from('lot_maps').select('*').eq('company_id', companyId).order('updated_at', { ascending: false }),
      ) as MapRow[];
      return rows.map(toMap);
    },
    async saveMap(m) {
      check(
        await db()
          .from('lot_maps')
          .upsert({
            id: m.id,
            company_id: companyId,
            name: m.name,
            width: Math.round(m.width),
            height: Math.round(m.height),
            surface: m.surface,
            items: m.items,
            updated_at: new Date(m.updatedAt).toISOString(),
            updated_by: userId,
          }),
      );
    },
    async deleteMap(id) {
      check(await db().from('lot_maps').delete().eq('id', id));
    },
    async listCars() {
      const rows = check(
        await db().from('parked_cars').select('*').eq('company_id', companyId).eq('status', 'parked'),
      ) as CarRow[];
      return rows.map(toCar);
    },
    async parkCar(c) {
      check(
        await db()
          .from('parked_cars')
          .insert({
            id: c.id,
            company_id: companyId,
            map_id: c.mapId,
            spot_key: c.spotKey,
            spot_label: c.spotLabel,
            plate: c.plate,
            color: c.color,
            make: c.make,
            vehicle: c.vehicle,
            owner_name: c.ownerName,
            owner_phone: c.ownerPhone,
            ticket: c.ticket,
            notes: c.notes,
            ...(c.guestToken ? { guest_token: c.guestToken } : {}),
            parked_at: new Date(c.parkedAt).toISOString(),
            parked_by: userId,
          }),
      );
    },
    async moveCar(id, spotKey, spotLabel) {
      check(await db().from('parked_cars').update({ spot_key: spotKey, spot_label: spotLabel }).eq('id', id));
    },
    async updateCar(id, patch) {
      check(await db().from('parked_cars').update(carDetailsRow(patch)).eq('id', id));
    },
    async retrieveCar(id) {
      check(
        await db()
          .from('parked_cars')
          .update({ status: 'retrieved', retrieved_at: new Date().toISOString(), retrieved_by: userId })
          .eq('id', id),
      );
    },
    async listRequests() {
      const rows = check(
        await db().from('requests').select('*').eq('company_id', companyId).in('status', ['open', 'claimed', 'ready']).order('created_at'),
      ) as RequestRow[];
      return rows.map(toRequest);
    },
    async createRequest(r) {
      const res = await db()
        .from('requests')
        .insert({
          id: r.id,
          company_id: companyId,
          map_id: r.mapId,
          car_id: r.carId,
          note: r.note,
          created_at: new Date(r.createdAt).toISOString(),
          created_by: userId,
          created_by_name: userName,
        });
      if (res.error?.code === '23505') throw new Error('That car is already requested');
      check(res);
    },
    async claimRequest(id) {
      // only an open request can be claimed, so two valets can't both take it
      const rows = check(
        await db()
          .from('requests')
          .update({ status: 'claimed', claimed_by: userId, claimed_by_name: userName, claimed_at: new Date().toISOString() })
          .eq('id', id)
          .eq('status', 'open')
          .select('id'),
      ) as { id: string }[];
      if (!rows.length) throw new Error('Someone else already has it');
    },
    async unclaimRequest(id) {
      check(
        await db()
          .from('requests')
          .update({ status: 'open', claimed_by: null, claimed_by_name: '', claimed_at: null })
          .eq('id', id)
          .eq('status', 'claimed'),
      );
    },
    async markReady(id) {
      check(await db().from('requests').update({ status: 'ready', ready_at: new Date().toISOString() }).eq('id', id));
    },
    async cancelRequest(id) {
      check(await db().from('requests').update({ status: 'cancelled', closed_at: new Date().toISOString() }).eq('id', id));
    },
    async unretrieveCar(car) {
      check(
        await db()
          .from('parked_cars')
          .update({ status: 'parked', retrieved_at: null, retrieved_by: null })
          .eq('id', car.id),
      );
    },
    subscribe(on) {
      const ch = db()
        .channel(`company-${companyId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'parked_cars', filter: `company_id=eq.${companyId}` }, on.cars)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lot_maps', filter: `company_id=eq.${companyId}` }, on.maps)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `company_id=eq.${companyId}` }, () => on.requests?.())
        .subscribe((status) => {
          // changes made while disconnected are not replayed, so reload after every (re)join
          if (status === 'SUBSCRIBED') {
            on.live?.(true);
            on.cars();
            on.maps();
            on.requests?.();
          } else on.live?.(false);
        });
      return () => {
        db().removeChannel(ch);
      };
    },
  };
}
