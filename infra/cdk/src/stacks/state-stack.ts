import { CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, BillingMode, ProjectionType, StreamViewType, Table } from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";
import { logicalName } from "../config/environments.js";
import { AgentsCloudStack } from "./agents-cloud-stack.js";
import type { AgentsCloudStackProps } from "./agents-cloud-stack.js";

export class StateStack extends AgentsCloudStack {
  public readonly workItemsTable: Table;
  public readonly runsTable: Table;
  public readonly tasksTable: Table;
  public readonly eventsTable: Table;
  public readonly artifactsTable: Table;
  public readonly dataSourcesTable: Table;
  public readonly surfacesTable: Table;
  public readonly approvalsTable: Table;
  public readonly previewDeploymentsTable: Table;
  public readonly realtimeConnectionsTable: Table;

  public constructor(scope: Construct, id: string, props: AgentsCloudStackProps) {
    super(scope, id, props);

    this.workItemsTable = this.createTable("WorkItemsTable", "workspaceId", AttributeType.STRING, "workItemId", AttributeType.STRING, props);
    this.workItemsTable.addGlobalSecondaryIndex({
      indexName: "by-user-created-at",
      partitionKey: { name: "userId", type: AttributeType.STRING },
      sortKey: { name: "createdAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });
    this.workItemsTable.addGlobalSecondaryIndex({
      indexName: "by-status-updated-at",
      partitionKey: { name: "workspaceStatus", type: AttributeType.STRING },
      sortKey: { name: "updatedAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });
    this.workItemsTable.addGlobalSecondaryIndex({
      indexName: "by-idempotency-scope",
      partitionKey: { name: "idempotencyScope", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.runsTable = this.createTable("RunsTable", "workspaceId", AttributeType.STRING, "runId", AttributeType.STRING, props);
    this.runsTable.addGlobalSecondaryIndex({
      indexName: "by-user-created-at",
      partitionKey: { name: "userId", type: AttributeType.STRING },
      sortKey: { name: "createdAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });
    this.runsTable.addGlobalSecondaryIndex({
      indexName: "by-run-id",
      partitionKey: { name: "runId", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });
    this.runsTable.addGlobalSecondaryIndex({
      indexName: "by-idempotency-scope",
      partitionKey: { name: "idempotencyScope", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });
    this.runsTable.addGlobalSecondaryIndex({
      indexName: "by-workitem-created-at",
      partitionKey: { name: "workItemId", type: AttributeType.STRING },
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

    this.eventsTable = this.createTable("EventsTable", "runId", AttributeType.STRING, "seq", AttributeType.NUMBER, props, StreamViewType.NEW_IMAGE);
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
    this.artifactsTable.addGlobalSecondaryIndex({
      indexName: "by-workitem-created-at",
      partitionKey: { name: "workItemId", type: AttributeType.STRING },
      sortKey: { name: "createdAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.dataSourcesTable = this.createTable("DataSourcesTable", "workspaceId", AttributeType.STRING, "dataSourceId", AttributeType.STRING, props);
    this.dataSourcesTable.addGlobalSecondaryIndex({
      indexName: "by-workitem-created-at",
      partitionKey: { name: "workItemId", type: AttributeType.STRING },
      sortKey: { name: "createdAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });
    this.dataSourcesTable.addGlobalSecondaryIndex({
      indexName: "by-run-created-at",
      partitionKey: { name: "runId", type: AttributeType.STRING },
      sortKey: { name: "createdAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });
    this.dataSourcesTable.addGlobalSecondaryIndex({
      indexName: "by-artifact-id",
      partitionKey: { name: "artifactId", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.surfacesTable = this.createTable("SurfacesTable", "workspaceId", AttributeType.STRING, "surfaceId", AttributeType.STRING, props);
    this.surfacesTable.addGlobalSecondaryIndex({
      indexName: "by-workitem-updated-at",
      partitionKey: { name: "workItemId", type: AttributeType.STRING },
      sortKey: { name: "updatedAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });
    this.surfacesTable.addGlobalSecondaryIndex({
      indexName: "by-run-updated-at",
      partitionKey: { name: "runId", type: AttributeType.STRING },
      sortKey: { name: "updatedAt", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });
    this.surfacesTable.addGlobalSecondaryIndex({
      indexName: "by-status-updated-at",
      partitionKey: { name: "workspaceStatus", type: AttributeType.STRING },
      sortKey: { name: "updatedAt", type: AttributeType.STRING },
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

    this.realtimeConnectionsTable = this.createTable("RealtimeConnectionsTable", "pk", AttributeType.STRING, "sk", AttributeType.STRING, props);
    this.realtimeConnectionsTable.addGlobalSecondaryIndex({
      indexName: "by-connection",
      partitionKey: { name: "connectionId", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    this.outputTable("WorkItemsTableName", "work-items-table-name", this.workItemsTable, props);
    this.outputTable("RunsTableName", "runs-table-name", this.runsTable, props);
    this.outputTable("TasksTableName", "tasks-table-name", this.tasksTable, props);
    this.outputTable("EventsTableName", "events-table-name", this.eventsTable, props);
    this.outputTable("ArtifactsTableName", "artifacts-table-name", this.artifactsTable, props);
    this.outputTable("DataSourcesTableName", "data-sources-table-name", this.dataSourcesTable, props);
    this.outputTable("SurfacesTableName", "surfaces-table-name", this.surfacesTable, props);
    this.outputTable("ApprovalsTableName", "approvals-table-name", this.approvalsTable, props);
    this.outputTable("PreviewDeploymentsTableName", "preview-deployments-table-name", this.previewDeploymentsTable, props);
    this.outputTable("RealtimeConnectionsTableName", "realtime-connections-table-name", this.realtimeConnectionsTable, props);
  }

  private createTable(
    id: string,
    partitionKeyName: string,
    partitionKeyType: AttributeType,
    sortKeyName: string,
    sortKeyType: AttributeType,
    props: AgentsCloudStackProps,
    stream?: StreamViewType
  ): Table {
    return new Table(this, id, {
      partitionKey: { name: partitionKeyName, type: partitionKeyType },
      sortKey: { name: sortKeyName, type: sortKeyType },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream,
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
