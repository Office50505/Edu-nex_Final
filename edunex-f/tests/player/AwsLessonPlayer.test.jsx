// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react';
import { CourseMediaPlayer } from '../../src/components/media/CourseMediaPlayer';
import { adjacent, clock, seekTarget, nativeLessonSource, usesCustomPlayer } from '../../src/components/media/playerRules';
const fixture = vi.hoisted(()=>({source:'/api/playback/hls.m3u8?grant=fixture',error:'',resume:25,retry:vi.fn(),progress:vi.fn(),engines:[],hlsSupported:true}));
vi.mock('../../src/hooks/usePlaybackAccess',()=>({usePlaybackAccess:()=>({lesson:{hlsUrl:fixture.source},error:fixture.error,retry:fixture.retry})}));
vi.mock('../../src/hooks/useLearningProgress',()=>({useLearningProgress:(...args)=>{fixture.progress(...args);return {resume:fixture.resume};}}));
vi.mock('../../src/lib/hlsRuntime',()=>{
 class Engine {
  static Events={MANIFEST_PARSED:'manifest',SUBTITLE_TRACKS_UPDATED:'subtitles',ERROR:'error'};
  static ErrorTypes={MEDIA_ERROR:'media'};
  static isSupported(){return fixture.hlsSupported;}
  constructor(){this.listeners={};this.destroy=vi.fn();this.stopLoad=vi.fn();this.recoverMediaError=vi.fn();fixture.engines.push(this);}
  on(name,fn){this.listeners[name]=fn;}loadSource(url){this.url=url;}attachMedia(video){this.video=video;}
 }
 return {loadHlsJs:async()=>Engine};
});
const lessons=[{_id:'one',title:'Intro',provider:'aws_cloudfront'},{_id:'two',title:'Next',provider:'aws_cloudfront'}];
let next,navigate;
function ui(props={}) {return <CourseMediaPlayer course={{_id:'course',videos:lessons}} lesson={lessons[0]} lessonIndex={0} autoNext onEnded={next} onNavigateLesson={navigate} {...props}/>;}
async function mount(props={}){const view=render(ui(props));await act(async()=>{});const video=view.container.querySelector('video');Object.defineProperty(video,'duration',{configurable:true,value:100});fireEvent.loadedMetadata(video);return {...view,video};}
beforeEach(()=>{
 fixture.hlsSupported=true;fixture.source='/api/playback/hls.m3u8?grant=fixture';fixture.error='';fixture.resume=25;fixture.engines=[];fixture.retry.mockClear();fixture.progress.mockClear();next=vi.fn();navigate=vi.fn();
 vi.spyOn(HTMLMediaElement.prototype,'textTracks','get').mockReturnValue(Object.assign([],{addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 vi.spyOn(HTMLMediaElement.prototype,'canPlayType').mockReturnValue('');
 vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(function(){fireEvent.pause(this);});
 vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(function(){fireEvent.playing(this);return Promise.resolve();});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
describe('AWS player',()=>{
 it('loads authorized source, restores server resume and sends time to existing progress hook',async()=>{const {video}=await mount();expect(fixture.engines[0].url).toBe(fixture.source);expect(video.currentTime).toBe(25);video.currentTime=30;fireEvent.timeUpdate(video);expect(fixture.progress).toHaveBeenLastCalledWith('course','one',{current:30,duration:100},false);});
 it('seeks within bounds and controls playback',async()=>{const {video}=await mount();fireEvent.click(screen.getByLabelText('Forward 10 seconds'));expect(video.currentTime).toBe(35);fireEvent.click(screen.getByLabelText('Play'));expect(screen.getByLabelText('Pause')).toBeTruthy();fireEvent.change(screen.getByLabelText('Seek video'),{target:{value:99}});expect(video.currentTime).toBe(99);});
 it('keeps paused position and destroys old HLS during grant renewal',async()=>{const view=await mount();const old=fixture.engines[0];view.video.currentTime=47;fireEvent.timeUpdate(view.video);fixture.source='/api/playback/hls.m3u8?grant=renewed';view.rerender(ui());await act(async()=>{});fireEvent.loadedMetadata(view.video);expect(old.destroy).toHaveBeenCalledOnce();expect(view.video.currentTime).toBe(47);expect(screen.getByLabelText('Play')).toBeTruthy();view.unmount();expect(fixture.engines[1].destroy).toHaveBeenCalledOnce();});
 it('restores playing state on renewal',async()=>{const view=await mount();fireEvent.click(screen.getByLabelText('Play'));fixture.source='/api/playback/hls.m3u8?grant=renewed';view.rerender(ui());await act(async()=>{});fireEvent.loadedMetadata(view.video);expect(screen.getByLabelText('Pause')).toBeTruthy();});
 it('selects manifest quality and captions; loop suppresses automatic progression',async()=>{const {video}=await mount();const engine=fixture.engines[0];act(()=>{engine.listeners.manifest(null,{levels:[{height:720}]});engine.listeners.subtitles(null,{subtitleTracks:[{name:'English'}]});});fireEvent.change(screen.getByLabelText('Captions'),{target:{value:'0'}});expect(engine.subtitleTrack).toBe(0);fireEvent.click(screen.getByLabelText('Player settings'));fireEvent.change(screen.getByLabelText('Quality'),{target:{value:'0'}});expect(engine.currentLevel).toBe(0);fireEvent.change(screen.getByLabelText('Playback speed'),{target:{value:'1.5'}});expect(video.playbackRate).toBe(1.5);fireEvent.click(screen.getByLabelText('Loop lesson'));fireEvent.ended(video);expect(next).not.toHaveBeenCalled();fireEvent.click(screen.getByLabelText('Loop lesson'));fireEvent.ended(video);expect(next).toHaveBeenCalledOnce();});
 it('sleep timer pauses without advancing and cleans timers on unmount',async()=>{vi.useFakeTimers();const view=await mount();fireEvent.click(screen.getByLabelText('Player settings'));fireEvent.change(screen.getByLabelText('Sleep timer'),{target:{value:'15'}});act(()=>vi.advanceTimersByTime(15*60000));expect(view.video.pause).toHaveBeenCalled();expect(next).not.toHaveBeenCalled();view.unmount();expect(vi.getTimerCount()).toBe(0);});
 it('Safari without HLS.js support uses native HLS',async()=>{fixture.hlsSupported=false;vi.spyOn(navigator,'userAgent','get').mockReturnValue('Version/18.0 Safari/605.1.15');HTMLMediaElement.prototype.canPlayType.mockReturnValue('probably');const {video}=await mount();expect(video.getAttribute('src')).toBe(fixture.source);expect(fixture.engines).toHaveLength(0);});
 it('bounds recovery and offers retry on fatal errors',async()=>{await mount();const engine=fixture.engines[0];act(()=>{for(let n=0;n<3;n++)engine.listeners.error(null,{fatal:true,type:'media'});});expect(engine.recoverMediaError).toHaveBeenCalledTimes(2);expect(screen.getByRole('alert')).toBeTruthy();fireEvent.click(screen.getByText('Retry playback'));expect(fixture.retry).toHaveBeenCalledOnce();});
 it('denied authorization pauses playback and shows access error',async()=>{fixture.error='Subscription expired';const {video}=await mount();expect(screen.getByRole('alert').textContent).toContain('Subscription expired');expect(video.pause).toHaveBeenCalled();});
 it('controls fade while playing and wake on interaction',async()=>{vi.useFakeTimers();const {container}=await mount();fireEvent.click(screen.getByLabelText('Play'));act(()=>vi.advanceTimersByTime(2700));expect(container.querySelector('.sm-player').classList.contains('sm-awake')).toBe(false);fireEvent.pointerMove(container.querySelector('.sm-player'));expect(container.querySelector('.sm-player').classList.contains('sm-awake')).toBe(true);});
 it('keyboard seeks without changing lessons and navigation buttons use course callbacks',async()=>{const {video,container}=await mount();fireEvent.keyDown(container.querySelector('.sm-player'),{key:'ArrowRight'});expect(video.currentTime).toBe(35);expect(navigate).not.toHaveBeenCalled();expect(screen.getByLabelText('Previous lesson').disabled).toBe(true);fireEvent.click(screen.getByLabelText('Next lesson'));expect(navigate).toHaveBeenCalledWith(1);});
 it('reports buffering and clears it when playback resumes',async()=>{const {video}=await mount();fireEvent.waiting(video);expect(screen.getByRole('status').textContent).toContain('Loading');fireEvent.playing(video);expect(screen.queryByText('Loading video…')).toBeNull();});
 it('exposes supported PiP and requests fullscreen on the player frame',async()=>{Object.defineProperty(document,'pictureInPictureEnabled',{configurable:true,value:true});const {video,container}=await mount();video.requestPictureInPicture=vi.fn().mockResolvedValue({});container.querySelector('.sm-player').requestFullscreen=vi.fn().mockResolvedValue();fireEvent.click(screen.getByLabelText('Picture-in-picture'));expect(video.requestPictureInPicture).toHaveBeenCalledOnce();fireEvent.click(screen.getByLabelText('Fullscreen'));expect(container.querySelector('.sm-player').requestFullscreen).toHaveBeenCalledOnce();});
 it('autoplay after navigation waits for metadata and resume',async()=>{await mount({autoplay:true});expect(screen.getByLabelText('Pause')).toBeTruthy();});
});
it('navigation stops at course boundaries and locked lessons',()=>{expect(adjacent(lessons,0,-1)).toBe(0);expect(adjacent(lessons,1,1)).toBe(1);expect(adjacent([lessons[0],{...lessons[1],locked:true}],0,1)).toBe(0);expect(adjacent(lessons,0,1)).toBe(1);});
it('time and seek calculations handle invalid metadata',()=>{expect(clock(3661)).toBe('1:01:01');expect(clock(Infinity)).toBe('0:00');expect(seekTarget(-10,50)).toBe(0);expect(seekTarget(60,50)).toBe(50);});

it('routes Bunny HLS through the new controls without treating it as AWS',async()=>{
 const bunny={_id:'bunny',title:'Bunny lesson',provider:'bunny_stream',hlsUrl:'https://video.b-cdn.net/id/playlist.m3u8',embedUrl:'https://player.mediadelivery.net/embed/123/id'};
 expect(usesCustomPlayer(bunny)).toBe(true);
 expect(nativeLessonSource(bunny)).toBe(bunny.hlsUrl);
 await mount({lesson:bunny});
 expect(fixture.engines[0].url).toBe(bunny.hlsUrl);
 expect(fixture.engines[0].url).not.toContain('grant=');
});
it('keeps embed-only and YouTube lessons on their compatible playback path',()=>{
 expect(usesCustomPlayer({provider:'bunny_stream',embedUrl:'https://player.mediadelivery.net/embed/123/id'})).toBe(false);
 expect(usesCustomPlayer({provider:'youtube',youtubeId:'example'})).toBe(false);
 expect(nativeLessonSource({provider:'aws_cloudfront',videoUrl:'https://cdn.example/master.m3u8'})).toBe('');
});
it('offers explicit Bunny fallback after failure',async()=>{
 const fallback=vi.fn();const {video}=await mount({lesson:{_id:'b',title:'Bunny',provider:'bunny_stream',hlsUrl:'https://video.b-cdn.net/id/playlist.m3u8'},onFallback:fallback});
 fireEvent.error(video);fireEvent.click(screen.getByText('Use compatible player'));expect(fallback).toHaveBeenCalledOnce();
});

it('Chrome uses hls.js even when it advertises native HLS',async()=>{vi.spyOn(navigator,'userAgent','get').mockReturnValue('Chrome/140.0 Safari/537.36');HTMLMediaElement.prototype.canPlayType.mockReturnValue('probably');await mount();expect(fixture.engines).toHaveLength(1);});
it('fullscreen preserves playback position without exposing a fit-fill toggle',async()=>{const {video,container}=await mount();const frame=container.querySelector('.sm-player');Object.defineProperty(document,'fullscreenElement',{configurable:true,value:frame});const position=video.currentTime;fireEvent(document,new Event('fullscreenchange'));expect(frame.classList.contains('sm-fullscreen')).toBe(true);expect(video.currentTime).toBe(position);expect(screen.queryByRole('button',{name:'Fill screen'})).toBeNull();expect(screen.queryByRole('button',{name:'Fit video'})).toBeNull();Object.defineProperty(document,'fullscreenElement',{configurable:true,value:null});fireEvent(document,new Event('fullscreenchange'));expect(frame.classList.contains('sm-fullscreen')).toBe(false);});

it('recognizes fullscreen owned by the surrounding lesson wrapper',async()=>{const {container}=await mount();const frame=container.querySelector('.sm-player');Object.defineProperty(document,'fullscreenElement',{configurable:true,value:container});fireEvent(document,new Event('fullscreenchange'));expect(frame.classList.contains('sm-fullscreen')).toBe(true);expect(screen.queryByRole('button',{name:'Fill screen'})).toBeNull();Object.defineProperty(document,'fullscreenElement',{configurable:true,value:null});fireEvent(document,new Event('fullscreenchange'));expect(frame.classList.contains('sm-fullscreen')).toBe(false);});
it('double taps seek on either side without pausing active playback',async()=>{vi.useFakeTimers();const {video}=await mount();video.getBoundingClientRect=()=>({left:0,width:400});fireEvent.click(screen.getByLabelText('Play'));expect(screen.getByLabelText('Pause')).toBeTruthy();video.play.mockClear();video.pause.mockClear();const start=video.currentTime;fireEvent.click(video,{clientX:380});fireEvent.click(video,{clientX:380});act(()=>vi.advanceTimersByTime(350));expect(video.currentTime).toBe(start+10);expect(video.pause).not.toHaveBeenCalled();expect(video.play).toHaveBeenCalledOnce();expect(screen.getByLabelText('Pause')).toBeTruthy();video.play.mockClear();fireEvent.click(video,{clientX:20});fireEvent.click(video,{clientX:20});expect(video.currentTime).toBe(start);expect(video.pause).not.toHaveBeenCalled();expect(video.play).toHaveBeenCalledOnce();expect(screen.getByLabelText('Pause')).toBeTruthy();});

it('double taps seek while paused without starting playback',async()=>{vi.useFakeTimers();const {video}=await mount();video.getBoundingClientRect=()=>({left:0,width:400});video.play.mockClear();const start=video.currentTime;fireEvent.click(video,{clientX:380});fireEvent.click(video,{clientX:380});act(()=>vi.advanceTimersByTime(350));expect(video.currentTime).toBe(start+10);expect(video.play).not.toHaveBeenCalled();expect(screen.getByLabelText('Play')).toBeTruthy();});

it('uses HLS.js with an emulated iPhone user agent and maybe native support',async()=>{vi.spyOn(navigator,'userAgent','get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Version/18.5 Mobile/15E148 Safari/604.1');HTMLMediaElement.prototype.canPlayType.mockReturnValue('maybe');await mount();expect(fixture.engines).toHaveLength(1);});
it('falls back to native HLS when HLS.js is unsupported',async()=>{fixture.hlsSupported=false;HTMLMediaElement.prototype.canPlayType.mockReturnValue('maybe');const {video}=await mount();expect(fixture.engines).toHaveLength(0);expect(video.getAttribute('src')).toBe(fixture.source);});
