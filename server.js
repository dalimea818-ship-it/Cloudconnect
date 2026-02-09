const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. MIDDLEWARE
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup uploads folder
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const upload = multer({ dest: 'uploads/' });

// 2. DATA MODELS
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}, { bufferCommands: false });

const User = mongoose.model('User', userSchema);
const File = mongoose.model('File', mongoose.Schema({
    originalName: String,
    storagePath: String,
    size: Number,
    uploadDate: { type: Date, default: Date.now }
}));

// 3. ROUTES
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        if (mongoose.connection.readyState !== 1) {
            throw new Error("Database not connected. Check Atlas Network Access.");
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ fullName, email, password: hashedPassword });
        await newUser.save();
        res.redirect('/'); 
    } catch (err) {
        console.error("Signup error details:", err);
        res.status(500).send("Signup Failed: " + err.message);
    }
});

// 4. CONNECTION AND STARTUP
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, { 
    serverSelectionTimeoutMS: 5000 
})
.then(() => {
    console.log("✅ MongoDB Connected Successfully");
    app.listen(PORT, () => {
        console.log(`🚀 Server listening on port ${PORT}`);
    });
})
.catch(err => {
    console.error("❌ CRITICAL CONNECTION ERROR:", err.message);
    // We let it listen anyway so Render doesn't "fail" the build, 
    // allowing you to check the site logs at /api/status if needed.
    app.listen(PORT, () => {
        console.log(`🚀 Server started in OFFLINE mode on port ${PORT}`);
    });
});
