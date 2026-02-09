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

// Setup uploads directory
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const upload = multer({ dest: 'uploads/' });

// 2. DATA MODELS
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}, { bufferCommands: false }); // Stops Mongoose from "holding" commands if DB is shaky

const fileSchema = new mongoose.Schema({
    originalName: String,
    storagePath: String,
    size: Number,
    uploadDate: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const File = mongoose.model('File', fileSchema);

// 3. PAGE ROUTES
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// 4. API ROUTES
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        
        // We check the connection state before running the query
        if (mongoose.connection.readyState !== 1) {
            return res.status(500).send("Signup Failed: Database is not ready. Please try again in a moment.");
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ fullName, email, password: hashedPassword });

        await newUser.save();
        res.redirect('/'); 
    } catch (err) {
        console.error("Signup Error:", err);
        res.status(500).send("Signup Failed: " + err.message);
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (user && await bcrypt.compare(password, user.password)) {
            res.redirect('/dashboard');
        } else {
            res.status(401).send("Invalid email or password.");
        }
    } catch (err) {
        res.status(500).send("Login error.");
    }
});

app.get('/api/files', async (req, res) => {
    try {
        const files = await File.find().sort({ uploadDate: -1 });
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: "Fetch error" });
    }
});

// 5. THE "STRICT" STARTUP LOGIC
// We wrap the listen command inside the connection promise.
// If the DB doesn't connect, the website won't even load, preventing timeouts.
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000, 
})
.then(() => {
    console.log("✅ Database Connected. Launching Server...");
    app.listen(PORT, () => {
        console.log(`🚀 CloudConnect active at port ${PORT}`);
    });
})
.catch(err => {
    console.error("❌ CRITICAL: Database failed to connect at startup.");
    console.error("Error Detail:", err.message);
    // On Render, this will cause a "Build Failed" or "Port Timeout" in logs,
    // which is better than a hanging website.
    process.exit(1); 
});
