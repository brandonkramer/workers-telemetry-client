# Releasing

This project uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning and [conventional commits](https://www.conventionalcommits.org/) enforced by commitlint + husky.

## Commit format

Every commit message must follow the conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

### Types

| Type       | Description                          | Version bump |
|------------|--------------------------------------|--------------|
| `feat`     | New feature                          | Minor        |
| `fix`      | Bug fix                              | Patch        |
| `docs`     | Documentation only                   | None         |
| `style`    | Formatting, whitespace               | None         |
| `refactor` | Code change that neither fixes nor adds | None      |
| `perf`     | Performance improvement              | Patch        |
| `test`     | Adding or updating tests             | None         |
| `build`    | Build system or dependencies         | None         |
| `ci`       | CI configuration                     | None         |
| `chore`    | Maintenance tasks                    | None         |
| `revert`   | Reverts a previous commit            | Patch        |

### Breaking changes

Add `BREAKING CHANGE:` in the commit footer to trigger a major version bump:

```
feat(client): remove queryLogs method

BREAKING CHANGE: queryLogs has been removed, use queryEvents with parseEvents instead
```

Or use `!` after the type:

```
feat(client)!: remove queryLogs method
```

### Examples

```
feat(query-builder): add p75 percentile calculation
fix(client): handle empty response body on 204
docs: update pagination example in README
test(errors): add coverage for unknown status codes
chore: update tsup to v9
```

## Git hooks

Husky runs two hooks locally:

- **commit-msg** — validates your commit message against conventional commit format via commitlint
- **pre-commit** — runs `npm test` before each commit

If a commit is rejected, fix the message format and retry.

## CI/CD

### CI (`.github/workflows/ci.yml`)

Runs on every push and PR to `main`:

1. Tests across Node 18, 20, 22
2. Type checking (`npm run typecheck`)
3. Test suite (`npm test`)
4. Build (`npm run build`)

### Release (`.github/workflows/release.yml`)

Runs automatically after CI passes on `main`:

1. Analyzes all commits since the last release
2. Determines the next version based on commit types
3. Generates/updates `CHANGELOG.md`
4. Publishes to npm
5. Creates a GitHub release with release notes
6. Commits the updated `CHANGELOG.md`, `package.json`, and `package-lock.json`

## Setup

### GitHub repository secrets

Add these in **Settings > Secrets and variables > Actions**:

| Secret      | How to get it                                              |
|-------------|------------------------------------------------------------|
| `NPM_TOKEN` | `npm token create --type=automation` (requires npm login) |

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

### First release

semantic-release determines the next version from commits. Since the current version is `0.1.0`, the first `feat:` commit after setup will publish `0.2.0`, and the first `fix:` commit will publish `0.1.1`.

To start from `1.0.0`, either:
- Push a commit with `feat!: initial stable release` or a `BREAKING CHANGE:` footer
- Or set `"version": "1.0.0"` in `package.json` before the first release and use a `feat:` commit

### Manual release (local)

```bash
NPM_TOKEN=<token> GITHUB_TOKEN=<token> npm run release
```

This is rarely needed — prefer letting CI handle releases.
