# Start HRMS AI Model (Python + optional GGUF)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

& .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt -q
pip show llama-cpp-python 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  pip install "llama-cpp-python==0.2.90" --prefer-binary --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu -q
}

if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim()
      Set-Item -Path "env:$name" -Value $value
    }
  }
}

$modelPath = $env:HRMS_AI_GGUF_MODEL_PATH
if ($env:HRMS_AI_USE_GGUF -eq "true" -and $modelPath -and -not (Test-Path $modelPath)) {
  Write-Host "GGUF model not found at: $modelPath"
  Write-Host "Run: .\scripts\download-model.ps1"
  exit 1
}

$env:PORT = if ($env:PORT) { $env:PORT } else { "8080" }
Write-Host "HRMS AI Model on http://127.0.0.1:$env:PORT (GGUF: $($env:HRMS_AI_USE_GGUF))"
python -m uvicorn app.main:app --host 0.0.0.0 --port $env:PORT --reload
