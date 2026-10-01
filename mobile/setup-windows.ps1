$ErrorActionPreference = "Stop"

Write-Host "[Condomit] Verificando Node.js..."
node --version
npm --version

Write-Host "[Condomit] Instalando dependencias..."
npm install

Write-Host "[Condomit] Gerando bundle web mobile..."
npm run mobile:build

if (-not (Test-Path "android")) {
  Write-Host "[Condomit] Criando projeto Android..."
  npx cap add android
}

Write-Host "[Condomit] Sincronizando Android..."
npm run mobile:sync

Write-Host "[Condomit] Abrindo Android Studio..."
npx cap open android

Write-Host "[Condomit] iOS precisa ser gerado e compilado em um Mac com Xcode 26+."
