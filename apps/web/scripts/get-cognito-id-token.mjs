import { Amplify } from "aws-amplify";
import { fetchAuthSession, signIn, signOut } from "aws-amplify/auth";

const username = process.env.AGENTS_CLOUD_TEST_USERNAME;
const password = process.env.AGENTS_CLOUD_TEST_PASSWORD;
const userPoolId = process.env.NEXT_PUBLIC_AMPLIFY_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_AMPLIFY_USER_POOL_CLIENT_ID;
const region = process.env.NEXT_PUBLIC_AMPLIFY_REGION || "us-east-1";

if (!username || !password || !userPoolId || !userPoolClientId) {
  throw new Error("Missing Cognito test auth environment.");
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      loginWith: { email: true },
      signUpVerificationMethod: "code"
    }
  }
});

await signIn({ username, password });
const session = await fetchAuthSession();
const token = session.tokens?.idToken?.toString();
await signOut().catch(() => undefined);
if (!token) {
  throw new Error("Amplify sign-in succeeded without an id token.");
}
process.stdout.write(token);
