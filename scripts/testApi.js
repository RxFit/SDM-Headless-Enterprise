const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2NhdGlvbl9pZCI6IjJ1cFk0RTVDeU9BVkZCOFdyNVBIIiwidmVyc2lvbiI6MSwiaWF0IjoxNzc0MzIxMjUyNTAyLCJzdWIiOiJnSDh0TzNuU3pSQjR4R1NhampIZyJ9.sDcWn9pqcwiejqPlJZnOymlNWgox9l2ZWM8YNF6TIFo";

async function testGHL_V2() {
  try {
    const res = await fetch("https://services.leadconnectorhq.com/users/?locationId=2upY4E5CyOAVFB8Wr5PH", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Version": "2021-07-28",
        "Accept": "application/json"
      }
    });
    console.log("GHL V2 Status:", res.status);
    if(res.status === 200) console.log("GHL V2 SUCCESS");
  } catch(e) { console.error("GHL V2 Error:", e.message); }
}

async function testGHL_V1() {
  try {
    const res = await fetch("https://rest.gohighlevel.com/v1/users/", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    console.log("GHL V1 Status:", res.status);
    if(res.status === 200) console.log("GHL V1 SUCCESS");
  } catch(e) { console.error("GHL V1 Error:", e.message); }
}

async function testCopilot() {
  try {
    const res = await fetch("https://api.copilot.com/v1/clients", {
      headers: { "X-API-Key": token }
    });
    console.log("Copilot Status:", res.status);
    if(res.status === 200) console.log("Copilot SUCCESS");
  } catch(e) { console.error("Copilot Error:", e.message); }
}

testGHL_V2();
testGHL_V1();
testCopilot();
