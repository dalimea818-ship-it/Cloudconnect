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

app.set('trust proxy', 1); 
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" }
}));

// --- 3. DATABASE ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ DB Connected"))
    .catch(err => console.error("❌ DB Connection Error:", err));

// --- 4. MODELS ---
const User = mongoose.model('User', new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}));

const ItemModel = mongoose.model('Item', new mongoose.Schema({
    name: String,
    url: String, 
    type: { type: String, enum: ['file', 'folder'], required: true },
    owner: String,
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    uploadedAt: { type: Date, default: Date.now }
}));

// --- 5. PAGE ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => {
    if (!req.session.userEmail) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- 6. API ROUTES ---

app.post('/api/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        await new User({ ...req.body, password: hashedPassword }).save();
        res.redirect('/');
    } catch (err) { res.status(400).send("Signup failed"); }
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        req.session.userEmail = user.email;
        res.redirect('/dashboard');
    } else { res.status(401).send("Invalid login"); }
});

// Fetch items (Files + Folders) for a specific parent
app.get('/api/items', async (req, res) => {
    if (!req.session.userEmail) return res.status(401).json([]);
    const parentId = req.query.parentId === 'null' || !req.query.parentId ? null : req.query.parentId;
    try {
        const items = await ItemModel.find({ 
            owner: req.session.userEmail, 
            parentId: parentId 
        }).sort({ type: 1, name: 1 });
        res.json(items);
    } catch (err) { res.status(500).json([]); }
});

// Create Folder
app.post('/api/folder', async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    try {
        const folder = new ItemModel({
            name: req.body.name,
            type: 'folder',
            owner: req.session.userEmail,
            parentId: req.body.parentId || null
        });
        await folder.save();
        res.json({ success: true });
    } catch (err) { res.status(500).send(); }
});

// Upload File
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    try {
        const newFile = new ItemModel({
            name: req.file.originalname,
            url: req.file.path,
            type: 'file',
            owner: req.session.userEmail,
            parentId: req.body.parentId === 'null' ? null : req.body.parentId
        });
        await newFile.save();
        res.json({ success: true });
    } catch (err) { res.status(500).send(); }
});

// Delete Item
app.delete('/api/items/:id', async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    try {
        await ItemModel.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).send(); }
});

app.listen(PORT, () => console.log(`🚀 Server Running on Port ${PORT}`));
