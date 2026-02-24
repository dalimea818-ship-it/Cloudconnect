require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const session = require('express-session');
const path = require('path');

const app = express();

// --- SECURE ADMIN SDK INITIALIZATION ---
// This replaces the deprecated Database Secrets/Legacy Tokens
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // Replacing legacy databaseAuthVariableOverride with modern IAM
            databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
        });
        console.log("✅ Firebase Admin SDK Initialized");
    } catch (e) {
        console.error("❌ Failed to parse Service Account JSON:", e);
    }
}

app.use(express.json());
app.use(session({
    secret: 'liquid-glass-vault-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// --- AUTH BRIDGE WITH VERIFICATION CHECK ---
app.post('/api/auth/firebase', async (req, res) => {
    try {
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
        
        // Force Email Verification for Password users
        if (decodedToken.firebase.sign_in_provider === 'password' && !decodedToken.email_verified) {
            return res.status(403).json({ error: "Email not verified. Please check your inbox." });
        }

        req.session.userEmail = decodedToken.email;
        res.json({ success: true });
    } catch (e) {
        res.status(401).send("Authentication Failed");
    }
});

app.listen(process.env.PORT || 3000);
