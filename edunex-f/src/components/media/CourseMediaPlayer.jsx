import { PlayerIcon } from './PlayerIcon';
import { useEffect, useRef, useState } from 'react';
import { loadHlsJs } from '../../lib/hlsRuntime';
import { usePlaybackAccess } from '../../hooks/usePlaybackAccess';
import { useLearningProgress } from '../../hooks/useLearningProgress';
import { clock, seekTarget, adjacent, nativeLessonSource } from './playerRules';
import './player.css';

const QUALITY_PRESETS = [120, 240, 360, 480, 720, 1080];

export function CourseMediaPlayer({ course, lesson, lessonIndex, autoNext, autoplay = false, onEnded, onNavigateLesson, onFallback, mobileViewMode = null, onToggleMobileView, onControlsVisibilityChange }) {
  const access = usePlaybackAccess(course._id, lesson);
  const videoRef = useRef(null), frameRef = useRef(null), hlsRef = useRef(null), hideTimer = useRef(), sleepTimer = useRef();
  const settingsButton = useRef(null), restored = useRef(false), latest = useRef({}), qualityPreference = useRef(720);
  const [time,setTime] = useState({current:0,duration:0});
  const [playing,setPlaying] = useState(false), [buffering,setBuffering] = useState(false);
  const [error,setError] = useState(''), [notice,setNotice] = useState('');
  const [awake,setAwake] = useState(true), [menu,setMenu] = useState(false);
  const [rate,setRate] = useState(1), [loop,setLoop] = useState(false), [sleep,setSleep] = useState(0);
  const [volume,setVolume] = useState(1), [muted,setMuted] = useState(false);
  const [levels,setLevels] = useState([]), [quality,setQuality] = useState(720);
  const [captions,setCaptions] = useState([]), [caption,setCaption] = useState(-1);
  const tapRef = useRef(null), tapTimer = useRef(null);
  const [fullscreen,setFullscreen] = useState(false), [buffered,setBuffered] = useState(0);
  const progress = useLearningProgress(course._id, String(lesson._id), time, playing);
  const source = lesson.provider === "aws_cloudfront" ? access.lesson.hlsUrl : nativeLessonSource(lesson);
  const isHls = /\.m3u8(?:%20)*(?:[?#]|$)/i.test(source || "");
  const [reload,setReload] = useState(0);
  latest.current = {time,playing,rate,loop,volume,muted,autoNext,onEnded};
  function wake() { setAwake(true);clearTimeout(hideTimer.current);hideTimer.current=setTimeout(()=>setAwake(false),2600); }
  useEffect(()=>{wake();return()=>clearTimeout(hideTimer.current);},[playing]);
  useEffect(()=>()=>clearTimeout(sleepTimer.current),[]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>{
    const frame=frameRef.current, wrapper=frame?.closest('#playerFrame');
    const sync=()=>{
      const active=document.fullscreenElement || document.webkitFullscreenElement;
      const expanded=Boolean(active && (active===frame || active.contains?.(frame)) || wrapper?.classList.contains('is-app-fullscreen'));
      setFullscreen(expanded);
    };
    const observer=new MutationObserver(sync);
    if(wrapper)observer.observe(wrapper,{attributes:true,attributeFilter:['class']});
    document.addEventListener('fullscreenchange',sync);
    document.addEventListener('webkitfullscreenchange',sync);sync();
    return()=>{observer.disconnect();document.removeEventListener('fullscreenchange',sync);document.removeEventListener('webkitfullscreenchange',sync);};
  },[]);
  useEffect(()=>{
    const video=videoRef.current;if(!source||!video)return;
    let stopped=false,engine,mediaRecoveries=0;
    const saved=latest.current,position=saved.time.current,wasPlaying=saved.playing;
    setError('');setBuffering(true);setLevels([]);setCaptions([]);setCaption(-1);
    video.volume=saved.volume;video.muted=saved.muted;video.playbackRate=saved.rate;video.loop=saved.loop;
    const sync=()=>{setTime({current:video.currentTime||0,duration:Number.isFinite(video.duration)?video.duration:0});let end=0;for(let i=0;i<video.buffered.length;i++)if(video.buffered.start(i)<=video.currentTime&&video.buffered.end(i)>=video.currentTime)end=video.buffered.end(i);setBuffered(end);};
    const ready=()=>{if(position>0)video.currentTime=seekTarget(position,video.duration);setBuffering(false);sync();tracks();if(wasPlaying)video.play().catch(()=>setNotice('Press play to continue.'));};
    const play=()=>{setPlaying(true);setBuffering(false);};
    const pause=()=>setPlaying(false);
    const ended=()=>{setPlaying(false);sync();window.dispatchEvent(new Event('learning-flush'));if(!latest.current.loop&&latest.current.autoNext)latest.current.onEnded?.();};
    const failed=(detail='')=>{video.pause();setError(typeof detail==='string'&&detail ? detail : 'Playback could not start. Retry to refresh your video access.');setBuffering(false);setPlaying(false);};
    const tracks=()=>{if(!engine)setCaptions(Array.from(video.textTracks).map((track,index)=>({index,label:track.label||track.language||`Track ${index+1}`})));};
    const listeners={loadedmetadata:ready,timeupdate:sync,progress:sync,playing:play,pause,ended,error:failed,waiting:()=>setBuffering(true),canplay:()=>setBuffering(false),volumechange:()=>{setMuted(video.muted);setVolume(video.volume);}};
    Object.entries(listeners).forEach(([name,fn])=>video.addEventListener(name,fn));
    video.textTracks.addEventListener('addtrack',tracks);
    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl');
    // Device emulation can spoof Safari; select the engine by capability.
    if(!isHls)video.src=source;
    else loadHlsJs().then(Hls=>{
      if(stopped)return;if(!Hls.isSupported()){if(nativeHls)video.src=source;else failed();return;}
      engine=new Hls({enableWorker:true,maxBufferLength:30});hlsRef.current=engine;
      engine.on(Hls.Events.MANIFEST_PARSED,(_,data)=>{
        const nextLevels=data.levels
          .map((level,index)=>({index,height:Number(level.height)||0}))
          .filter(level=>QUALITY_PRESETS.includes(level.height))
          .filter((level,index,list)=>list.findIndex(item=>item.height===level.height)===index)
          .sort((a,b)=>a.height-b.height);
        setLevels(nextLevels);
        const target=qualityPreference.current;
        const preferred=nextLevels.find(level=>level.height===target) || nextLevels.reduce((best,level)=>!best||Math.abs(level.height-target)<Math.abs(best.height-target)?level:best,null);
        if(preferred)engine.currentLevel=preferred.index;
      });
      engine.on(Hls.Events.SUBTITLE_TRACKS_UPDATED,(_,data)=>setCaptions(data.subtitleTracks.map((track,index)=>({index,label:track.name||track.lang||`Track ${index+1}`}))));
      engine.on(Hls.Events.ERROR,(_,data)=>{if(!data.fatal)return;if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&mediaRecoveries++<2)engine.recoverMediaError();else{engine.stopLoad();const status=data.response?.code;failed(status===401||status===403?'Video access was rejected. Retry to renew access.':status===404?'The video file could not be found. Please contact support.':`Video could not load (${data.details || 'stream error'}). Retry playback.`);}});
      engine.loadSource(source);engine.attachMedia(video);
    }).catch(()=>{if(!stopped)failed();});
    return()=>{stopped=true;Object.entries(listeners).forEach(([name,fn])=>video.removeEventListener(name,fn));video.textTracks.removeEventListener('addtrack',tracks);engine?.destroy();hlsRef.current=null;video.pause();video.removeAttribute('src');video.load();};
  },[source,isHls,reload]);
  useEffect(()=>{
    const video=videoRef.current;
    if(restored.current||progress.resume===null||!time.duration||!video)return;
    restored.current=true;
    if(progress.resume>0&&progress.resume<time.duration-2)video.currentTime=seekTarget(progress.resume,time.duration);
    if(autoplay)video.play().catch(()=>{video.muted=true;setMuted(true);video.play().catch(()=>setNotice("Press play to continue."));});
  },[progress.resume,time.duration,autoplay]);
  useEffect(()=>{const video=videoRef.current;if(video){video.playbackRate=rate;video.loop=loop;}},[rate,loop]);
  useEffect(()=>{if(access.error){videoRef.current?.pause();setBuffering(false);}},[access.error]);
  function toggle(){const video=videoRef.current;if(!video||!source||access.error||error)return;if(video.paused)video.play().catch(()=>setNotice('Playback could not start. Press play or retry.'));else video.pause();wake();}
  useEffect(()=>()=>clearTimeout(tapTimer.current),[]);
  function videoTap(event){
    wake();
    const rect=event.currentTarget.getBoundingClientRect();
    const fraction=rect.width ? (event.clientX-rect.left)/rect.width : .5;
    const side=fraction<.35 ? -1 : fraction>.65 ? 1 : 0;
    const now=Date.now();
    if(tapRef.current?.side===side && now-tapRef.current.at<300){
      clearTimeout(tapTimer.current);tapRef.current=null;
      if(side){seek(side*10,true);setNotice(side<0?'−10 seconds':'+10 seconds');}
      else full();
      return;
    }
    clearTimeout(tapTimer.current);tapRef.current={side,at:now};
    tapTimer.current=setTimeout(()=>{tapRef.current=null;toggle();},300);
  }
  function seek(delta,preservePlayback=true){
    const video=videoRef.current;if(!video)return;
    const shouldContinue=preservePlayback&&(latest.current.playing||(!video.paused&&!video.ended));
    video.currentTime=seekTarget(video.currentTime+delta,time.duration);
    if(shouldContinue)video.play().catch(()=>setNotice('Playback could not resume after seeking.'));
    wake();
  }
  async function full(){try{const wrapper=frameRef.current.closest('#playerFrame');const target=wrapper||frameRef.current;if(wrapper?.classList.contains('is-app-fullscreen')){wrapper.classList.remove('is-app-fullscreen');document.body.classList.remove('has-edunex-player-fullscreen');return;}if(document.fullscreenElement)await document.exitFullscreen();else if(target?.requestFullscreen)await target.requestFullscreen();else if(target?.webkitRequestFullscreen)await target.webkitRequestFullscreen();else if(videoRef.current.webkitEnterFullscreen)videoRef.current.webkitEnterFullscreen();else setNotice('Fullscreen is unavailable on this device.');}catch{setNotice('Fullscreen is unavailable on this device.');}}
  function sleepAfter(minutes){clearTimeout(sleepTimer.current);setSleep(minutes);if(minutes)sleepTimer.current=setTimeout(()=>{videoRef.current?.pause();setSleep(0);setNotice('Sleep timer paused playback.');},minutes*60000);}
  function changeVolume(value){
    const video=videoRef.current;if(!video)return;
    const next=Math.max(0,Math.min(1,Number(value)||0)),nextMuted=next===0;
    setVolume(next);setMuted(nextMuted);
    video.volume=next;video.muted=nextMuted;
    wake();
  }
  function toggleMute(){
    const video=videoRef.current;if(!video)return;
    const nextMuted=!video.muted && video.volume>0;
    const nextVolume=!nextMuted&&video.volume===0?.75:video.volume;
    setMuted(nextMuted);setVolume(nextVolume);
    video.volume=nextVolume;video.muted=nextMuted;
    wake();
  }
  function selectQuality(height){
    qualityPreference.current=height;
    setQuality(height);
    const level=levels.find(item=>item.height===height) || levels.reduce((best,item)=>!best||Math.abs(item.height-height)<Math.abs(best.height-height)?item:best,null);
    if(level&&hlsRef.current)hlsRef.current.currentLevel=level.index;
  }
  function closeMenu(){setMenu(false);settingsButton.current?.focus();}
  function key(event){if(event.altKey||event.ctrlKey||event.metaKey)return;if(event.key==='Escape'){closeMenu();return;}if(event.target.closest('input,select,textarea,button,[contenteditable]'))return;const k=event.key.toLowerCase();if([' ','k','arrowleft','arrowright','m','f'].includes(k)){event.preventDefault();event.stopPropagation();wake();if(k===' '||k==='k')toggle();if(k==='arrowleft')seek(-10);if(k==='arrowright')seek(10);if(k==='m')videoRef.current.muted=!videoRef.current.muted;if(k==='f')full();}}
  const failure=access.error||error,visible=awake||!playing||menu||!!failure;
  useEffect(()=>{onControlsVisibilityChange?.(visible);},[visible,onControlsVisibilityChange]);
  return <section className={`sm-player ${visible?'sm-awake':''} ${fullscreen?'sm-fullscreen':''}`} ref={frameRef} tabIndex={0} aria-label={`${lesson.title} video player`} onKeyDown={key} onPointerMove={wake} onPointerDown={wake} onFocus={wake}>
    <video ref={videoRef} playsInline preload="metadata" aria-label={lesson.title} onClick={videoTap} onDoubleClick={event=>event.preventDefault()}/>
    <div className="sm-player-heading" aria-hidden={!visible}>
      <span>Lecture {lessonIndex + 1}</span>
      <strong>{lesson.title || course.title || `Lecture ${lessonIndex + 1}`}</strong>
    </div>
    {!source&&!failure?<div className="sm-status" role="status">Authorizing playback…</div>:null}
    {!playing&&!buffering&&!failure&&source?<button className="sm-big-play" onClick={toggle} aria-label={time.current > 0 ? "Resume video" : "Start video"}><PlayerIcon name="play"/></button>:null}
    {buffering&&!failure?<div className="sm-status" role="status">Loading video…</div>:null}
    {failure?<div className="sm-failure" role="alert"><p>{failure}</p><button onClick={()=>{setError('');if(lesson.provider==='aws_cloudfront')access.retry();else setReload(n=>n+1);}}>Retry playback</button>{onFallback?<button onClick={onFallback}>Use compatible player</button>:null}</div>:null}
    {notice?<div className="sm-notice" role="status">{notice}</div>:null}
    {menu?<div className="sm-settings" aria-label="Player settings">
      <div className="sm-settings-header"><span>Playback settings</span><button onClick={closeMenu} aria-label="Close settings">×</button></div>
      <div className="sm-setting-section">
        <span className="sm-setting-label">Playback speed</span>
        <div className="sm-setting-options" role="radiogroup" aria-label="Playback speed">
          {[.25,.5,.75,1,1.25,1.5,1.75,2].map(n=>{const label=n===1?'Normal':`${n}×`;return <button type="button" role="radio" aria-checked={rate===n} aria-label={`Playback speed ${label}`} className={rate===n?'is-selected':''} key={n} onClick={()=>setRate(n)}>{label}</button>;})}
        </div>
      </div>
      <div className="sm-setting-section">
        <span className="sm-setting-label">Quality</span>
        <div className="sm-setting-options" role="radiogroup" aria-label="Quality">
          {QUALITY_PRESETS.map(height=><button type="button" role="radio" aria-checked={quality===height} aria-label={`Quality ${height}p`} className={quality===height?'is-selected':''} key={height} onClick={()=>selectQuality(height)}>{height}p</button>)}
        </div>
      </div>
      <label className="sm-setting-section sm-setting-toggle">Loop lesson<input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/></label>
      <div className="sm-setting-section">
        <span className="sm-setting-label">Sleep timer</span>
        <div className="sm-setting-options" role="radiogroup" aria-label="Sleep timer">
          {[0,15,30,45,60].map(n=>{const label=n?`${n} min`:'Off';return <button type="button" role="radio" aria-checked={sleep===n} aria-label={`Sleep timer ${n?`${n} minutes`:'Off'}`} className={sleep===n?'is-selected':''} key={n} onClick={()=>sleepAfter(n)}>{label}</button>;})}
        </div>
      </div>
    </div>:null}
    <div className="sm-controls">
      <input className="sm-seek" aria-label="Seek video" type="range" min="0" max={time.duration||1} step="0.1" disabled={!time.duration} value={Math.min(time.current,time.duration||1)} style={{'--sm-progress':`${time.duration?time.current/time.duration*100:0}%`,'--sm-buffered':`${time.duration?Math.min(100,buffered/time.duration*100):0}%`}} onChange={e=>{videoRef.current.currentTime=seekTarget(Number(e.target.value),time.duration);wake();}}/>
      <div className="sm-row">
        <button className="sm-play-button" onClick={toggle} aria-label={playing?'Pause':'Play'} disabled={!source||!!failure}><PlayerIcon name={playing?'pause':'play'}/></button>
        <button className="sm-skip" onClick={()=>seek(-10)} aria-label="Rewind 10 seconds"><PlayerIcon name="back"/></button><button className="sm-skip" onClick={()=>seek(10)} aria-label="Forward 10 seconds"><PlayerIcon name="forward"/></button>
        <button className="sm-volume-button" onClick={toggleMute} aria-label={muted||volume===0?'Unmute':'Mute'}><PlayerIcon name={muted||volume===0?'mute':'volume'}/></button>
        <input className="sm-volume" aria-label="Volume" type="range" min="0" max="1" step=".05" value={muted?0:volume} onInput={e=>changeVolume(e.currentTarget.value)} onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}/>
        <span className="sm-time">{clock(time.current)} / {clock(time.duration)}</span><span className="sm-spacer"/>
        <button className="sm-lesson-nav" onClick={()=>onNavigateLesson(-1)} disabled={adjacent(course.videos,lessonIndex,-1)===lessonIndex} aria-label="Previous lesson"><PlayerIcon name="previous"/></button>
        <button className="sm-lesson-nav" onClick={()=>onNavigateLesson(1)} disabled={adjacent(course.videos,lessonIndex,1)===lessonIndex} aria-label="Next lesson"><PlayerIcon name="next"/></button>
        {captions.length?<label className="sm-captions">CC<select aria-label="Captions" value={caption} onChange={e=>{const n=Number(e.target.value);if(hlsRef.current)hlsRef.current.subtitleTrack=n;else Array.from(videoRef.current.textTracks).forEach((track,i)=>{track.mode=i===n?'showing':'disabled';});setCaption(n);}}><option value={-1}>Off</option>{captions.map(c=><option key={c.index} value={c.index}>{c.label}</option>)}</select></label>:null}
        <button className="sm-settings-button" ref={settingsButton} onClick={()=>setMenu(v=>!v)} aria-label="Player settings" aria-expanded={menu}><PlayerIcon name="settings"/></button>
        {onToggleMobileView ? <button className="sm-view-mode-button" onClick={onToggleMobileView} aria-label={mobileViewMode==='immersive'?'Minimize player':'Open fullscreen player'}><PlayerIcon name={mobileViewMode==='immersive'?'minimize':'fullscreen'}/></button> : <button className="sm-fullscreen-button" onClick={full} aria-label={fullscreen?'Exit fullscreen':'Fullscreen'}><PlayerIcon name="fullscreen"/></button>}
      </div>
    </div>
  </section>;
}
