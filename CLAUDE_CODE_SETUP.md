# Claude Code Setup Guide

Complete setup instructions for using Claude Context with Claude Code.

## Prerequisites

- **Node.js**: Version 20.0.0 to 23.x (NOT compatible with Node.js 24.0.0)
- **pnpm**: Version 10.0.0 or higher
- **AWS Account**: For Bedrock embeddings and S3Vectors storage
- **Claude Code**: Latest version with MCP support

## AWS Setup

### 1. Configure AWS Credentials

Choose one of these methods:

**Option A: AWS CLI (Recommended)**
```bash
# Install AWS CLI if not already installed
# macOS: brew install awscli
# Windows: Download from AWS website
# Linux: curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"

# Configure credentials
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key  
# Enter your default region (e.g., us-east-1)
# Enter default output format (json)
```

**Option B: Environment Variables**
```bash
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your-access-key-id
export AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

**Option C: AWS Credentials File**
Create `~/.aws/credentials`:
```ini
[default]
aws_access_key_id = your-access-key-id
aws_secret_access_key = your-secret-access-key
region = us-east-1
```

### 2. Create S3Vectors Bucket

```bash
# Create an S3Vectors bucket (replace with your preferred name)
aws s3vectors create-vector-bucket --vector-bucket-name claude-context-vectors
```

**Important Notes:**
- Bucket names must be 3-63 characters, lowercase letters, numbers, and hyphens only
- Bucket names must be unique within your AWS account and region
- S3Vectors is currently in preview and subject to change
- The bucket will be created with SSE-S3 encryption by default

Example with custom encryption (optional):
```bash
# Create bucket with KMS encryption
aws s3vectors create-vector-bucket \
  --vector-bucket-name claude-context-vectors \
  --encryption-configuration '{"sseType": "aws:kms", "kmsKeyArn": "arn:aws:kms:us-east-1:123456789012:key/your-kms-key-id"}'
```

### 3. Set Up IAM Permissions

Ensure your AWS user/role has these permissions:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel"
            ],
            "Resource": "arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3vectors:*"
            ],
            "Resource": [
                "arn:aws:s3vectors:*:*:bucket/claude-context-vectors",
                "arn:aws:s3vectors:*:*:bucket/claude-context-vectors/*"
            ]
        }
    ]
}
```

## Development Setup

### 1. Clone and Build

```bash
# Clone the repository
git clone https://github.com/zilliztech/claude-context.git
cd claude-context

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### 2. Development Mode

```bash
# Start development mode with file watching
pnpm dev

# Or build specific packages
pnpm build:core      # Core package only
pnpm build:mcp       # MCP server only
pnpm build:vscode    # VSCode extension only
```

### 3. Test the MCP Server

```bash
# Test with your AWS configuration
AWS_REGION=us-east-1 S3_VECTORS_BUCKET_NAME=claude-context-vectors node packages/mcp/dist/index.js --help
```

## Claude Code Integration

### Method 1: Using Published Package (Recommended)

```bash
# Add Claude Context MCP server to Claude Code
claude mcp add claude-context \
  -e AWS_REGION=us-east-1 \
  -e S3_VECTORS_BUCKET_NAME=claude-context-vectors \
  -- npx @zilliz/claude-context-mcp@latest
```

### Method 2: Using Local Development Build

If you're developing or testing local changes:

```bash
# First, build the project
pnpm build

# Add the local MCP server to Claude Code
claude mcp add claude-context-dev \
  -e AWS_REGION=us-east-1 \
  -e S3_VECTORS_BUCKET_NAME=claude-context-vectors \
  -- node /path/to/claude-context/packages/mcp/dist/index.js
```

### Method 3: Using pnpm Link (For Active Development)

```bash
# In the claude-context directory
cd packages/mcp
pnpm link --global

# Add to Claude Code using the linked package
claude mcp add claude-context-dev \
  -e AWS_REGION=us-east-1 \
  -e S3_VECTORS_BUCKET_NAME=claude-context-vectors \
  -- @zilliz/claude-context-mcp
```

## Configuration Options

### Required Environment Variables

```bash
# AWS Configuration
AWS_REGION=us-east-1                           # AWS region
S3_VECTORS_BUCKET_NAME=claude-context-vectors  # Your S3Vectors bucket name

