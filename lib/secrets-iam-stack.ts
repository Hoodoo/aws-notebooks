import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { CONFIG } from './config';

export interface SecretsAndIamStackProps extends cdk.StackProps {
  environment: string;
  rawDataBucket: s3.IBucket;
  derivedDataBucket: s3.IBucket;
}

export class SecretsAndIamStack extends cdk.Stack {
  public readonly fargateTaskExecutionRole: iam.Role;
  public readonly fargateTaskRole: iam.Role;
  public readonly lambdaExecutionRole: iam.Role;
  public readonly dataTransformationRole: iam.Role;
  public readonly onPremiseUser: iam.User;

  constructor(scope: Construct, id: string, props: SecretsAndIamStackProps) {
    super(scope, id, props);

    const { environment, rawDataBucket, derivedDataBucket } = props;

    // Apply stack-specific tags
    cdk.Tags.of(this).add('Component', 'iam');

    // Fargate Task Execution Role (for ECS agent - pulling images, logs, secrets)
    this.fargateTaskExecutionRole = new iam.Role(this, 'FargateTaskExecutionRole', {
      roleName: `${CONFIG.projectName}-${environment}-fargate-exec-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Execution role for Fargate tasks (ECS agent)',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Allow reading Okta secrets from Secrets Manager
    // Note: These secrets must be created manually before deployment
    this.fargateTaskExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
      ],
      resources: [
        `arn:aws:secretsmanager:${CONFIG.env.region}:${CONFIG.env.account}:secret:${CONFIG.okta.clientIdSecretName}*`,
        `arn:aws:secretsmanager:${CONFIG.env.region}:${CONFIG.env.account}:secret:${CONFIG.okta.clientSecretSecretName}*`,
      ],
    }));

    // Fargate Task Role (for application running in container)
    this.fargateTaskRole = new iam.Role(this, 'FargateTaskRole', {
      roleName: `${CONFIG.projectName}-${environment}-fargate-task-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Task role for Fargate containers (application permissions)',
    });

    // Grant read access to raw data bucket
    rawDataBucket.grantRead(this.fargateTaskRole);

    // Grant read/write access to derived data bucket
    derivedDataBucket.grantReadWrite(this.fargateTaskRole);

    // Lambda Execution Role (basic Lambda execution for API ingestion)
    this.lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `${CONFIG.projectName}-${environment}-lambda-exec-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Basic execution role for API ingestion Lambda functions',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    // Allow Lambda to read API secrets from Secrets Manager
    // Note: API secrets must be created manually by the team before deploying Lambda functions
    this.lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
      ],
      resources: [
        `arn:aws:secretsmanager:${CONFIG.env.region}:${CONFIG.env.account}:secret:${CONFIG.projectName}/api/*`,
      ],
    }));

    // Grant write access to raw data bucket (for API ingestion)
    rawDataBucket.grantWrite(this.lambdaExecutionRole);

    // Data Transformation Lambda Role (for processing data)
    this.dataTransformationRole = new iam.Role(this, 'DataTransformationRole', {
      roleName: `${CONFIG.projectName}-${environment}-transform-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for data transformation Lambda functions',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    // Grant read access to raw data bucket
    rawDataBucket.grantRead(this.dataTransformationRole);

    // Grant read/write access to derived data bucket
    derivedDataBucket.grantReadWrite(this.dataTransformationRole);

    // IAM User for on-premise devices (write-only to raw bucket)
    this.onPremiseUser = new iam.User(this, 'OnPremiseUser', {
      userName: `${CONFIG.projectName}-${environment}-onpremise-user`,
    });

    // Grant write-only access to raw data bucket (no read, no delete)
    this.onPremiseUser.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:PutObjectAcl',
      ],
      resources: [
        `${rawDataBucket.bucketArn}/*`,
      ],
    }));

    // Create access key for on-premise user
    const accessKey = new iam.CfnAccessKey(this, 'OnPremiseAccessKey', {
      userName: this.onPremiseUser.userName,
    });

    // Store access key credentials in Secrets Manager
    new secretsmanager.Secret(this, 'OnPremiseCredentials', {
      secretName: `${CONFIG.projectName}/${environment}/onpremise/credentials`,
      description: 'AWS credentials for on-premise devices to upload to raw data bucket',
      secretObjectValue: {
        accessKeyId: cdk.SecretValue.unsafePlainText(accessKey.ref),
        secretAccessKey: cdk.SecretValue.resourceAttribute(accessKey.attrSecretAccessKey),
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'FargateTaskExecutionRoleArn', {
      value: this.fargateTaskExecutionRole.roleArn,
      description: 'Fargate task execution role ARN',
      exportName: `${CONFIG.projectName}-${environment}-fargate-exec-role-arn`,
    });

    new cdk.CfnOutput(this, 'FargateTaskRoleArn', {
      value: this.fargateTaskRole.roleArn,
      description: 'Fargate task role ARN',
      exportName: `${CONFIG.projectName}-${environment}-fargate-task-role-arn`,
    });

    new cdk.CfnOutput(this, 'LambdaExecutionRoleArn', {
      value: this.lambdaExecutionRole.roleArn,
      description: 'Lambda execution role ARN',
      exportName: `${CONFIG.projectName}-${environment}-lambda-exec-role-arn`,
    });

    new cdk.CfnOutput(this, 'DataTransformationRoleArn', {
      value: this.dataTransformationRole.roleArn,
      description: 'Data transformation Lambda role ARN',
      exportName: `${CONFIG.projectName}-${environment}-transform-role-arn`,
    });

    new cdk.CfnOutput(this, 'OnPremiseUserName', {
      value: this.onPremiseUser.userName,
      description: 'IAM user for on-premise devices',
      exportName: `${CONFIG.projectName}-${environment}-onpremise-user`,
    });

    new cdk.CfnOutput(this, 'OnPremiseCredentialsSecretName', {
      value: `${CONFIG.projectName}/${environment}/onpremise/credentials`,
      description: 'Secret name containing on-premise user credentials',
    });
  }
}
