// This module keeps its original name and export surface (`db`, `auth`,
// `storage`, `secondaryAuth`, `handleFirestoreError`, `OperationType`) so
// every component that already does `import { db, auth } from '../lib/firebase'`
// continues to work unchanged. Internally it now points at our MongoDB +
// JWT-backed shim clients instead of the Firebase SDK.
import { db } from './firestoreClient';
import { auth, secondaryAuth } from './authClient';
import { storage } from './storageClient';

export { db, auth, secondaryAuth, storage };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
