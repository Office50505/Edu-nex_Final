from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from pathlib import Path
out=Path('output/pdf/Skillomate_Apple_Guest_Access_Comparison_2026-11-06.pdf')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleCustom',fontName='Helvetica-Bold',fontSize=25,leading=30,textColor=colors.HexColor('#152B45'),spaceAfter=14))
styles.add(ParagraphStyle(name='Deck',fontSize=11,leading=16,textColor=colors.HexColor('#526174'),spaceAfter=14))
styles.add(ParagraphStyle(name='SectionCustom',fontName='Helvetica-Bold',fontSize=14,leading=19,textColor=colors.HexColor('#152B45'),spaceBefore=14,spaceAfter=8))
styles.add(ParagraphStyle(name='BodyCustom',fontSize=10,leading=15,spaceAfter=8,textColor=colors.HexColor('#25354A')))
styles.add(ParagraphStyle(name='CellCustom',fontSize=9,leading=13,textColor=colors.HexColor('#25354A')))
styles.add(ParagraphStyle(name='SmallCustom',fontSize=8,leading=12,textColor=colors.HexColor('#526174'),spaceAfter=7))
story=[]
def p(text,style='BodyCustom'): return Paragraph(text,styles[style])
def add(text,style='BodyCustom'): story.append(p(text,style))
def heading(text): add(text,'SectionCustom')
def table(rows,widths):
 t=Table([[p(str(c),'CellCustom') for c in row] for row in rows],colWidths=widths,hAlign='LEFT',repeatRows=1)
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E7EDF4')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,0),0.6,colors.HexColor('#C7D3DF')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F5F8FB')])]))
 story.append(t)
def footer(c,doc):
 c.saveState(); w,h=doc.pagesize
 c.setStrokeColor(colors.HexColor('#CCD6E0'));c.line(44,42,w-44,42)
 c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#526174'))
 c.drawString(44,28,'SKILLOMATE  |  APPLE REVIEW REMEDIATION  |  6 NOVEMBER 2026')
 c.drawRightString(w-44,28,str(doc.page));c.restoreState()
