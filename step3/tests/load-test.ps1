$jobs = 1..10 | ForEach-Object {
    Start-Job -ScriptBlock {
        1..20 | ForEach-Object {
            $urls = @(
                "http://localhost:3001/products",
                "http://localhost:3001/products/1",
                "http://localhost:3001/products/2",
                "http://localhost:3001/products/3",
                "http://localhost:3001/products/4",
                "http://localhost:3001/products/5",
                "http://localhost:3001/products/99",
                "http://localhost:3001/products/0",
                "http://localhost:3001/products/-1",
                "http://localhost:3001/products/abc",
                "http://localhost:3001/health"
            )
            Invoke-WebRequest -Uri ($urls | Get-Random) -UseBasicParsing | Out-Null
        }
    }
}

Write-Host "10 jobs running, 200 total requests..."
$jobs | Wait-Job | Out-Null
$jobs | Remove-Job
Write-Host "Done. All jobs cleaned up."


# Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass