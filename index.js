import express from 'express';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import pino from 'pino';
import qrcode from 'qrcode';
import { 
    makeWASocket, 
    useMultiFileAuthState, 
    delay,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 10000;

// Store active sessions
const activeSessions = new Map();

// Middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// Session cleanup function
async function cleanupSession(sessionDir) {
    try {
        await fs.rm(sessionDir, { recursive: true, force: true });
        activeSessions.delete(sessionDir);
        console.log(`🧹 Cleaned up session: ${sessionDir}`);
    } catch (error) {
        console.log('Cleanup warning:', error.message);
    }
}

// QR Code pairing endpoint
app.get('/api/code/qr', async (req, res) => {
    console.log('📡 QR code endpoint hit');
    
    const sessionId = 'session_' + Date.now();
    const sessionDir = `./${sessionId}`;

    console.log('🔐 Starting QR pairing session');
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        const socketConfig = {
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: ["DTZ-NOVA-X-MD", "Chrome", "3.0.0"],
            markOnlineOnConnect: true,
        };

        const bot = makeWASocket(socketConfig);

        let qrGenerated = false;
        let isConnected = false;

        bot.ev.on('creds.update', saveCreds);

        // Handle connection events
        bot.ev.on("connection.update", async (update) => {
            const { connection, qr } = update;
            
            console.log(`🔗 Connection state: ${connection}`);

            if (qr && !qrGenerated) {
                console.log('📱 QR Code received');
                qrGenerated = true;
                
                try {
                    const qrImage = await qrcode.toDataURL(qr);
                    
                    activeSessions.set(sessionId, {
                        bot,
                        sessionDir,
                        connected: false
                    });

                    console.log('✅ QR code generated and sent to client');
                    res.json({
                        success: true,
                        qrCode: qrImage,
                        sessionId: sessionId,
                        message: 'Scan this QR code with WhatsApp'
                    });

                } catch (qrError) {
                    console.error('QR generation error:', qrError);
                    if (!res.headersSent) {
                        res.status(500).json({ 
                            success: false,
                            error: 'Failed to generate QR code'
                        });
                    }
                }
            }

            if (connection === "open") {
                console.log('✅ WhatsApp connected successfully!');
                isConnected = true;
                
                const session = activeSessions.get(sessionId);
                if (session) {
                    session.connected = true;
                    
                    // Wait a bit for connection to stabilize
                    await delay(3000);
                    
                    // Send welcome message to the connected number
                    try {
                        const botInfo = bot.user;
                        if (botInfo && botInfo.id) {
                            console.log('📨 Sending welcome message to:', botInfo.id);
                            
                            await bot.sendMessage(botInfo.id, { 
                                text: `🔥 *DTZ NOVA X MD CONNECTED!*\n\n🏆 *DARK TECH ZOON*\n\n✅ Your WhatsApp is now connected to DTZ NOVA X MD\n\n👤 Developer: Dulina Nethmira\n🤖 Bot: DTZ NOVA X MD\n\n📢 Channel: https://chat.whatsapp.com/KJnHbIYysdrJhCLH8C1HFe\n\n👤 Owner: wa.me/94752978237\n\n💬 You can now send and receive messages!\n\n⚠️ *DO NOT SHARE YOUR SESSION DATA*` 
                            });
                            console.log('✅ Welcome message sent successfully');
                        }
                    } catch (msgError) {
                        console.log('❌ Welcome message failed:', msgError.message);
                    }

                    console.log('🔄 Session active - ready to receive messages');
                }
            }

            if (connection === "close") {
                console.log('❌ Connection closed');
                isConnected = false;
                await cleanupSession(sessionDir);
            }
        });

        // Timeout if no QR code
        setTimeout(() => {
            if (!qrGenerated && !res.headersSent) {
                console.log('⏰ QR generation timeout');
                res.status(408).json({ 
                    success: false,
                    error: 'QR code timeout'
                });
                cleanupSession(sessionDir);
            }
        }, 30000);

    } catch (error) {
        console.error('💥 QR Session error:', error);
        await cleanupSession(sessionDir);
        
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false,
                error: 'Session failed'
            });
        }
    }
});

