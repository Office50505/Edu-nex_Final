// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { AdminUploadPage } from '../../src/pages/admin/AdminUploadPage';
const mocks=vi.hoisted(()=>({request:vi.fn(),rawRequest:vi.fn()}));
vi.mock('../../src/pages/admin/adminApi',async(importOriginal)=>({...await importOriginal(),requireAdmin:()=>true,adminJson:(...args)=>mocks.request(...args),adminRequest:(...args)=>mocks.rawRequest(...args)}));
vi.mock('../../src/pages/admin/AdminShell',()=>({AdminShell:({title,children})=><><h1>{title}</h1>{children}</>,Message:({text})=><div>{text}</div>}));
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
 fireEvent.change(document.getElementById('thumbnailVerticalUrl'),{target:{value:'https://images.example.test/temporary.webp'}});
 fireEvent.change(document.getElementById('thumbnailVerticalUrl'),{target:{value:''}});
 fireEvent.click(screen.getByRole('button',{name:'Save changes'}));
 await waitFor(()=>expect(submitted).toBeTruthy());
 expect(submitted.thumbnailVerticalUrl).toBe('');
 expect(submitted.thumbnailUrl).toBe(horizontal);
});
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
});
it('saves pending lesson notes from the sticky editor action',async()=>{
 window.history.replaceState({},'', '/admin/upload?courseId=course-one');
 const course={_id:'course-one',title:'Course',slug:'course',description:'Description',category:{_id:'category-one'},status:'published',videos:[{_id:'lesson-one',provider:'aws_cloudfront',title:'Lesson',notes:'Old',duration:60,videoUrl:'https://cdn.example/lesson.m3u8'}]};
 mocks.request.mockImplementation(async(path,options={})=>{
  if(path==='/api/categories')return [{_id:'category-one',name:'AI'}];
  if(path==='/api/admin/video-providers')return {cloudFrontHost:'cdn.example'};
  if(path==='/api/admin/courses/course-one/videos/lesson-one/notes')return {video:{_id:'lesson-one',notes:JSON.parse(options.body).notes}};
  if(path==='/api/admin/courses/course-one')return course;
  throw new Error(`Unexpected request: ${path}`);
 });
 render(<AdminUploadPage/>);
 const notes=await screen.findByLabelText('Lesson notes');
 const save=screen.getByRole('button',{name:'Save changes'});
 expect(save.disabled).toBe(true);
 fireEvent.change(notes,{target:{value:'Saved from sticky action'}});
 expect(save.disabled).toBe(false);
 expect(screen.getByText('Unsaved changes')).toBeTruthy();
 fireEvent.click(save);
 await screen.findByText('Lesson 1 notes saved.');
 expect(screen.getByLabelText('Lesson notes').value).toBe('Saved from sticky action');
 expect(screen.getByRole('button',{name:'Save changes'}).disabled).toBe(true);
 expect(mocks.request).not.toHaveBeenCalledWith('/api/admin/courses/course-one',expect.objectContaining({method:'PATCH'}),expect.anything());
});
it('saves one lesson notes without submitting the entire course',async()=>{
 window.history.replaceState({},'', '/admin/upload?courseId=course-one');
 const course={_id:'course-one',title:'Course',slug:'course',description:'Description',category:{_id:'category-one'},status:'published',videos:[{_id:'lesson-one',provider:'aws_cloudfront',title:'Lesson',notes:'Old',duration:60,videoUrl:'https://cdn.example/lesson.m3u8'}]};
 mocks.request.mockImplementation(async(path,options={})=>{
  if(path==='/api/categories')return [{_id:'category-one',name:'AI'}];
  if(path==='/api/admin/video-providers')return {cloudFrontHost:'cdn.example'};
  if(path==='/api/admin/courses/course-one/videos/lesson-one/notes')return {video:{_id:'lesson-one',notes:JSON.parse(options.body).notes}};
  if(path==='/api/admin/courses/course-one')return course;
  throw new Error(`Unexpected request: ${path}`);
 });
 render(<AdminUploadPage/>);
 const notes=await screen.findByLabelText('Lesson notes');
 fireEvent.change(notes,{target:{value:'Saved separately'}});
 fireEvent.click(screen.getByRole('button',{name:'Save lesson notes'}));
 await screen.findByText('Lesson 1 notes saved.');
 expect(screen.getByLabelText('Lesson notes').value).toBe('Saved separately');
 expect(mocks.request).not.toHaveBeenCalledWith('/api/admin/courses/course-one',expect.objectContaining({method:'PATCH'}),expect.anything());
});
