// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
<<<<<<< Updated upstream
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
=======
<<<<<<< HEAD
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
=======
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
>>>>>>> 84cbdd0a5ef72b7a699a6c1808fcd158ff12fd4b
>>>>>>> Stashed changes
import { AdminUploadPage } from '../../src/pages/admin/AdminUploadPage';
const mocks=vi.hoisted(()=>({request:vi.fn(),rawRequest:vi.fn()}));
vi.mock('../../src/pages/admin/adminApi',async(importOriginal)=>({...await importOriginal(),requireAdmin:()=>true,adminJson:(...args)=>mocks.request(...args),adminRequest:(...args)=>mocks.rawRequest(...args)}));
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
 await screen.findByRole('button',{name:'Retry loading course'});
 expect(screen.queryByRole('button',{name:'Save changes'})).toBeNull();
 expect(screen.queryByLabelText('Course title')).toBeNull();
 expect(screen.queryByRole('button',{name:'Create course'})).toBeNull();
});
it('keeps generated preview paths out of URL inputs',async()=>{
 window.history.replaceState({},'', '/admin/upload?courseId=course-one');
 mocks.request.mockImplementation(async path=>path==='/api/categories'?[]:path.includes('video-providers')?{}:{_id:'course-one',title:'Existing',status:'published',videos:[]});
 render(<AdminUploadPage/>);
 await screen.findByDisplayValue('Existing');
 expect(document.getElementById('thumbnailUrl').value).toBe('');
 expect(document.getElementById('thumbnailVerticalUrl').value).toBe('');
 expect(document.getElementById('thumbnailVerticalUrl').validity.valid).toBe(true);
});
<<<<<<< Updated upstream
=======
<<<<<<< HEAD

it('submits a blank vertical thumbnail to clear legacy storage while preserving horizontal',async()=>{
 window.history.replaceState({},'', '/admin/upload?courseId=course-one');
 const horizontal='https://images.example.test/course-horizontal.webp';
 const legacyVertical='/uploads/course-thumbnails/6aa4ecd63ddad7649031c35f-vertical.webp';
 const course={
  _id:'course-one',title:'Existing masterclass',slug:'existing-masterclass',description:'Existing description',
  category:'category-one',status:'published',thumbnailUrl:horizontal,thumbnailVerticalUrl:legacyVertical,
  videos:[{_id:'video-one',title:'Lesson one',provider:'youtube',youtubeId:'abcdefghijk',duration:60,order:1}],
 };
 let submitted;
 mocks.request.mockImplementation(async(path,options={})=>{
  if(path==='/api/categories')return [{_id:'category-one',name:'Category'}];
  if(path.includes('video-providers'))return {};
  if(path==='/api/admin/courses/course-one' && options.method==='PATCH'){
   submitted=JSON.parse(options.body);
   return {...course,thumbnailVerticalUrl:null};
  }
  if(path==='/api/admin/courses/course-one')return course;
  return [];
 });
 render(<AdminUploadPage/>);
 await screen.findByDisplayValue('Existing masterclass');
 expect(document.getElementById('thumbnailVerticalUrl').value).toBe('');
 fireEvent.click(screen.getByRole('button',{name:'Save changes'}));
 await waitFor(()=>expect(submitted).toBeTruthy());
 expect(submitted.thumbnailVerticalUrl).toBe('');
 expect(submitted.thumbnailUrl).toBe(horizontal);
=======
>>>>>>> Stashed changes
it('extracts lesson notes when a PDF is dropped on the lesson drop zone',async()=>{
 window.history.replaceState({},'', '/admin/upload');
 mocks.request.mockImplementation(async path=>path==='/api/categories'?[]:path.includes('video-providers')?{}:[]);
 mocks.rawRequest.mockResolvedValue({ok:true,json:async()=>({text:'Extracted lesson notes',truncated:false})});
 render(<AdminUploadPage/>);
 const dropzone=await screen.findByRole('button',{name:'Upload PDF notes for lesson 1'});
 const pdf=new File(['%PDF-1.4 lesson'], 'lesson.pdf', {type:'application/pdf'});
 fireEvent.dragEnter(dropzone,{dataTransfer:{files:[pdf],dropEffect:''}});
 expect(dropzone.className).toContain('is-dragging');
 fireEvent.drop(dropzone,{dataTransfer:{files:[pdf],dropEffect:''}});
 await waitFor(()=>expect(screen.getByLabelText('Lesson notes').value).toBe('Extracted lesson notes'));
 const progress=screen.getByRole('progressbar');
 expect(progress.parentElement.textContent).toContain('Complete');
 expect(progress.getAttribute('aria-valuenow')).toBe('100');
 expect(mocks.rawRequest).toHaveBeenCalledWith('/api/admin/extract-pdf-notes',expect.objectContaining({method:'POST',body:pdf}));
 expect(dropzone.className).not.toContain('is-dragging');
});
it('loads a separate notes URL for each lesson',async()=>{
 window.history.replaceState({},'', '/admin/upload?courseId=course-one');
 mocks.request.mockImplementation(async path=>path==='/api/categories'?[]:path.includes('video-providers')?{}:{_id:'course-one',title:'Existing',videos:[{_id:'lesson-one',title:'Lesson one',provider:'aws_cloudfront',videoUrl:'https://cdn.example/lesson.m3u8',notesUrl:'https://notes.example/lesson-one'}]});
 render(<AdminUploadPage/>);
 expect(await screen.findByDisplayValue('https://notes.example/lesson-one')).toBeTruthy();
 expect(screen.getByLabelText('Lesson notes URL')).toBeTruthy();
<<<<<<< Updated upstream
=======
>>>>>>> 84cbdd0a5ef72b7a699a6c1808fcd158ff12fd4b
>>>>>>> Stashed changes
});
