import { defineBackend } from "@aws-amplify/backend";

// Product-facing Amplify Gen 2 backend shell.
// Keep heavy durable infrastructure in infra/cdk. Add Cognito/Auth, app-facing
// data models, and lightweight callbacks here when the product client is ready.
defineBackend({});
