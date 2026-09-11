import { useEffect, useRef, useState } from 'react';
import { loadHlsJs } from '../../lib/hlsRuntime';
import { adminJson, api } from './adminApi';
export function VideoPreview({ video, onClose }) {
  const ref=useRef(null);const [source,setSource]=useState(null),[error,setError]=useState(''),[ready,setReady]=useState(false);
  useEffect(()=>{let stopped=false;adminJson('/api/admin/playback-preview',{method:'POST',body:JSON.stringify(video)}).then(data=>{if(!stopped)setSource(data);}).catch(e=>{if(!stopped)setError(e.message);});return()=>{stopped=true;};},[video]);
  useEffect(()=>{
    if(!source?.hlsUrl||!ref.current)return;
    let stopped=false,hls;const element=ref.current,url=api(source.hlsUrl);
    const failed=()=>setError('Preview failed. Check the exact object path, CloudFront CORS and signing configuration.');
    element.addEventListener('error',failed);
    if(element.canPlayType('application/vnd.apple.mpegurl'))element.src=url;
    else loadHlsJs().then(Hls=>{if(stopped)return;if(!Hls.isSupported()){failed();return;}hls=new Hls();hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)failed();});hls.loadSource(url);hls.attachMedia(element);}).catch(failed);
    return()=>{stopped=true;hls?.destroy();element.removeEventListener('error',failed);};
  },[source]);
  return <section className="form-section" aria-label="Lesson preview"><div className="toolbar-actions"><h3>Preview: {video.title}</h3><button type="button" className="toolbar-button" onClick={onClose}>Close preview</button></div>
    <p role="status">{error||(!source?'Authorizing preview…':ready?'Video metadata loaded. Play to check picture and sound.':'Loading video…')}</p>
    {source?.hlsUrl?<video ref={ref} controls playsInline onLoadedMetadata={()=>setReady(true)} style={{width:'100%',maxHeight:440,background:'#000'}}/>:source?.embedUrl?<iframe title={video.title} src={source.embedUrl} allow="fullscreen; autoplay" allowFullScreen style={{width:'100%',height:360,border:0}} onLoad={()=>setReady(true)}/>:null}
    <small>Preview does not record learner progress. A loaded frame is not proof of complete playback.</small>
  </section>;
}
