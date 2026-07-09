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
  console.log('Testing authentication via backend /auth/login endpoint...');
  
  // Try both 127.0.0.1 and [::1] to be robust
  let loginResponse = await tryFetch('http://127.0.0.1:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@apco.local',
      password: 'ApcoAdminPassword123!'
    })
  });
  
  let baseUrL = 'http://127.0.0.1:3001';
  if (!loginResponse) {
    console.log('Trying IPv6 [::1]...');
    loginResponse = await tryFetch('http://[::1]:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@apco.local',
        password: 'ApcoAdminPassword123!'
      })
    });
    baseUrL = 'http://[::1]:3001';
  }
  
  if (!loginResponse) {
    console.log('Trying localhost...');
    loginResponse = await tryFetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@apco.local',
        password: 'ApcoAdminPassword123!'
      })
    });
    baseUrL = 'http://localhost:3001';
  }

  if (!loginResponse) {
    console.error('❌ All connection attempts failed.');
    return;
  }
  
  const loginStatus = loginResponse.status;
  const loginJson: any = await loginResponse.json();
  console.log(`Login Response Status: ${loginStatus}`);
  if (loginStatus !== 200 || !loginJson.accessToken) {
    console.log('❌ Login failed:', loginJson);
    return;
  }
  
  console.log('✅ Login successful. Token obtained.');
  const token = loginJson.accessToken;
  
  console.log(`Making authorized request to GET ${baseUrL}/api/settings/companies...`);
  
  const requestPromise = fetch(`${baseUrL}/api/settings/companies`, {
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
  
  try {
    const response: any = await Promise.race([requestPromise, timeoutPromise]);
    console.log(`GET /api/settings/companies Status: ${response.status}`);
    const json = await response.json();
    console.log('GET /api/settings/companies JSON:', JSON.stringify(json, null, 2));
  } catch (error: any) {
    console.error('❌ Error during authorized request:', error.message);
  }
}

main();

export {};
