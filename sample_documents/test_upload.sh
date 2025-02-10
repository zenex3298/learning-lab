#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
scriptName=$(basename "$0")

for file in "$DIR"/*; do
  [ -f "$file" ] || continue
  filename=$(basename "$file")
  if [ "$filename" == "$scriptName" ]; then
    continue
  fi
  name="${filename%.*}"
  extension="${filename##*.}"
  curl -X POST http://localhost:3000/documents/upload \
    -F "file=@${file}" \
    -F "name=${name}" \
    -F "tags=${extension},document"
done
