/**
 * controllers/generateController.js
 * -----------------------------------------------------------------------------
 * Controller functions handling the generation of answers based on a provided prompt:
 *   - Validates the access token.
 *   - Connects to OpenSearch using an AWS connector.
 *   - Ensures the 'documents' index is properly set up with required mappings.
 *   - Processes and cleans document texts from S3.
 *   - Generates and indexes document embeddings.
 *   - Performs a similarity search using cosine similarity.
 *   - Simulates LLM-based answer generation.
 * -----------------------------------------------------------------------------
 */


const { Client } = require('@opensearch-project/opensearch');
const createConnector = require('aws-opensearch-connector');
const DocumentModel = require('../models/documentModel');
const { downloadFileFromS3 } = require('../services/s3Service');

/**
 * Ensures the 'documents' index exists with the proper mapping.
 * Deletes the index if it exists and then creates it with the desired settings.
 *
 * @param {Client} client - The OpenSearch client instance.
 */
async function ensureDocumentsIndex(client) {
  // Check if the 'documents' index exists
  const existsResponse = await client.indices.exists({ index: 'documents' });
  if (existsResponse.body) {
    // Delete the index if it already exists
    await client.indices.delete({ index: 'documents' });
  }
  // Create the index with the required settings and mappings
  await client.indices.create({
    index: 'documents',
    body: {
      settings: { "index.knn": true },
      mappings: {
        properties: {
          embedding: {
            type: 'knn_vector',
            dimension: 3,
            similarity: 'cosine'
          },
          text: { type: 'text' },
          name: { type: 'text' }
        }
      }
    }
  });
}

/**
 * Generates an answer based on a provided prompt by:
 * - Validating the access token.
 * - Connecting to OpenSearch.
 * - Processing documents from the database.
 * - Generating and indexing embeddings.
 * - Performing a similarity search.
 * - Simulating an answer generation based on the search context.
 *
 * @param {Object} req - Express request object containing ACCESS_TOKEN_SECRET and prompt.
 * @param {Object} res - Express response object for sending the result.
 * @returns {Object} JSON response containing the generated answer or error details.
 */
async function generateFromPrompt(req, res) {
  try {
    // Extract access token and prompt from the request body
    const { ACCESS_TOKEN_SECRET: providedSecret, prompt } = req.body;
    console.log("Received generateFromPrompt request with prompt:", prompt);

    // Validate the access token against the expected secret
    if (providedSecret !== process.env.ACCESS_TOKEN_SECRET) {
      console.log("Unauthorized access attempt with secret:", providedSecret);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Initialize the OpenSearch client using AWS connector
    console.log("Using OPENSEARCH_URL:", process.env.OPENSEARCH_URL);
    const nodeUrl = process.env.OPENSEARCH_URL.trim();
    const connector = createConnector({
      node: nodeUrl,
      region: process.env.AWS_REGION,
    });
    const opensearchClient = new Client({
      node: nodeUrl,
      Connection: connector.Connection,
    });

    // Ensure the 'documents' index exists with the correct mapping
    console.log("Ensuring 'documents' index exists...");
    await ensureDocumentsIndex(opensearchClient);

    // Retrieve processed documents from the database
    const docs = await DocumentModel.find({ status: 'processed' });
    console.log(`Found ${docs.length} processed documents`);

    // Process each document: download and clean text data from S3
    for (const doc of docs) {
      console.log(`Processing document ${doc._id} (${doc.name})`);
      let text = '';
      // Download text using the available S3 key
      if (doc.textS3Key) {
        const buf = await downloadFileFromS3(doc.textS3Key);
        text = buf.toString('utf8');
      } else {
        const buf = await downloadFileFromS3(doc.s3Key);
        text = buf.toString('utf8');
      }
      // Clean the text by removing extra whitespace
      doc.cleanedText = text.replace(/\s+/g, ' ').trim();
      console.log(`Cleaned text (first 50 chars) for ${doc._id}:`, doc.cleanedText.substring(0, 50) + "...");
    }

    /**
     * Generates a simple three-dimensional embedding from the provided text.
     * The embedding is based on the average character code value.
     *
     * @param {string} text - The input text to generate an embedding for.
     * @returns {number[]} A three-dimensional embedding vector.
     */
    function generateEmbedding(text) {
      const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const avg = sum / (text.length || 1);
      return [avg, avg / 2, avg / 3];
    }

    // Generate embeddings for each document and index them into OpenSearch
    for (const doc of docs) {
      const embedding = generateEmbedding(doc.cleanedText || '');
      console.log(`Generated embedding for ${doc._id}:`, embedding);
      await opensearchClient.index({
        index: 'documents',
        id: doc._id.toString(),
        body: { embedding, text: doc.cleanedText, name: doc.name },
      });
      console.log(`Indexed document ${doc._id}`);
    }

    // Refresh the index to ensure all changes are searchable
    await opensearchClient.indices.refresh({ index: 'documents' });
    console.log("Refreshed 'documents' index");

    // Generate an embedding for the prompt for similarity search
    const queryEmbedding = generateEmbedding(prompt);
    console.log("Query embedding:", queryEmbedding);

    // Build the search payload using cosine similarity scoring
    const searchPayload = {
      size: 5,
      query: {
        script_score: {
          query: { match_all: {} },
          script: {
            source: "cosineSimilarity(params.queryVector, doc['embedding']) + 1.0",
            params: { queryVector: queryEmbedding },
          },
        },
      },
    };
    console.log("Executing search with payload:", JSON.stringify(searchPayload, null, 2));

    // Execute the search query
    const searchResponse = await opensearchClient.search({
      index: 'documents',
      body: searchPayload,
    });
    const retrievedDocs = searchResponse.body.hits.hits;
    console.log(`Retrieved ${retrievedDocs.length} documents from search`);

    // Combine the text from retrieved documents to form the context for answer generation
    const context = retrievedDocs.map(doc => doc._source.text).join('\n');
    console.log("Combined context (first 100 chars):", context.substring(0, 100) + "...");
    const finalPrompt = `Query: ${prompt}\nContext: ${context}\nAnswer:`;
    console.log("Final prompt for LLM:", finalPrompt);

    // Simulate an LLM response based on the final prompt (replace with actual LLM call as needed)
    const simulatedResponse = `Simulated answer based on prompt: ${finalPrompt}`;
    console.log("Generation completed successfully");
    
    return res.json({ answer: simulatedResponse });
  } catch (error) {
    // Log and return error details in case of failure
    console.error("Error in generateFromPrompt:", error);
    if (error.meta && error.meta.body) {
      console.error("Error details:", JSON.stringify(error.meta.body, null, 2));
    }
    return res.status(500).json({ error: 'Failed to generate answer', details: error.message });
  }
}

module.exports = { generateFromPrompt };
