import type { Env, TunnelClaims } from "./types.js";

const encoder = new TextEncoder();

export function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}

export async function authorizeTunnelApi(request: Request, env: Env): Promise<string> {
  const token = extractBearerToken(request);
  if (!token) {
    throw new Error("Missing bearer token");
  }
  if (env.PREVIEW_API_TOKEN && safeEqual(token, env.PREVIEW_API_TOKEN)) {
    return "agents-cloud-runtime";
  }
  throw new Error("Invalid preview API token");
}

export async function signTunnelToken(claims: TunnelClaims, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(claims);
  const signature = await hmac(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(signature)}`;
}

export async function validateTunnelToken(token: string, secret: string): Promise<TunnelClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed tunnel token");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const expected = base64UrlEncode(await hmac(`${encodedHeader}.${encodedPayload}`, secret));
  if (!safeEqual(encodedSignature, expected)) {
    throw new Error("Invalid tunnel token signature");
  }
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as TunnelClaims;
  if (!payload.tunnelId || !payload.previewHost || !payload.allowedPort || !payload.exp) {
    throw new Error("Incomplete tunnel token");
  }
  if (Date.now() >= payload.exp * 1000) {
    throw new Error("Tunnel token expired");
  }
  return payload;
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(value)));
}

function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(data: string, secret: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(data));
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}
