require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const admin = require('firebase-admin');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const exifParser = require('exif-parser');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// --- FIREBASE ADMIN INITIALIZATION ---
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}

// --- CLOUDINARY CONFIG ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET
});

// --- DATABASE SCHEMA ---
mongoose.connect(process.env.MONGO_URI);
const Item = mongoose.model('Item', new mongoose.Schema({
    name: String, 
    url: String, 
    type: String, 
    owner: String, 
    customIcon: String, 
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null }
}));

// --- MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(session({
    secret: 'liquid-glass-vault-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// --- ROUTES ---
app.get(['/', '/login'], (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get(['/signup', '/signup.html'], (req, res) => res.sendFile(path.join(__dirname, 'public/signup.html')));
app.get('/dashboard', (req, res) => req.session.userEmail ? res.sendFile(path.join(__dirname, 'public/dashboard.html')) : res.redirect('/'));

// Firebase Auth Bridge
app.post('/api/auth/firebase', async (req, res) => {
    try {
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
        req.session.userEmail = decodedToken.email;
        res.json({ success: true });
    } catch (e) { res.status(401).send("Authentication Failed"); }
});

// File Upload with Date-Metadata Rename
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/upload', upload.array('files'), async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    const parentId = req.body.parentId === 'null' ? null : req.body.parentId;

    const promises = req.files.map(file => {
        return new Promise((resolve) => {
            let finalName = file.originalname;
            if (file.mimetype.startsWith('image/')) {
                try {
                    const parser = exifParser.create(file.buffer);
                    const tags = parser.parse().tags;
                    if (tags.DateTimeOriginal) {
                        const d = new Date(tags.DateTimeOriginal * 1000);
                        finalName = `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}.${file.originalname.split('.').pop()}`;
                    }
                } catch(e) {}
            }
            cloudinary.uploader.upload_stream({ folder: 'Cloud' }, async (err, result) => {
                const item = await new Item({ name: finalName, url: result.secure_url, type: 'file', owner: req.session.userEmail, parentId }).save();
                resolve(item);
            }).end(file.buffer);
        });
    });
    await Promise.all(promises);
    res.json({ success: true });
});

// Get Items API
app.get('/api/items', async (req, res) => {
    const parentId = req.query.parentId === 'null' || !req.query.parentId ? null : req.query.parentId;
    const items = await Item.find({ owner: req.session.userEmail, parentId }).sort({ type: 1 });
    res.json(items);
});

// Update Item (For Custom Icons & Renaming)
app.patch('/api/items/:id', async (req, res) => {
    await Item.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`🚀 Server active on port ${PORT}`));
