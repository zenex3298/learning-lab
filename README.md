# Learning Lab Module

## Overview

The Learning Lab Module is a RESTful API service that allows users to upload a variety of document types (up to 1GB), process them (text extraction, conversion, indexing, summarization, and moderation), and update an LLM (via RAG or fine-tuning) with the extracted content. It stores metadata in MongoDB and files in AWS S3.

## Features

- **Document Upload & Storage**: Securely upload files and store them in AWS S3.
- **Processing Pipeline**: Extract text using AWS Textract (images), AWS Transcribe (audio/video), PDF parsing (pdf-parse), Excel (xlsx), Word (mammoth), and CSV processing.
- **Metadata & Tagging**: Store and manage document metadata and tags in MongoDB.
- **Asynchronous Processing**: Utilize Bull and Redis for handling asynchronous processing.
- **Content Moderation**: Uses AWS Rekognition to detect inappropriate content in images and videos before storing them.
- **API Endpoints**: Endpoints for uploading, checking status, tagging, searching, and deleting documents.
- **RAG Integration**: Processed text is stored in S3 and can be retrieved for use in a Retrieval-Augmented Generation (RAG) pipeline for an LLM.

## How It Works

### File Upload & S3 Key
The document is uploaded to S3 under the `docs/` folder (e.g., `docs/sample.pdf`).

### Text Extraction & Moderation
- AWS Textract extracts text from images.
- AWS Transcribe processes audio/video files into text.
- Rekognition moderates image and video content for inappropriate materials before allowing storage.

### Upload Extracted Text
The extracted text is converted to a UTF‑8 buffer and uploaded to S3 under the `text/` folder.

### Subsequent Processing
- Summarization
- LLM integration
- Metadata updates in MongoDB

### Accessing Files on AWS for RAG
To access extracted text files stored in S3 for Retrieval-Augmented Generation (RAG):

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

### AWS Configuration

Before running the application, configure your AWS credentials and set up an IAM user with the necessary policies.

```sh
# Configure AWS CLI (replace placeholders with your actual credentials)
aws configure set aws_access_key_id YOUR_ACCESS_KEY_ID
aws configure set aws_secret_access_key YOUR_SECRET_ACCESS_KEY
aws configure set default.region YOUR_DEFAULT_REGION

# Verify AWS credentials
aws sts get-caller-identity

# Create a new IAM user (replace testUser with your desired username)
aws iam create-user --user-name testUser

# Attach AWS managed policies to the new user
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AdministratorAccess-AWSElasticBeanstalk
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AmazonEC2FullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AmazonRekognitionFullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AmazonTextractFullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AmazonTranscribeFullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AWSCodeCommitFullAccess
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier
aws iam attach-user-policy --user-name testUser --policy-arn arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier
```

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
   ACCESS_TOKEN_SECRET=test-secret
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

