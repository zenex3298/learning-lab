#!/bin/bash

FILES=(
  "/Users/Mike/Desktop/upwork/3) current projects/Learning Lab/sample_documents/docs/athlete_goals.txt"
  "/Users/Mike/Desktop/upwork/3) current projects/Learning Lab/sample_documents/docs/diet_exercise_log.txt"
  "/Users/Mike/Desktop/upwork/3) current projects/Learning Lab/sample_documents/docs/diet_nutrition.txt"
  "/Users/Mike/Desktop/upwork/3) current projects/Learning Lab/sample_documents/docs/healthcare_basics.txt"
  "/Users/Mike/Desktop/upwork/3) current projects/Learning Lab/sample_documents/docs/mental_health.txt"
  "/Users/Mike/Desktop/upwork/3) current projects/Learning Lab/sample_documents/docs/sports_injury_recovery.txt"
)

for FILE_PATH in "${FILES[@]}"; do
  curl -X POST "http://localhost:8080/documents/upload/" \
    -F "file=@${FILE_PATH}" \
    -F "name=$(basename "${FILE_PATH}" | cut -d. -f1)" \
    -F "tags=$(basename "${FILE_PATH}" | awk -F. '{print $NF}'),document"
done
