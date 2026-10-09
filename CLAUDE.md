# CLAUDE.md

> This file is preloaded before each Claude Code session, acting like a system prompt. Claude Code prioritizes loading `CLAUDE.md` into working memory to quickly onboard project context.

## Project Context Discovery
- **Auto‑detection**: Before starting any task, Claude Code must scan the project root for existing files (e.g., `package.json`, `README.md`, `requirements.txt`, `Cargo.toml`, `pom.xml`, `.gitignore`, etc.) to infer the tech stack, project type, and existing conventions.
- **If insufficient info**: Ask the user for clarification (e.g., “What is the main goal of this project?” or “Which test framework do you prefer?”) before proceeding.
- **Dynamic updates**: Treat this file as a living guide – it may be updated by the user or by AI (with user approval) as the project evolves.

---

## Working Standards (Default – Adjust Based on Project Context)
- **Code Style**: Follow the community‑standard style for the detected language (e.g., PEP8 for Python, StandardJS for JavaScript, gofmt for Go).
- **Testing**: Use the most common testing framework for the detected language (e.g., pytest, jest, mocha, go test). Aim for meaningful coverage rather than a fixed percentage.
- **Documentation**: Keep `README.md` current. Document public APIs using the language’s standard docstring format. Update a `CHANGELOG.md` for notable changes.
- **Version Control**: Commit messages should follow `<type>: <description>` (e.g., `feat: add user login`). Never push directly to `main` – use pull requests. Run linters and tests before every commit.

---

## Collaboration Framework: Playbooks & Scripts

All tasks must be executed using the **two‑layer framework**:

- **Playbooks (Orchestration Layer)** – define the **what** and **why**. Each playbook is a Markdown file in `/playbooks/` and must include the following five sections:

```markdown
# Playbook: [Task Name]

## Purpose
[What changes after execution – describe the outcome, not the process]

## Prerequisites
[Files, environment variables, dependencies – abort before steps if anything is missing]

## Steps
[List actions in order, referencing corresponding Scripts]

## Expected Outcome
[Clear final output or state]

## Rollback Plan
[How to revert to the initial state if something fails]

### Directory Structure
project-root/
├── CLAUDE.md # This file
├── playbooks/ # Orchestration: Playbook definitions (Markdown)
├── scripts/ # Execution: Deterministic scripts (.sh/.py)
├── src/ # Source code
├── tests/ # Test files
└── .tmp/ # Temporary files (intermediate artifacts, not committed)
