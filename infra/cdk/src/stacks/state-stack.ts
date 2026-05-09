import { CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, BillingMode, ProjectionType, Table } from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";

export class StateStack extends AgentsCloudStack {
  public readonly runsTable: Table;
  public readonly tasksTable: Table;
  public readonly eventsTable: Table;
  public readonly artifactsTable: Table;
  public readonly approvalsTable: Table;
  public readonly previewDeploymentsTable: Table;

  public constructor(scope: Construct, id: string, props: AgentsCloudStackProps) {
    super(scope, id, props);

    this.runsTable = this.createTable("RunsTable", "workspaceId", AttributeType.STRING, "runId", AttributeType.STRING, props);
    this.runsTable.addGlobalSecondaryIndex({
      indexName: "by-user-created-at",
      partitionKey: { name: "userId", type: AttributeType.STRING },
      sortKey: { name: "createdAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.tasksTable = this.createTable("TasksTable", "runId", AttributeType.STRING, "taskId", AttributeType.STRING, props);
    this.tasksTable.addGlobalSecondaryIndex({
      indexName: "by-worker-class-created-at",
      partitionKey: { name: "workerClass", type: AttributeType.STRING },
      sortKey: { name: "createdAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.eventsTable = this.createTable("EventsTable", "runId", AttributeType.STRING, "seq", AttributeType.NUMBER, props);
    this.eventsTable.addGlobalSecondaryIndex({
      indexName: "by-workspace-created-at",
      partitionKey: { name: "workspaceId", type: AttributeType.STRING },
      sortKey: { name: "createdAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.artifactsTable = this.createTable("ArtifactsTable", "runId", AttributeType.STRING, "artifactId", AttributeType.STRING, props);
    this.artifactsTable.addGlobalSecondaryIndex({
      indexName: "by-workspace-kind-created-at",
      partitionKey: { name: "workspaceKind", type: AttributeType.STRING },
      sortKey: { name: "createdAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.approvalsTable = this.createTable("ApprovalsTable", "workspaceId", AttributeType.STRING, "approvalId", AttributeType.STRING, props);
    this.approvalsTable.addGlobalSecondaryIndex({
      indexName: "by-run-created-at",
      partitionKey: { name: "runId", type: AttributeType.STRING },
      sortKey: { name: "createdAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.previewDeploymentsTable = this.createTable("PreviewDeploymentsTable", "previewHost", AttributeType.STRING, "deploymentId", AttributeType.STRING, props);
    this.previewDeploymentsTable.addGlobalSecondaryIndex({
      indexName: "by-workspace-updated-at",
      partitionKey: { name: "workspaceId", type: AttributeType.STRING },
      sortKey: { name: "updatedAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });
    this.previewDeploymentsTable.addGlobalSecondaryIndex({
      indexName: "by-project-updated-at",
      partitionKey: { name: "projectId", type: AttributeType.STRING },
      sortKey: { name: "updatedAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.outputTable("RunsTableName", "runs-table-name", this.runsTable, props);
    this.outputTable("TasksTableName", "tasks-table-name", this.tasksTable, props);
    this.outputTable("EventsTableName", "events-table-name", this.eventsTable, props);
    this.outputTable("ArtifactsTableName", "artifacts-table-name", this.artifactsTable, props);
    this.outputTable("ApprovalsTableName", "approvals-table-name", this.approvalsTable, props);
    this.outputTable("PreviewDeploymentsTableName", "preview-deployments-table-name", this.previewDeploymentsTable, props);
  }

  private createTable(
    id: string,
    partitionKeyName: string,
    partitionKeyType: AttributeType,
    sortKeyName: string,
    sortKeyType: AttributeType,
    props: AgentsCloudStackProps
  ): Table {
    return new Table(this, id, {
      partitionKey: { name: partitionKeyName, type: partitionKeyType },
      sortKey: { name: sortKeyName, type: sortKeyType },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: props.config.envName !== "dev"
      },
      deletionProtection: props.config.envName === "prod",
      removalPolicy: props.config.envName === "prod" ? RemovalPolicy.RETAIN : props.config.removalPolicy
    });
  }

  private outputTable(id: string, exportSuffix: string, table: Table, props: AgentsCloudStackProps): void {
    new CfnOutput(this, id, {
      value: table.tableName,
      exportName: logicalName(props.config, exportSuffix)
    });
  }
}
