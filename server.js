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

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'CloudConnect_Files',
    resource_type: 'auto', 
  },
});

const upload = multer({ storage: storage });

// --- 2. MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Database Connected"))
    .catch(err => console.error("❌ Database Error:", err.message));

// --- 4. DATA MODELS ---
const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}));

const FileModel = mongoose.model('File', new mongoose.Schema({
    name: String,
    url: String, // Permanent Cloudinary URL
    uploadedAt: { type: Date, default: Date.now }
}));

// --- 5. PAGE ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// --- 6. API ROUTES ---

app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({ fullName, email, password: hashedPassword }).save();
        res.redirect('/'); 
    } catch (err) { res.status(500).send("Signup Failed"); }
});

app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (user && await bcrypt.compare(req.body.password, user.password)) {
            res.redirect('/dashboard');
        } else { res.status(401).send("Invalid credentials"); }
    } catch (err) { res.status(500).send("Login error"); }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        const newFile = new FileModel({ 
            name: req.file.originalname, 
            url: req.file.path // URL provided by Cloudinary
        });
        await newFile.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Upload failed" }); }
});

app.get('/api/files', async (req, res) => {
    const files = await FileModel.find().sort({ uploadedAt: -1 });
    res.json(files);
});

// DELETE FILE ROUTE
app.delete('/api/files/:id', async (req, res) => {
    try {
        await FileModel.findByIdAndDelete(req.params.id); // Removes record from DB
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
