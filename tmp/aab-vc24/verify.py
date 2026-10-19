import zipfile, pathlib, hashlib, json, subprocess
root=pathlib.Path.cwd();old=root/'appcopyai/releases/android/Skillomate-1.0-vc23-production.aab';new=root/'appcopyai/releases/android/Skillomate-1.0-vc24-production.aab'
def vi(b,i):
 n=s=0
 while True:
  v=b[i];i+=1;n|=(v&127)<<s
  if v<128:return n,i
  s+=7
def fields(b):
 i=0;out={}
 while i<len(b):
  k,i=vi(b,i);t=k&7;k>>=3
  if t==2:
   n,i=vi(b,i);v=b[i:i+n];i+=n
  elif t==0:v,i=vi(b,i)
  elif t==1:v=b[i:i+8];i+=8
  elif t==5:v=b[i:i+4];i+=4
  else:raise ValueError(t)
  out.setdefault(k,[]).append(v)
 return out
def manifest(z):
 node=fields(z.read('base/manifest/AndroidManifest.xml'));el=fields(node[1][0]);a={}
 for raw in el[4]:
  v=fields(raw);a[v[2][0].decode()]=v.get(3,[b''])[0].decode()
 return a
result={}
for tag,p in [('previous',old),('new',new)]:
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  m=manifest(z);assert m['package']=='com.skillomate.app';assert m['versionName']=='1.0';assert m['versionCode']==('23' if tag=='previous' else '24')
  result[tag]={'filename':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'manifest':{k:m[k] for k in ['package','versionCode','versionName']},'bundle_sha256':hashlib.sha256(z.read('base/assets/index.android.bundle')).hexdigest()}
  cp=subprocess.run(['/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool','-printcert','-jarfile',str(p)],capture_output=True,text=True,check=True)
  result[tag]['signer_sha256']=next(l.strip() for l in cp.stdout.splitlines() if 'SHA256:' in l)
assert result['previous']['signer_sha256']==result['new']['signer_sha256'],'Signing certificate differs'
cp=subprocess.run(['/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/jarsigner','-verify',str(new)],capture_output=True,text=True,check=True)
assert 'jar verified.' in cp.stdout
result['signature_verified']=True
(root/'tmp/aab-vc24/verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
