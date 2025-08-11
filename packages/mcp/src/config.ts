import { envManager } from "@zilliz/claude-context-core";

export interface ContextMcpConfig {
    name: string;
    version: string;
    // Embedding provider configuration
    embeddingProvider: 'OpenAI' | 'VoyageAI' | 'Gemini' | 'Ollama' | 'Bedrock';
    embeddingModel: string;
    // Provider-specific API keys
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    voyageaiApiKey?: string;
    geminiApiKey?: string;
    // AWS Bedrock configuration
    awsRegion?: string;
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
    awsSessionToken?: string;
    bedrockModel?: string;
    // Ollama configuration
    ollamaModel?: string;
    ollamaHost?: string;
    // Vector database configuration
    vectorDatabase: 'Milvus' | 'S3Vectors';
    milvusAddress?: string; // Optional, can be auto-resolved from token
    milvusToken?: string;
    // S3Vectors configuration
    s3VectorsBucketName?: string;
}

export interface CodebaseSnapshot {
    indexedCodebases: string[];
    indexingCodebases: string[] | Record<string, number>;  // Array (legacy) or Map of codebase path to progress percentage
    lastUpdated: string;
}

// Helper function to get default model for each provider
export function getDefaultModelForProvider(provider: string): string {
    switch (provider) {
        case 'OpenAI':
            return 'text-embedding-3-small';
        case 'VoyageAI':
            return 'voyage-code-3';
        case 'Gemini':
            return 'gemini-embedding-001';
        case 'Ollama':
            return 'nomic-embed-text';
        case 'Bedrock':
            return 'amazon.titan-embed-text-v2:0';
        default:
            return 'text-embedding-3-small';
    }
}

// Helper function to get embedding model with provider-specific environment variable priority
export function getEmbeddingModelForProvider(provider: string): string {
    switch (provider) {
        case 'Ollama':
            // For Ollama, prioritize OLLAMA_MODEL over EMBEDDING_MODEL
            const ollamaModel = envManager.get('OLLAMA_MODEL') || envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
            console.log(`[DEBUG] 🎯 Ollama model selection: OLLAMA_MODEL=${envManager.get('OLLAMA_MODEL') || 'NOT SET'}, EMBEDDING_MODEL=${envManager.get('EMBEDDING_MODEL') || 'NOT SET'}, selected=${ollamaModel}`);
            return ollamaModel;
        case 'Bedrock':
            // For Bedrock, prioritize BEDROCK_EMBEDDING_MODEL over EMBEDDING_MODEL
            return envManager.get('BEDROCK_EMBEDDING_MODEL') || envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
        case 'OpenAI':
        case 'VoyageAI':
        case 'Gemini':
        default:
            // For other providers, use EMBEDDING_MODEL or default
            return envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
    }
}

