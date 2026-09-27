# 部署到 Cloudflare Pages（直传）
#
# 只发生产资产：test/、test.html、README*、LICENSE、REFACTOR_NOTES.md
# 一律不进公网产物。.wrangler/ 是 wrangler 的本地缓存，已在 .gitignore。
#
# 首次：wrangler pages project create badminton-score --production-branch=main
# 之后每次改完代码跑一次本脚本即可。

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$stage = Join-Path $env:TEMP 'badminton-score-cf-deploy'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

# 生产资产清单。新增 js/css 文件时改这里，别把整个目录倒进去。
$dirs = @('css', 'js', 'vendor', 'images')
$files = @('index.html', 'manifest.json', 'sw.js', '_headers')

foreach ($d in $dirs) {
    New-Item -ItemType Directory -Path (Join-Path $stage $d) -Force | Out-Null
    Copy-Item -Path (Join-Path $root ($d + '\*')) -Destination (Join-Path $stage $d) -Recurse -Force
}
foreach ($f in $files) {
    Copy-Item -Path (Join-Path $root $f) -Destination (Join-Path $stage $f) -Force
}

$count = (Get-ChildItem $stage -Recurse -File).Count
Write-Host "暂存 $count 个文件 -> $stage"

wrangler pages deploy $stage --project-name=badminton-score --branch=main --commit-dirty=true
