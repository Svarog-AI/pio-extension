# Detect and block tool calls issued from within thinking blocks

## Problem

Sometimes agents emit tool call syntax (e.g., XML-style function tags or JSON) inside their thinking/reasoning blocks, where the model is speculating about what to do rather than committing to an action. If these are parsed and executed by mistake, it causes spurious side effects: unintended file writes, commands running with wrong arguments, sessions launching prematurely.

## Proposed solution

Detect when tool-call syntax appears inside a thinking/reasoning block and either:

1. **Strict:** Strip or reject tool calls found within thinking blocks before parsing. Only parse tool calls from outside thinking regions.
2. **Warning:** Log a warning when tool-call-like patterns appear in thinking, alert the user, but allow execution (less disruptive during rollout).
3. **Validation gate:** In the `tool_call` event handler, check if the preceding message segment was inside a thinking block and reject/block with an explanation.

## Scope question

This is likely a pi core concern — tool-call parsing happens at the framework level, not in extensions. However, it's worth tracking here to coordinate with any upstream proposal.

## Category

improvement

## Context

Related to detect-agent-refinement-loops.md — both are about unwanted agent behavior that wastes time or causes side effects. Tool calls in thinking blocks have been observed occasionally; exact frequency and impact TBD.
