const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 2. DATABASE CONNECTION ---
// Ensure MONGO_URI in Render is: mongodb+srv://cloudcoonect:admin@cloudcoonect.mqnkvfj.mongodb.net/CloudConnect
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ SUCCESS: Connected to AWS MongoDB Cluster"))
    .catch(err => console.error("❌ CONNECTION ERROR:", err.message));

// --- 3. DATA MODELS ---
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}, { bufferCommands: false });

const User = mongoose.model('User', userSchema);

// --- 4. PAGE ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// --- 5. API ROUTES ---

// Signup Logic
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ fullName, email, password: hashedPassword });
        await newUser.save();
        res.redirect('/'); 
    } catch (err) {
        res.status(500).send("Signup Failed: " + err.message);
    }
});

// Login Logic (Fixes "Cannot POST /api/login")
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).send("User not found. Please sign up first.");
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            console.log(`✅ ${email} logged in successfully`);
            res.redirect('/dashboard');
        } else {
            res.status(401).send("Invalid password.");
        }
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).send("Server error during login.");
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
