const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. CLOUDINARY CONFIGURATION ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Setup Cloudinary storage for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'CloudConnect_Files',
    resource_type: 'auto', // Allows images, PDFs, and other file types
  },
});

const upload = multer({ storage: storage });

// --- 2. MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Successfully connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err.message));

// --- 4. DATA MODELS ---
const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}));

const FileModel = mongoose.model('File', new mongoose.Schema({
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
}));

// --- 5. PAGE ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// --- 6. API ROUTES ---

// Signup Route
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ fullName, email, password: hashedPassword });
        await newUser.save();
        res.redirect('/'); 
    } catch (err) {
        res.status(500).send("Signup Failed: " + err.message);
    }
});

// Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (user && await bcrypt.compare(password, user.password)) {
            console.log(`✅ ${email} logged in`);
            res.redirect('/dashboard');
        } else {
            res.status(401).send("Invalid email or password.");
        }
    } catch (err) {
        res.status(500).send("Login error occurred.");
    }
});

// File Upload Route (Cloudinary)
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file selected" });

        const newFile = new FileModel({
            name: req.file.originalname,
            url: req.file.path // This is the permanent Cloudinary URL
        });

        await newFile.save();
        res.json({ success: true, url: req.file.path });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Upload failed" });
    }
});

// Fetch File List Route
app.get('/api/files', async (req, res) => {
    try {
        const files = await FileModel.find().sort({ uploadedAt: -1 });
        res.json(files);
    } catch (err) {
        res.status(500).json([]);
    }
});

app.listen(PORT, () => console.log(`🚀 Server spinning on port ${PORT}`));
