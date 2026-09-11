const router = require('express').Router();
const crypto = require('node:crypto');
const Request = require('../models/DeletionRequest');
const {protectAdmin} = require('../middleware/adminAuth');
const {validateDeletionRequest} = require('../services/deletionRequestValidation');
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.post('/deletion-requests',async(req,res)=>{
  let data;
  try { data = validateDeletionRequest(req.body); } catch(error) {return res.status(400).json({error:error.message});}
  try {
    const ipHash = crypto.createHmac('sha256',process.env.JWT_SECRET).update(req.ip || 'unknown').digest('hex');
    const since = new Date(Date.now()-86400000);
    if (await Request.countDocuments({ipHash,createdAt:{$gte:since}}) >= 5) return res.status(429).json({error:'Too many requests. Please try again tomorrow.'});
    await Request.create({...data,ipHash});
    // Do not look up or disclose account existence; ownership must be verified before deletion.
    res.status(202).json({message:'Request received. We will contact you to verify account ownership before processing deletion.'});
  } catch {res.status(503).json({error:'Unable to save your request right now. Please try again later.'});}
});
router.get('/admin/deletion-requests',protectAdmin,async(req,res)=>{
  try {const page=Math.max(1,Math.min(10000,Number(req.query.page)||1));const requests=await Request.find().sort({createdAt:-1}).skip((page-1)*25).limit(25).lean();res.json({requests,page});}
  catch {res.status(503).json({error:'Unable to load deletion requests.'});}
});
module.exports=router;
