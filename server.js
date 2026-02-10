const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Database Connection Logic
// Using the MONGO_URI variable from Render settings
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ SUCCESS: Connected to AWS MongoDB Cluster"))
    .catch(err => {
        console.error("❌ CONNECTION ERROR:", err.message);
        // We log the error but keep the server alive so you can see logs
    });

// 2. User Schema
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}, { bufferCommands: false }); // Prevents the 10-second timeout hang

const User = mongoose.model('User', userSchema);

// 3. API Routes
app.post('/api/register', async (req, res) => {
    try {
        // Stop if database isn't ready
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).send("Database not ready yet. Please try again in 5 seconds.");
        }

        const { fullName, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = new User({ fullName, email, password: hashedPassword });
        await newUser.save();
        
        res.redirect('/'); 
    } catch (err) {
        console.error("Signup Error:", err.message);
        res.status(500).send("Signup Failed: " + err.message);
    }
});

// 4. Page Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});

