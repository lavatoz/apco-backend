async function main() {
  const loginUrl = 'https://apco-backend-production.up.railway.app/api/auth/login';
  const setupUrl = 'https://apco-backend-production.up.railway.app/api/auth/mfa/setup';

  console.log('1. Sending POST request to login...');
  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@apco.local', password: 'Admin@123' })
  });

  const loginData: any = await loginRes.json();
  console.log('Login Status:', loginRes.status);
  console.log('Login Response:', JSON.stringify(loginData, null, 2));

  if (!loginData.tempToken) {
    console.error('No tempToken returned from login.');
    return;
  }

  console.log('\n2. Sending POST request to mfa/setup with tempToken...');
  const setupRes = await fetch(setupUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${loginData.tempToken}`
    }
  });

  console.log('Setup Status:', setupRes.status);
  try {
    const setupData = await setupRes.json();
    console.log('Setup Response Data:', JSON.stringify(setupData, null, 2));
  } catch (err) {
    const text = await setupRes.text();
    console.log('Setup Response Text:', text);
  }
}

main().catch(console.error);
