const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();

// =============================
// Middleware
// =============================
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// =============================
// MongoDB Connection
// =============================
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// =============================
// Models
// =============================
const UserSchema = new mongoose.Schema({
    username: String,
    password: String
});

const FileSchema = new mongoose.Schema({
    userId: String,
    name: String,
    type: String, // file or folder
    parent: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const File = mongoose.model('File', FileSchema);

// =============================
// Auth Middleware
// =============================
function auth(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "No token" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ message: "Invalid token" });
    }
}

// =============================
// Routes
// =============================

// Default route -> login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// =============================
// Signup
// =============================
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser)
        return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
        username,
        password: hashedPassword
    });

    await newUser.save();

    res.json({ message: "User created" });
});

// =============================
// Login
// =============================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user)
        return res.status(400).json({ message: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
        return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

    res.json({ token });
});

// =============================
// Get Files
// =============================
app.get('/api/files', auth, async (req, res) => {
    const files = await File.find({ userId: req.user.id });
    res.json(files);
});

// =============================
// Create Folder
// =============================
app.post('/api/folder', auth, async (req, res) => {
    const { name, parent } = req.body;

    const folder = new File({
        userId: req.user.id,
        name,
        type: "folder",
        parent: parent || null
    });

    await folder.save();
    res.json(folder);
});

// =============================
// Create File (metadata only)
// =============================
app.post('/api/file', auth, async (req, res) => {
    const { name, parent } = req.body;

    const file = new File({
        userId: req.user.id,
        name,
        type: "file",
        parent: parent || null
    });

    await file.save();
    res.json(file);
});

// =============================
// Delete File / Folder
// =============================
app.delete('/api/file/:id', auth, async (req, res) => {
    await File.deleteOne({ _id: req.params.id, userId: req.user.id });
    res.json({ message: "Deleted" });
});

// =============================
// Start Server (Render Safe)
// =============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});