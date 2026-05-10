import assert from "node:assert/strict";
import test from "node:test";

import { clearAmplifyBrowserState, getAmplifyAuthStorageKeys } from "../lib/auth-storage.ts";

function createStorage(keys: string[]) {
  const values = new Map(keys.map((key) => [key, "value"]));
  return {
    get length() {
      return values.size;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    keys() {
      return [...values.keys()];
    }
  };
}

test("getAmplifyAuthStorageKeys only matches Cognito/Amplify auth keys for the configured app client", () => {
  const keys = getAmplifyAuthStorageKeys(
    [
      "CognitoIdentityServiceProvider.client-123.LastAuthUser",
      "CognitoIdentityServiceProvider.client-123.user-id.idToken",
      "CognitoIdentityServiceProvider.other-client.user-id.idToken",
      "aws-amplify-cache",
      "unrelated"
    ],
    "client-123"
  );

  assert.deepEqual(keys, [
    "CognitoIdentityServiceProvider.client-123.LastAuthUser",
    "CognitoIdentityServiceProvider.client-123.user-id.idToken",
    "aws-amplify-cache"
  ]);
});

test("clearAmplifyBrowserState removes stale local/session/cookie auth state without touching unrelated app data", () => {
  const localStorage = createStorage([
    "CognitoIdentityServiceProvider.client-123.LastAuthUser",
    "CognitoIdentityServiceProvider.client-123.user-id.refreshToken",
    "CognitoIdentityServiceProvider.other-client.user-id.refreshToken",
    "app-sidebar-state"
  ]);
  const sessionStorage = createStorage(["aws-amplify-oauth-state", "workspace-filter"]);
  const expiredCookies: string[] = [];

  const result = clearAmplifyBrowserState({
    clientId: "client-123",
    localStorage,
    sessionStorage,
    cookieString:
      "CognitoIdentityServiceProvider.client-123.LastAuthUser=user; CognitoIdentityServiceProvider.client-123.user-id.idToken=token; theme=dark",
    expireCookie: (name) => expiredCookies.push(name)
  });

  assert.deepEqual(localStorage.keys(), ["CognitoIdentityServiceProvider.other-client.user-id.refreshToken", "app-sidebar-state"]);
  assert.deepEqual(sessionStorage.keys(), ["workspace-filter"]);
  assert.deepEqual(expiredCookies, [
    "CognitoIdentityServiceProvider.client-123.LastAuthUser",
    "CognitoIdentityServiceProvider.client-123.user-id.idToken"
  ]);
  assert.deepEqual(result, { localStorage: 2, sessionStorage: 1, cookies: 2 });
});
