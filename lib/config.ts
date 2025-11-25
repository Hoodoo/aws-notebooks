export const CONFIG = {
  projectName: 'marimo-platform',
  projectFullName: 'marimo-platform',

  env: {
    account: '564175397198',
    region: 'eu-west-2',
  },

  tags: {
    Project: 'marimo-platform',
    ManagedBy: 'cdk',
    Owner: 'data-team',
    IaC: 'true',
    Repository: 'aws-notebooks'
  },

  dns: {
    // TODO: Replace with your actual Route53 hosted zone ID
    hostedZoneId: 'Z08606083CKBAN2V5VVVT',
    // TODO: Replace with your actual domain name
    hostedZoneName: 'justmakeit.click',
    subdomainName: 'notebooks',
  },

  okta: {
    issuer: 'https://integrator-6693679.okta.com/oauth2/default',
    clientIdSecretArn:
  'arn:aws:secretsmanager:eu-west-2:564175397198:secret:marimo-platform/okta/client-id-xz38e2',
    clientSecretSecretArn:
  'arn:aws:secretsmanager:eu-west-2:564175397198:secret:marimo-platform/okta/client-secret-7g2wtE',
  },
  
  storage: {
    rawDataLifecycle: {
      transitionToIA: 90,
      transitionToGlacier: 180,
      transitionToDeepArchive: 365
    },
    scratchSizeGB: 2
  }
};
