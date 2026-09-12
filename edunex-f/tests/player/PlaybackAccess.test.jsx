// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {renderHook,waitFor,cleanup} from '@testing-library/react';
import {usePlaybackAccess} from '../../src/hooks/usePlaybackAccess';
afterEach(()=>{cleanup();delete window.EduNex;});
const lesson={_id:'lesson',provider:'aws_cloudfront'};
it('rejects empty or malformed playback grants without exposing a null-reference error',async()=>{for(const data of [null,{}, {hlsUrl:'/api/video',expiresAt:0}]){window.EduNex={authRequest:vi.fn().mockResolvedValue(data)};const h=renderHook(()=>usePlaybackAccess('course',lesson));await waitFor(()=>expect(h.result.current.error).toContain('invalid response'));expect(h.result.current.lesson.hlsUrl).toBeUndefined();h.unmount();}});
it('accepts a valid grant',async()=>{window.EduNex={authRequest:vi.fn().mockResolvedValue({hlsUrl:'/api/playback/hls.m3u8',expiresAt:Date.now()+900000})};const h=renderHook(()=>usePlaybackAccess('course',lesson));await waitFor(()=>expect(h.result.current.lesson.hlsUrl).toBe('/api/playback/hls.m3u8'));expect(h.result.current.error).toBe('');});
