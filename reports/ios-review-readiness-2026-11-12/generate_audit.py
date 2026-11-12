"""Reproduce the clause accounting and read-only source configuration inventory."""
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import plistlib
import re
from collections import Counter

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent.parent

class Node:
    def __init__(self, tag, attrs, parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []
    def text(self, own=False):
        return ' '.join(''.join(c.text() if isinstance(c, Node) else c for c in self.children
                              if not own or not isinstance(c, Node) or c.tag not in ('ul', 'ol')).split())

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(); self.stack = [Node('root', [])]; self.nodes = []
    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.stack[-1]); self.stack[-1].children.append(n); self.nodes.append(n)
        if tag not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'):
            self.stack.append(n)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]; break
    def handle_data(self, value): self.stack[-1].children.append(value)

p = Parser(); p.feed((OUT/'evidence/apple-guidelines.html').read_text())
active = False; rows = []; known = {}; major = 0; labels = Counter(); encountered = 0
for n in p.nodes:
    if n.attrs.get('id') == 'safety': active = True
    if n.attrs.get('id') == 'after-you-submit': active = False
    if not active or n.tag != 'li': continue
    encountered += 1
    text = n.text(own=True)
    # A word boundary after ')' is not meaningful; use an explicit numeric prefix.
    m = re.match(r'([1-5](?:\.[0-9]+)+(?:\([a-z]+\))?)(?:\s|:|$)', text)
    parent = n.parent
    while parent and id(parent) not in known: parent = parent.parent
    if m: label = m[1]; base = label
    elif parent:
        pr = known[id(parent)]; base = pr['base']
        letter = re.match(r'^\(([a-z]+)\)', text)
        siblings = [c for c in n.parent.children if isinstance(c, Node) and c.tag == 'li']
        lists = [c for c in n.parent.parent.children if isinstance(c, Node) and c.tag in ('ul', 'ol')]
        label = pr['id'] + (f'({letter[1]})' if letter else f'/list-{lists.index(n.parent)+1}/bullet-{siblings.index(n)+1}')
    else: continue
    labels[label] += 1
    if labels[label] > 1: label += f'/occurrence-{labels[label]}'
    anchor = n.attrs.get('id') or (known[id(parent)]['anchor'] if parent else base)
    if not anchor: anchor = base
    row = dict(id=label, base=base, anchor=anchor, sourceText=text)
    if m: major += 1
    rows.append(row); known[id(n)] = row

