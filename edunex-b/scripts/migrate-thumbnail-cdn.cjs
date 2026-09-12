// Dry run by default. Run with --apply only after configuring the CDN destination.
require('dotenv').config({quiet:true});
const mongoose = require('mongoose');
const Course = require('../models/Course');
const {uploadThumbnail} = require('../services/thumbnailCdn');
(async()=>{
 await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
 const apply=process.argv.includes('--apply');
 const filter={$or:['thumbnail.data','thumbnailHorizontal.data','thumbnailVertical.data','videos.thumbnail.data'].map(field=>({[field]:{$type:'string',$ne:''}}))};
 if(!apply){console.log({coursesWithEmbeddedArtwork:await Course.countDocuments(filter),mode:'dry-run'});return;}
 const cursor=Course.find(filter).lean().cursor({batchSize:1});
 for await (const course of cursor){
  const set={},unset={},shared=new Map();
  for(const [orientation,fields] of [['horizontal',['thumbnailHorizontal','thumbnail']],['vertical',['thumbnailVertical']]]){
   const image=fields.map(field=>course[field]).find(image=>image?.data);
   if(!image)continue;
   const url=await uploadThumbnail(course._id,orientation,image);
   set[orientation==='horizontal'?'thumbnailUrl':'thumbnailVerticalUrl']=url;
   shared.set(image.data,url);
   for(const field of fields)unset[field]='';
  }
  for(const [index,video] of (course.videos||[]).entries()){
   if(!video.thumbnail?.data)continue;
   set[`videos.${index}.thumbnailUrl`]=shared.get(video.thumbnail.data)||await uploadThumbnail(course._id,`video-${video._id}`,video.thumbnail);
   unset[`videos.${index}.thumbnail`]='';
  }
  const match={_id:course._id,updatedAt:course.updatedAt};
  const result=await Course.updateOne(match,{$set:set,$unset:unset});
  console.log({courseId:String(course._id),updated:result.modifiedCount===1});
  if(!result.matchedCount)throw new Error('Course changed during migration; rerun to migrate its latest state.');
 }
})().catch(error=>{console.error('Thumbnail migration failed:',error.name);process.exitCode=1;}).finally(()=>mongoose.disconnect());
