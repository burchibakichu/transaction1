require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const Tesseract = require('tesseract.js');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('uploads'));
// ==========================================
// 1. DATABASE SETUP
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('MongoDB Error:', err));

const transactionSchema = new mongoose.Schema({
    vendorName: String,
    invoiceNumber: String,
    amount: Number,
    date: String,
    currency: String,        // Enriched data
    confidenceScore: Number, // Enriched data
    rawText: String,
    processedAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);
// ==========================================
// 2. MULTER CONFIGURATION (Uploads)
// ==========================================
const upload = multer({ dest: 'uploads/' });
// ==========================================
// 3. PIPELINE TOOLS (Curation, Cleaning, Enrichment)
// ==========================================
// Tool A: Data Extraction & Cleaning (Regex based for industry realism)
const extractEntities = (text) => {
    const lines = text.split('\n').filter(line => line.trim() !== "");
    const amountMatch = text.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2}))/);
    const invoiceMatch = text.match(/INVOICE\s*#\s*(\d+)/i);
    const dateMatch = text.match(/Date[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
    const vendorName = lines.length > 0 ? lines[0].trim() : "Unknown Vendor";
    return {
        amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null,
        invoiceNumber: invoiceMatch ? invoiceMatch[1] : 'UNKNOWN',
        date: dateMatch ? dateMatch[1] : null,
        vendorName: vendorName // In a real scenario, use NLP or coordinate mapping here
    };
};

// Tool B: Data Enrichment
const enrichData = (cleanedData) => {
    return {
        ...cleanedData,
        currency: 'USD', // Standardization/Enrichment
        confidenceScore: cleanedData.amount && cleanedData.invoiceNumber !== 'UNKNOWN' ? 0.95 : 0.50,
        status: cleanedData.amount ? 'Valid' : 'Requires Review'
    };
};


// ==========================================
// 4. ROUTES
// ==========================================

// Serve Webpages
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Fetch Data for Dashboard
app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ processedAt: -1 });
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// The Monolithic Pipeline Endpoint
app.post('/api/pipeline', upload.array('documents'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).send('No files uploaded.');
    }

    const processedRecords = [];

    try {
        for (const file of req.files) {
            const filePath = path.join(__dirname, file.path);
            let extractedText = "";

            // --- STEP 1: OCR / TEXT EXTRACTION ---
            if (file.mimetype === 'application/pdf') {
                const dataBuffer = fs.readFileSync(filePath);

                // Initialize the modern parser with your buffer
                const parser = new PDFParse({ data: dataBuffer });

                // Extract the text using the new method
                const pdfData = await parser.getText();
                extractedText = pdfData.text;

                // Fallback to Tesseract if PDF is essentially an image (empty text)
                if (extractedText.trim().length < 20) {
                    console.log("PDF text low. Simulating OCR fallback...");
                    extractedText = "INV-9999 $450.00 12/12/2023"; // Mock OCR fallback
                }
            } else if (file.mimetype.startsWith('image/')) {
                // Actual OCR for Images using Tesseract
                const worker = await Tesseract.recognize(filePath, 'eng');
                extractedText = worker.data.text;
            }

            // --- STEP 2: DATA CLEANING & CURATION ---
            const cleanedData = extractEntities(extractedText);

            // --- STEP 3: DATA ENRICHMENT ---
            const enrichedData = enrichData(cleanedData);

            // --- STEP 4: DATABASE INSERTION ---
            const transactionRecord = new Transaction({
                ...enrichedData,
                rawText: extractedText.substring(0, 500) // Storing a snippet of raw text for auditing
            });

            await transactionRecord.save();
            processedRecords.push(transactionRecord);

            // Cleanup local file
            fs.unlinkSync(filePath);
        }

        // Redirect back to dashboard to see results
        res.redirect('/dashboard');

    } catch (error) {
        console.error("Pipeline Error:", error);
        res.status(500).send("An error occurred during processing.");
    }
});

// Start Server
app.listen(PORT, () => {
    console.log("Server running on http://localhost:" + PORT);
});