def assess(base, text):
    if 'Intentionally omitted' in text: return 'OMITTED', 'Apple intentionally leaves this clause unused.'
    if base.startswith('1.1') or base in ('1.2','1.4','1.4.3','1.4.5'):
        return 'PARTIAL', 'Nex input/output safety and reporting controls exist; final course/output sampling and timely moderation operations need evidence (R10).'
    if base == '1.2.1': return 'PENDING', 'Confirm whether instructor/creator publishing qualifies; no public learner feed found. If applicable, validate moderation, age restriction and StoreKit treatment (R10).'
    if base == '1.3': return 'CONDITIONAL_NA', 'Education category with 13+ terms, not Kids Category. Minor privacy remains applicable under 5.1.4 (R19).'
    if base in ('1.4.1','1.4.2','1.4.4','1.7'): return 'CONDITIONAL_NA', 'No medical diagnosis/dosage, checkpoint or criminal-activity reporting feature identified; reassess if course or AI capabilities introduce one.'
    if base == '1.5': return 'PARTIAL', 'Support email/contact exists on app and public policy; verify live support URL and responsive support handling on build 35 (R16).'
    if base == '1.6': return 'PARTIAL', 'TLS, SecureStore, session revocation, rate limits and authorization tests pass; final archive, deployment and operational security evidence remains (R01/R06/R18).'
    if base in ('2.1','2.3','2.3.1','2.5.19'): return 'BLOCKED', 'Build 35 is Waiting for Review with unfinished draft notes; source is build 34 and final-artifact/deployment/device evidence is missing (B1-B4; R01-R03).'
    if base == '2.2': return 'PENDING', 'TestFlight entry exists, but completeness and absence of prototype/placeholder behavior in submitted 35 were not exercised (R02/R14).'
    if base.startswith('2.3'):
        notes = {
            '2.3.2':'Description promotes AI/course features without explicit purchase qualification in inspected text; confirm paid-feature disclosures across listing, screenshots and IAP marketing.',
            '2.3.3':'Final iPhone/iPad screenshots were not visually compared with build 35.',
            '2.3.4':'Determine whether previews are uploaded; inspect each against actual candidate screen captures if present.',
            '2.3.5':'Live category Education fits inspected course service; confirm any secondary classification.',
            '2.3.6':'Live 13+ rating and regional equivalents verified; questionnaire accuracy and actual AI/course content still require validation.',
            '2.3.7':'Skillomate name is within 30 characters; keywords inspected, final claims and trademark rights require owner confirmation.',
            '2.3.8':'Final icons/screenshots/creative assets need all-audience content review; no Kids classification claimed.',
            '2.3.9':'Content-rights declaration is saved; underlying asset/person/instructor permissions remain unverified.',
            '2.3.10':'Current iOS source branches by platform; final screenshots and bundle must be checked for Android or irrelevant platform promotion.',
            '2.3.11':'No preorder was established; verify release configuration before claiming exclusion.',
            '2.3.12':'Confirm new-version notes accurately match build 35; current review draft is inconsistent with submitted state.',
            '2.3.13':'No in-app event was identified in inspected source; Connect event configuration not independently audited.',
            '2.3.14':'Creative asset UI is available; final uploaded header/search assets were not visually reviewed.'}
        return 'PARTIAL' if base in ('2.3.5','2.3.6','2.3.7') else 'PENDING', notes.get(base,'Verify final metadata against build 35.')+' (R15/R17).'
    if base in ('2.4.3','2.4.5'): return 'CONDITIONAL_NA', 'Inspected release targets iOS/iPadOS, not a tvOS or Mac App Store product; reassess actual distribution compatibility.'
    if base.startswith('2.4'): return 'PENDING', 'iPad support/device family 1,2 is enabled. Physical supported-device layout, battery/thermal behavior, controls and interruptions are untested (R12-R14).'
    if base.startswith('2.5'):
        absent = {'2.5.8':'alternate home-screen environment','2.5.11':'SiriKit/Shortcuts integration','2.5.12':'CallKit/SMS filtering extension','2.5.13':'facial account authentication','2.5.16':'widget/extension or native push entitlement','2.5.17':'Matter pairing','2.5.18':'advertising SDK or ad extension'}
        if base in absent: return 'CONDITIONAL_NA', f'No {absent[base]} identified in inspected app dependencies/entitlements; validate submitted bundle scope (R18).'
        specific={'2.5.1':'Public native API and SDK/signature analysis must use submitted archive, not installed host Xcode.',
                  '2.5.2':'Local app source uses bundled JS; no OTA update package identified. Validate build-35 bundle and downloaded material handling.',
                  '2.5.3':'No malicious-code behavior identified; signed artifact/dependency provenance still requires validation.',
                  '2.5.4':'Inspect actual background modes and verify playback/PiP/lifecycle behavior.',
                  '2.5.5':'IPv6-only NAT64/DNS64 and poor/offline networking were not exercised.',
                  '2.5.6':'React Native WebView is present; confirm WebKit-based behavior and third-party page restrictions in actual binary.',
                  '2.5.9':'Check volume/silent/back/player control behavior on physical devices.',
                  '2.5.14':'No recording permission requested in source; app capture prevention is separate. Confirm no undisclosed capture/logging SDK in archive.',
                  '2.5.15':'System image picker exists for optional profile selection; verify file-provider behavior for any generic file-selection flow.'}
        return 'PARTIAL', specific.get(base,'Final native artifact/runtime verification remains open.')+' (R12-R14/R18).'
    if base in ('3.1','3.1.1','3.1.2','3.1.2(a)','3.1.2(b)','3.1.2(c)'):
        return 'PARTIAL', 'StoreKit monthly product, localized disclosure, restore and server ownership/lifecycle tests pass; sandbox purchase/restore/offers, device access and subscription value remain unverified (R04-R08).'
    if base in ('3.1.1(a)','3.1.3','3.1.3(a)','3.1.3(b)'):
        return 'PENDING', 'Do not assume reader exemption or regional entitlement. Cross-platform membership and linked legal pages with Pricing navigation need storefront-specific end-to-end review (R08/R16/R19).'
    if base.startswith('3.1.3') or base in ('3.1.4','3.1.5'):
        return 'CONDITIONAL_NA', 'No enterprise-only sales, live person-to-person service, physical commerce, web-tool companion exception, ad-management service, hardware unlocking or crypto identified; core digital course access uses StoreKit.'
    if base.startswith('3.2'):
        if any(w in text.lower() for w in ('wallet passes','insurance apps','nonprofits','monetary gift','financial trading','binary options','personal loans')):
            return 'CONDITIONAL_NA', 'No corresponding regulated finance, fundraising, gifting or Wallet product was identified in course-app scope.'
        return 'PENDING', 'Validate fair course access, no coerced reviews/tasks or duplicate billing, country/phone restrictions and honest business claims. No manipulation flow identified in inspected source (R08/R19/R20).'
    if base in ('4.1','4.3'): return 'PENDING', 'Owner must confirm original branding, uniqueness and account/app portfolio practices; source tests cannot prove rights or absence of duplicate submissions (R17/R20).'
    if base in ('4.2.1','4.2.7'): return 'CONDITIONAL_NA', 'No ARKit or remote-desktop product identified in inspected app.'
    if base.startswith('4.2'): return 'PARTIAL', 'Native course playback/downloads/progress/AI provide functionality in source; final 35 usability, standalone behavior and content-provider submission identity require proof (R02/R11/R20).'
    if base.startswith('4.4'): return 'CONDITIONAL_NA', 'No keyboard, Safari or other extension target identified; final bundle inspection remains R18.'
    if base in ('4.5.1','4.5.2','4.5.5'): return 'CONDITIONAL_NA', 'No Apple RSS scraping, Apple Music or Game Center identity integration identified.'
    if base.startswith('4.5'): return 'PENDING', 'Native push entitlement is absent in inspected source; verify actual Apple service usage, notification consent and branded/emoji assets in final bundle (R17/R18/R20).'
    if base.startswith('4.7'): return 'PENDING', 'Nex is a built-in AI tutor; no mini-app marketplace identified. Because this rule expressly includes chatbots, document applicability with Apple rather than blanket-excluding it. Verify reporting, moderation, consent, age controls and any hosted software index/API boundaries (R09/R10/R19).'
    if base == '4.8': return 'CONDITIONAL_NA', 'Own phone/password/OTP login found; no third-party social sign-in. Reassess if submitted 35 adds external login.'
    if base == '4.9': return 'CONDITIONAL_NA', 'No Apple Pay commerce in inspected iOS source; digital subscription uses StoreKit.'
    if base == '4.10': return 'PARTIAL', 'Membership sells educational content. Verify final UI does not sell permission grants or built-in OS functionality (R04/R12).'
    if base in ('5.1','5.1.1','5.1.2'):
        if '(v)' in text[:10] or 'Account Sign-In' in text:
            return 'PENDING', 'Guest catalogue and paid locks pass tests; Apple acceptance of remaining account/age/phone requirement is unresolved. Test immediate deletion and minimize required data (R03/R06/R19).'
        return 'BLOCKED', 'Local versioned consent, minimal provider payload, withdrawal, deletion and 13-type manifest have test evidence; production policy remains old and build-35/deployed behavior is unverified (B2-B5; R06/R09/R18/R19).'
    if base in ('5.1.3','5.1.5'): return 'CONDITIONAL_NA', 'No HealthKit/research/medical-record or GPS collection identified. Security logs contain IP addresses; verify deployed processing does not add location/health data.'
    if base == '5.1.4': return 'PENDING', '13+ rating does not resolve all minor-user requirements; confirm ages, parental involvement/data sharing and country obligations with actual audience/provider practices (R19).'
    if base.startswith('5.2'): return 'PENDING', 'Connect rights declaration is not licence evidence. Validate course/offline-media rights, artwork, portraits, voices, third-party tools and Apple branding against rights inventory (R17).'
    if base.startswith('5.3') or base in ('5.4','5.5'): return 'CONDITIONAL_NA', 'No sweepstakes/gambling/lottery, VPN or MDM product identified in inspected course app; reassess if actual content/features differ.'
    if base.startswith('5.6'): return 'PENDING', 'Verify support/report handling, honest reviewer notes, developer/operator authorization and absence of review/discovery manipulation. Draft notes currently misstate submission status (R16/R20; B1).'
    raise ValueError(f'No assessment assigned: {base}')

