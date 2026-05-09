import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource.js";

// Product-facing Amplify Gen 2 backend.
// Keep heavy durable infrastructure in infra/cdk. Amplify starts with Auth so
// the eventual product client has a Cognito identity source for the Control API.
defineBackend({
  auth,
});
