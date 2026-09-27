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
$files = @('index.html', 'manifest.json', 'sw.js', '_headers')

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
# 当前应有：css 6 + js 17 + vendor 2 + images 4 + 根目录 4 = 33
$MIN = 30
if ($count -lt $MIN) {
    throw "只暂存了 $count 个文件，少于 $MIN。中止上传——否则会部署出缺 js/css 的坏产物。"
}

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
Check-Asset '/vendor/chart.umd.min.js' 'application/javascript' 'no-cache'
# /index.html 会被 Pages 308 重定向到 /，所以查 /（默认就是 max-age=0, must-revalidate）
Check-Asset '/'                   'text/html'              'must-revalidate'

if ($bad -gt 0) {
    Write-Host "`n!! $bad 项自检未过，部署可能未生效，稍等几秒重试本脚本。" -ForegroundColor Red
    exit 1
}
Write-Host "`nContent-Type 与 Cache-Control 全部符合预期，部署完成。" -ForegroundColor Green
