#!/bin/sh
# setup-config.sh — Create .pio/jira-config.yaml for pio-jira skill
# Usage: setup-config.sh PROJECT_KEY [DEFAULT_TYPE]

PROJECT_KEY="$1"
DEFAULT_TYPE="${2:-Task}"

if [ -z "$PROJECT_KEY" ]; then
  printf "Usage: setup-config.sh PROJECT_KEY [DEFAULT_TYPE]\n" >&2
  exit 1
fi

# Create .pio directory if it doesn't exist
if ! mkdir -p .pio; then
  printf "Error: failed to create .pio directory\n" >&2
  exit 1
fi

# Write YAML config (idempotent — overwrites silently)
if ! printf 'projectKey: "%s"\ndefaultType: "%s"\n' "$PROJECT_KEY" "$DEFAULT_TYPE" > .pio/jira-config.yaml; then
  printf "Error: failed to write .pio/jira-config.yaml\n" >&2
  exit 1
fi

printf "Created .pio/jira-config.yaml with projectKey=%s\n" "$PROJECT_KEY"
exit 0
