# Marimo Platform

Cloud-based data platform built on AWS, featuring Marimo notebooks for data analysis and transformation.

## Architecture

- **Frontend**: Marimo notebook interface running in Fargate (private subnet) with Okta authentication
- **Storage**: S3 buckets for raw and derived data, EFS for scratch space
- **Data Ingestion**: Lambda functions pulling from API endpoints and on-premise devices
- **Security**: Private networking, VPC endpoints, IAM roles with least privilege

## Prerequisites

### 1. AWS Account Configuration

The project is configured for:
- **AWS Account**: `564175397198`
- **Region**: `eu-west-2`
- **Route53 Domain**: `justmakeit.click`
- **Subdomain**: `notebooks.justmakeit.click`

### 2. Required Tools

- [AWS CLI](https://aws.amazon.com/cli/) v2
- [AWS CDK](https://aws.amazon.com/cdk/) v2
- [Node.js](https://nodejs.org/) v18+ (LTS recommended)
- [TypeScript](https://www.typescriptlang.org/)

### 3. AWS Credentials

Configure AWS credentials with permissions to deploy CDK stacks:
```bash
aws configure
```

### 4. CDK Bootstrap

Bootstrap your AWS account for CDK (one-time operation):
```bash
cdk bootstrap aws://564175397198/eu-west-2
```

### 5. Required Secrets

**IMPORTANT**: Create these secrets in AWS Secrets Manager **BEFORE** deployment:

#### Okta OAuth Credentials
```bash
# Client ID
aws secretsmanager create-secret \
  --name marimo-platform/okta/client-id \
  --description "Okta OAuth2 Client ID" \
  --secret-string "YOUR_OKTA_CLIENT_ID" \
  --region eu-west-2

# Client Secret
aws secretsmanager create-secret \
  --name marimo-platform/okta/client-secret \
  --description "Okta OAuth2 Client Secret" \
  --secret-string "YOUR_OKTA_CLIENT_SECRET" \
  --region eu-west-2
```

To get these values:
1. Log into your Okta admin console
2. Create a new Web application
3. Set redirect URI to: `https://notebooks.justmakeit.click/oauth2/idpresponse`
4. Copy the Client ID and Client Secret

## Deployment

### Install Dependencies
```bash
npm install
```

### Build TypeScript
```bash
npm run build
```

### Synthesize CloudFormation
```bash
npm run cdk synth
```

### Deploy All Stacks
```bash
npm run cdk deploy --all
```

### Deploy Individual Stacks
```bash
# Deploy in order:
cdk deploy marimo-platform-dev-network
cdk deploy marimo-platform-dev-dns
cdk deploy marimo-platform-dev-storage
cdk deploy marimo-platform-dev-secrets-iam
cdk deploy marimo-platform-dev-compute
cdk deploy marimo-platform-dev-ingestion
```

## Post-Deployment

### Retrieve On-Premise Credentials
After deployment, retrieve credentials for on-premise devices:
```bash
aws secretsmanager get-secret-value \
  --secret-id marimo-platform/dev/onpremise/credentials \
  --region eu-west-2 \
  --query SecretString \
  --output text
```

### Access the Application
Navigate to: `https://notebooks.justmakeit.click`

You'll be redirected to Okta for authentication.

## Adding Data Sources

### API Ingestion

1. Store API credentials in Secrets Manager:
```bash
aws secretsmanager create-secret \
  --name marimo-platform/api/my-api \
  --secret-string '{"apiKey":"KEY","apiUrl":"https://api.example.com"}' \
  --region eu-west-2
```

2. Create Lambda function under `lambda/ingestion/my-api/`
3. Add Lambda resource to `lib/ingestion-stack.ts`
4. Deploy: `cdk deploy marimo-platform-dev-ingestion`

### On-Premise Data Upload

Use the credentials retrieved above to upload data:
```bash
aws s3 cp data.csv s3://marimo-platform-dev-storage-raw-564175397198/ \
  --profile onpremise
```

## Project Structure

```
aws-notebooks/
├── bin/app.ts              # CDK app entry point
├── lib/
│   ├── config.ts           # Configuration
│   ├── network-stack.ts    # VPC, security groups, endpoints
│   ├── dns-stack.ts        # Route53, ACM certificate
│   ├── storage-stack.ts    # S3 buckets, EFS
│   ├── secrets-iam-stack.ts # IAM roles, policies
│   ├── compute-stack.ts    # ALB, Fargate, ECS
│   └── ingestion-stack.ts  # Lambda functions
├── lambda/
│   ├── ingestion/          # API data ingestion
│   └── transformation/     # Data transformations
└── docker/marimo/
    ├── Dockerfile
    ├── curated/            # Curated notebooks
    └── requirements.txt    # Python packages
```

## Configuration

Edit `lib/config.ts` to customize:
- Project name and tags
- DNS settings
- Storage lifecycle policies
- Okta configuration

## Useful Commands

- `npm run build` - Compile TypeScript
- `npm run watch` - Watch for changes
- `npm run test` - Run tests
- `npm run cdk diff` - Compare deployed stack with current state
- `npm run cdk synth` - Synthesize CloudFormation template
- `npm run cdk deploy` - Deploy stacks
- `npm run cdk destroy` - Destroy stacks

## Documentation

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation, naming conventions, and implementation notes.
