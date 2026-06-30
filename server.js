const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Dummy homepage
app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Server Test</title>
      <style>
        body {
          margin: 0;
          height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #f4f4f4;
          font-family: Arial, sans-serif;
        }

        .card {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          text-align: center;
        }

        h1 {
          color: #16a34a;
          margin-bottom: 10px;
        }

        p {
          color: #555;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>✅ Server is Running</h1>
        <p>Your Express application is working.</p>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        message: "Server is running"
    });
});

// Start locally OR export for Vercel
if (process.env.VERCEL) {
    module.exports = app;
} else {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}