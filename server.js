/**
 * server.js
 * -----------------------------------------------------------------------------
 * Entry point for the Learning Lab Module API.
 *
 * - Loads environment variables.
 * - Connects to MongoDB.
 * - Initializes the Express application.
 * - Sets up routes and asynchronous queue worker.
 * - Starts the server.
 * -----------------------------------------------------------------------------
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { initQueueWorker } = require('./services/docProcessingQueue');
const documentRoutes = require('./routes/documentRoutes');

async function initLearningLabModule() {
  // Connect to MongoDB using the URI from environment variables.
  await mongoose.connect(process.env.MONGODB_URI);

  // Initialize Express and configure middleware.
  const app = express();
  app.use(express.json());

  // Home route to confirm API is running.
  app.get('/', (req, res) => {
    res.send('Welcome to the Learning Lab Module API');
  });

  // Attach document routes under the '/documents' endpoint.
  app.use('/documents', documentRoutes);

  // Initialize the asynchronous document processing queue worker.
  initQueueWorker();

  // Start the server on the defined PORT or default to 3000.
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Learning Lab Module running on port ${PORT}`);
  });
}

// Immediately start the module.
initLearningLabModule();

module.exports = { initLearningLabModule };
