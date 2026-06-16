async function verify() {
  console.log('Testing authentication via backend /auth/login endpoint...');
  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@apco',
        password: '123456'
      })
    });
    const status = response.status;
    const json: any = await response.json();
    console.log(`Response Status: ${status}`);
    console.log('Response JSON:', JSON.stringify(json, null, 2));
    if (status === 200 && json.accessToken) {
      console.log('✅ Authentication SUCCESSFUL!');
    } else {
      console.log('❌ Authentication FAILED!');
    }
  } catch (error: any) {
    console.error('❌ Error calling backend:', error.message);
  }
}

verify();