for row in rows: row['status'], row['assessment'] = assess(row['base'], row['sourceText'])
assert len(rows) == encountered, 'Some source list clauses lack accounting'
assert len({r['id'] for r in rows}) == len(rows), str([k for k,v in Counter(r['id'] for r in rows).items() if v>1])
(OUT/'evidence/guideline-inventory.json').write_text(json.dumps(rows, indent=2))
counts = Counter(r['status'] for r in rows)
lines = ['# Complete guideline coverage matrix', '',
         '12 November 2026. Every list clause under Apple sections 1-5 is assigned a status. This is coverage accounting; applicable release checks remain incomplete.', '',
         f'{major} explicitly numbered entries; {len(rows)} total entries including nested lettered/roman and unnumbered bullets. Counts: '+', '.join(f'{k}={v}' for k,v in sorted(counts.items()))+'.', '',
         'Read README.md for evidence scope, status definitions and blockers B1-B7. R01-R20 refer to RUNTIME_CHECKLIST.md. An inherited assessment applies to that clause specifically; it is not an executed runtime pass. Unnumbered bullets use generated /bullet-N positions. Parent paragraphs and introductions remain within their containing rule. Conditional exclusions are based on inspected source, not inspection of submitted build 35.', '',
         '| Clause | Status | App evidence and remaining verification |', '|---|---|---|']
