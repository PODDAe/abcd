import * as mega from 'megajs';

// Mega authentication credentials
const auth = {
    email: process.env.MEGA_EMAIL || 'dnethmira9@gmail.com',
    password: process.env.MEGA_PASSWORD || 'dulina2011@##',
    userAgent: 'DTZ-NOVA-X-MD/3.0.0'
};

// Function to upload a file to Mega and return the URL
export const upload = (data, name) => {
    return new Promise((resolve, reject) => {
        try {
            // Authenticate with Mega storage
            const storage = new mega.Storage(auth, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Upload the data stream to Mega
                const uploadStream = storage.upload({
                    name: name,
                    allowUploadBuffering: true
                });

                // Handle upload errors
                uploadStream.on('error', (uploadErr) => {
                    reject(uploadErr);
                });

                // When upload completes
                uploadStream.on('complete', (file) => {
                    file.link((linkErr, url) => {
                        if (linkErr) {
                            reject(linkErr);
                        } else {
                            storage.close();
                            resolve(url);
                        }
                    });
                });

                // Pipe the data into Mega
                if (data.pipe) {
                    data.pipe(uploadStream);
                } else {
                    // If data is a buffer
                    uploadStream.end(data);
                }
            });

            // Handle storage connection errors
            storage.on("error", (error) => {
                reject(error);
            });

        } catch (err) {
            reject(err);
        }
    });
};

// Function to download a file from Mega using a URL
export const download = (url) => {
    return new Promise((resolve, reject) => {
        try {
            // Get file from Mega using the URL
            const file = mega.File.fromURL(url);

            file.loadAttributes((err) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Download the file buffer
                file.downloadBuffer((err, buffer) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(buffer);
                    }
                });
            });
        } catch (err) {
            reject(err);
        }
    });
};