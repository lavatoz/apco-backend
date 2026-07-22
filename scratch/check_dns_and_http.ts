import https from 'https';

async function testFetch(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data.substring(0, 500) }));
    });
    req.on('error', (err) => resolve({ status: 0, body: err.message }));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ status: 0, body: 'Timeout' });
    });
  });
}

async function main() {
  const urlsToTest = [
    'https://apco-backend-production.up.railway.app/api/verify/AK-DOC-2026-000010',
    'https://apco-backend-production.up.railway.app/api/verify/APCO-DOC-2026-000008',
    'https://apco-backend-production.up.railway.app/api/health',
  ];

  for (const url of urlsToTest) {
    console.log(`Testing URL: ${url}`);
    const res = await testFetch(url);
    console.log(`  Status: ${res.status}`);
    console.log(`  Body: ${res.body}\n`);
  }
}

main().catch(console.error);
