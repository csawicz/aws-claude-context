import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Embedding, EmbeddingVector } from './base-embedding';

export interface BedrockEmbeddingConfig {
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    model?: string;
    maxBatchSize?: number;
}

/**
 * AWS Bedrock embedding provider
 * Supports Titan, Cohere, and other embedding models available in Bedrock
 */
export class BedrockEmbedding extends Embedding {
    private client: BedrockRuntimeClient;
    private model: string;
    private maxBatchSize: number;
    protected maxTokens: number = 8000; // Default token limit for most models
    private dimension: number = 0;

    constructor(config: BedrockEmbeddingConfig = {}) {
        super();
        
        this.model = config.model || 'amazon.titan-embed-text-v2:0';
        this.maxBatchSize = config.maxBatchSize || 25; // Bedrock batch limit
        
        // Initialize Bedrock client
        const clientConfig: any = {
            region: config.region || process.env.AWS_REGION || 'us-east-1'
        };

        // Add credentials if provided
        if (config.accessKeyId && config.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
                ...(config.sessionToken && { sessionToken: config.sessionToken })
            };
        }

        this.client = new BedrockRuntimeClient(clientConfig);
        
        // Set model-specific configurations
        this.configureModel();
    }

    private configureModel(): void {
        if (this.model.includes('titan-embed-text-v2')) {
            // Amazon Titan Text Embeddings V2
            this.maxTokens = 8192; // Up to 8,192 tokens as per documentation
            this.dimension = 1024; // Default dimension, also supports 512, 256
        } else if (this.model.includes('titan-embed')) {
            // Amazon Titan Text Embeddings V1
            this.maxTokens = 8000;
            this.dimension = 1536;
        } else if (this.model.includes('cohere.embed')) {
            this.maxTokens = 512;
            this.dimension = 1024;
        } else {
            // Default fallback
            this.maxTokens = 8192;
            this.dimension = 1024;
        }
    }

    async embed(text: string): Promise<EmbeddingVector> {
        const processedText = this.preprocessText(text);
        
        try {
            const response = await this.invokeModel([processedText]);
            const embeddings = this.extractEmbeddings(response);
            
            if (embeddings.length === 0) {
                throw new Error('No embeddings returned from Bedrock');
            }

            return {
                vector: embeddings[0],
                dimension: embeddings[0].length
            };
        } catch (error) {
            console.error('Bedrock embedding error:', error);
            throw new Error(`Failed to generate embedding: ${error}`);
        }
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        const processedTexts = this.preprocessTexts(texts);
        const results: EmbeddingVector[] = [];

        // Process in batches due to Bedrock limits
        for (let i = 0; i < processedTexts.length; i += this.maxBatchSize) {
            const batch = processedTexts.slice(i, i + this.maxBatchSize);
            
            try {
                const response = await this.invokeModel(batch);
                const embeddings = this.extractEmbeddings(response);
                
                embeddings.forEach(embedding => {
                    results.push({
                        vector: embedding,
                        dimension: embedding.length
                    });
                });
            } catch (error) {
                console.error(`Bedrock batch embedding error for batch ${i}:`, error);
                throw new Error(`Failed to generate batch embeddings: ${error}`);
            }
        }

        return results;
    }

    private async invokeModel(texts: string[]): Promise<any> {
        let requestBody: any;

        if (this.model.includes('titan-embed-text-v2')) {
            // Amazon Titan Text Embeddings V2 format
            requestBody = {
                inputText: texts.length === 1 ? texts[0] : texts.join(' '),
                dimensions: this.dimension,
                normalize: true
            };
        } else if (this.model.includes('titan-embed')) {
            // Amazon Titan Text Embeddings V1 format
            requestBody = {
                inputText: texts.length === 1 ? texts[0] : texts.join(' ')
            };
        } else if (this.model.includes('cohere.embed')) {
            // Cohere embedding format
            requestBody = {
                texts: texts,
                input_type: 'search_document'
            };
        } else {
            throw new Error(`Unsupported model: ${this.model}`);
        }

        const command = new InvokeModelCommand({
            modelId: this.model,
            contentType: 'application/json',
            accept: '*/*',
            body: JSON.stringify(requestBody)
        });

        const response = await this.client.send(command);
        
        if (!response.body) {
            throw new Error('Empty response from Bedrock');
        }

        return JSON.parse(new TextDecoder().decode(response.body));
    }

    private extractEmbeddings(response: any): number[][] {
        if (this.model.includes('titan-embed')) {
            if (Array.isArray(response.embedding)) {
                // Single embedding
                return [response.embedding];
            } else if (response.embeddings && Array.isArray(response.embeddings)) {
                // Multiple embeddings
                return response.embeddings;
            }
        } else if (this.model.includes('cohere.embed')) {
            if (response.embeddings && Array.isArray(response.embeddings)) {
                return response.embeddings;
            }
        }

        throw new Error('Unable to extract embeddings from response');
    }

    async detectDimension(testText: string = 'test'): Promise<number> {
        if (this.dimension > 0) {
            return this.dimension;
        }

        try {
            const result = await this.embed(testText);
            this.dimension = result.dimension;
            return this.dimension;
        } catch (error) {
            console.error('Failed to detect dimension:', error);
            return this.dimension || 1536; // Fallback dimension
        }
    }

    getDimension(): number {
        return this.dimension;
    }

    getProvider(): string {
        return `bedrock:${this.model}`;
    }

    /**
     * Get available Bedrock embedding models
     */
    static getAvailableModels(): string[] {
        return [
            'amazon.titan-embed-text-v2:0', // Latest V2 model (recommended)
            'amazon.titan-embed-text-v1',   // Legacy V1 model
            'cohere.embed-english-v3',
            'cohere.embed-multilingual-v3'
        ];
    }

    /**
     * Get model information
     */
    getModelInfo(): { model: string; dimension: number; maxTokens: number; maxBatchSize: number } {
        return {
            model: this.model,
            dimension: this.dimension,
            maxTokens: this.maxTokens,
            maxBatchSize: this.maxBatchSize
        };
    }
}