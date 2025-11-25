export const CONFIG = {
  projectName: 'mplat',
  projectFullName: 'marimo-platform',

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
    // TODO: Replace with your Okta organization URL
    issuer: 'https://integrator-6693679.okta.com/oauth2/default',
    clientIdSecretName: 'marimo-platform/okta/client-id',
    clientSecretSecretName: 'marimo-platform/okta/client-secret',
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
