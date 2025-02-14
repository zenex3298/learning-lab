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
console.log("Mongo URI:", process.env.MONGODB_URI);
const express = require('express');
const mongoose = require('mongoose');
const { initQueueWorker } = require('./services/docProcessingQueue');
const documentRoutes = require('./routes/documentRoutes');
const authenticateToken = require('./middleware/authMiddleware');

async function initLearningLabModule() {
  // Connect to MongoDB using the URI from environment variables.
  await mongoose.connect(process.env.MONGODB_URI, {
    tls: true,
  });

  // Initialize Express and configure middleware.
  const app = express();
  app.use(express.json());

  // Initialize Test User
  app.use((req, res, next) => {
    req.user = { _id: 'test-user-id' };
    next();
  });

  // Home route to confirm API is running.
  app.get('/', (req, res) => {
    res.send('Welcome to the Learning Lab Module API');
  });

  // Attach document routes under the '/documents' endpoint.
  app.use('/documents', documentRoutes);

  // Initialize the asynchronous document processing queue worker.
  initQueueWorker();

  // Start the server on the defined PORT or default to 8080.
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Immediately start the module.
initLearningLabModule();

module.exports = { initLearningLabModule };
