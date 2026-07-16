async function main() {
  const url = 'https://apco-main-ashwin-tcn5.vercel.app/assets/index-Co99nQct.js';
  console.log(`Fetching deployed script: ${url}...`);

  const response = await fetch(url);
  const text = await response.text();
  console.log('Script size in characters:', text.length);

  // Search for the error throwing snippet in the minified js
  // Search for references to /auth/login or HTTP error statuses
  const searchPattern = /\/auth\/login/i;
  const match = text.match(searchPattern);
  if (match) {
    console.log('Found /auth/login reference in minified JS!');
    // Print around the match
    const index = match.index || 0;
    console.log('Snippet around /auth/login:');
    console.log(text.substring(Math.max(0, index - 200), Math.min(text.length, index + 300)));
  } else {
    console.log('Could not find /auth/login directly.');
  }

  // Search for the API_URL assignment (typically looks like "...||'http://localhost:3000/api'")
  const apiUrlPattern = /http:\/\/localhost:3000\/api/gi;
  const matches = [...text.matchAll(apiUrlPattern)];
  console.log(`Found ${matches.length} occurrences of localhost API URL`);
  for (const m of matches) {
    const idx = m.index || 0;
    const snippet = text.substring(Math.max(0, idx - 150), Math.min(text.length, idx + 150));
    console.log('Snippet around localhost API URL:');
    console.log(snippet);
  }

  // Also check for any custom API URL ending in railway.app
  const railwayUrlPattern = /railway\.app/gi;
  const rwMatches = [...text.matchAll(railwayUrlPattern)];
  console.log(`Found ${rwMatches.length} occurrences of railway.app`);
  for (const m of rwMatches) {
    const idx = m.index || 0;
    const snippet = text.substring(Math.max(0, idx - 150), Math.min(text.length, idx + 150));
    console.log('Snippet around railway.app:');
    console.log(snippet);
  }
}

main().catch(console.error);
