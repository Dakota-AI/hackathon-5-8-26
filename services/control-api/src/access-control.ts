import type { AuthenticatedUser } from "./ports.js";

const ADMIN_GROUP = "agents-cloud-admin";
const USER_GROUP = "agents-cloud-user";
const SUSPENDED_GROUP = "agents-cloud-suspended";
const COGNITO_GROUP_CLAIM = "cognito:groups";

export function parseAuthenticatedUser(claims: Readonly<Record<string, unknown>>): AuthenticatedUser {
  const userId = typeof claims.sub === "string" ? claims.sub.trim() : "";
  if (!userId) {
    throw new Error("Authenticated request is missing Cognito subject claim.");
  }

  const email = typeof claims.email === "string" ? claims.email.trim() : undefined;
  const groups = parseGroups(claims[COGNITO_GROUP_CLAIM] ?? claims["groups"]);
  return {
    userId,
    email,
    groups,
    isSuspended: groups.includes(SUSPENDED_GROUP)
  };
}

export function isAdminUser(user: AuthenticatedUser, adminEmails: readonly string[]): boolean {
  if (isSuspendedUser(user)) {
    return false;
  }
  if (hasGroup(user, ADMIN_GROUP)) {
    return true;
  }
  if (!user.email) {
    return false;
  }
  const normalizedUserEmail = user.email.toLowerCase();
  return adminEmails.map((email) => email.trim().toLowerCase()).includes(normalizedUserEmail);
}

export function hasProductAccessGroup(user: AuthenticatedUser): boolean {
  if (isSuspendedUser(user)) {
    return false;
  }
  return hasGroup(user, USER_GROUP) || hasGroup(user, ADMIN_GROUP);
}

export function parseGroups(value: unknown): readonly string[] {
  return uniqueNormalizedStrings(valuesFromRawClaim(value))
    .sort((left, right) => left.localeCompare(right))
    .filter(Boolean);
}

function hasGroup(user: AuthenticatedUser, targetGroup: string): boolean {
  return (user.groups ?? []).some((group) => group === targetGroup);
}

function isSuspendedUser(user: AuthenticatedUser): boolean {
  return user.isSuspended === true || hasGroup(user, SUSPENDED_GROUP);
}

function valuesFromRawClaim(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    return normalizedStringList(trimmed);
  }
  return [];
}

function normalizedStringList(raw: string): string[] {
  if (isJsonArray(raw)) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => (typeof item === "string" ? item.trim() : ""));
      }
    } catch {
      // API Gateway may stringify Cognito array claims as [group-a, group-b]
      // rather than strict JSON. Fall through to delimiter parsing.
    }
  }
  return raw
    .replace(/^\[|\]$/g, "")
    .split(/[\s,]+/)
    .map((group) => group.trim().replace(/^['\"]|['\"]$/g, ""));
}

function isJsonArray(raw: string): boolean {
  return raw.startsWith("[") && raw.endsWith("]");
}

function uniqueNormalizedStrings(values: string[]): string[] {
  const normalized = new Set<string>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    normalized.add(value.trim().toLowerCase());
  }
  return [...normalized];
}
