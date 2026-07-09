async function main() {
  console.log('Testing authentication via backend /auth/login endpoint...');
  try {
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@apco.local',
        password: 'ApcoAdminPassword123!'
      })
    });
    
    const loginStatus = loginResponse.status;
    const loginJson: any = await loginResponse.json();
    console.log(`Login Response Status: ${loginStatus}`);
    if (loginStatus !== 200 || !loginJson.accessToken) {
      console.log('❌ Login failed:', loginJson);
      return;
    }
    
    console.log('✅ Login successful. Token obtained.');
    const token = loginJson.accessToken;
    
    console.log('Making authorized request to GET /api/settings/companies...');
    
    const requestPromise = fetch('http://localhost:3000/api/settings/companies', {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Add a timeout of 15 seconds to the fetch request
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT_EXPIRED')), 15000)
    );
    
    const response: any = await Promise.race([requestPromise, timeoutPromise]);
    console.log(`GET /api/settings/companies Status: ${response.status}`);
    const json = await response.json();
    console.log('GET /api/settings/companies JSON:', JSON.stringify(json, null, 2));
    
  } catch (error: any) {
    console.error('❌ Error during request flow:', error);
  }
}

main();

export {};
