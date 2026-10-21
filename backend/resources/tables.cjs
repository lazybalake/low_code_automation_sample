'use strict';

// Every DynamoDB table, defined once. serverless.yml turns these into CloudFormation (cloudFormation below) and
// scripts/local-db.ts creates the same tables in DynamoDB Local (createTableInput), so local and AWS never drift.
// Physical name: <prefix>-<name>, where prefix is <service>-<stage> (custom.tablePrefix), e.g. inventory-api-dev-orders.
//
// events and movements are append-only logs: one partition ("stream") sorted by time. That is plenty for this
// workload; a busy store would shard the partition key by day.
const TABLES = {
  products: { name: 'products', logicalId: 'ProductsTable', key: 'id' },
  orders: {
    name: 'orders',
    logicalId: 'OrdersTable',
    key: 'id',
    indexes: { 'status-createdAt-index': ['status', 'createdAt'], 'kind-createdAt-index': ['kind', 'createdAt'] },
  },
  purchaseOrders: {
    name: 'purchase-orders',
    logicalId: 'PurchaseOrdersTable',
    key: 'id',
    indexes: { 'kind-createdAt-index': ['kind', 'createdAt'] },
  },
  // Counters (counter#ord) and uniqueness claims (sku#WB-750, order-ext#shopify-1042)
  keys: { name: 'keys', logicalId: 'KeysTable', key: 'key' },
  hooks: { name: 'hooks', logicalId: 'HooksTable', key: 'id' },
  // The outbox: its stream feeds deliverEvents and reorder
  events: { name: 'events', logicalId: 'EventsTable', key: 'stream', sort: 'sk', ttl: 'expiresAt', stream: 'NEW_IMAGE' },
  movements: { name: 'movements', logicalId: 'MovementsTable', key: 'stream', sort: 'sk', ttl: 'expiresAt' },
};

const keySchema = (hash, range) => [
  { AttributeName: hash, KeyType: 'HASH' },
  ...(range ? [{ AttributeName: range, KeyType: 'RANGE' }] : []),
];

/** CreateTable input for the AWS SDK. TTL is a separate UpdateTimeToLive call there. */
function createTableInput(prefix, def) {
  const indexes = Object.entries(def.indexes ?? {});
  const attributes = new Set([def.key, def.sort, ...indexes.flatMap(([, keys]) => keys)].filter(Boolean));
  return {
    TableName: `${prefix}-${def.name}`,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [...attributes].map((name) => ({ AttributeName: name, AttributeType: 'S' })),
    KeySchema: keySchema(def.key, def.sort),
    ...(indexes.length && {
      GlobalSecondaryIndexes: indexes.map(([IndexName, [hash, range]]) => ({
        IndexName,
        KeySchema: keySchema(hash, range),
        Projection: { ProjectionType: 'ALL' },
      })),
    }),
    ...(def.stream && { StreamSpecification: { StreamEnabled: true, StreamViewType: def.stream } }),
  };
}

/** serverless.yml: resources.Resources: ${file(./resources/tables.cjs):cloudFormation} */
async function cloudFormation({ resolveVariable }) {
  const prefix = await resolveVariable('self:custom.tablePrefix');
  const stage = await resolveVariable('sls:stage');
  const resources = {};
  for (const def of Object.values(TABLES)) {
    const { StreamSpecification, ...input } = createTableInput(prefix, def);
    resources[def.logicalId] = {
      Type: 'AWS::DynamoDB::Table',
      // Production data survives a stack delete; other stages are disposable
      ...(stage === 'prod' && { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' }),
      Properties: {
        ...input,
        ...(StreamSpecification && { StreamSpecification: { StreamViewType: StreamSpecification.StreamViewType } }),
        ...(def.ttl && { TimeToLiveSpecification: { AttributeName: def.ttl, Enabled: true } }),
        // Restore to any second of the last 35 days
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      },
    };
  }
  return resources;
}

module.exports = { TABLES, createTableInput, cloudFormation };
