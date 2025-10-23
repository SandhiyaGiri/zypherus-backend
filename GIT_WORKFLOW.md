# Git Workflow Guide

## 📝 Standard Git Commands for This Project

### Initial Setup (If Not Done)

```bash
# Navigate to backend directory
cd /Users/sandhiya.cv/Downloads/react_app/react-app/backend

# Check current status
git status

# Check current branch
git branch
```

---

## 🚀 Push Code to GitHub (Standard Workflow)

### Step 1: Stage Your Changes

```bash
# View what has changed
git status

# Stage specific files
git add apps/dev-server/src/routes/portal.ts
git add apps/dev-server/src/middleware/auth.ts
git add packages/sdk/src/token.ts
git add packages/sdk/src/types.ts

# Or stage all changes
git add .
```

### Step 2: Commit Your Changes

```bash
# Commit with a descriptive message
git commit -m "feat: Add Render deployment with Supabase auth integration

- Add Render configuration files (render.yaml)
- Integrate Supabase authentication and API key management
- Update SDK to support API key authentication
- Add comprehensive deployment documentation
- Configure environment variables for production"
```

### Step 3: Push to GitHub

```bash
# Push to current branch
git push origin feature/production-service-setup-clean

# Or if you want to push to main
git checkout -b main
git push origin main

# Or force push if needed (use with caution!)
# git push origin feature/production-service-setup-clean --force
```

---

## 🔄 Alternative: Create New Branch

If you want to create a fresh deployment branch:

```bash
# Create and switch to new branch
git checkout -b deploy/render-production

# Stage all changes
git add .

# Commit
git commit -m "feat: Production-ready Render deployment configuration"

# Push new branch to GitHub
git push origin deploy/render-production
```

---

## 🌿 Standard Branch Naming Conventions

Use these prefixes for branches:

- `feature/` - New features (e.g., `feature/api-keys`)
- `fix/` - Bug fixes (e.g., `fix/auth-error`)
- `deploy/` - Deployment configurations (e.g., `deploy/render-prod`)
- `refactor/` - Code refactoring (e.g., `refactor/sdk-types`)
- `docs/` - Documentation updates (e.g., `docs/deployment`)

---

## 📦 Commit Message Format (Conventional Commits)

```bash
# Format: <type>(<scope>): <subject>

# Types:
feat:     # New feature
fix:      # Bug fix
docs:     # Documentation changes
style:    # Code style changes (formatting, etc.)
refactor: # Code refactoring
test:     # Adding tests
chore:    # Maintenance tasks

# Examples:
git commit -m "feat(auth): Add API key validation middleware"
git commit -m "fix(sdk): Resolve token provider fetch issue"
git commit -m "docs(render): Add deployment guide"
git commit -m "chore(deps): Update dependencies"
```

---

## 🔍 Useful Git Commands

### Check Status
```bash
# View current changes
git status

# View commit history
git log --oneline -10

# View specific file history
git log --oneline apps/dev-server/src/routes/portal.ts
```

### View Differences
```bash
# View unstaged changes
git diff

# View staged changes
git diff --staged

# View changes in specific file
git diff apps/dev-server/src/routes/portal.ts
```

### Undo Changes
```bash
# Discard changes in working directory
git restore apps/dev-server/src/routes/portal.ts

# Unstage file
git restore --staged apps/dev-server/src/routes/portal.ts

# Discard all local changes (CAUTION!)
git restore .
```

### Branch Management
```bash
# List all branches
git branch -a

# Switch to branch
git checkout feature/other-branch

# Create and switch to new branch
git checkout -b feature/new-feature

# Delete local branch
git branch -d feature/old-branch

# Delete remote branch
git push origin --delete feature/old-branch
```

---

## 🔐 Before Pushing - Security Checklist

✅ **Check for sensitive data**:
```bash
# Search for potential secrets
grep -r "api_key\|secret\|password\|token" apps/ packages/ --include="*.ts" --include="*.js"

# Make sure .env files are not staged
git status | grep ".env"
```

✅ **Files that should NOT be committed**:
- `.env`
- `.env.local`
- `.env.production`
- `*.tgz` (SDK tarballs - except in releases/)
- `node_modules/`
- `dist/` (except production builds)

✅ **Check .gitignore is working**:
```bash
cat .gitignore
```

---

## 🚨 If You Committed Secrets Accidentally

### Remove from last commit:
```bash
# Remove file from staging
git restore --staged .env.local

# Amend the commit
git commit --amend

# Force push (only if not shared with others!)
git push origin your-branch --force
```

### Remove from history (advanced):
```bash
# Use git-filter-repo (recommended)
pip install git-filter-repo
git filter-repo --invert-paths --path .env.local

# Or use BFG Repo-Cleaner
# Download from https://rtyley.github.io/bfg-repo-cleaner/
java -jar bfg.jar --delete-files .env.local
```

**Important**: After removing secrets, rotate all exposed keys immediately!

---

## 📋 Complete Push Workflow

Here's the complete workflow you should follow:

```bash
# 1. Navigate to backend directory
cd /Users/sandhiya.cv/Downloads/react_app/react-app/backend

# 2. Check status
git status

# 3. Remove any temporary files
rm -f packages/sdk/zypherus-shared-types-0.0.0.tgz
rm -f .env.local.backup

# 4. Stage changes (choose one)
git add .                                          # Stage everything
# OR
git add apps/ packages/ scripts/ *.md *.yaml      # Stage specific directories

# 5. Check what will be committed
git status

# 6. Commit with descriptive message
git commit -m "feat: Add Render deployment configuration

- Add render.yaml for automated deployment
- Integrate Supabase authentication system
- Update SDK with API key support
- Add comprehensive deployment documentation
- Configure production environment variables"

# 7. Push to GitHub
git push origin feature/production-service-setup-clean

# 8. Verify push was successful
git log origin/feature/production-service-setup-clean -1
```

---

## 🌐 Connect to Render

After pushing to GitHub:

1. **Go to Render Dashboard**: [dashboard.render.com](https://dashboard.render.com)
2. **Click "New" → "Blueprint"**
3. **Connect GitHub repository**
4. **Select branch**: `feature/production-service-setup-clean`
5. **Render detects `render.yaml` automatically**
6. **Click "Apply"**

---

## 🔄 Continuous Deployment

Once connected, Render will automatically deploy on every push:

```bash
# Make changes
vim apps/dev-server/src/routes/portal.ts

# Commit and push
git add .
git commit -m "fix: Update API key validation"
git push origin feature/production-service-setup-clean

# Render automatically deploys! 🚀
```

---

## 📚 Quick Reference

```bash
# Common workflow
git status                    # Check status
git add .                     # Stage all
git commit -m "message"       # Commit
git push origin branch-name   # Push

# Branch operations
git branch                    # List branches
git checkout -b new-branch    # Create branch
git checkout branch-name      # Switch branch

# Undo operations
git restore file              # Discard changes
git restore --staged file     # Unstage file
git commit --amend            # Edit last commit

# View information
git log --oneline -10         # Recent commits
git diff                      # View changes
git status                    # Current status
```

---

## 🆘 Need Help?

- **Git stuck?** Try `git status` first
- **Push rejected?** Try `git pull origin branch-name` first
- **Merge conflicts?** Resolve conflicts, then `git add .` and `git commit`
- **Lost commits?** Try `git reflog` to recover

**Remember**: Always commit and push before making major changes!

