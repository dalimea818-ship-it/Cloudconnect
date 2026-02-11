const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const session = require('express-session'); // Added for security

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. CLOUDINARY CONFIG ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'CloudConnect_Files', resource_type: 'auto' },
});
const upload = multer({ storage: storage });

// --- 2. MIDDLEWARE & SESSIONS ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret-key-cloudconnect',
    resave: false,
    saveUninitialized: true
}));

// --- 3. DATABASE ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Connected"));

// --- 4. MODELS ---
const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}));

const FileModel = mongoose.model('File', new mongoose.Schema({
    name: String,
    url: String,
    owner: String, // Store user's email here for privacy
    uploadedAt: { type: Date, default: Date.now }
}));

// --- 5. PAGE ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => {
    if (!req.session.userEmail) return res.redirect('/'); // Protect dashboard
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- 6. API ROUTES ---

app.post('/api/register', async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await new User({ ...req.body, password: hashedPassword }).save();
    res.redirect('/');
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        req.session.userEmail = user.email; // Save user session
        res.redirect('/dashboard');
    } else { res.status(401).send("Invalid login"); }
});

// Upload route with Owner tagging
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.session.userEmail) return res.status(401).json({ error: "Unauthorized" });
    const newFile = new FileModel({ 
        name: req.file.originalname, 
        url: req.file.path,
        owner: req.session.userEmail // Tag file with the logged-in user
    });
    await newFile.save();
    res.json({ success: true });
});

// Get ONLY the current user's files
app.get('/api/files', async (req, res) => {
    if (!req.session.userEmail) return res.json([]);
    const files = await FileModel.find({ owner: req.session.userEmail }).sort({ uploadedAt: -1 });
    res.json(files);
});

app.delete('/api/files/:id', async (req, res) => {
    await FileModel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Secure Server Active` ));
