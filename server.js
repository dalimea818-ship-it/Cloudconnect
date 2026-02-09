const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. DATABASE CONNECTION
// This uses the environment variable you set in Render
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ Database connection error:", err));

// 2. DATABASE MODELS
const userSchema = new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});

const fileSchema = new mongoose.Schema({
    originalName: String,
    storagePath: String,
    size: Number,
    uploadDate: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const File = mongoose.model('File', fileSchema);

// 3. MIDDLEWARE & STORAGE SETTINGS
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const upload = multer({ dest: 'uploads/' });

// 4. ROUTES

// --- UI Navigation ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// --- Authentication Logic ---
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = new User({ fullName, email, password: hashedPassword });
        await newUser.save();
        
        res.redirect('/'); 
    } catch (err) {
        res.status(400).send("Registration failed. Email might already exist.");
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (user && await bcrypt.compare(password, user.password)) {
            res.redirect('/dashboard');
        } else {
            res.status(401).send("Invalid email or password.");
        }
    } catch (err) {
        res.status(500).send("Server error during login.");
    }
});

// --- File Management ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file selected' });

        const newFile = new File({
            originalName: req.file.originalname,
            storagePath: req.file.path,
            size: req.file.size
        });

        await newFile.save();
        res.status(200).json({ name: req.file.originalname });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save file metadata.' });
    }
});

// Fetch all files for the dashboard
app.get('/api/files', async (req, res) => {
    const files = await File.find().sort({ uploadDate: -1 });
    res.json(files);
});

app.listen(PORT, () => {
    console.log(`🚀 CloudConnect active on port ${PORT}`);
});
