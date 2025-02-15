# Setup and Deployment Guide for learning-labs-demo1

This guide walks you through setting up and deploying your application with AWS Elastic Beanstalk (EB) using Node.js 22 and configuring MongoDB Atlas access.

## Prerequisites

### AWS CLI  
Install and configure [AWS CLI](https://aws.amazon.com/cli/):

```bash
aws configure
```

Ensure your AWS credentials are correctly configured via `aws configure`.

### EB CLI  
Install the Elastic Beanstalk CLI:

```bash
brew install awsebcli
```

### MongoDB CLI  
Install MongoDB CLI:

```bash
brew tap mongodb/brew && brew install mongocli
```

Then, log in to your MongoDB Atlas account:

```bash
mongocli auth login
```

## Step 1: Initialize the Elastic Beanstalk Application

Run the following command to initialize your EB application with Node.js 22:

```bash
eb init learning-labs-demo1 --region us-east-1 -p "Node.js 22"
```

**Pre-steps:** AWS CLI and EB CLI must be installed and configured.

## Step 2: Create the Elastic Beanstalk Environment

Create your environment with:

```bash
eb create learning-labs-demo1 --region us-east-1 -p "Node.js 22"
```

**Pre-steps:** Ensure AWS configuration is in place.

## Step 3: Set Environment Variables

Set the required environment variables for your application:

```bash
eb setenv PORT=8080 \
MONGODB_URI="mongodb+srv://zenex3298:6DTFSkKLxuDqRs5U@learninglabs.bbj2u.mongodb.net/documents?retryWrites=true&w=majority&tls=true" \
AWS_ACCESS_KEY_ID=AKIATG6MGQZM23JWMCUX \
AWS_SECRET_ACCESS_KEY=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 \
AWS_REGION=us-east-1 \
S3_BUCKET=learning-lab-demo1 --bucket \
CLOUND_FRONT_URL=https://d1ob5sgwgyt044.cloudfront.net \
REDIS_HOST=127.0.0.1 \
REDIS_PORT=6379 \
ACCESS_TOKEN_SECRET=test-secret \
NODE_ENV=production
```

**Pre-steps:** Ensure AWS is configured and consider secure handling of sensitive information.

## Step 4: Configure MongoDB Atlas Access List

Allow your EB instance to access MongoDB Atlas by running:

```bash
atlas accessList create "$(aws ec2 describe-instances --instance-ids $(aws elasticbeanstalk describe-environment-resources --environment-name learning-labs-demo --query 'EnvironmentResources.Instances[*].Id' --output text) --query 'Reservations[*].Instances[*].PublicIpAddress' --output text)/32" --comment "Allow EB instance"
```

**Pre-steps:** Ensure MongoDB CLI is installed and logged in, and AWS CLI is configured.
