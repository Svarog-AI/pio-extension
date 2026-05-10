# Add pi-ask-user as a dependency of this extension

## Summary

The `pi-ask-user` extension provides the `ask-user` skill, which streamlines decision handshakes with the user before high-stakes architectural decisions or irreversible changes. This extension should be added as a dependency so the skill is available to all pio sub-sessions automatically.

## Current state

`package.json` has no runtime dependencies beyond the pi SDK and typebox:

```json
"devDependencies": {
  "@earendil-works/pi-coding-agent": "^0.74.0",
  "typebox": "^1.1.24",
  "typescript": "^5.8.0"
}
```

## Required changes

1. Add `pi-ask-user` to `package.json` dependencies (or devDependencies, following the existing convention).
2. Ensure the extension is loaded/registered so the `ask-user` skill is available in sub-sessions launched by pio capabilities.
3. Update any relevant documentation (README.md) if this changes the installation or setup requirements.

## Location of pi-ask-user

Globally installed at: `/home/aleksj/.nvm/versions/node/v22.18.0/lib/node_modules/pi-ask-user`

The skill is registered at: `/home/aleksj/.nvm/versions/node/v22.18.0/lib/node_modules/pi-ask-user/skills/ask-user/SKILL.md`

## Category

improvement

## Context

Related skill: ask-user (/home/aleksj/.nvm/versions/node/v22.18.0/lib/node_modules/pi-ask-user/skills/ask-user/SKILL.md). This skill is already listed in the available skills for this session, indicating pi-ask-user is installed globally but not declared as a project dependency.
