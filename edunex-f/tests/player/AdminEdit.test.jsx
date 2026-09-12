// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { AdminUploadPage } from '../../src/pages/admin/AdminUploadPage';
const mocks=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../../src/pages/admin/adminApi',async(importOriginal)=>({...await importOriginal(),requireAdmin:()=>true,adminJson:(...args)=>mocks.request(...args)}));
vi.mock('../../src/pages/admin/AdminShell',()=>({AdminShell:({title,children})=><><h1>{title}</h1>{children}</>,Message:({children})=><div>{children}</div>}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('loads an edit link into the edit form instead of creating a new course',async()=>{
 window.history.replaceState({},'', '/admin/upload?courseId=course-one');
 mocks.request.mockImplementation(async path=>path==='/api/categories'?[]:path.includes('video-providers')?{}:{_id:'course-one',title:'Existing masterclass',videos:[]});
 render(<AdminUploadPage/>);
 expect(screen.getByRole('heading',{name:'Edit Course'})).toBeTruthy();
 await screen.findByDisplayValue('Existing masterclass');
 expect(mocks.request).toHaveBeenCalledWith('/api/admin/courses/course-one',{},'Unable to load course.');
 expect(screen.queryByRole('button',{name:'Create course'})).toBeNull();
});
it('does not allow saving a blank edit form after loading fails',async()=>{
 window.history.replaceState({},'', '/admin/upload?id=missing');
 mocks.request.mockImplementation(async path=>{if(path.includes('/courses/'))throw Error('Course not found');return [];});
 render(<AdminUploadPage/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Save changes'}).disabled).toBe(true));
 expect(screen.queryByRole('button',{name:'Create course'})).toBeNull();
});
