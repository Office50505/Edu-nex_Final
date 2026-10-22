const fs=require('node:fs'),path=require('node:path');
const read=fs.readFileSync;const backend=process.cwd(),baseline=path.resolve(__dirname,'before/edunex-b');
fs.readFileSync=function(file,...args){if(typeof file==='string'&&file.startsWith(backend+path.sep)){const old=path.join(baseline,path.relative(backend,file));if(fs.existsSync(old)&&!file.includes('/tests/'))return read.call(this,old,...args);}return read.call(this,file,...args);};
