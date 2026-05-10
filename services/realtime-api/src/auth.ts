import { CognitoJwtVerifier } from "aws-jwt-verify";

type HeaderBag = Record<string, string | undefined> | undefined;

type AuthorizerEvent = {
  readonly headers?: HeaderBag;
  readonly queryStringParameters?: Record<string, string | undefined>;
  readonly methodArn: string;
};

interface VerifiedClaims {
  readonly sub: string;
  readonly email?: string;
  readonly username?: string;
}

interface JwtVerifier {
  verify(token: string): Promise<VerifiedClaims>;
}

export function extractToken(event: { readonly headers?: HeaderBag; readonly queryStringParameters?: Record<string, string | undefined> }): string | undefined {
  const headers = event.headers ?? {};
  const authorization = headers.authorization ?? headers.Authorization;
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return event.queryStringParameters?.token;
}

export async function authorizerHandler(event: AuthorizerEvent): Promise<ReturnType<typeof websocketAuthorizerResponse>> {
  const token = extractToken(event);
  if (!token) {
    return websocketAuthorizerResponse({ effect: "Deny", methodArn: event.methodArn });
  }

  try {
    const claims = await verifierFromEnvironment().verify(token);
    return websocketAuthorizerResponse({
      effect: "Allow",
      methodArn: event.methodArn,
      userId: claims.sub,
      email: claims.email ?? claims.username
    });
  } catch (error) {
    console.warn("websocket authorizer rejected token", error instanceof Error ? error.message : String(error));
    return websocketAuthorizerResponse({ effect: "Deny", methodArn: event.methodArn });
  }
}

export function websocketAuthorizerResponse(input: {
  readonly effect: "Allow" | "Deny";
  readonly methodArn: string;
  readonly userId?: string;
  readonly email?: string;
}) {
  return {
    principalId: input.userId ?? "anonymous",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: input.effect,
          Resource: input.methodArn
        }
      ]
    },
    context: {
      userId: input.userId ?? "",
      email: input.email ?? ""
    }
  };
}

function verifierFromEnvironment(): JwtVerifier {
  const userPoolId = mustEnv("COGNITO_USER_POOL_ID");
  const clientId = mustEnv("COGNITO_USER_POOL_CLIENT_ID");
  return CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: "id",
    clientId
  }) as JwtVerifier;
}

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
