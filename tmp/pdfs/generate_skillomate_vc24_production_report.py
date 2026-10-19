import json,pathlib
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
v=json.load(open('tmp/aab-vc24/verification.json'))
out='output/pdf/skillomate-1.0-vc24-vs-vc23-comparison-2026-10-16.pdf'
s=getSampleStyleSheet();s.add(ParagraphStyle(name='SmallText',fontName='Helvetica',fontSize=8.5,leading=11.5,spaceAfter=6));body=s['SmallText']
def p(t):return Paragraph(escape(t),body)
story=[Paragraph('Skillomate Android release',s['Title']),p('Version 1.0 | Version code 23 to 24 | 16 October 2026'),Spacer(1,10)]
def section(title,text):story.extend([Paragraph(title,s['Heading2']),p(text)])
section('Build result','A signed production Android App Bundle was generated from the current appcopyai workspace (source commit e912b0c, plus the two version configuration edits). Package: com.skillomate.app. Version name remains 1.0; Android version code is now 24.')
rows=[['Property','Previous AAB','New AAB'],['Version','1.0 / code 23','1.0 / code 24'],['Size',f"{v['previous']['bytes']/1048576:.2f} MiB",f"{v['new']['bytes']/1048576:.2f} MiB"],['Signing certificate','Existing release certificate','Matches code 23'],['JavaScript bundle','Previous bundled app code','Current workspace app code']]
t=Table([[p(c) for c in row] for row in rows],colWidths=[125,180,180]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8eef5')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#cbd5e1')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),5)]));story.append(t)
section('Code and feature changes','This build request changes appcopyai/app.json and android/app/build.gradle from version code 23 to 24. It also packages existing app changes made since the earlier bundle; no additional feature code was authored for this request.')
for text in [
'AvatarImage now displays a default avatar underneath remote images and falls back when loading fails.',
'Home and course-list layouts add bottom navigation clearance. Tablet navigation and course cards have revised sizing, spacing, and responsive thumbnail heights.',
'Lecture playback now refreshes the server screen-capture policy on entry, every 30 seconds, and when the app becomes active. It blocks capture if the policy cannot be fetched, then restores capture when leaving playback.',
'iOS development API routing now defaults to the production API unless explicitly overridden. This shared-source change is included but is not an Android release behavior change.',
'Build tooling includes @react-native/metro-config ^0.86.3 and corresponding lockfile changes. Existing arm64-v8a, Hermes, minimum SDK 24 and target SDK 36 settings are retained.'
]:story.append(p('- '+text))
section('Comparison scope','The previous artifact is Skillomate-1.0-vc23-production.aab (last modified 12 October 2026). Artifact manifests, bundle hashes and signing certificates were compared directly. Source changes were reviewed using repository history around that release; the exact source commit for the previous AAB is not embedded as a verified provenance record, so source-history observations are not an exact reconstruction of that build.')
section('Testing and verification','Gradle :app:bundleRelease --offline --console=plain completed successfully. Metro compiled the current JavaScript. Both ZIP archives passed integrity checks. The new AAB manifest was decoded and verified as com.skillomate.app, versionName 1.0, versionCode 24. jarsigner verified the new bundle signature, and its signing certificate SHA-256 matches the previous AAB. git diff --check passed.')
section('Build notes and limits','The first attempt failed during native C++ compilation. The release was rebuilt with two Gradle workers and NODE_ENV=production. Dependency deprecation, manifest merge and SDK XML compatibility warnings were observed; no build errors remained in the successful run. Device installation, authenticated user flows, payments, and Play Console acceptance were not tested during this build task. Backend changes are not deployed by generating this AAB.')
section('Artifacts and integrity','AAB: appcopyai/releases/android/Skillomate-1.0-vc24-production.aab')
story.append(p('New AAB SHA-256: '+v['new']['sha256']))
story.append(p('Previous AAB SHA-256: '+v['previous']['sha256']))
def foot(c,d):
 c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#64748b'));c.drawString(42,25,'Skillomate | Android release comparison | 16 October 2026');c.drawRightString(A4[0]-42,25,str(d.page))
SimpleDocTemplate(out,pagesize=A4,rightMargin=42,leftMargin=42,topMargin=36,bottomMargin=42,title='Skillomate 1.0 vc24 vs vc23').build(story,onFirstPage=foot,onLaterPages=foot)
print(out)
