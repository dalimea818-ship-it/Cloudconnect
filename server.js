const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. ENSURE UPLOADS FOLDER EXISTS
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    console.log("📁 Creating uploads folder...");
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. DATABASE
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ DB Connected"))
    .catch(err => console.error("❌ DB Fail:", err.message));

const FileModel = mongoose.model('File', new mongoose.Schema({
    name: String,
    path: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now }
}));

// 3. MULTER CONFIG (Adding limits to prevent crashes)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// 4. THE UPLOAD ROUTE
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file received by server" });
        }

        const newFile = new FileModel({
            name: req.file.originalname,
            path: req.file.path,
            size: req.file.size
        });

        await newFile.save();
        console.log(`✅ File saved: ${req.file.originalname}`);
        res.json({ success: true, file: req.file.originalname });

    } catch (err) {
        console.error("❌ Upload Route Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// API to list files
app.get('/api/files', async (req, res) => {
    try {
        const files = await FileModel.find().sort({ uploadedAt: -1 });
        res.json(files);
    } catch (err) {
        res.status(500).json([]);
    }
});

// Page routes
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
