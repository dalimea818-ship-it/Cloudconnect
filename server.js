const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const session = require('express-session');

const app = express();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ storage: new CloudinaryStorage({ cloudinary, params: { folder: 'CloudGlass', resource_type: 'auto' }}) });

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);
app.use(session({ secret: 'liquid', resave: false, saveUninitialized: false, cookie: { secure: process.env.NODE_ENV === "production" }}));

mongoose.connect(process.env.MONGO_URI).then(() => console.log("DB OK"));

const Item = mongoose.model('Item', new mongoose.Schema({
    name: String, url: String, type: String, owner: String, parentId: { type: mongoose.Schema.Types.ObjectId, default: null }
}));
const User = mongoose.model('User', new mongoose.Schema({ fullName: String, email: { type: String, unique: true }, password: { type: String }}));

app.post('/api/register', async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await new User({ ...req.body, password: hashedPassword }).save();
    res.redirect('/');
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        req.session.userEmail = user.email;
        res.redirect('/dashboard');
    } else res.status(401).send("Fail");
});

app.get('/api/items', async (req, res) => {
    const parentId = req.query.parentId === 'null' || !req.query.parentId ? null : req.query.parentId;
    const items = await Item.find({ owner: req.session.userEmail, parentId }).sort({ type: 1, name: 1 });
    res.json(items);
});

app.post('/api/upload', upload.array('files'), async (req, res) => {
    const parentId = req.body.parentId === 'null' ? null : req.body.parentId;
    const files = req.files.map(f => new Item({ name: f.originalname, url: f.path, type: 'file', owner: req.session.userEmail, parentId }).save());
    await Promise.all(files);
    res.json({ ok: true });
});

app.post('/api/folder', async (req, res) => {
    await new Item({ name: req.body.name, type: 'folder', owner: req.session.userEmail, parentId: req.body.parentId || null }).save();
    res.json({ ok: true });
});

app.delete('/api/items/:id', async (req, res) => {
    await Item.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
});

app.get('/api/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.get('/dashboard', (req, res) => req.session.userEmail ? res.sendFile(path.join(__dirname, 'public', 'dashboard.html')) : res.redirect('/'));

app.listen(process.env.PORT || 3000);
