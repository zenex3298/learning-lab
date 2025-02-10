/**
 * server.js
 * Entry point that initializes Express, connects to MongoDB,
 * and sets up the routes & queue worker.
 */

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const { initQueueWorker } = require('./services/docProcessingQueue');
const documentRoutes = require('./routes/documentRoutes');

async function initLearningLabModule() {
  // 1. Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI);

  // 2. Initialize Express
  const app = express();
  app.use(express.json());

  // 3. Add a home route for the root path
  app.get('/', (req, res) => {
    res.send('Welcome to the Learning Lab Module API');
  });

  // 4. Attach Routes
  app.use('/documents', documentRoutes);

  // 5. Initialize Queue Worker
  initQueueWorker();

  // 6. Start Server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Learning Lab Module running on port ${PORT}`);
  });
}

// Optionally, start the module immediately:
initLearningLabModule();

module.exports = { initLearningLabModule };
