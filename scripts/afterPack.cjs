// electron-builder afterPack hook: ad-hoc code-sign the macOS .app so it runs
// on Apple Silicon without the "app is damaged" error. We have no paid Apple
// cert, so this is an unsigned-but-valid (ad-hoc, "-") signature; the user still
// does right-click → Open once (quarantine), but it no longer reports "damaged".
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename // "Vectro"
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  console.log(`  • ad-hoc signing  ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  })
}