export function createMcpConfig(): ContextMcpConfig {
    // Debug: Print all environment variables related to Context
    console.log(`[DEBUG] 🔍 Environment Variables Debug:`);
    console.log(`[DEBUG]   EMBEDDING_PROVIDER: ${envManager.get('EMBEDDING_PROVIDER') || 'NOT SET'}`);
    console.log(`[DEBUG]   EMBEDDING_MODEL: ${envManager.get('EMBEDDING_MODEL') || 'NOT SET'}`);
    console.log(`[DEBUG]   OLLAMA_MODEL: ${envManager.get('OLLAMA_MODEL') || 'NOT SET'}`);
    console.log(`[DEBUG]   GEMINI_API_KEY: ${envManager.get('GEMINI_API_KEY') ? 'SET (length: ' + envManager.get('GEMINI_API_KEY')!.length + ')' : 'NOT SET'}`);
    console.log(`[DEBUG]   OPENAI_API_KEY: ${envManager.get('OPENAI_API_KEY') ? 'SET (length: ' + envManager.get('OPENAI_API_KEY')!.length + ')' : 'NOT SET'}`);
    console.log(`[DEBUG]   AWS_REGION: ${envManager.get('AWS_REGION') || 'NOT SET'}`);
    console.log(`[DEBUG]   AWS_ACCESS_KEY_ID: ${envManager.get('AWS_ACCESS_KEY_ID') ? 'SET' : 'NOT SET'}`);
    console.log(`[DEBUG]   BEDROCK_EMBEDDING_MODEL: ${envManager.get('BEDROCK_EMBEDDING_MODEL') || 'NOT SET'}`);
    console.log(`[DEBUG]   MILVUS_ADDRESS: ${envManager.get('MILVUS_ADDRESS') || 'NOT SET'}`);
    console.log(`[DEBUG]   S3_VECTORS_BUCKET_NAME: ${envManager.get('S3_VECTORS_BUCKET_NAME') || 'NOT SET'}`);
    console.log(`[DEBUG]   NODE_ENV: ${envManager.get('NODE_ENV') || 'NOT SET'}`);

    const config: ContextMcpConfig = {
        name: envManager.get('MCP_SERVER_NAME') || "Context MCP Server",
        version: envManager.get('MCP_SERVER_VERSION') || "1.0.0",
        // Embedding provider configuration - default to Bedrock if AWS credentials available
        embeddingProvider: (envManager.get('EMBEDDING_PROVIDER') as 'OpenAI' | 'VoyageAI' | 'Gemini' | 'Ollama' | 'Bedrock') || 
            (envManager.get('AWS_REGION') || envManager.get('AWS_ACCESS_KEY_ID') ? 'Bedrock' : 'OpenAI'),
        embeddingModel: getEmbeddingModelForProvider(
            envManager.get('EMBEDDING_PROVIDER') || 
            (envManager.get('AWS_REGION') || envManager.get('AWS_ACCESS_KEY_ID') ? 'Bedrock' : 'OpenAI')
        ),
        // Provider-specific API keys
        openaiApiKey: envManager.get('OPENAI_API_KEY'),
        openaiBaseUrl: envManager.get('OPENAI_BASE_URL'),
        voyageaiApiKey: envManager.get('VOYAGEAI_API_KEY'),
        geminiApiKey: envManager.get('GEMINI_API_KEY'),
        // AWS Bedrock configuration
        awsRegion: envManager.get('AWS_REGION'),
        awsAccessKeyId: envManager.get('AWS_ACCESS_KEY_ID'),
        awsSecretAccessKey: envManager.get('AWS_SECRET_ACCESS_KEY'),
        awsSessionToken: envManager.get('AWS_SESSION_TOKEN'),
        bedrockModel: envManager.get('BEDROCK_EMBEDDING_MODEL'),
        // Ollama configuration
        ollamaModel: envManager.get('OLLAMA_MODEL'),
        ollamaHost: envManager.get('OLLAMA_HOST'),
        // Vector database configuration - default to S3Vectors if bucket configured
        vectorDatabase: envManager.get('S3_VECTORS_BUCKET_NAME') ? 'S3Vectors' : 'Milvus',
        milvusAddress: envManager.get('MILVUS_ADDRESS'), // Optional, can be resolved from token
        milvusToken: envManager.get('MILVUS_TOKEN'),
        // S3Vectors configuration
        s3VectorsBucketName: envManager.get('S3_VECTORS_BUCKET_NAME')
    };

    return config;
}

export function logConfigurationSummary(config: ContextMcpConfig): void {
    // Log configuration summary before starting server
    console.log(`[MCP] 🚀 Starting Context MCP Server`);
    console.log(`[MCP] Configuration Summary:`);
    console.log(`[MCP]   Server: ${config.name} v${config.version}`);
    console.log(`[MCP]   Embedding Provider: ${config.embeddingProvider}`);
    console.log(`[MCP]   Embedding Model: ${config.embeddingModel}`);
    console.log(`[MCP]   Vector Database: ${config.vectorDatabase}`);
    if (config.vectorDatabase === 'S3Vectors') {
        console.log(`[MCP]   S3Vectors Bucket: ${config.s3VectorsBucketName || '[Not configured]'}`);
        console.log(`[MCP]   AWS Region: ${config.awsRegion || '[Not configured]'}`);
    } else {
        console.log(`[MCP]   Milvus Address: ${config.milvusAddress || (config.milvusToken ? '[Auto-resolve from token]' : '[Not configured]')}`);
    }

    // Log provider-specific configuration without exposing sensitive data
    switch (config.embeddingProvider) {
        case 'OpenAI':
            console.log(`[MCP]   OpenAI API Key: ${config.openaiApiKey ? '✅ Configured' : '❌ Missing'}`);
            if (config.openaiBaseUrl) {
                console.log(`[MCP]   OpenAI Base URL: ${config.openaiBaseUrl}`);
            }
            break;
        case 'VoyageAI':
            console.log(`[MCP]   VoyageAI API Key: ${config.voyageaiApiKey ? '✅ Configured' : '❌ Missing'}`);
            break;
        case 'Gemini':
            console.log(`[MCP]   Gemini API Key: ${config.geminiApiKey ? '✅ Configured' : '❌ Missing'}`);
            break;
        case 'Ollama':
            console.log(`[MCP]   Ollama Host: ${config.ollamaHost || 'http://127.0.0.1:11434'}`);
            console.log(`[MCP]   Ollama Model: ${config.embeddingModel}`);
            break;
        case 'Bedrock':
            console.log(`[MCP]   AWS Region: ${config.awsRegion || '[Not configured]'}`);
            console.log(`[MCP]   AWS Credentials: ${config.awsAccessKeyId ? '✅ Configured' : '❌ Missing'}`);
            console.log(`[MCP]   Bedrock Model: ${config.embeddingModel}`);
            break;
    }

    console.log(`[MCP] 🔧 Initializing server components...`);
}

