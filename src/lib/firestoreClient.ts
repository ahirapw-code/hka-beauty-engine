// A minimal, Firestore-API-compatible client backed by our Express + MongoDB
// REST API (server/routes/dataRoutes.ts). This exists so that components
// written against the Firestore v9 modular SDK (`collection`, `doc`,
// `getDoc`, `getDocs`, `setDoc`, `updateDoc`, `deleteDoc`, `onSnapshot`,
// `query`, `where`, `orderBy`, `writeBatch`) keep working unchanged after
// removing the `firebase` package.
import { getAuthToken, notifyUnauthorized } from "./authClient";

export interface DbHandle {
  __isDb: true;
}

export const db: DbHandle = { __isDb: true };

export interface CollectionRef {
  type: "collection";
  path: string;
}

export interface DocRef {
  type: "doc";
  path: string;
  id: string;
}

export interface WhereConstraint {
  type: "where";
  field: string;
  op: "==" | "!=" | "<" | "<=" | ">" | ">=";
  value: any;
}

export interface OrderByConstraint {
  type: "orderBy";
  field: string;
  direction: "asc" | "desc";
}

export type QueryConstraint = WhereConstraint | OrderByConstraint;

export interface QueryRef {
  type: "query";
  collectionPath: string;
  constraints: QueryConstraint[];
}

type Ref = CollectionRef | QueryRef;

export function collection(_db: DbHandle, path: string): CollectionRef {
  return { type: "collection", path };
}

export function doc(_db: DbHandle, path: string, id?: string): DocRef {
  return { type: "doc", path, id: id as string };
}

export function where(field: string, op: WhereConstraint["op"], value: any): WhereConstraint {
  return { type: "where", field, op, value };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc"): OrderByConstraint {
  return { type: "orderBy", field, direction };
}

export function query(collectionRef: CollectionRef, ...constraints: QueryConstraint[]): QueryRef {
  return { type: "query", collectionPath: collectionRef.path, constraints };
}

async function authFetch(url: string, init: RequestInit = {}) {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    // A 401 here means the stored token itself is dead (expired / invalid) -
    // not that this one request failed for its own reasons. Every other
    // request in the app goes through this same authFetch, so left alone
    // the person would just keep hitting the same wall on the next click
    // (e.g. Branch Settings' "Simpan Perubahan") with no indication why.
    if (res.status === 401) {
      notifyUnauthorized();
    }
    throw new Error(errData.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

function buildQueryUrl(ref: Ref): string {
  const path = ref.type === "collection" ? ref.path : ref.collectionPath;
  const params = new URLSearchParams();
  if (ref.type === "query") {
    for (const c of ref.constraints) {
      if (c.type === "where") {
        params.append("where", `${c.field},${c.op},${c.value}`);
      } else if (c.type === "orderBy") {
        params.append("orderBy", `${c.field},${c.direction}`);
      }
    }
  }
  const qs = params.toString();
  return `/api/data/${path}${qs ? `?${qs}` : ""}`;
}

// --- DocumentSnapshot-like helpers ---

export interface DocSnapshot {
  id: string;
  exists: () => boolean;
  data: () => any;
}

export interface QuerySnapshot {
  empty: boolean;
  docs: DocSnapshot[];
  forEach: (cb: (doc: DocSnapshot) => void) => void;
}

function makeDocSnapshot(id: string, exists: boolean, data: any): DocSnapshot {
  return {
    id,
    exists: () => exists,
    data: () => data,
  };
}

function makeQuerySnapshot(docs: DocSnapshot[]): QuerySnapshot {
  return {
    empty: docs.length === 0,
    docs,
    forEach: (cb) => docs.forEach(cb),
  };
}

// --- Reads ---

export async function getDoc(ref: DocRef): Promise<DocSnapshot> {
  const result = await authFetch(`/api/data/${ref.path}/${ref.id}`);
  return makeDocSnapshot(ref.id, result.exists, result.data);
}

export async function getDocs(ref: Ref): Promise<QuerySnapshot> {
  const result = await authFetch(buildQueryUrl(ref));
  const docs: DocSnapshot[] = (result.docs || []).map((d: any) => makeDocSnapshot(d.id, true, d));
  return makeQuerySnapshot(docs);
}

// --- Writes ---

export async function setDoc(
  ref: DocRef,
  data: any,
  options?: { merge?: boolean }
): Promise<void> {
  const merge = options?.merge ? "?merge=true" : "";
  await authFetch(`/api/data/${ref.path}/${ref.id}${merge}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function updateDoc(ref: DocRef, data: any): Promise<void> {
  await authFetch(`/api/data/${ref.path}/${ref.id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteDoc(ref: DocRef): Promise<void> {
  await authFetch(`/api/data/${ref.path}/${ref.id}`, { method: "DELETE" });
}

// --- writeBatch (used only for initial seeding) ---

interface BatchOp {
  type: "set" | "update" | "delete";
  ref: DocRef;
  data?: any;
}

export function writeBatch(_db: DbHandle) {
  const ops: BatchOp[] = [];
  return {
    set(ref: DocRef, data: any) {
      ops.push({ type: "set", ref, data });
    },
    update(ref: DocRef, data: any) {
      ops.push({ type: "update", ref, data });
    },
    delete(ref: DocRef) {
      ops.push({ type: "delete", ref });
    },
    async commit() {
      // Group by collection path so we can use the efficient _batch endpoint
      // for sets (the common case during seeding); fall back to sequential
      // requests for anything else.
      const byCollection = new Map<string, { id: string; data: any }[]>();
      const other: BatchOp[] = [];

      for (const op of ops) {
        if (op.type === "set") {
          const list = byCollection.get(op.ref.path) || [];
          list.push({ id: op.ref.id, data: op.data });
          byCollection.set(op.ref.path, list);
        } else {
          other.push(op);
        }
      }

      for (const [path, docs] of byCollection.entries()) {
        await authFetch(`/api/data/${path}/_batch`, {
          method: "POST",
          body: JSON.stringify({ docs }),
        });
      }

      for (const op of other) {
        if (op.type === "update") await updateDoc(op.ref, op.data);
        if (op.type === "delete") await deleteDoc(op.ref);
      }
    },
  };
}

// --- onSnapshot (polling-based realtime approximation) ---
//
// MongoDB via a plain REST API has no native realtime push like Firestore.
// We approximate `onSnapshot` by polling the same endpoint on an interval
// and only invoking the callback with fresh data, which keeps consuming
// components (they just get a callback + unsubscribe function) unchanged.

const SNAPSHOT_POLL_INTERVAL_MS = 4000;

export function onSnapshot(
  ref: Ref | DocRef,
  onNext: (snapshot: any) => void,
  onError?: (error: any) => void
): () => void {
  let cancelled = false;

  const tick = async () => {
    if (cancelled) return;
    try {
      if ((ref as DocRef).type === "doc") {
        const snap = await getDoc(ref as DocRef);
        if (!cancelled) onNext(snap);
      } else {
        const snap = await getDocs(ref as Ref);
        if (!cancelled) onNext(snap);
      }
    } catch (err) {
      if (!cancelled && onError) onError(err);
    }
  };

  tick();
  const interval = setInterval(tick, SNAPSHOT_POLL_INTERVAL_MS);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}
