async function tryFetch(url: string, options: any) {
  try {
    const res = await fetch(url, options);
    return res;
  } catch (err: any) {
    console.warn(`Fetch to ${url} failed:`, err.message);
    return null;
  }
}

async function main() {
  console.log('Testing authentication via backend /auth/login endpoint on PORT 3000...');
  
  let loginResponse = await tryFetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@apco.local',
      password: 'ApcoAdminPassword123!'
    })
  });
  
  let baseUrl = 'http://localhost:3000';
  if (!loginResponse) {
    loginResponse = await tryFetch('http://127.0.0.1:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@apco.local',
        password: 'ApcoAdminPassword123!'
      })
    });
    baseUrl = 'http://127.0.0.1:3000';
  }

  if (!loginResponse) {
    console.error('❌ All connection attempts failed on port 3000.');
    return;
  }
  
  const loginStatus = loginResponse.status;
  const loginJson: any = await loginResponse.json();
  if (loginStatus !== 200 || !loginJson.accessToken) {
    console.log('❌ Login failed:', loginJson);
    return;
  }
  
  const token = loginJson.accessToken;
  const headers = { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const endpoints = [
    { name: 'GET /api/settings/companies', url: `${baseUrl}/api/settings/companies`, method: 'GET' },
    { name: 'GET /api/settings/global', url: `${baseUrl}/api/settings/global`, method: 'GET' },
  ];

  for (const ep of endpoints) {
    console.log(`\n----------------------------------------\nTesting: ${ep.name}`);
    
    const requestPromise = fetch(ep.url, {
      method: ep.method,
      headers: headers
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT_EXPIRED')), 8000)
    );
    
    try {
      const response: any = await Promise.race([requestPromise, timeoutPromise]);
      console.log(`Status: ${response.status}`);
      const json = await response.json();
      console.log(`Response length: ${JSON.stringify(json).length} chars`);
    } catch (error: any) {
      console.error(`❌ Error or Timeout: ${error.message}`);
    }
  }
}

main();