# Optional: Specify different Bedrock model (defaults to amazon.titan-embed-text-v2:0)
BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v2:0
```

### Optional Environment Variables

```bash
# Advanced Configuration
EMBEDDING_BATCH_SIZE=100                       # Batch size for embeddings (default: 100)
HYBRID_MODE=true                              # Enable hybrid search (default: true)
CUSTOM_EXTENSIONS=.vue,.svelte,.astro         # Additional file extensions
CUSTOM_IGNORE_PATTERNS=private/**,secrets/**  # Additional ignore patterns

# MCP Server Configuration
MCP_SERVER_NAME="Claude Context"              # Server display name
MCP_SERVER_VERSION="1.0.0"                   # Server version
```

## Verification

### 1. Test MCP Server Connection

```bash
# Check if MCP server starts correctly
claude mcp list
# Should show claude-context in the list

# Test MCP server directly
AWS_REGION=us-east-1 S3_VECTORS_BUCKET_NAME=claude-context-vectors npx @zilliz/claude-context-mcp@latest --help
```

### 2. Test in Claude Code

1. Open Claude Code
2. Check that the Claude Context MCP server appears in the active connections
3. Try indexing a small project:
   ```
   Please index the current directory and search for "function definitions"
   ```

## Troubleshooting

### Common Issues

**Node.js Version Error:**
```bash
# Check Node.js version
node --version

# If you have Node.js 24+, downgrade to 20.x or 22.x
# Using nvm (recommended):
nvm install 20.18.0
nvm use 20.18.0
```

**AWS Credentials Error:**
```bash
# Test AWS credentials
aws sts get-caller-identity

# Check Bedrock access
aws bedrock list-foundation-models --region us-east-1
```

**S3Vectors Bucket Error:**
```bash
# Verify bucket exists
aws s3vectors list-vector-buckets --region us-east-1

# Check bucket details
aws s3vectors describe-vector-bucket --vector-bucket-name claude-context-vectors
```

**Build Errors:**
```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build

# Check for TypeScript errors
pnpm typecheck
```

### Debug Mode

Enable debug logging:
```bash
# Add debug environment variable
claude mcp add claude-context \
  -e AWS_REGION=us-east-1 \
  -e S3_VECTORS_BUCKET_NAME=claude-context-vectors \
  -e NODE_ENV=development \
  -- npx @zilliz/claude-context-mcp@latest
```

## Advanced Configuration

### Custom AWS Credentials

For specific use cases, you can provide explicit AWS credentials:

```bash
claude mcp add claude-context \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=your-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret \
  -e S3_VECTORS_BUCKET_NAME=claude-context-vectors \
  -- npx @zilliz/claude-context-mcp@latest
```

### Multiple S3Vectors Buckets

You can use different buckets for different projects:

```bash
# Production bucket
claude mcp add claude-context-prod \
  -e AWS_REGION=us-east-1 \
  -e S3_VECTORS_BUCKET_NAME=claude-context-prod \
  -- npx @zilliz/claude-context-mcp@latest

# Development bucket  
claude mcp add claude-context-dev \
  -e AWS_REGION=us-east-1 \
  -e S3_VECTORS_BUCKET_NAME=claude-context-dev \
  -- npx @zilliz/claude-context-mcp@latest
```

## Performance Optimization

### Embedding Model Selection

The default `amazon.titan-embed-text-v2:0` provides the best balance of performance and cost:
- **Dimensions**: 1024
- **Max tokens**: 8000
- **Cost**: Most cost-effective
- **Performance**: Optimized for code understanding

### S3Vectors Optimization

- **Bucket Region**: Use the same region as your primary AWS services
- **Hybrid Search**: Keep enabled (default) for better search results
- **Batch Size**: Increase to 150-200 for large codebases (default: 100)

```bash
claude mcp add claude-context \
  -e AWS_REGION=us-east-1 \
  -e S3_VECTORS_BUCKET_NAME=claude-context-vectors \
  -e EMBEDDING_BATCH_SIZE=150 \
  -e HYBRID_MODE=true \
  -- npx @zilliz/claude-context-mcp@latest
```

## Support

- **Documentation**: [Main README](README.md)
- **Issues**: [GitHub Issues](https://github.com/zilliztech/claude-context/issues)
- **Claude Code MCP**: [Official Documentation](https://docs.anthropic.com/en/docs/claude-code/mcp)