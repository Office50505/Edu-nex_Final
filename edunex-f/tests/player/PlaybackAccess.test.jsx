// @vitest-environment jsdom
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {renderHook,waitFor,cleanup,act} from '@testing-library/react';
import {usePlaybackAccess} from '../../src/hooks/usePlaybackAccess';
beforeEach(()=>{localStorage.setItem('edunexAccessToken','fixture-token');});
afterEach(()=>{cleanup();localStorage.clear();vi.useRealTimers();vi.unstubAllGlobals();});
const lesson={_id:'lesson',provider:'aws_cloudfront'};
const reply=data=>Promise.resolve({ok:true,status:200,json:async()=>data});
it('rejects empty or malformed playback grants',async()=>{
 for(const data of [null,{}, {hlsUrl:'/api/video',expiresAt:0}]) {
  vi.stubGlobal('fetch',vi.fn(()=>reply(data)));
  const h=renderHook(()=>usePlaybackAccess('course',lesson));
  await waitFor(()=>expect(h.result.current.error).toContain('invalid response'));
  expect(h.result.current.lesson.hlsUrl).toBeUndefined();h.unmount();
 }
});
it('authorizes playback without waiting for legacy scripts',async()=>{
 const fetcher=vi.fn(()=>reply({hlsUrl:'/api/playback/hls.m3u8',expiresAt:Date.now()+900000}));vi.stubGlobal('fetch',fetcher);
 const h=renderHook(()=>usePlaybackAccess('course',lesson));
 await waitFor(()=>expect(h.result.current.lesson.hlsUrl).toBe('/api/playback/hls.m3u8'));
 expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer fixture-token');expect(h.result.current.error).toBe('');
});
it('uses the bundled grant immediately and renews it before expiry',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn(()=>reply({hlsUrl:'/api/playback/hls.m3u8?renewed',expiresAt:Date.now()+900000}));vi.stubGlobal('fetch',fetcher);
 const initialLesson={...lesson,hlsUrl:'/api/playback/hls.m3u8?initial',expiresAt:Date.now()+900000};
 const h=renderHook(()=>usePlaybackAccess('course',initialLesson));
 expect(h.result.current.lesson.hlsUrl).toContain('initial');expect(fetcher).not.toHaveBeenCalled();
 await act(async()=>{await vi.advanceTimersByTimeAsync(840001);});
 expect(fetcher).toHaveBeenCalledTimes(1);expect(h.result.current.lesson.hlsUrl).toContain('renewed');
});
it('retry refreshes even a bundled grant; lesson changes cannot reuse a previous grant',async()=>{
 const fetcher=vi.fn(()=>reply({hlsUrl:'/api/playback/hls.m3u8?new',expiresAt:Date.now()+900000}));vi.stubGlobal('fetch',fetcher);
 const h=renderHook(({item})=>usePlaybackAccess('course',item),{initialProps:{item:{...lesson,hlsUrl:'/api/playback/hls.m3u8?initial',expiresAt:Date.now()+900000}}});
 act(()=>h.result.current.retry());await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 h.rerender({item:{...lesson,_id:'other'}});expect(h.result.current.lesson.hlsUrl).toBeUndefined();
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(fetcher.mock.calls[1][0]).toContain('/other/');
});
it('expired initial grants are replaced and authorization failures do not keep a playable URL',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:403,json:async()=>({error:'Subscription expired'})})));
 const h=renderHook(()=>usePlaybackAccess('course',{...lesson,hlsUrl:'/expired',expiresAt:Date.now()-1}));
 await waitFor(()=>expect(h.result.current.error).toBe('Subscription expired'));
 expect(h.result.current.lesson.hlsUrl).toBeUndefined();
});