add('Guest access for video courses','TitleCustom')
add('Previous implementation vs. updated source\n<br/>Apple Guideline 5.1.1(v) - 6 November 2026 (India)','Deck')
add('<b>Result:</b> The App Store app opens to public browsing. Users can view course details and watch public lessons without registering or submitting personal information. Account features and paid content retain their access checks.')
heading('Behavior comparison')
table([
 ['Area','Before this task','Updated implementation'],
 ['First launch','Login or registration required to enter the app.','Home and course browsing open after session restoration.'],
 ['Course catalogue','Reachable through the signed-in app flow.','Guests can browse/search published courses and open details.'],
 ['Video lessons','Course opening and lesson requests required an account and premium entitlement.','The first ordered lesson is a public introduction by default. Free courses and explicitly free lessons allow public playback.'],
 ['Paid lessons','Membership gate occurred before course details.','Lesson list stays visible. Premium lessons show membership options; playable sources remain protected.'],
 ['Optional sign-in','Login was the app entry point.','Account features explain sign-in; login has a visible Continue as Guest exit.'],
 ['Account separation','Home media enrichment could enter a shared catalogue cache.','Only public metadata enters that cache. Guest playback has no account progress writes.'],
], [87,186,234])
heading('Public content policy')
add('Published courses expose their first lesson by order unless <b>publicPreviewEnabled</b> is explicitly false. <b>accessType: free</b> makes a full course public; <b>videos[].isFree: true</b> exposes an additional lesson. Draft courses and foreign lesson IDs remain unavailable. Existing course documents need no migration for the default introductory preview.')
add('This deliberately changes the first lesson from protected content to a public preview. It does not make all premium courses free.','SmallCustom')
story.append(PageBreak())
add('Code changes and verification','TitleCustom')
add('Scope: appcopyai (App Store app) and the shared edunex-b backend. The legacy razorpay-app client was not modified.','Deck')
table([
 ['Source','Notable changes'],
 ['appcopyai/App.js','Guest-first routing; optional authentication; public lesson requests; free/premium labels; safe player filtering and index mapping; contextual account screens; null-user fixes; public-only Home cache; stale-response protection.'],
 ['edunex-b/services/ publicCourseAccess.js','Central policy for public lessons; paid metadata sanitization; ordered lessons; database projection without embedded image data.'],
 ['edunex-b/routes/ mobileCompat.js','Adds an unauthenticated public lesson-list endpoint, restricted to published courses.'],
 ['edunex-b/routes/ playback.js','Adds public playback grants and rechecks public eligibility and exact source before serving HLS playlists. Existing private playback and download authentication remain.'],
 ['edunex-b/models/Course.js and server.js','Adds course/lesson access flags. Admin create/update APIs validate their values and preserve lesson free-access flags on edits. No new admin form controls were added.'],
 ['Regression tests','New public policy, endpoint, navigation and mocked-render checks. Existing extracted-function fixtures updated for optional authentication.'],
], [160,347])
heading('Verification performed')
table([
 ['Check','Outcome'],
 ['Mobile regression suite','168 passed, including 10 new guest tests.'],
 ['Focused backend suite','58 passed, including 8 public course policy/route tests. Covers CloudFront, sessions, download grants, subscription access, playlists, admin lists and video imports.'],
 ['Production iOS bundle','expo export --platform ios passed; Hermes bundle generated.'],
 ['Source checks','Changed backend files pass node --check; git diff --check passes.'],
], [160,347])
heading('Security and privacy checks')
add('Tests confirm public requests require no user lookup and send no bearer token or user/session identity. Paid lesson payloads omit playable media and private resources. Public CloudFront grants carry course and lesson scope, use the existing expiry, and are revalidated for policy/source changes. Private playback and download routes still require authentication.')
story.append(PageBreak())
add('Release and review handoff','TitleCustom')
add('<b>Status:</b> Source fix and production JavaScript export verified. The backend has not been deployed, no signed IPA has been generated, and no App Store submission or review message has been sent.','Deck')
heading('Required release steps')
for x in [
 '1. Deploy the updated shared backend first. A backend without the new public endpoints cannot support guest playback.',
 '2. Generate the next signed iOS release through the established process with a fresh build number. This task leaves the existing iOS build number 33 unchanged.',
 '3. Test on a fresh iPhone and iPad install: browse/search courses, play free lessons, seek, return to lessons, dismiss sign-in and continue as guest.',
 '4. Verify paid lesson protection, login, subscription restore, active membership playback, downloads and account deletion. Log out and verify no previous account progress or downloads remain visible.',
 '5. Keep at least one working free lesson and all required backend/video services available during Apple review.',
]: add(x)
heading('Suggested App Review response')
add('Send only after deployment and device verification.','SmallCustom')
add('Thank you for identifying the issue under Guideline 5.1.1(v). We have revised the app so registration and login are optional for public course access. On a fresh launch, users can browse courses, open course details and watch lessons marked Free without entering personal information. The sign-in screen also includes Continue as Guest.')
add('To verify: launch the app without signing in, open Courses, choose a published course and tap its free introductory lesson. Registration remains limited to account features such as synced learning progress, profile and membership management. Paid lessons remain subject to purchase access. Please use the updated build for review.')
heading('Comparison baseline and limitations')
add('The previous implementation is the local working tree immediately before this task, including pre-existing uncommitted work. Unrelated changes were preserved. The exact binary reviewed by Apple was not supplied or inspected.')
add('Native-device visual QA and end-to-end delivery against the deployed backend remain outstanding. The simulator had an older EduNex app rather than a compatible current build. The automated rendering checks use mocked native components; the export validates bundling, not on-device behavior. Apple makes the final review decision.')
add('Companion handoff: reports/apple-guest-access-2026-11-06/RESUBMISSION.md<br/>Reference: https://developer.apple.com/app-store/review/guidelines/#5.1.1','SmallCustom')
doc=SimpleDocTemplate(str(out),pagesize=(595.28,841.89),rightMargin=44,leftMargin=44,topMargin=42,bottomMargin=56,title='Skillomate - Apple Guest Access Comparison',author='Skillomate Engineering')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
import fitz
pdf=fitz.open(out)
print('Pages:',len(pdf))
for i,page in enumerate(pdf):
 page.get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(f'tmp/pdfs/apple-guest-access/page-{i+1}.png')
print('Rendered all pages')
