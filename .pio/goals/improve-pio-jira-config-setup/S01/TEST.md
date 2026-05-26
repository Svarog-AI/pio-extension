# Tests: setup-config.sh

Verifies that the POSIX shell script creates `.pio/jira-config.yaml` with correct YAML content (site, projectKey, defaultType), handles argument validation, supports custom default types, and is idempotent.

## Unit Tests

Given a valid site and project key when the script runs then it creates .pio/jira-config.yaml with site, projectKey, and defaultType "Task".
Given a site, project key, and custom default type when the script runs then the YAML file contains the custom defaultType.
Given no arguments when the script runs then it exits with a non-zero code and prints usage to stderr.
Given an empty site when the script runs then it exits with a non-zero code.
Given a site but no project key when the script runs then it exits with a non-zero code.
Given the script runs twice with the same arguments then the output file is identical (idempotent overwrite).
Given a project key with hyphens when the script runs then the YAML file contains the hyphenated key correctly.
Given .pio directory does not exist when the script runs then it creates the directory before writing the file.
Given the script succeeds when it completes then it prints a confirmation message to stdout.
Given the script has a POSIX shebang when the file is read then the first line is #!/bin/sh.
Given the script file exists when its permissions are checked then it has the executable bit set.

## Programmatic Verification

Given the TypeScript project when npm run check is run then it exits with code 0.
