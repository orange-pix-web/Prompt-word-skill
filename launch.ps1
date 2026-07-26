$ErrorActionPreference = 'Stop'

$bundledNode = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } elseif (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { $null }
$server = Join-Path $PSScriptRoot 'server.mjs'
$downloadUrl = 'https://nodejs.org/en/download'

$nodeReady = $false
if ($node) {
    try {
        $versionText = (& $node --version 2>$null).Trim()
        $majorVersion = [int]($versionText.TrimStart('v').Split('.')[0])
        $nodeReady = $majorVersion -ge 22
    } catch {
        $nodeReady = $false
    }
}

if (-not $nodeReady) {
    $message = "启动生图工作台需要 Node.js 22 或更高版本。`n`n是否现在打开 Node.js 官方下载页面？`n安装完成后，请重新双击启动按钮。"
    $openDownload = $false

    try {
        Add-Type -AssemblyName System.Windows.Forms
        $answer = [System.Windows.Forms.MessageBox]::Show(
            $message,
            '缺少 Node.js',
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Information
        )
        $openDownload = $answer -eq [System.Windows.Forms.DialogResult]::Yes
    } catch {
        Write-Host $message
        $openDownload = $true
    }

    if ($openDownload) {
        $downloadInfo = [System.Diagnostics.ProcessStartInfo]::new()
        $downloadInfo.FileName = $downloadUrl
        $downloadInfo.UseShellExecute = $true
        [void][System.Diagnostics.Process]::Start($downloadInfo)
    }

    exit 1
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
