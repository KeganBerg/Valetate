import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CarPhoto, CarRequest, Incident, LotMap, PlateHistory, MapItem, ParkedCar, PhotoSide } from '../types';
import { MapConflict, type CarDetails, type DataSource, type Role } from './source';
import type { RequestVisit } from '../report';
import { lookupKey } from '../guests';
import { plateKey } from '../plates';
import type { VehicleProfile } from '../types';

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
  updated_at: string;
  updated_by: string | null;
  version: number;
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
  key_slot?: string;
  keys_with?: string | null;
  keys_with_name?: string;
  keys_out_at?: string | null;
  blocks?: string[];
}

const toMap = (r: MapRow): LotMap => ({
  id: r.id,
  name: r.name,
  width: r.width,
  height: r.height,
  surface: r.surface,
  items: Array.isArray(r.items) ? r.items : [],
  updatedAt: Date.parse(r.updated_at),
  version: r.version,
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
  keySlot: r.key_slot ?? '',
  keysWith: r.keys_with ?? '',
  keysWithName: r.keys_with_name ?? '',
  keysOutAt: r.keys_out_at ? Date.parse(r.keys_out_at) : null,
  blocks: r.blocks ?? [],
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
  due_at?: string | null;
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
  dueAt: r.due_at ? Date.parse(r.due_at) : null,
});

interface PhotoRow {
  id: string;
  car_id: string;
  side: PhotoSide;
  path: string;
  damage: boolean;
  note: string;
  taken_at: string;
  taken_by_name: string;
}

const BUCKET = 'car-photos';

interface VehicleLookup {
  profile: {
    plate: string;
    owner_name: string;
    owner_phone: string;
    color: string;
    make: string;
    vehicle: string;
    guest_type: VehicleProfile['type'];
    unit: string;
    paid_until: string | null;
    prefs: string;
  } | null;
  past_visits: number;
  last_visit: string | null;
  damage_visits: number;
  incidents: number;
  last_incident: string | null;
}

interface IncidentRow {
  id: string;
  kind: Incident['kind'];
  status: Incident['status'];
  car_id: string | null;
  car_label: string;
  details: string;
  guest_name: string;
  guest_phone: string;
  photos: string[];
  reported_by: string | null;
  reported_by_name: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by_name: string;
  resolution: string;
}
const toIncident = (r: IncidentRow): Incident => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  carId: r.car_id,
  carLabel: r.car_label,
  details: r.details,
  guestName: r.guest_name,
  guestPhone: r.guest_phone,
  photos: r.photos ?? [],
  reportedBy: r.reported_by ?? '',
  reportedByName: r.reported_by_name,
  createdAt: Date.parse(r.created_at),
  resolvedAt: r.resolved_at ? Date.parse(r.resolved_at) : null,
  resolvedByName: r.resolved_by_name,
  resolution: r.resolution,
});

