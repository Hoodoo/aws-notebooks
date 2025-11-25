import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { CONFIG } from './config';

export interface StorageStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.IVpc;
  efsSecurityGroup: ec2.ISecurityGroup;
}

export class StorageStack extends cdk.Stack {
  public readonly rawDataBucket: s3.Bucket;
  public readonly derivedDataBucket: s3.Bucket;
  public readonly fileSystem: efs.FileSystem;
  public readonly accessPoint: efs.AccessPoint;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { environment, vpc, efsSecurityGroup } = props;

    // Apply stack-specific tags
    cdk.Tags.of(this).add('Component', 'storage');

    // Raw Data S3 Bucket (read-only for containers)
    this.rawDataBucket = new s3.Bucket(this, 'RawDataBucket', {
      bucketName: `${CONFIG.projectName}-${environment}-storage-raw-${CONFIG.env.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Deletion protection
      lifecycleRules: [
        {
          id: 'TransitionToInfrequentAccess',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(CONFIG.storage.rawDataLifecycle.transitionToIA),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(CONFIG.storage.rawDataLifecycle.transitionToGlacier),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(CONFIG.storage.rawDataLifecycle.transitionToDeepArchive),
            },
          ],
        },
      ],
    });

    // Derived Data S3 Bucket (read/write for containers)
    this.derivedDataBucket = new s3.Bucket(this, 'DerivedDataBucket', {
      bucketName: `${CONFIG.projectName}-${environment}-storage-derived-${CONFIG.env.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Can be recreated
      lifecycleRules: [
        {
          id: 'CleanupOldData',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(60),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(180),
            },
          ],
          expiration: cdk.Duration.days(365), // Delete after 1 year
        },
      ],
    });

    // EFS File System for scratch space
    this.fileSystem = new efs.FileSystem(this, 'FileSystem', {
      vpc,
      fileSystemName: `${CONFIG.projectName}-${environment}-storage-efs`,
      encrypted: true,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS, // Move to IA after 14 days
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      securityGroup: efsSecurityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Can be recreated
    });

    // Access Point for /app/scratch with POSIX user settings
    this.accessPoint = new efs.AccessPoint(this, 'AccessPoint', {
      fileSystem: this.fileSystem,
      path: '/scratch',
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '755',
      },
      posixUser: {
        gid: '1000',
        uid: '1000',
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'RawDataBucketName', {
      value: this.rawDataBucket.bucketName,
      description: 'Raw data S3 bucket name',
      exportName: `${CONFIG.projectName}-${environment}-raw-bucket-name`,
    });

    new cdk.CfnOutput(this, 'RawDataBucketArn', {
      value: this.rawDataBucket.bucketArn,
      description: 'Raw data S3 bucket ARN',
      exportName: `${CONFIG.projectName}-${environment}-raw-bucket-arn`,
    });

    new cdk.CfnOutput(this, 'DerivedDataBucketName', {
      value: this.derivedDataBucket.bucketName,
      description: 'Derived data S3 bucket name',
      exportName: `${CONFIG.projectName}-${environment}-derived-bucket-name`,
    });

    new cdk.CfnOutput(this, 'DerivedDataBucketArn', {
      value: this.derivedDataBucket.bucketArn,
      description: 'Derived data S3 bucket ARN',
      exportName: `${CONFIG.projectName}-${environment}-derived-bucket-arn`,
    });

    new cdk.CfnOutput(this, 'FileSystemId', {
      value: this.fileSystem.fileSystemId,
      description: 'EFS file system ID',
      exportName: `${CONFIG.projectName}-${environment}-efs-id`,
    });

    new cdk.CfnOutput(this, 'AccessPointId', {
      value: this.accessPoint.accessPointId,
      description: 'EFS access point ID',
      exportName: `${CONFIG.projectName}-${environment}-efs-access-point-id`,
    });
  }
}
