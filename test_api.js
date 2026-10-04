const http = require('http');

async function test() {
  const reqData = JSON.stringify({
    text: "He go to college everyday.",
    language: "English",
    mode: "grammar"
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/check',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(reqData)
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Response status:', res.statusCode);
      console.log('Response body:', data);
      process.exit(0);
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e.message);
    process.exit(1);
  });

  req.write(reqData);
  req.end();
}

test();
