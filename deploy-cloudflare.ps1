# 部署到 Cloudflare Pages（直传）
#
# 只发生产资产：test/、test.html、README*、LICENSE、REFACTOR_NOTES.md
# 一律不进公网产物。.wrangler/ 是 wrangler 的本地缓存，已在 .gitignore。
#
# 首次：wrangler pages project create badminton-score --production-branch=main
# 之后每次改完代码跑一次本脚本即可。
#
# 注意：本脚本在暂存后、上传前会硬校验文件数。曾经因为目录没复制进去，
# 部署出一个"只有 index.html"的坏产物——所有 js/css 都被 Pages 的 SPA 兜底
# 改写成了 HTML，页面白屏但状态码全是 200，极难察觉。所以这里必须断言。

$ErrorActionPreference = 'Stop'

# ---- 1. 定位仓库根目录 ----------------------------------------------------
$root = $PSScriptRoot
if (-not $root) { $root = $PWD.Path }

# 用哨兵文件确认 root 对不对，别靠猜
$sentinel = Join-Path $root 'index.html'
if (-not (Test-Path $sentinel)) {
    throw "找不到 $sentinel —— 仓库根目录解析失败（`$PSScriptRoot='$PSScriptRoot'）。请在本目录下手动执行：powershell -File .\deploy-cloudflare.ps1"
}

# ---- 2. 生产资产清单 ------------------------------------------------------
# 新增 js/css 文件时改这里，别把整个目录倒进去。
$dirs  = @('css', 'js', 'vendor', 'images')
$files = @('index.html', 'manifest.json', 'sw.js', '_headers', 'robots.txt')

# ---- 3. 暂存 --------------------------------------------------------------
$stage = Join-Path $env:TEMP 'badminton-score-cf-deploy'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

foreach ($d in $dirs) {
    $src = Join-Path $root ($d + '\*')
    if (-not (Test-Path $src)) { throw "源目录不存在：$src" }

    $dst = Join-Path $stage $d
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
    Copy-Item -Path $src -Destination $dst -Recurse -Force

    $n = (Get-ChildItem $dst -Recurse -File).Count
    if ($n -eq 0) { throw "$d/ 复制后是空的：$dst" }
    Write-Host ("  {0,-8} {1,2} 个文件" -f $d, $n)
}

foreach ($f in $files) {
    $src = Join-Path $root $f
    if (-not (Test-Path $src)) { throw "源文件不存在：$src" }
    Copy-Item -Path $src -Destination (Join-Path $stage $f) -Force
}

$count = (Get-ChildItem $stage -Recurse -File).Count
Write-Host "暂存 $count 个文件 -> $stage"

# ---- 4. 上传前硬校验 ------------------------------------------------------
# 逐目录断言，而不是只数总数。
#
# 为什么不能用总数下限：曾经用 $MIN = 30，而实际有 42 个文件——
# 丢掉整个 css/（剩 34）、整个 vendor/（剩 40）、整个 images/（剩 38）、
# 丢掉 js/core/（剩 40）全部都能"过关"。而这个断言存在的唯一理由，
# 正是拦住"某个目录没复制进去"这种坏产物（见文件头注释：
# 曾经部署出"只有 index.html"的版本，所有 js/css 被 SPA 兜底改写成 HTML，
# 页面白屏但状态码全是 200）。
#
# 所以这里对每个目录分别计数并与期望值比对：任何一处对不上都中止上传。
# 新增 js/css 文件时改下面的期望值——忘了改会被断言拦下，
# 这正是想要的：宁可部署失败，也不要发出坏产物。
$expected = [ordered]@{
    'css'    = 8     # tokens/base/components/screens/effects/courtside/account/share-card
    'js'     = 23    # 21 个顶层 + core/bus.js + core/migrate.js
    'vendor' = 2     # chart.umd.min.js / html2canvas.min.js
    'images' = 4     # icon-192 / icon-512 / apple-touch-icon / favicon.svg
}
$expectedFiles = @('index.html', 'manifest.json', 'sw.js', '_headers', 'robots.txt')

$mismatch = @()
foreach ($d in $expected.Keys) {
    $dir = Join-Path $stage $d
    $n = if (Test-Path $dir) { (Get-ChildItem $dir -Recurse -File).Count } else { 0 }
    if ($n -ne $expected[$d]) { $mismatch += "$d/ 期望 $($expected[$d]) 实际 $n" }
}
$expectedTotal = ($expected.Values | Measure-Object -Sum).Sum + $expectedFiles.Count
if ($count -ne $expectedTotal) {
    $mismatch += "总数 期望 $expectedTotal 实际 $count"
}

if ($mismatch.Count -gt 0) {
    throw ("暂存内容与预期不符，中止上传：`n  " + ($mismatch -join "`n  ") +
           "`n（若确实新增/删除了 js/css 文件，请同步更新本脚本的 `$expected）")
}
Write-Host "资产清单校验通过：$count 个文件，逐目录数量与预期一致"

# ---- 5. 上传 --------------------------------------------------------------
wrangler pages deploy $stage --project-name=badminton-score --branch=main --commit-dirty=true

# ---- 6. 上传后自检 --------------------------------------------------------
# Pages 的 SPA 兜底会把不存在的路径也返回 index.html（200 + text/html），
# 所以只查状态码不够，必须查 Content-Type。
# js/css/vendor 还要查 Cache-Control 是不是真的被 _headers 松绑成了 no-cache
# （Pages 默认是 max-age=14400，4 小时的陈旧窗口）。
Write-Host "`n=== 上传后自检 ==="
$base = 'https://badminton-score.pages.dev'
$bad = 0

function Check-Asset($path, $expectCt, $expectCache) {
    try {
        $r = Invoke-WebRequest -Uri ($base + $path) -UseBasicParsing -TimeoutSec 45
        $ct = [string]$r.Headers['Content-Type']
        $cc = [string]$r.Headers['Cache-Control']
        $ok = ($ct -match $expectCt)
        $cacheOk = ($null -eq $expectCache) -or ($cc -match $expectCache)
        if (-not $ok -or -not $cacheOk) { $script:bad++ }
        $mark = if ($ok -and $cacheOk) { 'OK  ' } else { 'FAIL' }
        $extra = if ($expectCache) { "  cc=$cc" } else { '' }
        Write-Host ("  {0} {1,-28} {2}  ct={3}{4}" -f $mark, $path, $r.StatusCode, $ct, $extra)
    } catch {
        $script:bad++
        Write-Host ("  FAIL {0,-28} {1}" -f $path, $_.Exception.Message)
    }
}

Check-Asset '/js/app.js'        'application/javascript' 'no-cache'
Check-Asset '/js/match.js'      'application/javascript' 'no-cache'
Check-Asset '/css/tokens.css'   'text/css'               'no-cache'
Check-Asset '/css/screens.css'  'text/css'               'no-cache'
Check-Asset '/sw.js'            'application/javascript' 'no-cache'
Check-Asset '/manifest.json'    'application/json'       'no-cache'
Check-Asset '/robots.txt'       'text/plain'             $null
Check-Asset '/vendor/chart.umd.min.js' 'application/javascript' 'no-cache'
# /index.html 会被 Pages 308 重定向到 /，所以查 /（默认就是 max-age=0, must-revalidate）
Check-Asset '/'                   'text/html'              'must-revalidate'

if ($bad -gt 0) {
    Write-Host "`n!! $bad 项自检未过，部署可能未生效，稍等几秒重试本脚本。" -ForegroundColor Red
    exit 1
}
Write-Host "`nContent-Type 与 Cache-Control 全部符合预期，部署完成。" -ForegroundColor Green
