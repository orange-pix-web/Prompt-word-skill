<#
  校正 import-auto-reference-layouts.mjs 创建的参考布局候选。
  使用参考图中浅色/低饱和包装主体在画面左右区域的密度，判断产品主位，
  只调整可编辑图层坐标，不改任何原参考图、产品图或营销文案。
#>
param(
  [string]$BaseUrl = 'http://127.0.0.1:4178',
  [string]$DataRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

Add-Type -AssemblyName System.Drawing

function Invoke-StudioApi([string]$Route, [object]$Body = $null) {
  if ($null -eq $Body) { return Invoke-RestMethod -Uri "$BaseUrl$Route" -Method Get }
  $json = $Body | ConvertTo-Json -Depth 100 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Uri "$BaseUrl$Route" -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes
}

function Get-ProductSide([string]$File) {
  $img = [System.Drawing.Bitmap]::new($File)
  try {
    $left = 0; $middle = 0; $right = 0
    for ($sy = 12; $sy -le 52; $sy += 2) {
      for ($sx = 2; $sx -le 61; $sx += 2) {
        $x = [Math]::Min($img.Width - 1, [int]($sx * $img.Width / 64))
        $y = [Math]::Min($img.Height - 1, [int]($sy * $img.Height / 64))
        $pixel = $img.GetPixel($x, $y)
        $max = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
        $min = [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
        $score = 0
        if ($max -gt 150 -and ($max - $min) -lt 85) { $score = ($max - 150) + (85 - ($max - $min)) }
        if ($sx -lt 22) { $left += $score } elseif ($sx -gt 42) { $right += $score } else { $middle += $score }
      }
    }
    if ($left -gt ($right * 1.15) -and $left -gt ($middle * 1.15)) { return 'left' }
    if ($right -gt ($left * 1.15) -and $right -gt ($middle * 1.15)) { return 'right' }
    return 'middle'
  } finally { $img.Dispose() }
}

function New-Layer([string]$Type, [string]$Label, [string]$Binding, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Z, [string]$Shape = 'none', [string]$Region = '') {
  $item = [ordered]@{ x=$X; y=$Y; w=$W; h=$H; shape=$Shape; z=$Z; type=$Type; label=$Label; binding=$Binding; visible=$true; text='' }
  if ($Type -ne 'product') { $item.fontRatio = 0.8 }
  if ($Region) { $item.copyRegion = $Region }
  return $item
}

function New-Layout([string]$Side, [int]$PointCount) {
  $elements = [ordered]@{}
  if ($Side -eq 'left') {
    $elements.product = New-Layer 'product' '产品' 'product1' 3 18 43 67 5
    $pointX = 52
  } elseif ($Side -eq 'right') {
    $elements.product = New-Layer 'product' '产品' 'product1' 54 18 43 67 5
    $pointX = 4
  } else {
    $elements.product = New-Layer 'product' '产品' 'product1' 34 18 34 67 5
    $pointX = 4
    $elements.animalRegion1 = New-Layer 'animalRegion' '场景/动物区域' 'custom' 72 27 25 53 2 'rounded'
  }
  $elements.title = New-Layer 'title' '主标题' 'productName' 3 3 94 13 8
  $elements.subtitle = New-Layer 'title' '副标题' 'subtitle' 5 16 44 6 8
  $spacing = if ($PointCount -ge 4) { 12 } else { 15 }
  for ($index = 1; $index -le $PointCount; $index += 1) {
    $y = 28 + (($index - 1) * $spacing)
    $region = if ($y -lt 28) { '顶部卖点' } elseif ($y -gt 72) { '底部卖点' } else { '侧栏卖点' }
    $elements["point$index"] = New-Layer 'sellingPoint' "卖点$index" "point$index" $pointX $y 42 9 8 'rounded' $region
  }
  $elements.net = New-Layer 'net' '净含量' 'net' 61 82 34 6 9 'pill'
  $elements.footer = New-Layer 'footer' '底栏' 'footer' 0 90 100 10 9 'rectangle'
  return [ordered]@{ canvas=1024; elements=$elements }
}

$state = Invoke-StudioApi '/api/state'
$updated = 0; $counts = [ordered]@{ left=0; right=0; middle=0; missing=0 }
foreach ($template in $state.templates) {
  if ([string]$template.special -notlike '*自动去重后的参考布局候选*') { continue }
  if ([string]$template.layout -notmatch '参考来源：参考图/(.+?)。') { $counts.missing += 1; continue }
  $reference = Join-Path (Join-Path $DataRoot '参考图') ($Matches[1].Replace('/', '\'))
  if (-not (Test-Path -LiteralPath $reference)) { $counts.missing += 1; continue }
  try { $side = Get-ProductSide $reference } catch { $side = 'middle' }
  $pointCount = [Math]::Max(2, [int]$template.points)
  $template.visualLayout = New-Layout $side $pointCount
  $template.layout = "自动空间分析：产品主体位于$(switch ($side) { 'left' { '左侧' } 'right' { '右侧' } default { '中部' } })；标题置顶，卖点与产品分列，底部通栏。参考来源：参考图/$($Matches[1])。"
  $counts[$side] += 1; $updated += 1
}

Invoke-StudioApi '/api/templates/save' ([ordered]@{ templates=@($state.templates); groups=@($state.templateGroups) }) | Out-Null
$output = [ordered]@{ generatedAt=(Get-Date).ToString('o'); updated=$updated; layoutSides=$counts }
$outFile = Join-Path $DataRoot '.prompt-ui\auto-reference-layout-spatial-analysis.json'
[System.IO.File]::WriteAllText($outFile, (($output | ConvertTo-Json -Depth 20) + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
$output | ConvertTo-Json -Depth 20
