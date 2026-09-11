import { PlayerIcon } from './PlayerIcon';
import { useEffect, useRef, useState } from 'react';
import { loadHlsJs } from '../../lib/hlsRuntime';
import { usePlaybackAccess } from '../../hooks/usePlaybackAccess';
import { useLearningProgress } from '../../hooks/useLearningProgress';
import { clock, seekTarget, adjacent, nativeLessonSource } from './playerRules';
import './player.css';

export function CourseMediaPlayer({ course, lesson, lessonIndex, autoNext, autoplay = false, onEnded, onNavigateLesson, onFallback }) {
  const access = usePlaybackAccess(course._id, lesson);
  const videoRef = useRef(null), frameRef = useRef(null), hlsRef = useRef(null), hideTimer = useRef(), sleepTimer = useRef();
  const settingsButton = useRef(null), restored = useRef(false), latest = useRef({});
  const [time,setTime] = useState({current:0,duration:0});
  const [playing,setPlaying] = useState(false), [buffering,setBuffering] = useState(false);
  const [error,setError] = useState(''), [notice,setNotice] = useState('');
  const [awake,setAwake] = useState(true), [menu,setMenu] = useState(false);
  const [rate,setRate] = useState(1), [loop,setLoop] = useState(false), [sleep,setSleep] = useState(0);
  const [volume,setVolume] = useState(1), [muted,setMuted] = useState(false);
  const [levels,setLevels] = useState([]), [quality,setQuality] = useState(-1);
  const [captions,setCaptions] = useState([]), [caption,setCaption] = useState(-1);
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
    const sync=()=>setFullscreen(document.fullscreenElement===frameRef.current);
    document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);
  },[]);
  useEffect(()=>{
    const video=videoRef.current;if(!source||!video)return;
    let stopped=false,engine,mediaRecoveries=0;
    const saved=latest.current,position=saved.time.current,wasPlaying=saved.playing;
    setError('');setBuffering(true);setLevels([]);setQuality(-1);setCaptions([]);setCaption(-1);
    video.volume=saved.volume;video.muted=saved.muted;video.playbackRate=saved.rate;video.loop=saved.loop;
    const sync=()=>{setTime({current:video.currentTime||0,duration:Number.isFinite(video.duration)?video.duration:0});let end=0;for(let i=0;i<video.buffered.length;i++)if(video.buffered.start(i)<=video.currentTime&&video.buffered.end(i)>=video.currentTime)end=video.buffered.end(i);setBuffered(end);};
    const ready=()=>{if(position>0)video.currentTime=seekTarget(position,video.duration);setBuffering(false);sync();tracks();if(wasPlaying)video.play().catch(()=>setNotice('Press play to continue.'));};
    const play=()=>{setPlaying(true);setBuffering(false);};
    const pause=()=>setPlaying(false);
    const ended=()=>{setPlaying(false);sync();window.dispatchEvent(new Event('learning-flush'));if(!latest.current.loop&&latest.current.autoNext)latest.current.onEnded?.();};
    const failed=()=>{video.pause();setError('Playback failed. Retry to refresh access, or contact support if it continues.');setBuffering(false);setPlaying(false);};
    const tracks=()=>{if(!engine)setCaptions(Array.from(video.textTracks).map((track,index)=>({index,label:track.label||track.language||`Track ${index+1}`})));};
    const listeners={loadedmetadata:ready,timeupdate:sync,progress:sync,playing:play,pause,ended,error:failed,waiting:()=>setBuffering(true),canplay:()=>setBuffering(false),volumechange:()=>{setMuted(video.muted);setVolume(video.volume);}};
    Object.entries(listeners).forEach(([name,fn])=>video.addEventListener(name,fn));
    video.textTracks.addEventListener('addtrack',tracks);
    if(!isHls || video.canPlayType('application/vnd.apple.mpegurl'))video.src=source;
    else loadHlsJs().then(Hls=>{
      if(stopped)return;if(!Hls.isSupported()){failed();return;}
      engine=new Hls({enableWorker:true,maxBufferLength:30});hlsRef.current=engine;
      engine.on(Hls.Events.MANIFEST_PARSED,(_,data)=>{setLevels(data.levels.map((level,index)=>({index,label:level.height?`${level.height}p`:`${Math.round(level.bitrate/1000)} kbps`})));});
      engine.on(Hls.Events.SUBTITLE_TRACKS_UPDATED,(_,data)=>setCaptions(data.subtitleTracks.map((track,index)=>({index,label:track.name||track.lang||`Track ${index+1}`}))));
      engine.on(Hls.Events.ERROR,(_,data)=>{if(!data.fatal)return;if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&mediaRecoveries++<2)engine.recoverMediaError();else{engine.stopLoad();failed();}});
      engine.loadSource(source);engine.attachMedia(video);
    }).catch(()=>{if(!stopped)failed();});
    return()=>{stopped=true;Object.entries(listeners).forEach(([name,fn])=>video.removeEventListener(name,fn));video.textTracks.removeEventListener('addtrack',tracks);engine?.destroy();hlsRef.current=null;video.pause();video.removeAttribute('src');video.load();};
  },[source,isHls,reload]);
  useEffect(()=>{
    const video=videoRef.current;
    if(restored.current||progress.resume===null||!time.duration||!video)return;
    restored.current=true;
    if(progress.resume>0&&progress.resume<time.duration-2)video.currentTime=seekTarget(progress.resume,time.duration);
    if(autoplay)video.play().catch(()=>setNotice("Press play to continue."));
  },[progress.resume,time.duration,autoplay]);
  useEffect(()=>{const video=videoRef.current;if(video){video.playbackRate=rate;video.loop=loop;}},[rate,loop]);
  useEffect(()=>{if(access.error){videoRef.current?.pause();setBuffering(false);}},[access.error]);
  function toggle(){const video=videoRef.current;if(!video||!source||access.error||error)return;if(video.paused)video.play().catch(()=>setNotice('Playback could not start. Press play or retry.'));else video.pause();wake();}
  function seek(delta){const video=videoRef.current;if(video)video.currentTime=seekTarget(video.currentTime+delta,time.duration);wake();}
  async function full(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(frameRef.current.requestFullscreen)await frameRef.current.requestFullscreen();else if(videoRef.current.webkitEnterFullscreen)videoRef.current.webkitEnterFullscreen();else setNotice('Fullscreen is unavailable on this device.');}catch{setNotice('Fullscreen is unavailable on this device.');}}
  async function pip(){try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else await videoRef.current.requestPictureInPicture();}catch{setNotice('Picture-in-picture is unavailable for this video.');}}
  function sleepAfter(minutes){clearTimeout(sleepTimer.current);setSleep(minutes);if(minutes)sleepTimer.current=setTimeout(()=>{videoRef.current?.pause();setSleep(0);setNotice('Sleep timer paused playback.');},minutes*60000);}
  function closeMenu(){setMenu(false);settingsButton.current?.focus();}
  function key(event){if(event.altKey||event.ctrlKey||event.metaKey)return;if(event.key==='Escape'){closeMenu();return;}if(event.target.closest('input,select,textarea,button,[contenteditable]'))return;const k=event.key.toLowerCase();if([' ','k','arrowleft','arrowright','m','f'].includes(k)){event.preventDefault();event.stopPropagation();wake();if(k===' '||k==='k')toggle();if(k==='arrowleft')seek(-10);if(k==='arrowright')seek(10);if(k==='m')videoRef.current.muted=!videoRef.current.muted;if(k==='f')full();}}
  const failure=access.error||error,visible=awake||!playing||menu||!!failure;
  return <section className={`sm-player ${visible?'sm-awake':''}`} ref={frameRef} tabIndex={0} aria-label={`${lesson.title} video player`} onKeyDown={key} onPointerMove={wake} onPointerDown={wake} onFocus={wake}>
    <video ref={videoRef} playsInline preload="metadata" aria-label={lesson.title} onClick={toggle} onDoubleClick={full}/>
    {!source&&!failure?<div className="sm-status" role="status">Authorizing playback…</div>:null}
    {!playing&&!buffering&&!failure&&source&&time.current===0?<button className="sm-big-play" onClick={toggle} aria-label="Start video"><PlayerIcon name="play"/></button>:null}
    {buffering&&!failure?<div className="sm-status" role="status">Loading video…</div>:null}
    {failure?<div className="sm-failure" role="alert"><p>{failure}</p><button onClick={()=>{setError('');if(lesson.provider==='aws_cloudfront')access.retry();else setReload(n=>n+1);}}>Retry playback</button>{onFallback?<button onClick={onFallback}>Use compatible player</button>:null}</div>:null}
    {notice?<div className="sm-notice" role="status">{notice}</div>:null}
    {menu?<div className="sm-settings" aria-label="Player settings">
      <button onClick={closeMenu} aria-label="Close settings">Close ×</button>
      <label>Playback speed<select value={rate} onChange={e=>setRate(Number(e.target.value))}>{[.25,.5,.75,1,1.25,1.5,1.75,2].map(n=><option key={n} value={n}>{n===1?'Normal':`${n}×`}</option>)}</select></label>
      <label>Quality<select value={quality} disabled={!levels.length} onChange={e=>{const n=Number(e.target.value);if(hlsRef.current)hlsRef.current.currentLevel=n;setQuality(n);}}><option value={-1}>{levels.length?'Auto':'Auto · browser managed'}</option>{levels.map(l=><option key={l.index} value={l.index}>{l.label}</option>)}</select></label>
      <label>Loop lesson<input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/></label>
      <label>Sleep timer<select value={sleep} onChange={e=>sleepAfter(Number(e.target.value))}>{[0,15,30,45,60].map(n=><option key={n} value={n}>{n?`${n} minutes`:'Off'}</option>)}</select></label>
    </div>:null}
    <div className="sm-controls">
      <input className="sm-seek" aria-label="Seek video" type="range" min="0" max={time.duration||1} step="0.1" disabled={!time.duration} value={Math.min(time.current,time.duration||1)} style={{'--sm-progress':`${time.duration?time.current/time.duration*100:0}%`,'--sm-buffered':`${time.duration?Math.min(100,buffered/time.duration*100):0}%`}} onChange={e=>{videoRef.current.currentTime=seekTarget(Number(e.target.value),time.duration);wake();}}/>
      <div className="sm-row">
        <button onClick={toggle} aria-label={playing?'Pause':'Play'} disabled={!source||!!failure}><PlayerIcon name={playing?'pause':'play'}/></button>
        <button onClick={()=>seek(-10)} aria-label="Rewind 10 seconds"><PlayerIcon name="back"/></button><button onClick={()=>seek(10)} aria-label="Forward 10 seconds"><PlayerIcon name="forward"/></button>
        <button onClick={()=>{videoRef.current.muted=!videoRef.current.muted;}} aria-label={muted?'Unmute':'Mute'}><PlayerIcon name={muted||volume===0?'mute':'volume'}/></button>
        <input className="sm-volume" aria-label="Volume" type="range" min="0" max="1" step=".05" value={muted?0:volume} onChange={e=>{videoRef.current.volume=Number(e.target.value);videoRef.current.muted=Number(e.target.value)===0;}}/>
        <span className="sm-time">{clock(time.current)} / {clock(time.duration)}</span><span className="sm-spacer"/>
        <button onClick={()=>onNavigateLesson(-1)} disabled={adjacent(course.videos,lessonIndex,-1)===lessonIndex} aria-label="Previous lesson"><PlayerIcon name="previous"/></button>
        <button onClick={()=>onNavigateLesson(1)} disabled={adjacent(course.videos,lessonIndex,1)===lessonIndex} aria-label="Next lesson"><PlayerIcon name="next"/></button>
        {captions.length?<label className="sm-captions">CC<select aria-label="Captions" value={caption} onChange={e=>{const n=Number(e.target.value);if(hlsRef.current)hlsRef.current.subtitleTrack=n;else Array.from(videoRef.current.textTracks).forEach((track,i)=>{track.mode=i===n?'showing':'disabled';});setCaption(n);}}><option value={-1}>Off</option>{captions.map(c=><option key={c.index} value={c.index}>{c.label}</option>)}</select></label>:null}
        <button ref={settingsButton} onClick={()=>setMenu(v=>!v)} aria-label="Player settings" aria-expanded={menu}><PlayerIcon name="settings"/></button>
        {document.pictureInPictureEnabled?<button className="sm-pip" onClick={pip} disabled={!time.duration} aria-label="Picture-in-picture"><PlayerIcon name="pip"/></button>:null}
        <button onClick={full} aria-label={fullscreen?'Exit fullscreen':'Fullscreen'}><PlayerIcon name="fullscreen"/></button>
      </div>
    </div>
  </section>;
}
