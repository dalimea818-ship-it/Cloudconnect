require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const session = require('express-session');
const path = require('path');

const app = express();

// --- ADMIN SDK INIT ---
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(sa) });
        console.log("Firebase Admin Active");
    } catch (e) { console.error("Firebase Init Failed", e); }
}

app.use(express.json());
// Serves your HTML files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'liquid-glass-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// --- THIS IS THE ROUTE THAT FIXES THE LOGIN BUTTON ---
app.post('/api/auth/firebase', async (req, res) => {
    try {
        const { idToken } = req.body;
        const decoded = await admin.auth().verifyIdToken(idToken);
        
        // Block unverified email/password users
        if (decoded.firebase.sign_in_provider === 'password' && !decoded.email_verified) {
            return res.status(403).json({ success: false, error: "Email not verified" });
        }

        req.session.userEmail = decoded.email;
        // MUST return success: true for the frontend to redirect
        res.json({ success: true });
    } catch (e) {
        res.status(401).json({ success: false, error: "Auth check failed" });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));

app.get('/dashboard', (req, res) => {
    if (!req.session.userEmail) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.listen(process.env.PORT || 3000);
