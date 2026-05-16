# Download Phi-3 mini GGUF (compatible with llama-cpp-python 0.2.90 on Windows CPU).
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$ModelsDir = Join-Path $ProjectRoot "models"
New-Item -ItemType Directory -Path $ModelsDir -Force | Out-Null

$FileName = "Phi-3-mini-4k-instruct-q4.gguf"
$OutPath = Join-Path $ModelsDir $FileName

if (Test-Path $OutPath) {
  $sizeMb = [math]::Round((Get-Item $OutPath).Length / 1MB, 1)
  Write-Host "Model already exists: $OutPath ($sizeMb MB)"
  exit 0
}

Write-Host "Installing huggingface_hub if needed..."
& (Join-Path $ProjectRoot ".venv\Scripts\pip.exe") install huggingface_hub -q

Write-Host "Downloading Phi-3-mini-4k-instruct Q4 (~2.3 GB)..."
& (Join-Path $ProjectRoot ".venv\Scripts\python.exe") -c @"
from huggingface_hub import hf_hub_download
p = hf_hub_download(
    repo_id='microsoft/Phi-3-mini-4k-instruct-gguf',
    filename='Phi-3-mini-4k-instruct-q4.gguf',
    local_dir=r'$ModelsDir',
)
print('Saved:', p)
"@

$sizeMb = [math]::Round((Get-Item $OutPath).Length / 1MB, 1)
Write-Host "Done. Model size: $sizeMb MB"
Write-Host "HRMS_AI_GGUF_MODEL_PATH=$OutPath"
