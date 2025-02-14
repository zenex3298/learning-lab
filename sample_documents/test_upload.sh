#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
scriptName=$(basename "$0")

# Set the endpoint to your EB environment CNAME
domain="http://learning-labs-demo5.eba-pnqceuvt.us-east-1.elasticbeanstalk.com"
#"http://localhost:3000"

endpoint="$domain/documents/upload/"

echo "Using endpoint: $endpoint"

for file in "$DIR"/*; do
  [ -f "$file" ] || continue
  filename=$(basename "$file")
  if [ "$filename" == "$scriptName" ]; then
    continue
  fi
  name="${filename%.*}"
  extension="${filename##*.}"
  curl -X POST "$endpoint" \
    -F "file=@${file}" \
    -F "name=${name}" \
    -F "tags=${extension},document"
done
