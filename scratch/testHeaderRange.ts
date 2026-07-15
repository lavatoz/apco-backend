import http from 'http';

function main() {
  console.log('📡 Fetching GET http://localhost:3000/api/public/divisions/media/1x-cYEXHO_muHVSxJCZSRoO9gIh3_L4KI with Range: bytes=0-0...');
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/public/divisions/media/1x-cYEXHO_muHVSxJCZSRoO9gIh3_L4KI',
    method: 'GET',
    headers: {
      'Range': 'bytes=0-0'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    res.resume(); // consume the stream
  });

  req.on('error', (err) => {
    console.error('Request failed:', err);
  });

  req.end();
}

main();
