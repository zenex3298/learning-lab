# **Setup and Deployment Guide for learning-labs-demo1**

This guide walks you through setting up and deploying your application with **AWS Elastic Beanstalk (EB)** using **Node.js 22** and configuring **MongoDB Atlas** access.

---

## **Step 1: Install Required Command-Line Tools**

Ensure you have the following CLI tools installed:

```bash
brew install awscli awsebcli mongocli
```

---

## **Step 2: Log in to AWS and MongoDB**

Authenticate with AWS:

```bash
aws configure
```

Authenticate with MongoDB Atlas:

```bash
mongocli auth login
```

---

## **Step 3: Define Essential Variables**

```bash
REGION=us-east-1
PROJECT_NAME=learning-labs-demo
DOCUMENT_PATH="/path/to/your/file"
AWS_ACCESS_KEY_ID="YOUR_AWS_ACCESS_KEY"
AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET_KEY"
AWS_REGION="$REGION"
S3_BUCKET="${PROJECT_NAME}--bucket"
CLOUDFRONT_URL="https://d1ob5sgwgyt044.cloudfront.net"
REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"
ACCESS_TOKEN_SECRET="test-secret"
NODE_ENV="production"
```

---

## **Step 4: Create a MongoDB Atlas Cluster**

```bash
atlas clusters create $PROJECT_NAME-cluster \
  --provider AWS \
  --region $REGION \
  --members 3 \
  --tier M10 \
  --mdbVersion 5.0 \
  --diskSizeGB 10
```

Retrieve the connection string:

```bash
atlas clusters list
```

Update the environment variable:

```bash
MONGODB_URI="your_connection_string"
```

---

## **Step 5: Create an AWS S3 Bucket**

```bash
aws s3api create-bucket --bucket $S3_BUCKET --region $REGION
```

Set bucket policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$S3_BUCKET/*"
    }
  ]
}
```

Apply the policy:

```bash
aws s3api put-bucket-policy --bucket $S3_BUCKET --policy file://bucket-policy.json
```

---

## **Step 6: Initialize and Deploy Elastic Beanstalk**

Initialize the EB application:

```bash
eb init $PROJECT_NAME --region $REGION -p "Node.js 22"
```

Create the EB environment:

```bash
eb create $PROJECT_NAME --region $REGION -p "Node.js 22"
```

---

## **Step 7: Set Environment Variables in Elastic Beanstalk**

```bash
eb setenv PORT=8080 \
MONGODB_URI="$MONGODB_URI" \
AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
AWS_REGION="$AWS_REGION" \
S3_BUCKET="$S3_BUCKET" --bucket \
CLOUDFRONT_URL="$CLOUDFRONT_URL" \
REDIS_HOST="$REDIS_HOST" \
REDIS_PORT="$REDIS_PORT" \
ACCESS_TOKEN_SECRET="$ACCESS_TOKEN_SECRET" \
NODE_ENV="$NODE_ENV"
```

---

## **Step 8: Configure MongoDB Atlas Access List**

```bash
atlas accessList create "$(aws ec2 describe-instances --instance-ids $(aws elasticbeanstalk describe-environment-resources --environment-name $PROJECT_NAME --query 'EnvironmentResources.Instances[*].Id' --output text) --query 'Reservations[*].Instances[*].PublicIpAddress' --output text)/32" --comment "Allow EB instance"
```

---

## **Step 9: Upload and Test API Endpoints**

Upload a file:

```bash
curl -X POST "http://$(eb status | grep 'CNAME:' | awk '{print $2}')/documents/upload/" \
-F "file=@${DOCUMENT_PATH}" \
-F "name=$(basename "${DOCUMENT_PATH}" | cut -d. -f1)" \
-F "tags=$(basename "${DOCUMENT_PATH}" | awk -F. '{print $NF}'),document"
```