# Push to GitHub script
Write-Host "Initializing git repository..." -ForegroundColor Cyan
git init

Write-Host "`nConfiguring remote..." -ForegroundColor Cyan
git remote remove origin 2>$null
git remote add origin https://github.com/aakarshan-coding/cf_ai_decision_agent.git
git remote -v

Write-Host "`nStaging all files..." -ForegroundColor Cyan
git add -A

Write-Host "`nConfiguring git user..." -ForegroundColor Cyan
git config user.name "aakarshan-coding"
git config user.email "aakarshan-coding@users.noreply.github.com"

Write-Host "`nCreating commit..." -ForegroundColor Cyan
git commit -m "Initial commit: Multi-agent incident decision assistant

- Multi-agent debate system (Reliability, Cost, UX agents)
- Incident tracking with searchable history  
- Chat interface with real-time streaming
- State management via Durable Objects
- Workers AI integration (Llama 3.1-8b-instruct)"

Write-Host "`nSetting branch to main..." -ForegroundColor Cyan
git branch -M main

Write-Host "`nPushing to GitHub..." -ForegroundColor Cyan
Write-Host "Note: You may be prompted for GitHub credentials" -ForegroundColor Yellow
git push -u origin main

Write-Host "`nDone! Check your repository at:" -ForegroundColor Green
Write-Host "https://github.com/aakarshan-coding/cf_ai_decision_agent" -ForegroundColor Green
