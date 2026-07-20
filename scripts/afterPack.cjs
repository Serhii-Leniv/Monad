// electron-builder afterPack hook: ad-hoc code-sign the macOS .app. Apple Silicon
// refuses to launch a wholly unsigned binary, so this "-" (ad-hoc) signature is what
// makes the app runnable at all — e.g. for a locally built copy.
//
// It does NOT get a downloaded copy past Gatekeeper. A .dmg fetched from the web
// carries com.apple.quarantine, and an ad-hoc signature isn't notarized, so macOS
// still reports "Monad is damaged and can't be opened." Right-click → Open does not
// clear that one (it only clears the milder "unidentified developer" dialog) — the
// user must strip the quarantine flag, which is what the README and download page
// tell them to do:
//
//   xattr -dr com.apple.quarantine /Applications/Monad.app
//
// The real fix is a paid Apple Developer cert + notarization.
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename // "Monad"
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  console.log(`  • ad-hoc signing  ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  })
}
