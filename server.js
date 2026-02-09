const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. DATABASE CONNECTION
// Added a 5-second timeout so the site doesn't hang forever if the DB is down
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000 
})
.then(() => console.log("✅ Connected to MongoDB Atlas"))
.catch(err => console.error("❌ MongoDB Connection Error:", err.message));

// 2. DATA MODELS
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});

const fileSchema = new mongoose.Schema({
    originalName: String,
    storagePath: String,
    size: Number,
    uploadDate: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const File = mongoose.model('File', fileSchema);

// 3. MIDDLEWARE
// Using path.join(__dirname) is critical for Render to find your 'public' folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup uploads directory
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const upload = multer({ dest: 'uploads/' });

// 4. PAGE ROUTES
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 5. API ROUTES

// User Registration
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        
        // Basic check for existing user
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send("Signup Failed: Email already in use.");
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            fullName, 
            email, 
            password: hashedPassword 
        });

        await newUser.save();
        res.redirect('/'); 
    } catch (err) {
        console.error("Signup Error:", err);
        res.status(500).send("Signup Failed: " + err.message);
    }
});

// User Login
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
        res.status(500).send("Login error occurred.");
    }
});

// File Upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file selected' });

        const newFile = new File({
            originalName: req.file.originalname,
            storagePath: req.file.path,
            size: req.file.size
        });

        await newFile.save();
        res.status(200).json({ name: req.file.originalname });
    } catch (err) {
        res.status(500).json({ error: 'Database error saving file info.' });
    }
});

// Fetch File List
app.get('/api/files', async (req, res) => {
    try {
        const files = await File.find().sort({ uploadDate: -1 });
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'Could not fetch files.' });
    }
});

// 6. START SERVER
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
