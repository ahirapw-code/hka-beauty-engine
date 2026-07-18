// A minimal, firebase/auth-API-compatible client backed by our JWT REST
// endpoints (server/routes/authRoutes.ts). This lets components written
// against the Firebase Auth SDK (`signInWithEmailAndPassword`,
// `createUserWithEmailAndPassword`, `onAuthStateChanged`, `updatePassword`,
// `sendPasswordResetEmail`, `signInWithPopup` + `GoogleAuthProvider`) keep
// working with only their import statements changed.

const TOKEN_STORAGE_KEY = "hka_auth_token";
// Set right before we force-clear a session because the server told us the
// token is invalid/expired (401). Login.tsx reads + clears this once on
// mount to show "your session expired, please sign in again" instead of
// silently landing back on a blank sign-in form with no explanation.
const SESSION_EXPIRED_KEY = "hka_session_expired";

export interface ShimUser {
  uid: string;
  email: string;
  displayName?: string;
  emailVerified?: boolean;
  isAnonymous?: boolean;
  tenantId?: string | null;
  providerData?: { providerId?: string; email?: string }[];
  getIdToken: () => Promise<string>;
}

type Listener = (user: ShimUser | null) => void;

class AuthClient {
  currentUser: ShimUser | null = null;
  private listeners: Set<Listener> = new Set();
  private persist: boolean;
  private memoryToken: string | null = null;

  constructor(options: { persist: boolean } = { persist: true }) {
    this.persist = options.persist;
    const token = this.getToken();
    if (token) {
      const parsed = decodeJwt(token);
      if (parsed) {
        this.currentUser = toShimUser(parsed.uid, parsed.email, token);
      }
    }
  }

  getToken(): string | null {
    if (!this.persist) return this.memoryToken;
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  setSession(token: string, uid: string, email: string) {
    if (this.persist) {
      try {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } catch {
        /* ignore storage errors */
      }
    } else {
      this.memoryToken = token;
    }
    this.currentUser = toShimUser(uid, email, token);
    this.notify();
  }

  async signOut() {
    if (this.persist) {
      try {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    } else {
      this.memoryToken = null;
    }
    this.currentUser = null;
    this.notify();
  }

  onAuthStateChanged(listener: Listener): () => void {
    this.listeners.add(listener);
    // Fire immediately with current state, mirroring Firebase's behavior.
    listener(this.currentUser);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l(this.currentUser));
  }
}

function toShimUser(uid: string, email: string, token: string): ShimUser {
  return {
    uid,
    email,
    displayName: "",
    emailVerified: true,
    isAnonymous: false,
    tenantId: null,
    providerData: [],
    getIdToken: async () => token,
  };
}

function decodeJwt(token: string): { uid: string; email: string } | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { uid: payload.uid, email: payload.email };
  } catch {
    return null;
  }
}

export const auth = new AuthClient({ persist: true });
// The original code used a "secondary" Firebase app/auth instance so that an
// HKA_MANAGEMENT admin could register a new staff account without being
// logged out themselves. We mirror that with a second, in-memory-only
// AuthClient: creating a user through it never touches the admin's own
// persisted session/token, so subsequent API calls (e.g. the follow-up
// setDoc writing the new user's profile) still run as the admin.
export const secondaryAuth = new AuthClient({ persist: false });

export function getAuthToken(): string | null {
  return auth.getToken();
}

/**
 * Call this whenever an authenticated request comes back 401 ("Unauthorized:
 * Invalid auth token."). A stored token can go bad for entirely normal
 * reasons (it expired, the server secret rotated, etc.) - previously that
 * just made whichever single request happened to hit it fail, while the
 * rest of the UI (still showing cached/previously-loaded data) looked
 * perfectly fine. That was especially confusing on mobile sessions left
 * open for a while: Branch Settings saves and background Google Sheets
 * sync would both silently fail with no clear next step.
 *
 * This clears the dead token, flags that the session expired so Login.tsx
 * can explain why the person is suddenly signed out, and forces a clean
 * re-login - which is the only way forward once the server has rejected
 * the token anyway.
 */
export function notifyUnauthorized() {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
  } catch {
    /* ignore storage errors */
  }
  auth.signOut();
}

/** Read-and-clear so the banner only ever shows once, right after it happens. */
export function consumeSessionExpiredFlag(): boolean {
  try {
    const flagged = sessionStorage.getItem(SESSION_EXPIRED_KEY) === "1";
    if (flagged) sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    return flagged;
  } catch {
    return false;
  }
}

async function apiFetch(path: string, body: any) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data.error || `Request failed with status ${res.status}`);
    throw err;
  }
  return data;
}

export interface UserCredential {
  user: ShimUser;
}

export async function signInWithEmailAndPassword(
  _auth: AuthClient,
  email: string,
  password: string
): Promise<UserCredential> {
  const data = await apiFetch("/api/auth/login", { email, password });
  auth.setSession(data.token, data.user.id, data.user.email);
  return { user: auth.currentUser as ShimUser };
}

export async function createUserWithEmailAndPassword(
  authInstance: AuthClient,
  email: string,
  password: string
): Promise<UserCredential> {
  const data = await apiFetch("/api/auth/register", { email, password });
  // Only the primary `auth` instance's session is updated. When called via
  // `secondaryAuth` (staff registration by an admin), the admin's own
  // session/token is left untouched, matching the original Firebase
  // secondary-app behavior.
  if (authInstance === auth) {
    auth.setSession(data.token, data.user.id, data.user.email);
  }
  const user = toShimUser(data.user.id, data.user.email, data.token);
  return { user };
}

export async function updatePassword(user: ShimUser, newPassword: string): Promise<void> {
  const token = await user.getIdToken();
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Gagal mengubah password.");
  }
}

export async function sendPasswordResetEmail(_auth: AuthClient, _email: string): Promise<void> {
  // Email-based password reset requires an email delivery provider, which is
  // out of scope for this migration. Staff passwords are reset by an
  // HKA_MANAGEMENT admin instead, via the existing "Reset Password" action
  // (POST /api/resetStaffPassword).
  throw new Error(
    "Reset password via email tidak tersedia. Silakan hubungi HKA_MANAGEMENT untuk mereset password Anda."
  );
}

export class GoogleAuthProvider {
  addScope(_scope: string) {}
  static credentialFromResult(_result: any) {
    return null;
  }
}

export async function signInWithPopup(
  _auth: AuthClient,
  _provider: GoogleAuthProvider
): Promise<UserCredential> {
  // Google Sign-In relied on Firebase Auth's OAuth popup flow. It has been
  // intentionally disabled as part of removing Firebase; use email/password
  // sign-in instead.
  throw new Error(
    "Google Sign-In tidak tersedia setelah migrasi dari Firebase Auth. Silakan gunakan email dan password."
  );
}

export function onAuthStateChanged(_auth: AuthClient, listener: Listener): () => void {
  return auth.onAuthStateChanged(listener);
}

export type { ShimUser as User };
