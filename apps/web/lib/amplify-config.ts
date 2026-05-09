import type { ResourcesConfig } from "aws-amplify";

type AmplifyEnv = {
  region?: string;
  userPoolId?: string;
  userPoolClientId?: string;
  identityPoolId?: string;
};

export function readAmplifyEnv(): AmplifyEnv {
  return {
    region: process.env.NEXT_PUBLIC_AMPLIFY_REGION,
    userPoolId: process.env.NEXT_PUBLIC_AMPLIFY_USER_POOL_ID,
    userPoolClientId: process.env.NEXT_PUBLIC_AMPLIFY_USER_POOL_CLIENT_ID,
    identityPoolId: process.env.NEXT_PUBLIC_AMPLIFY_IDENTITY_POOL_ID
  };
}

export function getAmplifyConfig(): ResourcesConfig | null {
  const env = readAmplifyEnv();

  if (!env.region || !env.userPoolId || !env.userPoolClientId) {
    return null;
  }

  return {
    Auth: {
      Cognito: {
        userPoolId: env.userPoolId,
        userPoolClientId: env.userPoolClientId,
        identityPoolId: env.identityPoolId,
        allowGuestAccess: true,
        signUpVerificationMethod: "code",
        loginWith: {
          email: true
        }
      }
    }
  };
}