// Phone number pairing endpoint
app.get('/api/code/phone', async (req, res) => {
    console.log('📡 Phone pairing endpoint hit');
    
    const { number } = req.query;
    
    if (!number) {
        return res.status(400).json({ 
            success: false,
            error: 'Phone number required'
        });
    }

    const cleanNumber = number.replace(/\D/g, '');
    const sessionDir = `./session_${cleanNumber}_${Date.now()}`;

    console.log(`📞 Attempting phone pairing for: ${cleanNumber}`);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        const socketConfig = {
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: ["DTZ-NOVA-X-MD", "Chrome", "3.0.0"],
            markOnlineOnConnect: true,
        };

        const bot = makeWASocket(socketConfig);

        let isConnected = false;

        bot.ev.on('creds.update', saveCreds);

        bot.ev.on("connection.update", async (update) => {
            const { connection } = update;
            
            if (connection === "open") {
                console.log('✅ WhatsApp connected via phone pairing!');
                isConnected = true;
                
                // Wait for connection to stabilize
                await delay(3000);
                
                // Send welcome message to the paired number
                try {
                    const userJid = cleanNumber + '@s.whatsapp.net';
                    console.log('📨 Sending welcome message to:', userJid);
                    
                    await bot.sendMessage(userJid, { 
                        text: `🔥 *DTZ NOVA X MD - PHONE PAIRING SUCCESSFUL!*\n\n🏆 *DARK TECH ZOON*\n\n✅ Your WhatsApp is now connected via phone pairing\n\n👤 Developer: Dulina Nethmira\n🤖 Bot: DTZ NOVA X MD\n\n📢 Channel: https://chat.whatsapp.com/KJnHbIYysdrJhCLH8C1HFe\n\n👤 Owner: wa.me/94752978237\n\n💬 You can now send and receive messages!\n\n⚠️ *DO NOT SHARE YOUR SESSION DATA*` 
                    });
                    console.log('✅ Welcome message sent via phone pairing');
                } catch (msgError) {
                    console.log('❌ Welcome message failed:', msgError.message);
                }

                console.log('🔄 Phone pairing session active - ready to receive messages');
            }
        });

        if (!bot.authState.creds.registered) {
            await delay(2000);
            
            try {
                const pairingCode = await bot.requestPairingCode(cleanNumber);
                console.log(`✅ Pairing code generated: ${pairingCode}`);
                
                res.json({
                    success: true,
                    code: pairingCode,
                    message: 'Use this code in WhatsApp: Linked Devices → Link a Device',
                    number: cleanNumber
                });

                activeSessions.set(sessionDir, {
                    bot,
                    sessionDir,
                    connected: true
                });

                // Keep session alive for longer
                setTimeout(async () => {
                    if (isConnected) {
                        console.log('🔄 Phone pairing session still active');
                    } else {
                        await cleanupSession(sessionDir);
                    }
                }, 120000);

            } catch (pairError) {
                console.error('❌ Pairing error:', pairError.message);
                await cleanupSession(sessionDir);
                
                res.json({
                    success: false,
                    error: 'Phone pairing failed',
                    message: 'Please use QR code method instead'
                });
            }
        } else {
            await cleanupSession(sessionDir);
            res.json({
                success: false,
                error: 'Already registered'
            });
        }

    } catch (error) {
        console.error('💥 Phone pairing failed:', error);
        await cleanupSession(sessionDir);
        
        res.json({
            success: false,
            error: 'Phone pairing not available',
            message: 'Please use QR code method'
        });
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});

app.get('/pair', (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

// Health check endpoints
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        service: 'DTZ NOVA X MD',
        version: '3.0.0',
        developer: 'Dulina Nethmira',
        team: 'DTZ - DARK TECH ZOON',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        activeSessions: activeSessions.size
    });
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    if (req.originalUrl.startsWith('/api/')) {
        res.status(404).json({ 
            success: false,
            error: 'Endpoint not found'
        });
    } else {
        res.status(404).send(`
            <html>
                <head><title>404 - Page Not Found</title></head>
                <body style="background: #000; color: #ff0000; font-family: Arial; text-align: center; padding: 50px;">
                    <h1>🔥 DTZ NOVA X MD</h1>
                    <h2>404 - Page Not Found</h2>
                    <p>The page you're looking for doesn't exist.</p>
                    <a href="/" style="color: #ff0000;">Go to Home Page</a>
                </body>
            </html>
        `);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🔥 DTZ NOVA X MD Session Generator Started
📍 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
👤 Developer: Dulina Nethmira
🏆 Team: DTZ - DARK TECH ZOON
🤖 Bot: DTZ NOVA X MD
🕒 Started at: ${new Date().toLocaleString()}
    
📋 Available Routes:
   ✅ GET  /                 - Main Page
   ✅ GET  /pair             - Pairing Page  
   ✅ GET  /api/code/qr      - QR Code Generation
   ✅ GET  /api/code/phone   - Phone Pairing
   ✅ GET  /api/health       - Health Check
    `);
});

export default app;