export function showHelpMessage(): void {
    console.log(`
Context MCP Server

Usage: npx @zilliz/claude-context-mcp@latest [options]

Options:
  --help, -h                          Show this help message

Environment Variables:
  MCP_SERVER_NAME         Server name
  MCP_SERVER_VERSION      Server version
  
  Embedding Provider Configuration:
  EMBEDDING_PROVIDER      Embedding provider: OpenAI, VoyageAI, Gemini, Ollama, Bedrock (default: Bedrock if AWS configured, otherwise OpenAI)
  EMBEDDING_MODEL         Embedding model name (auto-detected if not specified)
  
  Provider-specific API Keys:
  OPENAI_API_KEY          OpenAI API key (required for OpenAI provider)
  OPENAI_BASE_URL         OpenAI API base URL (optional, for custom endpoints)
  VOYAGEAI_API_KEY        VoyageAI API key (required for VoyageAI provider)
  GEMINI_API_KEY          Google AI API key (required for Gemini provider)
  
  AWS Bedrock Configuration:
  AWS_REGION              AWS region (default: us-east-1)
  AWS_ACCESS_KEY_ID       AWS access key ID (optional, uses default AWS credential chain)
  AWS_SECRET_ACCESS_KEY   AWS secret access key (optional, uses default AWS credential chain)
  AWS_SESSION_TOKEN       AWS session token (optional, for temporary credentials)
  BEDROCK_EMBEDDING_MODEL Bedrock embedding model (default: amazon.titan-embed-text-v2:0)
  
  Ollama Configuration:
  OLLAMA_HOST             Ollama server host (default: http://127.0.0.1:11434)
  OLLAMA_MODEL            Ollama model name (default: nomic-embed-text)
  
  Vector Database Configuration:
  MILVUS_ADDRESS          Milvus address (optional, can be auto-resolved from token)
  MILVUS_TOKEN            Milvus token (optional, used for authentication and address resolution)
  S3_VECTORS_BUCKET_NAME  S3Vectors bucket name (uses S3Vectors if set)

Examples:
  # Start MCP server with AWS Bedrock and S3Vectors (recommended AWS setup)
  AWS_REGION=us-east-1 S3_VECTORS_BUCKET_NAME=my-vectors-bucket npx @zilliz/claude-context-mcp@latest
  
  # Start MCP server with specific Bedrock model and S3Vectors
  AWS_REGION=us-east-1 BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v2:0 S3_VECTORS_BUCKET_NAME=my-vectors npx @zilliz/claude-context-mcp@latest
  
  # Start MCP server with OpenAI and Milvus (legacy setup)
  OPENAI_API_KEY=sk-xxx MILVUS_ADDRESS=localhost:19530 npx @zilliz/claude-context-mcp@latest
  
  # Start MCP server with OpenAI and auto-resolve Milvus address from token
  OPENAI_API_KEY=sk-xxx MILVUS_TOKEN=your-zilliz-token npx @zilliz/claude-context-mcp@latest
  
  # Start MCP server with VoyageAI
  EMBEDDING_PROVIDER=VoyageAI VOYAGEAI_API_KEY=pa-xxx MILVUS_TOKEN=your-token npx @zilliz/claude-context-mcp@latest
  
  # Start MCP server with Ollama
  EMBEDDING_PROVIDER=Ollama EMBEDDING_MODEL=nomic-embed-text MILVUS_TOKEN=your-token npx @zilliz/claude-context-mcp@latest
        `);
} 