type StorageLike = {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
};

export type ClearAmplifyBrowserStateOptions = {
  clientId?: string;
  localStorage?: StorageLike;
  sessionStorage?: StorageLike;
  cookieString?: string;
  expireCookie?: (name: string) => void;
};

export type ClearAmplifyBrowserStateResult = {
  localStorage: number;
  sessionStorage: number;
  cookies: number;
};

export function getAmplifyAuthStorageKeys(keys: Iterable<string>, clientId?: string): string[] {
  const cognitoPrefix = clientId ? `CognitoIdentityServiceProvider.${clientId}.` : "CognitoIdentityServiceProvider.";

  return [...keys].filter((key) => {
    const normalized = key.toLowerCase();
    return key.startsWith(cognitoPrefix) || normalized.startsWith("aws-amplify-") || normalized.startsWith("amplify-");
  });
}

export function clearAmplifyBrowserState(options: ClearAmplifyBrowserStateOptions = {}): ClearAmplifyBrowserStateResult {
  const localStorageCount = clearStorage(options.localStorage, options.clientId);
  const sessionStorageCount = clearStorage(options.sessionStorage, options.clientId);
  const cookieCount = clearCookies(options.cookieString, options.clientId, options.expireCookie);

  return {
    localStorage: localStorageCount,
    sessionStorage: sessionStorageCount,
    cookies: cookieCount
  };
}

function clearStorage(storage: StorageLike | undefined, clientId?: string): number {
  if (!storage) {
    return 0;
  }

  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) {
      keys.push(key);
    }
  }

  const authKeys = getAmplifyAuthStorageKeys(keys, clientId);
  for (const key of authKeys) {
    storage.removeItem(key);
  }
  return authKeys.length;
}

function clearCookies(
  cookieString: string | undefined,
  clientId: string | undefined,
  expireCookie: ((name: string) => void) | undefined
): number {
  if (!cookieString || !expireCookie) {
    return 0;
  }

  const cookieNames = cookieString
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .filter((name): name is string => Boolean(name));
  const authCookieNames = getAmplifyAuthStorageKeys(cookieNames, clientId);

  for (const name of authCookieNames) {
    expireCookie(name);
  }
  return authCookieNames.length;
}