const toPhoto = (r: PhotoRow, url: string): CarPhoto => ({
  id: r.id,
  carId: r.car_id,
  side: r.side,
  url,
  damage: r.damage,
  note: r.note,
  takenAt: Date.parse(r.taken_at),
  takenByName: r.taken_by_name,
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
  keySlot: 'key_slot',
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

// ---------- shared maps and cars ----------

export function cloudSource(companyId: string, userId: string, userName: string): DataSource {
  let noVersions = false;
  return {
    kind: 'cloud',
    me: { id: userId, name: userName },
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
            key_slot: c.keySlot ?? '',
            blocks: c.blocks ?? [],
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
    async setKeys(id, out) {
      check(
        await db()
          .from('parked_cars')
          .update(
            out
              ? { keys_with: userId, keys_with_name: userName, keys_out_at: new Date().toISOString() }
              : { keys_with: null, keys_with_name: '', keys_out_at: null },
          )
          .eq('id', id),
      );
    },
    async setBlocks(id, blocks) {
      check(await db().from('parked_cars').update({ blocks }).eq('id', id));
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
          due_at: r.dueAt ? new Date(r.dueAt).toISOString() : null,
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
    async getEvent() {
      const rows = check(
        await db().from('lot_events').select('*').eq('company_id', companyId).is('ended_at', null).order('created_at', { ascending: false }).limit(1),
      ) as { id: string; name: string; let_out_at: string; created_at: string }[];
      const e = rows[0];
      return e ? { id: e.id, name: e.name, letOutAt: Date.parse(e.let_out_at), createdAt: Date.parse(e.created_at) } : null;
    },
    async startEvent(e) {
      check(
        await db()
          .from('lot_events')
          .insert({ id: e.id, company_id: companyId, name: e.name, let_out_at: new Date(e.letOutAt).toISOString(), created_by: userId }),
      );
    },
    async updateEvent(id, patch) {
      check(await db().from('lot_events').update({ name: patch.name, let_out_at: new Date(patch.letOutAt).toISOString() }).eq('id', id));
    },
    async endEvent(id) {
      check(await db().from('lot_events').update({ ended_at: new Date().toISOString() }).eq('id', id));
    },
    async carsOutSince(since) {
      const n = check(await db().rpc('cars_out_since', { company: companyId, since: new Date(since).toISOString() }));
      return typeof n === 'number' ? n : 0;
    },
    async listShifts(since) {
      const rows = check(
        await db()
          .from('shifts')
          .select('*')
          .eq('company_id', companyId)
          .or(`ended_at.is.null,ended_at.gte.${new Date(since).toISOString()}`)
          .order('started_at'),
      ) as { id: string; user_id: string; user_name: string; started_at: string; ended_at: string | null; handoff_note: string }[];
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        startedAt: Date.parse(r.started_at),
        endedAt: r.ended_at ? Date.parse(r.ended_at) : null,
        handoffNote: r.handoff_note,
      }));
    },
    async clockIn(s) {
      const res = await db()
        .from('shifts')
        .insert({ id: s.id, company_id: companyId, user_id: userId, user_name: userName, started_at: new Date(s.startedAt).toISOString() });
      if (res.error?.code === '23505') throw new Error("You're already clocked in");
      check(res);
    },
    async clockOut(id, handoffNote) {
      check(await db().from('shifts').update({ ended_at: new Date().toISOString(), handoff_note: handoffNote }).eq('id', id).is('ended_at', null));
    },
    async listTips(since) {
      const rows = check(
        await db()
          .from('tips')
          .select('*')
          .eq('company_id', companyId)
          .is('voided_at', null)
          .gte('created_at', new Date(since).toISOString())
          .order('created_at'),
      ) as { id: string; amount_cents: number; method: 'cash' | 'digital'; car_id: string | null; logged_by: string; logged_by_name: string; created_at: string }[];
      return rows.map((r) => ({
        id: r.id,
        amountCents: r.amount_cents,
        method: r.method,
        carId: r.car_id,
        loggedBy: r.logged_by,
        loggedByName: r.logged_by_name,
        createdAt: Date.parse(r.created_at),
      }));
    },
    async addTip(t) {
      check(
        await db()
          .from('tips')
          .insert({
            id: t.id,
            company_id: companyId,
            amount_cents: t.amountCents,
            method: t.method,
            car_id: t.carId,
            logged_by: userId,
            logged_by_name: userName,
            created_at: new Date(t.createdAt).toISOString(),
          }),
      );
    },
    async voidTip(id) {
      check(await db().from('tips').update({ voided_at: new Date().toISOString() }).eq('id', id));
    },
    async getTipUrl() {
      const rows = check(await db().from('companies').select('tip_url').eq('id', companyId)) as { tip_url: string }[];
      return rows[0]?.tip_url ?? '';
    },
    async setTipUrl(url) {
      check(await db().from('companies').update({ tip_url: url }).eq('id', companyId));
    },
    async lookupPlate(plate) {
      if (!lookupKey(plate)) return null;
      const r = check(await db().rpc('vehicle_lookup', { company: companyId, plate })) as VehicleLookup | null;
      if (!r) return null;
      const v = r.profile;
      return {
        profile: v
          ? {
              plate: v.plate,
              ownerName: v.owner_name,
              ownerPhone: v.owner_phone,
              color: v.color,
              make: v.make,
              vehicle: v.vehicle,
              type: v.guest_type,
              unit: v.unit,
              paidUntil: v.paid_until ?? '',
              prefs: v.prefs,
            }
          : null,
        pastVisits: r.past_visits,
        lastVisit: r.last_visit ? Date.parse(r.last_visit) : null,
        damageVisits: r.damage_visits,
        incidents: r.incidents,
        lastIncident: r.last_incident ?? '',
      } satisfies PlateHistory;
    },
    async saveVehicle(p) {
      const key = plateKey(p.plate);
      if (key.length < 2) return;
      check(
        await db()
          .from('vehicles')
          .upsert({
            company_id: companyId,
            plate_key: key,
            plate: p.plate.toUpperCase().slice(0, 20),
            owner_name: p.ownerName,
            owner_phone: p.ownerPhone,
            color: p.color,
            make: p.make,
            vehicle: p.vehicle,
            guest_type: p.type,
            unit: p.unit,
            paid_until: p.paidUntil || null,
            prefs: p.prefs,
            updated_at: new Date().toISOString(),
          }),
      );
    },
    async listIncidents() {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const rows = check(
        await db()
          .from('incidents')
          .select('*')
          .eq('company_id', companyId)
          .or(`status.eq.open,created_at.gte.${since},resolved_at.gte.${since}`)
          .order('created_at', { ascending: false })
          .limit(500),
      ) as IncidentRow[];
      return rows.map(toIncident);
    },
    async reportIncident(inc, photos) {
      const paths: string[] = [];
      for (const ph of photos) {
        const path = `${companyId}/incidents/${inc.id}/${ph.id}.jpg`;
        const up = await db().storage.from(BUCKET).upload(path, ph.blob, { contentType: 'image/jpeg', upsert: false });
        if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(up.error.message);
        paths.push(path);
      }
      const ins = await db().from('incidents').insert({
        id: inc.id,
        company_id: companyId,
        kind: inc.kind,
        car_id: inc.carId,
        car_label: inc.carLabel,
        details: inc.details,
        guest_name: inc.guestName,
        guest_phone: inc.guestPhone,
        photos: paths,
        reported_by: userId,
        reported_by_name: userName,
        created_at: new Date(inc.createdAt).toISOString(),
      });
      // a retry after a dropped response finds it already filed
      if (ins.error && ins.error.code !== '23505') throw new Error(ins.error.message);
    },
    async resolveIncident(id, resolution, reopen) {
      check(
        await db()
          .from('incidents')
          .update(
            reopen
              ? { status: 'open', resolved_at: null, resolved_by: null, resolved_by_name: '', resolution }
              : { status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: userId, resolved_by_name: userName, resolution },
          )
          .eq('id', id),
      );
    },
    async incidentPhotos(inc) {
      if (!inc.photos.length) return [];
      const signed = check(await db().storage.from(BUCKET).createSignedUrls(inc.photos, 3600)) as { signedUrl: string }[];
      return signed.map((s) => s.signedUrl).filter(Boolean);
    },
    async reportData(since) {
      const iso = new Date(since).toISOString();
      // a busy month is more rows than one request returns, so page through
      const all = async <T,>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => {
        const out: T[] = [];
        for (let i = 0; ; i += 1000) {
          const page = check(await q(i, i + 999)) as T[];
          out.push(...page);
          if (page.length < 1000 || out.length >= 50000) return out;
        }
      };
      type CarRow = { id: string; map_id: string; parked_at: string; retrieved_at: string | null; parked_by: string | null; retrieved_by: string | null };
      type ReqRow = Pick<RequestRow, 'id' | 'car_id' | 'created_at' | 'claimed_at' | 'ready_at' | 'claimed_by' | 'claimed_by_name' | 'source' | 'due_at'> & {
        status: RequestVisit['status'];
        closed_at: string | null;
      };
      const ms = (t: string | null) => (t ? Date.parse(t) : null);
      const [cars, reqs, tips, shifts, people] = await Promise.all([
        all<CarRow>((a, b) =>
          db()
            .from('parked_cars')
            .select('id, map_id, parked_at, retrieved_at, parked_by, retrieved_by')
            .eq('company_id', companyId)
            .or(`parked_at.gte.${iso},retrieved_at.gte.${iso}`)
            .order('parked_at')
            .range(a, b),
        ),
        all<ReqRow>((a, b) =>
          db()
            .from('requests')
            .select('id, car_id, created_at, claimed_at, ready_at, closed_at, claimed_by, claimed_by_name, status, source, due_at')
            .eq('company_id', companyId)
            .gte('created_at', iso)
            .order('created_at')
            .range(a, b),
        ),
        this.listTips(since),
        this.listShifts(since),
        team.members(companyId).catch(() => [] as Member[]),
      ]);
      return {
        cars: cars.map((c) => ({
          id: c.id,
          mapId: c.map_id,
          parkedAt: Date.parse(c.parked_at),
          retrievedAt: ms(c.retrieved_at),
          parkedBy: c.parked_by ?? '',
          retrievedBy: c.retrieved_by ?? '',
        })),
        requests: reqs.map((r) => ({
          id: r.id,
          carId: r.car_id,
          createdAt: Date.parse(r.created_at),
          claimedAt: ms(r.claimed_at),
          readyAt: ms(r.ready_at),
          closedAt: ms(r.closed_at),
          claimedBy: r.claimed_by ?? '',
          claimedByName: r.claimed_by_name ?? '',
          status: r.status,
          source: r.source,
          dueAt: ms(r.due_at ?? null),
        })),
        tips,
        shifts,
        people: Object.fromEntries(people.map((m) => [m.user_id, m.display_name || m.email.split('@')[0]])),
      };
    },
    async unretrieveCar(car) {
      check(
        await db()
          .from('parked_cars')
          .update({ status: 'parked', retrieved_at: null, retrieved_by: null })
          .eq('id', car.id),
      );
    },
    async listPhotos(carId) {
      const rows = check(await db().from('car_photos').select('*').eq('car_id', carId).order('taken_at')) as PhotoRow[];
      if (!rows.length) return [];
      // the bucket is private: show pictures through short-lived signed links
      const signed = check(await db().storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), 3600)) as {
        path: string | null;
        signedUrl: string;
      }[];
      const byPath = new Map(signed.map((x) => [x.path, x.signedUrl]));
      return rows.map((r) => toPhoto(r, byPath.get(r.path) ?? ''));
    },
    async addPhoto({ id, car, side, blob, takenAt }) {
      const path = `${companyId}/${car.id}/${id}.jpg`;
      const up = await db().storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      // a retry after a dropped response finds the file already there: that's fine
      if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(up.error.message);
      const row = {
        id,
        company_id: companyId,
        car_id: car.id,
        side,
        path,
        taken_at: new Date(takenAt).toISOString(),
        taken_by: userId,
        taken_by_name: userName,
      };
      const ins = await db().from('car_photos').insert(row);
      if (ins.error && ins.error.code !== '23505') throw new Error(ins.error.message);
      return toPhoto({ ...row, damage: false, note: '' }, URL.createObjectURL(blob));
    },
    async setPhotoDamage(id, damage) {
      check(await db().from('car_photos').update({ damage }).eq('id', id));
    },
    subscribe(on) {
      const ch = db()
        .channel(`company-${companyId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'parked_cars', filter: `company_id=eq.${companyId}` }, on.cars)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lot_maps', filter: `company_id=eq.${companyId}` }, on.maps)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `company_id=eq.${companyId}` }, () => on.requests?.())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lot_events', filter: `company_id=eq.${companyId}` }, () => on.event?.())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `company_id=eq.${companyId}` }, () => on.team?.())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tips', filter: `company_id=eq.${companyId}` }, () => on.team?.())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents', filter: `company_id=eq.${companyId}` }, () => on.incidents?.())
        .subscribe((status) => {
          // changes made while disconnected are not replayed, so reload after every (re)join
          if (status === 'SUBSCRIBED') {
            on.live?.(true);
            on.cars();
            on.maps();
            on.requests?.();
            on.event?.();
            on.team?.();
            on.incidents?.();
          } else on.live?.(false);
        });
      return () => {
        db().removeChannel(ch);
      };
    },
  };
}
