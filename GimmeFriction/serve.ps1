param(
  [int]$Port = 8000,
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

& node (Join-Path $scriptDir "serve.mjs") --port $Port --host $HostName
