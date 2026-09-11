function validateDeletionRequest(body = {}) {
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  let mobileNumber = typeof body.mobileNumber === 'string' ? body.mobileNumber.replace(/[\s()+-]/g,'') : '';
  if (/^[6-9]\d{9}$/.test(mobileNumber)) mobileNumber = '91' + mobileNumber;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!fullName || fullName.length > 120) throw new Error('Enter your account name (up to 120 characters).');
  if (!/^91[6-9]\d{9}$/.test(mobileNumber)) throw new Error('Enter the Indian mobile number used for your account.');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email where we can contact you.');
  if (reason.length > 1000) throw new Error('Keep additional details under 1,000 characters.');
  if (body.confirm !== true) throw new Error('Confirm that you are requesting deletion of your own account.');
  return {fullName,mobileNumber,email,reason};
}
module.exports = {validateDeletionRequest};
