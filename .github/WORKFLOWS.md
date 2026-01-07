# GitHub Actions Workflows

This repository uses GitHub Actions for CI/CD automation.

## Workflows

### 1. CI Workflow (`ci.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Purpose:**
- Runs on Node.js versions 18.x, 20.x, and 22.x
- Installs dependencies
- Runs linting (if configured)
- Builds the TypeScript project
- Runs tests (if configured)
- Validates the package can be packed

**Status:** Runs automatically on every push and PR

---

### 2. Release Workflow (`release.yml`)

**Triggers:**
- Push to `main` branch
- Only when changes are made to:
  - `src/**` files
  - `package.json`
  - `package-lock.json`

**Purpose:**
- Automatically creates GitHub releases and publishes to npm
- Checks if the version in `package.json` has already been released
- Creates a new GitHub release with the version tag
- Publishes the package to npm with provenance

**Requirements:**
- `NPM_TOKEN` secret must be set in repository settings
- Version must be bumped in `package.json` before pushing

**How to use:**
1. Update version in `package.json`: `npm version patch|minor|major`
2. Push to main: `git push --follow-tags`
3. Workflow automatically creates release and publishes to npm

---

### 3. Publish Workflow (`publish.yml`)

**Triggers:**
- Manual workflow dispatch (can be triggered from GitHub UI)
- GitHub release creation

**Purpose:**
- Manually publish to npm with optional version bump
- Can be used for hotfixes or manual releases

**Parameters:**
- `version` (optional): Version to publish (e.g., "0.3.1", "0.4.0", "1.0.0")
  - If provided, bumps version, creates git tag, and pushes
  - If empty, uses current `package.json` version

**Requirements:**
- `NPM_TOKEN` secret must be set in repository settings

**How to use:**
1. Go to Actions tab in GitHub
2. Select "Publish to npm" workflow
3. Click "Run workflow"
4. Optionally enter a version number
5. Click "Run workflow" button

---

## Required Secrets

Add these secrets in repository settings (Settings → Secrets and variables → Actions):

### NPM_TOKEN

Create a granular access token on npmjs.com:
1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Click "Generate New Token" → "Granular Access Token"
3. Set permissions:
   - Packages and scopes: Read and write
   - Select packages: `splunk-mcp`
4. Copy the token
5. Add as `NPM_TOKEN` secret in GitHub repository settings

---

## Dependency Management

This project uses **Renovate** for automated dependency updates (see `renovate.json`):

- Runs weekly on Mondays before 5am (Europe/Berlin)
- Auto-merges minor and patch updates for stable versions (≥1.0.0)
- Waits 3 days after npm package release before updating
- Creates PRs with semantic commit messages
- Labels PRs with "dependencies"

---

## Best Practices

### Version Bumping

Use npm version commands to bump versions:

```bash
# Patch release (0.3.0 → 0.3.1) - bug fixes
npm version patch

# Minor release (0.3.0 → 0.4.0) - new features
npm version minor

# Major release (0.3.0 → 1.0.0) - breaking changes
npm version major
```

### Release Process

#### Automatic (Recommended)
1. Make your changes
2. Commit changes: `git commit -m "feat: add new feature"`
3. Bump version: `npm version minor`
4. Push with tags: `git push --follow-tags`
5. Release workflow automatically publishes to npm

#### Manual
1. Go to Actions → Publish to npm
2. Run workflow with version number
3. Workflow handles version bump, tag, and publish

### Emergency Hotfix

If automatic release fails:
1. Fix the issue locally
2. Run manual publish workflow
3. Or publish manually: `npm publish`

---

## Troubleshooting

### Workflow fails with "NPM_TOKEN" error
- Ensure `NPM_TOKEN` secret is set correctly
- Verify token has not expired (granular tokens expire after 90 days)
- Check token has correct permissions

### Version already exists on npm
- Bump version in `package.json`
- Ensure you push the version tag: `git push --follow-tags`

### CI fails on specific Node version
- Check compatibility of dependencies
- Update `engines` field in `package.json` if needed

### Renovate not creating PRs
- Check Renovate dashboard: https://app.renovatebot.com/dashboard
- Verify repository has Renovate app installed
- Check `renovate.json` configuration