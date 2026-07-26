$ErrorActionPreference = 'Stop'

$bundledNode = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } elseif (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { $null }
$server = Join-Path $PSScriptRoot 'server.mjs'

if (-not $node) {
    throw 'Node.js was not found. Install Node.js 22 or newer.'
}

$serverInfo = [System.Diagnostics.ProcessStartInfo]::new()
$serverInfo.FileName = $node
$serverInfo.Arguments = '"' + $server + '"'
$serverInfo.WorkingDirectory = $PSScriptRoot
$serverInfo.UseShellExecute = $true
$serverInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
[void][System.Diagnostics.Process]::Start($serverInfo)

Start-Sleep -Seconds 1

$browserInfo = [System.Diagnostics.ProcessStartInfo]::new()
$browserInfo.FileName = 'http://127.0.0.1:4178'
$browserInfo.UseShellExecute = $true
[void][System.Diagnostics.Process]::Start($browserInfo)
