const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

/* ========================================
   CLOUDINARY CONFIG
======================================== */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'CloudConnect_Files',
    resource_type: 'auto'
  }
});

const upload = multer({ storage });

/* ========================================
   MIDDLEWARE
======================================== */

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'cloudconnect-secret-key',
  resave: false,
  saveUninitialized: false
}));

/* ========================================
   DATABASE
======================================== */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("DB Error:", err));

/* ========================================
   MODELS
======================================== */

// User Model
const User = mongoose.model('User', new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true }
}));

// Folder Model
const Folder = mongoose.model('Folder', new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: String, required: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  createdAt: { type: Date, default: Date.now }
}));

// File Model
const FileModel = mongoose.model('File', new mongoose.Schema({
  name: String,
  url: String,
  owner: String,
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  uploadedAt: { type: Date, default: Date.now }
}));

/* ========================================
   AUTH MIDDLEWARE
======================================== */

function requireAuth(req, res, next) {
  if (!req.session.userEmail) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/* ========================================
   PAGE ROUTES
======================================== */

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'login.html'))
);

app.get('/signup', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'signup.html'))
);

app.get('/dashboard', (req, res) => {
  if (!req.session.userEmail) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

/* ========================================
   AUTH API
======================================== */

// Register
app.post('/api/register', async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await new User({
      fullName: req.body.fullName,
      email: req.body.email,
      password: hashedPassword
    }).save();

    res.redirect('/');
  } catch (err) {
    res.status(400).send("User already exists");
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  if (user && await bcrypt.compare(req.body.password, user.password)) {
    req.session.userEmail = user.email;
    res.redirect('/dashboard');
  } else {
    res.status(401).send("Invalid login");
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ========================================
   FOLDER ROUTES
======================================== */

// Create Folder
app.post('/api/folders', requireAuth, async (req, res) => {
  const { name, parent } = req.body;

  const folder = new Folder({
    name,
    owner: req.session.userEmail,
    parent: parent || null
  });

  await folder.save();
  res.json({ success: true, folder });
});

// Delete Folder (recursive clean basic level)
app.delete('/api/folders/:id', requireAuth, async (req, res) => {
  const folderId = req.params.id;

  await FileModel.deleteMany({ folder: folderId });
  await Folder.deleteMany({ parent: folderId });
  await Folder.findByIdAndDelete(folderId);

  res.json({ success: true });
});

/* ========================================
   FILE ROUTES
======================================== */

// Upload File
app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {

  const newFile = new FileModel({
    name: req.file.originalname,
    url: req.file.path,
    owner: req.session.userEmail,
    folder: req.body.folder || null
  });

  await newFile.save();
  res.json({ success: true });
});

// Get Files + Folders
app.get('/api/files', requireAuth, async (req, res) => {
  const { folder } = req.query;

  const folders = await Folder.find({
    owner: req.session.userEmail,
    parent: folder || null
  });

  const files = await FileModel.find({
    owner: req.session.userEmail,
    folder: folder || null
  }).sort({ uploadedAt: -1 });

  res.json({ folders, files });
});

// Delete File
app.delete('/api/files/:id', requireAuth, async (req, res) => {
  await FileModel.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* ========================================
   START SERVER
======================================== */

app.listen(PORT, () => {
  console.log(`🚀 CloudConnect Server running on port ${PORT}`);
});