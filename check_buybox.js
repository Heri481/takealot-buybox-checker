// SIMPLE WEB SERVER FOR RENDER (No scraper runs automatically)
const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// Simple route to show the server is alive
app.get('/', (req, res) => {
    res.send(`
        <h1>✅ Takealot Buy Box Checker is Running!</h1>
        <p>Your scraper API is online and ready.</p>
        <p>To trigger a check, visit: <code>/run</code></p>
    `);
});

// This is where the scraper will be triggered (Week 2)
app.get('/run', (req, res) => {
    res.send('Scraper will run here in Week 2!');
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});
