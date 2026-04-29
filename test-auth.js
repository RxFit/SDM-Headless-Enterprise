const url = 'http://localhost:8095/api/v1/auth/token';
const tasksUrl = 'http://localhost:8095/api/v1/tasks';

async function testAuth() {
  console.log('1. Fetching JWT token...');
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'sdm-dev-key-2026' }) 
  });
  const data = await res.json();
  
  if (data.token) {
    console.log('\n2. Accessing /tasks WITH JWT token...');
    res = await fetch(tasksUrl, {
      headers: { 'Authorization': `Bearer ${data.token}` }
    });
    const tasks = await res.json();
    console.log('Tasks Response:', JSON.stringify(tasks).substring(0, 100) + '...');
  }
}

testAuth();
