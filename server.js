const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. CONFIG ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: { folder: 'CloudGlass_Ultimate', resource_type: 'auto' },
});
const upload = multer({ storage: storage });

// --- 2. MIDDLEWARE ---
// Explicitly serve the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

app.use(session({
    secret: 'liquid-dark-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// --- 3. DATABASE & MODELS ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Database Connected"));

const Item = mongoose.model('Item', new mongoose.Schema({
    name: String,
    url: String,
    type: { type: String, enum: ['file', 'folder'] },
    owner: String,
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    createdAt: { type: Date, default: Date.now }
}));

const User = mongoose.model('User', new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true },
    password: { type: String }
}));

// --- 4. PAGE ROUTES (The Fix for 'Cannot GET') ---

// Home/Login Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Signup Page
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Dashboard Page (Protected)
app.get('/dashboard', (req, res) => {
    if (!req.session.userEmail) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- 5. API ROUTES ---

app.post('/api/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        await new User({ ...req.body, password: hashedPassword }).save();
        res.redirect('/');
    } catch (err) { res.status(400).send("Registration failed."); }
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        req.session.userEmail = user.email;
        res.redirect('/dashboard');
    } else { res.status(401).send("Invalid credentials"); }
});

app.get('/api/items', async (req, res) => {
    if (!req.session.userEmail) return res.status(401).json([]);
    const parentId = req.query.parentId === 'null' || !req.query.parentId ? null : req.query.parentId;
    const items = await Item.find({ owner: req.session.userEmail, parentId }).sort({ type: 1, name: 1 });
    res.json(items);
});

app.post('/api/upload', upload.array('files'), async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    const parentId = req.body.parentId === 'null' || !req.body.parentId ? null : req.body.parentId;
    const uploads = req.files.map(file => new Item({
        name: file.originalname,
        url: file.path,
        type: 'file',
        owner: req.session.userEmail,
        parentId: parentId
    }).save());
    await Promise.all(uploads);
    res.json({ success: true });
});

app.post('/api/folder', async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    await new Item({
        name: req.body.name,
        type: 'folder',
        owner: req.session.userEmail,
        parentId: req.body.parentId || null
    }).save();
    res.json({ success: true });
});

app.delete('/api/items/:id', async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    await Item.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
