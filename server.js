const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. MONGODB CONNECTION
const MONGO_URI = process.env.MONGO_URI; 
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ DB Error:", err));

// 2. DATA MODELS
const userSchema = new mongoose.Schema({
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

// 3. MIDDLEWARE
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: 'uploads/' });

// 4. ROUTES

// Serve HTML Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// Auth Logic
app.post('/api/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const newUser = new User({ email: req.body.email, password: hashedPassword });
        await newUser.save();
        res.redirect('/'); 
    } catch (err) { res.status(400).send("Signup Failed"); }
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        res.redirect('/dashboard');
    } else {
        res.status(401).send("Invalid Credentials");
    }
});

// File Logic
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file');
    const newFile = new File({
        originalName: req.file.originalname,
        storagePath: req.file.path,
        size: req.file.size
    });
    await newFile.save();
    res.json({ name: req.file.originalname });
});

// Get real files for Dashboard
app.get('/api/files', async (req, res) => {
    const files = await File.find().sort({ uploadDate: -1 });
    res.json(files);
});

app.listen(PORT, () => console.log(`🚀 CloudConnect Live`));
