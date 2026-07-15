import http from 'http';

function main() {
  console.log('📡 Fetching GET http://localhost:3000/api/public/divisions via http.get...');
  
  http.get('http://localhost:3000/api/public/divisions', (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    
    let body = '';
    res.on('data', (chunk) => {
      body += chunk;
    });
    
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.dir(data, { depth: null });
      } catch (err) {
        console.error('Failed to parse JSON body:', err);
        console.log('Raw body:', body);
      }
    });
  }).on('error', (err) => {
    console.error('Request failed:', err);
  });
}

main();
