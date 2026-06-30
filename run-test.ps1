$body = @{
    testScenario = "breezeai sanity"
    browser = "chromium"
    headless = $true
} | ConvertTo-Json

$response = Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/run-test -ContentType 'application/json' -Body $body -TimeoutSec 600

Write-Host "Test run completed"
Write-Host ($response | ConvertTo-Json -Depth 10)
