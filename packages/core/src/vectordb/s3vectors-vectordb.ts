import { 
    S3VectorsClient, 
    CreateVectorBucketCommand,
    CreateIndexCommand,
    PutVectorsCommand,
    QueryVectorsCommand,
    DeleteVectorBucketCommand,
    DescribeIndexCommand,
    ListVectorBucketsCommand,
    DeleteIndexCommand,
    VectorBucket,
    Index,
    Vector,
    QueryVectorsRequest,
    QueryResult
} from '@aws-sdk/client-s3vectors';
import { 
    VectorDatabase, 
    VectorDocument, 
    VectorSearchResult, 
    HybridSearchResult, 
    HybridSearchRequest, 
    HybridSearchOptions, 
    SearchOptions 
} from './types';

export interface S3VectorsConfig {
    bucketName: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
}

interface CollectionMetadata {
    name: string;
    dimension: number;
    description?: string;
    isHybrid: boolean;
    indexName: string;
    created: string;
}

/**
 * AWS S3Vectors-based vector database implementation
 * Uses the dedicated S3Vectors service for optimized vector storage and search
 */
export class S3VectorsDatabase implements VectorDatabase {
    private client: S3VectorsClient;
    private bucketName: string;
    private collections: Map<string, CollectionMetadata> = new Map();

    constructor(config: S3VectorsConfig) {
        this.bucketName = config.bucketName;

        const clientConfig: any = {
            region: config.region || process.env.AWS_REGION || 'us-east-1'
        };

        if (config.accessKeyId && config.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
                ...(config.sessionToken && { sessionToken: config.sessionToken })
            };
        }

