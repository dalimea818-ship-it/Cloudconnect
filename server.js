const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();

// --- 1. Cloudinary Configuration ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'CloudConnect_Files',
    resource_type: 'auto',
  },
});
const upload = multer({ storage: storage });

// --- 2. Middleware & Session Setup ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'keyboard_cat_secret', // You can change this to any string
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS/Render (but false is safer for testing)
}));

// --- 3. MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ DB Error:", err));

// --- 4. Models ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String }
}));

const File = mongoose.model('File', new mongoose.Schema({
    userId: String,
    name: String,
    url: String,
    type: { type: String, default: 'file' },
    createdAt: { type: Date, default: Date.now }
}));

// --- 5. Page Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));

// Protect the Dashboard: If no session, go back to login
app.get('/dashboard', (req, res) => {
    if (!req.session.userId) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- 6. API Routes (Auth) ---

app.post('/api/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({ username, password: hashedPassword }).save();
        res.json({ message: "User created" });
    } catch (err) { res.status(400).json({ message: "Signup failed" }); }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ message: "Invalid credentials" });
    }
    // Set the session
    req.session.userId = user._id;
    res.json({ message: "Logged in" });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- 7. API Routes (Files) ---

// Privacy: Find files only for the logged-in user session
app.get('/api/files', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    const files = await File.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    res.json(files);
});

// Upload to Cloudinary (Tagged to User)
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    try {
        const file = new File({
            userId: req.session.userId,
            name: req.file.originalname,
            url: req.file.path
        });
        await file.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Upload failed" }); }
});

app.delete('/api/file/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    await File.deleteOne({ _id: req.params.id, userId: req.session.userId });
    res.json({ message: "Deleted" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Secure Session Server live on port ${PORT}`));
