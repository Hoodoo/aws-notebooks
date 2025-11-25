# Goal
I want to build a small data platform based on Marimo in AWS, consisting of the following components:

## Frontend

A docker image based on Marimo's official image which I want to be able to extend:
  - by adding curated notebooks to `docker/marimo/curated`
  - by adding extra packages during container build time

To that end, I want to build the image locally and deploy it using aws-ecr-assets module.

The container should be running in Fargate in a private subnet and only available through an AWS load balancer.

The load balancer should have Okta integration.

## Scratch partition

I want the container to have a small (2GB) scratch partion (mounted under /app/scratch), backed by AWS EFS. The container should have r/w access to it.

## Data

I want to have two S3 buckets for the data I'm working with:

### Raw data bucket 
 - the container should not be able to write to the raw data bucket
 - we should define a reasonable lifecycle management schedule for this bucket (180 days of normal class, than gradual movement to the archive)
  - we probably want deletion prevention there
  - no public access to the bucket
  
### Derived data bucket
  - The container should be able to write to this bucket
  - Any data transformation functions we create within this project should be able to write to this bucket
  - we should have a lifecycle management schedule for this bucket
  - no public access to the bucket

### Data from on-premise devices

Part of the data I am going to process is going to originate from the on-premise devices which are not integrated with the cloud. We're going to need to create a user for this, and only allow this user writing to the raw data bucket

