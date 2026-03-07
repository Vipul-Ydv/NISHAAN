$ErrorActionPreference = "Stop"

$projectRoot = Get-Location
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$keysFile = Join-Path $projectRoot "project_keys.txt"

Write-Host "TrustChain Evidence Management System - Startup Script" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Clean up old keys file
if (Test-Path $keysFile) {
    Remove-Item $keysFile -Force
    Write-Host "Cleaned up old project_keys.txt" -ForegroundColor Yellow
}

# 2. Clean up old Hardhat node if it's already running
Write-Host "Checking for existing Hardhat background jobs..." -ForegroundColor Yellow

# Remove existing PowerShell jobs named HardhatNode
$existingJob = Get-Job -Name "HardhatNode" -ErrorAction SilentlyContinue
if ($existingJob) {
    Stop-Job -Name "HardhatNode" -ErrorAction SilentlyContinue
    Remove-Job -Name "HardhatNode" -Force -ErrorAction SilentlyContinue
}

# If there is a stranded node process holding port 8545, kill it
$listeningPort = netstat -ano | Select-String "LISTENING" | Select-String ":8545 "
if ($listeningPort) {
    Write-Host "Found existing Node process on port 8545. Stopping it..." -ForegroundColor Red
    
    # Extract PID from the end of the netstat line
    $pidStr = ($listeningPort -split '\s+')[-1]
    if ($pidStr -match '^\d+$') {
        $pidToKill = [int]$pidStr
        if ($pidToKill -gt 0) {
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            Write-Host "Process $pidToKill stopped." -ForegroundColor Green
        }
    }
    
    # Fail-safe: if netstat PID parsing fails but port is still open, kill all node instances
    # (Since this is a local dev script, killing node is usually acceptable)
    Start-Sleep -Seconds 1
    $stillListening = netstat -ano | Select-String "LISTENING" | Select-String ":8545 "
    if ($stillListening) {
        Write-Host "Port still occupied, aggressively killing all node.exe processes..." -ForegroundColor Red
        Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    }
    
    Start-Sleep -Seconds 2
} else {
    Write-Host "Port 8545 is clear." -ForegroundColor Green
}

# 3. Start Local Blockchain
Write-Host "Starting Hardhat Local Node in the background..." -ForegroundColor Green
$nodeJob = Start-Job -Name "HardhatNode" -ScriptBlock {
    param($backendPath)
    Set-Location $backendPath
    npm run node
} -ArgumentList $backendDir

Write-Host "Waiting for blockchain to initialize (10 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10
Write-Host "Hardhat Node is running." -ForegroundColor Green

# Capture the keys from the background job output
Write-Host "Extracting local accounts and private keys..." -ForegroundColor Yellow
$nodeOutput = Receive-Job -Name "HardhatNode" -Keep
$nodeOutput | Out-File -FilePath $keysFile -Encoding utf8
Write-Host "Saved to project_keys.txt" -ForegroundColor Green

# 3. Deploy Smart Contract
Write-Host "Deploying Smart Contract to local network..." -ForegroundColor Green
Set-Location $backendDir
$deployOutput = npm run deploy:local | Out-String

# Extract the contract address from the output.
# The script output typically contains "deployed successfully to: 0x..." or something similar.
# We will use Regex to find the 0x address.
$contractAddress = ""
if ($deployOutput -match "(0x[a-fA-F0-9]{40})") {
    $contractAddress = $matches[1]
    Write-Host "Contract deployed successfully to: $contractAddress" -ForegroundColor Green
    
    # Append to keys file
    Add-Content -Path $keysFile -Value "`n==============================="
    Add-Content -Path $keysFile -Value "SMART CONTRACT ADDRESS: $contractAddress"
    Add-Content -Path $keysFile -Value "==============================="
} else {
    Write-Host "Failed to extract smart contract address. Deployment output:" -ForegroundColor Red
    Write-Host $deployOutput
    Stop-Job -Name "HardhatNode"
    Remove-Job -Name "HardhatNode"
    Set-Location $projectRoot
    exit
}

# 4. Update Frontend .env.local
Write-Host "Updating frontend environment variables..." -ForegroundColor Yellow
Set-Location $frontendDir
$envTemplatePath = Join-Path $frontendDir ".env.example"
$envLocalPath = Join-Path $frontendDir ".env.local"

if (-not (Test-Path $envTemplatePath)) {
    Write-Host "Warning: .env.example not found in frontend directory." -ForegroundColor Yellow
} else {
    # If .env.local exists, we'll read it, replace NEXT_PUBLIC_CONTRACT_ADDRESS, and write it back.
    # Otherwise, copy from .env.example
    if (-not (Test-Path $envLocalPath)) {
        Copy-Item $envTemplatePath $envLocalPath
    }
    
    $envContent = Get-Content $envLocalPath
    $updatedEnv = @()
    $addressInjected = $false
    
    foreach ($line in $envContent) {
        if ($line -match "^NEXT_PUBLIC_CONTRACT_ADDRESS=") {
            $updatedEnv += "NEXT_PUBLIC_CONTRACT_ADDRESS=`"$contractAddress`""
            $addressInjected = $true
        } else {
            $updatedEnv += $line
        }
    }
    
    if (-not $addressInjected) {
         $updatedEnv += "NEXT_PUBLIC_CONTRACT_ADDRESS=`"$contractAddress`""
    }
    
    $updatedEnv | Out-File -FilePath $envLocalPath -Encoding utf8
    Write-Host "Frontend .env.local updated with contract address." -ForegroundColor Green
}

# 5. Start Frontend
Write-Host "Starting Next.js frontend in a new window..." -ForegroundColor Green
Set-Location $frontendDir

# Open a new PowerShell window and start the frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendDir'; npm run dev"

Set-Location $projectRoot
Write-Host "Boot sequence complete!" -ForegroundColor Cyan
Write-Host "The blockchain is running in the background."
Write-Host "To stop it later, run: Stop-Job -Name 'HardhatNode'"
Write-Host "Your frontend is opening in a new window."
Write-Host "All keys and addresses have been saved to project_keys.txt" -ForegroundColor Yellow
