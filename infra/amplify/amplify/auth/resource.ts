import { defineAuth } from "@aws-amplify/backend";

// Product-facing identity layer for agents-cloud.
// This is intentionally separate from the durable CDK platform backend. The
// Control API should later validate these Cognito JWTs before creating runs.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
