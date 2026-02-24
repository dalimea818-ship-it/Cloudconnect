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

// --- FIREBASE ADMIN SDK ---
// This uses the Service Account JSON you added to Render's Environment Variables
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin SDK Initialized");
    } catch (error) {
        console.error("❌ Firebase Admin Init Error:", error);
    }
}

// --- CLOUDINARY CONFIG ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET
});

// --- DATABASE SCHEMA ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

const Item = mongoose.model('Item', new mongoose.Schema({
    name: String, 
    url: String, 
    type: String, 
    owner: String, 
    customIcon: String, 
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null }
}));

// --- MIDDLEWARE ---
// This fixes "Cannot GET /" by serving files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(session({
    secret: 'liquid-glass-vault-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// --- AUTHENTICATION ROUTES ---

// Bridge to verify Firebase Token and check Email Verification
app.post('/api/auth/firebase', async (req, res) => {
    try {
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
        
        // Block users who haven't verified their email (for Email/Password users)
        if (decodedToken.firebase.sign_in_provider === 'password' && !decodedToken.email_verified) {
            return res.status(403).json({ error: "Email not verified" });
        }

        req.session.userEmail = decodedToken.email;
        res.json({ success: true });
    } catch (e) {
        res.status(401).send("Authentication Failed");
    }
});

// Explicit Route for Homepage to prevent "Cannot GET /"
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/dashboard', (req, res) => {
    if (!req.session.userEmail) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// --- FILE OPERATIONS ---

const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/upload', upload.array('files'), async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send("Unauthorized");
    const parentId = req.body.parentId === 'null' || !req.body.parentId ? null : req.body.parentId;

    const promises = req.files.map(file => {
        return new Promise((resolve) => {
            let finalName = file.originalname;
            // Rename logic: Use EXIF date for images
            if (file.mimetype.startsWith('image/')) {
                try {
                    const parser = exifParser.create(file.buffer);
                    const tags = parser.parse().tags;
                    if (tags.DateTimeOriginal) {
                        const d = new Date(tags.DateTimeOriginal * 1000);
                        finalName = `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}.${file.originalname.split('.').pop()}`;
                    }
                } catch(e) { console.log("Metadata skip"); }
            }

            cloudinary.uploader.upload_stream({ folder: 'CloudConnect' }, async (err, result) => {
                if (err) return resolve(null);
                const item = await new Item({ 
                    name: finalName, 
                    url: result.secure_url, 
                    type: 'file', 
                    owner: req.session.userEmail, 
                    parentId 
                }).save();
                resolve(item);
            }).end(file.buffer);
        });
    });

    await Promise.all(promises);
    res.json({ success: true });
});

// API to get files/folders
app.get('/api/items', async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    const parentId = req.query.parentId === 'null' || !req.query.parentId ? null : req.query.parentId;
    const items = await Item.find({ owner: req.session.userEmail, parentId }).sort({ type: 1 });
    res.json(items);
});

// API to update items (Icons/Rename)
app.patch('/api/items/:id', async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    await Item.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true });
});

// Logout
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
