#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import { loadConfig, stackName } from "../config/environments.js";
import { ClusterStack } from "../stacks/cluster-stack.js";
import { ControlApiStack } from "../stacks/control-api-stack.js";
import { FoundationStack } from "../stacks/foundation-stack.js";
import { NetworkStack } from "../stacks/network-stack.js";
import { OrchestrationStack } from "../stacks/orchestration-stack.js";
import { PreviewIngressStack } from "../stacks/preview-ingress-stack.js";
import { RuntimeStack } from "../stacks/runtime-stack.js";
import { StateStack } from "../stacks/state-stack.js";
import { StorageStack } from "../stacks/storage-stack.js";

const app = new App();
const config = loadConfig();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: config.awsRegion
};

const foundation = new FoundationStack(app, stackName(config, "foundation"), { config, env });
const network = new NetworkStack(app, stackName(config, "network"), { config, env });
const storage = new StorageStack(app, stackName(config, "storage"), { config, env });
const state = new StateStack(app, stackName(config, "state"), { config, env });
const cluster = new ClusterStack(app, stackName(config, "cluster"), { config, env, network });
const runtime = new RuntimeStack(app, stackName(config, "runtime"), { config, env, cluster, storage, state });
const orchestration = new OrchestrationStack(app, stackName(config, "orchestration"), {
  config,
  env,
  cluster,
  network,
  runtime
});
const controlApi = new ControlApiStack(app, stackName(config, "control-api"), {
  config,
  env,
  state,
  orchestration
});

const previewIngress = config.previewIngress.enabled
  ? new PreviewIngressStack(app, stackName(config, "preview-ingress"), {
      config,
      env,
      network,
      cluster,
      storage,
      state
    })
  : undefined;

network.addDependency(foundation);
storage.addDependency(foundation);
state.addDependency(foundation);
cluster.addDependency(network);
runtime.addDependency(cluster);
runtime.addDependency(storage);
runtime.addDependency(state);
orchestration.addDependency(runtime);
controlApi.addDependency(orchestration);
controlApi.addDependency(state);
if (previewIngress) {
  previewIngress.addDependency(cluster);
  previewIngress.addDependency(storage);
  previewIngress.addDependency(state);
}

Tags.of(app).add("Application", config.appName);
Tags.of(app).add("Environment", config.envName);
