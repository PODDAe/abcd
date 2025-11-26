import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, jidNormalizedUser } from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

// Ensure the session directory exists
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let dirs = './' + (num || `session`);
    
    // Remove existing session if present
    await removeFile(dirs);
    
    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            let DTZNOVAMD = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: ["DTZ-NOVA-X-MD", "Chrome", "3.0.0"],
            });

            if (!DTZNOVAMD.authState.creds.registered) {
                await delay(2000);
                num = num.replace(/[^0-9]/g, '');
                const code = await DTZNOVAMD.requestPairingCode(num);
                if (!res.headersSent) {
                    console.log({ num, code });
                    await res.send({ code });
                }
            }

            DTZNOVAMD.ev.on('creds.update', saveCreds);
            DTZNOVAMD.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(10000);
                    
                    // Helper to generate a random Mega file ID
                    function generateRandomId(length = 6, numberLength = 4) {
                        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                        let result = '';
                        for (let i = 0; i < length; i++) {
                            result += characters.charAt(Math.floor(Math.random() * characters.length));
                        }
                        const number = Math.floor(Math.random() * Math.pow(10, numberLength));
                        return `${result}${number}`;
                    }

                    // Upload session file to Mega
                    try {
                        const megaUrl = await upload(fs.createReadStream(`${dirs}/creds.json`), `${generateRandomId()}.json`);
                        let stringSession = megaUrl.replace('https://mega.nz/file/', '');
                        stringSession = 'DTZ-NOVA-X-MD=' + stringSession;

                        // Send the session ID to the target number
                        const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                        await DTZNOVAMD.sendMessage(userJid, { text: stringSession });

                        // Send confirmation message
                        await DTZNOVAMD.sendMessage(userJid, { text: "🔥 *DTZ NOVA X MD - SESSION SUCCESSFUL!* 🔥\n\n🏆 *DARK TECH ZOON*\n\n*📱 WHATSAPP CHANNEL:* https://chat.whatsapp.com/KJnHbIYysdrJhCLH8C1HFe\n\n*👤 Contact Owner:* wa.me/94752978237\n\n*👨‍💻 Developer:* Dulina Nethmira\n\n🚫 *DO NOT SHARE YOUR SESSION ID* 🚫" });
                        
                    } catch (uploadError) {
                        console.error('Mega upload failed:', uploadError);
                        // Send message without session ID if upload fails
                        const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                        await DTZNOVAMD.sendMessage(userJid, { text: "🔥 *DTZ NOVA X MD - SESSION SUCCESSFUL!* 🔥\n\n🏆 *DARK TECH ZOON*\n\n✅ Your WhatsApp is now connected!\n\n*📱 WHATSAPP CHANNEL:* https://chat.whatsapp.com/KJnHbIYysdrJhCLH8C1HFe\n\n*👤 Contact Owner:* wa.me/94752978237\n\n*👨‍💻 Developer:* Dulina Nethmira\n\n⚠️ Session storage temporarily unavailable" });
                    }
                    
                    // Clean up session after use
                    await delay(100);
                    removeFile(dirs);
                    process.exit(0);
                } else if (connection === 'close' && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    console.log('Connection closed unexpectedly:', lastDisconnect.error);
                    await delay(10000);
                    initiateSession();
                }
            });
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    console.log('Caught exception: ' + err);
});

export default router;