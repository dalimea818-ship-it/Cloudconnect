require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const app = express();

// --- FIREBASE ADMIN SDK ---
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(sa) });
    } catch (e) { console.error("Firebase Init Error:", e); }
}

// --- DATABASE & STORAGE ---
mongoose.connect(process.env.MONGO_URI);
const Item = mongoose.model('Item', new mongoose.Schema({
    name: String, url: String, type: String, owner: String, 
    customIcon: { type: String, default: "https://i.ibb.co/image_89b042.png" }, 
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null }
}));

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('trust proxy', 1); 
app.use(session({
    secret: 'liquid-glass-vault',
    resave: true,
    saveUninitialized: false,
    cookie: { secure: true, sameSite: 'none' }
}));

// --- AUTH BRIDGE ---
app.post('/api/auth/firebase', async (req, res) => {
    try {
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
        req.session.userEmail = decodedToken.email;
        req.session.save(() => res.json({ success: true }));
    } catch (e) { res.status(401).json({ success: false }); }
});

// --- FILE OPERATIONS ---
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/upload', upload.array('files'), async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    const promises = req.files.map(file => {
        return new Promise((resolve) => {
            cloudinary.uploader.upload_stream({ folder: 'CloudConnect' }, async (err, result) => {
                const item = await new Item({ 
                    name: file.originalname, url: result.secure_url, 
                    type: 'file', owner: req.session.userEmail, 
                    parentId: req.body.parentId || null 
                }).save();
                resolve(item);
            }).end(file.buffer);
        });
    });
    await Promise.all(promises);
    res.json({ success: true });
});

app.patch('/api/items/:id', async (req, res) => {
    await Item.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true });
});

app.get('/dashboard', (req, res) => {
    if (!req.session.userEmail) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));

app.listen(process.env.PORT || 3000);
