import * as jose from "jose";
import type { AuthenticatedUser, Env } from "./types.js";

let jwksCache: jose.JWTVerifyGetKey | undefined;
let jwksCacheCreatedAt = 0;
const JWKS_CACHE_TTL_MS = 15 * 60 * 1000;

export function extractBearerToken(request: Request): string | null {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) {
    return queryToken;
  }

  const authorization = request.headers.get("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return null;
}

export function requireRelaySecret(request: Request, expectedSecret: string): boolean {
  const provided = request.headers.get("x-agents-cloud-relay-secret");
  return expectedSecret.length > 0 && provided === expectedSecret;
}

export async function validateCognitoJWT(token: string, env: Env): Promise<AuthenticatedUser> {
  const now = Date.now();
  if (!jwksCache || now - jwksCacheCreatedAt > JWKS_CACHE_TTL_MS) {
    jwksCache = jose.createRemoteJWKSet(new URL(env.COGNITO_JWKS_URL));
    jwksCacheCreatedAt = now;
  }

  const { payload } = await jose.jwtVerify(token, jwksCache, {
    issuer: env.COGNITO_ISS,
    audience: env.COGNITO_AUD
  });

  if (!payload.sub) {
    throw new Error("Token missing required sub claim");
  }

  return {
    userId: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    exp: payload.exp
  };
}