        this.client = new S3VectorsClient(clientConfig);
    }

    private getIndexName(collectionName: string): string {
        return `${collectionName.replace(/[^a-zA-Z0-9-]/g, '-')}-index`;
    }

    async createCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.createCollectionInternal(collectionName, dimension, description, false);
    }

    async createHybridCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.createCollectionInternal(collectionName, dimension, description, true);
    }

    private async createCollectionInternal(collectionName: string, dimension: number, description?: string, isHybrid: boolean = false): Promise<void> {
        const indexName = this.getIndexName(collectionName);

        try {
            // Create vector bucket if it doesn't exist
            await this.ensureVectorBucket();

            // Create index for the collection
            const createIndexCommand = new CreateIndexCommand({
                bucketName: this.bucketName,
                indexName: indexName,
                vectorConfig: {
                    dimension: dimension,
                    metric: 'cosine' // Using cosine similarity for semantic search
                },
                description: description || `Index for collection ${collectionName}`
            });

            await this.client.send(createIndexCommand);

            // Store collection metadata
            const metadata: CollectionMetadata = {
                name: collectionName,
                dimension,
                description,
                isHybrid,
                indexName,
                created: new Date().toISOString()
            };

            this.collections.set(collectionName, metadata);
            
            console.log(`✅ Created S3Vectors ${isHybrid ? 'hybrid ' : ''}collection: ${collectionName} (dimension: ${dimension})`);
        } catch (error: any) {
            if (error.name === 'ConflictException') {
                console.warn(`Collection ${collectionName} already exists`);
                return;
            }
            throw new Error(`Failed to create collection ${collectionName}: ${error.message}`);
        }
    }

    private async ensureVectorBucket(): Promise<void> {
        try {
            // Check if bucket exists by listing buckets
            const listCommand = new ListVectorBucketsCommand({});
            const response = await this.client.send(listCommand);
            
            const bucketExists = response.vectorBuckets?.some(bucket => bucket.bucketName === this.bucketName);
            
            if (!bucketExists) {
                // Create vector bucket
                const createBucketCommand = new CreateVectorBucketCommand({
                    bucketName: this.bucketName
                });
                
                await this.client.send(createBucketCommand);
                console.log(`✅ Created S3Vectors bucket: ${this.bucketName}`);
            }
        } catch (error: any) {
            if (error.name === 'ConflictException') {
                // Bucket already exists, which is fine
                return;
            }
            throw new Error(`Failed to ensure vector bucket: ${error.message}`);
        }
    }

    async dropCollection(collectionName: string): Promise<void> {
        const metadata = this.collections.get(collectionName);
        if (!metadata) {
            console.warn(`Collection '${collectionName}' does not exist`);
            return;
        }

        try {
            // Delete the index
            const deleteIndexCommand = new DeleteIndexCommand({
                bucketName: this.bucketName,
                indexName: metadata.indexName
            });

            await this.client.send(deleteIndexCommand);
            
            // Remove from local metadata
            this.collections.delete(collectionName);
            
            console.log(`✅ Dropped S3Vectors collection: ${collectionName}`);
        } catch (error: any) {
            throw new Error(`Failed to drop collection ${collectionName}: ${error.message}`);
        }
    }

    async hasCollection(collectionName: string): Promise<boolean> {
        const metadata = this.collections.get(collectionName);
        if (!metadata) {
            return false;
        }

        try {
            // Verify index exists
            const describeCommand = new DescribeIndexCommand({
                bucketName: this.bucketName,
                indexName: metadata.indexName
            });

            await this.client.send(describeCommand);
            return true;
        } catch (error: any) {
            if (error.name === 'ResourceNotFoundException') {
                this.collections.delete(collectionName);
                return false;
            }
            throw error;
        }
    }

    async listCollections(): Promise<string[]> {
        return Array.from(this.collections.keys());
    }

    async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.insertInternal(collectionName, documents);
    }

    async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.insertInternal(collectionName, documents);
    }

    private async insertInternal(collectionName: string, documents: VectorDocument[]): Promise<void> {
        const metadata = this.collections.get(collectionName);
        if (!metadata) {
            throw new Error(`Collection '${collectionName}' does not exist`);
        }

        if (documents.length === 0) {
            return;
        }

        try {
            // Convert documents to S3Vectors format
            const vectors: Vector[] = documents.map(doc => ({
                key: doc.id,
                values: new Float32Array(doc.vector),
                metadata: {
                    content: doc.content,
                    relativePath: doc.relativePath,
                    startLine: doc.startLine.toString(),
                    endLine: doc.endLine.toString(),
                    fileExtension: doc.fileExtension,
                    language: doc.metadata.language || 'unknown',
                    codebasePath: doc.metadata.codebasePath || ''
                }
            }));

            // Put vectors in batches (S3Vectors has limits on batch size)
            const batchSize = 100;
            for (let i = 0; i < vectors.length; i += batchSize) {
                const batch = vectors.slice(i, i + batchSize);
                
                const putCommand = new PutVectorsCommand({
                    bucketName: this.bucketName,
                    indexName: metadata.indexName,
                    vectors: batch
                });

                await this.client.send(putCommand);
            }

            console.log(`✅ Inserted ${documents.length} vectors into S3Vectors collection: ${collectionName}`);
        } catch (error: any) {
            throw new Error(`Failed to insert vectors into ${collectionName}: ${error.message}`);
        }
    }

    async search(collectionName: string, queryVector: number[], options: SearchOptions = {}): Promise<VectorSearchResult[]> {
        const { topK = 10, threshold = 0.0 } = options;
        
        const metadata = this.collections.get(collectionName);
        if (!metadata) {
            throw new Error(`Collection '${collectionName}' does not exist`);
        }

        try {
            const queryCommand = new QueryVectorsCommand({
                bucketName: this.bucketName,
                indexName: metadata.indexName,
                queryVector: new Float32Array(queryVector),
                maxResults: topK,
                minScore: threshold
            });

            const response = await this.client.send(queryCommand);
            
            if (!response.results) {
                return [];
            }

            return response.results.map(result => this.convertS3VectorResult(result));
        } catch (error: any) {
            throw new Error(`Failed to search in collection ${collectionName}: ${error.message}`);
        }
    }

    async hybridSearch(collectionName: string, searchRequests: HybridSearchRequest[], options: HybridSearchOptions = {}): Promise<HybridSearchResult[]> {
        const { limit = 10 } = options;
        
        // For S3Vectors, we'll perform vector search with the first valid vector request
        // Note: S3Vectors doesn't natively support hybrid search, so we simulate it
        const vectorRequest = searchRequests.find(req => Array.isArray(req.data));
        
        if (!vectorRequest || !Array.isArray(vectorRequest.data)) {
            throw new Error('At least one vector search request is required for hybrid search');
        }

        // Perform vector search
        const vectorResults = await this.search(collectionName, vectorRequest.data, { topK: limit * 2 });
        
        // For text search requests, we'll filter results based on metadata content
        const textRequest = searchRequests.find(req => typeof req.data === 'string');
        if (textRequest && typeof textRequest.data === 'string') {
            const filteredResults = this.filterResultsByText(vectorResults, textRequest.data);
            return filteredResults.slice(0, limit).map(result => ({
                document: result.document,
                score: result.score
            }));
        }

        return vectorResults.slice(0, limit).map(result => ({
            document: result.document,
            score: result.score
        }));
    }

    private filterResultsByText(results: VectorSearchResult[], query: string): VectorSearchResult[] {
        const queryTerms = query.toLowerCase().split(/\s+/);
        
        return results
            .map(result => {
                const content = result.document.content.toLowerCase();
                let textScore = 0;
                
                for (const term of queryTerms) {
                    const termCount = (content.match(new RegExp(term, 'g')) || []).length;
                    textScore += termCount;
                }
                
                // Combine vector and text scores
                const combinedScore = result.score * 0.7 + (textScore / Math.max(content.length / 100, 1)) * 0.3;
                
                return {
                    ...result,
                    score: combinedScore
                };
            })
            .filter(result => result.score > 0)
            .sort((a, b) => b.score - a.score);
    }

    async delete(collectionName: string, ids: string[]): Promise<void> {
        const metadata = this.collections.get(collectionName);
        if (!metadata) {
            throw new Error(`Collection '${collectionName}' does not exist`);
        }

        // Note: S3Vectors doesn't have a direct delete operation for individual vectors
        // In a real implementation, you might need to query and re-insert without the deleted vectors
        // For now, we'll log this limitation
        console.warn(`⚠️  S3Vectors doesn't support individual vector deletion. Collection: ${collectionName}, IDs: ${ids.join(', ')}`);
        
        // This would require implementing a workaround like:
        // 1. Query all vectors except the ones to delete
        // 2. Drop and recreate the index
        // 3. Re-insert the remaining vectors
    }

    async query(collectionName: string, filter: string, outputFields: string[], limit: number = 10): Promise<Record<string, any>[]> {
        const metadata = this.collections.get(collectionName);
        if (!metadata) {
            throw new Error(`Collection '${collectionName}' does not exist`);
        }

        // S3Vectors doesn't support direct querying by metadata filters
        // We would need to perform a broad search and filter results
        console.warn(`⚠️  S3Vectors doesn't support direct metadata querying. Use search with post-filtering instead.`);
        
        return [];
    }

    private convertS3VectorResult(result: QueryResult): VectorSearchResult {
        const metadata = result.metadata || {};
        
        const document: VectorDocument = {
            id: result.key || '',
            vector: Array.from(result.vector || []),
            content: metadata.content || '',
            relativePath: metadata.relativePath || '',
            startLine: parseInt(metadata.startLine || '0'),
            endLine: parseInt(metadata.endLine || '0'),
            fileExtension: metadata.fileExtension || '',
            metadata: {
                language: metadata.language || 'unknown',
                codebasePath: metadata.codebasePath || ''
            }
        };

        return {
            document,
            score: result.score || 0
        };
    }

    /**
     * Get S3Vectors configuration info
     */
    getConnectionInfo(): { bucketName: string; region: string } {
        return {
            bucketName: this.bucketName,
            region: this.client.config.region as string || 'unknown'
        };
    }

    /**
     * Get collection statistics
     */
    async getCollectionStats(collectionName: string): Promise<{ dimension: number; indexName: string }> {
        const metadata = this.collections.get(collectionName);
        if (!metadata) {
            throw new Error(`Collection '${collectionName}' does not exist`);
        }

        try {
            const describeCommand = new DescribeIndexCommand({
                bucketName: this.bucketName,
                indexName: metadata.indexName
            });

            const response = await this.client.send(describeCommand);
            
            return {
                dimension: response.vectorConfig?.dimension || metadata.dimension,
                indexName: metadata.indexName
            };
        } catch (error: any) {
            throw new Error(`Failed to get stats for collection ${collectionName}: ${error.message}`);
        }
    }

    /**
     * Get available S3Vectors indexes
     */
    async listIndexes(): Promise<Index[]> {
        try {
            // S3Vectors doesn't have a direct listIndexes command
            // We'll return the indexes we know about from our collections
            const indexes: Index[] = [];
            
            for (const metadata of this.collections.values()) {
                try {
                    const describeCommand = new DescribeIndexCommand({
                        bucketName: this.bucketName,
                        indexName: metadata.indexName
                    });

                    const response = await this.client.send(describeCommand);
                    if (response.indexName) {
                        indexes.push({
                            indexName: response.indexName,
                            bucketName: this.bucketName,
                            vectorConfig: response.vectorConfig,
                            description: response.description
                        });
                    }
                } catch (error) {
                    // Skip indexes that can't be described
                    continue;
                }
            }
            
            return indexes;
        } catch (error: any) {
            throw new Error(`Failed to list indexes: ${error.message}`);
        }
    }
}