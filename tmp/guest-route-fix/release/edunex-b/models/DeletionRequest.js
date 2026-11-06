const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  fullName: {type:String,required:true,maxlength:120},
  mobileNumber: {type:String,required:true},
  email: {type:String,required:true,maxlength:254},
  reason: {type:String,maxlength:1000,default:''},
  status: {type:String,enum:['pending'],default:'pending'},
  ipHash: {type:String,select:false},
}, {timestamps:true});
schema.index({ipHash:1,createdAt:1});
module.exports = mongoose.model('DeletionRequest',schema);
