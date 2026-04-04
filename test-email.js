require('dotenv').config();
const { Resend } = require('resend');

const r = new Resend(process.env.RESEND_API_KEY);

r.emails.send({
  from: 'onboarding@resend.dev',
  to: 'naomijunks21@gmail.com',
  subject: 'Bharat eVote Test',
  html: '<p>Test OTP: <b>123456</b></p>'
}).then(d => {
  console.log('RESULT:', JSON.stringify(d, null, 2));
}).catch(e => {
  console.error('ERROR:', e.message);
});
