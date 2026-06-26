#!/bin/bash
SKIP_UNTIL=$(cat .github/.skip-until 2>/dev/null | tr -d '[:space:]')

write_output() {
  echo "$1"
  if [ -n "$GITHUB_OUTPUT" ]; then
    echo "$1" >> "$GITHUB_OUTPUT"
  fi
}

if [ -z "$SKIP_UNTIL" ]; then
  write_output "skip=false"
else
  CURRENT_EPOCH=$(date +%s)

  if [[ "$OSTYPE" == "darwin"* ]]; then
    TARGET_EPOCH=$(date -j -f "%Y-%m-%d" "$SKIP_UNTIL" +%s 2>/dev/null)
  else
    TARGET_EPOCH=$(date -d "$SKIP_UNTIL" +%s 2>/dev/null)
  fi

  if [ -z "$TARGET_EPOCH" ]; then
    echo "Invalid date in .skip-until: $SKIP_UNTIL"
    write_output "skip=false"
  elif [ $CURRENT_EPOCH -lt $TARGET_EPOCH ]; then
    echo "Skipped until $SKIP_UNTIL"
    write_output "skip=true"
  else
    write_output "skip=false"
  fi
fi
