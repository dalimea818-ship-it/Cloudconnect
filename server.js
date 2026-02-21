const exifParser = require('exif-parser');

app.post('/api/upload', upload.array('files'), async (req, res) => {
    if (!req.session.userEmail) return res.status(401).send();
    
    const parentId = req.body.parentId === 'null' ? null : req.body.parentId;
    
    const uploads = req.files.map(async (file, index) => {
        const isImage = file.mimetype.startsWith('image/');
        let finalName = file.originalname;

        if (isImage) {
            let dateTaken = new Date(); // Fallback
            
            try {
                // Read the first 65KB of the file to get metadata
                const parser = exifParser.create(file.buffer); 
                const result = parser.parse();
                
                if (result.tags.DateTimeOriginal) {
                    // Convert EXIF timestamp to Date object
                    dateTaken = new Date(result.tags.DateTimeOriginal * 1000);
                }
            } catch (e) {
                console.log("No EXIF data found, using upload date.");
            }

            const day = String(dateTaken.getDate()).padStart(2, '0');
            const month = String(dateTaken.getMonth() + 1).padStart(2, '0');
            const year = dateTaken.getFullYear();
            const extension = file.originalname.split('.').pop();
            
            // Format: 15-03-2025
            finalName = index === 0 ? 
                `${day}-${month}-${year}.${extension}` : 
                `${day}-${month}-${year}_${index}.${extension}`;
        }

        return new Item({
            name: finalName,
            url: file.path,
            type: 'file',
            owner: req.session.userEmail,
            parentId: parentId
        }).save();
    });

    await Promise.all(uploads);
    res.json({ success: true });
});
