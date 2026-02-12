const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();

// --- Cloudinary Configuration ---
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

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ DB Error:", err));

// --- Models ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String }
}));

const File = mongoose.model('File', new mongoose.Schema({
    userId: String,
    name: String,
    url: String, // Added back for Cloudinary link
    type: { type: String, default: 'file' },
    createdAt: { type: Date, default: Date.now }
}));

// --- Auth Middleware ---
function auth(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "No token provided" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ message: "Invalid token" });
    }
}

// --- Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

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
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
});

// --- Privacy: Get ONLY your files ---
app.get('/api/files', auth, async (req, res) => {
    const files = await File.find({ userId: req.user.id });
    res.json(files);
});

// --- Upload to Cloudinary (Privacy Fixed) ---
app.post('/api/upload', auth, upload.single('file'), async (req, res) => {
    try {
        const file = new File({
            userId: req.user.id, // Securely linked to user
            name: req.file.originalname,
            url: req.file.path,
            type: "file"
        });
        await file.save();
        res.json(file);
    } catch (err) { res.status(500).json({ error: "Upload failed" }); }
});

app.delete('/api/file/:id', auth, async (req, res) => {
    await File.deleteOne({ _id: req.params.id, userId: req.user.id });
    res.json({ message: "Deleted" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
