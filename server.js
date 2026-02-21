const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const session = require('express-session');
const exifParser = require('exif-parser'); // The new addition

const app = express();
const PORT = process.env.PORT || 3000;

// --- CLOUDINARY CONFIG ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Using MemoryStorage for Multer so we can access the file buffer for EXIF data
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);
app.use(session({
    secret: 'liquid-pro-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" }
}));

// --- DATABASE ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Liquid DB Connected"));

const Item = mongoose.model('Item', new mongoose.Schema({
    name: String,
    url: String,
    type: { type: String, enum: ['file', 'folder'] },
    owner: String,
    customIcon: { type: String, default: null },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null }
}));

// --- API ROUTES ---

app.post('/api/upload', upload.array('files'), async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    
    const parentId = req.body.parentId === 'null' ? null : req.body.parentId;

    const uploadPromises = req.files.map(async (file, index) => {
        let finalName = file.originalname;
        const extension = file.originalname.split('.').pop();
        
        // Handle "Date Taken" for Images
        if (file.mimetype.startsWith('image/')) {
            let dateTaken = new Date(); // Fallback to now
            try {
                const parser = exifParser.create(file.buffer);
                const result = parser.parse();
                if (result.tags.DateTimeOriginal) {
                    dateTaken = new Date(result.tags.DateTimeOriginal * 1000);
                }
            } catch (e) { console.log("Metadata read failed."); }

            const day = String(dateTaken.getDate()).padStart(2, '0');
            const month = String(dateTaken.getMonth() + 1).padStart(2, '0');
            const year = dateTaken.getFullYear();
            
            // Format: DD-MM-YYYY
            finalName = index === 0 ? `${day}-${month}-${year}.${extension}` : `${day}-${month}-${year}_${index}.${extension}`;
        }

        // Upload to Cloudinary using the buffer
        return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: 'CloudGlass', resource_type: 'auto' },
                async (error, result) => {
                    if (error) reject(error);
                    const newItem = new Item({
                        name: finalName,
                        url: result.secure_url,
                        type: 'file',
                        owner: req.session.userEmail,
                        parentId: parentId
                    });
                    await newItem.save();
                    resolve(newItem);
                }
            );
            stream.end(file.buffer);
        });
    });

    await Promise.all(uploadPromises);
    res.json({ success: true });
});

// ... (Keep existing login, logout, folder creation, and patch routes) ...

app.listen(PORT, () => console.log(`🚀 Glass Server on ${PORT}`));
