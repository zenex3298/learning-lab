// controllers/generateController.js
async function generateFromPrompt(req, res) {
  try {
    const { ACCESS_TOKEN_SECRET: providedSecret, prompt } = req.body;
    if (providedSecret !== process.env.ACCESS_TOKEN_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const DocumentModel = require('../models/documentModel');
    const { downloadFileFromS3 } = require('../services/s3Service');
    const { Client } = require('@opensearch-project/opensearch');
    const opensearchClient = new Client({ node: process.env.OPENSEARCH_URL });

    // Ingest & Preprocess: fetch processed documents and clean text.
    const docs = await DocumentModel.find({ status: 'processed' });
    for (const doc of docs) {
      let text = '';
      if (doc.textS3Key) {
        const buf = await downloadFileFromS3(doc.textS3Key);
        text = buf.toString('utf8');
      } else {
        const buf = await downloadFileFromS3(doc.s3Key);
        text = buf.toString('utf8');
      }
      doc.cleanedText = text.replace(/\s+/g, ' ').trim();
    }

    // Dummy embedding function.
    function generateEmbedding(text) {
      const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const avg = sum / (text.length || 1);
      return [avg, avg / 2, avg / 3];
    }

    // Embed & Index: compute embeddings and index into OpenSearch.
    for (const doc of docs) {
      const embedding = generateEmbedding(doc.cleanedText || '');
      await opensearchClient.index({
        index: 'documents',
        id: doc._id.toString(),
        body: { embedding, text: doc.cleanedText, name: doc.name },
      });
    }
    await opensearchClient.indices.refresh({ index: 'documents' });

    // Retrieve: compute query embedding and perform similarity search.
    const queryEmbedding = generateEmbedding(prompt);
    const searchResponse = await opensearchClient.search({
      index: 'documents',
      body: {
        size: 5,
        query: {
          script_score: {
            query: { match_all: {} },
            script: {
              source: "cosineSimilarity(params.queryVector, 'embedding') + 1.0",
              params: { queryVector: queryEmbedding },
            },
          },
        },
      },
    });
    const retrievedDocs = searchResponse.body.hits.hits;

    // Generate: combine prompt with retrieved context and simulate an AWS LLM call.
    const context = retrievedDocs.map(doc => doc._source.text).join('\n');
    const finalPrompt = `Query: ${prompt}\nContext: ${context}\nAnswer:`;
    const simulatedResponse = `Simulated answer based on prompt: ${finalPrompt}`;

    return res.json({ answer: simulatedResponse });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to generate answer' });
  }
}

module.exports = { generateFromPrompt };
