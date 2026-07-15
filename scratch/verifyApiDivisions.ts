async function main() {
  console.log('📡 Fetching GET http://[::1]:3000/api/public/divisions...');
  const res = await fetch('http://[::1]:3000/api/public/divisions');
  if (!res.ok) {
    throw new Error(`API returned status ${res.status}`);
  }
  const data = await res.json();
  console.dir(data, { depth: null });
}

main().catch(console.error);
