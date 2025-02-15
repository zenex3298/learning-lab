// tests/LearningLab.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Mock S3 and Bull queue to avoid real AWS calls
jest.mock('../services/s3Service', () => ({
  uploadFileToS3: jest.fn().mockResolvedValue(),
  downloadFileFromS3: jest.fn().mockResolvedValue(Buffer.from('dummy text')),
  deleteFileFromS3: jest.fn().mockResolvedValue(),
}));

jest.mock('../services/docProcessingQueue', () => ({
  docProcessQueue: { add: jest.fn().mockResolvedValue() },
  initQueueWorker: jest.fn(),
}));

jest.mock('aws-opensearch-connector', () => {
  return function createConnector(options) {
    return { Connection: class DummyConnection {} };
  };
});

// Mock OpenSearch client used in generateController
jest.mock('@opensearch-project/opensearch', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      indices: {
        exists: jest.fn().mockResolvedValue({ body: false }),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        refresh: jest.fn().mockResolvedValue({}),
      },
      index: jest.fn().mockResolvedValue({}),
      search: jest.fn().mockResolvedValue({
        body: {
          hits: {
            hits: [
              { _source: { text: 'Dummy text for generation', name: 'Dummy Doc' } },
            ]
          }
        }
      }),
    })),
  };
});

// Ensure necessary env vars are set for tests
process.env.S3_BUCKET = process.env.S3_BUCKET || "dummy-bucket";
process.env.OPENSEARCH_URL = process.env.OPENSEARCH_URL || "http://dummy-opensearch";
process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
process.env.ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "test-secret";

const documentRoutes = require('../routes/documentRoutes');
const generateRoutes = require('../routes/generateRoutes');

let app;
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = express();
  app.use(express.json());
  // Inject a dummy test user
  app.use((req, res, next) => {
    req.user = { _id: 'test-user-id' };
    next();
  });
  app.get('/', (req, res) => res.send('Welcome to the Learning Lab Module API'));
  app.use('/documents', documentRoutes);
  app.use('/generate', generateRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('Learning Lab API Endpoints', () => {
  describe('GET / (Home)', () => {
    it('should return a welcome message', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Welcome to the Learning Lab Module API');
    });
  });

  describe('POST /documents/upload', () => {
    it('should return 400 if no file provided', async () => {
      const res = await request(app)
        .post('/documents/upload')
        .field('name', 'testfile');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No file provided.');
    });

    it('should upload a file successfully', async () => {
      const buffer = Buffer.from('dummy file content');
      const res = await request(app)
        .post('/documents/upload')
        .attach('file', buffer, 'dummy.txt')
        .field('name', 'dummy')
        .field('tags', 'test,dummy');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('File uploaded successfully');
      expect(res.body).toHaveProperty('documentId');
      expect(res.body).toHaveProperty('s3Uri');
    });
  });

  describe('POST /documents/:id/tags', () => {
    it('should return 404 if document not found', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post(`/documents/${fakeId}/tags`)
        .send({ tags: 'tag1,tag2' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found.');
    });

    it('should update tags for an existing document', async () => {
      const buffer = Buffer.from('dummy file content');
      const uploadRes = await request(app)
        .post('/documents/upload')
        .attach('file', buffer, 'dummy.txt')
        .field('name', 'dummy')
        .field('tags', 'oldtag');
      const docId = uploadRes.body.documentId;
      const res = await request(app)
        .post(`/documents/${docId}/tags`)
        .send({ tags: ['newtag1', 'newtag2'] });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Tags updated.');
      expect(res.body.document.tags).toEqual(['newtag1', 'newtag2']);
    });
  });

  describe('GET /documents/:id/status', () => {
    it('should return 404 if document not found', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/documents/${fakeId}/status`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found.');
    });

    it('should return document status if found', async () => {
      const buffer = Buffer.from('dummy file content');
      const uploadRes = await request(app)
        .post('/documents/upload')
        .attach('file', buffer, 'dummy.txt')
        .field('name', 'dummy')
        .field('tags', 'oldtag');
      const docId = uploadRes.body.documentId;
      const res = await request(app).get(`/documents/${docId}/status`);
      expect(res.status).toBe(200);
      expect(res.body.document).toHaveProperty('_id', docId);
    });
  });

  describe('GET /documents (Search)', () => {
    it('should return an empty array if no documents exist', async () => {
      const res = await request(app).get('/documents');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.documents)).toBe(true);
      expect(res.body.documents.length).toBe(0);
    });

    it('should return documents matching search criteria', async () => {
      const buffer = Buffer.from('dummy file content');
      await request(app)
        .post('/documents/upload')
        .attach('file', buffer, 'dummy1.txt')
        .field('name', 'Test Document One')
        .field('tags', 'fitness,workout');
      await request(app)
        .post('/documents/upload')
        .attach('file', buffer, 'dummy2.txt')
        .field('name', 'Another Test Document')
        .field('tags', 'nutrition,health');
      const res = await request(app)
        .get('/documents')
        .query({ name: 'Test' });
      expect(res.status).toBe(200);
      expect(res.body.documents.length).toBeGreaterThan(0);
      expect(res.body.documents.some(doc => doc.name.includes('Test'))).toBe(true);
    });
  });

  describe('DELETE /documents/:id', () => {
    it('should return 404 if document not found', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).delete(`/documents/${fakeId}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found.');
    });

    it('should delete a document if it exists', async () => {
      const buffer = Buffer.from('dummy file content');
      const uploadRes = await request(app)
        .post('/documents/upload')
        .attach('file', buffer, 'dummy.txt')
        .field('name', 'dummy')
        .field('tags', 'oldtag');
      const docId = uploadRes.body.documentId;
      const res = await request(app).delete(`/documents/${docId}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Document deleted successfully.');
    });
  });

  describe('POST /documents/generate', () => {
    it('should return 401 if secret is incorrect', async () => {
      const res = await request(app)
        .post('/documents/generate')
        .send({ ACCESS_TOKEN_SECRET: 'wrong-secret', prompt: 'Test prompt' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should generate an answer with a correct secret and prompt', async () => {
      // Insert a dummy processed document
      const Document = mongoose.model('Document');
      const dummyDoc = await Document.create({
        userId: 'test-user-id',
        name: 'Dummy Doc',
        filename: 'dummy.txt',
        fileType: 'text/plain',
        s3Key: 'dummy.txt',
        tags: ['test'],
        status: 'processed',
      });
      dummyDoc.cleanedText = 'This is dummy text for testing';
      await dummyDoc.save();
      const res = await request(app)
        .post('/documents/generate')
        .send({ ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET, prompt: 'What is this?' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('answer');
      expect(typeof res.body.answer).toBe('string');
    });
  });
});
