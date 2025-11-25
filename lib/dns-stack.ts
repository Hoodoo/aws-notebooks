import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { CONFIG } from './config';

export interface DnsStackProps extends cdk.StackProps {
  environment: string;
}

export class DnsStack extends cdk.Stack {
  public readonly hostedZone: route53.IHostedZone;
  public readonly certificate: acm.Certificate;
  public readonly domainName: string;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Apply stack-specific tags
    cdk.Tags.of(this).add('Component', 'dns');

    // Construct full domain name
    this.domainName = `${CONFIG.dns.subdomainName}.${CONFIG.dns.hostedZoneName}`;

    // Import existing Route53 hosted zone
    this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: CONFIG.dns.hostedZoneId,
      zoneName: CONFIG.dns.hostedZoneName,
    });

    // Create ACM certificate for the subdomain with DNS validation
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: this.domainName,
      certificateName: `${CONFIG.projectName}-${environment}-dns-cert`,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // Outputs
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'Route53 Hosted Zone ID',
      exportName: `${CONFIG.projectName}-${environment}-hosted-zone-id`,
    });

    new cdk.CfnOutput(this, 'DomainName', {
      value: this.domainName,
      description: 'Full domain name for the application',
      exportName: `${CONFIG.projectName}-${environment}-domain-name`,
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'ACM Certificate ARN',
      exportName: `${CONFIG.projectName}-${environment}-certificate-arn`,
    });
  }
}
