async function testAPI() {
  const payload = {
    restaurant_name: "The Antigravity Cafe",
    owner_name: "Anti Gravity",
    email: "antigravity.demo@tableos.demo", // Fake email for test
    phone: "555-010-0202",
    plan: "DEMO"
  };

  try {
    const res = await fetch('http://localhost:3000/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", data);
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

testAPI();
