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
    params: { folder: 'CloudConnect_Glass', resource_type: 'auto' },
});
const upload = multer({ storage: storage });

// --- 2. MIDDLEWARE & SESSIONS ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

app.use(session({
    secret: 'liquid-glass-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" }
}));

// --- 3. DATABASE ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Glass Cloud Connected"));

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

// --- 4. AUTH ROUTES ---
app.post('/api/register', async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await new User({ ...req.body, password: hashedPassword }).save();
    res.redirect('/');
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        req.session.userEmail = user.email;
        res.redirect('/dashboard');
    } else { res.status(401).send("Invalid login"); }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- 5. FILE & FOLDER API ---
app.get('/api/items', async (req, res) => {
    if (!req.session.userEmail) return res.json([]);
    const parentId = req.query.parentId === 'null' || !req.query.parentId ? null : req.query.parentId;
    const items = await Item.find({ owner: req.session.userEmail, parentId }).sort({ type: 1, name: 1 });
    res.json(items);
});

app.post('/api/folder', async (req, res) => {
    const folder = new Item({
        name: req.body.name,
        type: 'folder',
        owner: req.session.userEmail,
        parentId: req.body.parentId || null
    });
    await folder.save();
    res.json({ success: true });
});

app.post('/api/upload', upload.array('files'), async (req, res) => {
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

app.delete('/api/items/:id', async (req, res) => {
    await Item.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// Page catch-alls
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => {
    if (!req.session.userEmail) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, () => console.log(`🚀 Liquid Glass Server active on ${PORT}`));
