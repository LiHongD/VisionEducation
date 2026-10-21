$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$pythonDir=Join-Path $root 'public/vendor/pyodide'
$ortDir=Join-Path $root 'public/vendor/ort'
$editorDir=Join-Path $root 'public/vendor/codemirror'
$modelDir=Join-Path $root 'public/pose-lab-assets'
foreach($path in @($pythonDir,$ortDir,$editorDir,$modelDir)){New-Item -ItemType Directory -Force -Path $path | Out-Null}
function Fetch-Asset($url,$path){
 if(!(Test-Path -LiteralPath $path)){Invoke-WebRequest -Uri $url -OutFile $path}
 Write-Output ((Split-Path -Leaf $path)+' '+(Get-Item -LiteralPath $path).Length)
}
$pyBase='https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'
foreach($name in @('pyodide.js','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json')){Fetch-Asset ($pyBase+$name) (Join-Path $pythonDir $name)}
$lock=Get-Content -Raw -LiteralPath (Join-Path $pythonDir 'pyodide-lock.json') | ConvertFrom-Json
$numpy=$lock.packages.numpy
Fetch-Asset ($pyBase+$numpy.file_name) (Join-Path $pythonDir $numpy.file_name)
if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $pythonDir $numpy.file_name)).Hash.ToLower() -ne $numpy.sha256){throw 'NumPy checksum mismatch'}
$tgz=Join-Path $env:TEMP 'classroom-ort-1.22.0.tgz'
Fetch-Asset 'https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.22.0.tgz' $tgz
tar.exe -xzf $tgz -C $ortDir --strip-components=2 'package/dist/ort.wasm.min.js' 'package/dist/ort-wasm-simd-threaded.mjs' 'package/dist/ort-wasm-simd-threaded.wasm'
if($LASTEXITCODE -ne 0){throw 'ONNX Runtime extraction failed'}
foreach($name in @('lib/codemirror.js','lib/codemirror.css','mode/python/python.js','LICENSE')){Fetch-Asset ('https://cdn.jsdelivr.net/npm/codemirror@5.65.20/'+$name) (Join-Path $editorDir (Split-Path -Leaf $name))}
Fetch-Asset 'https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n-pose.onnx' (Join-Path $modelDir 'yolo26n-pose.onnx')
Copy-Item -LiteralPath (Join-Path $root 'public/micro15-assets/neutral.png') -Destination (Join-Path $modelDir 'classroom-person.png') -Force
Write-Output 'POSE_LAB_ASSETS_READY'