for r in rows:
    lines.append(f"| [{r['id']}](https://developer.apple.com/app-store/review/guidelines/#{r['anchor']}) | {r['status']} | {r['assessment']} |")
(OUT/'GUIDELINE_MATRIX.md').write_text('\n'.join(lines)+'\n')

app = json.loads((ROOT/'appcopyai/app.json').read_text())['expo']
native = plistlib.loads((ROOT/'appcopyai/ios/ProtectedVideo/Info.plist').read_bytes())
privacy = plistlib.loads((ROOT/'appcopyai/ios/ProtectedVideo/PrivacyInfo.xcprivacy').read_bytes())
entitlements = plistlib.loads((ROOT/'appcopyai/ios/ProtectedVideo/ProtectedVideo.entitlements').read_bytes())
pbx = (ROOT/'appcopyai/ios/ProtectedVideo.xcodeproj/project.pbxproj').read_text()
config = dict(expoVersion=app['version'], expoBuild=app['ios']['buildNumber'],
              nativeBuilds=re.findall(r'CURRENT_PROJECT_VERSION = (\d+);', pbx),
              minimumIos=sorted(set(re.findall(r'IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);', pbx))),
              supportsTablet=app['ios']['supportsTablet'], nativeDeviceFamilies=re.findall(r'TARGETED_DEVICE_FAMILY = "([^"]+)";',pbx),
              bundleId=app['ios']['bundleIdentifier'], ats=native['NSAppTransportSecurity'],
              entitlements=entitlements, tracking=privacy['NSPrivacyTracking'],
              privacyTypes=privacy['NSPrivacyCollectedDataTypes'],
              requiredReasonApis=privacy['NSPrivacyAccessedAPITypes'],
              guidelineEntries=major, totalClauseEntries=len(rows), clauseStatuses=dict(counts))
assert config['expoBuild']=='34' and set(config['nativeBuilds'])=={'34'}
assert len({r['NSPrivacyCollectedDataType'] for r in config['privacyTypes']})==13
(OUT/'evidence/config-validation.json').write_text(json.dumps(config,indent=2))
tracked = ['appcopyai/App.js','appcopyai/app.json','appcopyai/ios/ProtectedVideo/PrivacyInfo.xcprivacy',
           'appcopyai/ios/ProtectedVideo.xcodeproj/project.pbxproj','edunex-b/tests/mobile-player.test.cjs',
           'edunex-b/services/aiConsent.js','edunex-b/services/aiProviderPrivacy.js','edunex-b/package-lock.json']
(OUT/'evidence/source-hashes.json').write_text(json.dumps({f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in tracked},indent=2))
print(json.dumps({'numbered':major,'totalClauses':len(rows),'statusCounts':dict(counts)}))
