import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as path from 'path';
import { Construct } from 'constructs';
import { CONFIG } from './config';

export interface ComputeStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.IVpc;
  albSecurityGroup: ec2.ISecurityGroup;
  fargateSecurityGroup: ec2.ISecurityGroup;
  hostedZone: route53.IHostedZone;
  certificate: acm.ICertificate;
  domainName: string;
  fileSystem: efs.IFileSystem;
  accessPoint: efs.IAccessPoint;
  taskExecutionRole: iam.IRole;
  taskRole: iam.IRole;
}

export class ComputeStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const {
      environment,
      vpc,
      albSecurityGroup,
      fargateSecurityGroup,
      hostedZone,
      certificate,
      domainName,
      fileSystem,
      accessPoint,
      taskExecutionRole,
      taskRole,
    } = props;

    // Apply stack-specific tags
    cdk.Tags.of(this).add('Component', 'compute');

    // ECS Cluster
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `${CONFIG.projectName}-${environment}-compute-cluster`,
      vpc,
      containerInsights: true,
    });

    // Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      loadBalancerName: `${CONFIG.projectName}-${environment}-alb`,
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    // Target Group for Fargate service
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      targetGroupName: `${CONFIG.projectName}-${environment}-tg`,
      vpc,
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // Import Okta secrets by complete ARN
    const oktaClientId = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'OktaClientId',
      CONFIG.okta.clientIdSecretArn
    );

    const oktaClientSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'OktaClientSecret',
      CONFIG.okta.clientSecretSecretArn
    );

    // HTTPS Listener with Okta authentication
    const httpsListener = this.loadBalancer.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: elbv2.ListenerAction.authenticateOidc({
        issuer: CONFIG.okta.issuer,
        clientId: oktaClientId.secretValue.unsafeUnwrap(),
        clientSecret: oktaClientSecret.secretValue,
        authorizationEndpoint: `${CONFIG.okta.issuer}/v1/authorize`,
        tokenEndpoint: `${CONFIG.okta.issuer}/v1/token`,
        userInfoEndpoint: `${CONFIG.okta.issuer}/v1/userinfo`,
        next: elbv2.ListenerAction.forward([targetGroup]),
      }),
    });

    // HTTP Listener - redirect to HTTPS
    this.loadBalancer.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });

    // CloudWatch Log Group for Fargate
    // Create explicitly for retention control, but reference by name to avoid cyclic dependency
    // (execution role already has CloudWatch Logs permissions via managed policy)
    const logGroupName = `/ecs/${CONFIG.projectName}-${environment}-marimo`;
    new logs.LogGroup(this, 'LogGroup', {
      logGroupName: logGroupName,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Fargate Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `${CONFIG.projectName}-${environment}-marimo`,
      cpu: 1024, // 1 vCPU
      memoryLimitMiB: 2048, // 2 GB
      executionRole: taskExecutionRole,
      taskRole: taskRole,
      volumes: [
        {
          name: 'scratch',
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              accessPointId: accessPoint.accessPointId,
              iam: 'ENABLED',
            },
          },
        },
      ],
    });

    // Container Definition
    const container = taskDefinition.addContainer('marimo', {
      containerName: 'marimo',
      // TODO: Replace with actual Marimo image from ECR or DockerHub
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/python:3.11-slim'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'marimo',
        logGroup: logs.LogGroup.fromLogGroupName(this, 'LogGroupRef', logGroupName),
      }),
      environment: {
        ENVIRONMENT: environment,
      },
      portMappings: [
        {
          containerPort: 8080,
          protocol: ecs.Protocol.TCP,
        },
      ],
    });

    // Mount EFS volume to /app/scratch
    container.addMountPoints({
      sourceVolume: 'scratch',
      containerPath: '/app/scratch',
      readOnly: false,
    });

    // Fargate Service
    this.service = new ecs.FargateService(this, 'Service', {
      serviceName: `${CONFIG.projectName}-${environment}-marimo-service`,
      cluster: this.cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      securityGroups: [fargateSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    // Attach service to target group
    this.service.attachToApplicationTargetGroup(targetGroup);

    // Route53 A Record (alias to ALB)
    new route53.ARecord(this, 'AliasRecord', {
      recordName: domainName,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(
        new route53targets.LoadBalancerTarget(this.loadBalancer)
      ),
    });

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDnsName', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'ALB DNS name',
      exportName: `${CONFIG.projectName}-${environment}-alb-dns`,
    });

    new cdk.CfnOutput(this, 'ApplicationUrl', {
      value: `https://${domainName}`,
      description: 'Application URL',
      exportName: `${CONFIG.projectName}-${environment}-app-url`,
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS cluster name',
      exportName: `${CONFIG.projectName}-${environment}-cluster-name`,
    });

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'ECS service name',
      exportName: `${CONFIG.projectName}-${environment}-service-name`,
    });
  }
}
