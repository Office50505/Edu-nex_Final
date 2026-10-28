from pathlib import Path
import json
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/pdf/skillomate-ios31-android25-comparison-2026-10-19.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles['BodyText'].fontSize = 10
styles['BodyText'].leading = 14
styles['BodyText'].spaceAfter = 7
styles['Title'].textColor = colors.HexColor('#17344b')
story = []
def p(text, style='BodyText'):
    return Paragraph(escape(text), styles[style])
def section(title, text):
    story.extend([p(title, 'Heading2'), p(text)])
story += [p('Skillomate release comparison', 'Title'), p('19 October 2026 | App version 1.0 | Source: 744f9cc plus version metadata updates')]
rows = [['Platform', 'Previous local release', 'New result'], ['iOS', 'Build 30', 'Build 31: signed archive and development IPA'], ['Android', 'Version code 24', 'Version code 25: signed production APK and AAB']]
t = Table([[p(c) for c in row] for row in rows], colWidths=[28*mm, 53*mm, 93*mm])
t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8eff5')),('GRID',(0,0),(-1,-1),0.4,colors.HexColor('#ccd5de')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
story += [Spacer(1, 4*mm), t]
section('Feature and behavior differences', 'The current app supports the server-controlled video screen-capture policy. Playback starts with capture blocked, fetches /api/screen-capture-policy, refreshes every 30 seconds and when the app returns to the foreground, and blocks capture when the policy cannot be fetched. Updates are serialized and listeners/timers are cleaned up when playback closes.')
story.append(p('Binary inspection found the policy endpoint in the previous Android 24 bundle, but not in the previous iOS 30 bundle. Therefore iOS 31 picks up this change; Android 25 retains behavior already present in Android 24. Both new builds package the current shared app source.'))
section('Code, bug fixes and build configuration', 'This build request changes only appcopyai/app.json, android/app/build.gradle and ios/ProtectedVideo.xcodeproj/project.pbxproj: Android versionCode 24 to 25, and iOS buildNumber / CURRENT_PROJECT_VERSION 30 to 31. Version name remains 1.0. No additional application logic fixes or dependency upgrades were introduced during this request.')
story.append(p('Both platforms embed the production HTTPS API base https://api.skillomate.in. Android uses the existing release keystore; its certificate fingerprint matches Android 24. The APK targets arm64-v8a, with minimum Android API 24 and target API 36, following the existing configuration.'))
section('Scope and distribution status', 'Recent PhonePe recurring-mandate and renewal recovery changes are backend changes. Mobile artifacts do not deploy that server code. No store upload or backend deployment was performed. The iOS archive succeeded; App Store IPA export failed because Xcode reports No Accounts and no iOS Distribution certificate. A development IPA was successfully exported with the available development identity and is limited to provisioned test devices.')
story += [PageBreak(), p('Verification and deliverables', 'Title')]
section('Checks completed', 'Android Gradle :app:assembleRelease and :app:bundleRelease completed successfully. APK manifest confirms com.skillomate.app, versionName 1.0 and versionCode 25. apksigner verification passed; jarsigner reports jar verified for the AAB (with the usual untrusted certificate-chain warning). The AAB and previous Android release share the same SHA-256 signing certificate fingerprint.')
story.append(p('Xcode Release archive completed successfully. Archive and exported development IPA metadata confirm iOS version 1.0, build 31. codesign verification passed for the archived app. Both new platform bundles contain the production API URL and screen-capture policy endpoint. git diff --check passed. No device installation, interactive playback/payment testing or App Store validation was performed.'))
section('Comparison evidence and limits', 'Previous artifacts inspected: Skillomate-1.0-build30.xcarchive and Skillomate-1.0-vc24-production.aab. Comparisons combine archive metadata, bundle string inspection and source history. Previous binaries have no source provenance manifest, so a complete source-to-binary attribution is not claimed. All current mobile source was built without reverting existing changes.')
manifest=json.loads((ROOT/'tmp/build31-vc25/artifacts.json').read_text())
for item in manifest['artifacts']:
    story.append(p(Path(item['path']).name, 'Heading3'))
    story.append(p(f"Size: {item['bytes']/1024/1024:.1f} MiB | " + ('Development distribution' if item['path'].endswith('.ipa') else 'Production release')))
    story.append(Paragraph('SHA-256: '+ '<br/>'.join([item['sha256'][:32],item['sha256'][32:]]),styles['Code']))
section('iOS archive and remaining action', 'Archive: appcopyai/releases/ios/Skillomate-1.0-build31.xcarchive. For an App Store IPA, restore the Apple Developer account and distribution signing identity in Xcode, then export this existing build 31 archive using ios/ExportOptionsLocalAppStore.plist. Recompilation is not required solely to restore distribution signing.')
def footer(canvas, doc):
    canvas.setFont('Helvetica',8)
    canvas.setFillColor(colors.HexColor('#607080'))
    canvas.drawString(18*mm, 11*mm, 'Skillomate | iOS 31 / Android 25 | 19 October 2026')
    canvas.drawRightString(192*mm,11*mm,str(doc.page))
SimpleDocTemplate(str(OUT),rightMargin=18*mm,leftMargin=18*mm,topMargin=15*mm,bottomMargin=18*mm,title='Skillomate iOS 31 and Android 25 comparison').build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