### Data from the API endpoints

  - I want to be able to pull some data from different API endpoints. The credentials and the endpoint URLs should be stored in the AWS secret storage.
  - My team needs to be able to add lambdas or schedules of their own using a well defined entry point (e.g. "to start ingesting the data, store your secret in the AWS secret storage, place your lambda's code under `lambda` and add a resource definition to $somefile.ts)
  - Unprocessed data should go to the raw data bucket
  - If we define lambdas or schedules for data transformation, they should read from the raw data bucket and use the derived data bucket for intermediate data and for the transformation results
  
## Test data

We need to add several simple examples of getting the data from the API endpoints and making very simple transformation, even just counting objects, just to show the team the ropes.

## Language and tools

We're going to use the TypeScript CDK implementation and we store our project in git.

## Naming and Tagging

### Naming Convention

We use this pattern for resource names:
```
{project}-{environment}-{service}-{resource-type}
```

**Components:**
- **project**: `marimo-platform` (or shorter: `mplat`)
- **environment**: `dev`, `staging`, `prod`
- **service**: `network`, `storage`, `compute`, `ingestion`, `dns`, etc.
- **resource-type**: `vpc`, `bucket`, `task`, `lambda`, `cert`, `record`, etc.

**Examples:**
- `mplat-prod-storage-raw-bucket`
- `mplat-dev-compute-notebook-task`
- `mplat-prod-ingestion-api-lambda`
- `mplat-prod-dns-cert`
- `mplat-prod-compute-alb-record`

For resources with strict naming requirements (like S3 buckets needing global uniqueness), add account ID or random suffix:
```
mplat-prod-storage-raw-${AWS::AccountId}
```

### Tagging Strategy

Apply these tags consistently across all resources:

```typescript
{
  Project: "marimo-platform",
  Environment: "dev" | "staging" | "prod",
  ManagedBy: "cdk",
  Owner: "data-team",
  CostCenter: "engineering",
  Component: "network" | "storage" | "compute" | "ingestion" | "dns",
  IaC: "true",
  Repository: "aws-notebooks"
}
```

## Stack Organization

We organize the infrastructure into **6 core stacks** with clear separation of concerns:

### 1. NetworkStack (`lib/network-stack.ts`)
**Purpose:** Foundational networking infrastructure
- VPC with public/private subnets across AZs
- NAT Gateways
- Security Groups (for ALB, Fargate, EFS, Lambda)
- VPC Endpoints (S3, Secrets Manager, ECR)

**Exports:** VPC ID, subnet IDs, security group IDs

### 2. DnsStack (`lib/dns-stack.ts`)
**Purpose:** Domain management and SSL certificates
- **Route53 Hosted Zone** (imported from existing delegation)
- **ACM Certificate** for the application domain (e.g., `notebooks.example.com`)
  - DNS validation (automated with Route53)
  - Subject Alternative Names if needed
- **Route53 A Record** (alias) pointing to ALB (created after ALB exists)

**Dependencies:** None (foundational)
**Exports:** Hosted zone ID, certificate ARN, domain name

### 3. StorageStack (`lib/storage-stack.ts`)
**Purpose:** All persistent storage resources
- **S3 Buckets:**
  - Raw data bucket (with lifecycle policies, deletion protection)
  - Derived data bucket (with lifecycle policies)
- **EFS File System** (2GB limit via quotas)
- EFS Mount Targets in private subnets
- EFS Access Point for `/app/scratch`

**Dependencies:** NetworkStack
**Exports:** Bucket names/ARNs, EFS filesystem ID

### 4. SecretsAndIamStack (`lib/secrets-iam-stack.ts`)
**Purpose:** Identity, access management, and secrets
- **IAM Roles:**
  - Fargate task execution role
  - Fargate task role (S3 read/write permissions)
  - Lambda execution roles
  - Data transformation function roles
- **IAM Users:**
  - On-premise device user (write-only to raw bucket)
- **Secrets Manager:** Placeholder/examples for API credentials
- **Policies:** Managed policies for different access patterns

**Dependencies:** StorageStack (for bucket ARNs)
**Exports:** Role ARNs, user credentials (via Secrets Manager)

### 5. ComputeStack (`lib/compute-stack.ts`)
**Purpose:** Container hosting and load balancing
- **ECR Repository** (or use CDK's DockerImageAsset)
- **ALB** (Application Load Balancer) in public subnets
  - HTTPS listener (port 443) with ACM certificate
  - HTTP listener (port 80) redirecting to HTTPS
  - Okta OIDC authentication
- **Route53 A Record** (alias) pointing to ALB
- **ECS Cluster** (Fargate)
- **Fargate Task Definition:**
  - Marimo container from custom Docker image
  - EFS volume mount for `/app/scratch`
  - Environment variables
- **Fargate Service** in private subnets
- Target Group for ALB → Fargate

**Dependencies:** NetworkStack, DnsStack, StorageStack, SecretsAndIamStack
**Exports:** ALB DNS name, service name, application URL

### 6. IngestionStack (`lib/ingestion-stack.ts`)
**Purpose:** Data ingestion pipelines and transformation jobs
- **Lambda Functions:**
  - API data ingestion examples (with EventBridge schedules)
  - Data transformation examples
- **EventBridge Rules** (schedules for periodic ingestion)
- **Lambda Layers** (shared dependencies if needed)
- **Convention:** Team members add lambdas under `lambda/` directory
  - `lambda/ingestion/` - API ingestion functions
  - `lambda/transformation/` - Data transformation functions

**Dependencies:** StorageStack, SecretsAndIamStack
**Exports:** Lambda function names/ARNs

### Stack Deployment Order

```
1. NetworkStack
2. DnsStack (independent - foundational)
3. StorageStack (depends on Network)
4. SecretsAndIamStack (depends on Storage)
5. ComputeStack (depends on Network, Dns, Storage, SecretsAndIam)
6. IngestionStack (depends on Storage, SecretsAndIam)
```

## Project Structure

```
aws-notebooks/
├── bin/
│   └── app.ts                 # CDK app entry point
├── lib/
│   ├── network-stack.ts
│   ├── dns-stack.ts
│   ├── storage-stack.ts
│   ├── secrets-iam-stack.ts
│   ├── compute-stack.ts
│   ├── ingestion-stack.ts
│   └── config.ts              # Shared config (tags, naming)
├── lambda/
│   ├── ingestion/
│   │   └── example-api/       # Example API ingestion
│   └── transformation/
│       └── example-transform/  # Example transformation
├── docker/
│   └── marimo/
│       ├── Dockerfile
│       ├── curated/           # Curated notebooks
│       └── requirements.txt   # Extra packages
├── test/
├── cdk.json
└── package.json
```

## Configuration Pattern

We maintain a central configuration file at `lib/config.ts`:

```typescript
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
    hostedZoneId: 'Z1234567890ABC',      // Your existing Route53 zone ID
    hostedZoneName: 'example.com',       // Your domain name
    subdomainName: 'notebooks',          // Creates notebooks.example.com
    // Or use different subdomain: 'marimo', 'data', 'platform', etc.
  },

  okta: {
    // These should come from environment variables or Secrets Manager
    issuer: 'https://your-org.okta.com/oauth2/default',
    clientIdSecretName: 'mplat/okta/client-id',
    clientSecretSecretName: 'mplat/okta/client-secret',
    // Callback URL will be: https://{subdomainName}.{hostedZoneName}/oauth2/idpresponse
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
```

## DNS and Certificate Implementation Notes

### DnsStack Implementation
- Imports existing Route53 hosted zone using `HostedZone.fromHostedZoneAttributes()`
- Creates ACM certificate with DNS validation for the subdomain
- DNS validation records are automatically created in Route53
- Certificate ARN is exported for use in ComputeStack

### ComputeStack Integration
- Imports certificate from DnsStack
- Creates ALB with:
  - HTTPS listener (port 443) using the ACM certificate
  - HTTP listener (port 80) with redirect to HTTPS
  - Okta OIDC authentication configured on HTTPS listener
- Creates Route53 A record (alias) pointing to the ALB DNS name
- Okta callback URL: `https://{subdomain}.{domain}/oauth2/idpresponse`

### Okta Configuration Requirements
Before deploying ComputeStack, ensure:
1. Okta application is created with Web application type
2. Redirect URI is set to: `https://{subdomain}.{domain}/oauth2/idpresponse`
3. Client ID and Client Secret are stored in AWS Secrets Manager
4. Authorization server issuer URL is configured in `config.ts`
