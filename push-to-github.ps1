# Run this from the project folder after you create the repo on GitHub.
# Replace the repo URL with your own GitHub repository.

$repoUrl = Read-Host 'Enter GitHub repo URL (e.g. https://github.com/youruser/yourrepo.git)'
if (-not $repoUrl) {
  Write-Error 'Repository URL is required.'
  exit 1
}

git init
if ($LASTEXITCODE -ne 0) { exit 1 }

git checkout -B main
if ($LASTEXITCODE -ne 0) { exit 1 }

git add .
if ($LASTEXITCODE -ne 0) { exit 1 }

git commit -m 'Initial commit: add Vite React German A2 exam prep app'
if ($LASTEXITCODE -ne 0) { exit 1 }

git remote add origin $repoUrl
if ($LASTEXITCODE -ne 0) { exit 1 }

git push -u origin main
