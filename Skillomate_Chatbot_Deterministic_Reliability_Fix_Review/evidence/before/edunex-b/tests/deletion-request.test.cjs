const test=require('node:test');
const assert=require('node:assert/strict');
const {validateDeletionRequest}=require('../services/deletionRequestValidation');
const valid={fullName:' Test Learner ',mobileNumber:'9876543210',email:'TEST@example.com',confirm:true};
test('deletion request normalizes contact data and discards untrusted fields',()=>{
 const result=validateDeletionRequest({...valid,status:'completed',userId:'someone-else',password:'secret'});
 assert.deepEqual(result,{fullName:'Test Learner',mobileNumber:'919876543210',email:'test@example.com',reason:''});
 assert.equal(validateDeletionRequest({...valid,mobileNumber:'+91 98765 43210'}).mobileNumber,'919876543210');
});
test('deletion request rejects malformed data and missing confirmation',()=>{
 for(const change of [{confirm:false},{confirm:'true'},{email:'invalid'},{mobileNumber:'1234'},{mobileNumber:{$ne:null}},{fullName:''},{reason:'x'.repeat(1001)}])assert.throws(()=>validateDeletionRequest({...valid,...change}));
});
