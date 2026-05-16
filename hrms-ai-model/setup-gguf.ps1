# One-time setup: venv, deps, GGUF wheel (0.2.90 for CPU compat), model download
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

& .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install huggingface_hub -q
pip install "llama-cpp-python==0.2.90" --prefer-binary --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu

& "$PSScriptRoot\scripts\download-model.ps1"

Write-Host ""
Write-Host "Setup complete."
Write-Host "  1. Start AI service:  .\run.ps1"
Write-Host "  2. Restart Node backend (uses HRMS_AI_PROVIDER=self_hosted in backend/.env)"
