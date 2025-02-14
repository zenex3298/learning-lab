#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
scriptName=$(basename "$0")

# Set the endpoint to your EB environment CNAME
endpoint="http://learning-lab.eba-db3tqpp8.us-east-1.elasticbeanstalk.com/documents/upload" #http://localhost:3000/documents/upload \

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
