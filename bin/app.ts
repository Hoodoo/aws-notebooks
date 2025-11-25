#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CONFIG } from '../lib/config';

// Stacks will be imported and instantiated here as we build them
import { NetworkStack } from '../lib/network-stack';
// import { DnsStack } from '../lib/dns-stack';
// import { StorageStack } from '../lib/storage-stack';
// import { SecretsAndIamStack } from '../lib/secrets-iam-stack';
// import { ComputeStack } from '../lib/compute-stack';
// import { IngestionStack } from '../lib/ingestion-stack';

const app = new cdk.App();

// Environment configuration from config file
const env = CONFIG.env;

// Environment name from context or default to 'dev'
const environment = app.node.tryGetContext('environment') || 'dev';

// Apply default tags to all resources
cdk.Tags.of(app).add('Project', CONFIG.tags.Project);
cdk.Tags.of(app).add('Environment', environment);
cdk.Tags.of(app).add('ManagedBy', CONFIG.tags.ManagedBy);
cdk.Tags.of(app).add('Owner', CONFIG.tags.Owner);
cdk.Tags.of(app).add('IaC', CONFIG.tags.IaC);
cdk.Tags.of(app).add('Repository', CONFIG.tags.Repository);

// Stacks will be instantiated here following the deployment order:

// 1. NetworkStack
const networkStack = new NetworkStack(app, `${CONFIG.projectName}-${environment}-network`, {
  env,
  environment,
  description: `Network infrastructure for ${CONFIG.projectFullName}`,
});

// 2. DnsStack
// 3. StorageStack
// 4. SecretsAndIamStack
// 5. ComputeStack
// 6. IngestionStack

app.synth();
