require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');

const app = express();

// --- FIREBASE ADMIN SDK ---
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin Ready");
    } catch (e) {
        console.error("❌ Firebase Admin Error:", e);
    }
}

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serves login.html, etc.

app.use(session({
    secret: 'liquid-glass-vault-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// --- AUTH BRIDGE ---
app.post('/api/auth/firebase', async (req, res) => {
    try {
        const { idToken } = req.body;
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        // Email Verification Gate
        if (decodedToken.firebase.sign_in_provider === 'password' && !decodedToken.email_verified) {
            return res.status(403).json({ success: false, error: "Please verify your email first." });
        }

        req.session.userEmail = decodedToken.email;
        res.json({ success: true });
    } catch (e) {
        res.status(401).json({ success: false, error: "Session Sync Failed" });
    }
});

// --- PAGE ROUTING ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/dashboard', (req, res) => {
    if (!req.session.userEmail) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
