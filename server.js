require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');

const app = express();

// --- 1. FIREBASE ADMIN SDK ---
// This uses the Service Account JSON you provided in your Render environment variables.
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin SDK Initialized");
    } catch (e) {
        console.error("❌ Firebase Admin Init Error (Check JSON format):", e);
    }
}

// --- 2. MIDDLEWARE & SESSION ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy is required for cookies to work on Render's HTTPS setup
app.set('trust proxy', 1); 

app.use(session({
    secret: 'liquid-glass-vault-key',
    resave: true, // Ensure session is updated
    saveUninitialized: false,
    cookie: { 
        secure: true, // Required for HTTPS on Render
        sameSite: 'none', // Allows session cookies to work with Firebase's cross-site auth
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// --- 3. THE AUTH BRIDGE (FIXES REDIRECT ISSUE) ---
app.post('/api/auth/firebase', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ success: false, error: "No token provided" });

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        // Security Gate: Check for Email Verification if user logged in via Password
        if (decodedToken.firebase.sign_in_provider === 'password' && !decodedToken.email_verified) {
            return res.status(403).json({ success: false, error: "Email not verified." });
        }

        // Save user to session
        req.session.userEmail = decodedToken.email;
        
        // Explicitly save the session before responding to the frontend
        req.session.save((err) => {
            if (err) {
                console.error("Session Save Error:", err);
                return res.status(500).json({ success: false, error: "Session save failed" });
            }
            res.json({ success: true });
        });
    } catch (e) {
        console.error("Auth Bridge Error:", e.message);
        res.status(401).json({ success: false, error: "Authentication failed" });
    }
});

// --- 4. PAGE ROUTING ---

// Serves login.html as the primary entry point
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

// Protected Dashboard Route
app.get('/dashboard', (req, res) => {
    if (!req.session.userEmail) {
        console.log("No session found, redirecting to login...");
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Logout Route
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- 5. SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
