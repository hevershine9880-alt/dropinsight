import { redirect } from "next/navigation";
import { getAuth, type AuthContext } from "./session";
import { can, type Permission } from "./permissions";

/**
 * Route guards. Every authenticated page and every mutation goes through one of
 * these; nothing relies on the UI having hidden a button.
 */

export class AuthorizationError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Your role cannot ${permission}.`);
    this.name = "AuthorizationError";
  }
}

/** For pages. Redirects rather than throwing. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/sign-in");
  return auth;
}

export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!can(auth.workspace.role, permission)) redirect("/no-access");
  return auth;
}

/** For server actions and route handlers. Throws so the caller can shape the error. */
export async function requireAuthOrThrow(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new AuthorizationError("dashboard.view");
  return auth;
}

export async function requirePermissionOrThrow(permission: Permission): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth || !can(auth.workspace.role, permission)) throw new AuthorizationError(permission);
  return auth;
}
