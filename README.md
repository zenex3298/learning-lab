# Learning Lab Module 

## Overview

The Learning Lab Module is a RESTful API service that allows users to upload a variety of document types (up to 1GB), process them (text extraction, conversion, indexing, summarization), and update an LLM (via RAG or fine-tuning) with the extracted content. It stores metadata in MongoDB and files in AWS S3.

## Features

- **Document Upload & Storage**: Securely upload files and store them in AWS S3.
- **Processing Pipeline**: Extract text using OCR (Tesseract.js for images) or PDF parsing (pdf-parse), perform conversion, indexing, and summarization.
- **Metadata & Tagging**: Store and manage document metadata and tags in MongoDB.
- **Asynchronous Processing**: Utilize Bull and Redis for handling asynchronous processing.
- **API Endpoints**: Endpoints for uploading, checking status, tagging, searching, and deleting documents.
- **RAG Integration**: Processed text is stored in S3 and can be retrieved for use in a Retrieval-Augmented Generation (RAG) pipeline for an LLM.

## How It Works

### File Upload & S3 Key
The document is uploaded to S3 under the `docs/` folder (e.g., `docs/sample.pdf`).

### Text Extraction
After downloading the original file and extracting text, the code creates a new key by taking the original file’s key, removing its extension, and prepending the `text/` folder, then appending `.txt`. For example, if the original key is `docs/sample.pdf`, the text file key becomes `text/sample.txt`.

### Upload Extracted Text
The extracted text is converted to a UTF‑8 buffer and uploaded to S3 under the newly constructed key.

### Subsequent Processing
The code then continues with summarization, placeholder LLM integration, and updates the MongoDB record.

### Accessing Files on AWS for RAG

To access the extracted text files stored in S3 for Retrieval-Augmented Generation (RAG):

1. **List Available Processed Files**
   ```sh
   aws s3 ls s3://YOUR_S3_BUCKET/text/
   ```
   
2. **Download an Extracted Text File**
   ```sh
   aws s3 cp s3://YOUR_S3_BUCKET/text/<filename>.txt ./
   ```
   
3. **Retrieve a File's Content for LLM Input**
   ```sh
   aws s3api get-object --bucket YOUR_S3_BUCKET --key text/<filename>.txt output.txt
   cat output.txt
   ```
   
4. **Direct Programmatic Retrieval (Python Example)**
   ```python
   import boto3
   s3 = boto3.client('s3')
   bucket_name = "YOUR_S3_BUCKET"
   file_key = "text/sample.txt"
   response = s3.get_object(Bucket=bucket_name, Key=file_key)
   text_content = response['Body'].read().decode('utf-8')
   print(text_content)
   ```

## Setup

### Prerequisites

- **Node.js** (v14+)
- **MongoDB**
- **Redis**
- **AWS S3 Account** and corresponding credentials

### Installation

1. **Clone the Repository:**
   ```sh
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Install Dependencies:**
   ```sh
   npm install
   ```

3. **Create a .env File:**
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/learninglab
   AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
   AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
   AWS_REGION=us-east-1
   S3_BUCKET=YOUR_S3_BUCKET_NAME
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379
   ```

4. **Start MongoDB and Redis:**
   ```sh
   sudo service mongod start
   redis-server
   ```

5. **Run the Application:**
   ```sh
   node server.js
   ```

## API Endpoints

### `GET /`
Returns a welcome message.

### `POST /documents/upload`
Uploads a document.

**Expects a `multipart/form-data` request with:**

- `file`: the document file.
- `name`: (optional) a user-supplied document name (defaults to the file's original name if not provided).
- `tags`: (optional) a comma-separated string or array of tags.

### `POST /documents/:id/tags`
Adds or updates tags for the document identified by `:id`.

#### Request body (JSON):
```json
{ "tags": ["tag1", "tag2"] }
```

### `GET /documents/:id/status`
Retrieves the processing status and metadata for the document identified by `:id`.

### `GET /documents`
Searches documents by name and tags.

#### Example query:
```
GET /documents?name=My%20Document&tags=tag1,tag2
```

### `DELETE /documents/:id`
Deletes the document identified by `:id`.

## Testing with cURL

### Upload Document:
```sh
curl -X POST http://localhost:3000/documents/upload \
   -F "file=@/path/to/your/file.pdf" \
   -F "name=My Document" \
   -F "tags=tag1,tag2"
```

### Update Tags:
```sh
curl -X POST http://localhost:3000/documents/<documentId>/tags \
   -H "Content-Type: application/json" \
   -d '{"tags": ["newtag1", "newtag2"]}'
```

### Get Document Status:
```sh
curl http://localhost:3000/documents/<documentId>/status
```

### Search Documents:
```sh
curl "http://localhost:3000/documents?name=My%20Document&tags=tag1,tag2"
```

### Delete Document:
```sh
curl -X DELETE http://localhost:3000/documents/<documentId>
```
