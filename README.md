# HKA Beauty Engine

Full-stack salon/spa management system (POS, bookings, payroll, attendance,
inventory, ERP). Originally scaffolded on Google AI Studio with a Firebase
(Firestore + Firebase Auth + Firebase Storage) backend; **the backend has
since been fully migrated to MongoDB Atlas with Mongoose, Express, and JWT
authentication.** Firebase has been removed completely.

## What changed in the migration

- **Datastore:** Firestore → MongoDB Atlas via Mongoose. All collections
  (`customers`, `therapists`, `products`, `services`, `transactions`,
  `attendance`, `users`, `bookings`, `expenses`, `payroll`, `settings`) now
  have explicit Mongoose schemas under `server/models/`. Document IDs are
  preserved as MongoDB's `_id` (string), so existing IDs like `TX-1234` or
  Firebase UIDs continue to work unchanged.
- **Auth:** Firebase Auth → JWT (`jsonwebtoken` + `bcryptjs`), issued/verified
  by `server/controllers/authController.ts` and `server/middleware/auth.ts`.
- **Storage:** Firebase Storage → a small `uploads` collection storing base64
  blobs (`server/models/Upload.ts`), used for branch logos.
- **Endpoints:** The 4 original custom business endpoints keep their exact
  paths and request/response shapes: `POST /api/processCheckout`,
  `POST /api/clockInOut`, `POST /api/resetStaffPassword`,
  `POST /api/syncSheetsToFirestore`.
- **Frontend:** The React UI is **unchanged**. Components that used to import
  from `firebase/firestore`, `firebase/auth`, and `firebase/storage` now
  import from small drop-in shims (`src/lib/firestoreClient.ts`,
  `src/lib/authClient.ts`, `src/lib/storageClient.ts`) that expose the same
  function signatures (`collection`, `doc`, `getDoc`, `getDocs`, `setDoc`,
  `updateDoc`, `deleteDoc`, `onSnapshot`, `query`, `where`, `orderBy`,
  `writeBatch`, `signInWithEmailAndPassword`, etc.) but talk to the new
  Express/Mongoose REST API instead. Realtime `onSnapshot` listeners are
  approximated with polling (every ~4s).
- **Known, intentionally out-of-scope changes:** Google Sign-In for app login
  and "forgot password via email" relied on Firebase Auth's OAuth/email
  infrastructure and are not available post-migration (password resets are
  performed by an HKA_MANAGEMENT admin via the existing "Reset Password"
  action). The Google Sheets payroll sync feature still works, but now
  authenticates via Google Identity Services directly (`VITE_GOOGLE_CLIENT_ID`)
  instead of Firebase's Google provider wrapper.

## Project structure

```
server/
  config/       # Mongoose (MongoDB Atlas) + JWT configuration
  models/       # Mongoose schemas: Customer, Therapist, Product, Service,
                #   Transaction, Attendance, User, PayrollAuditLog, Booking,
                #   Expense, Payroll, Setting, Upload
  controllers/  # Business logic (checkout, attendance, auth, generic CRUD, ...)
  routes/       # Express routers
  middleware/   # JWT auth middleware
  app.ts        # Express app factory (shared by local dev + Vercel)
  index.ts      # Local/production entrypoint (Vite middleware / static serve)
api/
  index.ts      # Vercel serverless function entrypoint (imports server/app.ts)
src/            # Unchanged React UI, plus the firebase-compatible shims in src/lib/
```

## Critical fixes applied (post-audit)

A production audit flagged 6 CRITICAL issues. All are now fixed:

1. **Privilege escalation via generic `/api/data` API** — added
   `server/middleware/authorize.ts`, a per-collection/per-role permission
   table enforced on every read/write. Non-management roles can no longer
   write to `role`/`branch`/`passwordHash`, can't touch other users'
   payroll/attendance records, and `transactions`/`attendance` writes are
   blocked entirely on this route (they must go through `processCheckout`
   / `clockInOut`).
2. **Unvalidated checkout cart** — `processCheckout` now rejects
   non-positive/oversized quantities, out-of-range percent discounts, and
   invalid branch/payment-method/discount-type enums, and clamps flat
   discounts to each line's own subtotal.
3. **No idempotency on checkout** — `processCheckout` now requires a
   client-generated `idempotencyKey`; a repeat with the same key returns the
   original result instead of reprocessing. The POS UI also guards against
   double-submit (checkout button disables while a request is in flight).
4. **Weak/colliding transaction IDs** — replaced the 4-digit random ID with
   a `crypto.randomUUID()`-derived id; the server is now the sole source of
   truth for the transaction id (the frontend no longer generates its own,
   which also fixes the receipt showing an ID different from what was
   actually stored).
5. **Customer stats matched by free-text name** — checkout now prefers an
   explicit `customerId` (sent by the POS UI) over name matching, avoiding
   cross-attribution between different customers sharing a name.
6. **Insecure JWT secret fallback** — `server/config/jwt.ts` now throws at
   startup if `JWT_SECRET` is missing or under 16 characters, in every
   environment (previously it silently fell back to a hardcoded string in
   this repo).



**Prerequisites:** Node.js 18+, a MongoDB Atlas cluster (or any MongoDB
instance that supports replica-set transactions, which Atlas provides by
default).

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `MONGODB_URI` — your Atlas connection string
   - `JWT_SECRET` — a long random string (`openssl rand -hex 64`)
   - `VITE_GOOGLE_CLIENT_ID` — optional, only needed for Google Sheets sync
3. Run the app (Express + Vite dev middleware on one port):
   `npm run dev`
4. Open http://localhost:3000

On first login, the app seeds the database with demo data automatically
(mirrors the original Firestore "seed if empty" behavior).

## Deploy to Vercel

This repo is Vercel-ready:

- `vercel.json` builds the Vite frontend (`vite build` → `dist/`) and routes
  all `/api/*` requests to the serverless function in `api/index.ts`.
- Set `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, and (optionally)
  `VITE_GOOGLE_CLIENT_ID` as Environment Variables in your Vercel project
  settings.
- Push to a Git repo and import it in Vercel, or run `vercel` from this
  directory.

## Notes for maintainers

- `npm run lint` (`tsc --noEmit`) currently reports Mongoose 8 generic-overload
  type-resolution warnings in a few controllers (a known TypeScript/Mongoose
  typings interaction, not a logic bug). These don't affect runtime since the
  app is executed with `tsx`/`esbuild`, which transpile without type-checking.
  They're safe to ignore or can be silenced with more specific generic
  annotations if you want a fully clean `tsc` run.
- `processCheckout` uses a MongoDB multi-document transaction
  (`mongoose.startSession()` + `withTransaction`), which requires a replica
  set — Atlas clusters are replica sets by default, so no extra setup is
  needed there.
